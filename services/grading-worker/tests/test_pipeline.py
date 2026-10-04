import contextlib
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

# Kết quả chấm audio hợp lệ theo RUBRIC ở trên.
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
    # `get()` trả None tường minh: `_resolve_model` / `_resolve_temperature` / `_pricing_overrides`
    # đều đọc qua nó, và một AsyncMock trần sẽ lọt vào chỗ mong đợi `str | None`.
    cfg.get.return_value = None
    cfg.last_scripts.return_value = {}  # chưa có kịch bản bài trước
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


def _required_provider_grade_params() -> set[str]:
    """Tham số BẮT BUỘC của `Provider.grade` mà PIPELINE phải cấp.

    `model`/`temperature` do `grade_with_fallback` tự điền từ `llmConfig`, không phải việc của
    pipeline — nên loại khỏi tập cần kiểm.
    """
    import inspect

    from grading_worker.grading.providers.base import Provider

    sig = inspect.signature(Provider.grade)
    supplied_by_factory = {"self", "model", "temperature"}
    return {
        name
        for name, p in sig.parameters.items()
        if name not in supplied_by_factory
        and p.default is inspect.Parameter.empty
        and p.kind
        in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    }


async def test_audio_grading_supplies_every_required_provider_argument(pipeline, core_api):
    """Chặn đúng lỗi đã xảy ra ngoài production: thiếu `schema` trên nhánh audio."""
    p, _ = pipeline
    _setup_gradable(core_api)
    grade = AsyncMock(return_value=GRADING_RESULT)

    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", grade))
        await p.handle(base_message())

    passed = set(grade.await_args.kwargs)
    missing = _required_provider_grade_params() - passed
    assert not missing, f"pipeline không truyền tham số bắt buộc cho Provider.grade: {sorted(missing)}"


async def test_audio_grading_passes_the_schema_it_validates_against(pipeline, core_api):
    """`schema` gửi cho provider phải LÀ CHÍNH cái schema dùng để validate kết quả trả về —
    hai bên lệch nhau thì LLM bị ép theo một hình dạng rồi lại bị chấm theo hình dạng khác."""
    p, _ = pipeline
    _setup_gradable(core_api)
    grade = AsyncMock(return_value=GRADING_RESULT)

    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", grade))
        await p.handle(base_message())

    from grading_worker.grading.schema import build_output_schema

    assert grade.await_args.kwargs["schema"] == build_output_schema(RUBRIC)


# ─── Bỏ cuộc vào DLQ → đóng bài `processing` (sự cố 16 video treo 2026-09-27) ─────────────


async def test_give_up_marks_processing_submission_failed_with_flag(pipeline, core_api):
    p, _ = pipeline
    core_api.upsert_submission.return_value = {"id": 115, "status": "processing"}

    await p.mark_failed_after_give_up(base_message(kind="video"), RuntimeError("301 Moved Permanently"))

    # Không gửi status khi upsert — không được tự ghi đè trạng thái trước khi kiểm tra.
    assert "status" not in core_api.upsert_submission.await_args.args[0]
    core_api.update_submission.assert_awaited_once_with(115, {"status": "failed"})
    submission_id, reason = core_api.create_flag.await_args.args
    assert submission_id == 115 and "Giám sát" in reason
    assert "301" not in reason  # lỗi thô chỉ ở log/DLQ — staff đọc cờ này


@pytest.mark.parametrize("status", ["awaiting_review", "sent", "received", "failed"])
async def test_give_up_leaves_non_processing_submission_alone(pipeline, core_api, status):
    p, _ = pipeline
    core_api.upsert_submission.return_value = {"id": 1, "status": status}

    await p.mark_failed_after_give_up(base_message(), RuntimeError("boom"))

    core_api.update_submission.assert_not_called()
    core_api.create_flag.assert_not_called()


# ─── IELTS: đọc/học thuộc ⇒ chỉ gắn cờ (học thuật 2026-10-03, bài 237) ────────────────────────────

IELTS_RUBRIC = {
    "course_key": "ielts",
    "band_scale": [0, 9],
    "feedback_language": "vi",
    "dimensions": [
        {"name": "fluency_coherence", "weight": 0.5, "bands": {"0": "kém", "9": "tốt"}},
        {"name": "pronunciation", "weight": 0.5, "bands": {"0": "kém", "9": "tốt"}},
    ],
}


async def test_ielts_asks_for_delivery_and_flags_rehearsed_speech_without_capping_the_score(pipeline, core_api):
    p, _ = pipeline
    _setup_gradable(core_api, auto_send=False)
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": IELTS_RUBRIC}
    data = {
        "scores": {
            "fluency_coherence": {"score": 8, "comment": "c"},
            "pronunciation": {"score": 8, "comment": "c", "mispronounced_words": []},
        },
        "feedback": "f",
        "delivery": {"style": "rehearsed", "evidence": "Nhịp đều, câu chữ như văn viết."},
    }
    grade = AsyncMock(return_value=GradingResult(data=data, input_tokens=1, output_tokens=1, provider="gemini", model="m"))
    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", grade))
        await p.handle(base_message())

    kwargs = grade.await_args.kwargs
    assert "delivery" in kwargs["schema"]["required"]
    assert "PHÂN LOẠI CÁCH NÓI" in kwargs["system_instruction"]
    assert "NGUYÊN TẮC CHẤM VÀ NHẬN XÉT" in kwargs["system_instruction"]
    reasons = [c.args[1] for c in core_api.create_flag.await_args_list]
    assert any("học thuộc" in r for r in reasons)
    # Không chặn điểm — điểm ghi vào gradings đúng như đã chấm.
    assert core_api.create_grading.await_args.args[0]["scores"]["fluency_coherence"]["score"] == 8


