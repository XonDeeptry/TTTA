"""Hàm thuần của `grading/azure_pa.py`. JSON mẫu dựng theo cấu trúc Azure; cấu trúc đã được đối
chiếu với phản hồi THẬT ngày 2026-09-15 (Words[] có Duration, Offset, Phonemes, Syllables,
PronunciationAssessment{AccuracyScore, ErrorType, Feedback})."""

from __future__ import annotations

import asyncio

import pytest

from grading_worker.grading import azure_pa
from grading_worker.grading.rubric_schema import normalize_rubric

T = 10_000_000


def _phoneme(p: str, acc: float, heard: str | None = None, start: float | None = None, dur: float = 0.1) -> dict:
    node = {"Phoneme": p, "PronunciationAssessment": {"AccuracyScore": acc, "NBestPhonemes": [{"Phoneme": heard or p, "Score": 90.0}]}}
    if start is not None:
        node["Offset"] = int(start * T)
        node["Duration"] = int(dur * T)
    return node


def _word(w, acc, phonemes, syllables=None, err="None", start=0.0, dur=0.5, prosody=None) -> dict:
    pa = {"AccuracyScore": acc, "ErrorType": err}
    if prosody:
        pa["Feedback"] = {"Prosody": prosody}
    return {
        "Word": w,
        "Offset": int(start * T),
        "Duration": int(dur * T),
        "PronunciationAssessment": pa,
        "Phonemes": phonemes,
        "Syllables": [{"Syllable": s, "PronunciationAssessment": {"AccuracyScore": a}} for s, a in (syllables or [])],
    }


MONOTONE = {"Break": {"ErrorTypes": ["None"]}, "Intonation": {"ErrorTypes": ["Monotone"]}}

