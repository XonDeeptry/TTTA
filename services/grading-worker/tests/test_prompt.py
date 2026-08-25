from grading_worker.grading.prompt import (
    build_system_instruction,
    build_system_instruction_text,
    build_user_instruction,
    build_user_instruction_text,
)

RUBRIC = {
    "course_key": "basic",
    "tone": "khích lệ",
    "feedback_language": "vi",
    "dimensions": [
        {"name": "fluency", "weight": 0.5, "bands": {"0": "kém", "3": "tốt"}},
        {"name": "pronunciation", "weight": 0.5, "bands": {"0": "kém", "3": "tốt"}},
    ],
    "few_shot_examples": ["Em nói khá trôi chảy, cần chú ý phát âm âm cuối."],
}


def test_system_instruction_includes_tone_and_language():
    text = build_system_instruction(RUBRIC)
    assert "khích lệ" in text
    assert "vi" in text


def test_system_instruction_lists_every_dimension():
    text = build_system_instruction(RUBRIC)
    assert "fluency" in text
    assert "pronunciation" in text


def test_system_instruction_includes_few_shot_examples():
    text = build_system_instruction(RUBRIC)
    assert "Em nói khá trôi chảy" in text


def test_system_instruction_asks_for_mispronounced_word_detail():
    text = build_system_instruction(RUBRIC)
    assert "phát âm sai" in text


def test_user_instruction_is_nonempty():
    assert len(build_user_instruction()) > 0


# ---- Pilot A/B nhánh text (AC-05.x) ----


def test_text_system_instruction_states_it_is_a_transcript_not_audio():
    text = build_system_instruction_text(RUBRIC)
    assert "transcript" in text.lower() or "chép lời" in text.lower()
    assert "KHÔNG nghe được audio" in text


def test_text_system_instruction_lists_every_dimension_including_pronunciation():
    text = build_system_instruction_text(RUBRIC)
    assert "fluency" in text
    assert "pronunciation" in text


def test_text_system_instruction_keeps_tone_and_language():
    text = build_system_instruction_text(RUBRIC)
    assert "khích lệ" in text
    assert "vi" in text


def test_text_system_instruction_is_distinct_from_audio_prompt():
    assert build_system_instruction_text(RUBRIC) != build_system_instruction(RUBRIC)


def test_text_system_instruction_flags_low_confidence_pronunciation():
    text = build_system_instruction_text(RUBRIC).lower()
    assert "độ tin cậy thấp" in text or "tham khảo" in text


def test_text_user_instruction_is_nonempty():
    assert len(build_user_instruction_text()) > 0


# ---- F8: render rubric v2 ----
# RUBRIC ở trên vẫn là v1 và mọi test trên nó phải xanh KHÔNG SỬA MỘT DÒNG NÀO (NFR-02).

RUBRIC_V2 = {
    "schema_version": 2,
    "course_key": "KID-A0A2",
    "tone": "khích lệ",
    "feedback_language": "vi",
    "scale": {"min": 0, "max": 5, "step": 1},
    "aggregation": {"method": "sum", "round": "none"},
    "levels": [
        {"min": 0, "max": 10, "code": "A0", "label": "Pre-starter (A0) ~ Tiny Rabbit"},
        {"min": 21, "max": 25, "code": "A2", "label": "Flyer (A2) ~ Great Big Dino"},
    ],
    "output_fields": ["comment", "fix"],
    "dimensions": [
        {
            "key": "pronunciation",
            "label": "Pronunciation (Âm chính)",
            "weight": 1,
            "bands": {"5": ["Phát âm rõ ràng.", "Gần chuẩn người bản ngữ."], "0": ["Khó hiểu."]},
            "sub_factors": [{"label": "Phạm vi", "by_band": {"9": "A full range", "4": "Limited range"}}],
        },
        {"key": "fluency", "label": "Fluency", "weight": 1, "bands": {"0": ["Ngắt quãng."]}, "sub_factors": []},
    ],
    "comment_bank": [
        {"dimension": None, "intent": None, "text": "Cô nhận bài của em rồi nhé."},
        {"dimension": "pronunciation", "intent": "khen", "text": "Con phát âm rõ lắm!"},
        {"dimension": "unknown_dim", "intent": None, "text": "Ghi chú mồ côi."},
    ],
}


