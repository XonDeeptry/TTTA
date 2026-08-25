"""Prompt builder (mục 3.9 điểm 4): system prompt cố định (rào chắn học thuật, không bịa,
giọng theo `tone`) + rubric JSON + few-shot mẫu giáo viên. Trả về text — provider adapter
tự quyết định gắn audio vào request theo cách riêng của SDK từng bên.

F8: rubric đi qua `normalize_rubric()` ngay ở cửa vào ⇒ hai builder (audio và text/pilot) render
được cả rubric v1 lẫn v2 mà không cần biết version. Phần thân chung (khối tiêu chí, lưới yếu tố
con, ngân hàng nhận xét, yêu cầu `output_fields`) nằm trong các HÀM DÙNG CHUNG bên dưới —
KHÔNG chép đôi giữa hai builder, nếu không chúng sẽ trôi khỏi nhau.

RANH GIỚI CỨNG (Phần 5 tài liệu thiết kế, BR-09): prompt TUYỆT ĐỐI không được nhắc tới tổng
điểm, điểm trung bình hay tên cấp độ (`levels`). LLM chỉ chấm TỪNG tiêu chí; tổng và cấp độ do
core-api tính. Đừng thêm `levels` vào bất kỳ hàm render nào dưới đây.

⚠ BẢN SONG SINH (F12): file này được nhân đôi sang TypeScript tại
    services/core-api/src/criteria/prompt-render.ts
để dashboard xem trước ĐÚNG prompt sẽ gửi cho LLM (repo không có cơ chế package dùng chung giữa
TS và Python — xem tiền lệ `contracts.py` bị nhân ba và `rubric_schema.py`). File NÀY là bản gốc:
nó chạy lúc chấm thật. Hai bản PHẢI cho ra chuỗi giống hệt nhau; lưới đỡ chống trôi là fixture
dùng chung `core-api/src/criteria/__fixtures__/prompt-render.fixtures.json` + hai bộ test chạy
trên cùng fixture đó (`tests/test_prompt_render_fixtures.py` và `prompt-render.spec.ts`).
Sửa file này thì PHẢI sửa file TS trong cùng một commit, và sinh lại fixture.
"""

from __future__ import annotations

from typing import Any

from .rubric_schema import RubricV2, normalize_rubric

# Hai câu mở đầu + hai câu đuôi dùng chung cho cả hai builder.
_HEADER_ROLE = "Bạn là giáo viên chấm bài nói tiếng Anh cho học viên trung tâm ILM."
_CRITERIA_INTRO = "Chấm từng tiêu chí sau theo thang điểm và mô tả band tương ứng:"
_CLOSING = "Trả về đúng theo schema JSON đã cung cấp — không thêm chữ nào ngoài JSON."


def _band_order(bands: dict[str, list[str]]) -> list[str]:
    """Sắp band tăng dần theo số khi MỌI khóa đều là số; ngược lại giữ nguyên thứ tự chèn.
    Tất định trong cả hai trường hợp ⇒ snapshot test không rung (NFR-05)."""
    keys = list(bands.keys())
    try:
        return sorted(keys, key=lambda k: float(k))
    except (TypeError, ValueError):
        return keys


def _render_dimensions(rubric: RubricV2) -> list[str]:
    """Mỗi tiêu chí: một dòng tiêu đề (nhãn + khóa máy + trọng số), rồi mỗi band một khối,
    MỖI GẠCH ĐẦU DÒNG MỘT DÒNG (không nối bằng ';' như v1) — mô tả band dài của rubric thật
    sẽ không còn bị dồn vào một dòng khó đọc."""
    lines: list[str] = []
    for dim in rubric["dimensions"]:
        lines.append(f"- Tiêu chí: {dim['label']} [key={dim['key']}] (trọng số {dim['weight']}):")
        bands = dim["bands"]
        for band in _band_order(bands):
            lines.append(f"  Band {band}:")
            for bullet in bands[band]:
                lines.append(f"    • {bullet}")
        # Lưới yếu tố con: chỉ render khi thực sự có, không để lại tiêu đề rỗng (AC-11.4).
        if dim["sub_factors"]:
            lines.append("  Yếu tố con (tham chiếu khi chấm tiêu chí này):")
            for sub_factor in dim["sub_factors"]:
                by_band = sub_factor["by_band"]
                grid = " | ".join(f"{band} = {by_band[band]}" for band in _band_order(by_band))  # type: ignore[arg-type]
                lines.append(f"    - {sub_factor['label']}: {grid}")
    return lines


def _render_output_fields_instruction(rubric: RubricV2) -> list[str]:
    """Câu chữ phải khớp ĐÚNG tên trường trong JSON Schema (`comment`, `fix`) — LLM đọc cả hai."""
    fields = rubric["output_fields"]
    if "fix" in fields:
        return [
            "Với MỖI tiêu chí, viết một nhận xét (trường 'comment') VÀ một hướng sửa bài cụ thể, "
            "làm được ngay (trường 'fix')."
        ]
    return ["Với MỖI tiêu chí, viết một nhận xét (trường 'comment')."]


