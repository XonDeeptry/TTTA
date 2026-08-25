"""F11 — định tuyến nhánh nút bấm trong `pipeline.handle`.

Ưu tiên số một của bộ test này là FR-09: **mọi** tin text không phải payload nút hợp lệ phải đi
qua ĐÚNG những dòng flag đang chạy hôm nay — cùng một lý do, không outbound, không gọi endpoint
mới. Đó là toàn bộ cơ sở để nới ranh giới "bot không hội thoại với học sinh".
"""

import contextlib
from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.grading.providers.base import GradingResult
from grading_worker.pipeline import SubmissionPipeline

from test_buttons import AC_09_4_FALL_THROUGH  # cùng thư mục tests/ (không phải package)

PRE_F11_FLAG_REASON = "tin text ngoài luồng nộp bài — bot không hội thoại (mục 3.6)"

RUBRIC_WITH_BUTTONS = {
    "schema_version": 2,
    "course_key": "basic",
    "scale": {"min": 0, "max": 3, "step": 1},
    "dimensions": [
        {"key": "fluency", "label": "Trôi chảy", "weight": 0.5, "bands": {"0": ["kém"], "3": ["tốt"]}},
        {"key": "pronunciation", "label": "Phát âm", "weight": 0.5, "bands": {"0": ["kém"], "3": ["tốt"]}},
    ],
    "student_reply": {
        "show_total": True,
        "show_level": True,
        "template": "{{feedback}}",
        "buttons": [
            {"title": "Em đã xem", "action": "ack"},
            {"title": "Nhờ cô giải thích thêm", "action": "request_advisor"},
        ],
    },
}

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


def text_message(text, **overrides):
    msg = {
        "v": 1,
        "messageId": "msg-tap",
        "eventName": "user_send_text",
        "kind": "text",
        "zaloUserId": "zalo-1",
        "text": text,
        "receivedAt": "2026-08-20T00:00:00.000Z",
    }
    msg.update(overrides)
    return msg


@pytest.fixture
def core_api():
    api = AsyncMock()
    api.upsert_submission.return_value = {"id": 1}
    api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    api.student_ack.return_value = (200, {"id": 5, "studentAckAt": "2026-08-20T10:00:00Z", "alreadyAcked": False})
    api.select_student.return_value = (
        200,
        {
            "id": 50,
            "messageId": "msg-orig",
            "zaloUserId": "zalo-1",
            "kind": "audio",
            "mediaUrlZalo": "https://zalo/clip.m4a",
            "receivedAt": "2026-08-20T09:00:00.000Z",
            "studentId": 77,
            "status": "received",
        },
    )
    return api


@pytest.fixture
def config():
    cfg = AsyncMock()
    cfg.get_int.return_value = 420
    cfg.get_bool.return_value = False
    return cfg


@pytest.fixture
def pipeline(core_api, config):
    publish = AsyncMock()
    publish_submission = AsyncMock()
    p = SubmissionPipeline(
        core_api, config, http=AsyncMock(), publish=publish, publish_submission=publish_submission
    )
    return p, publish, publish_submission


# ─── FR-09: nhánh rơi xuống (cơ chế an toàn) ────────────────────────────────────────────


@pytest.mark.parametrize("text", AC_09_4_FALL_THROUGH)
async def test_ac_09_4_and_09_5_every_non_payload_text_reaches_the_untouched_flag_path(text, pipeline, core_api):
    p, publish, publish_submission = pipeline

    await p.handle(text_message(text))

    core_api.create_flag.assert_awaited_once_with(1, PRE_F11_FLAG_REASON)
    publish.assert_not_called()  # zero outbound
    publish_submission.assert_not_called()
    core_api.student_ack.assert_not_called()  # zero calls to the new endpoints
    core_api.select_student.assert_not_called()


async def test_ac_09_6_the_pre_f11_call_sequence_is_unchanged_for_ordinary_text(pipeline, core_api):
    p, publish, _ = pipeline

    await p.handle(text_message("Cô ơi học phí tháng này bao nhiêu ạ?"))

    core_api.upsert_submission.assert_awaited_once()
    core_api.ensure_binding.assert_awaited_once_with("zalo-1")
    core_api.create_flag.assert_awaited_once_with(1, PRE_F11_FLAG_REASON)
    core_api.get_student.assert_not_called()
    core_api.update_submission.assert_not_called()
    publish.assert_not_called()


