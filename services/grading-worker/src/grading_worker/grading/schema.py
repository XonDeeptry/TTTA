"""Xây JSON Schema đầu ra ĐỘNG từ rubric của từng khóa (mục 3.9) — dimensions không cố định
ở compile-time nên không dùng Pydantic tĩnh. Cùng một schema này vừa gửi cho LLM
(response_format) vừa dùng để validate kết quả trả về — chỉ một định nghĩa duy nhất.
`pronunciation` là dimension BẮT BUỘC (mục 3.10) — thiếu thì từ chối chấm ngay, không chấm thiếu.
"""

from __future__ import annotations

from typing import Any

import jsonschema

PRONUNCIATION_DIMENSION = "pronunciation"


class RubricError(ValueError):
    pass


def _dimension_schema(name: str, band_min: int, band_max: int) -> dict[str, Any]:
    base_properties: dict[str, Any] = {
        "score": {"type": "integer", "minimum": band_min, "maximum": band_max},
        "comment": {"type": "string"},
    }
    required = ["score", "comment"]
    if name == PRONUNCIATION_DIMENSION:
        base_properties["mispronounced_words"] = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "word": {"type": "string"},
                    "heard_as": {"type": "string"},
                    "suggestion": {"type": "string"},
                    "approx_position_sec": {"type": "number"},
                },
                "required": ["word", "heard_as", "suggestion"],
            },
        }
        required.append("mispronounced_words")
    return {"type": "object", "properties": base_properties, "required": required}


def build_output_schema(rubric: dict[str, Any]) -> dict[str, Any]:
    dimensions = rubric.get("dimensions", [])
    names = [d["name"] for d in dimensions]
    if PRONUNCIATION_DIMENSION not in names:
        raise RubricError(
            f"Rubric thiếu dimension bắt buộc '{PRONUNCIATION_DIMENSION}' (mục 3.10) — từ chối chấm."
        )

    band_min, band_max = rubric.get("band_scale", [0, 3])
    scores_properties = {name: _dimension_schema(name, band_min, band_max) for name in names}

    return {
        "type": "object",
        "properties": {
            "scores": {
                "type": "object",
                "properties": scores_properties,
                "required": names,
            },
            "feedback": {"type": "string"},
        },
        "required": ["scores", "feedback"],
    }


def validate_output(schema: dict[str, Any], data: dict[str, Any]) -> None:
    """Raise jsonschema.ValidationError nếu output LLM không đúng schema bắt buộc (mục 3.9:
    "Output được parse & validate; sai schema → retry, quá 3 lần → DLQ")."""
    jsonschema.validate(instance=data, schema=schema)
