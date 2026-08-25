import * as fs from 'fs';
import * as path from 'path';
import { normalizeRubric, RubricV2 } from './rubric-schema';

/**
 * SONG SINH với `services/grading-worker/tests/test_rubric_schema.py` — hai file test chạy
 * trên CÙNG một fixture JSON. Sửa hành vi normalize ở TS mà quên sửa Python (hoặc ngược lại)
 * thì bộ test bên kia sẽ đỏ (F8 FR-15). Đừng inline/chép fixture vào đây.
 */

interface FixtureCase {
  name: string;
  input: unknown;
  expected: RubricV2;
}

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'rubric-normalize.fixtures.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
  _readme: string;
  cases: FixtureCase[];
};
const cases = fixture.cases;

/** Danh sách khóa top-level bắt buộc — đúng 12, không hơn không kém (AC-01.4, BR-05). */
const V2_TOP_LEVEL_KEYS = [
  'schema_version',
  'course_key',
  'task_type',
  'tone',
  'feedback_language',
  'scale',
  'aggregation',
  'levels',
  'output_fields',
  'dimensions',
  'comment_bank',
  'student_reply',
];

/** Xóa case là làm yếu lưới đỡ — chốt cứng danh sách tên để việc đó làm test đỏ (AC-15.6). */
const REQUIRED_CASE_NAMES = [
  'v1_minimal',
  'v1_docx_parser_output',
  'v1_missing_band_scale',
  'v1_malformed_band_scale',
  'v1_empty_object',
  'v1_unknown_extra_keys',
  'v2_complete_kid',
  'v2_complete_ielts',
  'v2_partial_defaults',
  'v2_bands_already_arrays',
  'v2_mixed_legacy_keys',
  // Ba ca thêm sau QA F8 DEF-01 — khóa ngữ nghĩa `String()` của JS (AC-03.5). 11 ca đầu không
  // có lấy một giá trị band/text nào không phải chuỗi nên lưới đỡ đã để hai bản trôi khỏi nhau.
  'v1_null_comment_text',
  'v2_non_string_band_values',
  'v1_non_string_few_shot_examples',
  // Thêm sau QA F8 DEF-02 — `.trim()` của JS KHÁC `str.strip()` của Python ở 6 điểm mã.
  'v2_javascript_trim_semantics',
];

describe('rubric-normalize shared fixture (TS ↔ Python drift guard)', () => {
  it('carries at least 10 cases and exactly the required case names', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect([...cases.map((c) => c.name)].sort()).toEqual([...REQUIRED_CASE_NAMES].sort());
  });

  it.each(cases)('case $name normalizes to the golden output', (testCase: FixtureCase) => {
    expect(normalizeRubric(testCase.input)).toEqual(testCase.expected);
  });

  it.each(cases)('case $name is idempotent', (testCase: FixtureCase) => {
    const once = normalizeRubric(testCase.input);
    expect(normalizeRubric(once)).toEqual(once);
  });

  it.each(cases)('case $name does not mutate its input', (testCase: FixtureCase) => {
    const before = JSON.stringify(testCase.input);
    normalizeRubric(testCase.input);
    expect(JSON.stringify(testCase.input)).toBe(before);
  });

  it.each(cases)('case $name returns exactly the 12 top-level keys', (testCase: FixtureCase) => {
    expect(Object.keys(normalizeRubric(testCase.input)).sort()).toEqual([...V2_TOP_LEVEL_KEYS].sort());
  });
});

