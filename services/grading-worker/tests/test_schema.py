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
