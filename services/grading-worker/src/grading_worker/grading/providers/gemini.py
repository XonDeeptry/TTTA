"""Adapter Gemini Flash (provider mặc định, mục 3.9 điểm 5) — SDK `google-genai`
(`client.interactions.create`), xác nhận qua tài liệu trực tuyến ngày 2026-07-20 vì SDK
này thay đổi so với kiến thức huấn luyện cũ (`generate_content`). Chưa test được với API
key thật trong phiên này — chủ dự án cần cung cấp `llm.gemini_api_key` (mục 3.9) để nghiệm
thu đường gọi thật; nếu SDK đổi tham số trước lúc đó, chỉ cần sửa file này.
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
        usage = getattr(interaction, "usage", None)
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
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
        usage = getattr(interaction, "usage", None)
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
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
        usage = getattr(interaction, "usage", None)
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        return GradingResult(data=data, input_tokens=input_tokens, output_tokens=output_tokens, provider=self.name, model=model)

    def _build_audio_item(self, audio_path: str, mime_type: str) -> dict[str, Any]:
        size = os.path.getsize(audio_path)
        if size > _FILES_API_THRESHOLD_BYTES:
            uploaded = self._client.files.upload(file=audio_path)
            return {"type": "audio", "uri": uploaded.uri, "mime_type": uploaded.mime_type}
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        return {"type": "audio", "data": base64.b64encode(audio_bytes).decode("utf-8"), "mime_type": mime_type}