describe('normalizeRubric — degenerate input (FR-05)', () => {
  const ALL_DEFAULTS = {
    schema_version: 2,
    course_key: '',
    task_type: 'speaking_clip',
    tone: 'khích lệ',
    feedback_language: 'vi',
    scale: { min: 0, max: 3, step: 1 },
    aggregation: { method: 'average', round: 'none' },
    levels: [],
    output_fields: ['comment'],
    dimensions: [],
    comment_bank: [],
    student_reply: null,
  };

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'x'],
    ['an array', []],
    ['a boolean', true],
  ])('never throws and returns all defaults for %s', (_label, input) => {
    expect(() => normalizeRubric(input)).not.toThrow();
    expect(normalizeRubric(input)).toEqual(ALL_DEFAULTS);
  });

  it('does not mutate a deep-frozen v1 rubric', () => {
    const v1 = Object.freeze({
      course_key: 'basic',
      band_scale: Object.freeze([0, 3]),
      dimensions: Object.freeze([
        Object.freeze({ name: 'pronunciation', weight: 1, bands: Object.freeze({ '0': 'kém' }) }),
      ]),
    });
    const before = JSON.stringify(v1);
    expect(() => normalizeRubric(v1)).not.toThrow();
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('drops sub_factors entries that are not objects and defaults a missing by_band', () => {
    const out = normalizeRubric({
      dimensions: [{ name: 'pronunciation', sub_factors: ['rác', null, { label: 'Phạm vi' }] }],
    });
    expect(out.dimensions[0].sub_factors).toEqual([{ label: 'Phạm vi', by_band: {} }]);
  });

  it('stringifies by_band values', () => {
    const out = normalizeRubric({
      schema_version: 2,
      dimensions: [{ key: 'pronunciation', sub_factors: [{ label: 'x', by_band: { '4': 4 } }] }],
    });
    expect(out.dimensions[0].sub_factors[0].by_band).toEqual({ '4': '4' });
  });

  it('drops comment_bank entries with blank text and nulls non-string dimension/intent', () => {
    const out = normalizeRubric({
      schema_version: 2,
      comment_bank: [
        { dimension: 'pronunciation', intent: 'khen', text: 'giữ lại' },
        { dimension: 7, intent: false, text: 'giữ lại 2' },
        { dimension: 'x', intent: 'y', text: '   ' },
        'không phải object',
      ],
    });
    expect(out.comment_bank).toEqual([
      { dimension: 'pronunciation', intent: 'khen', text: 'giữ lại' },
      { dimension: null, intent: null, text: 'giữ lại 2' },
    ]);
  });

  it('drops non-object levels entries and never range-validates them (F9 owns that)', () => {
    const out = normalizeRubric({
      schema_version: 2,
      levels: [{ min: 0, max: 10, code: 'A0', label: 'x' }, 'rác', { min: 5, max: 3, code: 'B', label: 'chồng lấn' }],
    });
    expect(out.levels).toEqual([
      { min: 0, max: 10, code: 'A0', label: 'x' },
      { min: 5, max: 3, code: 'B', label: 'chồng lấn' },
    ]);
  });

  it('repairs a non-positive or non-finite scale.step to 1', () => {
    expect(normalizeRubric({ schema_version: 2, scale: { min: 0, max: 9, step: 0 } }).scale.step).toBe(1);
    expect(normalizeRubric({ schema_version: 2, scale: { min: 0, max: 9, step: 'x' } }).scale.step).toBe(1);
  });

  it('defaults a non-finite dimension weight to 1', () => {
    const out = normalizeRubric({ dimensions: [{ name: 'pronunciation', weight: 'nặng' }] });
    expect(out.dimensions[0].weight).toBe(1);
  });

  it('falls back to "average" for an unknown aggregation method', () => {
    const out = normalizeRubric({ schema_version: 2, aggregation: { method: 'median', round: 'floor' } });
    expect(out.aggregation).toEqual({ method: 'average', round: 'none' });
  });

  it('preserves schema_version above 2 instead of clamping it (forward compatibility)', () => {
    expect(normalizeRubric({ schema_version: 3, course_key: 'future' }).schema_version).toBe(3);
  });

  it('treats a non-numeric schema_version as v1', () => {
    const out = normalizeRubric({ schema_version: '2', dimensions: [{ name: 'pronunciation', bands: { '0': 'kém' } }] });
    expect(out.schema_version).toBe(2);
    expect(out.dimensions[0]).toEqual(
      expect.objectContaining({ key: 'pronunciation', label: 'pronunciation', bands: { '0': ['kém'] } }),
    );
  });

  it('never changes character case when converting a v1 name (BR-07)', () => {
    const out = normalizeRubric({ dimensions: [{ name: 'Pronunciation' }] });
    expect(out.dimensions[0].key).toBe('Pronunciation');
    expect(out.dimensions[0].label).toBe('Pronunciation');
  });
});

