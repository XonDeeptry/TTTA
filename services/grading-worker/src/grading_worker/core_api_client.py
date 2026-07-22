"""Wrapper mỏng quanh các route /internal/* của core-api (mục 3.6, M2 + bổ sung M3).
Mọi ghi/đọc dữ liệu nghiệp vụ đi qua đây — worker không bao giờ connect thẳng Postgres.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from .config import CORE_API_BASE_URL, CORE_API_INTERNAL_TOKEN


class CoreApiClient:
    def __init__(self, base_url: str = CORE_API_BASE_URL, token: str = CORE_API_INTERNAL_TOKEN) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"x-internal-token": token, "Content-Type": "application/json"},
            timeout=30.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_bindings(self, zalo_user_id: str) -> list[dict[str, Any]]:
        res = await self._client.get(f"/internal/bindings/{zalo_user_id}")
        res.raise_for_status()
        return res.json()

    async def ensure_binding(self, zalo_user_id: str, display_name: Optional[str] = None) -> list[dict[str, Any]]:
        """POST /internal/bindings/ensure (onboarding.controller.ts, M2) — upsert-if-absent."""
        res = await self._client.post(
            "/internal/bindings/ensure", json={"zaloUserId": zalo_user_id, "displayName": display_name}
        )
        res.raise_for_status()
        return res.json()

    async def get_criteria(self, course_id: int) -> Optional[dict[str, Any]]:
        res = await self._client.get(f"/internal/criteria/{course_id}")
        if res.status_code == 404:
            return None
        res.raise_for_status()
        return res.json()

    async def get_student(self, student_id: int) -> Optional[dict[str, Any]]:
        res = await self._client.get(f"/internal/students/{student_id}")
        if res.status_code == 404:
            return None
        res.raise_for_status()
        return res.json()

    async def upsert_submission(self, payload: dict[str, Any]) -> dict[str, Any]:
        res = await self._client.post("/internal/submissions", json=payload)
        res.raise_for_status()
        return res.json()

    async def update_submission(self, submission_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        res = await self._client.patch(f"/internal/submissions/{submission_id}", json=payload)
        res.raise_for_status()
        return res.json()

    async def create_grading(self, payload: dict[str, Any]) -> dict[str, Any]:
        res = await self._client.post("/internal/gradings", json=payload)
        res.raise_for_status()
        return res.json()

    async def create_cost_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        # payload đi thẳng qua — hỗ trợ field tùy chọn `callType` (audio_grade/transcription/text_grade)
        # cho pilot A/B mà không cần đổi chữ ký.
        res = await self._client.post("/internal/cost-log", json=payload)
        res.raise_for_status()
        return res.json()

    async def create_pilot_text_grading(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /internal/pilot-text-gradings (pilot A/B, mục pilot) — lưu bản chấm nhánh text
        song song để đối chiếu; KHÔNG bao giờ gửi cho học viên."""
        res = await self._client.post("/internal/pilot-text-gradings", json=payload)
        res.raise_for_status()
        return res.json()

    async def create_flag(self, submission_id: int, reason: str) -> dict[str, Any]:
        res = await self._client.post("/internal/flags", json={"submissionId": submission_id, "reason": reason})
        res.raise_for_status()
        return res.json()
