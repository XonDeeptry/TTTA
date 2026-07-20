from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class GradingResult:
    data: dict[str, Any]
    input_tokens: int
    output_tokens: int
    provider: str
    model: str


class Provider(Protocol):
    name: str

    async def grade(
        self,
        system_instruction: str,
        user_instruction: str,
        audio_path: str,
        mime_type: str,
        schema: dict[str, Any],
        model: str,
        temperature: float,
    ) -> GradingResult: ...
