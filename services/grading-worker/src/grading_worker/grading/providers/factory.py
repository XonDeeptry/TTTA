"""Chọn provider theo courses.llm_config + tự chuyển sang provider dự phòng khi provider
chính lỗi (mục 3.9 điểm 5). Không giữ lỗi im lặng: nếu cả hai đều lỗi, ném lại lỗi của
provider dự phòng để pipeline coi là thất bại toàn bộ (→ retry/DLQ qua RabbitMQ).
"""

from __future__ import annotations

import logging
from typing import Any

from ...config import ConfigStore
from .base import GradingResult, Provider, TranscriptResult
from .gemini import GeminiProvider
from .openai_provider import OpenAiProvider

logger = logging.getLogger(__name__)

_OTHER = {"gemini": "openai", "openai": "gemini"}


def _default_model(provider_name: str) -> str:
    return "gemini-2.5-flash" if provider_name == "gemini" else "gpt-4o-audio-preview"


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

    model = llm_config.get("model") or _default_model(primary_name)
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
        return await fallback.grade(model=_default_model(fallback_name), temperature=temperature, **grade_kwargs)


async def transcribe_with_fallback(
    llm_config: dict[str, Any],
    config: ConfigStore,
    *,
    audio_path: str,
    mime_type: str,
) -> TranscriptResult:
    """Pilot A/B: chép lời audio để chấm nhánh text — cùng cơ chế chọn provider + dự phòng
    như grade_with_fallback (không có temperature/schema vì chỉ xin transcript thuần)."""
    primary_name = llm_config.get("provider", "gemini")
    primary = await _build_provider(primary_name, config)
    if primary is None:
        raise RuntimeError(f"Provider '{primary_name}' chưa có API key trong settings — chưa cấu hình qua dashboard")

    model = llm_config.get("model") or _default_model(primary_name)

    try:
        return await primary.transcribe(audio_path=audio_path, mime_type=mime_type, model=model)
    except Exception as primary_err:  # noqa: BLE001 - cố ý bắt rộng để thử fallback provider
        fallback_name = _OTHER[primary_name]
        fallback = await _build_provider(fallback_name, config)
        if fallback is None:
            logger.error("Provider chính '%s' lỗi (transcribe) và không có provider dự phòng: %s", primary_name, primary_err)
            raise
        logger.warning("Provider chính '%s' lỗi transcribe (%s) — thử provider dự phòng '%s'", primary_name, primary_err, fallback_name)
        return await fallback.transcribe(audio_path=audio_path, mime_type=mime_type, model=_default_model(fallback_name))


async def grade_text_with_fallback(
    llm_config: dict[str, Any],
    config: ConfigStore,
    **grade_kwargs: Any,
) -> GradingResult:
    """Pilot A/B: chấm dựa trên transcript — cùng cơ chế chọn provider + dự phòng như
    grade_with_fallback, chỉ gọi grade_text() thay cho grade()."""
    primary_name = llm_config.get("provider", "gemini")
    primary = await _build_provider(primary_name, config)
    if primary is None:
        raise RuntimeError(f"Provider '{primary_name}' chưa có API key trong settings — chưa cấu hình qua dashboard")

    model = llm_config.get("model") or _default_model(primary_name)
    temperature = llm_config.get("temperature", 0.3)

    try:
        return await primary.grade_text(model=model, temperature=temperature, **grade_kwargs)
    except Exception as primary_err:  # noqa: BLE001 - cố ý bắt rộng để thử fallback provider
        fallback_name = _OTHER[primary_name]
        fallback = await _build_provider(fallback_name, config)
        if fallback is None:
            logger.error("Provider chính '%s' lỗi (grade_text) và không có provider dự phòng: %s", primary_name, primary_err)
            raise
        logger.warning("Provider chính '%s' lỗi grade_text (%s) — thử provider dự phòng '%s'", primary_name, primary_err, fallback_name)
        return await fallback.grade_text(model=_default_model(fallback_name), temperature=temperature, **grade_kwargs)
