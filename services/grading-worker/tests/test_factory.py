from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.grading.providers.base import GradingResult, TranscriptResult
from grading_worker.grading.providers.factory import (
    grade_text_with_fallback,
    transcribe_with_fallback,
)

SCHEMA = {"type": "object"}


def _transcript(provider):
    return TranscriptResult(text="hi", input_tokens=1, output_tokens=1, provider=provider, model="m")


def _grading(provider):
    return GradingResult(data={"scores": {}, "feedback": "ok"}, input_tokens=1, output_tokens=1, provider=provider, model="m")


def _provider(name, *, transcribe_result=None, grade_text_result=None, raises=False):
    prov = AsyncMock()
    prov.name = name
    if raises:
        prov.transcribe.side_effect = RuntimeError("provider down")
        prov.grade_text.side_effect = RuntimeError("provider down")
    else:
        prov.transcribe.return_value = transcribe_result
        prov.grade_text.return_value = grade_text_result
    return prov


# ---- transcribe_with_fallback (AC-03.x) ----


async def test_transcribe_uses_primary_when_ok():
    primary = _provider("gemini", transcribe_result=_transcript("gemini"))
    with patch("grading_worker.grading.providers.factory._build_provider", new=AsyncMock(return_value=primary)):
        res = await transcribe_with_fallback({"provider": "gemini"}, AsyncMock(), audio_path="/a.mp3", mime_type="audio/mp3")
    assert res.provider == "gemini"
    primary.transcribe.assert_awaited_once()


async def test_transcribe_falls_back_to_other_provider():
    primary = _provider("gemini", raises=True)
    fallback = _provider("openai", transcribe_result=_transcript("openai"))
    with patch("grading_worker.grading.providers.factory._build_provider", new=AsyncMock(side_effect=[primary, fallback])):
        res = await transcribe_with_fallback({"provider": "gemini"}, AsyncMock(), audio_path="/a.mp3", mime_type="audio/mp3")
    assert res.provider == "openai"
    fallback.transcribe.assert_awaited_once()


async def test_transcribe_raises_when_no_primary_key():
    with patch("grading_worker.grading.providers.factory._build_provider", new=AsyncMock(return_value=None)):
        with pytest.raises(RuntimeError):
            await transcribe_with_fallback({"provider": "gemini"}, AsyncMock(), audio_path="/a.mp3", mime_type="audio/mp3")


async def test_transcribe_reraises_when_fallback_also_missing():
    primary = _provider("gemini", raises=True)
    with patch("grading_worker.grading.providers.factory._build_provider", new=AsyncMock(side_effect=[primary, None])):
        with pytest.raises(RuntimeError):
            await transcribe_with_fallback({"provider": "gemini"}, AsyncMock(), audio_path="/a.mp3", mime_type="audio/mp3")


# ---- grade_text_with_fallback (AC-03.x) ----


async def test_grade_text_uses_primary_when_ok():
    primary = _provider("gemini", grade_text_result=_grading("gemini"))
    with patch("grading_worker.grading.providers.factory._build_provider", new=AsyncMock(return_value=primary)):
        res = await grade_text_with_fallback(
            {"provider": "gemini"}, AsyncMock(),
            system_instruction="s", user_instruction="u", transcript="t", schema=SCHEMA,
        )
    assert res.provider == "gemini"
    # temperature mặc định 0.3 khi llm_config không nêu
    assert primary.grade_text.call_args.kwargs["temperature"] == 0.3


async def test_grade_text_falls_back_to_other_provider():
    primary = _provider("gemini", raises=True)
    fallback = _provider("openai", grade_text_result=_grading("openai"))
    with patch("grading_worker.grading.providers.factory._build_provider", new=AsyncMock(side_effect=[primary, fallback])):
        res = await grade_text_with_fallback(
            {"provider": "gemini"}, AsyncMock(),
            system_instruction="s", user_instruction="u", transcript="t", schema=SCHEMA,
        )
    assert res.provider == "openai"
    fallback.grade_text.assert_awaited_once()
