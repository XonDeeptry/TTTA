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
from urllib.parse import urlparse

import httpx

from . import contracts
from .buttons import build_reply_buttons, build_select_student_buttons, parse_ilm_payload
from .config import MEDIA_ROOT, ConfigStore
from .core_api_client import CoreApiClient
from .grading.prompt import build_system_instruction, build_user_instruction
from .grading.providers.factory import grade_with_fallback
from .grading.rubric_schema import normalize_rubric
from .grading.schema import build_output_schema, validate_output
from .media.downloader import download_original
from .media.ffmpeg import FfmpegError, extract_audio, probe_duration_sec
from .pricing import estimate_cost_usd, parse_pricing_overrides

logger = logging.getLogger(__name__)

DEFAULT_MAX_CLIP_SEC = 7 * 60  # van chi phí mặc định (mục 3.5) nếu chưa cấu hình
_GRADABLE_KINDS = {"audio", "video"}

# Học viên rất thường thu âm bằng app khác rồi GỬI KÈM DẠNG TỆP, không phải tin nhắn thoại —
# Zalo sinh ra `user_send_file` (kind='file') chứ không phải `user_send_audio`. Trước 2026-09-06
# những bài đó rơi thẳng vào flag và học viên không nhận được phản hồi nào.
#
# Danh sách này chỉ là LỌC RẺ ở vòng ngoài để khỏi tải về một file .pdf/.zip vô ích. Trọng tài
# THẬT vẫn là `ffprobe` sau khi tải (xem `_probe_or_reject`): đuôi file do người dùng đặt nên
# không đáng tin theo cả hai chiều — .pdf đổi tên thành .mp3 vẫn bị ffprobe loại, còn file media
# không có đuôi vẫn được nhận nhờ ffprobe đọc được nội dung.
_MEDIA_FILE_EXTS = {
    "m4a", "mp3", "wav", "aac", "ogg", "oga", "opus", "amr", "flac", "wma", "3gp", "3gpp",
    "mp4", "mov", "mkv", "webm", "avi", "m4v", "mpeg", "mpg",
}


def _file_may_be_media(url: str | None) -> bool:
    """True khi tệp ĐÁNG để tải về rồi cho ffprobe phán. Không có đuôi => vẫn thử, vì URL của
    Zalo không phải lúc nào cũng mang tên tệp; chỉ loại khi đuôi rõ ràng KHÔNG phải media."""
    if not url:
        return False
    ext = os.path.splitext(urlparse(url).path)[1].lstrip(".").lower()
    return ext in _MEDIA_FILE_EXTS if ext else True

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

        # `file` được chấp nhận CÓ ĐIỀU KIỆN: học viên thu âm bằng app khác rồi gửi kèm tệp là
        # trường hợp dùng thật, không phải ngoại lệ hiếm. Đuôi tệp chỉ dùng để loại sớm; quyết
        # định cuối thuộc về ffprobe sau khi tải (mục `_probe_or_reject`).
        is_gradable = msg.kind in _GRADABLE_KINDS or (msg.kind == "file" and _file_may_be_media(msg.mediaUrl))
        if not is_gradable:
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

        duration_sec = await self._probe_or_reject(submission_id, media_path, msg.kind)
        if duration_sec is None:
            return
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

        criteria = await self._core_api.get_criteria(student["courseId"], student.get("className"))
        if criteria is None:
            await self._core_api.create_flag(submission_id, "chưa có tiêu chí (criteria) cho khóa này")
            await self._core_api.update_submission(submission_id, {"status": "failed"})
            return

        # `GET /internal/criteria/:courseId` cố ý trả rubric NGUYÊN TRẠNG như trong DB (có thể
        # là v1 cũ) — nâng lên v2 đúng MỘT LẦN ở đây rồi dùng chung cho schema và prompt.
        # Không có gì được ghi ngược lại core-api (BR-01/FR-16).
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
            # type check nhưng vỡ TypeError lúc chạy thật. Phát hiện khi chấm thử clip thật đầu
            # tiên chứ không phải bởi test:
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

    async def _probe_or_reject(self, submission_id: int, media_path: str, kind: str) -> float | None:
        """Đo độ dài clip. Trả None = đã xử lý xong nhánh từ chối, caller phải `return`.

        Phân biệt QUAN TRỌNG giữa hai loại thất bại của ffprobe:
          - `kind` là audio/video: Zalo đã khẳng định đây là media, nên ffprobe hỏng nghĩa là
            có sự cố thật (tải thiếu byte, đĩa lỗi, ffmpeg hỏng). GIỮ NGUYÊN hành vi cũ — ném
            exception để `rabbit_consumer` retry rồi đẩy DLQ, vì thử lại có thể thành công.
          - `kind='file'`: người dùng gửi tệp bất kỳ, ffprobe hỏng chỉ có nghĩa "đây không phải
            file âm thanh". Thử lại 3 lần rồi vào DLQ là vô nghĩa và làm nhiễu hàng đợi lỗi —
            ghi flag cho tư vấn rồi dừng, đúng như mọi nhánh nghiệp vụ hợp lệ khác.
        """
        try:
            return await probe_duration_sec(_abs_media_path(media_path))
        except FfmpegError:
            if kind != "file":
                raise
            await self._core_api.create_flag(
                submission_id, "tệp đính kèm không đọc được như audio/video — không tự động chấm"
            )
            await self._core_api.update_submission(submission_id, {"status": "failed"})
            logger.info("submission %s: file không phải media (ffprobe từ chối) -> flag, dừng", submission_id)
            return None

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
