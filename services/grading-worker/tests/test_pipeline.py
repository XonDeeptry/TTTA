import contextlib
from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.grading.providers.base import GradingResult, TranscriptResult
from grading_worker.pipeline import SubmissionPipeline

# Kết quả chấm audio dùng chung cho các test pilot (schema hợp lệ theo RUBRIC).
GRADING_RESULT = GradingResult(
    data={
        "scores": {
            "fluency": {"score": 3, "comment": "tốt"},
            "pronunciation": {"score": 2, "comment": "khá", "mispronounced_words": []},
        },
        "feedback": "Em làm bài rất tốt!",
    },
    input_tokens=100,
    output_tokens=50,
    provider="gemini",
    model="gemini-2.5-flash",
)

TEXT_GRADING_RESULT = GradingResult(
    data={
        "scores": {
            "fluency": {"score": 2, "comment": "ổn"},
            "pronunciation": {"score": 2, "comment": "tham khảo (không nghe audio)", "mispronounced_words": []},
        },
        "feedback": "Nhận xét dựa trên transcript.",
    },
    input_tokens=40,
    output_tokens=20,
    provider="gemini",
    model="gemini-2.5-flash",
)

TRANSCRIPT_RESULT = TranscriptResult(
    text="Hello my name is Nam.",
    input_tokens=30,
    output_tokens=15,
    provider="gemini",
    model="gemini-2.5-flash",
)


def _setup_gradable(core_api, *, auto_send=True):
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {
        "id": 10,
        "courseId": 1,
        "llmConfig": {"provider": "gemini", "model": "gemini-2.5-flash", "temperature": 0.2},
        "autoSend": auto_send,
    }
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC}
    core_api.create_grading.return_value = {"id": 99}


def _gradable_patches():
    return [
        patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/07/1/original.m4a")),
        patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=200.0)),
        patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/media/2026/07/1/audio.mp3")),
        patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)),
    ]


@contextlib.contextmanager
def _pilot_env(*, transcribe, grade_text):
    """Vào toàn bộ patch nhánh audio + hai hàm pilot (transcribe/grade_text) trong một ExitStack —
    tránh giới hạn cú pháp `with (*..., x as y)` của parenthesized context managers."""
    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.transcribe_with_fallback", transcribe))
        stack.enter_context(patch("grading_worker.pipeline.grade_text_with_fallback", grade_text))
        yield

RUBRIC = {
    "course_key": "basic",
    "band_scale": [0, 3],
    "feedback_language": "vi",
    "dimensions": [
        {"name": "fluency", "weight": 0.5, "bands": {"0": "kém", "3": "tốt"}},
        {"name": "pronunciation", "weight": 0.5, "bands": {"0": "kém", "3": "tốt"}},
    ],
}


def base_message(kind="audio", **overrides):
    msg = {
        "v": 1,
        "messageId": "msg-1",
        "eventName": "user_send_audio",
        "kind": kind,
        "zaloUserId": "zalo-1",
        "mediaUrl": "https://zalo.example/clip.m4a",
        "receivedAt": "2026-07-20T00:00:00.000Z",
    }
    msg.update(overrides)
    return msg


@pytest.fixture
def core_api():
    api = AsyncMock()
    api.upsert_submission.return_value = {"id": 1}
    return api


@pytest.fixture
def config():
    cfg = AsyncMock()
    cfg.get_int.return_value = 420
    cfg.get_bool.return_value = False  # pilot dual-grading TẮT mặc định (đường audio giữ nguyên)
    return cfg


@pytest.fixture
def pipeline(core_api, config):
    publish = AsyncMock()
    return SubmissionPipeline(core_api, config, http=AsyncMock(), publish=publish), publish


async def test_text_message_is_flagged_and_not_replied_to(pipeline, core_api):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]

    await p.handle(base_message(kind="text"))

    core_api.create_flag.assert_awaited_once()
    assert "bot không hội thoại" in core_api.create_flag.call_args.args[1]
    publish.assert_not_called()


async def test_pending_binding_sends_onboarding_message_and_stops(pipeline, core_api):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "pending", "studentId": None, "zaloUserId": "zalo-1"}]

    await p.handle(base_message())

    publish.assert_awaited_once()
    assert "kích hoạt" in publish.call_args.args[0]["text"]
    core_api.get_student.assert_not_called()


