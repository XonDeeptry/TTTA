"""Hàm thuần của `grading/azure_pa.py`. JSON mẫu dựng theo cấu trúc Azure công bố
(NBest[0].PronunciationAssessment, Words[].Syllables/Phonemes, Offset theo 100 ns) — CHƯA đối
chiếu với phản hồi thật trên khóa pilot; phải chạy lại với một clip thật khi có khóa."""

from __future__ import annotations

import asyncio

import pytest

from grading_worker.grading import azure_pa
from grading_worker.grading.rubric_schema import normalize_rubric


def _phoneme(p: str, acc: float, heard: str | None = None) -> dict:
    nbest = [{"Phoneme": heard or p, "Score": 90.0}]
    return {"Phoneme": p, "PronunciationAssessment": {"AccuracyScore": acc, "NBestPhonemes": nbest}}


def _word(w: str, acc: float, phonemes: list, syllables: list | None = None, err: str = "None", offset_sec: float = 0) -> dict:
    return {
        "Word": w,
        "Offset": int(offset_sec * 10_000_000),
        "PronunciationAssessment": {"AccuracyScore": acc, "ErrorType": err},
        "Phonemes": phonemes,
        "Syllables": [{"Syllable": s, "PronunciationAssessment": {"AccuracyScore": a}} for s, a in (syllables or [])],
    }


SEGMENTS = [
    {
        "NBest": [
            {
                "Display": "I think music is my passion.",
                "PronunciationAssessment": {"AccuracyScore": 80, "FluencyScore": 90, "ProsodyScore": 70, "CompletenessScore": 100, "PronScore": 80},
                "Words": [
                    _word("think", 42, [_phoneme("θ", 30, heard="t"), _phoneme("ɪ", 90), _phoneme("k", 60)], offset_sec=43.2),
                    _word("music", 88, [_phoneme("m", 95), _phoneme("k", 80)], syllables=[("mju", 90), ("zɪk", 70)]),
                    _word("passion", 95, [_phoneme("p", 95), _phoneme("n", 100)], syllables=[("pæ", 100), ("ʃən", 90)]),
                ],
            }
        ]
    },
    {
        "NBest": [
            {
                "Display": "Genres.",
                "PronunciationAssessment": {"AccuracyScore": 50, "FluencyScore": 60, "ProsodyScore": 40, "CompletenessScore": 100, "PronScore": 50},
                "Words": [_word("genres", 50, [_phoneme("ʒ", 45, heard="dʒ"), _phoneme("z", 55)], err="Mispronunciation", offset_sec=90)],
            }
        ]
    },
]

KID = normalize_rubric(
    {
        "schema_version": 2,
        "scale": {"min": 0, "max": 5, "step": 1},
        "aggregation": {"method": "sum", "round": "none"},
        "output_fields": ["comment"],
        "dimensions": [
            {"key": k, "label": k}
            for k in ("pronunciation", "intonation", "ending_sounds", "word_stress", "fluency")
        ],
    }
)
IELTS = normalize_rubric(
    {
        "schema_version": 2,
        "scale": {"min": 0, "max": 9, "step": 1},
        "aggregation": {"method": "average", "round": "nearest_int"},
        "output_fields": ["comment", "fix"],
        "dimensions": [
            {"key": k, "label": k}
            for k in ("fluency_coherence", "lexical_resource", "grammatical_range", "pronunciation")
        ],
    }
)


def test_summarize_weights_segments_by_word_count_and_derives_ending_sounds_and_stress():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    # 3 từ ở đoạn 1, 1 từ ở đoạn 2
    assert facts["scores"]["accuracy"] == pytest.approx((80 * 3 + 50) / 4, abs=0.01)
    assert facts["scores"]["fluency"] == pytest.approx((90 * 3 + 60) / 4, abs=0.01)
    # âm cuối: k=60, k=80, n=100, z=55
    assert facts["ending_sounds"] == pytest.approx((60 + 80 + 100 + 55) / 4, abs=0.01)
    # trọng âm: trung bình (âm tiết music 80, passion 95) = 87.5, kết hợp prosody 62.5
    assert facts["word_stress"] == pytest.approx((87.5 + 62.5) / 2, abs=0.01)
    assert facts["mode"] == "unscripted"
    assert facts["transcript"] == "I think music is my passion. Genres."


def test_errors_are_the_weakest_words_with_the_worst_phoneme_and_what_was_heard():
    errors = azure_pa.summarize(SEGMENTS, scripted=True)["errors"]
    assert [e["word"] for e in errors] == ["think", "genres"]  # tăng dần độ chính xác; music/passion không lọt
    assert errors[0] == {
        "word": "think", "accuracy": 42.0, "error_type": "None",
        "phoneme": "θ", "heard_phoneme": "t", "offset_sec": 43.2,
    }


def test_omissions_and_insertions_do_not_count_as_spoken_words():
    seg = {"NBest": [{"PronunciationAssessment": {}, "Words": [
        _word("the", 0, [], err="Omission"), _word("gate", 90, [_phoneme("t", 90)]), _word("uh", 0, [], err="Insertion"),
    ]}]}
    facts = azure_pa.summarize([seg], scripted=True)
    assert (facts["word_count"], facts["omissions"], facts["insertions"]) == (1, 1, 1)
    assert facts["errors"] == []


