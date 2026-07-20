from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.grading.providers.base import GradingResult
from grading_worker.pipeline import SubmissionPipeline

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
