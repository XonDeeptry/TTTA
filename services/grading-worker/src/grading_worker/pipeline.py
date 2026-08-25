"""Orchestrate MỘT submission (mục 3.6, luồng nộp bài) — hàm này là handler truyền vào
`RabbitConsumer.consume(Q_SUBMISSIONS, ...)`. Bất kỳ exception nào ở đây khiến message được
republish vào retry/DLQ bởi rabbit_consumer — pipeline không tự nuốt lỗi, chỉ chủ động dừng
sớm (return) cho các nhánh nghiệp vụ hợp lệ (chờ onboarding, hỏi định danh, bài quá dài,
tin ngoài luồng nộp bài).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import httpx

from . import contracts
from .buttons import build_reply_buttons, build_select_student_buttons, parse_ilm_payload
from .config import MEDIA_ROOT, ConfigStore
from .core_api_client import CoreApiClient
from .grading.prompt import (
    build_system_instruction,
    build_system_instruction_text,
    build_user_instruction,
    build_user_instruction_text,
)
from .grading.providers.factory import (
    grade_text_with_fallback,
    grade_with_fallback,
    transcribe_with_fallback,
)
from .grading.rubric_schema import normalize_rubric
from .grading.schema import build_output_schema, validate_output
from .media.downloader import download_original
from .media.ffmpeg import extract_audio, probe_duration_sec
from .pricing import estimate_cost_usd, parse_pricing_overrides

logger = logging.getLogger(__name__)

DEFAULT_MAX_CLIP_SEC = 7 * 60  # van chi phí mặc định (mục 3.5) nếu chưa cấu hình
_GRADABLE_KINDS = {"audio", "video"}

Publisher = Callable[[dict[str, Any]], Awaitable[None]]

# Sự kiện Zalo tương ứng từng `kind` — dùng khi F11 dựng lại SubmissionMessage để đẩy lại queue.
_EVENT_NAME_BY_KIND = {"audio": "user_send_audio", "video": "user_send_video"}


def _abs_media_path(relative_path: str) -> str:
    return os.path.join(MEDIA_ROOT, relative_path)


def _as_student_id(value: Any) -> int | None:
    """`submissions.student_id` đã gán (F11 FR-13) — chỉ chấp nhận số nguyên dương thật."""
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


class SubmissionPipeline:
    def __init__(
        self,
        core_api: CoreApiClient,
        config: ConfigStore,
        http: httpx.AsyncClient,
        publish: Publisher,
        publish_submission: Publisher | None = None,
    ) -> None:
        self._core_api = core_api
        self._config = config
        self._http = http
        self._publish = publish
        # F11 FR-12: đẩy LẠI bài đã được gán học viên vào queue `submissions` để chấm bình thường.
        # Mặc định None (mọi call site cũ chạy nguyên vẹn) — khi thiếu, nhánh select_student hạ
        # cấp về một dòng flag "cần chấm lại thủ công" thay vì âm thầm đánh mất bài.
        self._publish_submission = publish_submission

    async def handle(self, raw: dict[str, Any]) -> None:
        msg = contracts.SubmissionMessage.from_dict(raw)

        submission = await self._core_api.upsert_submission(
            {
                "messageId": msg.messageId,
                "zaloUserId": msg.zaloUserId,
                "kind": msg.kind,
                "mediaUrlZalo": msg.mediaUrl,
            }
        )
        submission_id = submission["id"]

        bindings = await self._core_api.ensure_binding(msg.zaloUserId)

        # Bot không hội thoại (mục 3.6) — mọi tin text ngoài luồng nộp bài đều KHÔNG được
        # bot trả lời, chỉ ghi flag cho tư vấn xử lý.
        if msg.kind == "text":
            # F11: nhánh nút bấm — TẬP ĐÓNG, chạy TRƯỚC nhánh flag. Trả False => rơi xuống
            # đúng những dòng flag cũ, không sao chép lại.
            if not await self._handle_button_payload(submission_id, msg):
                await self._core_api.create_flag(
                    submission_id, "tin text ngoài luồng nộp bài — bot không hội thoại (mục 3.6)"
                )
                logger.info("submission %s: text ngoài luồng -> flag, không trả lời", submission_id)
            return

        active_bindings = [b for b in bindings if b["status"] == "active"]
        # F11 FR-13: bài đã được gán học viên từ trước (lượt bấm nút `select_student`) thì dùng
        # thẳng, KHÔNG hỏi lại — đây là thứ làm cho lượt chấm lại kết thúc, không lặp vô hạn.
        student_id = _as_student_id(submission.get("studentId"))
        if student_id is None:
            if not active_bindings:
                await self._publish_outbound(msg.zaloUserId, "Tài khoản của em đang chờ kích hoạt, tư vấn sẽ liên hệ sớm nhé.")
                logger.info("submission %s: binding pending -> outbound onboarding, dừng", submission_id)
                return
            if len(active_bindings) > 1:
                names = ", ".join(b.get("displayName") or b["zaloUserId"] for b in active_bindings)
                # F11 AC-08.5/08.6: TEXT giữ nguyên từng chữ (tin vẫn tự giải thích được nếu
                # client không hiển thị nút); nút chỉ là phần thêm.
                await self._publish_outbound(
                    msg.zaloUserId,
                    f"Bài này của bạn nào vậy ạ? ({names})",
                    buttons=build_select_student_buttons(active_bindings, submission_id),
                )
                logger.info("submission %s: nhiều học viên cùng Zalo -> hỏi định danh, dừng", submission_id)
                return
            student_id = active_bindings[0]["studentId"]

        if msg.kind not in _GRADABLE_KINDS:
            await self._core_api.create_flag(submission_id, f"kind='{msg.kind}' không phải audio/video — không tự động chấm")
            return

        await self._core_api.update_submission(submission_id, {"studentId": student_id, "status": "processing"})

        student = await self._core_api.get_student(student_id)
        if student is None or student.get("courseId") is None:
            await self._core_api.create_flag(submission_id, "học viên chưa gán khóa — không có rubric để chấm")
            await self._core_api.update_submission(submission_id, {"status": "failed"})
            return

        # Test Upload (dashboard admin): core-api đã ghi file thẳng vào MEDIA_ROOT dùng chung
        # và gửi kèm mediaPath — bỏ qua bước tải Zalo, dùng thẳng path đó.
        media_path = (
            msg.mediaPath
            if msg.mediaPath
            else await download_original(self._http, msg.mediaUrl, submission_id, msg.kind)
        )
        await self._core_api.update_submission(submission_id, {"mediaPath": media_path})

        duration_sec = await probe_duration_sec(_abs_media_path(media_path))
        max_clip_sec = await self._config.get_int("limits.max_clip_duration_sec", DEFAULT_MAX_CLIP_SEC)
        if duration_sec > max_clip_sec:
            # Van chi phí chính (mục 3.5): đọc duration TRƯỚC KHI gọi LLM, từ chối chấm nếu quá dài.
            await self._core_api.update_submission(submission_id, {"status": "failed", "durationSec": int(duration_sec)})
            await self._publish_outbound(
                msg.zaloUserId,
                f"Clip dài {int(duration_sec // 60)} phút, vượt giới hạn {max_clip_sec // 60} phút. "
                "Em gửi lại clip ngắn hơn giúp mình nhé.",
            )
            logger.info("submission %s: clip quá dài (%ss > %ss) -> từ chối chấm", submission_id, duration_sec, max_clip_sec)
            return

        # Luôn tách/chuẩn hóa về audio.mp3 dù đầu vào là audio hay video — đơn giản hóa mime
        # type gửi LLM về một loại duy nhất, ffmpeg xử lý cả hai trường hợp như nhau.
        audio_path = await extract_audio(_abs_media_path(media_path))
        # Đánh dấu mốc tách audio để cron vòng đời media (mục 3.8) biết được phép xóa video gốc
        # sau 7 ngày mà không mất bản audio.
        await self._core_api.update_submission(
            submission_id,
            {"durationSec": int(duration_sec), "audioExtractedAt": datetime.now(timezone.utc).isoformat()},
        )

        criteria = await self._core_api.get_criteria(student["courseId"])
        if criteria is None:
            await self._core_api.create_flag(submission_id, "chưa có tiêu chí (criteria) cho khóa này")
            await self._core_api.update_submission(submission_id, {"status": "failed"})
            return

        # `GET /internal/criteria/:courseId` cố ý trả rubric NGUYÊN TRẠNG như trong DB (có thể
        # là v1 cũ) — nâng lên v2 đúng MỘT LẦN ở đây rồi dùng chung cho schema, prompt audio và
        # nhánh pilot text. Không có gì được ghi ngược lại core-api (BR-01/FR-16).
        rubric = normalize_rubric(criteria["rubric"])
        schema = build_output_schema(rubric)
        system_instruction = build_system_instruction(rubric)
        user_instruction = build_user_instruction()
        llm_config = student["llmConfig"] or {}

        result = await grade_with_fallback(
            llm_config,
            self._config,
            system_instruction=system_instruction,
            user_instruction=user_instruction,
            audio_path=audio_path,
            mime_type="audio/mp3",
            # `schema` BẮT BUỘC: `Provider.grade()` dùng nó làm response_format để ép LLM trả đúng
            # JSON. Thiếu nó thì `grade_with_fallback` (nhận **grade_kwargs: Any) vẫn qua được
            # type check nhưng vỡ TypeError lúc chạy thật — nhánh pilot text đã truyền đúng, chỉ
            # nhánh audio này sót. Phát hiện khi chấm thử clip thật đầu tiên, không phải bởi test:
            # mọi test đều patch `grade_with_fallback` bằng AsyncMock trần nên nuốt sạch mọi tham số.
            schema=schema,
        )
        # Sai schema → để exception lan lên rabbit_consumer, republish retry → DLQ (mục 3.9).
        validate_output(schema, result.data)

        # testMode (Test Upload, dashboard admin): luôn awaiting_review — binding test là giả
        # (test:{studentId}), không bao giờ tự gửi dù lớp có autoSend=true.
        auto_send = bool(student.get("autoSend")) and not msg.testMode
        grading = await self._core_api.create_grading(
            {
                "submissionId": submission_id,
                "criteriaId": criteria["id"],
                "criteriaVersion": criteria["version"],
                "scores": result.data["scores"],
                "llmFeedback": result.data["feedback"],
                "autoSent": auto_send,
            }
        )
        est_usd = estimate_cost_usd(result.provider, result.model, result.input_tokens, result.output_tokens, await self._pricing_overrides())
        await self._core_api.create_cost_log(
            {
                "submissionId": submission_id,
                "provider": result.provider,
                "model": result.model,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "estUsd": est_usd,
                "callType": "audio_grade",
            }
        )

        if auto_send:
            await self._core_api.update_submission(submission_id, {"status": "sent"})
            # F11 FR-07: nút lấy từ cấu hình rubric (`student_reply.buttons`); KHÔNG có bộ nút
            # mặc định cứng — rubric không khai báo thì tin nhắn y hệt trước F11.
            await self._publish_outbound(
                msg.zaloUserId,
                result.data["feedback"],
                submission_id=str(submission_id),
                buttons=build_reply_buttons(rubric.get("student_reply"), grading.get("id")),
            )
        else:
            # Kiểm duyệt (Tranh luận 4): giáo viên duyệt trên dashboard (M4) rồi core-api mới publish outbound.
            await self._core_api.update_submission(submission_id, {"status": "awaiting_review"})
            logger.info("submission %s: awaiting_review (grading %s)", submission_id, grading.get("id"))

        # Pilot A/B (bước CUỐI CÙNG, sau khi nhánh audio đã commit hoàn toàn): chấm thêm nhánh
        # text để đối chiếu. Bọc kín để KHÔNG exception nào lọt ra — pilot lỗi không được ảnh
        # hưởng kết quả chấm audio đã gửi/chờ duyệt, cũng không được kích retry cả message.
        # Cờ TẮT → get_bool short-circuit, đường audio không phát sinh call/cost row nào.
        try:
            if await self._config.get_bool("limits.pilot_dual_grading", False):
                await self._run_pilot_text_grading(submission_id, msg, student, criteria, rubric, schema, audio_path)
        except Exception:
            logger.exception("submission %s: pilot text grading failed (bỏ qua, không ảnh hưởng chấm audio)", submission_id)

    async def _run_pilot_text_grading(
        self,
        submission_id: int,
        msg: Any,
        student: dict[str, Any],
        criteria: dict[str, Any],
        rubric: dict[str, Any],
        schema: dict[str, Any],
        audio_path: str,
    ) -> None:
        """Pilot A/B nhánh text (transcript-only) — chạy SONG SONG nhánh audio để đối chiếu
        chất lượng/chi phí. TUYỆT ĐỐI không publish outbound (không gửi học viên): chỉ transcribe
        → chấm text → lưu bản ghi pilot + 2 dòng cost_log (transcription, text_grade)."""
        llm_config = student["llmConfig"] or {}

        # (1) Chép lời từ chính audio.mp3 đã tách ở nhánh audio → cost_log callType='transcription'.
        transcript = await transcribe_with_fallback(
            llm_config,
            self._config,
            audio_path=audio_path,
            mime_type="audio/mp3",
        )
        await self._core_api.create_cost_log(
            {
                "submissionId": submission_id,
                "provider": transcript.provider,
                "model": transcript.model,
                "inputTokens": transcript.input_tokens,
                "outputTokens": transcript.output_tokens,
                "estUsd": estimate_cost_usd(transcript.provider, transcript.model, transcript.input_tokens, transcript.output_tokens, await self._pricing_overrides()),
                "callType": "transcription",
            }
        )

        # (2) Chấm dựa trên transcript (prompt text riêng, không audio) → cost_log callType='text_grade'.
        system_instruction = build_system_instruction_text(rubric)
        user_instruction = build_user_instruction_text()
        result = await grade_text_with_fallback(
            llm_config,
            self._config,
            system_instruction=system_instruction,
            user_instruction=user_instruction,
            transcript=transcript.text,
            schema=schema,
        )
        validate_output(schema, result.data)
        await self._core_api.create_cost_log(
            {
                "submissionId": submission_id,
                "provider": result.provider,
                "model": result.model,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "estUsd": estimate_cost_usd(result.provider, result.model, result.input_tokens, result.output_tokens, await self._pricing_overrides()),
                "callType": "text_grade",
            }
        )

        # (3) Lưu bản ghi pilot để đối chiếu (không bao giờ gửi học viên).
        await self._core_api.create_pilot_text_grading(
            {
                "submissionId": submission_id,
                "criteriaId": criteria["id"],
                "criteriaVersion": criteria["version"],
                "transcript": transcript.text,
                "scores": result.data["scores"],
                "llmFeedback": result.data["feedback"],
                "provider": result.provider,
                "model": result.model,
            }
        )
        logger.info("submission %s: pilot text grading xong (provider=%s)", submission_id, result.provider)

    # ─── F11: nhánh nút bấm ──────────────────────────────────────────────────────────────

    async def _handle_button_payload(self, submission_id: int, msg: Any) -> bool:
        """True = đã xử lý như một cú bấm nút (dừng ở đây). False = KHÔNG phải nút ⇒ gọi hàm
        này xong thì rơi xuống đúng nhánh flag cũ.

        Trả True cả khi hành động thất bại kiểm tra chủ sở hữu/trạng thái: những ca đó tự ghi
        một dòng flag RIÊNG, để tư vấn phân biệt được cú bấm giả mạo/lỗi thời với tin nhắn
        thường (AC-09.7). KHÔNG hành động nào publish outbound — bot vẫn không trả lời.
        """
        parsed = parse_ilm_payload(msg.text)
        if parsed is None:
            return False
        action, args = parsed

        if action == "ack":
            await self._handle_ack(submission_id, msg.zaloUserId, args[0])
        elif action == "request_advisor":
            # Ghi flag lên CHÍNH bài của cú bấm (bài này chắc chắn thuộc người gửi) ⇒ hành động
            # này không có bề mặt ghi chéo học viên nào. Id trong lý do được bảo đảm toàn chữ số
            # bởi parser, nên không có chữ nào của học viên lọt vào chuỗi này (BR-06).
            await self._core_api.create_flag(submission_id, f"học viên bấm nút nhờ tư vấn (grading {args[0]})")
            logger.info("submission %s: nút #ilm:%s -> %s", submission_id, action, "ghi flag cho tư vấn")
        elif action == "select_student":
            await self._handle_select_student(submission_id, msg.zaloUserId, args[0], args[1])
        return True

    async def _handle_ack(self, submission_id: int, zalo_user_id: str, grading_id: int) -> None:
        status, data = await self._core_api.student_ack(grading_id, zalo_user_id)
        if status in (403, 404):
            why = "không thuộc người gửi" if status == 403 else "không tồn tại"
            await self._core_api.create_flag(
                submission_id, f"nút #ilm:ack không hợp lệ (grading {grading_id}) — {why}"
            )
            logger.warning("submission %s: nút #ilm:ack -> từ chối %s (%s)", submission_id, status, why)
            return
        outcome = "đã đóng dấu trước đó" if (data or {}).get("alreadyAcked") else "đóng dấu studentAckAt"
        logger.info("submission %s: nút #ilm:%s -> %s", submission_id, "ack", outcome)

    async def _handle_select_student(
        self, submission_id: int, zalo_user_id: str, binding_id: int, target_submission_id: int
    ) -> None:
        status, row = await self._core_api.select_student(target_submission_id, zalo_user_id, binding_id)
        if status != 200:
            why = {
                404: "bài không tồn tại",
                409: "bài đã được gán trước đó",
            }.get(status) or (
                "binding không hợp lệ" if (row or {}).get("code") == "invalid_binding" else "không thuộc người gửi"
            )
            await self._core_api.create_flag(
                submission_id, f"nút #ilm:select_student không hợp lệ (bài {target_submission_id}) — {why}"
            )
            logger.warning("submission %s: nút #ilm:select_student -> từ chối %s (%s)", submission_id, status, why)
            return

        row = row or {}
        if self._publish_submission is None:
            await self._core_api.create_flag(
                submission_id, f"học viên đã chọn học viên {row.get('studentId')} — cần chấm lại thủ công"
            )
            logger.warning("submission %s: nút #ilm:select_student -> thiếu publisher, ghi flag", submission_id)
            return

        # Đẩy lại NGUYÊN bài gốc vào queue `submissions`. An toàn khi lặp: `POST /internal/
        # submissions` upsert theo `messageId`, và lượt sau thấy `studentId` đã có nên không
        # bao giờ hỏi định danh lần nữa (FR-13) ⇒ vòng lặp kết thúc, bài chỉ được chấm một lần.
        kind = row.get("kind")
        await self._publish_submission(
            {
                "v": 1,
                "messageId": row.get("messageId"),
                "eventName": _EVENT_NAME_BY_KIND.get(kind, f"user_send_{kind}"),
                "kind": kind,
                "zaloUserId": row.get("zaloUserId"),
                "mediaUrl": row.get("mediaUrlZalo"),
                "receivedAt": row.get("receivedAt"),
            }
        )
        logger.info(
            "submission %s: nút #ilm:%s -> %s",
            submission_id,
            "select_student",
            f"gán học viên {row.get('studentId')} cho bài {target_submission_id}, đẩy lại queue",
        )

    async def _pricing_overrides(self) -> dict[str, tuple[float, float]]:
        """Bảng giá bổ sung từ setting `llm.pricing_json` — đọc mỗi lần dùng để đổi giá trên
        dashboard có hiệu lực ngay, không phải khởi động lại worker."""
        return parse_pricing_overrides(await self._config.get("llm.pricing_json"))

    async def _publish_outbound(
        self,
        zalo_user_id: str,
        text: str,
        submission_id: str | None = None,
        buttons: list[contracts.OutboundButton] | None = None,
    ) -> None:
        message = contracts.OutboundMessage(
            zaloUserId=zalo_user_id, text=text, submissionId=submission_id, buttons=buttons
        )
        await self._publish(message.to_dict())
