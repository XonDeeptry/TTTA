"""Số đo + band ngầm — "Đo → Đếm → Viết" giai đoạn 1 (Idea/20261003-DoDemViet.md)."""

from __future__ import annotations

from grading_worker.grading import evidence, measures


def _timeline(n=60, word_sec=0.3, gap=0.1, long_every=0):
    out, t = [], 0.0
    for i in range(n):
        out.append({"word": f"w{i}", "start_sec": round(t, 2), "end_sec": round(t + word_sec, 2), "error_type": "None"})
        t += word_sec + (1.2 if long_every and i % long_every == long_every - 1 else gap)
    return out


def test_fluency_measures_are_deterministic_and_skip_omissions():
    words = _timeline() + [{"word": "the", "start_sec": None, "end_sec": None, "error_type": "Omission"}]
    a, b = measures.fluency_measures(words), measures.fluency_measures(list(reversed(words)))
    assert a == b and a["words"] == 60
    assert a["speech_rate_wpm"] > 140 and a["long_pauses_per_min"] == 0 and a["mean_length_of_run"] == 60


def test_long_pauses_shorten_runs_and_are_counted():
    m = measures.fluency_measures(_timeline(long_every=5))
    assert m["mean_length_of_run"] == 5 and m["long_pauses_per_min"] > 3


def test_too_little_speech_is_not_measured():
    assert measures.fluency_measures(_timeline(n=5)) is None


def test_mtld_rewards_variety_and_needs_enough_words():
    varied = " ".join(f"w{chr(97 + i // 26)}{chr(97 + i % 26)}" for i in range(80))  # 80 từ khác nhau, chỉ chữ cái
    repetitive = " ".join(["the cat sat on the mat"] * 15)
    assert measures.mtld(measures.tokens(varied)) > measures.mtld(measures.tokens(repetitive))
    assert measures.mtld(measures.tokens("too short")) is None


def test_language_measures_count_evidence_per_sentence_and_per_100_words():
    text = "I go to school yesterday. It was fun. " * 10  # 20 câu, 80 từ
    ev = {"grammar_errors": [{"quote": "I go", "correction": "I went"}] * 5, "lexical_errors": [], "complex_structures": [], "advanced_vocabulary": []}
    m = measures.language_measures(text, ev)
    assert (m["sentences"], m["grammar_errors"], m["error_free_ratio"]) == (20, 5, 0.75)
    assert measures.language_measures(text, None)["grammar_errors"] == 0  # thiếu bằng chứng ⇒ 0, không vỡ


def test_shadow_bands_follow_the_tables_and_only_cover_measured_criteria():
    fluency = {"speech_rate_wpm": 135, "mean_length_of_run": 9.5, "long_pauses_per_min": 1}
    language = {"tokens": 150, "mtld": 62, "lexical_errors_per_100w": 3, "advanced_vocab_per_100w": 0,
                "error_free_ratio": 0.8, "complex_per_100w": 1.0}
    assert measures.shadow_bands(fluency, language) == {"fluency_coherence": 7, "lexical_resource": 5, "grammatical_range": 6}
    assert measures.shadow_bands(None, {"tokens": 10, "mtld": None}) == {}


def test_evidence_is_an_optional_field_so_shadow_data_can_never_fail_a_grading():
    schema = evidence.with_evidence({"type": "object", "properties": {"scores": {}}, "required": ["scores"]})
    assert "evidence" in schema["properties"] and schema["required"] == ["scores"]
