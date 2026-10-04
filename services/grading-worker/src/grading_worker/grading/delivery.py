"""Bài nói IELTS: tự nhiên, học thuộc, hay đọc kịch bản? — CHỈ GẮN CỜ, không chặn điểm.

Học thuật ILM 2026-10-03 (bài 237): học viên đọc/đọc thuộc một bài soạn sẵn; nhịp đều, câu chữ như
văn viết. Azure (độ rõ 96, trôi chảy 89.6) và Gemini (chấm theo câu chữ của bài soạn) cùng cho band
8, học thuật đánh giá ≤ 6. Chủ dự án chọn: phát hiện và gắn cờ cho giáo viên, KHÔNG tự hạ trần điểm —
giáo viên quyết định.

Bổ sung vào prompt Ở WORKER (giống dữ kiện Azure), không nằm trong bản song sinh prompt-render.ts.
"""

from __future__ import annotations

import copy
from typing import Any

STYLES = ("spontaneous", "rehearsed", "read")

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "style": {"type": "string", "enum": list(STYLES)},
        "evidence": {"type": "string"},
    },
    "required": ["style", "evidence"],
}

INSTRUCTION = "\n".join(
    [
        "PHÂN LOẠI CÁCH NÓI (bắt buộc, trường 'delivery'):",
        "- 'spontaneous': nói tự nhiên — có ngập ngừng, tự sửa, lặp ý, nhịp lúc nhanh lúc chậm, câu chữ của văn nói.",
        "- 'rehearsed': nói lại một bài đã học thuộc — trôi tuồn tuột, nhịp đều đặn, câu chữ trau chuốt như văn viết, gần như không ngập ngừng.",
        "- 'read': đọc từ văn bản — nhịp và ngữ điệu kiểu đọc, ngắt theo dấu câu, không có dấu hiệu nghĩ ra câu.",
        "'evidence': 1–2 câu nêu dấu hiệu cụ thể nghe được trong bài (bằng tiếng Việt).",
        "Nếu KHÔNG phải 'spontaneous': nói rõ điều đó trong nhận xét Fluency and coherence — bài nói chưa tự nhiên — và "
        "chấm theo khả năng nói tự nhiên thể hiện được, không theo độ trau chuốt của bài soạn sẵn.",
        # Hướng dẫn chính thức (chủ dự án duyệt 2026-10-03): IDP — "Memorised language doesn't give the
        # examiner an accurate measure of your English-language skills"; bảng band IELTS (Grammar band 3)
        # loại trừ "apparently memorised utterances" khỏi đánh giá độ chính xác.
        "Theo hướng dẫn chính thức của IELTS, ngôn ngữ học thuộc KHÔNG phản ánh đúng năng lực: với bài 'rehearsed' "
        "hoặc 'read', KHÔNG lấy từ vựng, thành ngữ và cấu trúc câu trau chuốt của bài soạn sẵn làm bằng chứng cho "
        "Lexical resource và Grammatical range. Chỉ dựa vào phần học viên rõ ràng TỰ tạo ra (lỗi, chỗ tự sửa, câu "
        "nói thêm ngoài kịch bản); bài gần như toàn kịch bản thì chấm hai tiêu chí này theo phần đó và ghi rõ trong "
        "nhận xét rằng câu chữ soạn sẵn không được tính.",
    ]
)


def with_delivery(schema: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(schema)
    out.setdefault("properties", {})["delivery"] = SCHEMA
    required = out.setdefault("required", [])
    if "delivery" not in required:
        required.append("delivery")
    return out


def flag_reason(data: dict[str, Any]) -> str | None:
    """Câu gắn cờ cho giáo viên, hoặc None khi bài nói tự nhiên / không có phân loại."""
    d = data.get("delivery")
    if not isinstance(d, dict) or d.get("style") not in ("rehearsed", "read"):
        return None
    kind = "học thuộc bài soạn sẵn" if d["style"] == "rehearsed" else "đọc từ văn bản"
    evidence = str(d.get("evidence") or "").strip()
    return (f"Bài có dấu hiệu {kind} — nói chưa tự nhiên, giáo viên xem lại điểm" + (f": {evidence}" if evidence else ""))[:500]
