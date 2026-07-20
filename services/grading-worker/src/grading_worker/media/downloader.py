"""Tải media từ Zalo về local — quy ước đường dẫn mục 3.8:
/data/media/{yyyy}/{mm}/{submission_id}/original.{ext}
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from ..config import MEDIA_ROOT

_DEFAULT_EXT = {"audio": "m4a", "video": "mp4"}


def _guess_extension(url: str, kind: str) -> str:
    path = urlparse(url).path
    _, ext = os.path.splitext(path)
    if ext:
        return ext.lstrip(".")
    return _DEFAULT_EXT.get(kind, "bin")


def submission_media_dir(submission_id: int, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return os.path.join(MEDIA_ROOT, f"{now:%Y}", f"{now:%m}", str(submission_id))


async def download_original(client: httpx.AsyncClient, url: str, submission_id: int, kind: str) -> str:
    """Trả về media_path TƯƠNG ĐỐI so với MEDIA_ROOT (Postgres chỉ lưu đường dẫn, mục 3.8)."""
    directory = submission_media_dir(submission_id)
    os.makedirs(directory, exist_ok=True)
    ext = _guess_extension(url, kind)
    absolute_path = os.path.join(directory, f"original.{ext}")

    async with client.stream("GET", url) as response:
        response.raise_for_status()
        with open(absolute_path, "wb") as f:
            async for chunk in response.aiter_bytes():
                f.write(chunk)

    return os.path.relpath(absolute_path, MEDIA_ROOT)
