import os

import httpx
import pytest

from grading_worker.media import downloader


@pytest.fixture
def media_root(tmp_path, monkeypatch):
    root = tmp_path / "media"
    monkeypatch.setattr(downloader, "MEDIA_ROOT", str(root))
    return str(root)


async def test_download_original_writes_file_and_returns_relative_path(media_root):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"fake-audio-bytes")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        relative_path = await downloader.download_original(client, "https://zalo.example/clip.m4a", 42, "audio")

    assert relative_path.endswith(os.path.join("42", "original.m4a"))
    absolute_path = os.path.join(media_root, relative_path)
    assert os.path.exists(absolute_path)
    with open(absolute_path, "rb") as f:
        assert f.read() == b"fake-audio-bytes"


async def test_download_original_falls_back_to_default_extension_by_kind(media_root):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        # URL không có phần mở rộng rõ ràng (Zalo hay trả link ký query string)
        relative_path = await downloader.download_original(
            client, "https://zalo.example/media?token=abc", 7, "video"
        )

    assert relative_path.endswith("original.mp4")


def test_submission_media_dir_uses_year_month_submission_id_path():
    import datetime

    now = datetime.datetime(2026, 7, 20, tzinfo=datetime.timezone.utc)
    path = downloader.submission_media_dir(99, now=now)
    assert path.endswith(os.path.join("2026", "07", "99"))
