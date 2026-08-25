"""Test đối chiếu TS ↔ Python cho bộ dựng prompt (F12 FR-03).

SONG SINH với `services/core-api/src/criteria/prompt-render.spec.ts` — hai file test chạy trên
CÙNG một fixture JSON. Sửa hành vi render ở Python mà quên sửa TS (hoặc ngược lại) thì bộ test
bên kia sẽ đỏ. Đừng inline/chép fixture vào đây.

Bản Python là BẢN GỐC (nó chạy lúc chấm thật); bản TS chỉ phục vụ màn xem trước prompt của
dashboard. Vì vậy `expected_*` trong fixture được sinh ra TỪ ĐÂY: nếu một ca đỏ ở phía Python thì
nghĩa là hành vi chấm thật đã đổi — hãy sửa cả `prompt-render.ts` trong cùng commit, đừng sửa
fixture cho khớp code.

Fixture nằm dưới core-api chỉ vì lệnh test TS chạy trong Docker chỉ mount thư mục service
(CLAUDE.md); pytest chạy trên host nên với sang được. Nếu file biến mất thì test này phải THẤT BẠI
chứ KHÔNG ĐƯỢC skip — skip là âm thầm tắt luôn lưới đỡ chống trôi (đúng quy ước
`test_rubric_schema.py` của F8).

SINH LẠI `expected_*` sau khi CỐ Ý đổi hành vi render (chạy từ `services/grading-worker`, đã sửa
CẢ HAI renderer trước đó — đây KHÔNG phải cách "chữa" một test đỏ):

    .venv/Scripts/python -c "import json,sys; sys.path.insert(0,'src'); \
      from grading_worker.grading.prompt import build_system_instruction as a, \
           build_system_instruction_text as t; \
      p='../core-api/src/criteria/__fixtures__/prompt-render.fixtures.json'; \
      d=json.load(open(p,encoding='utf-8')); \
      [c.update(expected_audio=a(c['rubric'])) for c in d['cases']]; \
      open(p,'w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False,indent=2)+chr(10))"

Sau đó CHẠY LẠI cả pytest lẫn jest: nếu chỉ một bên xanh thì bản port đã trôi.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from grading_worker.grading.prompt import build_system_instruction

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "core-api"
    / "src"
    / "criteria"
    / "__fixtures__"
    / "prompt-render.fixtures.json"
)

# Xóa case là làm yếu lưới đỡ — chốt cứng danh sách tên để việc đó làm test đỏ (AC-03.4).
REQUIRED_CASE_NAMES = {
    "v1_legacy_no_schema_version",
    "v2_sub_factors_on_two_dimensions",
    "v2_comment_bank_mixed_grouping",
    # Ba bẫy trôi đã ĐO trên CPython 3.11, không phải phỏng đoán:
    "v2_band_keys_python_float_grammar",  # float() ≠ Number()
    "v2_band_keys_non_numeric_fallback",
    "v2_band_keys_unparseable_hex_and_empty",  # "0x10"/"" → Number() nhận, float() từ chối
    "v2_band_keys_infinity_sorts_last",
    "v2_weight_number_formatting",  # str(float) của Python ≠ String() của JS
    "v2_numeric_dimension_keys_group_order",  # dict của Python ≠ object của JS
    "v2_output_fields_with_fix",
    "v2_output_fields_without_fix",
    "v2_empty_bank_and_empty_sub_factors",
    "v2_sub_factor_partial_by_band",
    "garbage_empty_object",
}


def _load_fixture() -> dict[str, Any]:
    if not FIXTURE_PATH.exists():
        raise AssertionError(
            f"Thiếu fixture dùng chung: {FIXTURE_PATH}. Đây là lưới đỡ chống trôi giữa "
            "`grading/prompt.py` và `core-api/src/criteria/prompt-render.ts` — KHÔNG được skip, "
            "phải sửa lại đường dẫn hoặc khôi phục file."
        )
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


FIXTURE = _load_fixture()
CASES: list[dict[str, Any]] = FIXTURE["cases"]
CASE_IDS = [case["name"] for case in CASES]


def test_fixture_carries_every_required_case() -> None:
    assert len(CASES) >= 12
    assert set(CASE_IDS) == REQUIRED_CASE_NAMES
    assert len(CASE_IDS) == len(set(CASE_IDS)), "tên ca bị trùng"


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_audio_branch_matches_golden(case: dict[str, Any]) -> None:
    assert build_system_instruction(case["rubric"]) == case["expected_audio"]


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_render_does_not_mutate_input(case: dict[str, Any]) -> None:
    before = copy.deepcopy(case["rubric"])
    build_system_instruction(case["rubric"])
    assert case["rubric"] == before


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_render_is_deterministic(case: dict[str, Any]) -> None:
    assert build_system_instruction(case["rubric"]) == build_system_instruction(case["rubric"])


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_no_total_average_or_level_leaks(case: dict[str, Any]) -> None:
    """BR-09 — ranh giới cứng, kiểm trên CHÍNH dữ liệu của fixture.

    Ca `v2_sub_factors_on_two_dimensions` cố ý khai một `levels` có code/label không thể nhầm
    (`SECRET_LEVEL`, `KHONG_DUOC_XUAT_HIEN`), nên đây là khẳng định bằng dữ liệu chứ không phải
    grep từ khóa chung chung.
    """
    for rendered in (case["expected_audio"],):
        assert "SECRET_LEVEL" not in rendered
        assert "KHONG_DUOC_XUAT_HIEN" not in rendered
        assert "tổng điểm" not in rendered.lower()
        assert "điểm trung bình" not in rendered.lower()
        assert "cấp độ" not in rendered.lower()
        assert "levels" not in rendered
