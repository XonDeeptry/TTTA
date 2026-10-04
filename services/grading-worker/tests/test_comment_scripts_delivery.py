"""Kịch bản nhận xét theo band + phân loại cách nói IELTS (học thuật ILM 2026-10-03)."""

from __future__ import annotations

from grading_worker.grading import delivery
from grading_worker.grading.comment_scripts import pick_band_scripts


def _bank():
    return [
        {"dimension": "fc", "band": "6", "intent": None, "text": "A6"},
        {"dimension": "fc", "band": "6", "intent": None, "text": "B6"},
        {"dimension": "fc", "band": "6", "intent": None, "text": "C6"},
        {"dimension": "fc", "band": "7", "intent": None, "text": "A7"},
        {"dimension": "fc", "band": "7", "intent": None, "text": "B7"},
        {"dimension": "lr", "band": "6", "intent": None, "text": "L6"},
        {"dimension": "fc", "band": None, "intent": "khen", "text": "không band"},
    ]


def test_keeps_exactly_one_script_per_dimension_and_band_and_every_unbanded_sample():
    out = pick_band_scripts({"comment_bank": _bank()}, seed=237)
    texts = [e["text"] for e in out["comment_bank"]]
    assert sum(t in ("A6", "B6", "C6") for t in texts) == 1
    assert sum(t in ("A7", "B7") for t in texts) == 1
    assert "L6" in texts and "không band" in texts and len(texts) == 4


def test_same_submission_picks_the_same_script_and_different_submissions_vary():
    picks = {tuple(e["text"] for e in pick_band_scripts({"comment_bank": _bank()}, seed=s)["comment_bank"]) for s in range(40)}
    assert pick_band_scripts({"comment_bank": _bank()}, 5) == pick_band_scripts({"comment_bank": _bank()}, 5)
    assert len(picks) > 1  # ≥3 kịch bản thật sự được xoay vòng giữa các bài


def test_a_bank_without_bands_is_returned_untouched():
    rubric = {"comment_bank": [{"dimension": None, "band": None, "intent": None, "text": "x"}]}
    assert pick_band_scripts(rubric, 1) is rubric


def test_delivery_schema_is_required_and_flag_only_for_rehearsed_or_read():
    schema = delivery.with_delivery({"type": "object", "properties": {"scores": {}}, "required": ["scores"]})
    assert schema["required"] == ["scores", "delivery"]
    assert schema["properties"]["delivery"]["properties"]["style"]["enum"] == ["spontaneous", "rehearsed", "read"]
    assert delivery.flag_reason({"delivery": {"style": "spontaneous", "evidence": "x"}}) is None
    assert delivery.flag_reason({}) is None
    reason = delivery.flag_reason({"delivery": {"style": "rehearsed", "evidence": "Nhịp đều, câu như văn viết."}})
    assert "học thuộc" in reason and "Nhịp đều" in reason
    assert "Gemini" not in reason and "Azure" not in reason


def test_template_scripts_fill_cells_the_course_did_not_write_and_course_scripts_win():
    from grading_worker.grading.comment_scripts import merge_template_scripts

    rubric = {"comment_bank": [{"dimension": "fc", "band": "6", "intent": None, "text": "của khóa"}]}
    template = [
        {"dimension": "fc", "band": "6", "intent": None, "text": "cấu trúc fc6"},  # khóa đã có ô này ⇒ bỏ
        {"dimension": "fc", "band": "7", "intent": None, "text": "cấu trúc fc7"},
        {"dimension": "lr", "band": 5, "intent": None, "text": "  cấu trúc lr5  "},  # band số ⇒ chuỗi
        {"dimension": "lr", "band": "5", "intent": None, "text": "   "},  # rỗng ⇒ bỏ
        {"dimension": None, "band": "5", "text": "thiếu tiêu chí"},  # không tiêu chí ⇒ bỏ
    ]
    out = merge_template_scripts(rubric, template)
    assert [(e["dimension"], e["band"], e["text"]) for e in out["comment_bank"]] == [
        ("fc", "6", "của khóa"), ("fc", "7", "cấu trúc fc7"), ("lr", "5", "cấu trúc lr5"),
    ]
    assert merge_template_scripts(rubric, []) is rubric


def test_never_repeats_the_students_previous_script_when_alternatives_exist():
    import random as _random

    from grading_worker.grading.comment_scripts import cell_key, choose_band_scripts, fingerprint

    bank = [{"dimension": "fc", "band": "6", "intent": None, "text": t} for t in ("A", "B", "C")]
    previous = fingerprint("A")
    for seed in range(200):
        out, picks = choose_band_scripts({"comment_bank": bank}, _random.Random(seed), {cell_key("fc", "6"): previous})
        assert out["comment_bank"][0]["text"] != "A"
        assert picks[cell_key("fc", "6")] == fingerprint(out["comment_bank"][0]["text"])


def test_simulated_daily_submissions_never_get_the_same_script_twice_in_a_row():
    import random as _random

    from grading_worker.grading.comment_scripts import choose_band_scripts

    bank = [{"dimension": "fc", "band": "6", "intent": None, "text": t} for t in ("A", "B", "C")]
    rng, memory, seen = _random.Random(1), {}, []
    for _ in range(300):
        out, picks = choose_band_scripts({"comment_bank": bank}, rng, memory)
        seen.append(out["comment_bank"][0]["text"])
        memory = picks
    assert all(seen[i] != seen[i - 1] for i in range(1, len(seen)))
    assert {s: seen.count(s) for s in "ABC"}["A"] > 60  # vẫn trải đều cả ba


def test_a_single_script_cell_is_still_used_even_if_it_repeats():
    import random as _random

    from grading_worker.grading.comment_scripts import cell_key, choose_band_scripts, fingerprint

    bank = [{"dimension": "fc", "band": "6", "intent": None, "text": "duy nhất"}]
    out, _ = choose_band_scripts({"comment_bank": bank}, _random.Random(0), {cell_key("fc", "6"): fingerprint("duy nhất")})
    assert out["comment_bank"][0]["text"] == "duy nhất"


def test_band_key_matches_the_dashboard_band_values():
    from grading_worker.grading.comment_scripts import band_key

    assert (band_key(6), band_key(6.0), band_key(6.5), band_key(True), band_key("6")) == ("6", "6", "6.5", None, None)


def test_rehearsed_guidance_follows_official_ielts_advice_on_memorised_language():
    text = delivery.INSTRUCTION
    assert "KHÔNG lấy từ vựng" in text and "Lexical resource" in text and "Grammatical range" in text
    assert "TỰ tạo ra" in text
