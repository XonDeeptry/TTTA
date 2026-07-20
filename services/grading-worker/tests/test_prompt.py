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
