"""Kết nối RabbitMQ + assert topology giống hệt zalo-gateway/src/rabbit.service.ts và
core-api/src/rabbit.service.ts (cả 3 service assert idempotent, an toàn dù khởi động
theo thứ tự nào). Retry/DLQ (mục 3.5): lỗi tạm → republish vào {queue}.retry (TTL, tăng
x-retry); quá MAX_RETRIES → {queue}.dlq kèm x-last-error.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Awaitable, Callable

import aio_pika
from aio_pika import ExchangeType
from aio_pika.abc import AbstractIncomingMessage

from .contracts import DLX, EXCHANGE, MAX_RETRIES, Q_OUTBOUND, Q_SUBMISSIONS, RETRY_EXCHANGE, RETRY_TTL_MS

logger = logging.getLogger(__name__)

Handler = Callable[[dict[str, Any]], Awaitable[None]]


class RabbitConsumer:
    def __init__(self, url: str) -> None:
        self._url = url
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.abc.AbstractChannel | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None
        self._dlx: aio_pika.abc.AbstractExchange | None = None
        self._retry_exchange: aio_pika.abc.AbstractExchange | None = None
        self._queues: dict[str, aio_pika.abc.AbstractQueue] = {}

    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=1)
        await self._assert_topology()
        logger.info("RabbitMQ connected, topology asserted")

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()

    async def _assert_topology(self) -> None:
        assert self._channel is not None
        self._exchange = await self._channel.declare_exchange(EXCHANGE, ExchangeType.DIRECT, durable=True)
        self._dlx = await self._channel.declare_exchange(DLX, ExchangeType.DIRECT, durable=True)
        self._retry_exchange = await self._channel.declare_exchange(RETRY_EXCHANGE, ExchangeType.DIRECT, durable=True)

        for q in (Q_SUBMISSIONS, Q_OUTBOUND):
            queue = await self._channel.declare_queue(
                q,
                durable=True,
                arguments={"x-dead-letter-exchange": DLX, "x-dead-letter-routing-key": q},
            )
            await queue.bind(self._exchange, routing_key=q)

            dlq = await self._channel.declare_queue(f"{q}.dlq", durable=True)
            await dlq.bind(self._dlx, routing_key=q)

            retry_queue = await self._channel.declare_queue(
                f"{q}.retry",
                durable=True,
                arguments={
                    "x-message-ttl": RETRY_TTL_MS,
                    "x-dead-letter-exchange": EXCHANGE,
                    "x-dead-letter-routing-key": q,
                },
            )
            await retry_queue.bind(self._retry_exchange, routing_key=q)

            self._queues[q] = queue

    def publish(self, routing_key: str, message: dict[str, Any], headers: dict[str, Any] | None = None) -> Awaitable[None]:
        assert self._exchange is not None, "RabbitMQ exchange not ready"
        return self._exchange.publish(
            aio_pika.Message(
                body=json.dumps(message).encode("utf-8"),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                headers=headers or {},
            ),
            routing_key=routing_key,
        )

    async def consume(self, queue_name: str, handler: Handler) -> None:
        queue = self._queues[queue_name]
        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                await self._handle_message(queue_name, message, handler)

    async def _handle_message(self, queue_name: str, message: AbstractIncomingMessage, handler: Handler) -> None:
        headers = dict(message.headers or {})
        try:
            payload = json.loads(message.body.decode("utf-8"))
            await handler(payload)
        except Exception as err:  # noqa: BLE001 - mọi lỗi xử lý đều phải vào retry/DLQ, không được nuốt
            await self._republish_after_failure(queue_name, message.body, headers, err)
        await message.ack()

    async def _republish_after_failure(
        self, queue_name: str, body: bytes, headers: dict[str, Any], err: Exception
    ) -> None:
        retry_count = int(headers.get("x-retry", 0))
        if retry_count >= MAX_RETRIES:
            logger.error("%s: giving up after %d retries -> DLQ: %s", queue_name, retry_count, err)
            assert self._dlx is not None
            await self._dlx.publish(
                aio_pika.Message(
                    body=body,
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    headers={**headers, "x-last-error": str(err)},
                ),
                routing_key=queue_name,
            )
        else:
            logger.warning("%s: attempt %d failed -> retry queue: %s", queue_name, retry_count + 1, err)
            assert self._retry_exchange is not None
            await self._retry_exchange.publish(
                aio_pika.Message(
                    body=body,
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    headers={**headers, "x-retry": retry_count + 1},
                ),
                routing_key=queue_name,
            )
