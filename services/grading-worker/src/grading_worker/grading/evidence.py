"""Bằng chứng cho "Đo → Đếm → Viết" (Idea/20261003-DoDemViet.md) — giai đoạn 1, chạy NGẦM.

Đo tuần 2026-10-03: Gemini cho BAND dao động ±1 giữa các lượt (cùng file 6.0 rồi 7.0), nhưng các
LỖI nó trích ("One the day", "experience") lặp lại y nhau. Nên: Gemini LIỆT KÊ bằng chứng, code
ĐẾM rồi quy ra band qua bảng ngưỡng hiệu chỉnh theo giáo viên (`measures.py`).

Gộp vào lượt chấm hiện có (không thêm lượt gọi). Chỉ IELTS. Giai đoạn 1 KHÔNG đổi điểm học viên:
bằng chứng + số đo + band theo công thức chỉ được lưu vào `gradings.assessment` để so với giáo viên.
"""

from __future__ import annotations

import copy
from typing import Any

_ITEM = {
    "type": "object",
    "properties": {"quote": {"type": "string"}, "correction": {"type": "string"}},
    "required": ["quote", "correction"],
}

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "grammar_errors": {"type": "array", "items": _ITEM},
        "lexical_errors": {"type": "array", "items": _ITEM},
        "complex_structures": {"type": "array", "items": {"type": "string"}},
        "advanced_vocabulary": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["grammar_errors", "lexical_errors", "complex_structures", "advanced_vocabulary"],
}

INSTRUCTION = "\n".join(
    [
        "TRÍCH BẰNG CHỨNG (bắt buộc, trường 'evidence') — chỉ liệt kê, KHÔNG chấm điểm trong trường này:",
        "- grammar_errors: MỌI lỗi ngữ pháp nghe được; 'quote' trích NGUYÊN VĂN cụm học viên nói, 'correction' là cách đúng.",
        "- lexical_errors: MỌI lỗi chọn từ / collocation / dạng từ; cùng cách trích như trên.",
        "- complex_structures: các câu/cụm có cấu trúc phức (mệnh đề phụ, câu điều kiện, bị động, so sánh…) học viên DÙNG ĐÚNG, trích nguyên văn.",
        "- advanced_vocabulary: từ vựng ít phổ biến, thành ngữ, collocation tự nhiên học viên DÙNG ĐÚNG, trích nguyên văn.",
        "Mỗi lỗi một mục, kể cả lỗi lặp lại. Không có thì để mảng rỗng.",
    ]
)


def with_evidence(schema: dict[str, Any]) -> dict[str, Any]:
    """Thêm `evidence` là trường TÙY CHỌN — KHÔNG đưa vào `required`. Giai đoạn 1 chỉ chạy ngầm:
    Gemini lỡ bỏ trường này thì bài vẫn phải chấm xong, không được rơi vào retry/DLQ vì dữ liệu ngầm."""
    out = copy.deepcopy(schema)
    out.setdefault("properties", {})["evidence"] = SCHEMA
    return out
