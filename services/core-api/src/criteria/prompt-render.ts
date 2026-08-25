/**
 * Bản dựng prompt (F12 FR-02/FR-03) — dùng cho màn xem trước prompt trong drawer "Soạn nội dung
 * chấm điểm". Trả về ĐÚNG đoạn text mà grading-worker sẽ gửi cho LLM, không phải một bản tóm tắt.
 *
 * MODULE THUẦN — không import @nestjs/*, Prisma, Redis, fs hay bất cứ I/O nào (AC-02.1).
 *
 * ⚠⚠ BẢN SONG SINH: đây là bản chép của
 *     services/grading-worker/src/grading_worker/grading/prompt.py
 * (repo không có cơ chế package dùng chung giữa TS và Python — xem tiền lệ `contracts.ts` bị nhân
 * ba và `rubric-schema.ts` ↔ `rubric_schema.py`). Bản Python là BẢN GỐC: nó chạy lúc chấm thật,
 * bản này chỉ để xem trước. Hai bản PHẢI cho ra chuỗi GIỐNG HỆT NHAU; lưới đỡ chống trôi là fixture
 * dùng chung `__fixtures__/prompt-render.fixtures.json` + hai bộ test chạy trên cùng fixture đó
 * (`prompt-render.spec.ts` và `grading-worker/tests/test_prompt_render_fixtures.py`).
 * Sửa file này thì PHẢI sửa file Python trong cùng một commit, và ngược lại.
 *
 * RANH GIỚI CỨNG (BR-09, y hệt docstring bản Python): prompt TUYỆT ĐỐI không nhắc tới tổng điểm,
 * điểm trung bình hay tên cấp độ (`levels`). LLM chỉ chấm TỪNG tiêu chí; tổng và cấp độ do core-api
 * tính. Đừng thêm `levels` vào bất kỳ hàm render nào dưới đây.
 *
 * ─── MIỀN TƯƠNG ĐƯƠNG: ba chỗ KHÔNG THỂ khớp tuyệt đối, đã đo chứ không đoán ───────────────
 * F8 mất hai vòng sửa lỗi vì đúng loại trôi này (`String()` của JS, rồi tập ký tự của `.trim()`),
 * nên ba chỗ dưới đây được nêu thẳng thay vì để người sau phát hiện lại. CẢ BA chỉ đổi HÌNH THỨC
 * của prompt (thứ tự dòng band / cách in một con số), KHÔNG chỗ nào đổi điểm số.
 *
 *  1. `weight` là số nguyên-kiểu-float trong JSON. Python phân biệt int/float, JS thì không:
 *     JSON `1` ⇒ Python int ⇒ "1" ⇒ khớp; JSON `1.0` ⇒ Python float ⇒ "1.0" nhưng JS chỉ thấy
 *     `1` ⇒ "1". `pyNumberToString()` dưới đây đã khớp MỌI trường hợp khác (0.5, 1e-5, 1e17,
 *     nguyên > 2^53 …); phần dư đúng bằng "literal float có phần thập phân bằng 0" và
 *     "literal int > 2^53" — thứ không trình soạn nào sinh ra được.
 *  2. Thứ tự khóa của object. Khi CÓ ÍT NHẤT MỘT khóa band không đọc được thành số, cả hai bản
 *     rơi về "giữ thứ tự chèn" — nhưng thứ tự chèn của JS KHÁC Python: `JSON.parse` xếp mọi khóa
 *     dạng chỉ-số-mảng ("0", "1", "42") lên trước theo thứ tự tăng dần, còn `json.loads` giữ
 *     nguyên thứ tự trong file. Chỉ lệch khi rubric TRỘN khóa chỉ-số-mảng với khóa không phải số
 *     VÀ thứ tự trong JSON không tăng dần. (Nhánh "mọi khóa đều là số" — tức mọi rubric thật —
 *     sắp xếp lại nên không bị ảnh hưởng.)
 *  3. Khóa band mà `float()` của Python đọc ra NaN (`"nan"`, `"+NaN"`, …). Lúc đó `sorted` của
 *     Python chạy với một phép so sánh MÂU THUẪN (mọi so sánh với NaN đều False) nên kết quả phụ
 *     thuộc chi tiết cài đặt Timsort — Python KHÔNG đặc tả trường hợp này, nên không bản port nào
 *     "đúng" được. Bản này chọn hành vi tất định: coi như không phải số ⇒ giữ thứ tự chèn.
 *
 * Ba điểm trên là phát biểu về ĐỊNH DẠNG DÂY (JSON không mang kiểu int/float, không mang thứ tự
 * khóa chỉ-số), không phải lỗi vá được ở phía TS. Fixture dùng chung cố ý KHÔNG chứa ca nào rơi
 * vào ba miền này — thêm vào chỉ tạo ra một test đỏ vĩnh viễn, không phát hiện thêm được lỗi nào.
 */

