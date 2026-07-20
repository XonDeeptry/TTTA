"""Prompt builder (mục 3.9 điểm 4): system prompt cố định (rào chắn học thuật, không bịa,
giọng theo `tone`) + rubric JSON + few-shot mẫu giáo viên. Trả về text — provider adapter
tự quyết định gắn audio vào request theo cách riêng của SDK từng bên.
"""

from __future__ import annotations

from typing import Any


def build_system_instruction(rubric: dict[str, Any]) -> str:
    lines = [
        "Bạn là giáo viên chấm bài nói tiếng Anh cho học viên trung tâm ILM.",
        f"Khóa: {rubric.get('course_key', '?')}. Loại bài: {rubric.get('task_type', 'speaking_clip')}.",
        f"Giọng điệu nhận xét: {rubric.get('tone', 'khích lệ')}.",
        f"Viết nhận xét bằng ngôn ngữ: {rubric.get('feedback_language', 'vi')}.",
        "CHỈ đánh giá dựa trên nội dung audio đính kèm. KHÔNG bịa thông tin không có trong audio.",
        "Chấm từng tiêu chí sau theo thang điểm và mô tả band tương ứng:",
    ]
    for dim in rubric.get("dimensions", []):
        bands_desc = "; ".join(f"{band}: {desc}" for band, desc in dim.get("bands", {}).items())
        lines.append(f"- {dim['name']} (trọng số {dim.get('weight')}): {bands_desc}")

    few_shot = rubric.get("few_shot_examples") or []
    if few_shot:
        lines.append("Ví dụ nhận xét mẫu do giáo viên cung cấp (bám theo văn phong này):")
        for example in few_shot:
            lines.append(f"- {example}")

    lines.append(
        "Với tiêu chí 'pronunciation', liệt kê cụ thể từ phát âm sai (nếu có): từ gốc, "
        "nghe thành gì, gợi ý sửa, vị trí ước lượng trong clip (giây)."
    )
    lines.append("Trả về đúng theo schema JSON đã cung cấp — không thêm chữ nào ngoài JSON.")
    return "\n".join(lines)


def build_user_instruction() -> str:
    return "Hãy chấm bài nói trong file audio đính kèm theo đúng tiêu chí và schema đã cho."
