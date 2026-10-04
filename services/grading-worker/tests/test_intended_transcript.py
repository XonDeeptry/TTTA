"""Hàm thuần + hợp đồng gọi của `grading/intended_transcript.py`."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.grading import intended_transcript as it
from grading_worker.grading.providers.base import GradingResult


def test_clean_transcript_flattens_whitespace_and_caps_on_a_word_boundary():
    assert it.clean_transcript("  Gangs.\n Gangs  are   bad ") == "Gangs. Gangs are bad"
    long = ("word " * 3000).strip()
    out = it.clean_transcript(long)
    assert len(out) <= it.MAX_CHARS and out.endswith("word")
    assert it.clean_transcript(None) == ""


class _Cfg:
    def __init__(self, values):
        self.values = values

    async def get(self, key):
        return self.values.get(key)


def _grade_returning(text):
    return AsyncMock(return_value=GradingResult(data={"transcript": text}, input_tokens=900, output_tokens=120, provider="gemini", model="m"))


def test_transcribe_sends_the_measured_prompt_at_temperature_zero_and_returns_tokens():
    grade = _grade_returning("Gangs are becoming a big problem")
    with patch.object(it.GeminiProvider, "grade", new=grade), patch.object(it, "_resolve_model", new=AsyncMock(return_value="m")):
        text, meta = asyncio.run(it.transcribe_intended(_Cfg({"llm.gemini_api_key": "k"}), "/x/audio.mp3"))
    assert text == "Gangs are becoming a big problem"
    assert meta == {"model": "m", "input_tokens": 900, "output_tokens": 120}
    kwargs = grade.await_args.kwargs
    assert kwargs["system_instruction"] == it.INSTRUCTION and kwargs["temperature"] == 0.0
    assert kwargs["schema"] == it.SCHEMA and kwargs["mime_type"] == "audio/mp3"


@pytest.mark.parametrize("values, text", [({}, "unused"), ({"llm.gemini_api_key": "k"}, "uh um")])
def test_transcribe_refuses_without_a_key_or_with_a_near_empty_transcript(values, text):
    with patch.object(it.GeminiProvider, "grade", new=_grade_returning(text)), patch.object(it, "_resolve_model", new=AsyncMock(return_value="m")):
        with pytest.raises(it.IntendedTranscriptUnavailable):
            asyncio.run(it.transcribe_intended(_Cfg(values), "/x/audio.mp3"))
