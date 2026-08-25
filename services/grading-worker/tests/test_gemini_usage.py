# -*- coding: utf-8 -*-
"""Bóc token usage của SDK `google-genai` — hồi quy cho lỗi phát hiện lúc chấm clip THẬT.

Bản đầu đọc `usage.input_tokens` / `usage.output_tokens`. Object `Usage` thật (xác minh bằng lời
gọi thật ngày 2026-08-25) lại dùng `total_input_tokens` / `total_output_tokens` /
`total_thought_tokens`, nên `getattr(..., 0) or 0` luôn trả 0 — mọi `cost_log` ghi 0 token và
`est_usd = 0`. Cảnh báo ngưỡng chi phí (mục 3.12) vì thế sẽ không bao giờ kêu, mà không có dấu
hiệu gì: không exception, không log lỗi.

Không mock được lỗi này bằng cách giả `Provider` — phải giả đúng HÌNH DẠNG object của SDK.
"""

from types import SimpleNamespace

from grading_worker.grading.providers.gemini import _usage_tokens


def _interaction(**usage_fields):
    return SimpleNamespace(usage=SimpleNamespace(**usage_fields))


def test_reads_the_real_sdk_field_names():
    """Đúng hình dạng đã dump từ API thật."""
    it = _interaction(
        total_input_tokens=3,
        total_output_tokens=1,
        total_thought_tokens=66,
        total_tokens=70,
        total_cached_tokens=0,
    )
    assert _usage_tokens(it) == (3, 67)  # thought token tính vào output


def test_thought_tokens_are_billed_as_output():
    """Bỏ qua `total_thought_tokens` sẽ báo THIẾU chi phí — nguy hiểm hơn báo thừa cho một
    tính năng dùng để cảnh báo ngưỡng."""
    it = _interaction(total_input_tokens=1000, total_output_tokens=200, total_thought_tokens=800)
    _, out = _usage_tokens(it)
    assert out == 1000, "thought token phải được cộng vào output"


def test_falls_back_to_legacy_field_names():
    """Nếu SDK quay lại tên cũ thì vẫn đọc được, không âm thầm về 0."""
    it = _interaction(input_tokens=11, output_tokens=22)
    assert _usage_tokens(it) == (11, 22)


def test_missing_usage_is_zero_not_a_crash():
    assert _usage_tokens(SimpleNamespace(usage=None)) == (0, 0)
    assert _usage_tokens(SimpleNamespace()) == (0, 0)


def test_non_integer_fields_are_ignored():
    """`Usage` thật có cả field dạng list (`input_tokens_by_modality`) — không được để lọt
    vào phép cộng và làm vỡ."""
    it = _interaction(
        total_input_tokens=5,
        total_output_tokens=None,
        total_thought_tokens=7,
        input_tokens_by_modality=[{"modality": "text", "tokens": 5}],
    )
    assert _usage_tokens(it) == (5, 7)


def test_the_pre_fix_reading_would_have_returned_zero():
    """Ghim đúng nguyên nhân: đọc bằng tên cũ trên object THẬT cho ra 0 — đó là lý do
    `est_usd` luôn bằng 0 mà không ai thấy."""
    real_shape = _interaction(
        total_input_tokens=3, total_output_tokens=1, total_thought_tokens=66
    )
    legacy_input = getattr(real_shape.usage, "input_tokens", 0) or 0
    legacy_output = getattr(real_shape.usage, "output_tokens", 0) or 0
    assert (legacy_input, legacy_output) == (0, 0)
    assert _usage_tokens(real_shape) != (0, 0)
