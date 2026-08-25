"""Ước lượng chi phí cho cost_log (mục 3.4) — CHỈ để giám sát/cảnh báo ngưỡng (mục 3.12
"Notification Service... cảnh báo... là cron nhỏ"), không phải hóa đơn chính xác. Giá theo
$/1M token, cần cập nhật khi nhà cung cấp đổi bảng giá — không có API tra giá tự động.
"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

# (input_usd_per_1m, output_usd_per_1m) — giá tham khảo, KHÔNG bảo đảm khớp hóa đơn thật.
_PRICING: dict[str, tuple[float, float]] = {
    "gemini-2.5-flash": (0.30, 2.50),
    "gpt-4o-audio-preview": (2.50, 10.00),
}


def parse_pricing_overrides(raw: str | None) -> dict[str, tuple[float, float]]:
    """Đọc setting `llm.pricing_json` — {"<model>": [usd_input_1M, usd_output_1M]}.

    Từ khi model chọn được từ dashboard, bảng giá hardcode dưới đây không thể theo kịp: chọn một
    model chưa có trong bảng thì `est_usd` về 0 và cảnh báo ngưỡng chi phí (mục 3.12) im lặng.
    Đây là chỗ điền đơn giá thật mà không cần sửa code.

    JSON hỏng KHÔNG được làm vỡ lượt chấm — chỉ log cảnh báo rồi dùng bảng mặc định.
    """
    # Chỉ nhận `str` đúng hợp đồng `ConfigStore.get() -> str | None` (xem ghi chú kiểu ở factory).
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError) as err:
        logger.warning("llm.pricing_json không phải JSON hợp lệ (%s) — bỏ qua", err)
        return {}
    if not isinstance(data, dict):
        logger.warning("llm.pricing_json phải là object {model: [in, out]} — bỏ qua")
        return {}

    out: dict[str, tuple[float, float]] = {}
    for model, rates in data.items():
        try:
            in_rate, out_rate = rates  # type: ignore[misc]
            out[str(model)] = (float(in_rate), float(out_rate))
        except (TypeError, ValueError):
            logger.warning("llm.pricing_json: bỏ qua '%s' — cần đúng dạng [in, out] bằng số", model)
    return out


def estimate_cost_usd(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    overrides: dict[str, tuple[float, float]] | None = None,
) -> float:
    # `overrides` (từ `llm.pricing_json`) ĐÈ LÊN bảng mặc định: người vận hành sửa được giá khi nhà
    # cung cấp đổi bảng giá, không phải chờ deploy.
    rates = (overrides or {}).get(model) or _PRICING.get(model)
    if rates is None:
        logger.warning(
            "Không có bảng giá cho model '%s' (provider %s) — est_usd=0. Điền đơn giá ở "
            "Cấu hình -> LLM -> llm.pricing_json để cảnh báo chi phí hoạt động đúng.",
            model,
            provider,
        )
        return 0.0
    input_rate, output_rate = rates
    return round((input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate, 6)
