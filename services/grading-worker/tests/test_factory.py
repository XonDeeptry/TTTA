from unittest.mock import AsyncMock, patch

import pytest

from grading_worker.grading.providers.base import GradingResult
from grading_worker.grading.providers.factory import grade_with_fallback

SCHEMA = {"type": "object"}


def _grading(provider):
    return GradingResult(data={"scores": {}, "feedback": "ok"}, input_tokens=1, output_tokens=1, provider=provider, model="m")