async def test_multiple_active_bindings_asks_which_student(pipeline, core_api):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [
        {"status": "active", "studentId": 1, "displayName": "Nam", "zaloUserId": "zalo-1"},
        {"status": "active", "studentId": 2, "displayName": "Lan", "zaloUserId": "zalo-1"},
    ]

    await p.handle(base_message())

    publish.assert_awaited_once()
    text = publish.call_args.args[0]["text"]
    assert "Nam" in text and "Lan" in text
    core_api.get_student.assert_not_called()


async def test_non_gradable_kind_is_flagged_not_graded(pipeline, core_api):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]

    await p.handle(base_message(kind="image"))

    core_api.create_flag.assert_awaited_once()
    core_api.get_student.assert_not_called()
    publish.assert_not_called()


async def test_clip_too_long_is_rejected_before_grading(pipeline, core_api, config):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {"id": 10, "courseId": 1, "llmConfig": {}, "autoSend": False}
    config.get_int.return_value = 60  # ngưỡng 1 phút cho dễ test

    with (
        patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/07/1/original.m4a")),
        patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=300.0)),
        patch("grading_worker.pipeline.extract_audio") as extract_mock,
    ):
        await p.handle(base_message())

    extract_mock.assert_not_called()
    core_api.create_grading.assert_not_called()
    publish.assert_awaited_once()
    assert "quá" in publish.call_args.args[0]["text"] or "vượt" in publish.call_args.args[0]["text"]
    status_calls = [c.args for c in core_api.update_submission.call_args_list]
    assert any(call[1].get("status") == "failed" for call in status_calls)


async def test_happy_path_auto_send_grades_and_publishes_feedback(pipeline, core_api, config):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {
        "id": 10,
        "courseId": 1,
        "llmConfig": {"provider": "gemini", "model": "gemini-2.5-flash", "temperature": 0.2},
        "autoSend": True,
    }
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC}
    core_api.create_grading.return_value = {"id": 99}

    grading_result = GradingResult(
        data={
            "scores": {
                "fluency": {"score": 3, "comment": "tốt"},
                "pronunciation": {"score": 2, "comment": "khá", "mispronounced_words": []},
            },
            "feedback": "Em làm bài rất tốt!",
        },
        input_tokens=100,
        output_tokens=50,
        provider="gemini",
        model="gemini-2.5-flash",
    )

    with (
        patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/07/1/original.m4a")),
        patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=200.0)),
        patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/media/2026/07/1/audio.mp3")),
        patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=grading_result)),
    ):
        await p.handle(base_message())

    core_api.create_grading.assert_awaited_once()
    core_api.create_cost_log.assert_awaited_once()
    publish.assert_awaited_once()
    assert publish.call_args.args[0]["text"] == "Em làm bài rất tốt!"
    final_status_updates = [c.args[1].get("status") for c in core_api.update_submission.call_args_list]
    assert "sent" in final_status_updates
    # AC25: PATCH sau khi tách audio phải đính kèm audioExtractedAt (ISO-8601) cho cron vòng đời media.
    post_extract = [c.args[1] for c in core_api.update_submission.call_args_list if "audioExtractedAt" in c.args[1]]
    assert len(post_extract) == 1
    assert post_extract[0].get("durationSec") is not None
    assert isinstance(post_extract[0]["audioExtractedAt"], str)


async def test_happy_path_awaiting_review_does_not_publish(pipeline, core_api):
    p, publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {
        "id": 10,
        "courseId": 1,
        "llmConfig": {"provider": "gemini", "model": "gemini-2.5-flash"},
        "autoSend": False,
    }
    core_api.get_criteria.return_value = {"id": 5, "version": 1, "rubric": RUBRIC}
    core_api.create_grading.return_value = {"id": 100}

    grading_result = GradingResult(
        data={
            "scores": {
                "fluency": {"score": 2, "comment": "ok"},
                "pronunciation": {"score": 2, "comment": "ok", "mispronounced_words": []},
            },
            "feedback": "Khá tốt.",
        },
        input_tokens=10,
        output_tokens=10,
        provider="gemini",
        model="gemini-2.5-flash",
    )

    with (
        patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/07/1/original.m4a")),
        patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
        patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/media/2026/07/1/audio.mp3")),
        patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=grading_result)),
    ):
        await p.handle(base_message())

    publish.assert_not_called()
    final_status_updates = [c.args[1].get("status") for c in core_api.update_submission.call_args_list]
    assert "awaiting_review" in final_status_updates