def _render_comment_bank(rubric: RubricV2) -> list[str]:
    """Nhóm theo tiêu chí, trong mỗi tiêu chí thì gắn nhãn ý định ("khen"/"góp ý"/...).
    Thứ tự nhóm: theo thứ tự tiêu chí trong rubric → tiêu chí lạ (không khớp key nào) theo thứ
    tự xuất hiện → nhóm "chung" (dimension = null) xếp CUỐI. Ví dụ mẫu của rubric v1 nằm trọn
    trong nhóm "chung" nên nội dung giáo viên đã soạn không mất chữ nào (AC-11.6)."""
    bank = rubric["comment_bank"]
    if not bank:
        return []

    labels = {dim["key"]: dim["label"] for dim in rubric["dimensions"]}
    groups: dict[str | None, list[dict[str, Any]]] = {}
    for entry in bank:
        groups.setdefault(entry["dimension"], []).append(entry)  # type: ignore[arg-type]

    ordered: list[str | None] = [key for key in labels if key in groups]
    ordered += [key for key in groups if key is not None and key not in labels]
    if None in groups:
        ordered.append(None)

    lines = ["Ví dụ nhận xét mẫu do giáo viên cung cấp (bám theo văn phong này; nhãn [trong ngoặc vuông] chỉ để PHÂN LOẠI ví dụ — TUYỆT ĐỐI KHÔNG chép nhãn đó vào nhận xét trả về):"]
    for dimension in ordered:
        header = "Dùng chung" if dimension is None else f"Tiêu chí {labels.get(dimension, dimension)}"
        lines.append(f"  {header}:")
        for entry in groups[dimension]:
            intent = entry["intent"]
            prefix = f"[{intent}] " if intent else ""
            lines.append(f"    - {prefix}{entry['text']}")
    return lines


def _header_lines(rubric: RubricV2) -> list[str]:
    """4 dòng nhận dạng khóa/giọng điệu/ngôn ngữ dùng chung cho cả hai builder."""
    return [
        _HEADER_ROLE,
        f"Khóa: {rubric['course_key'] or '?'}. Loại bài: {rubric['task_type']}.",
        f"Giọng điệu nhận xét: {rubric['tone']}.",
        f"Viết nhận xét bằng ngôn ngữ: {rubric['feedback_language']}.",
    ]


def build_system_instruction(rubric: dict[str, Any]) -> str:
    normalized = normalize_rubric(rubric)
    lines = _header_lines(normalized)
    lines.append("CHỈ đánh giá dựa trên nội dung audio đính kèm. KHÔNG bịa thông tin không có trong audio.")
    lines.append(_CRITERIA_INTRO)
    lines += _render_dimensions(normalized)
    lines += _render_output_fields_instruction(normalized)
    lines += _render_comment_bank(normalized)
    lines.append(
        "Với tiêu chí 'pronunciation', liệt kê cụ thể từ phát âm sai (nếu có): từ gốc, "
        "nghe thành gì, gợi ý sửa, vị trí ước lượng trong clip (giây)."
    )
    lines.append(_CLOSING)
    return "\n".join(lines)


def build_user_instruction() -> str:
    return "Hãy chấm bài nói trong file audio đính kèm theo đúng tiêu chí và schema đã cho."


def build_system_instruction_text(rubric: dict[str, Any]) -> str:
    """Pilot A/B nhánh text (transcript-only): system prompt PHẢI khác nhánh audio — nêu rõ mô
    hình chỉ đọc BẢN CHÉP LỜI (transcript), KHÔNG nghe được audio; phát âm phải suy luận từ bằng
    chứng trong transcript với độ tin cậy thấp và thừa nhận hạn chế đó trong nhận xét. Vẫn liệt
    kê ĐẦY ĐỦ mọi tiêu chí (kể cả 'pronunciation' bắt buộc) với trọng số/band, cùng giọng điệu +
    ngôn ngữ nhận xét như prompt audio."""
    normalized = normalize_rubric(rubric)
    lines = _header_lines(normalized)
    lines += [
        "QUAN TRỌNG: Em CHỈ nhận được BẢN CHÉP LỜI (transcript) dạng văn bản, KHÔNG nghe được audio gốc.",
        "CHỈ đánh giá dựa trên nội dung transcript. KHÔNG bịa thông tin không có trong transcript.",
        "Với tiêu chí 'pronunciation': vì không nghe được audio, chỉ được suy luận phát âm từ bằng "
        "chứng trong transcript (lỗi chính tả/chép sai gợi ý phát âm sai) với ĐỘ TIN CẬY THẤP, và "
        "phải nêu rõ hạn chế này trong nhận xét (không nghe trực tiếp nên đánh giá phát âm chỉ mang tính tham khảo).",
        _CRITERIA_INTRO,
    ]
    lines += _render_dimensions(normalized)
    lines += _render_output_fields_instruction(normalized)
    lines += _render_comment_bank(normalized)
    lines.append(_CLOSING)
    return "\n".join(lines)


def build_user_instruction_text() -> str:
    return "Hãy chấm bài nói dựa trên bản chép lời (transcript) dưới đây theo đúng tiêu chí và schema đã cho."
