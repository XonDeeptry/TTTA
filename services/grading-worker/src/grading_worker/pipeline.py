"""Orchestrate MỘT submission (mục 3.6, luồng nộp bài) — hàm này là handler truyền vào
`RabbitConsumer.consume(Q_SUBMISSIONS, ...)`. Bất kỳ exception nào ở đây khiến message được
republish vào retry/DLQ bởi rabbit_consumer — pipeline không tự nuốt lỗi, chỉ chủ động dừng
sớm (return) cho các nhánh nghiệp vụ hợp lệ (chờ onboarding, hỏi định danh, bài quá dài,
tin ngoài luồng nộp bài).
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from . import contracts
from .buttons import build_reply_buttons, build_select_student_buttons, parse_ilm_payload
from .config import MEDIA_ROOT, ConfigStore
from .core_api_client import CoreApiClient
import copy

from .grading import azure_pa, clip_analysis, delivery, ensemble, evidence, intended_transcript, measures
from .grading.providers.base import GradingResult
from .grading.comment_scripts import band_key, cell_key, choose_band_scripts, merge_template_scripts
from .grading.prompt import build_system_instruction, build_user_instruction
from .grading.providers.factory import grade_with_fallback
from .grading.rubric_schema import normalize_rubric
from .grading.schema import build_output_schema, validate_output
from .media.downloader import download_original
from .media.ffmpeg import FfmpegError, extract_audio, probe_duration_sec, to_wav_16k_mono
from .pricing import estimate_cost_usd, parse_pricing_overrides

logger = logging.getLogger(__name__)

DEFAULT_MAX_CLIP_SEC = 7 * 60  # van chi phí mặc định (mục 3.5) nếu chưa cấu hình
# Clip dài từ ngần này trở lên mà Azure không ra đoạn nào ⇒ Azure hỏng, không phải "bài im lặng".
AZURE_MIN_SPEECH_SEC = 5
# Số lượt chấm Gemini song song để lấy trung vị (setting `llm.grading_runs`, 1 = tắt).
DEFAULT_GRADING_RUNS = 3
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
                # MỘT tin onboarding mỗi 24h cho mỗi người, không phải mỗi bài nộp. Người gửi 5
                # clip liên tiếp lúc chưa được kích hoạt sẽ nhận 5 tin giống hệt — vừa phiền học
                # viên thật, vừa là 5 lượt gọi API Zalo miễn phí cho kẻ phá hoại.
                if await self._config.claim_once_per_day(f"onboarding_sent:{msg.zaloUserId}"):
                    await self._publish_outbound(
                        msg.zaloUserId, "Tài khoản của em đang chờ kích hoạt, tư vấn sẽ liên hệ sớm nhé."
                    )
                    logger.info("submission %s: binding pending -> outbound onboarding, dừng", submission_id)
                else:
                    logger.info("submission %s: binding pending, đã gửi onboarding trong 24h -> chỉ dừng", submission_id)
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
        reading = student.get("readingText")
        rubric = azure_pa.drop_unmeasurable(rubric, isinstance(reading, str) and bool(reading.strip()))
        schema = build_output_schema(rubric)
        # Học thuật 2026-10-03: mỗi bài một kịch bản nhận xét ngẫu nhiên / tiêu chí × band (hạt giống
        # = id bài ⇒ retry ra đúng kịch bản cũ).
        prompt_rubric = merge_template_scripts(rubric, criteria.get("templateScripts") or [])
        # Xoay ngẫu nhiên, không lặp kịch bản bài trước của chính học viên này (chủ dự án 2026-10-03).
        picked_rubric, script_picks = choose_band_scripts(
            prompt_rubric, random.Random(), await self._config.last_scripts(student_id)
        )
        system_instruction = build_system_instruction(picked_rubric)
        if azure_pa.is_ielts(rubric):
            # Nói tự do IELTS: phân loại tự nhiên / học thuộc / đọc — CHỈ gắn cờ, không chặn điểm
            # (chủ dự án 2026-10-03). Nằm ngoài bản song sinh prompt-render.ts giống dữ kiện Azure.
            schema = delivery.with_delivery(schema)
            system_instruction += "\n" + delivery.INSTRUCTION
            # "Đo → Đếm → Viết" giai đoạn 1 (Idea/20261003-DoDemViet.md): trích bằng chứng trong CÙNG
            # lượt chấm — chạy ngầm, chỉ lưu để so với giáo viên, không đổi điểm.
            schema = evidence.with_evidence(schema)
            system_instruction += "\n" + evidence.INSTRUCTION
        user_instruction = build_user_instruction()
        llm_config = student["llmConfig"] or {}

        # D149: có khóa Azure ⇒ Azure đo điểm từ tín hiệu âm thanh; Gemini nhận các điểm đó như dữ
        # kiện ĐÃ CHỐT và chỉ viết nhận xét (cùng các tiêu chí Azure không đo được — D150).
        facts, measured, wav_path = await self._azure_assessment(submission_id, audio_path, rubric, student, duration_sec)
        if facts is not None:
            system_instruction += "\n" + azure_pa.build_facts_instruction(rubric, facts, measured)

        # 2026-10-03: chấm N lượt song song, lấy TRUNG VỊ mỗi tiêu chí (grading/ensemble.py).
        result, ensemble_meta = await self._grade_runs(llm_config, system_instruction, user_instruction, audio_path, schema)

        graded = result.data
        clip_meta: dict[str, Any] = {}
        if facts is not None:
            # Điểm Azure THẮNG điểm Gemini cho mọi tiêu chí đo được; từ phát âm sai lấy từ Azure.
            graded = azure_pa.apply_azure_scores(rubric, result.data, facts, measured)
            validate_output(schema, graded)
            # ILM 09-15: cắt từng đoạn lỗi (và từ Azure bỏ sót) cho Gemini nghe lại.
            graded, clip_meta = await self._analyze_error_clips(
                submission_id, wav_path, facts, result.data, graded, clip_analysis.address_for(rubric)
            )
            validate_output(schema, graded)

        # testMode (Test Upload, dashboard admin): luôn awaiting_review — binding test là giả
        # (test:{studentId}), không bao giờ tự gửi dù lớp có autoSend=true.
        auto_send = bool(student.get("autoSend")) and not msg.testMode
        grading_payload: dict[str, Any] = {
            "submissionId": submission_id,
            "criteriaId": criteria["id"],
            "criteriaVersion": criteria["version"],
            "scores": graded["scores"],
            "llmFeedback": graded["feedback"],
            "autoSent": auto_send,
        }
        if facts is not None:
            grading_payload["assessment"] = {**azure_pa.storable(facts, measured), "clip_analysis": clip_meta}
            grading_payload["assessment"]["ensemble"] = ensemble_meta
            if azure_pa.is_ielts(rubric):
                # Giai đoạn 1 — NGẦM: số đo + band theo công thức, KHÔNG thay điểm đã chấm ở trên.
                fluency_m = measures.fluency_measures(facts.get("words") or [])
                language_m = measures.language_measures(
                    facts.get("intended_transcript") or facts.get("transcript") or "", result.data.get("evidence")
                )
                grading_payload["assessment"]["evidence"] = result.data.get("evidence")
                grading_payload["assessment"]["measures"] = {"fluency": fluency_m, "language": language_m}
                grading_payload["assessment"]["shadow_bands"] = measures.shadow_bands(fluency_m, language_m)
            if isinstance(result.data.get("delivery"), dict):
                grading_payload["assessment"]["delivery"] = result.data["delivery"]
        grading = await self._core_api.create_grading(grading_payload)
        # Chỉ nhớ ô khớp ĐIỂM THẬT — đó là kịch bản nhận xét của em thực sự được dựng theo.
        used_scripts = {
            cell_key(dim, band_key(v.get("score"))): script_picks[cell_key(dim, band_key(v.get("score")))]
            for dim, v in (graded.get("scores") or {}).items()
            if isinstance(v, dict) and cell_key(dim, band_key(v.get("score"))) in script_picks
        }
        await self._config.remember_scripts(student_id, used_scripts)
        # 2026-10-03: đọc/học thuộc ⇒ CHỈ gắn cờ cho giáo viên, điểm giữ nguyên (chủ dự án chọn).
        delivery_flag = delivery.flag_reason(result.data)
        if delivery_flag:
            await self._core_api.create_flag(submission_id, delivery_flag)
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
                graded["feedback"],
                submission_id=str(submission_id),
                buttons=build_reply_buttons(rubric.get("student_reply"), grading.get("id")),
            )
        else:
            # Kiểm duyệt (Tranh luận 4): giáo viên duyệt trên dashboard (M4) rồi core-api mới publish outbound.
            await self._core_api.update_submission(submission_id, {"status": "awaiting_review"})
            logger.info("submission %s: awaiting_review (grading %s)", submission_id, grading.get("id"))

    async def mark_failed_after_give_up(self, raw: dict[str, Any], err: Exception) -> None:
        """Hook `on_give_up` của rabbit_consumer: message đã vào DLQ sau MAX_RETRIES.

        `handle` đặt `processing` TRƯỚC khi tải media; lỗi sau mốc đó (vd. 301 CDN Zalo
        2026-09-27) để bài treo `processing` mãi trên dashboard. Chỉ đóng bài đang `processing`
        — bài đã chấm xong (lỗi ở bước sau đó) giữ nguyên trạng thái của nó. Nút retry DLQ trên
        dashboard đẩy lại message, `handle` sẽ đặt `processing` lần nữa như bình thường.
        """
        msg = contracts.SubmissionMessage.from_dict(raw)
        # Upsert không kèm status ⇒ core-api không đổi status, chỉ trả về dòng hiện tại.
        submission = await self._core_api.upsert_submission(
            {"messageId": msg.messageId, "zaloUserId": msg.zaloUserId, "kind": msg.kind, "mediaUrlZalo": msg.mediaUrl}
        )
        if submission.get("status") != "processing":
            return
        submission_id = submission["id"]
        await self._core_api.update_submission(submission_id, {"status": "failed"})
        # Staff đọc cờ này: không kèm lỗi thô (có thể chứa tên engine) — lỗi nằm ở log và DLQ.
        await self._core_api.create_flag(
            submission_id, "Không chấm được sau nhiều lần thử — quản trị viên chấm lại được ở trang Giám sát"
        )
        logger.error("submission %s: bỏ cuộc -> DLQ, status=failed: %s", submission_id, err)

    async def _grade_runs(
        self,
        llm_config: dict[str, Any],
        system_instruction: str,
        user_instruction: str,
        audio_path: str,
        schema: dict[str, Any],
    ) -> tuple[GradingResult, dict[str, Any]]:
        """`llm.grading_runs` lượt (mặc định 3, kẹp 1–5) chạy SONG SONG ⇒ thời gian chờ gần như không
        đổi. Mỗi lượt validate riêng; lượt hỏng bị bỏ, còn ≥1 lượt thì vẫn chấm. Hỏng HẾT ⇒ ném lỗi đầu
        tiên để rabbit_consumer retry → DLQ như trước (mục 3.9)."""
        raw = await self._config.get("llm.grading_runs")
        try:
            runs = min(5, max(1, int(float(raw)))) if raw not in (None, "") else DEFAULT_GRADING_RUNS
        except (TypeError, ValueError):
            runs = DEFAULT_GRADING_RUNS

        async def one() -> GradingResult:
            r = await grade_with_fallback(
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
            # Sai schema → lượt này bị loại; hỏng hết thì lan lên rabbit_consumer (retry → DLQ, mục 3.9).
            validate_output(schema, r.data)
            return r

        outcomes = await asyncio.gather(*(one() for _ in range(runs)), return_exceptions=True)
        ok = [o for o in outcomes if isinstance(o, GradingResult)]
        failed = [o for o in outcomes if isinstance(o, BaseException)]
        if not ok:
            raise failed[0]
        if failed:
            logger.warning("chấm %d/%d lượt hỏng (%s) — gộp %d lượt còn lại", len(failed), runs, failed[0], len(ok))
        return ensemble.combine(ok)

    async def _azure_assessment(
        self,
        submission_id: int,
        audio_path: str,
        rubric: dict[str, Any],
        student: dict[str, Any],
        duration_sec: float,
    ) -> tuple[dict[str, Any] | None, dict[str, dict[str, float]], str | None]:
        """D149–D151. `(None, {}, None)` ⇒ chấm bằng Gemini thuần. Phần tử thứ ba là WAV 16 kHz — cần
        để cắt đoạn lỗi.

        Azure lỗi (khóa sai, hết hạn mức, mạng) KHÔNG làm mất bài của học viên: gắn cờ cho giáo viên
        rồi để Gemini chấm như trước. Clip ~0.5× thời gian thực (spec §5.4) nên hạn chờ tính theo độ dài.
        """
        settings = await azure_pa.load_azure_settings(self._config)
        if settings is None:
            return None, {}, None
        reading = student.get("readingText")
        reference = reading.strip() if isinstance(reading, str) and reading.strip() else None
        has_reading_text = reference is not None
        intended: str | None = None
        if reference is None:
            # Nói tự do: Azure scripted theo lời học viên ĐỊNH nói do Gemini ghi lại (xem
            # `intended_transcript.py` — đo trên 11 bài 2026-10-01). Lỗi ⇒ unscripted như cũ.
            intended = await self._intended_reference(submission_id, audio_path)
            reference = intended
        try:
            wav_path = await to_wav_16k_mono(audio_path)
            timeout = max(120.0, float(duration_sec) * 2 + 60)
            segments = await asyncio.to_thread(azure_pa.run_assessment, wav_path, settings, reference, timeout)
            # Sự cố 2026-09-26→29: khóa Azure bị từ chối (HTTP 401) nhưng SDK không báo lỗi — chỉ trả
            # phiên rỗng. Coi "không nhận ra một từ nào" là "không lỗi" đã xóa sạch từ đọc sai của mọi
            # bài. Clip có tiếng mà Azure không ra đoạn nào ⇒ coi như Azure hỏng, chấm bằng Gemini.
            if not segments and duration_sec >= AZURE_MIN_SPEECH_SEC:
                raise azure_pa.AzureAssessmentError(
                    f"Azure không nhận dạng được lời nói nào trong clip {int(duration_sec)} giây (khóa/hạn mức?)"
                )
        except Exception as err:  # noqa: BLE001 — mọi lỗi Azure đều rơi về Gemini, không retry cả bài
            logger.warning("submission %s: Azure lỗi (%s) — chấm bằng Gemini", submission_id, err)
            # Cờ hiện cho staff (Ghi chú trên trang bài nộp) — KHÔNG nêu tên engine, KHÔNG kèm lỗi thô
            # (thân lỗi có thể chứa tên nhà cung cấp); lỗi chi tiết nằm ở log cho admin.
            await self._core_api.create_flag(
                submission_id, "Lượt đo phát âm không chạy được — bài được chấm không có số đo phát âm"
            )
            return None, {}, None

        facts = azure_pa.summarize(segments, scripted=reference is not None)
        if intended is not None:
            facts["mode"] = "intended"  # khác "scripted": văn bản do hệ thống ghi lại, không phải bài đọc
            facts["intended_transcript"] = intended
        if not has_reading_text and not azure_pa.is_ielts(rubric):
            await self._core_api.create_flag(
                submission_id,
                "Lớp không có bài đọc mẫu — hệ thống chấm tự ghi lại lời em đọc để đo; nhập bài đọc của lớp sẽ chính xác hơn"
                if intended is not None
                else "Lớp không có bài đọc mẫu — hệ thống chấm phải chấm nói tự do, điểm phát âm của trẻ kém tin cậy",
            )
        overrides = azure_pa.parse_thresholds(await self._config.get("azure.score_thresholds_json"))
        return facts, azure_pa.measure_bands(rubric, facts, overrides), wav_path

    async def _intended_reference(self, submission_id: int, audio_path: str) -> str | None:
        """Bản ghi lời định nói, hoặc None (⇒ unscripted như trước 2026-10-01). Không bao giờ raise."""
        try:
            text, meta = await intended_transcript.transcribe_intended(self._config, audio_path)
        except Exception as err:  # noqa: BLE001 — thiếu bản ghi chỉ làm giảm độ chính xác, không mất bài
            logger.warning("submission %s: không ghi được lời định nói (%s) — Azure chấm unscripted", submission_id, err)
            await self._core_api.create_flag(
                submission_id, "Không ghi lại được lời em định nói — số đo phát âm theo nhận dạng tự do, kém chính xác hơn"
            )
            return None
        est_usd = estimate_cost_usd(
            "gemini", meta["model"], meta["input_tokens"], meta["output_tokens"], await self._pricing_overrides()
        )
        await self._core_api.create_cost_log(
            {
                "submissionId": submission_id,
                "provider": "gemini",
                "model": meta["model"],
                "inputTokens": meta["input_tokens"],
                "outputTokens": meta["output_tokens"],
                "estUsd": est_usd,
                "callType": "intended_transcript",
            }
        )
        return text

    async def _analyze_error_clips(
        self,
        submission_id: int,
        wav_path: str | None,
        facts: dict[str, Any],
        llm_data: dict[str, Any],
        graded: dict[str, Any],
        address: str = "em",
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Cắt đoạn lỗi → Gemini nghe lại → ghép vào `mispronounced_words` (xem `clip_analysis.py`).

        Lỗi ở bước này KHÔNG làm mất bài và KHÔNG đổi điểm: gắn cờ, giữ nguyên danh sách Azure.
        """
        pron = (graded.get("scores") or {}).get("pronunciation")
        if not isinstance(pron, dict) or not wav_path:
            return graded, {}
        llm_words = (((llm_data.get("scores") or {}).get("pronunciation") or {}).get("mispronounced_words")) or []
        candidates = clip_analysis.build_candidates(facts, llm_words)
        try:
            results, meta = await clip_analysis.analyze_error_clips(self._config, wav_path, candidates, address)
        except Exception as err:  # noqa: BLE001 — nghe lại là phần làm giàu, không được chặn việc chấm
            logger.warning("submission %s: nghe lại đoạn lỗi thất bại (%s) — giữ danh sách Azure", submission_id, err)
            await self._core_api.create_flag(
                submission_id, "Lượt nghe lại các đoạn lỗi không chạy được — giữ danh sách của lượt đo phát âm"
            )
            return graded, {"error": str(err)[:300], "candidates": len(candidates)}

        out = copy.deepcopy(graded)
        merged = clip_analysis.merge_clip_results(pron.get("mispronounced_words") or [], candidates, results)
        out["scores"]["pronunciation"]["mispronounced_words"] = merged
        meta = {
            **meta,
            "candidates": len(candidates),
            "azure_words": sum(1 for c in candidates if c.get("source") == "azure"),
            "gemini_proposed": sum(1 for c in candidates if c.get("source") == "gemini"),
            "gemini_added": sum(1 for w in merged if w.get("source") == "gemini"),
            "needs_review": sum(1 for w in merged if w.get("needs_review")),
        }
        if meta.get("input_tokens") or meta.get("output_tokens"):
            est_usd = estimate_cost_usd(
                "gemini", meta.get("model", ""), meta["input_tokens"], meta["output_tokens"], await self._pricing_overrides()
            )
            await self._core_api.create_cost_log(
                {
                    "submissionId": submission_id,
                    "provider": "gemini",
                    "model": meta.get("model", ""),
                    "inputTokens": meta["input_tokens"],
                    "outputTokens": meta["output_tokens"],
                    "estUsd": est_usd,
                    "callType": "clip_analysis",
                }
            )
        return out, meta

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