async def test_invalid_llm_output_raises_so_rabbit_consumer_can_retry(pipeline, core_api):
    p, _publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {
        "id": 10,
        "courseId": 1,
        "llmConfig": {"provider": "gemini", "model": "gemini-2.5-flash"},
        "autoSend": True,
    }
    core_api.get_criteria.return_value = {"id": 5, "version": 1, "rubric": RUBRIC}

    malformed_result = GradingResult(
        data={"scores": {}, "feedback": "thiếu hết điểm"},  # sai schema — thiếu dimensions bắt buộc
        input_tokens=1,
        output_tokens=1,
        provider="gemini",
        model="gemini-2.5-flash",
    )

    with (
        patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/07/1/original.m4a")),
        patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
        patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/media/2026/07/1/audio.mp3")),
        patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=malformed_result)),
    ):
        with pytest.raises(Exception):
            await p.handle(base_message())

    core_api.create_grading.assert_not_called()


# ---------------------------------------------------------------------------
# Pilot A/B dual-modal grading (AC-07.x)
# ---------------------------------------------------------------------------


async def test_pilot_flag_off_leaves_audio_path_byte_for_byte_unchanged(pipeline, core_api, config):
    """AC-07.1: cờ TẮT → chuỗi gọi y hệt trước, đúng 1 cost_log 'audio_grade', không gọi pilot."""
    p, publish = pipeline
    _setup_gradable(core_api, auto_send=True)
    config.get_bool.return_value = False
    transcribe_mock = AsyncMock()
    grade_text_mock = AsyncMock()

    with _pilot_env(transcribe=transcribe_mock, grade_text=grade_text_mock):
        await p.handle(base_message())

    transcribe_mock.assert_not_called()
    grade_text_mock.assert_not_called()
    core_api.create_pilot_text_grading.assert_not_called()
    core_api.create_cost_log.assert_awaited_once()
    assert core_api.create_cost_log.call_args.args[0]["callType"] == "audio_grade"
    publish.assert_awaited_once()


async def test_pilot_flag_on_happy_path_runs_transcribe_grade_and_persist(pipeline, core_api, config):
    """AC-07.2: cờ BẬT → transcribe + grade_text + create_pilot mỗi thứ đúng 1 lần, 3 dòng cost_log."""
    p, publish = pipeline
    _setup_gradable(core_api, auto_send=True)
    config.get_bool.return_value = True
    transcribe_mock = AsyncMock(return_value=TRANSCRIPT_RESULT)
    grade_text_mock = AsyncMock(return_value=TEXT_GRADING_RESULT)

    with _pilot_env(transcribe=transcribe_mock, grade_text=grade_text_mock):
        await p.handle(base_message())

    transcribe_mock.assert_awaited_once()
    grade_text_mock.assert_awaited_once()
    core_api.create_pilot_text_grading.assert_awaited_once()

    call_types = [c.args[0].get("callType") for c in core_api.create_cost_log.call_args_list]
    assert call_types == ["audio_grade", "transcription", "text_grade"]

    pilot_payload = core_api.create_pilot_text_grading.call_args.args[0]
    assert pilot_payload["submissionId"] == 1
    assert pilot_payload["criteriaId"] == 5
    assert pilot_payload["criteriaVersion"] == 2
    assert pilot_payload["transcript"] == "Hello my name is Nam."
    assert pilot_payload["scores"] == TEXT_GRADING_RESULT.data["scores"]
    assert pilot_payload["llmFeedback"] == "Nhận xét dựa trên transcript."
    # Audio vẫn được gửi bình thường (1 lần, đúng feedback audio — KHÔNG phải feedback text).
    assert publish.await_count == 1
    assert publish.call_args.args[0]["text"] == "Em làm bài rất tốt!"


