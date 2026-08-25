import jsonschema
import pytest

from grading_worker.grading.schema import RubricError, build_output_schema, validate_output

RUBRIC = {
    "course_key": "basic",
    "band_scale": [0, 3],
    "dimensions": [
        {"name": "fluency", "weight": 0.25, "bands": {"0": "kém", "3": "tốt"}},
        {"name": "vocabulary", "weight": 0.25, "bands": {"0": "kém", "3": "tốt"}},
        {"name": "pronunciation", "weight": 0.5, "bands": {"0": "kém", "3": "tốt"}},
    ],
}


def test_rejects_rubric_missing_mandatory_pronunciation_dimension():
    rubric = {**RUBRIC, "dimensions": [d for d in RUBRIC["dimensions"] if d["name"] != "pronunciation"]}
    with pytest.raises(RubricError):
        build_output_schema(rubric)


def test_pronunciation_dimension_requires_mispronounced_words():
    schema = build_output_schema(RUBRIC)
    pron_schema = schema["properties"]["scores"]["properties"]["pronunciation"]
    assert "mispronounced_words" in pron_schema["required"]
    assert "mispronounced_words" not in schema["properties"]["scores"]["properties"]["fluency"]["required"]


def test_score_bounds_come_from_band_scale():
    schema = build_output_schema(RUBRIC)
    fluency_score = schema["properties"]["scores"]["properties"]["fluency"]["properties"]["score"]
    assert fluency_score["minimum"] == 0
    assert fluency_score["maximum"] == 3


def test_validate_output_accepts_well_formed_result():
    schema = build_output_schema(RUBRIC)
    data = {
        "scores": {
            "fluency": {"score": 2, "comment": "khá tốt"},
            "vocabulary": {"score": 3, "comment": "phong phú"},
            "pronunciation": {
                "score": 1,
                "comment": "còn vài lỗi",
                "mispronounced_words": [{"word": "think", "heard_as": "sink", "suggestion": "th sound"}],
            },
        },
        "feedback": "Nhìn chung em làm tốt.",
    }
    validate_output(schema, data)  # không raise là pass


def test_validate_output_rejects_missing_pronunciation_words():
    schema = build_output_schema(RUBRIC)
    data = {
        "scores": {
            "fluency": {"score": 2, "comment": "ok"},
            "vocabulary": {"score": 2, "comment": "ok"},
            "pronunciation": {"score": 2, "comment": "ok"},  # thiếu mispronounced_words
        },
        "feedback": "ok",
    }
    with pytest.raises(jsonschema.ValidationError):
        validate_output(schema, data)


def test_validate_output_rejects_score_out_of_band_scale():
    schema = build_output_schema(RUBRIC)
    data = {
        "scores": {
            "fluency": {"score": 99, "comment": "ok"},
            "vocabulary": {"score": 2, "comment": "ok"},
            "pronunciation": {"score": 1, "comment": "ok", "mispronounced_words": []},
        },
        "feedback": "ok",
    }
    with pytest.raises(jsonschema.ValidationError):
        validate_output(schema, data)


# ---- F8: rubric v2 ----
# RUBRIC ở trên vẫn là v1 và mọi test trên nó phải xanh KHÔNG SỬA MỘT DÒNG NÀO — đó chính là
# bằng chứng tương thích ngược (NFR-02).

RUBRIC_V2 = {
    "schema_version": 2,
    "course_key": "IELTS-SPEAKING",
    "scale": {"min": 0, "max": 9, "step": 1},
    "aggregation": {"method": "average", "round": "nearest_int"},
    "output_fields": ["comment", "fix"],
    "dimensions": [
        {"key": "fluency_coherence", "label": "Fluency and Coherence", "weight": 1, "bands": {"4": ["chậm"], "8": ["trôi chảy"]}},
        {
            "key": "pronunciation",
            "label": "Pronunciation",
            "weight": 1,
            "bands": {"4": ["gắng sức"], "8": ["dễ hiểu"]},
            "sub_factors": [{"label": "Phạm vi", "by_band": {"4": "Limited range", "9": "A full range"}}],
        },
    ],
}