def test_v2_band_descriptions_render_as_one_bullet_per_line_not_semicolon_joined():
    text = build_system_instruction(RUBRIC_V2)
    assert "    • Phát âm rõ ràng." in text
    assert "    • Gần chuẩn người bản ngữ." in text
    assert "Phát âm rõ ràng.; Gần chuẩn" not in text


def test_v2_dimension_header_carries_label_key_and_weight():
    text = build_system_instruction(RUBRIC_V2)
    assert "- Tiêu chí: Pronunciation (Âm chính) [key=pronunciation] (trọng số 1):" in text


def test_v2_bands_render_in_ascending_numeric_order():
    text = build_system_instruction(RUBRIC_V2)
    assert text.index("Band 0:") < text.index("Band 5:")


def test_v2_sub_factor_grid_renders_only_for_dimensions_that_have_one():
    text = build_system_instruction(RUBRIC_V2)
    assert "    - Phạm vi: 4 = Limited range | 9 = A full range" in text
    # `fluency` không có yếu tố con ⇒ chỉ đúng MỘT tiêu đề lưới trong cả prompt.
    assert text.count("Yếu tố con") == 1


def test_v2_comment_bank_groups_by_dimension_then_intent_with_shared_group_last():
    text = build_system_instruction(RUBRIC_V2)
    assert "  Tiêu chí Pronunciation (Âm chính):" in text
    assert "    - [khen] Con phát âm rõ lắm!" in text
    assert "  Tiêu chí unknown_dim:" in text  # tiêu chí lạ vẫn hiện dưới tên thô, không bị bỏ
    assert "  Dùng chung:" in text
    assert text.index("Tiêu chí Pronunciation (Âm chính):") < text.index("Dùng chung:")


def test_v1_few_shot_examples_still_reach_the_prompt_as_the_shared_group():
    text = build_system_instruction(RUBRIC)
    assert "  Dùng chung:" in text
    assert "    - Em nói khá trôi chảy, cần chú ý phát âm âm cuối." in text


def test_output_fields_with_fix_asks_for_both_comment_and_fix():
    text = build_system_instruction(RUBRIC_V2)
    assert "'comment'" in text and "'fix'" in text
    assert "hướng sửa bài" in text


def test_output_fields_without_fix_asks_for_comment_only():
    text = build_system_instruction(RUBRIC)  # v1 ⇒ output_fields = ["comment"]
    assert "'comment'" in text
    assert "'fix'" not in text


def test_prompt_never_mentions_totals_averages_or_level_names():
    """Ranh giới cứng Phần 5 / BR-09: LLM chỉ chấm từng tiêu chí, KHÔNG cộng điểm."""
    for text in (build_system_instruction(RUBRIC_V2), build_system_instruction_text(RUBRIC_V2)):
        assert "Tiny Rabbit" not in text
        assert "Great Big Dino" not in text
        assert "tổng điểm" not in text.lower()
        assert "điểm trung bình" not in text.lower()


def test_pronunciation_and_closing_lines_stay_last_in_the_audio_prompt():
    lines = build_system_instruction(RUBRIC_V2).split("\n")
    assert lines[-1] == "Trả về đúng theo schema JSON đã cung cấp — không thêm chữ nào ngoài JSON."
    assert "phát âm sai" in lines[-2]


def test_both_builders_share_the_same_dimension_and_comment_bank_rendering():
    audio = build_system_instruction(RUBRIC_V2)
    pilot = build_system_instruction_text(RUBRIC_V2)
    shared_start = audio.index("- Tiêu chí: Pronunciation")
    shared_end = audio.index("Với tiêu chí 'pronunciation', liệt kê")
    assert audio[shared_start:shared_end] in pilot


def test_v2_pilot_builder_keeps_its_transcript_only_warnings():
    text = build_system_instruction_text(RUBRIC_V2)
    assert "KHÔNG nghe được audio" in text
    assert "ĐỘ TIN CẬY THẤP" in text
    assert text.index("KHÔNG nghe được audio") < text.index("- Tiêu chí: Pronunciation")
