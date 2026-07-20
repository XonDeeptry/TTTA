"""FFmpeg/ffprobe qua subprocess trực tiếp — không cần thêm thư viện wrapper cho một
binary CLI đã ổn định (mục 3.2: "FFmpeg nằm trong grading-worker", không tách service riêng).
"""

from __future__ import annotations

import asyncio
import os


class FfmpegError(RuntimeError):
    pass


async def probe_duration_sec(path: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise FfmpegError(f"ffprobe thất bại cho {path}: {stderr.decode().strip()}")
    return float(stdout.decode().strip())


async def extract_audio(video_path: str) -> str:
    """Tách audio từ video sang audio.mp3 cùng thư mục (quy ước đường dẫn mục 3.8)."""
    directory = os.path.dirname(video_path)
    audio_path = os.path.join(directory, "audio.mp3")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "libmp3lame",
        "-q:a", "4",
        audio_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise FfmpegError(f"ffmpeg tách audio thất bại cho {video_path}: {stderr.decode().strip()}")
    return audio_path
