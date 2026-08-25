"""Rubric schema v2 + shim nâng v1 → v2 (F8, thiết kế `Idea/20260819-ChamDiemRubricV2.md` Phần 3).

MODULE THUẦN — chỉ import stdlib/typing, không httpx, không redis, không core-api client.
`normalize_rubric()` chạy TRONG BỘ NHỚ lúc ĐỌC: worker không bao giờ gửi rubric ngược lại
core-api nên không có gì được lưu lại (BR-01, FR-16). Rubric v1 cũ ở lại v1 trên đĩa vĩnh viễn.

⚠ BẢN SONG SINH: logic dưới đây được nhân đôi từ TypeScript tại
    services/core-api/src/criteria/rubric-schema.ts
(repo không có cơ chế package dùng chung giữa TS và Python — xem tiền lệ `contracts.py` bị
nhân ba). Hai bản PHẢI giống hệt nhau; lưới đỡ chống trôi là fixture dùng chung
`services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json` + hai bộ test chạy
trên cùng fixture đó (`tests/test_rubric_schema.py` và `rubric-schema.spec.ts`).
Sửa file này thì PHẢI sửa file TS trong cùng một commit.

Lưu ý riêng của bản Python: mọi phép ép chuỗi phải bắt chước `String()` của JavaScript
(True → "true", None → "null", 3.0 → "3", ["a","b"] → "a,b", {"a":1} → "[object Object]",
1e21 → "1e+21") — xem `_to_text()` và `_js_number_to_string()`. Nếu không, hai bản sẽ cho kết
quả khác nhau ở các giá trị không phải chuỗi và test đối chiếu sẽ đỏ (QA F8 DEF-01: fuzz
3 000 đầu vào bắt được 32 ca lệch đúng vì các trường hợp này).

Tương tự, JS chỉ có MỘT kiểu số (double 64-bit). Python có int chính xác vô hạn, nên mọi
số đi qua đây phải được quy về đúng ngữ nghĩa double thì hai bản mới bằng nhau
(xem `_as_finite_number()`).
"""

from __future__ import annotations

import copy
import math
from decimal import Decimal
from typing import Any, TypedDict

# Dimension bắt buộc (mục 3.10) — hằng gốc; `schema.py` import lại từ đây để chỉ có MỘT chỗ khai báo.
PRONUNCIATION_DIMENSION = "pronunciation"


class RubricScale(TypedDict):
    min: int | float
    max: int | float
    step: int | float


class RubricAggregation(TypedDict):
    method: str  # sum | average | weighted_average
    round: str  # none | nearest_int


class RubricLevel(TypedDict):
    min: int | float
    max: int | float
    code: str
    label: str


class RubricSubFactor(TypedDict):
    label: str
    by_band: dict[str, str]


class RubricDimensionV2(TypedDict):
    key: str  # khóa máy, ổn định — làm property name trong JSON Schema đầu ra của LLM
    label: str  # nhãn giáo viên thấy
    weight: int | float
    bands: dict[str, list[str]]  # band -> danh sách gạch đầu dòng
    sub_factors: list[RubricSubFactor]  # luôn có mặt; [] nếu không dùng


class CommentBankEntry(TypedDict):
    dimension: str | None  # None = dùng chung mọi tiêu chí
    intent: str | None  # "khen" | "góp ý" | ... (chuỗi tự do); None = không phân loại
    text: str


class StudentReplyButton(TypedDict):
    title: str
    action: str


class StudentReply(TypedDict):
    show_total: bool
    show_level: bool
    template: str
    buttons: list[StudentReplyButton]


class RubricV2(TypedDict):
    schema_version: int
    course_key: str
    task_type: str
    tone: str
    feedback_language: str
    scale: RubricScale
    aggregation: RubricAggregation
    levels: list[RubricLevel]  # [] = không quy đổi cấp độ; F8 KHÔNG kiểm tra phủ/chồng lấn (F9)
    output_fields: list[str]
    dimensions: list[RubricDimensionV2]
    comment_bank: list[CommentBankEntry]
    student_reply: StudentReply | None  # None nếu khóa không định nghĩa; F11 mới dùng tới


