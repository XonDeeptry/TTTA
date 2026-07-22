from unittest.mock import AsyncMock

import pytest

from grading_worker.config import ConfigStore


def _store(raw_value):
    redis = AsyncMock()
    redis.get.return_value = raw_value
    return ConfigStore(redis)


# ---- ConfigStore.get_bool (AC-04.x) ----


async def test_get_bool_true_lowercase():
    assert await _store(b"true").get_bool("limits.pilot_dual_grading") is True


async def test_get_bool_true_case_insensitive():
    assert await _store(b"TRUE").get_bool("limits.pilot_dual_grading") is True
    assert await _store(b"True").get_bool("limits.pilot_dual_grading") is True


async def test_get_bool_false_string_is_false():
    assert await _store(b"false").get_bool("limits.pilot_dual_grading") is False


async def test_get_bool_any_other_nonempty_string_is_false():
    assert await _store(b"1").get_bool("limits.pilot_dual_grading") is False
    assert await _store(b"yes").get_bool("limits.pilot_dual_grading") is False


async def test_get_bool_none_returns_default():
    assert await _store(None).get_bool("limits.pilot_dual_grading", default=False) is False
    assert await _store(None).get_bool("limits.pilot_dual_grading", default=True) is True


async def test_get_bool_empty_string_returns_default():
    assert await _store(b"").get_bool("limits.pilot_dual_grading", default=True) is True


async def test_get_bool_accepts_plain_str_value():
    # Redis client có thể trả str thay vì bytes tùy cấu hình decode_responses.
    assert await _store("true").get_bool("limits.pilot_dual_grading") is True
