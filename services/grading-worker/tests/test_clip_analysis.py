"""Hàm thuần của `grading/clip_analysis.py` — căn mốc từ Gemini đề xuất, cắt biên, ghép kết quả."""

from __future__ import annotations

from grading_worker.grading import clip_analysis as ca

FACTS = {
    "errors": [
        {"word": "musicians", "accuracy": 44.0, "start_sec": 6.85, "end_sec": 8.03,
         "weak_phonemes": [{"phoneme": "ʃ", "position": "medial", "accuracy": 23.0}]},
        {"word": "work", "accuracy": 48.0, "start_sec": 27.1, "end_sec": 27.61, "weak_phonemes": []},
    ],
    "words": [
        {"word": "i'm", "start_sec": 5.0, "end_sec": 5.3, "accuracy": 95.0, "error_type": "None"},
        {"word": "musicians", "start_sec": 6.85, "end_sec": 8.03, "accuracy": 44.0, "error_type": "Mispronunciation"},
        {"word": "genres", "start_sec": 40.0, "end_sec": 40.6, "accuracy": 88.0, "error_type": "None"},
        {"word": "work", "start_sec": 27.1, "end_sec": 27.61, "accuracy": 48.0, "error_type": "Mispronunciation"},
        {"word": "genres", "start_sec": 120.0, "end_sec": 120.5, "accuracy": 91.0, "error_type": "None"},
        {"word": "the", "start_sec": 130.0, "end_sec": None, "accuracy": 0.0, "error_type": "Omission"},
    ],
}


def test_candidates_keep_every_azure_word_and_add_gemini_words_aligned_to_the_azure_timeline():
    llm_words = [
        {"word": "Musicians", "heard_as": "x", "suggestion": "s"},  # đã là từ Azure ⇒ không thêm
        {"word": "genres.", "heard_as": "/ʒɑːnz/", "suggestion": "đọc /ʒ/", "approx_position_sec": 118},
        {"word": "banana", "heard_as": "", "suggestion": ""},  # không có trong dòng thời gian ⇒ bỏ
        {"word": "the", "heard_as": "", "suggestion": ""},  # chỉ có Omission ⇒ không có tiếng để cắt
    ]
    cands = ca.build_candidates(FACTS, llm_words)
    assert [(c["word"], c["source"]) for c in cands] == [("musicians", "azure"), ("work", "azure"), ("genres", "gemini")]
    # gần mốc ước lượng 118 s nhất ⇒ lần xuất hiện ở 120 s, không phải 40 s
    assert (cands[2]["start_sec"], cands[2]["end_sec"], cands[2]["llm_suggestion"]) == (120.0, 120.5, "đọc /ʒ/")


def test_one_timeline_slot_is_never_used_twice():
    llm_words = [{"word": "genres"}, {"word": "genres"}, {"word": "genres"}]
    cands = ca.build_candidates(FACTS, llm_words)
    assert sorted(c["start_sec"] for c in cands if c["source"] == "gemini") == [40.0, 120.0]


def test_clip_bounds_pad_the_word_and_never_go_negative_or_zero_length():
    assert ca.clip_bounds({"start_sec": 6.85, "end_sec": 8.03}) == (6.5, 8.38)
    assert ca.clip_bounds({"start_sec": 0.1, "end_sec": None}) == (0.0, 1.05)  # 0.1 + 0.6 tối thiểu + 0.35 đệm


def test_clip_label_carries_the_target_word_and_azure_weak_phonemes():
    assert ca.clip_label(0, {**FACTS["errors"][0], "source": "azure"}) == (
        '[0] Từ mục tiêu: "musicians" — Azure đo độ chính xác 44.0; âm vị yếu: /ʃ/ (medial, 23.0)'
    )
    assert "Azure không đánh dấu" in ca.clip_label(5, {"word": "genres", "source": "gemini"})


def test_a_gemini_word_missing_from_the_azure_timeline_is_clipped_around_its_estimate_not_dropped():
    # Học thuật 2026-09-29: từ đọc sai/không rõ đến mức Azure nghe thành từ khác ⇒ trước đây bị bỏ.
    cands = ca.build_candidates(FACTS, [{"word": "moving", "approx_position_sec": 44.85, "suggestion": "đọc /uː/"}])
    assert len(cands) == 3
    c = cands[2]
    assert (c["word"], c["source"], c["anchored"], c["approx_sec"]) == ("moving", "gemini", False, 44.85)
    assert (c["start_sec"], c["end_sec"]) == (44.05, 46.45)
    assert "ƯỚC LƯỢNG" in ca.clip_label(2, c)