SEGMENTS = [
    {
        "NBest": [
            {
                "Display": "I think music is my passion.",
                "PronunciationAssessment": {"AccuracyScore": 80, "FluencyScore": 90, "ProsodyScore": 70, "CompletenessScore": 100, "PronScore": 80},
                "Words": [
                    _word("think", 42, [_phoneme("θ", 30, heard="t", start=43.2, dur=0.08), _phoneme("ɪ", 90), _phoneme("k", 60)], start=43.2, dur=0.4, prosody=MONOTONE),
                    _word("music", 88, [_phoneme("m", 95), _phoneme("k", 80)], syllables=[("mju", 90), ("zɪk", 70)], start=44.0, prosody=MONOTONE),
                    _word("passion", 95, [_phoneme("p", 95), _phoneme("n", 100)], syllables=[("pæ", 100), ("ʃən", 90)], start=45.0),
                ],
            }
        ]
    },
    {
        "NBest": [
            {
                "Display": "Genres.",
                "PronunciationAssessment": {"AccuracyScore": 50, "FluencyScore": 60, "ProsodyScore": 40, "CompletenessScore": 100, "PronScore": 50},
                # 70 điểm nhưng Azure vẫn gắn Mispronunciation — phải được liệt kê (lỗi của bản đầu)
                "Words": [
                    _word("genres", 70, [_phoneme("ʒ", 45, heard="dʒ"), _phoneme("z", 75)], err="Mispronunciation", start=90.0, dur=0.6),
                    _word("away", 55, [_phoneme("ə", 40), _phoneme("w", 90), _phoneme("eɪ", 80)], start=12.0, dur=0.3),
                ],
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
        "dimensions": [{"key": k, "label": k} for k in ("pronunciation", "intonation", "ending_sounds", "word_stress", "fluency")],
    }
)
IELTS = normalize_rubric(
    {
        "schema_version": 2,
        "scale": {"min": 0, "max": 9, "step": 1},
        "aggregation": {"method": "average", "round": "nearest_int"},
        "output_fields": ["comment", "fix"],
        "dimensions": [{"key": k, "label": k} for k in ("fluency_coherence", "lexical_resource", "grammatical_range", "pronunciation")],
    }
)


def test_summarize_weights_segments_by_word_count_and_derives_ending_sounds_and_stress():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    assert facts["scores"]["accuracy"] == pytest.approx((80 * 3 + 50 * 2) / 5, abs=0.01)
    # âm cuối: k=60, k=80, n=100, z=75, eɪ=80
    assert facts["ending_sounds"] == pytest.approx((60 + 80 + 100 + 75 + 80) / 5, abs=0.01)
    assert facts["mode"] == "unscripted"
    assert facts["transcript"] == "I think music is my passion. Genres."


def test_every_mispronunciation_and_low_word_is_listed_in_time_order_with_spans_and_weak_phonemes():
    errors = azure_pa.summarize(SEGMENTS, scripted=False)["errors"]
    # away (12 s, 55 < 60), think (43.2 s, 42), genres (90 s, 70 nhưng ErrorType=Mispronunciation)
    assert [e["word"] for e in errors] == ["away", "think", "genres"]
    think = errors[1]
    assert (think["start_sec"], think["end_sec"], think["offset_sec"]) == (43.2, 43.6, 43.2)
    assert think["phoneme"] == "θ" and think["heard_phoneme"] == "t"
    assert think["weak_phonemes"] == [
        {"phoneme": "θ", "accuracy": 30.0, "heard": "t", "position": "initial", "start_sec": 43.2, "end_sec": 43.28}
    ]
    assert errors[0]["weak_phonemes"][0]["position"] == "initial"
    assert errors[2]["weak_phonemes"][0]["heard"] == "dʒ"


def test_no_cap_of_ten_every_flagged_word_reaches_the_llm():
    words = [_word(f"w{i}", 40, [_phoneme("t", 40)], start=float(i)) for i in range(27)]
    facts = azure_pa.summarize([{"NBest": [{"PronunciationAssessment": {}, "Words": words}]}], scripted=False)
    assert len(facts["errors"]) == 27


def test_timeline_of_every_word_and_prosody_feedback_counts():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    assert [w["word"] for w in facts["words"]] == ["think", "music", "passion", "genres", "away"]
    assert facts["words"][1] == {"word": "music", "start_sec": 44.0, "end_sec": 44.5, "accuracy": 88.0, "error_type": "None"}
    assert facts["prosody_feedback"] == {"Monotone": 2}


def test_omissions_and_insertions_do_not_count_as_spoken_words():
    seg = {"NBest": [{"PronunciationAssessment": {}, "Words": [
        _word("the", 0, [], err="Omission"), _word("gate", 90, [_phoneme("t", 90)]), _word("uh", 0, [], err="Insertion"),
    ]}]}
    facts = azure_pa.summarize([seg], scripted=True)
    assert (facts["word_count"], facts["omissions"], facts["insertions"]) == (1, 1, 1)
    assert facts["errors"] == []


@pytest.mark.parametrize("value,expected", [(95, 5), (90, 5), (89.9, 4), (75, 4), (60, 3), (45, 2), (30, 1), (29.9, 0), (None, None)])
def test_default_kid_thresholds(value, expected):
    assert azure_pa.to_band(value, {"min": 0, "max": 5, "step": 1}, {}) == expected


def test_threshold_override_from_setting_and_bad_json_falls_back():
    overrides = azure_pa.parse_thresholds('{"5": [[50, 5], [10, 1]]}')
    assert azure_pa.to_band(55, {"min": 0, "max": 5, "step": 1}, overrides) == 5
    assert azure_pa.parse_thresholds("not json") == {}


def test_kid_maps_all_five_dimensions_to_azure():
    facts = azure_pa.summarize(SEGMENTS, scripted=True)
    assert set(azure_pa.measure_bands(KID, facts, {})) == {"pronunciation", "intonation", "ending_sounds", "word_stress", "fluency"}


def test_ielts_leaves_lexical_and_grammar_to_gemini():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    assert set(azure_pa.measure_bands(IELTS, facts, {})) == {"fluency_coherence", "pronunciation"}


def test_apply_overrides_scores_and_rebuilds_words_with_start_and_end():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    measured = azure_pa.measure_bands(IELTS, facts, {})
    llm = {
        "feedback": "…",
        "scores": {
            "fluency_coherence": {"score": 7, "comment": "c", "fix": "f"},
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
    assert out["scores"]["lexical_resource"]["score"] == 6
    assert out["scores"]["pronunciation"]["score"] == measured["pronunciation"]["band"]
    words = out["scores"]["pronunciation"]["mispronounced_words"]
    assert [w["word"] for w in words] == ["away", "think", "genres"]
    assert words[1] == {
        "word": "think", "heard_as": "/t/ thay vì /θ/", "suggestion": "Đặt lưỡi giữa hai hàm răng",
        "approx_position_sec": 43.2, "start_sec": 43.2, "end_sec": 43.6,
    }
    assert words[2]["suggestion"] == "Chú ý âm /ʒ/ trong từ này"
    assert llm["scores"]["pronunciation"]["score"] == 9


def test_same_word_twice_gets_one_suggestion_each():
    words = [_word("love", 20, [_phoneme("v", 20)], start=1.0), _word("love", 30, [_phoneme("v", 30)], start=5.0)]
    facts = azure_pa.summarize([{"NBest": [{"PronunciationAssessment": {"AccuracyScore": 50}, "Words": words}]}], scripted=False)
    data = {"scores": {"pronunciation": {"score": 1, "comment": "c", "mispronounced_words": [
        {"word": "love", "heard_as": "", "suggestion": "lần 1"}, {"word": "love", "heard_as": "", "suggestion": "lần 2"},
    ]}}}
    out = azure_pa.apply_azure_scores(KID, data, facts, {})
    assert [w["suggestion"] for w in out["scores"]["pronunciation"]["mispronounced_words"]] == ["lần 1", "lần 2"]


def test_facts_instruction_lists_every_word_with_time_range_and_weak_phonemes():
    facts = azure_pa.summarize(SEGMENTS, scripted=False)
    measured = azure_pa.measure_bands(IELTS, facts, {})
    text = azure_pa.build_facts_instruction(IELTS, facts, measured)
    assert "ĐÃ ĐƯỢC HỆ THỐNG CHỐT" in text
    assert "phải trả ĐỦ TẤT CẢ các từ này" in text
    assert "0:43.2–0:43.6 think (độ chính xác 42; âm vị yếu: /θ/ initial 30 nghe như /t/)" in text
    assert "Monotone ở 2 từ" in text


class _Config:
    def __init__(self, values: dict):
        self.values = values

    async def get(self, key):
        return self.values.get(key)


def test_load_settings_requires_key_and_region_and_defaults_language():
    assert asyncio.run(azure_pa.load_azure_settings(_Config({"azure.speech_key": "k"}))) is None
    s = asyncio.run(azure_pa.load_azure_settings(_Config({"azure.speech_key": " k ", "azure.speech_region": "eastus"})))
    assert (s.key, s.region, s.language) == ("k", "eastus", "en-US")
