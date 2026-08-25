from grading_worker.grading.prompt import build_system_instruction, build_user_instruction

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


# Rubric v2 dùng cho nhóm test bên dưới. Dựng lại từ chính các assertion (nhãn/trọng số/band/
# yếu tố con/kho nhận xét) sau khi gỡ nhánh chấm-từ-transcript ngày 2026-08-25.
RUBRIC_V2 = {
    "schema_version": 2,
    "course_key": "kid_a1",
    "task_type": "speaking_clip",
    "tone": "khích lệ",
    "feedback_language": "vi",
    "scale": {"min": 0, "max": 5, "step": 1},
    "aggregation": {"method": "average", "round": "none"},
    "levels": [],
    "output_fields": ["comment", "fix"],
    "dimensions": [
        {
            "key": "pronunciation",
            "label": "Pronunciation (Âm chính)",
            "weight": 1,
            "bands": {
                "0": ["Chưa bật thành tiếng."],
                "5": ["Phát âm rõ ràng.", "Gần chuẩn người bản ngữ."],
            },
            "sub_factors": [
                {"label": "Phạm vi", "by_band": {"4": "Limited range", "9": "A full range"}}
            ],
        },
        {
            "key": "fluency",
            "label": "Fluency",
            "weight": 1,
            "bands": {"0": ["Ngập ngừng nhiều."]},
            "sub_factors": [],
        },
    ],
    "comment_bank": [
        {"dimension": "pronunciation", "intent": "khen", "text": "Con phát âm rõ lắm!"},
        {"dimension": "unknown_dim", "intent": None, "text": "Tiêu chí lạ vẫn phải hiện."},
        {"dimension": None, "intent": None, "text": "Nhận xét dùng chung."},
    ],
    "student_reply": None,
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


def test_pronunciation_and_closing_lines_stay_last_in_the_audio_prompt():
    lines = build_system_instruction(RUBRIC_V2).split("\n")
    assert lines[-1] == "Trả về đúng theo schema JSON đã cung cấp — không thêm chữ nào ngoài JSON."
    assert "phát âm sai" in lines[-2]


