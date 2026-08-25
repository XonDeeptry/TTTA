"""F11 — nút bấm Zalo: bộ phân tích payload (TẬP ĐÓNG) và hai bộ dựng nút.

Đây là **cơ chế an toàn** của F11. Bot không hội thoại với học viên (Foundation, changelog v1.1);
nút bấm nới ranh giới đó một cách có kiểm soát: chỉ những chuỗi khớp CHÍNH XÁC tiền tố `#ilm:`
+ một hành động đã biết + đúng số lượng đối số + đối số toàn chữ số mới được định tuyến vào
nhánh nút. **Mọi thứ khác — kể cả một chuỗi `#ilm:` méo mó — trả về None và rơi xuống đúng
nhánh flag-cho-tư-vấn đang chạy hôm nay, không đổi một chữ.**

Cả ba hàm ở đây đều THUẦN: không I/O, không state, test được độc lập với pipeline.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from .contracts import (
    BUTTON_ACTIONS,
    ILM_PAYLOAD_PREFIX,
    MAX_BUTTON_TITLE_LEN,
    MAX_BUTTONS,
    OutboundButton,
)

logger = logging.getLogger(__name__)

# Đối số CHỈ gồm chữ số ASCII 1–12 ký tự. Dùng `[0-9]` (không dùng `\d`, vì `\d` của Python
# khớp cả chữ số Unicode kiểu '٣') và `fullmatch` (không dùng `^…$`, vì `$` còn khớp trước một
# dấu xuống dòng ở cuối chuỗi).
_ARG_RE = re.compile(r"[0-9]{1,12}")

# Số đối số BẮT BUỘC của từng hành động — bảng này CHÍNH LÀ tập đóng.
_ARITY: dict[str, int] = {"ack": 1, "request_advisor": 1, "select_student": 2}

# `select_student` do HỆ THỐNG sinh (BR-14): giáo viên đặt nó vào `student_reply.buttons`
# thì bị bỏ qua.
_STUDENT_REPLY_ACTIONS = ("ack", "request_advisor")

assert set(_ARITY) == set(BUTTON_ACTIONS), "bảng arity phải phủ đúng tập hành động của contracts"


def parse_ilm_payload(text: Any) -> Optional[tuple[str, list[int]]]:
    """`"#ilm:ack:12"` → `("ack", [12])`. Trả None cho MỌI chuỗi khác.

    Cố ý KHÔNG cắt khoảng trắng và KHÔNG chuẩn hóa hoa/thường: `" #ilm:ack:1"`, `"#ilm:ack:1 "`
    và `"#ILM:ack:1"` đều là tin nhắn bình thường của học viên, phải đi vào luồng tư vấn.
    """
    if not isinstance(text, str) or not text.startswith(ILM_PAYLOAD_PREFIX):
        return None
    parts = text.split(":")
    if len(parts) < 2:
        return None
    action = parts[1]
    arity = _ARITY.get(action)
    if arity is None:
        return None
    args = parts[2:]
    if len(args) != arity:
        return None
    if not all(_ARG_RE.fullmatch(arg) for arg in args):
        return None
    return action, [int(arg) for arg in args]


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def build_reply_buttons(student_reply: Any, grading_id: Any) -> list[OutboundButton]:
    """Bộ nút cho tin NHẬN XÉT, dựng từ `rubric.student_reply.buttons`.

    Bản song sinh TypeScript: `core-api/src/lib/outbound-buttons.ts::buildReplyButtons` (đường
    gửi sau kiểm duyệt). Hai bản phải cho cùng kết quả trên cùng cấu hình.

    `student_reply` được `normalize_rubric` chép NGUYÊN VĂN (F8) nên là dữ liệu giáo viên soạn,
    KHÔNG đáng tin: phần tử hỏng bị bỏ qua lặng lẽ, hàm này không bao giờ ném lỗi (NFR-03).
    """
    if not _is_positive_int(grading_id):
        return []  # không bao giờ dựng "#ilm:ack:None"
    if not isinstance(student_reply, dict):
        return []
    entries = student_reply.get("buttons")
    if not isinstance(entries, list):
        return []

    buttons: list[OutboundButton] = []
    for entry in entries:
        if len(buttons) >= MAX_BUTTONS:
            break  # cắt Ở PRODUCER để gateway không phải bỏ cả khối
        if not isinstance(entry, dict):
            continue
        title = entry.get("title")
        action = entry.get("action")
        if not isinstance(title, str) or title.strip() == "" or len(title) > MAX_BUTTON_TITLE_LEN:
            continue
        if not isinstance(action, str) or action not in _STUDENT_REPLY_ACTIONS:
            continue
        buttons.append(OutboundButton(title=title, action=action, payload=f"{ILM_PAYLOAD_PREFIX}{action}:{grading_id}"))
    return buttons


def build_select_student_buttons(active_bindings: list[dict[str, Any]], submission_id: Any) -> list[OutboundButton]:
    """Bộ nút cho tin HỎI ĐỊNH DANH anh/chị/em (một nút mỗi binding đang active).

    Tất-cả-hoặc-không: quá `MAX_BUTTONS` binding, hoặc có nhãn dài quá giới hạn Zalo, thì KHÔNG
    gắn nút nào — cắt bớt sẽ giấu mất một người trong nhà, điều đó bị cấm (AC-08.7).
    """
    if not _is_positive_int(submission_id):
        return []
    if len(active_bindings) > MAX_BUTTONS:
        logger.warning(
            "submission %s: %s binding đang active > %s — gửi tin hỏi định danh KHÔNG kèm nút",
            submission_id,
            len(active_bindings),
            MAX_BUTTONS,
        )
        return []

    buttons: list[OutboundButton] = []
    for binding in active_bindings:
        if not isinstance(binding, dict):
            continue
        binding_id = binding.get("id")
        # `studentId` rỗng = binding chưa gán học viên: không bao giờ đem ra cho chọn (AC-08.8).
        if not _is_positive_int(binding_id) or not _is_positive_int(binding.get("studentId")):
            continue
        title = binding.get("displayName") or binding.get("zaloUserId")
        if not isinstance(title, str) or title.strip() == "":
            continue
        if len(title) > MAX_BUTTON_TITLE_LEN:
            logger.warning("submission %s: nhãn binding quá dài — gửi tin hỏi định danh KHÔNG kèm nút", submission_id)
            return []
        buttons.append(
            OutboundButton(
                title=title,
                action="select_student",
                payload=f"{ILM_PAYLOAD_PREFIX}select_student:{binding_id}:{submission_id}",
            )
        )
    return buttons
