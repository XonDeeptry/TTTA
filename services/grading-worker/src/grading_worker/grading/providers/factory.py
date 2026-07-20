"""Chọn provider theo courses.llm_config + tự chuyển sang provider dự phòng khi provider
chính lỗi (mục 3.9 điểm 5). Không giữ lỗi im lặng: nếu cả hai đều lỗi, ném lại lỗi của
provider dự phòng để pipeline coi là thất bại toàn bộ (→ retry/DLQ qua RabbitMQ).
"""

from __future__ import annotations

import logging
from typing import Any

from ...config import ConfigStore
from .base import GradingResult, Provider
from .gemini import GeminiProvider
from .openai_provider import OpenAiProvider

logger = logging.getLogger(__name__)

_OTHER = {"gemini": "openai", "openai": "gemini"}


async def _build_provider(name: str, config: ConfigStore) -> Provider | None:
    if name == "gemini":
        api_key = await config.get("llm.gemini_api_key")
        return GeminiProvider(api_key) if api_key else None
    if name == "openai":
        api_key = await config.get("llm.openai_api_key")
        return OpenAiProvider(api_key) if api_key else None
    raise ValueError(f"Unknown LLM provider: {name}")


async def grade_with_fallback(
    llm_config: dict[str, Any],
    config: ConfigStore,
    **grade_kwargs: Any,
) -> GradingResult:
    primary_name = llm_config.get("provider", "gemini")
    primary = await _build_provider(primary_name, config)
    if primary is None:
        raise RuntimeError(f"Provider '{primary_name}' chưa có API key trong settings — chưa cấu hình qua dashboard")

    model = llm_config.get("model") or ("gemini-2.5-flash" if primary_name == "gemini" else "gpt-4o-audio-preview")
    temperature = llm_config.get("temperature", 0.3)

    try:
        return await primary.grade(model=model, temperature=temperature, **grade_kwargs)
    except Exception as primary_err:  # noqa: BLE001 - cố ý bắt rộng để thử fallback provider
        fallback_name = _OTHER[primary_name]
        fallback = await _build_provider(fallback_name, config)
        if fallback is None:
            logger.error("Provider chính '%s' lỗi và không có provider dự phòng: %s", primary_name, primary_err)
            raise
        logger.warning("Provider chính '%s' lỗi (%s) — thử provider dự phòng '%s'", primary_name, primary_err, fallback_name)
        fallback_model = "gemini-2.5-flash" if fallback_name == "gemini" else "gpt-4o-audio-preview"
        return await fallback.grade(model=fallback_model, temperature=temperature, **grade_kwargs)
