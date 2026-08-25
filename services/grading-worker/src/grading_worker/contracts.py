"""Mirror of services/zalo-gateway/src/contracts.ts (also duplicated in core-api) — PHẢI
giữ đúng cùng shape. Ba bản sao (gateway TS, core-api TS, worker Python) vì monorepo không
có cơ chế chia sẻ package giữa hai ngôn ngữ.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

SubmissionKind = Literal["audio", "video", "text", "image", "file", "follow"]


@dataclass
class SubmissionMessage:
    v: int
    messageId: str
    eventName: str
    kind: SubmissionKind
    zaloUserId: str
    text: Optional[str] = None
    mediaUrl: Optional[str] = None
    # Test Upload only (core-api `test-upload/` module): file đã nằm sẵn dưới MEDIA_ROOT,
    # bỏ qua bước tải Zalo; testMode ép autoSend=false vì binding test là giả.
    mediaPath: Optional[str] = None
    testMode: bool = False
    receivedAt: Optional[str] = None

    @staticmethod
    def from_dict(data: dict) -> "SubmissionMessage":
        return SubmissionMessage(
            v=data["v"],
            messageId=data["messageId"],
            eventName=data["eventName"],
            kind=data["kind"],
            zaloUserId=data["zaloUserId"],
            text=data.get("text"),
            mediaUrl=data.get("mediaUrl"),
            mediaPath=data.get("mediaPath"),
            testMode=bool(data.get("testMode", False)),
            receivedAt=data.get("receivedAt"),
        )


# F11: tập hành động nút bấm — TẬP ĐÓNG. Thêm giá trị mới phải sửa cả BA bản contracts
# và nhánh xử lý trong pipeline.py, nếu không tin nhắn sẽ rơi xuống flag.
ButtonAction = Literal["ack", "request_advisor", "select_student"]


@dataclass
class OutboundButton:
    # title: nhãn học viên nhìn thấy (Zalo giới hạn 100 ký tự)
    # payload: chuỗi quay lại NGUYÊN VĂN qua `user_send_text` (giới hạn 1.000 ký tự),
    # luôn có dạng `#ilm:<action>:<arg>[:<arg>]`, mọi arg chỉ gồm chữ số.
    title: str
    action: ButtonAction
    payload: str

    def to_dict(self) -> dict:
        return {"title": self.title, "action": self.action, "payload": self.payload}


@dataclass
class OutboundMessage:
    zaloUserId: str
    text: str
    templateKey: Optional[str] = None
    submissionId: Optional[str] = None
    # F11: vắng mặt hoặc rỗng = tin text thuần đúng như trước F11.
    buttons: Optional[list[OutboundButton]] = None
    v: int = 1

    def to_dict(self) -> dict:
        payload = {"v": self.v, "zaloUserId": self.zaloUserId, "text": self.text}
        if self.templateKey is not None:
            payload["templateKey"] = self.templateKey
        if self.submissionId is not None:
            payload["submissionId"] = self.submissionId
        if self.buttons:  # rỗng/None => KHÔNG có khóa `buttons` trên wire
            payload["buttons"] = [b.to_dict() for b in self.buttons]
        return payload


ILM_PAYLOAD_PREFIX = "#ilm:"
BUTTON_ACTIONS = ("ack", "request_advisor", "select_student")
MAX_BUTTONS = 5
MAX_BUTTON_TITLE_LEN = 100
MAX_BUTTON_PAYLOAD_LEN = 1000
MAX_OUTBOUND_TEXT_LEN = 2000

EXCHANGE = "ilm.direct"
DLX = "ilm.dlx"
RETRY_EXCHANGE = "ilm.retry"
Q_SUBMISSIONS = "submissions"
Q_OUTBOUND = "outbound"
MAX_RETRIES = 3
RETRY_TTL_MS = 30_000
