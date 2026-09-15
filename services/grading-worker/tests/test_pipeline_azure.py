"""Pipeline với Azure Pronunciation Assessment (ILM-Clone D149–D152) và bước nghe lại đoạn lỗi.

`run_assessment` (lời gọi SDK thật) và `analyze_error_clips` (ffmpeg + Gemini thật) luôn bị patch —
ở đây kiểm tra cách pipeline DÙNG kết quả: chấm theo bài đọc khi lớp có văn bản, ghi đè điểm Gemini,
lưu dữ kiện gốc, ghép kết quả nghe lại, và không bao giờ để Azure/Gemini lỗi làm mất bài.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from grading_worker.grading.providers.base import GradingResult
from grading_worker.pipeline import SubmissionPipeline

KID_RUBRIC = {
    "schema_version": 2,
    "scale": {"min": 0, "max": 5, "step": 1},
    "aggregation": {"method": "sum", "round": "none"},
    "output_fields": ["comment"],
    "dimensions": [{"key": "pronunciation", "label": "Pronunciation"}, {"key": "fluency", "label": "Fluency"}],
}


def _llm_result(extra_words=None):
    words = [{"word": "gate", "heard_as": "x", "suggestion": "đọc rõ /t/"}] + (extra_words or [])
    return GradingResult(
        data={
            "scores": {
                "pronunciation": {"score": 1, "comment": "c", "mispronounced_words": words},
                "fluency": {"score": 1, "comment": "c"},
            },
            "feedback": "Chào con",
        },
        input_tokens=10,
        output_tokens=5,
        provider="gemini",
        model="gemini-3.6-flash",
    )


AZURE_SEGMENTS = [
    {
        "NBest": [
            {
                "Display": "The gate. The swing.",
                "PronunciationAssessment": {"AccuracyScore": 92, "FluencyScore": 76, "ProsodyScore": 70, "CompletenessScore": 100, "PronScore": 85},
                "Words": [
                    {
                        "Word": "gate",
                        "Offset": 12_000_000,
                        "Duration": 4_000_000,
                        "PronunciationAssessment": {"AccuracyScore": 40, "ErrorType": "Mispronunciation"},
                        "Phonemes": [{"Phoneme": "t", "PronunciationAssessment": {"AccuracyScore": 20, "NBestPhonemes": [{"Phoneme": "d", "Score": 80}]}}],
                    },
                    {
                        "Word": "swing",
                        "Offset": 30_000_000,
                        "Duration": 5_000_000,
                        "PronunciationAssessment": {"AccuracyScore": 90, "ErrorType": "None"},
                        "Phonemes": [{"Phoneme": "ŋ", "PronunciationAssessment": {"AccuracyScore": 90}}],
                    },
                ],
            }
        ]
    }
]

NO_CLIP_RESULTS = AsyncMock(return_value=([], {"clips": 1, "input_tokens": 0, "output_tokens": 0}))


@pytest.fixture
def core_api():
    api = AsyncMock()
    api.upsert_submission.return_value = {"id": 1}
    api.ensure_binding.return_value = [{"status": "active", "studentId": 10, "zaloUserId": "zalo-1"}]
    api.get_student.return_value = {"id": 10, "courseId": 1, "className": "Tiny Rabbit 2601", "llmConfig": {}, "autoSend": False, "readingText": "The gate."}
    api.get_criteria.return_value = {"id": 5, "version": 3, "rubric": KID_RUBRIC}
    api.create_grading.return_value = {"id": 99}
    return api


def _config(values: dict):
    cfg = AsyncMock()
    cfg.get_int.return_value = 420
    cfg.get.side_effect = lambda key: values.get(key)
    return cfg


AZURE_ON = {"azure.speech_key": "k", "azure.speech_region": "eastus", "llm.gemini_api_key": "g"}


def _message():
    return {
        "v": 1, "messageId": "m-1", "eventName": "user_send_audio", "kind": "audio", "zaloUserId": "zalo-1",
        "mediaUrl": "https://zalo.example/clip.m4a", "receivedAt": "2026-09-15T00:00:00.000Z",
    }


def _run(core_api, config, *, run_assessment, grade=None, clips=None):
    pipeline = SubmissionPipeline(core_api, config, http=AsyncMock(), publish=AsyncMock())
    grade = grade or AsyncMock(return_value=_llm_result())
    clips = clips or NO_CLIP_RESULTS
    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("grading_worker.pipeline.download_original", new=AsyncMock(return_value="2026/09/1/original.m4a")))
        stack.enter_context(patch("grading_worker.pipeline.probe_duration_sec", new=AsyncMock(return_value=30.0)))
        stack.enter_context(patch("grading_worker.pipeline.extract_audio", new=AsyncMock(return_value="/data/media/2026/09/1/audio.mp3")))
        stack.enter_context(patch("grading_worker.pipeline.to_wav_16k_mono", new=AsyncMock(return_value="/data/media/2026/09/1/audio16k.wav")))
        stack.enter_context(patch("grading_worker.pipeline.azure_pa.run_assessment", new=run_assessment))
        stack.enter_context(patch("grading_worker.pipeline.clip_analysis.analyze_error_clips", new=clips))
        stack.enter_context(patch("grading_worker.pipeline.grade_with_fallback", new=grade))
        asyncio.run(pipeline.handle(_message()))
    return grade


def test_azure_scores_override_gemini_scripted_with_class_reading_text_and_assessment_is_stored(core_api):
    run = MagicMock(return_value=AZURE_SEGMENTS)
    grade = _run(core_api, _config(AZURE_ON), run_assessment=run)

    wav, settings, reference = run.call_args.args[:3]
    assert wav.endswith("audio16k.wav") and settings.region == "eastus" and reference == "The gate."

    payload = core_api.create_grading.await_args.args[0]
    scores = payload["scores"]
    assert scores["pronunciation"]["score"] == 5  # Azure accuracy 92 ⇒ 5, không phải 1 của Gemini
    assert scores["fluency"]["score"] == 4  # 76 ⇒ 4
    assert scores["pronunciation"]["mispronounced_words"] == [
        {"word": "gate", "heard_as": "/d/ thay vì /t/", "suggestion": "đọc rõ /t/", "approx_position_sec": 1.2,
         "start_sec": 1.2, "end_sec": 1.6, "source": "azure"}
    ]
    assert payload["assessment"]["mode"] == "scripted"
    assert payload["assessment"]["measured"]["pronunciation"] == {"metric": 92.0, "band": 5}
    assert payload["assessment"]["words"][0]["word"] == "gate"
    assert payload["assessment"]["clip_analysis"]["candidates"] == 1
    assert "ĐÃ ĐƯỢC HỆ THỐNG CHỐT" in grade.await_args.kwargs["system_instruction"]
    core_api.create_flag.assert_not_called()


def test_clip_listening_confirms_azure_words_flags_disagreement_and_adds_a_word_azure_missed(core_api):
    run = MagicMock(return_value=AZURE_SEGMENTS)
    # Gemini (nghe cả bài) nghi "swing" sai — Azure chấm 90, không đánh dấu
    grade = AsyncMock(return_value=_llm_result([{"word": "swing", "heard_as": "", "suggestion": "", "approx_position_sec": 3}]))
    clips = AsyncMock(
        return_value=(
            [
                {"index": 0, "said": "/geɪd/", "is_error": False, "issue": "", "suggestion": ""},
                {"index": 1, "said": "/swɪn/", "is_error": True, "issue": "mất âm cuối /ŋ/", "suggestion": "Giữ lưỡi sau chạm vòm để ra /ŋ/"},
            ],
            {"clips": 2, "batches": 1, "provider": "gemini", "model": "gemini-3.6-flash", "input_tokens": 400, "output_tokens": 80},
        )
    )
    _run(core_api, _config(AZURE_ON), run_assessment=run, grade=grade, clips=clips)

    wav, candidates = clips.await_args.args[1:3]
    assert wav.endswith("audio16k.wav")
    assert [(c["word"], c["source"], c["start_sec"]) for c in candidates] == [("gate", "azure", 1.2), ("swing", "gemini", 3.0)]

    payload = core_api.create_grading.await_args.args[0]
    words = payload["scores"]["pronunciation"]["mispronounced_words"]
    assert words[0]["word"] == "gate" and words[0]["needs_review"] is True and words[0]["heard_as"] == "/geɪd/"
    assert words[1] == {
        "word": "swing", "heard_as": "/swɪn/", "suggestion": "Giữ lưỡi sau chạm vòm để ra /ŋ/", "issue": "mất âm cuối /ŋ/",
        "approx_position_sec": 3.0, "start_sec": 3.0, "end_sec": 3.5, "source": "gemini", "gemini_confirmed": True,
    }
    assert payload["scores"]["pronunciation"]["score"] == 5  # nghe lại không bao giờ đổi điểm Azure
    meta = payload["assessment"]["clip_analysis"]
    assert (meta["azure_words"], meta["gemini_proposed"], meta["gemini_added"], meta["needs_review"]) == (1, 1, 1, 1)
    call_types = [c.args[0]["callType"] for c in core_api.create_cost_log.await_args_list]
    assert call_types == ["clip_analysis", "audio_grade"]


def test_clip_listening_failure_keeps_the_azure_list_and_flags(core_api):
    run = MagicMock(return_value=AZURE_SEGMENTS)
    clips = AsyncMock(side_effect=RuntimeError("503 overloaded"))
    _run(core_api, _config(AZURE_ON), run_assessment=run, clips=clips)

    payload = core_api.create_grading.await_args.args[0]
    assert [w["word"] for w in payload["scores"]["pronunciation"]["mispronounced_words"]] == ["gate"]
    assert payload["assessment"]["clip_analysis"]["error"] == "503 overloaded"
    reasons = [c.args[1] for c in core_api.create_flag.await_args_list]
    assert any("nghe lại" in r and "503" in r for r in reasons)


def test_no_reading_text_runs_unscripted_and_flags_the_submission(core_api):
    core_api.get_student.return_value = {**core_api.get_student.return_value, "readingText": None}
    run = MagicMock(return_value=AZURE_SEGMENTS)
    _run(core_api, _config(AZURE_ON), run_assessment=run)

    assert run.call_args.args[2] is None
    assert core_api.create_grading.await_args.args[0]["assessment"]["mode"] == "unscripted"
    reasons = [c.args[1] for c in core_api.create_flag.await_args_list]
    assert any("không có bài đọc" in r for r in reasons)


def test_azure_failure_never_loses_the_submission_gemini_grades_and_it_is_flagged(core_api):
    run = MagicMock(side_effect=RuntimeError("401 Unauthorized"))
    clips = AsyncMock()
    _run(core_api, _config(AZURE_ON), run_assessment=run, clips=clips)

    payload = core_api.create_grading.await_args.args[0]
    assert payload["scores"]["pronunciation"]["score"] == 1  # điểm Gemini giữ nguyên
    assert "assessment" not in payload
    clips.assert_not_awaited()
    reasons = [c.args[1] for c in core_api.create_flag.await_args_list]
    assert any("Azure" in r and "401" in r for r in reasons)


def test_without_azure_settings_the_pipeline_is_unchanged(core_api):
    run = MagicMock()
    clips = AsyncMock()
    grade = _run(core_api, _config({}), run_assessment=run, clips=clips)

    run.assert_not_called()
    clips.assert_not_awaited()
    payload = core_api.create_grading.await_args.args[0]
    assert "assessment" not in payload
    assert "ĐÃ ĐƯỢC HỆ THỐNG CHỐT" not in grade.await_args.kwargs["system_instruction"]
