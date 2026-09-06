"""Nhận bài dạng TỆP ĐÍNH KÈM (`user_send_file`, kind='file').

Bối cảnh 2026-09-06: chủ dự án gửi một `.m4a` qua Zalo dưới dạng tệp chứ không phải tin nhắn
thoại. Zalo phát `user_send_file`, còn pipeline khi đó chỉ chấm `{audio, video}` nên bài rơi
vào flag và học viên không nhận được gì. Đây là hành vi dùng thật, không phải ngoại lệ hiếm.

Hai bất biến mà bộ test này bảo vệ:
  1. Tệp KHÔNG phải media không được lọt vào đường chấm (không tốn token LLM).
  2. Nới lỏng chỉ áp dụng cho kind='file'. Với audio/video, ffprobe hỏng vẫn phải NÉM exception
     để retry/DLQ hoạt động như cũ — đó mới là sự cố hạ tầng, không phải "sai định dạng".
"""

import contextlib
from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.media.ffmpeg import FfmpegError
from grading_worker.pipeline import SubmissionPipeline, _file_may_be_media

from test_pipeline import GRADING_RESULT, _setup_gradable, base_message


@pytest.fixture
def core_api():
    api = AsyncMock()
    api.upsert_submission.return_value = {"id": 1}
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


# ─── lọc vòng ngoài theo đuôi tệp ────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://z.example/p1-work and job.m4a", True),
        ("https://z.example/a.MP3", True),          # hoa/thường không được ảnh hưởng
        ("https://z.example/a.mp4?token=abc", True),  # query string không được tính vào đuôi
        ("https://z.example/bai-tap.pdf", False),
        ("https://z.example/anh.zip", False),
        ("https://z.example/tepkhongduoi", True),   # không có đuôi ⇒ vẫn thử, để ffprobe phán
        (None, False),
    ],
)
def test_file_may_be_media(url, expected):
    assert _file_may_be_media(url) is expected


# ─── đường chấm ──────────────────────────────────────────────────────────────────────────

async def test_audio_file_attachment_is_graded(pipeline, core_api):
    """`.m4a` gửi dạng tệp phải đi hết đường chấm y như tin nhắn thoại."""
    p, _ = pipeline
    _setup_gradable(core_api, auto_send=False)

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/09/1/original.m4a")))
        stack.enter_context(patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=42.0)))
        stack.enter_context(patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/media/2026/09/1/audio.mp3")))
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)))
        await p.handle(base_message(kind="file", eventName="user_send_file", mediaUrl="https://z.example/p1.m4a"))

    core_api.create_grading.assert_awaited_once()
    core_api.create_flag.assert_not_awaited()


async def test_pdf_attachment_is_flagged_without_downloading(pipeline, core_api):
    """Loại theo đuôi phải xảy ra TRƯỚC khi tải — không tốn băng thông cho tệp vô nghĩa."""
    p, _ = pipeline
    _setup_gradable(core_api)
    download = AsyncMock()

    with patch("grading_worker.pipeline.download_original", new=download):
        await p.handle(base_message(kind="file", eventName="user_send_file", mediaUrl="https://z.example/bai.pdf"))

    download.assert_not_awaited()
    core_api.create_flag.assert_awaited_once()
    assert "không phải audio/video" in core_api.create_flag.call_args.args[1]


async def test_file_that_ffprobe_rejects_is_flagged_not_retried(pipeline, core_api):
    """Tệp đổi đuôi thành .mp3 nhưng thực chất không phải media: ffprobe loại. Phải ghi flag và
    DỪNG — không được ném exception, vì retry 3 lần rồi vào DLQ là vô nghĩa với lỗi định dạng."""
    p, _ = pipeline
    _setup_gradable(core_api)

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/09/1/original.mp3")))
        stack.enter_context(patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(side_effect=FfmpegError("Invalid data"))))
        grade = AsyncMock()
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", new=grade))
        await p.handle(base_message(kind="file", eventName="user_send_file", mediaUrl="https://z.example/gia.mp3"))

    grade.assert_not_awaited()  # không tốn một token LLM nào
    core_api.create_flag.assert_awaited_once()
    assert "không đọc được" in core_api.create_flag.call_args.args[1]
    assert core_api.update_submission.await_args.args[1]["status"] == "failed"


async def test_audio_kind_still_raises_on_ffprobe_failure(pipeline, core_api):
    """BẢO VỆ HÀNH VI CŨ: với kind='audio', Zalo đã khẳng định đây là media nên ffprobe hỏng là
    sự cố hạ tầng — vẫn phải ném lên để rabbit_consumer retry/DLQ. Nếu test này chuyển thành
    'không ném' thì nhánh nới lỏng đã rò sang cả audio/video."""
    p, _ = pipeline
    _setup_gradable(core_api)

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/09/1/original.m4a")))
        stack.enter_context(patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(side_effect=FfmpegError("boom"))))
        with pytest.raises(FfmpegError):
            await p.handle(base_message(kind="audio"))

    core_api.create_flag.assert_not_awaited()