async def test_non_ielts_rubric_gets_no_delivery_field(pipeline, core_api):
    p, _ = pipeline
    _setup_gradable(core_api)
    grade = AsyncMock(return_value=GRADING_RESULT)
    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", grade))
        await p.handle(base_message())
    assert "delivery" not in grade.await_args.kwargs["schema"].get("required", [])


async def test_template_scripts_from_core_api_reach_the_prompt_one_per_criterion_and_band(pipeline, core_api):
    p, _ = pipeline
    _setup_gradable(core_api)
    scripts = [{"dimension": "fluency", "band": "3", "intent": None, "text": f"KỊCH BẢN-{i}"} for i in range(3)]
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC, "templateScripts": scripts}
    grade = AsyncMock(return_value=GRADING_RESULT)
    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", grade))
        await p.handle(base_message())
    prompt = grade.await_args.kwargs["system_instruction"]
    assert sum(f"KỊCH BẢN-{i}" in prompt for i in range(3)) == 1
    assert "[band 3]" in prompt and "ĐỦ MỌI mô tả" in prompt


async def test_remembers_only_the_script_cell_matching_the_actual_score(pipeline, core_api, config):
    from grading_worker.grading.comment_scripts import fingerprint

    p, _ = pipeline
    _setup_gradable(core_api)
    scripts = [
        {"dimension": "fluency", "band": "3", "intent": None, "text": "fluency band 3 — duy nhất"},
        {"dimension": "fluency", "band": "2", "intent": None, "text": "fluency band 2 — không khớp điểm"},
    ]
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC, "templateScripts": scripts}
    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", AsyncMock(return_value=GRADING_RESULT)))
        await p.handle(base_message())
    config.last_scripts.assert_awaited_once_with(10)
    student_id, remembered = config.remember_scripts.await_args.args
    assert student_id == 10
    assert remembered == {"fluency|3": fingerprint("fluency band 3 — duy nhất")}  # GRADING_RESULT: fluency = 3


# ─── Chấm nhiều lượt, lấy trung vị (2026-10-03) ─────────────────────────────────────────────────

def _result(fluency, pron, comment="c"):
    return GradingResult(
        data={
            "scores": {
                "fluency": {"score": fluency, "comment": comment},
                "pronunciation": {"score": pron, "comment": comment, "mispronounced_words": []},
            },
            "feedback": "f",
        },
        input_tokens=100, output_tokens=50, provider="gemini", model="gemini-2.5-flash",
    )


async def _handle_with(p, core_api, grade):
    _setup_gradable(core_api)
    with contextlib.ExitStack() as stack:
        for cm in _gradable_patches():
            stack.enter_context(cm)
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", grade))
        await p.handle(base_message())


async def test_grades_three_times_and_stores_the_median(pipeline, core_api):
    p, _ = pipeline
    grade = AsyncMock(side_effect=[_result(3, 1), _result(1, 1), _result(2, 1)])
    await _handle_with(p, core_api, grade)
    assert grade.await_count == 3
    assert core_api.create_grading.await_args.args[0]["scores"]["fluency"]["score"] == 2
    cost = next(c.args[0] for c in core_api.create_cost_log.await_args_list if c.args[0]["callType"] == "audio_grade")
    assert (cost["inputTokens"], cost["outputTokens"]) == (300, 150)  # chi phí thật của 3 lượt


async def test_one_failed_run_is_dropped_and_grading_still_succeeds(pipeline, core_api):
    p, _ = pipeline
    grade = AsyncMock(side_effect=[_result(2, 1), RuntimeError("503"), _result(2, 1)])
    await _handle_with(p, core_api, grade)
    assert core_api.create_grading.await_args.args[0]["scores"]["fluency"]["score"] == 2


async def test_all_runs_failing_still_raises_so_rabbit_consumer_retries(pipeline, core_api):
    p, _ = pipeline
    grade = AsyncMock(side_effect=RuntimeError("503 everywhere"))
    with pytest.raises(RuntimeError, match="503 everywhere"):
        await _handle_with(p, core_api, grade)
    core_api.create_grading.assert_not_awaited()


async def test_setting_grading_runs_to_one_turns_the_ensemble_off(pipeline, core_api, config):
    p, _ = pipeline
    config.get.side_effect = lambda key: "1" if key == "llm.grading_runs" else None
    grade = AsyncMock(return_value=_result(2, 1))
    await _handle_with(p, core_api, grade)
    assert grade.await_count == 1
