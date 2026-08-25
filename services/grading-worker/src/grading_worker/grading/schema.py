"""Xây JSON Schema đầu ra ĐỘNG từ rubric của từng khóa (mục 3.9) — dimensions không cố định
ở compile-time nên không dùng Pydantic tĩnh. Cùng một schema này vừa gửi cho LLM
(response_format) vừa dùng để validate kết quả trả về — chỉ một định nghĩa duy nhất.
`pronunciation` là dimension BẮT BUỘC (mục 3.10) — thiếu thì từ chối chấm ngay, không chấm thiếu.

F8: mọi rubric đi qua `normalize_rubric()` ngay ở cửa vào ⇒ rubric v1 đã lưu trong DB vẫn chấm
đúng y như trước (khóa lấy từ `key`, mà v1 thì `key == name`), còn rubric v2 mở thêm được
thang điểm tùy ý (`scale`) và trường `fix` (`output_fields`).
"""

from __future__ import annotations

from typing import Any

import jsonschema

from .rubric_schema import PRONUNCIATION_DIMENSION, RubricV2, normalize_rubric

__all__ = ["PRONUNCIATION_DIMENSION", "RubricError", "build_output_schema", "validate_output"]

# Chỉ hai trường đầu ra này được sinh property; giá trị lạ trong `output_fields` bị bỏ qua (AC-09.7).
_SUPPORTED_OUTPUT_FIELDS = ("comment", "fix")


class RubricError(ValueError):
    pass


def _score_schema(scale: dict[str, Any]) -> dict[str, Any]:
    """step == 1 ⇒ số nguyên (đúng hành vi cũ). step khác ⇒ số thực + multipleOf.
    Cảnh báo (OQ-2): chưa xác minh được Gemini/OpenAI có tôn trọng `multipleOf` trong
    structured output hay không — chưa có API key thật. Hai mẫu seed đều step=1 nên nhánh này
    hiện chưa với tới trong thực tế."""
    step = scale["step"]
    if step == 1:
        return {"type": "integer", "minimum": scale["min"], "maximum": scale["max"]}
    return {"type": "number", "minimum": scale["min"], "maximum": scale["max"], "multipleOf": step}


def _dimension_schema(key: str, scale: dict[str, Any], output_fields: list[str]) -> dict[str, Any]:
    base_properties: dict[str, Any] = {"score": _score_schema(scale)}
    required = ["score"]
    # Thứ tự cố định comment → fix (không theo thứ tự trong `output_fields`) để schema sinh ra
    # tất định, snapshot test không rung (NFR-05).
    for field in _SUPPORTED_OUTPUT_FIELDS:
        if field in output_fields:
            base_properties[field] = {"type": "string"}
            required.append(field)

    if key == PRONUNCIATION_DIMENSION:
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


def _resolve_output_fields(rubric: RubricV2) -> list[str]:
    """Không bao giờ để một tiêu chí chỉ có mỗi `score` — rỗng/toàn giá trị lạ thì rơi về
    ["comment"] (AC-09.6)."""
    fields = [f for f in rubric["output_fields"] if f in _SUPPORTED_OUTPUT_FIELDS]
    return fields or ["comment"]


def build_output_schema(rubric: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_rubric(rubric)
    keys = [d["key"] for d in normalized["dimensions"]]

    # Cổng chặn BẮT BUỘC (mục 3.10) — KHÔNG ĐỔI ở F8, kể cả câu thông báo. Với rubric v1 thì
    # key == name nên tập rubric bị từ chối trước và sau F8 là Y HỆT NHAU (AC-10.2).
    if PRONUNCIATION_DIMENSION not in keys:
        raise RubricError(
            f"Rubric thiếu dimension bắt buộc '{PRONUNCIATION_DIMENSION}' (mục 3.10) — từ chối chấm."
        )
    # Phòng thủ: key trùng nhau sẽ âm thầm nuốt mất một tiêu chí khỏi schema (dict đè khóa).
    if len(set(keys)) != len(keys):
        duplicates = sorted({k for k in keys if keys.count(k) > 1})
        raise RubricError(f"Rubric có dimension key trùng nhau: {', '.join(duplicates)} — từ chối chấm.")

    scale = normalized["scale"]
    output_fields = _resolve_output_fields(normalized)
    scores_properties = {key: _dimension_schema(key, scale, output_fields) for key in keys}

    return {
        "type": "object",
        "properties": {
            "scores": {
                "type": "object",
                "properties": scores_properties,
                "required": keys,
            },
            "feedback": {"type": "string"},
        },
        "required": ["scores", "feedback"],
    }


def validate_output(schema: dict[str, Any], data: dict[str, Any]) -> None:
    """Raise jsonschema.ValidationError nếu output LLM không đúng schema bắt buộc (mục 3.9:
    "Output được parse & validate; sai schema → retry, quá 3 lần → DLQ")."""
    jsonschema.validate(instance=data, schema=schema)
