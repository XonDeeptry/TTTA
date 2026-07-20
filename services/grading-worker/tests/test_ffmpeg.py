import os
from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.media.ffmpeg import FfmpegError, extract_audio, probe_duration_sec


def _fake_process(returncode: int, stdout: bytes = b"", stderr: bytes = b""):
    proc = AsyncMock()
    proc.communicate.return_value = (stdout, stderr)
    proc.returncode = returncode
    return proc


async def test_probe_duration_sec_parses_ffprobe_stdout():
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_fake_process(0, stdout=b"123.45\n"))):
        duration = await probe_duration_sec("/data/media/x/original.mp4")
    assert duration == 123.45


async def test_probe_duration_sec_raises_on_ffprobe_failure():
    with patch(
        "asyncio.create_subprocess_exec", new=AsyncMock(return_value=_fake_process(1, stderr=b"no such file"))
    ):
        with pytest.raises(FfmpegError):
            await probe_duration_sec("/data/media/missing.mp4")


async def test_extract_audio_returns_sibling_mp3_path():
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_fake_process(0))):
        audio_path = await extract_audio(os.path.join("/data/media/2026/07/1", "original.mp4"))
    assert audio_path == os.path.join("/data/media/2026/07/1", "audio.mp3")


async def test_extract_audio_raises_on_ffmpeg_failure():
    with patch(
        "asyncio.create_subprocess_exec", new=AsyncMock(return_value=_fake_process(1, stderr=b"codec error"))
    ):
        with pytest.raises(FfmpegError):
            await extract_audio("/data/media/2026/07/1/original.mp4")
