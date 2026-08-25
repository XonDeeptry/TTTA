# -*- coding: utf-8 -*-
"""Chọn model / nhiệt độ / bảng giá LLM từ dashboard thay vì hardcode.

Lý do có nhóm test này: ngày 2026-08-25 `gemini-2.5-flash` bị Google ngừng cấp cho người dùng mới,
mọi lượt chấm trả 404, và vì tên model nằm trong code nên phải sửa + deploy lại mới chấm được.
Giờ ba thứ đó đọc từ settings (`llm.gemini_model`, `llm.openai_model`, `llm.temperature`,
`llm.pricing_json`) nên đổi được ngay trên dashboard.
"""

from unittest.mock import AsyncMock

import pytest

from grading_worker.grading.providers.factory import (
    DEFAULT_TEMPERATURE,
    _resolve_model,
    _resolve_temperature,
)
from grading_worker.pricing import estimate_cost_usd, parse_pricing_overrides


def _config(**values):
    """ConfigStore giả: `get(key)` trả giá trị đã khai, còn lại None."""
    cfg = AsyncMock()
    cfg.get = AsyncMock(side_effect=lambda key: values.get(key))
    return cfg


# ─── model ───────────────────────────────────────────────────────────────────────────────────

async def test_model_comes_from_settings():
    cfg = _config(**{"llm.gemini_model": "gemini-3.6-pro"})
    assert await _resolve_model("gemini", cfg) == "gemini-3.6-pro"


async def test_each_provider_has_its_own_model_setting():
    cfg = _config(**{"llm.gemini_model": "gemini-x", "llm.openai_model": "gpt-y"})
    assert await _resolve_model("gemini", cfg) == "gemini-x"
    assert await _resolve_model("openai", cfg) == "gpt-y"


async def test_unset_model_falls_back_to_the_builtin_constant():
    cfg = _config()
    assert await _resolve_model("gemini", cfg) == "gemini-3.6-flash"
    assert await _resolve_model("openai", cfg) == "gpt-4o-audio-preview"


@pytest.mark.parametrize("blank", ["", "   ", None])
async def test_blank_model_setting_is_treated_as_unset(blank):
    cfg = _config(**{"llm.gemini_model": blank})
    assert await _resolve_model("gemini", cfg) == "gemini-3.6-flash"


async def test_model_setting_is_trimmed():
    cfg = _config(**{"llm.gemini_model": "  gemini-3.6-flash  "})
    assert await _resolve_model("gemini", cfg) == "gemini-3.6-flash"


async def test_non_string_config_value_never_becomes_the_model():
    """`ConfigStore.get` hứa trả `str | None`. Nếu có gì khác lọt vào (mock, kiểu lạ) thì phải rơi
    về hằng số dự phòng chứ KHÔNG được biến thành tên model vô nghĩa."""
    cfg = AsyncMock()  # `get()` trả AsyncMock, không phải str
    assert await _resolve_model("gemini", cfg) == "gemini-3.6-flash"


# ─── temperature ─────────────────────────────────────────────────────────────────────────────

async def test_temperature_prefers_the_course_over_the_setting():
    cfg = _config(**{"llm.temperature": "0.9"})
    assert await _resolve_temperature({"temperature": 0.1}, cfg) == 0.1


async def test_temperature_falls_back_to_the_setting():
    cfg = _config(**{"llm.temperature": "0"})
    assert await _resolve_temperature({}, cfg) == 0.0


async def test_temperature_defaults_when_nothing_is_configured():
    assert await _resolve_temperature({}, _config()) == DEFAULT_TEMPERATURE


async def test_garbage_temperature_setting_does_not_break_grading():
    cfg = _config(**{"llm.temperature": "khá nóng"})
    assert await _resolve_temperature({}, cfg) == DEFAULT_TEMPERATURE


async def test_non_string_temperature_setting_does_not_silently_become_a_number():
    """`float()` trên object lạ có thể ÂM THẦM ra 1.0 — tức là chấm ở nhiệt độ không ai chọn."""
    assert await _resolve_temperature({}, AsyncMock()) == DEFAULT_TEMPERATURE


# ─── bảng giá ────────────────────────────────────────────────────────────────────────────────

def test_pricing_override_makes_a_new_model_cost_something():
    """Chọn được model từ UI mà bảng giá hardcode thì `est_usd` luôn 0 và cảnh báo ngưỡng chi phí
    (mục 3.12) im lặng — đây chính là lỗ hổng mà override bịt lại."""
    assert estimate_cost_usd("gemini", "model-moi", 1_000_000, 1_000_000) == 0.0
    overrides = parse_pricing_overrides('{"model-moi": [1.0, 2.0]}')
    assert estimate_cost_usd("gemini", "model-moi", 1_000_000, 1_000_000, overrides) == 3.0


def test_override_beats_the_builtin_table():
    overrides = parse_pricing_overrides('{"gemini-2.5-flash": [1.0, 1.0]}')
    assert estimate_cost_usd("gemini", "gemini-2.5-flash", 1_000_000, 0, overrides) == 1.0
    assert estimate_cost_usd("gemini", "gemini-2.5-flash", 1_000_000, 0) == 0.30


@pytest.mark.parametrize("bad", ["", "   ", None, "khong-phai-json", "[1,2]", '"chuoi"', "123"])
def test_bad_pricing_json_is_ignored_not_fatal(bad):
    """Cấu hình hỏng KHÔNG được làm vỡ một lượt chấm đã tốn tiền gọi LLM."""
    assert parse_pricing_overrides(bad) == {}


def test_bad_entries_are_skipped_but_good_ones_survive():
    overrides = parse_pricing_overrides('{"ok": [1, 2], "thieu": [3], "chu": ["a","b"], "null": null}')
    assert overrides == {"ok": (1.0, 2.0)}


def test_non_string_pricing_config_is_ignored():
    assert parse_pricing_overrides(AsyncMock()) == {}
