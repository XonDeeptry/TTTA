import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from grading_worker.contracts import MAX_RETRIES
from grading_worker.rabbit_consumer import RabbitConsumer


class FakeMessage:
    def __init__(self, body: bytes, headers: dict | None = None):
        self.body = body
        self.headers = headers or {}
        self.ack = AsyncMock()


@pytest.fixture
def consumer():
    c = RabbitConsumer("amqp://unused")
    c._dlx = MagicMock()
    c._dlx.publish = AsyncMock()
    c._retry_exchange = MagicMock()
    c._retry_exchange.publish = AsyncMock()
    return c


async def test_successful_handler_just_acks(consumer):
    handler = AsyncMock()
    message = FakeMessage(json.dumps({"hello": "world"}).encode())

    await consumer._handle_message("submissions", message, handler)

    handler.assert_awaited_once_with({"hello": "world"})
    consumer._retry_exchange.publish.assert_not_called()
    consumer._dlx.publish.assert_not_called()
    message.ack.assert_awaited_once()


async def test_first_failure_goes_to_retry_queue_with_incremented_header(consumer):
    async def failing_handler(_payload):
        raise RuntimeError("boom")

    message = FakeMessage(json.dumps({"x": 1}).encode(), headers={})

    await consumer._handle_message("submissions", message, failing_handler)

    consumer._retry_exchange.publish.assert_awaited_once()
    published_message = consumer._retry_exchange.publish.call_args.args[0]
    assert published_message.headers["x-retry"] == 1
    consumer._dlx.publish.assert_not_called()
    message.ack.assert_awaited_once()  # original message vẫn ack — đã republish thay thế


async def test_exhausted_retries_goes_to_dlq_with_last_error(consumer):
    async def failing_handler(_payload):
        raise RuntimeError("still broken")

    message = FakeMessage(json.dumps({"x": 1}).encode(), headers={"x-retry": MAX_RETRIES})

    await consumer._handle_message("submissions", message, failing_handler)

    consumer._dlx.publish.assert_awaited_once()
    published_message = consumer._dlx.publish.call_args.args[0]
    assert "still broken" in published_message.headers["x-last-error"]
    consumer._retry_exchange.publish.assert_not_called()


async def test_publish_requires_connected_exchange(consumer):
    with pytest.raises(AssertionError):
        consumer.publish("outbound", {"zaloUserId": "u1", "text": "hi"})
