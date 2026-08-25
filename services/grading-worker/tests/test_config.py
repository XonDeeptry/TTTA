from unittest.mock import AsyncMock

import pytest

# `get_bool` giờ KHÔNG còn caller nào trong src (khóa `limits.pilot_dual_grading` đã bị gỡ
# cùng nhánh chấm-từ-transcript, 2026-08-25). Giữ lại vì nó là accessor dùng chung của
# ConfigStore, song song với get()/get_int(). Test dùng tên khóa TRUNG TÍNH để không ngụ ý
# worker đang đọc một setting boolean nào đó.
from grading_worker.config import ConfigStore


def _store(raw_value):
    redis = AsyncMock()
    redis.get.return_value = raw_value
    return ConfigStore(redis)


# ---- ConfigStore.get_bool (AC-04.x) ----


async def test_get_bool_true_lowercase():
    assert await _store(b"true").get_bool("any.boolean_flag") is True


async def test_get_bool_true_case_insensitive():
    assert await _store(b"TRUE").get_bool("any.boolean_flag") is True
    assert await _store(b"True").get_bool("any.boolean_flag") is True


async def test_get_bool_false_string_is_false():
    assert await _store(b"false").get_bool("any.boolean_flag") is False


async def test_get_bool_any_other_nonempty_string_is_false():
    assert await _store(b"1").get_bool("any.boolean_flag") is False
    assert await _store(b"yes").get_bool("any.boolean_flag") is False


async def test_get_bool_none_returns_default():
    assert await _store(None).get_bool("any.boolean_flag", default=False) is False
    assert await _store(None).get_bool("any.boolean_flag", default=True) is True


async def test_get_bool_empty_string_returns_default():
    assert await _store(b"").get_bool("any.boolean_flag", default=True) is True


async def test_get_bool_accepts_plain_str_value():
    # Redis client có thể trả str thay vì bytes tùy cấu hình decode_responses.
    assert await _store("true").get_bool("any.boolean_flag") is True