/**
 * AC-03.5 gọi TÊN ngữ nghĩa `String(value)` của JS ⇒ bản TS là BẢN CHUẨN, bản Python phải bắt
 * chước (`_to_text` / `_js_number_to_string`). Các assertion dưới đây được viết bằng giá trị
 * mong đợi VIẾT TAY (không phải `String(x)`) để nó vẫn là một bài test thật, và có bản sinh
 * đôi từng dòng trong `tests/test_rubric_schema.py::TestJsStringSemantics` — QA F8 DEF-01.
 */
describe('normalizeRubric — JS String() semantics on non-string values (AC-03.5 / AC-05.2)', () => {
  const bandsOf = (value: unknown) =>
    normalizeRubric({ dimensions: [{ name: 'pronunciation', bands: { b: value } }] }).dimensions[0].bands.b;

  it.each([
    ['a number', 7, ['7']],
    ['an integral float', 3.0, ['3']],
    ['a fractional number', 2.5, ['2.5']],
    ['true', true, ['true']],
    ['false', false, ['false']],
    ['null', null, ['null']],
    ['an empty string', '', []],
    ['a whitespace string', '   ', []],
    ['an array', ['a', 'b'], ['a', 'b']],
    ['an empty array', [], []],
    ['a plain object', { a: 1 }, ['[object Object]']],
    ['a nested array inside an array', ['x', ['y', 'z']], ['x', 'y,z']],
    ['an object inside an array', [{ a: 1 }], ['[object Object]']],
    ['1e21 (JS switches to exponent form)', 1e21, ['1e+21']],
    ['1e20 (still positional)', 1e20, ['100000000000000000000']],
    ['1e-6 (still positional)', 1e-6, ['0.000001']],
    ['2^-23 (below 1e-6 ⇒ exponent form, no zero padding)', 1.1920928955078125e-7, ['1.1920928955078125e-7']],
    ['a negative number', -1.5, ['-1.5']],
    ['minus zero', -0, ['0']],
  ])('stringifies %s band value', (_label, value, expected) => {
    expect(bandsOf(value)).toEqual(expected);
  });

  it('joins an array band value the way Array.prototype.join does (null ⇒ empty string)', () => {
    // KHÁC với phần tử null của MẢNG band ở trên: ở đó mỗi phần tử đi qua String() riêng lẻ nên
    // ra "null"; ở đây null nằm trong một mảng LỒNG nên đi qua join ⇒ chuỗi rỗng.
    expect(bandsOf([1, null, ['x', null, 'y']])).toEqual(['1', 'null', 'x,,y']);
  });

  it('stringifies by_band values without trimming them', () => {
    const out = normalizeRubric({
      schema_version: 2,
      dimensions: [
        { key: 'pronunciation', sub_factors: [{ label: 'x', by_band: { '0': null, '1': ['a', 'b'], '2': { a: 1 }, '3': '  kept  ' } }] },
      ],
    });
    expect(out.dimensions[0].sub_factors[0].by_band).toEqual({
      '0': 'null',
      '1': 'a,b',
      '2': '[object Object]',
      '3': '  kept  ',
    });
  });

  it('treats an explicit null comment_bank text as absent, but keeps false and 0 (?? is nullish-only)', () => {
    const out = normalizeRubric({
      schema_version: 2,
      comment_bank: [
        { dimension: 'p', intent: 'khen', text: null },
        { dimension: 'p', intent: 'khen' },
        { dimension: 'p', intent: 'khen', text: false },
        { dimension: 'p', intent: 'khen', text: 0 },
        { dimension: 'p', intent: 'khen', text: ['a', 'b'] },
      ],
    });
    expect(out.comment_bank).toEqual([
      { dimension: 'p', intent: 'khen', text: 'false' },
      { dimension: 'p', intent: 'khen', text: '0' },
      { dimension: 'p', intent: 'khen', text: 'a,b' },
    ]);
  });

  it('keeps a null few_shot_examples entry as the literal string "null" (that branch has no ??)', () => {
    const out = normalizeRubric({ few_shot_examples: [null, 12, { a: 1 }, '', '   '] });
    expect(out.comment_bank.map((e) => e.text)).toEqual(['null', '12', '[object Object]']);
  });

  it('stringifies output_fields entries', () => {
    const out = normalizeRubric({ output_fields: ['comment', 7, true, null, ['', 'fix'], { a: 1 }] });
    expect(out.output_fields).toEqual(['comment', '7', 'true', 'null', ',fix', '[object Object]']);
  });

  /**
   * QA F8 DEF-02: `str.strip()` của Python KHÔNG cùng tập ký tự với `String.prototype.trim()`.
   * AC-03.5 gọi tên `.trim()` ngang hàng với `String()` ⇒ bản TS là chuẩn, bản Python phải dùng
   * `_js_trim()`. Bảng dưới đây có bản sinh đôi từng dòng trong `tests/test_rubric_schema.py`.
   * Escape `\uXXXX` là CỐ Ý — các ký tự này vô hình trong editor.
   */
  const TRIM_PROBES: ReadonlyArray<readonly [string, string, boolean]> = [
    ['U+0009 TAB', '\u0009', true],
    ['U+000A LF', '\u000a', true],
    ['U+000B VT', '\u000b', true],
    ['U+000C FF', '\u000c', true],
    ['U+000D CR', '\u000d', true],
    ['U+0020 SP', '\u0020', true],
    ['U+00A0 NBSP', '\u00a0', true],
    ['U+1680 OGHAM', '\u1680', true],
    ['U+2000 EN QUAD', '\u2000', true],
    ['U+2028 LS', '\u2028', true],
    ['U+2029 PS', '\u2029', true],
    ['U+202F NNBSP', '\u202f', true],
    ['U+205F MMSP', '\u205f', true],
    ['U+3000 IDEOGRAPHIC SP', '\u3000', true],
    ['U+FEFF ZWNBSP', '\ufeff', true],  // Python `str.strip()` KHÔNG cắt ký tự này — JS thì có
    ['U+001C FS', '\u001c', false],  // Python `str.strip()` CÓ cắt các ký tự C0 này — JS thì không
    ['U+001D GS', '\u001d', false],
    ['U+001E RS', '\u001e', false],
    ['U+001F US', '\u001f', false],
    ['U+0085 NEL', '\u0085', false],  // Python `str.strip()` CÓ cắt — JS thì không
    ['U+180E MONGOLIAN', '\u180e', false],  // Zs cho tới Unicode 6.2, nay là Cf ⇒ không ngôn ngữ nào cắt
    ['U+200B ZWSP', '\u200b', false],
    ['U+0000 NUL', '\u0000', false],
  ];

  it.each(TRIM_PROBES)('%s is %s trimmed from a band value', (_label, ch, trimmed) => {
    expect(bandsOf(`${ch}x${ch}`)).toEqual(trimmed ? ['x'] : [`${ch}x${ch}`]);
  });

  it.each(TRIM_PROBES)('%s alone as a whole band value collapses correctly', (_label, ch, trimmed) => {
    // Đây mới là chỗ đau: nó đổi SỐ LƯỢNG gạch đầu dòng, không chỉ đổi chữ.
    expect(bandsOf(ch)).toEqual(trimmed ? [] : [ch]);
  });

  it.each(TRIM_PROBES)('%s alone as comment_bank text decides whether the entry survives', (_label, ch, trimmed) => {
    const out = normalizeRubric({ schema_version: 2, comment_bank: [{ dimension: null, intent: null, text: ch }] });
    expect(out.comment_bank).toHaveLength(trimmed ? 0 : 1);
  });

  it('does not trim by_band values at all (no .trim() call on that path)', () => {
    const out = normalizeRubric({
      schema_version: 2,
      dimensions: [{ key: 'pronunciation', sub_factors: [{ label: 'x', by_band: { '0': '\ufeff giữ nguyên \ufeff' } }] }],
    });
    expect(out.dimensions[0].sub_factors[0].by_band['0']).toBe('\ufeff giữ nguyên \ufeff');
  });

  it('treats a non-finite number as absent (Python twin: an int too large to be a double)', () => {
    // JSON không chở được Infinity, nhưng `JSON.parse("1e400")` ra Infinity nên nhánh này CÓ
    // thật. Bản Python phải cho cùng kết quả với `10**400` (int Python không tràn, float thì có).
    expect(normalizeRubric({ schema_version: Infinity }).schema_version).toBe(2);
    expect(normalizeRubric({ dimensions: [{ name: 'p', weight: Infinity }] }).dimensions[0].weight).toBe(1);
    expect(normalizeRubric({ schema_version: 2, scale: { min: 0, max: Infinity, step: 1 } }).scale.max).toBe(3);
  });
});