def test_v2_dimension_property_names_come_from_key_in_rubric_order():
    schema = build_output_schema(RUBRIC_V2)
    assert list(schema["properties"]["scores"]["properties"].keys()) == ["fluency_coherence", "pronunciation"]
    assert schema["properties"]["scores"]["required"] == ["fluency_coherence", "pronunciation"]


def test_v2_score_bounds_come_from_scale():
    score = build_output_schema(RUBRIC_V2)["properties"]["scores"]["properties"]["fluency_coherence"]["properties"]["score"]
    assert score == {"type": "integer", "minimum": 0, "maximum": 9}


def test_v2_output_fields_add_a_required_fix_string_per_dimension():
    dimension = build_output_schema(RUBRIC_V2)["properties"]["scores"]["properties"]["fluency_coherence"]
    assert dimension["required"] == ["score", "comment", "fix"]
    assert dimension["properties"]["fix"] == {"type": "string"}


def test_fractional_step_becomes_a_number_with_multiple_of():
    rubric = {**RUBRIC_V2, "scale": {"min": 0, "max": 9, "step": 0.5}}
    score = build_output_schema(rubric)["properties"]["scores"]["properties"]["pronunciation"]["properties"]["score"]
    assert score == {"type": "number", "minimum": 0, "maximum": 9, "multipleOf": 0.5}


def test_empty_output_fields_fall_back_to_comment_only():
    rubric = {**RUBRIC_V2, "output_fields": []}
    dimension = build_output_schema(rubric)["properties"]["scores"]["properties"]["pronunciation"]
    assert dimension["required"] == ["score", "comment", "mispronounced_words"]


def test_unknown_output_fields_are_ignored():
    rubric = {**RUBRIC_V2, "output_fields": ["comment", "sticker"]}
    dimension = build_output_schema(rubric)["properties"]["scores"]["properties"]["fluency_coherence"]
    assert dimension["required"] == ["score", "comment"]
    assert "sticker" not in dimension["properties"]


def test_only_pronunciation_gets_mispronounced_words_in_v2():
    schema = build_output_schema(RUBRIC_V2)
    assert "mispronounced_words" in schema["properties"]["scores"]["properties"]["pronunciation"]["required"]
    assert "mispronounced_words" not in schema["properties"]["scores"]["properties"]["fluency_coherence"]["required"]


def test_top_level_shape_is_unchanged():
    schema = build_output_schema(RUBRIC_V2)
    assert schema["type"] == "object"
    assert set(schema["properties"].keys()) == {"scores", "feedback"}
    assert schema["properties"]["feedback"] == {"type": "string"}
    assert schema["required"] == ["scores", "feedback"]


def test_duplicate_dimension_keys_are_rejected():
    rubric = {
        **RUBRIC_V2,
        "dimensions": [
            {"key": "pronunciation", "bands": {"0": ["a"]}},
            {"key": "pronunciation", "bands": {"0": ["b"]}},
        ],
    }
    with pytest.raises(RubricError):
        build_output_schema(rubric)


def test_v2_rubric_without_pronunciation_is_still_rejected():
    rubric = {**RUBRIC_V2, "dimensions": [d for d in RUBRIC_V2["dimensions"] if d["key"] != "pronunciation"]}
    with pytest.raises(RubricError):
        build_output_schema(rubric)


def test_v2_validate_output_accepts_a_result_carrying_fix():
    schema = build_output_schema(RUBRIC_V2)
    validate_output(
        schema,
        {
            "scores": {
                "fluency_coherence": {"score": 6, "comment": "ổn", "fix": "luyện nói liền mạch 2 phút/ngày"},
                "pronunciation": {"score": 7, "comment": "rõ", "fix": "chú ý âm cuối", "mispronounced_words": []},
            },
            "feedback": "Tốt.",
        },
    )


def test_v2_validate_output_rejects_a_result_missing_fix():
    schema = build_output_schema(RUBRIC_V2)
    with pytest.raises(jsonschema.ValidationError):
        validate_output(
            schema,
            {
                "scores": {
                    "fluency_coherence": {"score": 6, "comment": "ổn"},
                    "pronunciation": {"score": 7, "comment": "rõ", "fix": "x", "mispronounced_words": []},
                },
                "feedback": "Tốt.",
            },
        )