import { normalizeRubric, type RubricV2 } from './rubric-schema';

/** Hai biến thể prompt — tập đóng, DTO của route xem trước dùng lại hằng này. */

// Hai câu mở đầu + câu đuôi dùng chung cho cả hai builder (nguyên văn `prompt.py`).
const HEADER_ROLE = 'Bạn là giáo viên chấm bài nói tiếng Anh cho học viên trung tâm ILM.';
const CRITERIA_INTRO = 'Chấm từng tiêu chí sau theo thang điểm và mô tả band tương ứng:';
const CLOSING = 'Trả về đúng theo schema JSON đã cung cấp — không thêm chữ nào ngoài JSON.';

// ─── ép số về chuỗi theo ngữ nghĩa Python ──────────────────────────────────────────

/** `Number.MAX_SAFE_INTEGER + 1`. Trùng `_MAX_EXACT_INTEGER` của `rubric_schema.py`: trên ngưỡng
 * này `_as_finite_number` bên Python đã hạ int về double, nên hai bản giữ CÙNG một giá trị. */
const MAX_EXACT_INTEGER = 2 ** 53;

/**
 * `repr()`/`str()` của Python cho một float — thuật toán `float_repr_style` (`PyOS_double_to_string`
 * chế độ 'r'): lấy dãy chữ số NGẮN NHẤT round-trip, rồi chọn dạng mũ khi `decpt <= -4 || decpt > 16`,
 * ngược lại dạng thập phân và LUÔN có ".0" nếu không có phần lẻ.
 *
 * Khác `String()` của JS ở ba chỗ (đã đo trên CPython 3.11):
 *   1.0 → "1.0" (JS "1") · 1e16 → "1e+16" (JS "10000000000000000") · 1e-7 → "1e-07" (JS "1e-7").
 * `Number.prototype.toString()` của JS cho đúng dãy chữ số ngắn nhất mà thuật toán trên cần, nên
 * phần còn lại chỉ là ráp chuỗi. (Đây là ẢNH GƯƠNG của `_js_number_to_string()` bên Python: bên đó
 * Python bắt chước JS, bên này TS bắt chước Python.)
 */