def test_merge_keeps_an_unconfirmed_unanchored_word_at_its_estimated_time_for_the_teacher():
    cands = ca.build_candidates({"errors": [], "words": []}, [{"word": "moving", "approx_position_sec": 44.85}])
    merged = ca.merge_clip_results([], cands, [{"index": 0, "said": "", "is_error": False, "issue": "", "suggestion": ""}])
    assert merged == [
        {
            "word": "moving", "heard_as": "", "suggestion": ca.UNCLEAR_SUGGESTION, "issue": "",
            "approx_position_sec": 44.85, "start_sec": 44.85, "source": "gemini",
            "gemini_confirmed": False, "needs_review": True,
        }
    ]


def test_clip_instruction_treats_unclear_speech_as_an_error():
    text = ca.build_clip_instruction()
    assert "KHÔNG NGHE RÕ" in text and "is_error = true" in text


def test_merge_enriches_azure_words_flags_disagreement_and_keeps_unconfirmed_gemini_words_for_review():
    mispronounced = [
        {"word": "musicians", "heard_as": "", "suggestion": "Chú ý âm /ʃ/", "approx_position_sec": 6.85, "start_sec": 6.85, "end_sec": 8.03},
        {"word": "work", "heard_as": "", "suggestion": "Chú ý âm /k/", "approx_position_sec": 27.1, "start_sec": 27.1, "end_sec": 27.61},
    ]
    cands = ca.build_candidates(FACTS, [{"word": "genres", "approx_position_sec": 40}, {"word": "genres", "approx_position_sec": 120}])
    results = [
        {"index": 0, "said": "/ˈmjuːzɪsən/", "is_error": True, "issue": "/ʃ/ đọc thành /s/", "suggestion": "Tròn môi khi đọc /ʃ/"},
        {"index": 1, "said": "/wɜːk/", "is_error": False, "issue": "", "suggestion": ""},
        {"index": 2, "said": "/ˈdʒenrəz/", "is_error": True, "issue": "/ʒ/ thành /dʒ/", "suggestion": "Đọc /ʒ/ nhẹ, không bật"},
        {"index": 3, "said": "/ˈʒɑːnrəz/", "is_error": False, "issue": "", "suggestion": ""},
    ]
    merged = ca.merge_clip_results(mispronounced, cands, results)

    assert [(w["word"], w["source"]) for w in merged] == [
        ("musicians", "azure"), ("work", "azure"), ("genres", "gemini"), ("genres", "gemini"),
    ]
    # Lượt nghe lại không xác nhận ⇒ GIỮ (không bỏ như trước 09-29), gắn cờ để giáo viên nghe lại.
    assert merged[3]["gemini_confirmed"] is False and merged[3]["needs_review"] is True and merged[3]["start_sec"] == 120.0
    assert merged[0]["heard_as"] == "/ˈmjuːzɪsən/" and merged[0]["gemini_confirmed"] is True and "needs_review" not in merged[0]
    assert merged[1]["needs_review"] is True and merged[1]["suggestion"] == "Chú ý âm /k/"  # giữ, không bịa gợi ý
    assert merged[2] == {
        "word": "genres", "heard_as": "/ˈdʒenrəz/", "suggestion": "Đọc /ʒ/ nhẹ, không bật", "issue": "/ʒ/ thành /dʒ/",
        "approx_position_sec": 40.0, "start_sec": 40.0, "end_sec": 40.6, "source": "gemini", "gemini_confirmed": True,
    }


def test_merge_without_results_keeps_the_azure_list_unchanged_apart_from_source():
    mispronounced = [{"word": "musicians", "heard_as": "", "suggestion": "s", "start_sec": 6.85}]
    cands = ca.build_candidates({"errors": [FACTS["errors"][0]], "words": FACTS["words"]}, [])
    assert ca.merge_clip_results(mispronounced, cands, []) == [
        {"word": "musicians", "heard_as": "", "suggestion": "s", "start_sec": 6.85, "source": "azure"}
    ]


def test_clip_instruction_uses_the_rubric_form_of_address():
    # Giáo viên thiếu nhi viết "con" 131/131 lần khi sửa nhận xét (2026-10-03).
    kids = ca.address_for({"tone": "thẳng thắn; xưng 'cô', gọi học viên là 'con'"})
    assert kids == "con" and ca.address_for({"tone": "thẳng thắn"}) == "em" and ca.address_for(None) == "em"
    text = ca.build_clip_instruction("con")
    assert "gọi học viên là 'con'" in text and "'Con đặt nhẹ" in text and "nhắc con đọc lại" in text
    assert "{address" not in text and "gọi học viên là 'em'" not in text
