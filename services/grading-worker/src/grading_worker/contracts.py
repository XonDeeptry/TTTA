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
            receivedAt=data.get("receivedAt"),
        )


@dataclass
class OutboundMessage:
    zaloUserId: str
    text: str
    templateKey: Optional[str] = None
    submissionId: Optional[str] = None
    v: int = 1

    def to_dict(self) -> dict:
        payload = {"v": self.v, "zaloUserId": self.zaloUserId, "text": self.text}
        if self.templateKey is not None:
            payload["templateKey"] = self.templateKey
        if self.submissionId is not None:
            payload["submissionId"] = self.submissionId
        return payload


EXCHANGE = "ilm.direct"
DLX = "ilm.dlx"
RETRY_EXCHANGE = "ilm.retry"
Q_SUBMISSIONS = "submissions"
Q_OUTBOUND = "outbound"
MAX_RETRIES = 3
RETRY_TTL_MS = 30_000