async def test_ac_09_8_a_caption_starting_with_the_prefix_on_an_audio_submission_is_still_graded(pipeline, core_api):
    """Nhánh nút CHỈ chạy với kind='text' — chú thích trên một bài audio vẫn phải được chấm."""
    p, _publish, _ = pipeline
    core_api.get_student.return_value = {"id": 10, "courseId": 1, "llmConfig": {}, "autoSend": False}
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC_WITH_BUTTONS}
    core_api.create_grading.return_value = {"id": 99}

    with contextlib.ExitStack() as stack:
        for cm in (
            patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/08/1/o.m4a")),
            patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
            patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/audio.mp3")),
            patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)),
        ):
            stack.enter_context(cm)
        await p.handle(text_message("#ilm:ack:5", kind="audio", eventName="user_send_audio", mediaUrl="https://z/c.m4a"))

    core_api.student_ack.assert_not_called()
    core_api.create_grading.assert_awaited_once()


# ─── FR-10: ack ─────────────────────────────────────────────────────────────────────────


async def test_ac_10_7_ack_uses_the_gateway_derived_sender_never_the_payload(pipeline, core_api):
    p, publish, _ = pipeline

    await p.handle(text_message("#ilm:ack:5"))

    core_api.student_ack.assert_awaited_once_with(5, "zalo-1")
    core_api.create_flag.assert_not_called()
    publish.assert_not_called()  # AC-09.10: bot không trả lời


async def test_ac_10_4_a_second_tap_is_silent_too(pipeline, core_api):
    p, publish, _ = pipeline
    core_api.student_ack.return_value = (200, {"id": 5, "alreadyAcked": True})

    await p.handle(text_message("#ilm:ack:5"))

    core_api.create_flag.assert_not_called()
    publish.assert_not_called()


@pytest.mark.parametrize("status,fragment", [(403, "không thuộc người gửi"), (404, "không tồn tại")])
async def test_ac_10_8_a_rejected_ack_is_terminal_and_flagged_distinctly(status, fragment, pipeline, core_api):
    p, publish, _ = pipeline
    core_api.student_ack.return_value = (status, None)

    await p.handle(text_message("#ilm:ack:5"))  # phải KHÔNG ném lỗi (retry không bao giờ cứu được)

    reason = core_api.create_flag.await_args.args[1]
    assert "#ilm:ack" in reason and fragment in reason
    assert reason != PRE_F11_FLAG_REASON  # phân biệt được với tin nhắn thường
    publish.assert_not_called()


async def test_ac_10_9_a_5xx_propagates_so_the_existing_retry_dlq_loop_applies(pipeline, core_api):
    p, _publish, _ = pipeline
    core_api.student_ack.side_effect = RuntimeError("core-api 500")

    with pytest.raises(RuntimeError):
        await p.handle(text_message("#ilm:ack:5"))


# ─── FR-11: request_advisor ─────────────────────────────────────────────────────────────


async def test_ac_11_1_to_11_5_request_advisor_flags_its_own_submission_and_never_replies(pipeline, core_api):
    p, publish, _ = pipeline

    await p.handle(text_message("#ilm:request_advisor:5"))

    core_api.create_flag.assert_awaited_once_with(1, "học viên bấm nút nhờ tư vấn (grading 5)")
    publish.assert_not_called()
    core_api.update_submission.assert_not_called()  # AC-11.6: status vẫn 'received'
    core_api.student_ack.assert_not_called()


async def test_ac_11_4_a_non_existent_grading_id_is_not_validated(pipeline, core_api):
    p, _publish, _ = pipeline
    await p.handle(text_message("#ilm:request_advisor:999999999999"))
    assert core_api.create_flag.await_args.args[1] == "học viên bấm nút nhờ tư vấn (grading 999999999999)"


# ─── FR-12: select_student ──────────────────────────────────────────────────────────────


async def test_ac_12_6_a_successful_selection_republishes_the_original_submission(pipeline, core_api):
    p, publish, publish_submission = pipeline

    await p.handle(text_message("#ilm:select_student:9:50"))

    core_api.select_student.assert_awaited_once_with(50, "zalo-1", 9)
    publish_submission.assert_awaited_once_with(
        {
            "v": 1,
            "messageId": "msg-orig",
            "eventName": "user_send_audio",
            "kind": "audio",
            "zaloUserId": "zalo-1",
            "mediaUrl": "https://zalo/clip.m4a",
            "receivedAt": "2026-08-20T09:00:00.000Z",
        }
    )
    publish.assert_not_called()  # AC-12.9: không có tin "đã ghi nhận"
    core_api.create_flag.assert_not_called()


async def test_ac_12_7_without_a_submission_publisher_it_flags_instead_of_losing_the_clip(core_api, config):
    publish = AsyncMock()
    p = SubmissionPipeline(core_api, config, http=AsyncMock(), publish=publish)  # publish_submission mặc định None

    await p.handle(text_message("#ilm:select_student:9:50"))

    assert "cần chấm lại thủ công" in core_api.create_flag.await_args.args[1]
    publish.assert_not_called()