# Thang mặc định DUY NHẤT toàn repo (BR-06): khớp docx-parser `0-3`, `band_scale` mặc định
# [0,3] của schema.py cũ, và `DEFAULT_BAND_MAX = 3` của reports.service.ts.
DEFAULT_SCALE: RubricScale = {"min": 0, "max": 3, "step": 1}
_DEFAULT_TASK_TYPE = "speaking_clip"
_DEFAULT_TONE = "khích lệ"
_DEFAULT_FEEDBACK_LANGUAGE = "vi"

_AGGREGATION_METHODS = ("sum", "average", "weighted_average")
_ROUNDING_MODES = ("none", "nearest_int")

# `Number.MAX_SAFE_INTEGER + 1` — trên ngưỡng này int Python còn chính xác nhưng double của JS
# thì không, nên phải hạ về double mới so sánh bằng được với bản TS.
_MAX_EXACT_INTEGER = 2**53

# Tập ký tự mà `String.prototype.trim()` của ECMAScript cắt: WhiteSpace ∪ LineTerminator
# = TAB, LF, VT, FF, CR, SP, NBSP, ZWNBSP(U+FEFF), toàn bộ category Zs (U+1680, U+2000–U+200A,
# U+202F, U+205F, U+3000), LS(U+2028), PS(U+2029).
#
# `str.strip()` của Python cắt theo `str.isspace()` — KHÁC tập trên ở đúng 6 điểm mã và QA F8
# DEF-02 đã bắt được cả 6: Python cắt THỪA U+001C–U+001F và U+0085 (JS không cắt), và cắt THIẾU
# U+FEFF (JS có cắt). Sai lệch này đổi cả SỐ LƯỢNG gạch đầu dòng / entry chứ không chỉ đổi chữ.
# Escape là cố ý — mấy ký tự này vô hình trong editor. U+180E, U+200B, U+0000 KHÔNG thuộc tập
# này (cả hai ngôn ngữ đều không cắt) — đừng "bổ sung" cho đủ bộ trông-giống-khoảng-trắng.
_JS_WHITESPACE = (
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005"
    "\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def _js_trim(text: str) -> str:
    """`String.prototype.trim()` của JS. AC-03.5 gọi tên `.trim()` ngang hàng với `String()`,
    nên mọi chỗ bản TS gọi `.trim()` thì bản này phải gọi `_js_trim()`, KHÔNG phải `.strip()`."""
    return text.strip(_JS_WHITESPACE)


# ─── tiện ích thuần ────────────────────────────────────────────────────────────────


def _is_plain_object(value: Any) -> bool:
    """Object "thường" — list và None KHÔNG tính (AC-05.1: normalize([]) ⇒ toàn mặc định)."""
    return isinstance(value, dict)


def _as_string(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _as_finite_number(value: Any) -> int | float | None:
    """bool là subclass của int trong Python nhưng KHÔNG phải number trong JS ⇒ loại thẳng.

    JS chỉ có double: `JSON.parse("1e400")` ra `Infinity` ⇒ `Number.isFinite` false ⇒ null.
    Python thì `json.loads` ra int chính xác vô hạn, và `math.isfinite(10**400)` NÉM
    OverflowError (vi phạm AC-02.2 "không bao giờ raise"). Nên int được quy về double trước:
    tràn ⇒ None; ngoài ±2^53 ⇒ hạ xuống double để khớp đúng giá trị mà JS đang giữ.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, int):
        try:
            as_double = float(value)
        except OverflowError:  # |value| > ~1.8e308 ⇒ JS thấy Infinity
            return None
        if not math.isfinite(as_double):
            return None
        return value if abs(value) <= _MAX_EXACT_INTEGER else as_double
    return value if math.isfinite(value) else None


def _js_number_to_string(value: int | float) -> str:
    """`Number::toString(value, 10)` của ECMAScript (mục 6.1.6.1.20) — thuật toán mà JS
    `String(number)` dùng. Khác `str()` của Python ở BA chỗ, cả ba đều làm hai bản lệch nhau:

    - `3.0` → "3" (Python: "3.0")
    - `1e21` → "1e+21" (Python: "1000000000000000000000") — JS chuyển sang mũ khi n > 21
    - `1e-7` → "1e-7" (Python: "1e-07") — JS chuyển sang mũ khi n <= -6, và KHÔNG đệm số 0
      vào phần mũ.

    `repr()` của Python cho biểu diễn NGẮN NHẤT round-trip, đúng như s/k/n mà thuật toán JS
    đòi; phần còn lại chỉ là ráp chuỗi theo đúng 5 nhánh của spec.
    """
    if isinstance(value, int):
        try:
            number = float(value)
        except OverflowError:
            return "Infinity" if value > 0 else "-Infinity"
    else:
        number = value

    if math.isnan(number):
        return "NaN"
    if number == 0:
        return "0"  # JS: String(-0) === "0"
    if math.isinf(number):
        return "Infinity" if number > 0 else "-Infinity"

    sign = "-" if number < 0 else ""
    # s = dãy chữ số ngắn nhất, k = số chữ số, n sao cho giá trị = 0.s × 10^n
    decimal_tuple = Decimal(repr(abs(number))).normalize().as_tuple()
    s = "".join(str(digit) for digit in decimal_tuple.digits)
    k = len(s)
    n = int(decimal_tuple.exponent) + k

    if k <= n <= 21:
        return sign + s + "0" * (n - k)
    if 0 < n <= 21:
        return sign + s[:n] + "." + s[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + s
    exponent = n - 1
    mantissa = s if k == 1 else s[0] + "." + s[1:]
    return f"{sign}{mantissa}e{'+' if exponent >= 0 else '-'}{abs(exponent)}"


def _to_text(value: Any) -> str:
    """Bắt chước `String(value)` của JavaScript — bản TS dùng String() nên bản này phải khớp.

    Bảng đối chiếu (đã bị QA fuzz bắt lỗi một lần, đừng rút gọn lại):
    None → "null" · True/False → "true"/"false" · số → `_js_number_to_string` ·
    list → `Array.prototype.join(",")`, phần tử null/undefined thành CHUỖI RỖNG, phần tử là
    list thì đệ quy (`String([1,[2,3]])` === "1,2,3") · dict → "[object Object]".
    """
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return _js_number_to_string(value)
    if isinstance(value, (list, tuple)):
        return ",".join("" if item is None else _to_text(item) for item in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)  # kiểu ngoài JSON (bytes, set, ...) — không tới được từ dữ liệu thật


def _deep_copy_json(value: Any) -> Any:
    """Chép sâu (không giữ tham chiếu tới input). Chỉ dùng cho `levels` và `student_reply` —
    hai trường được chép NGUYÊN VẸN (AC-05.4, §1.3) chứ không lọc khóa."""
    return copy.deepcopy(value)


# ─── các bước chuẩn hóa từng trường ────────────────────────────────────────────────


def _normalize_scale(raw: dict[str, Any]) -> RubricScale:
    """`scale` v2 trước, rồi `band_scale` v1, cuối cùng mặc định {0,3,1} (AC-03.1/03.2/04.3)."""
    scale = raw.get("scale")
    if _is_plain_object(scale):
        min_value = _as_finite_number(scale.get("min"))
        max_value = _as_finite_number(scale.get("max"))
        step = _as_finite_number(scale.get("step"))
        return {
            "min": min_value if min_value is not None else DEFAULT_SCALE["min"],
            "max": max_value if max_value is not None else DEFAULT_SCALE["max"],
            "step": step if step is not None and step > 0 else DEFAULT_SCALE["step"],
        }
    band_scale = raw.get("band_scale")
    if isinstance(band_scale, list) and len(band_scale) >= 2:
        min_value = _as_finite_number(band_scale[0])
        max_value = _as_finite_number(band_scale[1])
        if min_value is not None and max_value is not None:
            return {"min": min_value, "max": max_value, "step": 1}
    return dict(DEFAULT_SCALE)  # type: ignore[return-value]


def _normalize_aggregation(raw: dict[str, Any]) -> RubricAggregation:
    """v1 không có `aggregation` ⇒ "average" — đúng bằng số học báo cáo hiện tại (BR-03)."""
    agg = raw.get("aggregation")
    agg = agg if _is_plain_object(agg) else {}
    method = _as_string(agg.get("method"))
    rounding = _as_string(agg.get("round"))
    return {
        "method": method if method in _AGGREGATION_METHODS else "average",
        "round": rounding if rounding in _ROUNDING_MODES else "none",
    }


def _normalize_levels(raw: dict[str, Any]) -> list[RubricLevel]:
    """Chép nguyên phần tử là object; bỏ phần tử không phải object. KHÔNG kiểm tra khoảng
    (hở/chồng lấn) — việc của F9 (AC-05.4)."""
    levels = raw.get("levels")
    if not isinstance(levels, list):
        return []
    return [_deep_copy_json(lv) for lv in levels if _is_plain_object(lv)]


def _normalize_output_fields(raw: dict[str, Any]) -> list[str]:
    """Có mặt (kể cả []) thì giữ nguyên; vắng mặt mới điền ["comment"] (AC-04.2). Giá trị lạ
    vẫn nằm trong mảng nhưng FR-09 bỏ qua."""
    fields = raw.get("output_fields")
    if not isinstance(fields, list):
        return ["comment"]
    return [_to_text(f) for f in fields]


def _normalize_band_value(value: Any) -> list[str]:
    """Một giá trị band → mảng gạch đầu dòng. Hàm này CHỈ nhìn KIỂU của giá trị, không nhìn
    version ⇒ mảng sẵn có không bao giờ bị bọc thêm một lớp nữa (AC-04.1, AC-15.8 ca 10)."""
    if isinstance(value, list):
        return [text for text in (_js_trim(_to_text(v)) for v in value) if text]
    text = _js_trim(_to_text(value))
    return [text] if text else []


def _normalize_bands(value: Any) -> dict[str, list[str]]:
    # Khóa object trong JS LUÔN là chuỗi theo ngữ nghĩa String() ⇒ dùng `_to_text`, không `str()`
    # (str(True) ra "True" chứ không phải "true").
    if not _is_plain_object(value):
        return {}
    return {_to_text(band): _normalize_band_value(desc) for band, desc in value.items()}


def _normalize_sub_factors(value: Any) -> list[RubricSubFactor]:
    if not isinstance(value, list):
        return []
    out: list[RubricSubFactor] = []
    for sub_factor in value:
        if not _is_plain_object(sub_factor):
            continue
        by_band_raw = sub_factor.get("by_band")
        by_band = (
            {_to_text(band): _to_text(desc) for band, desc in by_band_raw.items()}
            if _is_plain_object(by_band_raw)
            else {}
        )
        label = _as_string(sub_factor.get("label"))
        out.append({"label": label if label is not None else "", "by_band": by_band})
    return out


def _normalize_dimension(raw: dict[str, Any], is_v2: bool) -> RubricDimensionV2:
    """v1: `name` → `key` VÀ `label` (cùng giá trị, NGUYÊN VĂN, không đổi hoa/thường — BR-07:
    rubric hôm qua chấm ra khóa nào thì hôm nay vẫn ra đúng khóa đó).
    v2: ưu tiên `key`, thiếu thì mượn `label`, thiếu nữa mới mượn `name` (AC-04.3/04.4).
    Việc hạ chữ thường CHỈ xảy ra lúc bóc .docx mới (BR-08), không xảy ra ở đây."""
    name = _as_string(raw.get("name"))
    raw_key = _as_string(raw.get("key"))
    raw_label = _as_string(raw.get("label"))

    if is_v2:
        key = raw_key if raw_key is not None else (raw_label if raw_label is not None else name)
        label = raw_label if raw_label is not None else name
    else:
        key = name if name is not None else (raw_key if raw_key is not None else raw_label)
        label = name if name is not None else raw_label

    key = key if key is not None else ""
    label = label if label is not None else key

    weight = _as_finite_number(raw.get("weight"))
    return {
        "key": key,
        "label": label,
        "weight": weight if weight is not None else 1,
        "bands": _normalize_bands(raw.get("bands")),
        "sub_factors": _normalize_sub_factors(raw.get("sub_factors")),
    }


def _normalize_dimensions(raw: dict[str, Any], is_v2: bool) -> list[RubricDimensionV2]:
    dimensions = raw.get("dimensions")
    if not isinstance(dimensions, list):
        return []
    return [_normalize_dimension(d, is_v2) for d in dimensions if _is_plain_object(d)]


def _normalize_comment_bank(raw: dict[str, Any]) -> list[CommentBankEntry]:
    """`comment_bank` có sẵn thì dùng; không thì dựng từ `few_shot_examples` của v1 (AC-03.7,
    AC-04.3) — nội dung giáo viên đã soạn KHÔNG được mất khi nâng version."""
    bank = raw.get("comment_bank")
    if isinstance(bank, list):
        entries: list[CommentBankEntry] = []
        for item in bank:
            if not _is_plain_object(item):
                continue
            # Bản TS là `toText(item.text ?? '')`: `??` bắt CẢ `undefined` (khóa vắng mặt) LẪN
            # `null` — nhưng KHÔNG bắt `false`/`0`/`""`. `item.get("text", "")` chỉ bắt khóa vắng
            # mặt nên `{"text": null}` ra chuỗi "null" và giữ lại entry (QA F8 DEF-01).
            raw_text = item.get("text")
            text = _js_trim(_to_text("" if raw_text is None else raw_text))
            if not text:
                continue
            entries.append(
                {
                    "dimension": _as_string(item.get("dimension")),
                    "intent": _as_string(item.get("intent")),
                    "text": text,
                }
            )
        return entries

    examples = raw.get("few_shot_examples")
    if isinstance(examples, list):
        entries = []
        for example in examples:
            text = _js_trim(_to_text(example))
            if not text:
                continue
            entries.append({"dimension": None, "intent": None, "text": text})
        return entries

    return []


def _normalize_student_reply(raw: dict[str, Any]) -> StudentReply | None:
    student_reply = raw.get("student_reply")
    return _deep_copy_json(student_reply) if _is_plain_object(student_reply) else None


# ─── điểm vào ──────────────────────────────────────────────────────────────────────


def normalize_rubric(raw: Any) -> RubricV2:
    """Nâng bất kỳ rubric nào (v1, v2, hay rác) về đúng shape v2.

    - KHÔNG BAO GIỜ raise: giá trị sai/thiếu được VÁ bằng mặc định, không bị từ chối (BR-04).
      Hai điểm từ chối duy nhất trong vòng đời rubric vẫn nằm nguyên chỗ cũ: cổng upload
      (core-api docx-parser) và cổng lúc chấm (`schema.py`).
    - KHÔNG sửa đối số đầu vào (AC-02.3).
    - Đầu ra là DANH SÁCH TRẮNG đúng 12 khóa top-level (BR-05) ⇒ khóa lạ bị loại, nhờ vậy so
      sánh bằng nhau tuyệt đối giữa TS và Python mới khả thi.
    - PHÂN NHÁNH MỘT LẦN duy nhất theo `schema_version` (BR-02), không phân nhánh theo từng
      trường — và các hàm con lại chỉ nhìn KIỂU giá trị ⇒ idempotent (AC-04.6).
    """
    source: dict[str, Any] = raw if _is_plain_object(raw) else {}

    version = _as_finite_number(source.get("schema_version"))
    is_v2 = version is not None and version >= 2

    course_key = _as_string(source.get("course_key"))
    task_type = _as_string(source.get("task_type"))
    tone = _as_string(source.get("tone"))
    feedback_language = _as_string(source.get("feedback_language"))

    return {
        "schema_version": version if is_v2 else 2,  # type: ignore[typeddict-item]
        "course_key": course_key if course_key is not None else "",
        "task_type": task_type if task_type is not None else _DEFAULT_TASK_TYPE,
        "tone": tone if tone is not None else _DEFAULT_TONE,
        "feedback_language": feedback_language if feedback_language is not None else _DEFAULT_FEEDBACK_LANGUAGE,
        "scale": _normalize_scale(source),
        "aggregation": _normalize_aggregation(source),
        "levels": _normalize_levels(source),
        "output_fields": _normalize_output_fields(source),
        "dimensions": _normalize_dimensions(source, is_v2),
        "comment_bank": _normalize_comment_bank(source),
        "student_reply": _normalize_student_reply(source),
    }