@pytest.mark.parametrize(
    "value,expected",
    [(95, 5), (90, 5), (89.9, 4), (75, 4), (60, 3), (45, 2), (30, 1), (29.9, 0), (None, None)],
)
def test_default_kid_thresholds(value, expected):
    assert azure_pa.to_band(value, {"min": 0, "max": 5, "step": 1}, {}) == expected


def test_threshold_override_from_setting_and_bad_json_falls_back():
    overrides = azure_pa.parse_thresholds('{"5": [[50, 5], [10, 1]]}')
    assert azure_pa.to_band(55, {"min": 0, "max": 5, "step": 1}, overrides) == 5
    assert azure_pa.parse_thresholds("not json") == {}
    assert azure_pa.to_band(55, {"min": 0, "max": 5, "step": 1}, azure_pa.parse_thresholds("not json")) == 2


def test_scale_without_a_table_maps_linearly():
    assert azure_pa.to_band(50, {"min": 0, "max": 3, "step": 1}, {}) == 2  # 1.5 làm tròn lên


def test_kid_maps_all_five_dimensions_to_azure():
    facts = azure_pa.summarize(SEGMENTS, scripted=True)
    measured = azure_pa.measure_bands(KID, facts, {})
    assert set(measured) == {"pronunciation", "intonation", "ending_sounds", "word_stress", "fluency"}
    assert measured["pronunciation"]["metric"] == pytest.approx(72.5, abs=0.05)
    assert measured["pronunciation"]["band"] == 3


def test_ielts_leaves_lexical_and_grammar_to_gemini_and_uses_accuracy_plus_prosody_for_pronunciation():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    measured = azure_pa.measure_bands(IELTS, facts, {})
    assert set(measured) == {"fluency_coherence", "pronunciation"}
    assert measured["pronunciation"]["metric"] == pytest.approx((72.5 + 62.5) / 2, abs=0.05)


def test_apply_overrides_gemini_scores_averages_fluency_coherence_and_rebuilds_mispronounced_words():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    measured = azure_pa.measure_bands(IELTS, facts, {})
    llm = {
        "feedback": "…",
        "scores": {
            "fluency_coherence": {"score": 7, "comment": "c", "fix": "f"},  # Gemini: nửa mạch lạc
            "lexical_resource": {"score": 6, "comment": "c", "fix": "f"},
            "grammatical_range": {"score": 5, "comment": "c", "fix": "f"},
            "pronunciation": {
                "score": 9, "comment": "c", "fix": "f",
                "mispronounced_words": [
                    {"word": "Think", "heard_as": "tink", "suggestion": "Đặt lưỡi giữa hai hàm răng"},
                    {"word": "invented", "heard_as": "x", "suggestion": "không có trong dữ kiện"},
                ],
            },
        },
    }
    out = azure_pa.apply_azure_scores(IELTS, llm, facts, measured)
    fc_azure = measured["fluency_coherence"]["band"]
    assert out["scores"]["fluency_coherence"]["score"] == azure_pa._snap((fc_azure + 7) / 2, IELTS["scale"])
    assert out["scores"]["lexical_resource"]["score"] == 6  # Gemini giữ nguyên
    assert out["scores"]["pronunciation"]["score"] == measured["pronunciation"]["band"]
    words = out["scores"]["pronunciation"]["mispronounced_words"]
    assert [w["word"] for w in words] == ["think", "genres"]  # từ Gemini bịa ra bị loại
    assert words[0] == {"word": "think", "heard_as": "/t/ thay vì /θ/", "suggestion": "Đặt lưỡi giữa hai hàm răng", "approx_position_sec": 43.2}
    assert words[1]["suggestion"] == "Chú ý âm /ʒ/ trong từ này"
    assert llm["scores"]["pronunciation"]["score"] == 9  # đầu vào không bị sửa


def test_facts_instruction_states_fixed_scores_and_restricts_words():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    measured = azure_pa.measure_bands(IELTS, facts, {})
    text = azure_pa.build_facts_instruction(IELTS, facts, measured)
    assert "ĐÃ ĐƯỢC HỆ THỐNG CHỐT" in text
    assert "CHỈ chấm phần MẠCH LẠC" in text
    assert "think (độ chính xác 42, âm /θ/ nghe như /t/, lúc 0:43)" in text
    assert "lexical_resource" not in text.split("ĐÃ ĐƯỢC HỆ THỐNG CHỐT")[1].split("Từ phát âm")[0]


class _Config:
    def __init__(self, values: dict):
        self.values = values

    async def get(self, key):
        return self.values.get(key)


def test_load_settings_requires_key_and_region_and_defaults_language():
    assert asyncio.run(azure_pa.load_azure_settings(_Config({"azure.speech_key": "k"}))) is None
    s = asyncio.run(azure_pa.load_azure_settings(_Config({"azure.speech_key": " k ", "azure.speech_region": "southeastasia"})))
    assert (s.key, s.region, s.language) == ("k", "southeastasia", "en-US")
