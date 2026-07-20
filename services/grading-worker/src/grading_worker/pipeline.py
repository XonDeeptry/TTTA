"""Orchestrate MỘT submission (mục 3.6, luồng nộp bài) — hàm này là handler truyền vào
`RabbitConsumer.consume(Q_SUBMISSIONS, ...)`. Bất kỳ exception nào ở đây khiến message được
republish vào retry/DLQ bởi rabbit_consumer — pipeline không tự nuốt lỗi, chỉ chủ động dừng
sớm (return) cho các nhánh nghiệp vụ hợp lệ (chờ onboarding, hỏi định danh, bài quá dài,
tin ngoài luồng nộp bài).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable

import httpx

from . import contracts
from .config import MEDIA_ROOT, ConfigStore
from .core_api_client import CoreApiClient
from .grading.prompt import build_system_instruction, build_user_instruction
from .grading.providers.factory import grade_with_fallback
from .grading.schema import build_output_schema, validate_output
from .media.downloader import download_original
from .media.ffmpeg import extract_audio, probe_duration_sec
from .pricing import estimate_cost_usd

logger = logging.getLogger(__name__)

DEFAULT_MAX_CLIP_SEC = 7 * 60  # van chi phí mặc định (mục 3.5) nếu chưa cấu hình
_GRADABLE_KINDS = {"audio", "video"}

Publisher = Callable[[dict[str, Any]], Awaitable[None]]


def _abs_media_path(relative_path: str) -> str:
    return os.path.join(MEDIA_ROOT, relative_path)


class SubmissionPipeline:
    def __init__(self, core_api: CoreApiClient, config: ConfigStore, http: httpx.AsyncClient, publish: Publisher) -> None:
        self._core_api = core_api
        self._config = config
        self._http = http
        self._publish = publish

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
            await self._core_api.create_flag(
                submission_id, "tin text ngoài luồng nộp bài — bot không hội thoại (mục 3.6)"
            )
            logger.info("submission %s: text ngoài luồng -> flag, không trả lời", submission_id)
            return

        active_bindings = [b for b in bindings if b["status"] == "active"]
        if not active_bindings:
            await self._publish_outbound(msg.zaloUserId, "Tài khoản của em đang chờ kích hoạt, tư vấn sẽ liên hệ sớm nhé.")
            logger.info("submission %s: binding pending -> outbound onboarding, dừng", submission_id)
            return
        if len(active_bindings) > 1:
            names = ", ".join(b.get("displayName") or b["zaloUserId"] for b in active_bindings)
            await self._publish_outbound(msg.zaloUserId, f"Bài này của bạn nào vậy ạ? ({names})")
            logger.info("submission %s: nhiều học viên cùng Zalo -> hỏi định danh, dừng", submission_id)
            return

        if msg.kind not in _GRADABLE_KINDS:
            await self._core_api.create_flag(submission_id, f"kind='{msg.kind}' không phải audio/video — không tự động chấm")
            return

        student_id = active_bindings[0]["studentId"]
        await self._core_api.update_submission(submission_id, {"studentId": student_id, "status": "processing"})

        student = await self._core_api.get_student(student_id)
        if student is None or student.get("courseId") is None:
            await self._core_api.create_flag(submission_id, "học viên chưa gán khóa — không có rubric để chấm")
            await self._core_api.update_submission(submission_id, {"status": "failed"})
            return

        media_path = await download_original(self._http, msg.mediaUrl, submission_id, msg.kind)
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
        await self._core_api.update_submission(submission_id, {"durationSec": int(duration_sec)})

        criteria = await self._core_api.get_criteria(student["courseId"])
        if criteria is None:
            await self._core_api.create_flag(submission_id, "chưa có tiêu chí (criteria) cho khóa này")
            await self._core_api.update_submission(submission_id, {"status": "failed"})
            return

        rubric = criteria["rubric"]
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
        )
        # Sai schema → để exception lan lên rabbit_consumer, republish retry → DLQ (mục 3.9).
        validate_output(schema, result.data)

        auto_send = bool(student.get("autoSend"))
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
        est_usd = estimate_cost_usd(result.provider, result.model, result.input_tokens, result.output_tokens)
        await self._core_api.create_cost_log(
            {
                "submissionId": submission_id,
                "provider": result.provider,
                "model": result.model,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "estUsd": est_usd,
            }
        )

        if auto_send:
            await self._core_api.update_submission(submission_id, {"status": "sent"})
            await self._publish_outbound(msg.zaloUserId, result.data["feedback"], submission_id=str(submission_id))
        else:
            # Kiểm duyệt (Tranh luận 4): giáo viên duyệt trên dashboard (M4) rồi core-api mới publish outbound.
            await self._core_api.update_submission(submission_id, {"status": "awaiting_review"})
            logger.info("submission %s: awaiting_review (grading %s)", submission_id, grading.get("id"))

    async def _publish_outbound(self, zalo_user_id: str, text: str, submission_id: str | None = None) -> None:
        message = contracts.OutboundMessage(zaloUserId=zalo_user_id, text=text, submissionId=submission_id)
        await self._publish(message.to_dict())
