"""Test đối chiếu TS ↔ Python cho `normalize_rubric` (F8 FR-15).

SONG SINH với `services/core-api/src/criteria/rubric-schema.spec.ts` — hai file test chạy trên
CÙNG một fixture JSON. Sửa hành vi normalize ở Python mà quên sửa TS (hoặc ngược lại) thì bộ
test bên kia sẽ đỏ. Đừng inline/chép fixture vào đây.

Fixture nằm dưới core-api chỉ vì lệnh test TS chạy trong Docker chỉ mount thư mục service
(CLAUDE.md); pytest chạy trên host nên với sang được. Nếu file biến mất thì test này phải
THẤT BẠI chứ KHÔNG ĐƯỢC skip — skip là âm thầm tắt luôn lưới đỡ chống trôi (AC-15.3).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from grading_worker.grading.rubric_schema import normalize_rubric

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "core-api"
    / "src"
    / "criteria"
    / "__fixtures__"
    / "rubric-normalize.fixtures.json"
)

# Đúng 12 khóa top-level, không hơn không kém (AC-02.4, BR-05).
V2_TOP_LEVEL_KEYS = {
    "schema_version",
    "course_key",
    "task_type",
    "tone",
    "feedback_language",
    "scale",
    "aggregation",
    "levels",
    "output_fields",
    "dimensions",
    "comment_bank",
    "student_reply",
}

# Xóa case là làm yếu lưới đỡ — chốt cứng danh sách tên để việc đó làm test đỏ (AC-15.6).
REQUIRED_CASE_NAMES = {
    "v1_minimal",
    "v1_docx_parser_output",
    "v1_missing_band_scale",
    "v1_malformed_band_scale",
    "v1_empty_object",
    "v1_unknown_extra_keys",
    "v2_complete_kid",
    "v2_complete_ielts",
    "v2_partial_defaults",
    "v2_bands_already_arrays",
    "v2_mixed_legacy_keys",
    # Ba ca thêm sau QA F8 DEF-01 — khóa ngữ nghĩa `String()` của JS (AC-03.5). 11 ca đầu không
    # có lấy một giá trị band/text nào không phải chuỗi nên lưới đỡ đã để hai bản trôi khỏi nhau.
    "v1_null_comment_text",
    "v2_non_string_band_values",
    "v1_non_string_few_shot_examples",
    # Thêm sau QA F8 DEF-02 — `.trim()` của JS KHÁC `str.strip()` của Python ở 6 điểm mã.
    "v2_javascript_trim_semantics",
}


FIXTURE_MISSING_MESSAGE = (
    f"Không tìm thấy fixture dùng chung TS↔Python tại {FIXTURE_PATH}. File này là lưới đỡ chống "
    "trôi giữa services/core-api/src/criteria/rubric-schema.ts và "
    "services/grading-worker/src/grading_worker/grading/rubric_schema.py. Nếu nó được di chuyển "
    "thì PHẢI cập nhật cả hai file test trong cùng một commit."
)
FIXTURE_MISSING = not FIXTURE_PATH.exists()


def _require_fixture() -> None:
    """FAIL, KHÔNG skip (AC-15.3): fixture bị đổi tên/di chuyển mà test vẫn xanh nghĩa là hai
    bản normalize có thể trôi khỏi nhau mà không ai biết."""
    if FIXTURE_MISSING:
        pytest.fail(FIXTURE_MISSING_MESSAGE)


def _load_cases() -> list[dict]:
    if FIXTURE_MISSING:
        # Một case GIẢ để các test parametrize vẫn được CHẠY (và thất bại ngay ở
        # `_require_fixture`). Danh sách tham số rỗng sẽ bị pytest đánh dấu skip — đúng cái
        # phải tránh. Cố ý KHÔNG raise ở mức module: một collection error sẽ chặn luôn cả
        # những file test khác trong suite.
        return [{"name": "FIXTURE_MISSING", "input": None, "expected": None}]
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return fixture["cases"]


CASES = _load_cases()
CASE_IDS = [case["name"] for case in CASES]


def test_shared_fixture_file_is_present():
    _require_fixture()


def test_fixture_has_every_required_case():
    _require_fixture()
    assert len(CASES) >= 10
    assert set(CASE_IDS) == REQUIRED_CASE_NAMES


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_normalizes_to_the_golden_output(case):
    _require_fixture()
    assert normalize_rubric(case["input"]) == case["expected"]


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_is_idempotent(case):
    _require_fixture()
    once = normalize_rubric(case["input"])
    assert normalize_rubric(once) == once


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_does_not_mutate_its_input(case):
    _require_fixture()
    before = copy.deepcopy(case["input"])
    normalize_rubric(case["input"])
    assert case["input"] == before


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_returns_exactly_the_twelve_top_level_keys(case):
    _require_fixture()
    assert set(normalize_rubric(case["input"]).keys()) == V2_TOP_LEVEL_KEYS


# ---- Đầu vào rác (FR-05) ----

ALL_DEFAULTS = {
    "schema_version": 2,
    "course_key": "",
    "task_type": "speaking_clip",
    "tone": "khích lệ",
    "feedback_language": "vi",
    "scale": {"min": 0, "max": 3, "step": 1},
    "aggregation": {"method": "average", "round": "none"},
    "levels": [],
    "output_fields": ["comment"],
    "dimensions": [],
    "comment_bank": [],
    "student_reply": None,
}


@pytest.mark.parametrize("raw", [None, 42, "x", [], True, 0.5])
def test_degenerate_input_never_raises_and_returns_all_defaults(raw):
    assert normalize_rubric(raw) == ALL_DEFAULTS


def test_drops_non_object_sub_factors_and_defaults_missing_by_band():
    out = normalize_rubric({"dimensions": [{"name": "pronunciation", "sub_factors": ["rác", None, {"label": "Phạm vi"}]}]})
    assert out["dimensions"][0]["sub_factors"] == [{"label": "Phạm vi", "by_band": {}}]


def test_stringifies_by_band_values():
    out = normalize_rubric(
        {"schema_version": 2, "dimensions": [{"key": "pronunciation", "sub_factors": [{"label": "x", "by_band": {"4": 4}}]}]}
    )
    assert out["dimensions"][0]["sub_factors"][0]["by_band"] == {"4": "4"}


def test_drops_blank_comment_bank_entries_and_nulls_non_string_dimension_intent():
    out = normalize_rubric(
        {
            "schema_version": 2,
            "comment_bank": [
                {"dimension": "pronunciation", "intent": "khen", "text": "giữ lại"},
                {"dimension": 7, "intent": False, "text": "giữ lại 2"},
                {"dimension": "x", "intent": "y", "text": "   "},
                "không phải object",
            ],
        }
    )
    assert out["comment_bank"] == [
        {"dimension": "pronunciation", "intent": "khen", "text": "giữ lại"},
        {"dimension": None, "intent": None, "text": "giữ lại 2"},
    ]


def test_drops_non_object_levels_and_never_range_validates_them():
    out = normalize_rubric(
        {
            "schema_version": 2,
            "levels": [
                {"min": 0, "max": 10, "code": "A0", "label": "x"},
                "rác",
                {"min": 5, "max": 3, "code": "B", "label": "chồng lấn"},
            ],
        }
    )
    assert out["levels"] == [
        {"min": 0, "max": 10, "code": "A0", "label": "x"},
        {"min": 5, "max": 3, "code": "B", "label": "chồng lấn"},
    ]


@pytest.mark.parametrize("step", [0, -1, "x", None])
def test_repairs_unusable_scale_step_to_one(step):
    assert normalize_rubric({"schema_version": 2, "scale": {"min": 0, "max": 9, "step": step}})["scale"]["step"] == 1


def test_defaults_non_finite_dimension_weight_to_one():
    out = normalize_rubric({"dimensions": [{"name": "pronunciation", "weight": "nặng"}]})
    assert out["dimensions"][0]["weight"] == 1


def test_falls_back_to_average_for_an_unknown_aggregation_method():
    out = normalize_rubric({"schema_version": 2, "aggregation": {"method": "median", "round": "floor"}})
    assert out["aggregation"] == {"method": "average", "round": "none"}


def test_preserves_schema_version_above_two():
    assert normalize_rubric({"schema_version": 3, "course_key": "future"})["schema_version"] == 3


def test_treats_a_non_numeric_schema_version_as_v1():
    out = normalize_rubric({"schema_version": "2", "dimensions": [{"name": "pronunciation", "bands": {"0": "kém"}}]})
    assert out["schema_version"] == 2
    assert out["dimensions"][0]["key"] == "pronunciation"
    assert out["dimensions"][0]["bands"] == {"0": ["kém"]}


def test_never_changes_character_case_when_converting_a_v1_name():
    out = normalize_rubric({"dimensions": [{"name": "Pronunciation"}]})
    assert out["dimensions"][0]["key"] == "Pronunciation"
    assert out["dimensions"][0]["label"] == "Pronunciation"


# ---- Ngữ nghĩa `String()` của JavaScript (AC-03.5 / AC-05.2 / AC-05.3) ----
#
# AC-03.5 gọi TÊN `String(value)` ⇒ bản TS là BẢN CHUẨN, bản này phải bắt chước. Mỗi test dưới
# đây có bản sinh đôi từng dòng trong `rubric-schema.spec.ts` (describe "JS String() semantics").
# QA F8 DEF-01: fuzz 3 000 đầu vào bắt 32 ca lệch, tất cả đều nằm ở `_to_text`.


def _bands_of(value):
    return normalize_rubric({"dimensions": [{"name": "pronunciation", "bands": {"b": value}}]})["dimensions"][0]["bands"]["b"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (7, ["7"]),
        (3.0, ["3"]),  # JS in 3.0 ra "3", str() của Python ra "3.0"
        (2.5, ["2.5"]),
        (True, ["true"]),
        (False, ["false"]),
        (None, ["null"]),
        ("", []),
        ("   ", []),
        (["a", "b"], ["a", "b"]),
        ([], []),
        ({"a": 1}, ["[object Object]"]),
        (["x", ["y", "z"]], ["x", "y,z"]),
        ([{"a": 1}], ["[object Object]"]),
        (1e21, ["1e+21"]),  # JS chuyển sang dạng mũ khi n > 21
        (1e20, ["100000000000000000000"]),
        (1e-6, ["0.000001"]),
        (1.1920928955078125e-7, ["1.1920928955078125e-7"]),  # 2^-23; JS KHÔNG đệm 0 vào phần mũ
        (-1.5, ["-1.5"]),
        (-0.0, ["0"]),  # JS: String(-0) === "0"
    ],
)
def test_stringifies_band_values_the_way_javascript_does(value, expected):
    assert _bands_of(value) == expected


def test_joins_a_nested_array_band_value_the_way_array_prototype_join_does():
    # KHÁC với phần tử None của MẢNG band: ở đó mỗi phần tử đi qua String() riêng lẻ nên ra
    # "null"; ở đây None nằm trong một mảng LỒNG nên đi qua join ⇒ chuỗi rỗng.
    assert _bands_of([1, None, ["x", None, "y"]]) == ["1", "null", "x,,y"]


def test_stringifies_by_band_values_without_trimming_them():
    out = normalize_rubric(
        {
            "schema_version": 2,
            "dimensions": [
                {
                    "key": "pronunciation",
                    "sub_factors": [{"label": "x", "by_band": {"0": None, "1": ["a", "b"], "2": {"a": 1}, "3": "  kept  "}}],
                }
            ],
        }
    )
    assert out["dimensions"][0]["sub_factors"][0]["by_band"] == {
        "0": "null",
        "1": "a,b",
        "2": "[object Object]",
        "3": "  kept  ",
    }


def test_treats_an_explicit_null_comment_text_as_absent_but_keeps_false_and_zero():
    """Bản TS là `toText(item.text ?? '')` — `??` chỉ bắt nullish, KHÔNG bắt `false`/`0`."""
    out = normalize_rubric(
        {
            "schema_version": 2,
            "comment_bank": [
                {"dimension": "p", "intent": "khen", "text": None},
                {"dimension": "p", "intent": "khen"},
                {"dimension": "p", "intent": "khen", "text": False},
                {"dimension": "p", "intent": "khen", "text": 0},
                {"dimension": "p", "intent": "khen", "text": ["a", "b"]},
            ],
        }
    )
    assert out["comment_bank"] == [
        {"dimension": "p", "intent": "khen", "text": "false"},
        {"dimension": "p", "intent": "khen", "text": "0"},
        {"dimension": "p", "intent": "khen", "text": "a,b"},
    ]


def test_keeps_a_none_few_shot_example_as_the_literal_string_null():
    """Nhánh `few_shot_examples` KHÔNG có `??` ⇒ None ra chuỗi "null" và được GIỮ. Sự bất đối
    xứng với `comment_bank` là CỐ Ý, bản TS cũng vậy — đừng 'dọn dẹp' cho giống nhau."""
    out = normalize_rubric({"few_shot_examples": [None, 12, {"a": 1}, "", "   "]})
    assert [e["text"] for e in out["comment_bank"]] == ["null", "12", "[object Object]"]


def test_stringifies_output_fields_entries():
    out = normalize_rubric({"output_fields": ["comment", 7, True, None, ["", "fix"], {"a": 1}]})
    assert out["output_fields"] == ["comment", "7", "true", "null", ",fix", "[object Object]"]


# ---- `String.prototype.trim()` của JS vs `str.strip()` của Python (QA F8 DEF-02) ----
#
# `str.strip()` cắt theo `str.isspace()`, KHÁC tập của ECMAScript ở đúng 6 điểm mã: nó cắt THỪA
# U+001C-U+001F và U+0085, và cắt THIẾU U+FEFF. AC-03.5 gọi tên `.trim()` ngang hàng với
# `String()` ⇒ bản TS là chuẩn. Bảng dưới là bản sinh đôi của `TRIM_PROBES` trong
# `rubric-schema.spec.ts`. Escape \uXXXX là CỐ Ý — mấy ký tự này vô hình trong editor.

TRIM_PROBES = [
    ("U+0009 TAB", "\u0009", True),
    ("U+000A LF", "\u000a", True),
    ("U+000B VT", "\u000b", True),
    ("U+000C FF", "\u000c", True),
    ("U+000D CR", "\u000d", True),
    ("U+0020 SP", "\u0020", True),
    ("U+00A0 NBSP", "\u00a0", True),
    ("U+1680 OGHAM", "\u1680", True),
    ("U+2000 EN QUAD", "\u2000", True),
    ("U+2028 LS", "\u2028", True),
    ("U+2029 PS", "\u2029", True),
    ("U+202F NNBSP", "\u202f", True),
    ("U+205F MMSP", "\u205f", True),
    ("U+3000 IDEOGRAPHIC SP", "\u3000", True),
    ("U+FEFF ZWNBSP", "\ufeff", True),  # `str.strip()` KHÔNG cắt ký tự này — JS thì có
    ("U+001C FS", "\u001c", False),  # `str.strip()` CÓ cắt các ký tự C0 này — JS thì không
    ("U+001D GS", "\u001d", False),
    ("U+001E RS", "\u001e", False),
    ("U+001F US", "\u001f", False),
    ("U+0085 NEL", "\u0085", False),  # `str.strip()` CÓ cắt — JS thì không
    ("U+180E MONGOLIAN", "\u180e", False),  # Zs tới Unicode 6.2, nay là Cf ⇒ không bên nào cắt
    ("U+200B ZWSP", "\u200b", False),
    ("U+0000 NUL", "\u0000", False),
]
TRIM_IDS = [label for label, _, _ in TRIM_PROBES]


@pytest.mark.parametrize(("char", "trimmed"), [(c, t) for _, c, t in TRIM_PROBES], ids=TRIM_IDS)
def test_trims_a_padded_band_value_exactly_where_javascript_does(char, trimmed):
    assert _bands_of(char + "x" + char) == (["x"] if trimmed else [char + "x" + char])


@pytest.mark.parametrize(("char", "trimmed"), [(c, t) for _, c, t in TRIM_PROBES], ids=TRIM_IDS)
def test_a_whitespace_only_band_value_collapses_exactly_where_javascript_does(char, trimmed):
    """Đây mới là chỗ đau: nó đổi SỐ LƯỢNG gạch đầu dòng, không chỉ đổi chữ."""
    assert _bands_of(char) == ([] if trimmed else [char])


@pytest.mark.parametrize(("char", "trimmed"), [(c, t) for _, c, t in TRIM_PROBES], ids=TRIM_IDS)
def test_a_whitespace_only_comment_text_decides_whether_the_entry_survives(char, trimmed):
    out = normalize_rubric({"schema_version": 2, "comment_bank": [{"dimension": None, "intent": None, "text": char}]})
    assert len(out["comment_bank"]) == (0 if trimmed else 1)


def test_does_not_trim_by_band_values_at_all():
    out = normalize_rubric(
        {
            "schema_version": 2,
            "dimensions": [{"key": "pronunciation", "sub_factors": [{"label": "x", "by_band": {"0": "\ufeff giữ nguyên \ufeff"}}]}],
        }
    )
    assert out["dimensions"][0]["sub_factors"][0]["by_band"]["0"] == "\ufeff giữ nguyên \ufeff"


def test_an_int_too_large_to_be_a_double_is_treated_as_non_finite_and_never_raises():
    """Sinh đôi của test `Infinity` bên TS: `JSON.parse("1e400")` ra Infinity bên JS, còn bên
    Python `json.loads` ra int chính xác vô hạn và `math.isfinite()` NÉM OverflowError."""
    huge = 10**400
    assert normalize_rubric({"schema_version": huge})["schema_version"] == 2
    assert normalize_rubric({"dimensions": [{"name": "p", "weight": huge}]})["dimensions"][0]["weight"] == 1
    assert normalize_rubric({"schema_version": 2, "scale": {"min": 0, "max": huge, "step": 1}})["scale"]["max"] == 3
    assert _bands_of(huge) == ["Infinity"]
    assert _bands_of(-huge) == ["-Infinity"]


def test_an_int_beyond_2_pow_53_is_lowered_to_the_double_javascript_would_hold():
    """JS chỉ có double: `JSON.parse("9007199254740993")` ra 9007199254740992. Bản Python giữ
    int chính xác nên phải hạ xuống double, nếu không hai bản lệch nhau ở mọi số > 2^53."""
    assert _bands_of(2**53 + 1) == ["9007199254740992"]
    assert normalize_rubric({"dimensions": [{"name": "p", "weight": 2**53 + 1}]})["dimensions"][0]["weight"] == float(2**53)
    # Trong ngưỡng an toàn thì int giữ nguyên là int (không hóa float làm lệch JSON).
    assert normalize_rubric({"dimensions": [{"name": "p", "weight": 5}]})["dimensions"][0]["weight"] == 5
