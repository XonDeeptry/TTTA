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


# Chốt chặn CUỐI CÙNG khi cả `courses.llm_config.model` lẫn setting `llm.<provider>_model` đều
# trống. Không phải "model chuẩn" — chỉ là giá trị để hệ thống chạy được khi chưa ai cấu hình.
#
# Bài học 2026-08-25: hằng số cũ `gemini-2.5-flash` bị Google ngừng cấp cho người dùng mới, mọi
# lượt chấm trả 404, và vì tên model nằm trong code nên phải sửa + deploy lại mới chấm được. Giờ
# đổi được từ dashboard (Cấu hình -> LLM -> Model Gemini/OpenAI), không cần deploy.
_FALLBACK_MODEL = {"gemini": "gemini-3.6-flash", "openai": "gpt-4o-audio-preview"}
DEFAULT_TEMPERATURE = 0.3


async def _resolve_model(provider_name: str, config: ConfigStore) -> str:
    """Thứ tự ưu tiên: `courses.llm_config.model` (bên gọi lo) -> setting `llm.<provider>_model`
    -> hằng số dự phòng. Người vận hành đổi model cho từng provider ngay trên dashboard."""
    configured = await config.get(f"llm.{provider_name}_model")
    # Chỉ nhận `str` đúng như hợp đồng `ConfigStore.get() -> str | None`. Bắt kiểu ở đây có chủ ý:
    # tin tưởng kiểu trả về là đúng cách lỗi token usage đã trốn được (xem `gemini._usage_tokens`).
    if isinstance(configured, str) and configured.strip():
        return configured.strip()
    return _FALLBACK_MODEL.get(provider_name, _FALLBACK_MODEL["gemini"])


async def _resolve_temperature(llm_config: dict[str, Any], config: ConfigStore) -> float:
    """`courses.llm_config.temperature` -> setting `llm.temperature` -> 0.3.

    Đưa ra cấu hình được vì chấm thử 2026-08-25 cho thấy cùng một clip lệch tới 2 band giữa hai
    lần chấm ở mức 0.3 — hạ về 0 là núm vặn đầu tiên khi cần điểm ổn định hơn."""
    per_course = llm_config.get("temperature")
    if isinstance(per_course, (int, float)) and not isinstance(per_course, bool):
        return float(per_course)

    raw = await config.get("llm.temperature")
    # Chỉ nhận `str` — xem ghi chú kiểu ở `_resolve_model`. `float()` trên một object lạ có thể
    # ÂM THẦM ra một số (ví dụ 1.0), tức là chấm bài ở nhiệt độ không ai chọn.
    if not isinstance(raw, str) or not raw.strip():
        return DEFAULT_TEMPERATURE
    try:
        return float(raw)
    except ValueError:
        logger.warning("llm.temperature không phải số ('%s') — dùng mặc định %s", raw, DEFAULT_TEMPERATURE)
        return DEFAULT_TEMPERATURE


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

    model = llm_config.get("model") or await _resolve_model(primary_name, config)
    temperature = await _resolve_temperature(llm_config, config)

    try:
        return await primary.grade(model=model, temperature=temperature, **grade_kwargs)
    except Exception as primary_err:  # noqa: BLE001 - cố ý bắt rộng để thử fallback provider
        fallback_name = _OTHER[primary_name]
        fallback = await _build_provider(fallback_name, config)
        if fallback is None:
            logger.error("Provider chính '%s' lỗi và không có provider dự phòng: %s", primary_name, primary_err)
            raise
        logger.warning("Provider chính '%s' lỗi (%s) — thử provider dự phòng '%s'", primary_name, primary_err, fallback_name)
        return await fallback.grade(model=await _resolve_model(fallback_name, config), temperature=temperature, **grade_kwargs)


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

    model = llm_config.get("model") or await _resolve_model(primary_name, config)

    try:
        return await primary.transcribe(audio_path=audio_path, mime_type=mime_type, model=model)
    except Exception as primary_err:  # noqa: BLE001 - cố ý bắt rộng để thử fallback provider
        fallback_name = _OTHER[primary_name]
        fallback = await _build_provider(fallback_name, config)
        if fallback is None:
            logger.error("Provider chính '%s' lỗi (transcribe) và không có provider dự phòng: %s", primary_name, primary_err)
            raise
        logger.warning("Provider chính '%s' lỗi transcribe (%s) — thử provider dự phòng '%s'", primary_name, primary_err, fallback_name)
        return await fallback.transcribe(audio_path=audio_path, mime_type=mime_type, model=await _resolve_model(fallback_name, config))


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

    model = llm_config.get("model") or await _resolve_model(primary_name, config)
    temperature = await _resolve_temperature(llm_config, config)

    try:
        return await primary.grade_text(model=model, temperature=temperature, **grade_kwargs)
    except Exception as primary_err:  # noqa: BLE001 - cố ý bắt rộng để thử fallback provider
        fallback_name = _OTHER[primary_name]
        fallback = await _build_provider(fallback_name, config)
        if fallback is None:
            logger.error("Provider chính '%s' lỗi (grade_text) và không có provider dự phòng: %s", primary_name, primary_err)
            raise
        logger.warning("Provider chính '%s' lỗi grade_text (%s) — thử provider dự phòng '%s'", primary_name, primary_err, fallback_name)
        return await fallback.grade_text(model=await _resolve_model(fallback_name, config), temperature=temperature, **grade_kwargs)
