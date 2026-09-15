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


def test_merge_enriches_azure_words_flags_disagreement_and_admits_only_confirmed_gemini_words():
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

    assert [(w["word"], w["source"]) for w in merged] == [("musicians", "azure"), ("work", "azure"), ("genres", "gemini")]
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