function pyFloatRepr(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';

  const sign = value < 0 ? '-' : '';
  const text = Math.abs(value).toString();

  // Tách "ddd.ddd" hoặc "d.ddde±dd" thành (dãy chữ số, decpt) với giá trị = 0.<dãy> × 10^decpt.
  const eIndex = text.indexOf('e');
  const mantissa = eIndex >= 0 ? text.slice(0, eIndex) : text;
  const exponent = eIndex >= 0 ? Number(text.slice(eIndex + 1)) : 0;
  const dotIndex = mantissa.indexOf('.');
  const intPart = dotIndex >= 0 ? mantissa.slice(0, dotIndex) : mantissa;
  const fracPart = dotIndex >= 0 ? mantissa.slice(dotIndex + 1) : '';

  const allDigits = intPart + fracPart;
  const stripped = allDigits.replace(/^0+/, '');
  const leadingZeros = allDigits.length - stripped.length;
  const digits = stripped.replace(/0+$/, '');
  const decpt = intPart.length + exponent - leadingZeros;
  const k = digits.length;

  if (decpt <= -4 || decpt > 16) {
    const e = decpt - 1;
    const head = k === 1 ? digits : `${digits[0]}.${digits.slice(1)}`;
    const eSign = e < 0 ? '-' : '+';
    return `${sign}${head}e${eSign}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  if (decpt <= 0) return `${sign}0.${'0'.repeat(-decpt)}${digits}`;
  if (decpt >= k) return `${sign}${digits}${'0'.repeat(decpt - k)}.0`;
  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}

/**
 * Nội suy một số vào chuỗi ĐÚNG NHƯ f-string của Python làm (`f"{value}"` = `str(value)`).
 *
 * Python có int chính xác vô hạn và float riêng biệt; JS chỉ có double. Sau `normalizeRubric`
 * (bản Python hạ mọi int > 2^53 xuống double) thì một giá trị NGUYÊN với |v| ≤ 2^53 CHẮC CHẮN là
 * int bên Python ⇒ `str()` cho dãy chữ số trần, y hệt `String()` của JS. Mọi giá trị khác là float
 * ⇒ đi qua `pyFloatRepr`. Phần dư không quyết định được xem điểm 1 ở đầu file.
 */
export function pyNumberToString(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) <= MAX_EXACT_INTEGER) return String(value);
  return pyFloatRepr(value);
}

// ─── `float(str)` của Python, dùng cho thứ tự band ─────────────────────────────────

/**
 * Tập ký tự mà `float()` của CPython chấp nhận làm ĐỆM hai đầu. Đo bằng cách quét toàn bộ
 * 0x110000 điểm mã trên CPython 3.11: bằng `str.isspace()` TRỪ U+001C–U+001F (bốn ký tự này
 * `isspace()` là True nhưng `float("1")` vẫn ValueError). Escape là cố ý — chúng vô hình.
 * U+180E, U+200B, U+0000 KHÔNG thuộc tập này; đừng "bổ sung cho đủ bộ trông-giống-khoảng-trắng".
 */
const PY_FLOAT_PADDING =
  '\u0009\u000a\u000b\u000c\u000d\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004' +
  '\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000';

/** Văn phạm số của Python (kèm dấu gạch dưới của PEP 515): `digitpart` = `\d(?:_?\d)*`. */
const PY_DIGIT_PART = '\\d(?:_?\\d)*';
const PY_NUMBER_PATTERN = new RegExp(
  `^[+-]?(?:(?:${PY_DIGIT_PART}(?:\\.(?:${PY_DIGIT_PART})?)?|\\.${PY_DIGIT_PART})(?:[eE][+-]?${PY_DIGIT_PART})?)$`,
);
const PY_SPECIAL_PATTERN = /^[+-]?(?:inf(?:inity)?|nan)$/i;
const UNICODE_DECIMAL_DIGIT = /\p{Nd}/u;

/** Giá trị 0–9 của một chữ số thập phân Unicode (mọi khối `Nd` là một dãy 10 điểm mã liên tiếp). */
function decimalDigitValue(codePoint: number): number | null {
  for (let k = 0; k <= 9; k += 1) {
    const base = codePoint - k;
    if (!UNICODE_DECIMAL_DIGIT.test(String.fromCodePoint(base))) return null;
    if (!UNICODE_DECIMAL_DIGIT.test(String.fromCodePoint(base - 1))) return k;
  }
  return null;
}

/**
 * `float(text)` của Python: `null` khi Python ném `ValueError`, ngược lại là giá trị (có thể là
 * ±Infinity hoặc NaN).
 *
 * KHÔNG dùng `Number(text)` được — hai văn phạm khác nhau ở năm chỗ, mỗi chỗ đều đổi kết quả:
 *   `""` → Python ValueError, `Number` 0 · `"0x10"` → ValueError, `Number` 16 ·
 *   `"1_0"` → 10.0, `Number` NaN · `"inf"`/`"nan"` → inf/nan, `Number` NaN ·
 *   `"١٢"` (chữ số Ả Rập-Ấn) → 12.0, `Number` NaN.
 * CPython chạy `_PyUnicode_TransformDecimalAndSpaceToASCII` trước khi bóc, nên MỌI chữ số thập
 * phân Unicode và mọi khoảng trắng Unicode đều hợp lệ — hàm này làm đúng bước đó.
 */
export function pyFloat(text: string): number | null {
  let normalized = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0) as number;
    if (PY_FLOAT_PADDING.includes(char)) {
      normalized += ' ';
      continue;
    }
    if (codePoint > 0x7f && UNICODE_DECIMAL_DIGIT.test(char)) {
      const value = decimalDigitValue(codePoint);
      normalized += value === null ? char : String(value);
      continue;
    }
    normalized += char;
  }

  const trimmed = normalized.replace(/^ +/, '').replace(/ +$/, '');
  if (PY_SPECIAL_PATTERN.test(trimmed)) {
    if (/nan$/i.test(trimmed)) return Number.NaN;
    return trimmed.startsWith('-') ? -Infinity : Infinity;
  }
  if (!PY_NUMBER_PATTERN.test(trimmed)) return null;
  // `Number()` đọc đúng phần văn phạm còn lại; chỉ cần bỏ dấu gạch dưới trước.
  return Number(trimmed.replace(/_/g, ''));
}

/**
 * Sắp band tăng dần theo số khi MỌI khóa đều là số; ngược lại giữ nguyên thứ tự chèn.
 * Tất định trong cả hai trường hợp ⇒ snapshot test không rung (bản Python: `_band_order`).
 *
 * Bản Python viết `sorted(keys, key=float)` trong `try/except (TypeError, ValueError)`. Ở đây
 * `pyFloat` trả `null` thay cho ValueError. Khóa đọc ra NaN bị coi là "không phải số" — xem điểm 3
 * ở đầu file. So sánh dùng `<`/`>` tường minh (KHÔNG dùng `a - b`: `Infinity - Infinity` là NaN)
 * kèm phá hòa bằng chỉ số, nên ổn định giống `sorted` của Python.
 */
function bandOrder(bands: Record<string, unknown>): string[] {
  const keys = Object.keys(bands);
  const values: number[] = [];
  for (const key of keys) {
    const value = pyFloat(key);
    if (value === null || Number.isNaN(value)) return keys;
    values.push(value);
  }
  return keys
    .map((key, index) => ({ key, value: values[index], index }))
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : a.index - b.index))
    .map((entry) => entry.key);
}

// ─── các khối render dùng chung cho cả hai builder ─────────────────────────────────

/**
 * Mỗi tiêu chí: một dòng tiêu đề (nhãn + khóa máy + trọng số), rồi mỗi band một khối, MỖI GẠCH
 * ĐẦU DÒNG MỘT DÒNG (không nối bằng ';' như v1).
 */
function renderDimensions(rubric: RubricV2): string[] {
  const lines: string[] = [];
  for (const dim of rubric.dimensions) {
    lines.push(`- Tiêu chí: ${dim.label} [key=${dim.key}] (trọng số ${pyNumberToString(dim.weight)}):`);
    const bands = dim.bands;
    for (const band of bandOrder(bands)) {
      lines.push(`  Band ${band}:`);
      for (const bullet of bands[band]) lines.push(`    • ${bullet}`);
    }
    // Lưới yếu tố con: chỉ render khi thực sự có, không để lại tiêu đề rỗng.
    if (dim.sub_factors.length > 0) {
      lines.push('  Yếu tố con (tham chiếu khi chấm tiêu chí này):');
      for (const subFactor of dim.sub_factors) {
        const byBand = subFactor.by_band;
        const grid = bandOrder(byBand)
          .map((band) => `${band} = ${byBand[band]}`)
          .join(' | ');
        lines.push(`    - ${subFactor.label}: ${grid}`);
      }
    }
  }
  return lines;
}

/** Câu chữ phải khớp ĐÚNG tên trường trong JSON Schema (`comment`, `fix`) — LLM đọc cả hai. */
function renderOutputFieldsInstruction(rubric: RubricV2): string[] {
  if (rubric.output_fields.includes('fix')) {
    return [
      "Với MỖI tiêu chí, viết một nhận xét (trường 'comment') VÀ một hướng sửa bài cụ thể, " +
        "làm được ngay (trường 'fix').",
    ];
  }
  return ["Với MỖI tiêu chí, viết một nhận xét (trường 'comment')."];
}

/**
 * Nhóm theo tiêu chí, trong mỗi tiêu chí thì gắn nhãn ý định ("khen"/"góp ý"/...).
 * Thứ tự nhóm: theo thứ tự tiêu chí trong rubric → tiêu chí lạ (không khớp key nào) theo thứ tự
 * xuất hiện → nhóm "chung" (dimension = null) xếp CUỐI.
 *
 * DÙNG `Map`, KHÔNG dùng object thường: khóa tiêu chí hợp lệ có thể là "0"/"42"
 * (`MACHINE_KEY_PATTERN` cho phép), mà object của JS xếp khóa dạng chỉ-số-mảng lên trước — thứ tự
 * nhóm sẽ lệch khỏi dict của Python. `Map` giữ đúng thứ tự chèn, và phân biệt được khóa chuỗi
 * "null" với `null` thật.
 */
function renderCommentBank(rubric: RubricV2): string[] {
  const bank = rubric.comment_bank;
  if (bank.length === 0) return [];

  const labels = new Map<string, string>();
  for (const dim of rubric.dimensions) labels.set(dim.key, dim.label);

  const groups = new Map<string | null, RubricV2['comment_bank']>();
  for (const entry of bank) {
    const existing = groups.get(entry.dimension);
    if (existing) existing.push(entry);
    else groups.set(entry.dimension, [entry]);
  }

  const ordered: (string | null)[] = [];
  for (const key of labels.keys()) if (groups.has(key)) ordered.push(key);
  for (const key of groups.keys()) if (key !== null && !labels.has(key)) ordered.push(key);
  if (groups.has(null)) ordered.push(null);

  const lines = ['Ví dụ nhận xét mẫu do giáo viên cung cấp (bám theo văn phong này; nhãn [trong ngoặc vuông] chỉ để PHÂN LOẠI ví dụ — TUYỆT ĐỐI KHÔNG chép nhãn đó vào nhận xét trả về):'];
  for (const dimension of ordered) {
    const header = dimension === null ? 'Dùng chung' : `Tiêu chí ${labels.get(dimension) ?? dimension}`;
    lines.push(`  ${header}:`);
    for (const entry of groups.get(dimension) ?? []) {
      const prefix = entry.intent ? `[${entry.intent}] ` : '';
      lines.push(`    - ${prefix}${entry.text}`);
    }
  }
  return lines;
}

/** 4 dòng nhận dạng khóa/giọng điệu/ngôn ngữ dùng chung cho cả hai builder. */
function headerLines(rubric: RubricV2): string[] {
  return [
    HEADER_ROLE,
    `Khóa: ${rubric.course_key || '?'}. Loại bài: ${rubric.task_type}.`,
    `Giọng điệu nhận xét: ${rubric.tone}.`,
    `Viết nhận xét bằng ngôn ngữ: ${rubric.feedback_language}.`,
  ];
}

// ─── điểm vào ──────────────────────────────────────────────────────────────────────

/** Nhánh audio — bản chép của `build_system_instruction`. */
export function buildSystemInstruction(rubric: unknown): string {
  const normalized = normalizeRubric(rubric);
  const lines = headerLines(normalized);
  lines.push('CHỈ đánh giá dựa trên nội dung audio đính kèm. KHÔNG bịa thông tin không có trong audio.');
  lines.push(CRITERIA_INTRO);
  lines.push(...renderDimensions(normalized));
  lines.push(...renderOutputFieldsInstruction(normalized));
  lines.push(...renderCommentBank(normalized));
  lines.push(
    "Với tiêu chí 'pronunciation', liệt kê cụ thể từ phát âm sai (nếu có): từ gốc, " +
      'nghe thành gì, gợi ý sửa, vị trí ước lượng trong clip (giây).',
  );
  lines.push(CLOSING);
  return lines.join('\n');
}

export function renderPrompt(rubric: unknown): string {
  // Chỉ còn MỘT nhánh: bài luôn chấm TRỰC TIẾP TỪ AUDIO. Nhánh transcript-only đã gỡ bỏ
  // 2026-08-25 — transcript không mang được bằng chứng phát âm, mà `pronunciation` là
  // tiêu chí BẮT BUỘC (mục 3.10).
  return buildSystemInstruction(rubric);
}
