"""Adapter Gemini Flash (provider mặc định, mục 3.9 điểm 5) — SDK `google-genai`
(`client.interactions.create`), xác nhận qua tài liệu trực tuyến ngày 2026-07-20 vì SDK
này thay đổi so với kiến thức huấn luyện cũ (`generate_content`).

ĐÃ NGHIỆM THU VỚI API KEY THẬT ngày 2026-08-25 (chấm 2 clip mẫu, HTTP 200, JSON đúng schema).
Hai điểm phải sửa lúc chạy thật, cả hai đều không thể phát hiện bằng test mock:
  1. Model mặc định `gemini-2.5-flash` đã ngừng cấp cho người dùng mới (404) — xem `factory.py`.
  2. `interaction.usage` dùng `total_input_tokens`/`total_output_tokens`/`total_thought_tokens`,
     không phải `input_tokens`/`output_tokens` — xem `_usage_tokens()` bên dưới.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
from typing import Any

from google import genai

from .base import GradingResult, TranscriptResult

_FILES_API_THRESHOLD_BYTES = 20 * 1024 * 1024


def _usage_tokens(interaction: Any) -> tuple[int, int]:
    """Bóc số token đã dùng từ một `Interaction` của SDK `google-genai`.

    Xác minh bằng lời gọi THẬT ngày 2026-08-25: `interaction.usage` là một pydantic `Usage` với
    `total_input_tokens` / `total_output_tokens` / `total_thought_tokens` — KHÔNG phải
    `input_tokens` / `output_tokens` như bản đầu giả định. Vì bản cũ đọc bằng
    `getattr(usage, "input_tokens", 0) or 0` nên mọi lần chấm đều ghi 0 token, kéo theo
    `est_usd = 0` — cảnh báo ngưỡng chi phí (mục 3.12) sẽ không bao giờ kêu. Vẫn giữ tên cũ làm
    phương án dự phòng phòng khi SDK đổi lại.

    `total_thought_tokens` (token "suy nghĩ" của model) được CỘNG VÀO output: đó là token do model
    sinh ra và bị tính tiền theo giá output. Một lời gọi tầm thường đã tốn 66 thought token, nên bỏ
    qua sẽ báo thiếu chi phí đáng kể — với một tính năng dùng để CẢNH BÁO chi phí thì báo thiếu
    nguy hiểm hơn báo thừa.
    """
    usage = getattr(interaction, "usage", None)
    if usage is None:
        return 0, 0

    def _pick(*names: str) -> int:
        for n in names:
            v = getattr(usage, n, None)
            if isinstance(v, int):
                return v
        return 0

    input_tokens = _pick("total_input_tokens", "input_tokens")
    output_tokens = _pick("total_output_tokens", "output_tokens") + _pick("total_thought_tokens")
    return input_tokens, output_tokens


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

    async def grade(
        self,
        system_instruction: str,
        user_instruction: str,
        audio_path: str,
        mime_type: str,
        schema: dict[str, Any],
        model: str,
        temperature: float,
    ) -> GradingResult:
        audio_item = await asyncio.to_thread(self._build_audio_item, audio_path, mime_type)

        def _call():
            return self._client.interactions.create(
                model=model,
                system_instruction=system_instruction,
                input=[{"type": "text", "text": user_instruction}, audio_item],
                response_format={"type": "text", "mime_type": "application/json", "schema": schema},
                generation_config={"temperature": temperature},
            )

        interaction = await asyncio.to_thread(_call)
        data = json.loads(interaction.output_text)
        input_tokens, output_tokens = _usage_tokens(interaction)
        return GradingResult(data=data, input_tokens=input_tokens, output_tokens=output_tokens, provider=self.name, model=model)

    async def transcribe(
        self,
        audio_path: str,
        mime_type: str,
        model: str,
    ) -> TranscriptResult:
        # Pilot A/B nhánh text: gửi cùng audio.mp3 nhưng chỉ xin transcript thuần (không
        # response_format JSON) — cùng đường gọi SDK `interactions.create` như grade().
        audio_item = await asyncio.to_thread(self._build_audio_item, audio_path, mime_type)

        def _call():
            return self._client.interactions.create(
                model=model,
                system_instruction="Bạn là công cụ chép lời (transcription). Chép chính xác toàn bộ lời nói trong audio thành văn bản, không dịch, không nhận xét, không thêm chú thích.",
                input=[{"type": "text", "text": "Chép lại toàn bộ nội dung nói trong file audio đính kèm."}, audio_item],
                response_format={"type": "text"},
            )

        interaction = await asyncio.to_thread(_call)
        text = interaction.output_text
        input_tokens, output_tokens = _usage_tokens(interaction)
        return TranscriptResult(text=text, input_tokens=input_tokens, output_tokens=output_tokens, provider=self.name, model=model)

    async def grade_text(
        self,
        system_instruction: str,
        user_instruction: str,
        transcript: str,
        schema: dict[str, Any],
        model: str,
        temperature: float,
    ) -> GradingResult:
        # Chấm dựa trên transcript (KHÔNG có audio content part) — cùng ràng buộc schema JSON
        # như grade(), chỉ khác input là văn bản.
        def _call():
            return self._client.interactions.create(
                model=model,
                system_instruction=system_instruction,
                input=[{"type": "text", "text": f"{user_instruction}\n\nTRANSCRIPT:\n{transcript}"}],
                response_format={"type": "text", "mime_type": "application/json", "schema": schema},
                generation_config={"temperature": temperature},
            )

        interaction = await asyncio.to_thread(_call)
        data = json.loads(interaction.output_text)
        input_tokens, output_tokens = _usage_tokens(interaction)
        return GradingResult(data=data, input_tokens=input_tokens, output_tokens=output_tokens, provider=self.name, model=model)

    def _build_audio_item(self, audio_path: str, mime_type: str) -> dict[str, Any]:
        size = os.path.getsize(audio_path)
        if size > _FILES_API_THRESHOLD_BYTES:
            uploaded = self._client.files.upload(file=audio_path)
            return {"type": "audio", "uri": uploaded.uri, "mime_type": uploaded.mime_type}
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        return {"type": "audio", "data": base64.b64encode(audio_bytes).decode("utf-8"), "mime_type": mime_type}