@pytest.mark.parametrize(
    "status,body,fragment",
    [
        (404, None, "bài không tồn tại"),
        (403, {"code": "not_owner"}, "không thuộc người gửi"),
        (403, {"code": "invalid_binding"}, "binding không hợp lệ"),
        (409, {"code": "already_selected"}, "bài đã được gán trước đó"),
    ],
)
async def test_ac_12_8_each_rejection_is_terminal_with_its_own_flag_reason(status, body, fragment, pipeline, core_api):
    p, publish, publish_submission = pipeline
    core_api.select_student.return_value = (status, body)

    await p.handle(text_message("#ilm:select_student:9:50"))  # không ném lỗi

    assert fragment in core_api.create_flag.await_args.args[1]
    publish.assert_not_called()
    publish_submission.assert_not_called()


# ─── FR-13: `submission.studentId` có quyền ưu tiên (làm cho lượt chấm lại kết thúc) ────


async def test_ac_12_11_and_13_1_the_re_driven_pass_does_not_ask_again(pipeline, core_api):
    """Vòng đầy đủ: hỏi định danh → bấm nút → đẩy lại queue → lượt hai chấm bình thường.
    Tin hỏi định danh chỉ được publish ĐÚNG MỘT LẦN trên cả hai lượt."""
    p, publish, publish_submission = pipeline
    core_api.ensure_binding.return_value = [
        {"id": 9, "status": "active", "studentId": 1, "displayName": "Nam", "zaloUserId": "zalo-1"},
        {"id": 10, "status": "active", "studentId": 2, "displayName": "Lan", "zaloUserId": "zalo-1"},
    ]
    core_api.get_student.return_value = {"id": 1, "courseId": 1, "llmConfig": {}, "autoSend": False}
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC_WITH_BUTTONS}
    core_api.create_grading.return_value = {"id": 99}

    # Lượt 1: bài audio chưa gán học viên ⇒ hỏi định danh KÈM nút, rồi dừng.
    core_api.upsert_submission.return_value = {"id": 50, "studentId": None}
    audio = {
        "v": 1,
        "messageId": "msg-orig",
        "eventName": "user_send_audio",
        "kind": "audio",
        "zaloUserId": "zalo-1",
        "mediaUrl": "https://zalo/clip.m4a",
        "receivedAt": "2026-08-20T09:00:00.000Z",
    }
    await p.handle(audio)

    assert publish.await_count == 1
    clarify = publish.await_args.args[0]
    assert clarify["text"] == "Bài này của bạn nào vậy ạ? (Nam, Lan)"  # AC-08.6: text không đổi
    assert clarify["buttons"] == [
        {"title": "Nam", "action": "select_student", "payload": "#ilm:select_student:9:50"},
        {"title": "Lan", "action": "select_student", "payload": "#ilm:select_student:10:50"},
    ]
    core_api.create_grading.assert_not_called()

    # Lượt 2: học viên bấm nút ⇒ core-api gán studentId, worker đẩy lại chính bài đó.
    core_api.upsert_submission.return_value = {"id": 1, "studentId": None}
    await p.handle(text_message(clarify["buttons"][1]["payload"]))
    publish_submission.assert_awaited_once()
    republished = publish_submission.await_args.args[0]

    # Lượt 3 (lượt chấm lại): submission đã có studentId ⇒ KHÔNG hỏi lại, chấm bình thường.
    core_api.upsert_submission.return_value = {"id": 50, "studentId": 77}
    with contextlib.ExitStack() as stack:
        for cm in (
            patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/08/50/o.m4a")),
            patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
            patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/audio.mp3")),
            patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)),
        ):
            stack.enter_context(cm)
        await p.handle(republished)

    assert publish.await_count == 1  # AC-12.11: tin hỏi định danh KHÔNG bị gửi lần thứ hai
    core_api.get_student.assert_awaited_with(77)  # dùng học viên đã gán, không phải binding[0]
    core_api.create_grading.assert_awaited_once()


async def test_ac_13_5_ensure_binding_still_runs_when_student_id_is_already_set(pipeline, core_api):
    p, _publish, _ = pipeline
    core_api.upsert_submission.return_value = {"id": 50, "studentId": 77}
    core_api.ensure_binding.return_value = []
    core_api.get_student.return_value = {"id": 77, "courseId": 1, "llmConfig": {}, "autoSend": False}
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC_WITH_BUTTONS}
    core_api.create_grading.return_value = {"id": 99}

    with contextlib.ExitStack() as stack:
        for cm in (
            patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/08/50/o.m4a")),
            patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
            patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/audio.mp3")),
            patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)),
        ):
            stack.enter_context(cm)
        await p.handle(
            {
                "v": 1,
                "messageId": "msg-orig",
                "eventName": "user_send_audio",
                "kind": "audio",
                "zaloUserId": "zalo-1",
                "mediaUrl": "https://zalo/clip.m4a",
                "receivedAt": "2026-08-20T09:00:00.000Z",
            }
        )

    core_api.ensure_binding.assert_awaited_once_with("zalo-1")  # binding vẫn được tạo cho user mới
    core_api.create_grading.assert_awaited_once()


