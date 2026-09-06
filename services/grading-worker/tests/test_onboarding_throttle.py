"""Chống spam tin onboarding: MỘT tin mỗi 24h cho mỗi người, không phải mỗi bài nộp.

Bối cảnh 2026-09-06: ai cũng quan tâm được OA rồi gửi bài. Người chưa được kích hoạt gửi 5
clip liên tiếp sẽ nhận 5 tin giống hệt nhau — vừa phiền học viên thật, vừa cho kẻ phá hoại 5
lượt gọi API Zalo miễn phí. Hạn mức ở gateway chặn phần lớn, nhưng nó đếm theo NGÀY nên trong
hạn mức đó vẫn có thể có nhiều bài; van này chặn nốt phần còn lại.

Bất biến quan trọng nhất ở đây: **bị chặn tin nhắn KHÔNG có nghĩa là bỏ qua bài nộp**. Bài vẫn
được ghi nhận bình thường, tư vấn vẫn thấy binding pending trên dashboard — chỉ tin nhắn ra là
không lặp lại.
"""

from unittest.mock import AsyncMock

import pytest

from grading_worker.config import ConfigStore
from grading_worker.pipeline import SubmissionPipeline

from test_pipeline import base_message


@pytest.fixture
def core_api():
    api = AsyncMock()
    api.upsert_submission.return_value = {"id": 1}
    api.ensure_binding.return_value = [{"status": "pending", "studentId": None, "zaloUserId": "zalo-1"}]
    return api


@pytest.fixture
def config():
    cfg = AsyncMock()
    cfg.get_int.return_value = 420
    cfg.get.return_value = None
    return cfg


@pytest.fixture
def pipeline(core_api, config):
    publish = AsyncMock()
    return SubmissionPipeline(core_api, config, http=AsyncMock(), publish=publish), publish


async def test_first_submission_sends_onboarding(pipeline, core_api, config):
    p, publish = pipeline
    config.claim_once_per_day.return_value = True

    await p.handle(base_message())

    publish.assert_awaited_once()
    config.claim_once_per_day.assert_awaited_once_with("onboarding_sent:zalo-1")


async def test_repeat_submission_within_24h_sends_nothing(pipeline, core_api, config):
    p, publish = pipeline
    config.claim_once_per_day.return_value = False

    await p.handle(base_message())

    publish.assert_not_awaited()


async def test_throttled_submission_is_still_recorded(pipeline, core_api, config):
    """Chặn TIN NHẮN, không chặn BÀI NỘP — tư vấn vẫn phải thấy người này đang chờ kích hoạt."""
    p, _ = pipeline
    config.claim_once_per_day.return_value = False

    await p.handle(base_message())

    core_api.upsert_submission.assert_awaited_once()
    core_api.ensure_binding.assert_awaited_once()


class _FakeRedis:
    def __init__(self, result):
        self._result = result
        self.calls = []

    async def set(self, key, value, nx=None, ex=None):  # noqa: ANN001 — khuôn redis.asyncio
        self.calls.append({"key": key, "value": value, "nx": nx, "ex": ex})
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


async def test_claim_uses_set_nx_with_24h_ttl():
    redis = _FakeRedis(True)
    assert await ConfigStore(redis).claim_once_per_day("onboarding_sent:u1") is True
    assert redis.calls == [{"key": "onboarding_sent:u1", "value": "1", "nx": True, "ex": 86400}]


async def test_claim_returns_false_when_key_already_exists():
    # redis SET NX trả None khi key đã tồn tại
    assert await ConfigStore(_FakeRedis(None)).claim_once_per_day("k") is False


async def test_redis_failure_allows_sending():
    """Hạ tầng hỏng thì thà gửi trùng một tin, còn hơn nuốt mất tin onboarding của học viên thật."""
    assert await ConfigStore(_FakeRedis(RuntimeError("redis down"))).claim_once_per_day("k") is True
