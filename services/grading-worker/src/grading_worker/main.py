from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import httpx
from dotenv import load_dotenv
from redis.asyncio import Redis

from .config import RABBITMQ_URL, REDIS_URL, ConfigStore
from .contracts import Q_OUTBOUND, Q_SUBMISSIONS
from .core_api_client import CoreApiClient
from .pipeline import SubmissionPipeline
from .rabbit_consumer import RabbitConsumer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def main() -> None:
    # Dev local: nạp infra/.env nếu có (Docker inject env trực tiếp nên bỏ qua) — cùng
    # convention với services/zalo-gateway/src/main.ts và services/core-api/src/main.ts.
    env_path = Path(__file__).resolve().parents[4] / "infra" / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    redis = Redis.from_url(REDIS_URL)
    config = ConfigStore(redis)
    core_api = CoreApiClient()
    http = httpx.AsyncClient(timeout=60.0)
    rabbit = RabbitConsumer(RABBITMQ_URL)

    await rabbit.connect()
    pipeline = SubmissionPipeline(core_api, config, http, publish=lambda msg: rabbit.publish(Q_OUTBOUND, msg))

    logger.info("grading-worker listening on queue '%s'", Q_SUBMISSIONS)
    try:
        await rabbit.consume(Q_SUBMISSIONS, pipeline.handle)
    finally:
        await rabbit.close()
        await core_api.aclose()
        await http.aclose()
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