# ─── FR-07: nút trên tin nhận xét tự động gửi ───────────────────────────────────────────


async def _run_auto_send(p, core_api, rubric):
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {"id": 10, "courseId": 1, "llmConfig": {}, "autoSend": True}
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": rubric}
    core_api.create_grading.return_value = {"id": 99}
    with contextlib.ExitStack() as stack:
        for cm in (
            patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/08/1/o.m4a")),
            patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
            patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/audio.mp3")),
            patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)),
        ):
            stack.enter_context(cm)
        await p.handle(
            {
                "v": 1,
                "messageId": "msg-a",
                "eventName": "user_send_audio",
                "kind": "audio",
                "zaloUserId": "zalo-1",
                "mediaUrl": "https://zalo/clip.m4a",
                "receivedAt": "2026-08-20T09:00:00.000Z",
            }
        )


async def test_ac_07_1_and_07_2_auto_send_feedback_carries_the_rubric_buttons(pipeline, core_api):
    p, publish, _ = pipeline
    await _run_auto_send(p, core_api, RUBRIC_WITH_BUTTONS)

    sent = publish.await_args.args[0]
    assert sent["text"] == "Em làm bài rất tốt!"  # AC-07.8: text không đổi
    assert sent["buttons"] == [
        {"title": "Em đã xem", "action": "ack", "payload": "#ilm:ack:99"},
        {"title": "Nhờ cô giải thích thêm", "action": "request_advisor", "payload": "#ilm:request_advisor:99"},
    ]


async def test_ac_07_4_a_rubric_without_student_reply_sends_the_pre_f11_plain_message(pipeline, core_api):
    p, publish, _ = pipeline
    rubric = dict(RUBRIC_WITH_BUTTONS)
    rubric.pop("student_reply")
    await _run_auto_send(p, core_api, rubric)

    sent = publish.await_args.args[0]
    assert "buttons" not in sent
    assert sent == {"v": 1, "zaloUserId": "zalo-1", "text": "Em làm bài rất tốt!", "submissionId": "1"}


async def test_ac_07_9_the_awaiting_review_branch_publishes_nothing(pipeline, core_api):
    p, publish, _ = pipeline
    core_api.get_student.return_value = {"id": 10, "courseId": 1, "llmConfig": {}, "autoSend": False}
    core_api.get_criteria.return_value = {"id": 5, "version": 2, "rubric": RUBRIC_WITH_BUTTONS}
    core_api.create_grading.return_value = {"id": 99}
    with contextlib.ExitStack() as stack:
        for cm in (
            patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/08/1/o.m4a")),
            patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=100.0)),
            patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/audio.mp3")),
            patch("grading_worker.pipeline.grade_with_fallback", new=AsyncMock(return_value=GRADING_RESULT)),
        ):
            stack.enter_context(cm)
        await p.handle(
            {
                "v": 1,
                "messageId": "msg-a",
                "eventName": "user_send_audio",
                "kind": "audio",
                "zaloUserId": "zalo-1",
                "mediaUrl": "https://zalo/clip.m4a",
                "receivedAt": "2026-08-20T09:00:00.000Z",
            }
        )
    publish.assert_not_called()


async def test_ac_07_10_and_br_12_onboarding_and_too_long_messages_stay_plain_text(pipeline, core_api, config):
    p, publish, _ = pipeline

    core_api.ensure_binding.return_value = [{"status": "pending", "studentId": None, "zaloUserId": "zalo-1"}]
    await p.handle(
        {
            "v": 1,
            "messageId": "msg-a",
            "eventName": "user_send_audio",
            "kind": "audio",
            "zaloUserId": "zalo-1",
            "mediaUrl": "https://zalo/clip.m4a",
            "receivedAt": "2026-08-20T09:00:00.000Z",
        }
    )
    assert "buttons" not in publish.await_args.args[0]

    publish.reset_mock()
    core_api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    core_api.get_student.return_value = {"id": 10, "courseId": 1, "llmConfig": {}, "autoSend": True}
    config.get_int.return_value = 60
    with contextlib.ExitStack() as stack:
        for cm in (
            patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/08/1/o.m4a")),
            patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=300.0)),
        ):
            stack.enter_context(cm)
        await p.handle(
            {
                "v": 1,
                "messageId": "msg-b",
                "eventName": "user_send_audio",
                "kind": "audio",
                "zaloUserId": "zalo-1",
                "mediaUrl": "https://zalo/clip.m4a",
                "receivedAt": "2026-08-20T09:00:00.000Z",
            }
        )
    assert "buttons" not in publish.await_args.args[0]
