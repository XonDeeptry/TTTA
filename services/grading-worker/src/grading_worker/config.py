"""Env vars (infra secrets) + config:* đọc thẳng từ Redis (mục 3.3 v1.2: settings mirror
sang Redis "cho gateway/worker đọc nóng" — worker không cần round-trip qua core-api cho
từng giá trị cấu hình, chỉ dùng core-api cho các thao tác ghi/đọc dữ liệu nghiệp vụ).
"""

from __future__ import annotations

import logging
import os

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://localhost:5672")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CORE_API_BASE_URL = os.environ.get("CORE_API_BASE_URL", "http://localhost:3001")
CORE_API_INTERNAL_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/data/media")

# Env fallback cho dev (giống ENV_FALLBACKS ở zalo-gateway/src/redis.service.ts) — production
# luôn cấu hình qua dashboard, các biến GEMINI_API_KEY/OPENAI_API_KEY dưới đây chỉ dùng khi
# chưa có dashboard.
_ENV_FALLBACKS: dict[str, str | None] = {
    "llm.gemini_api_key": os.environ.get("GEMINI_API_KEY"),
    "llm.openai_api_key": os.environ.get("OPENAI_API_KEY"),
    "limits.max_clip_duration_sec": os.environ.get("MAX_CLIP_DURATION_SEC"),
}


class ConfigStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def get(self, key: str) -> str | None:
        value = await self._redis.get(f"config:{key}")
        if value is None:
            return _ENV_FALLBACKS.get(key)
        return value.decode("utf-8") if isinstance(value, bytes) else value

    async def claim_once_per_day(self, key: str) -> bool:
        """True nếu ĐÂY là lần đầu trong 24h claim được `key` (khuôn giống `claimMessage` của
        gateway: `SET ... NX EX`). Dùng để một sự kiện lặp lại chỉ sinh ra MỘT tin nhắn ra.

        Redis hỏng ⇒ trả True: thà gửi trùng một tin còn hơn im lặng nuốt mất tin onboarding
        của một học viên mới thật.
        """
        try:
            return bool(await self._redis.set(key, "1", nx=True, ex=24 * 3600))
        except Exception:  # noqa: BLE001 — hạ tầng hỏng không được chặn đường nghiệp vụ
            logger.warning("Redis lỗi khi claim %s — cho phép gửi", key)
            return True

    async def get_int(self, key: str, default: int) -> int:
        value = await self.get(key)
        if value is None or value == "":
            return default
        return int(value)

    async def get_bool(self, key: str, default: bool = False) -> bool:
        # Feature flag đọc từ config:* (mirror từ settings table, dạng chuỗi thô "true"/"false"
        # — byte-compatible với gateway, xem SettingsService). Rỗng/None → default; chỉ "true"
        # (không phân biệt hoa thường) mới là True, mọi chuỗi khác → False (fail-safe: cờ hỏng
        # coi như tắt).
        value = await self.get(key)
        if value is None or value == "":
            return default
        return value.strip().lower() == "true"