async def test_pilot_transcribe_failure_is_swallowed_audio_unaffected(pipeline, core_api, config):
    """AC-07.3: transcribe lỗi → nuốt lỗi, không retry, audio đã chấm/gửi không bị ảnh hưởng."""
    p, publish = pipeline
    _setup_gradable(core_api, auto_send=True)
    config.get_bool.return_value = True
    grade_text_mock = AsyncMock()

    with _pilot_env(transcribe=AsyncMock(side_effect=RuntimeError("boom")), grade_text=grade_text_mock):
        await p.handle(base_message())  # KHÔNG raise

    grade_text_mock.assert_not_called()
    core_api.create_pilot_text_grading.assert_not_called()
    core_api.create_grading.assert_awaited_once()
    publish.assert_awaited_once()
    # Chỉ có cost_log audio_grade (pilot chưa kịp ghi dòng nào).
    call_types = [c.args[0].get("callType") for c in core_api.create_cost_log.call_args_list]
    assert call_types == ["audio_grade"]


async def test_pilot_grade_text_failure_is_swallowed(pipeline, core_api, config):
    """AC-07.4: grade_text lỗi → nuốt lỗi, không lưu pilot, audio không bị ảnh hưởng."""
    p, publish = pipeline
    _setup_gradable(core_api, auto_send=True)
    config.get_bool.return_value = True

    with _pilot_env(
        transcribe=AsyncMock(return_value=TRANSCRIPT_RESULT),
        grade_text=AsyncMock(side_effect=RuntimeError("boom")),
    ):
        await p.handle(base_message())  # KHÔNG raise

    core_api.create_pilot_text_grading.assert_not_called()
    core_api.create_grading.assert_awaited_once()
    publish.assert_awaited_once()
    # transcription đã ghi cost_log, text_grade thì chưa.
    call_types = [c.args[0].get("callType") for c in core_api.create_cost_log.call_args_list]
    assert call_types == ["audio_grade", "transcription"]


async def test_pilot_persist_failure_is_swallowed(pipeline, core_api, config):
    """AC-07.5: create_pilot_text_grading lỗi → nuốt lỗi, audio không bị ảnh hưởng, không retry."""
    p, publish = pipeline
    _setup_gradable(core_api, auto_send=True)
    config.get_bool.return_value = True
    core_api.create_pilot_text_grading.side_effect = RuntimeError("db down")

    with _pilot_env(
        transcribe=AsyncMock(return_value=TRANSCRIPT_RESULT),
        grade_text=AsyncMock(return_value=TEXT_GRADING_RESULT),
    ):
        await p.handle(base_message())  # KHÔNG raise

    core_api.create_grading.assert_awaited_once()
    publish.assert_awaited_once()


async def test_pilot_never_publishes_outbound(pipeline, core_api, config):
    """AC-07.6: nhánh pilot KHÔNG bao giờ publish outbound (autoSend=False → không gửi gì cả)."""
    p, publish = pipeline
    _setup_gradable(core_api, auto_send=False)
    config.get_bool.return_value = True

    with _pilot_env(
        transcribe=AsyncMock(return_value=TRANSCRIPT_RESULT),
        grade_text=AsyncMock(return_value=TEXT_GRADING_RESULT),
    ):
        await p.handle(base_message())

    core_api.create_pilot_text_grading.assert_awaited_once()
    publish.assert_not_called()


async def test_pilot_not_reached_on_early_return_clip_too_long(pipeline, core_api, config):
    """AC-07.7: nhánh dừng sớm (clip quá dài) không bao giờ chạm khối pilot dù cờ BẬT."""
    p, _publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {"id": 10, "courseId": 1, "llmConfig": {}, "autoSend": False}
    config.get_bool.return_value = True
    config.get_int.return_value = 60
    transcribe_mock = AsyncMock()

    with (
        patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/07/1/original.m4a")),
        patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=300.0)),
        patch("grading_worker.pipeline.transcribe_with_fallback", transcribe_mock),
    ):
        await p.handle(base_message())

    transcribe_mock.assert_not_called()
    core_api.create_pilot_text_grading.assert_not_called()


async def test_pilot_not_reached_on_pending_binding(pipeline, core_api, config):
    """AC-07.8: nhánh chờ onboarding (binding pending) không bao giờ chạm khối pilot dù cờ BẬT."""
    p, _publish = pipeline
    core_api.ensure_binding.return_value = [{"status": "pending", "studentId": None, "zaloUserId": "zalo-1"}]
    config.get_bool.return_value = True

    transcribe_mock = AsyncMock()
    with patch("grading_worker.pipeline.transcribe_with_fallback", transcribe_mock):
        await p.handle(base_message())

    transcribe_mock.assert_not_called()
    core_api.create_pilot_text_grading.assert_not_called()
