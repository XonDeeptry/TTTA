"""Adapter OpenAI GPT-4o-audio (dự phòng, mục 3.9 điểm 5) — Chat Completions API với
content part `input_audio` (đã ổn định từ trước, không cần xác minh lại như Gemini).
Không bật `strict` cho response_format.json_schema vì cùng một schema (grading/schema.py)
còn phải dùng chung với Gemini — strict mode của OpenAI đòi thêm ràng buộc
(additionalProperties:false đệ quy) không cần thiết ở đây, schema đã đủ chặt để validate
lại bằng jsonschema sau khi nhận kết quả.
"""

from __future__ import annotations

import base64
import json
from typing import Any

from openai import AsyncOpenAI

from .base import GradingResult


class OpenAiProvider:
    name = "openai"

    def __init__(self, api_key: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)

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
        audio_format = "wav" if mime_type == "audio/wav" else "mp3"
        with open(audio_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")

        response = await self._client.chat.completions.create(
            model=model,
            modalities=["text"],
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_instruction},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_instruction},
                        {"type": "input_audio", "input_audio": {"data": audio_b64, "format": audio_format}},
                    ],
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "grading_result", "schema": schema},
            },
        )

        data = json.loads(response.choices[0].message.content)
        usage = response.usage
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        return GradingResult(data=data, input_tokens=input_tokens, output_tokens=output_tokens, provider=self.name, model=model)
