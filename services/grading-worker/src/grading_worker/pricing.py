"""Ước lượng chi phí cho cost_log (mục 3.4) — CHỈ để giám sát/cảnh báo ngưỡng (mục 3.12
"Notification Service... cảnh báo... là cron nhỏ"), không phải hóa đơn chính xác. Giá theo
$/1M token, cần cập nhật khi nhà cung cấp đổi bảng giá — không có API tra giá tự động.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# (input_usd_per_1m, output_usd_per_1m) — giá tham khảo, KHÔNG bảo đảm khớp hóa đơn thật.
_PRICING: dict[str, tuple[float, float]] = {
    "gemini-2.5-flash": (0.30, 2.50),
    "gpt-4o-audio-preview": (2.50, 10.00),
}


def estimate_cost_usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    rates = _PRICING.get(model)
    if rates is None:
        logger.warning("Không có bảng giá cho model '%s' (provider %s) — est_usd=0", model, provider)
        return 0.0
    input_rate, output_rate = rates
    return round((input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate, 6)
