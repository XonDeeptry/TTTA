import * as fs from 'fs';
import * as path from 'path';
import {
  buildSystemInstruction,
  buildSystemInstructionText,
  pyFloat,
  pyNumberToString,
  renderPrompt,
} from './prompt-render';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED, type RubricTemplateSeed } from './templates';

/**
 * SONG SINH với `services/grading-worker/tests/test_prompt_render_fixtures.py` — hai file test
 * chạy trên CÙNG một fixture JSON. Sửa hành vi render ở TS mà quên sửa Python (hoặc ngược lại)
 * thì bộ test bên kia sẽ đỏ (F12 FR-03). Đừng inline/chép fixture vào đây.
 *
 * `expected_audio`/`expected_text` trong fixture do bản PYTHON sinh ra. Nếu một ca đỏ: KHÔNG sửa
 * fixture cho khớp code — hãy xem lại bản port trong `prompt-render.ts`.
 */

interface FixtureCase {
  name: string;
  _why: string;
  rubric: unknown;
  expected_audio: string;
  expected_text: string;
}

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'prompt-render.fixtures.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
  _readme: string;
  cases: FixtureCase[];
};
const cases = fixture.cases;

/** Xóa case là làm yếu lưới đỡ — chốt cứng danh sách tên để việc đó làm test đỏ (AC-03.4). */
const REQUIRED_CASE_NAMES = [
  'v1_legacy_no_schema_version',
  'v2_sub_factors_on_two_dimensions',
  'v2_comment_bank_mixed_grouping',
  // Ba bẫy trôi đã được đo trên CPython 3.11, không phải phỏng đoán:
  'v2_band_keys_python_float_grammar', // float() ≠ Number()
  'v2_band_keys_non_numeric_fallback',
  'v2_band_keys_unparseable_hex_and_empty', // "0x10"/"" → Number() nhận, float() từ chối
  'v2_band_keys_infinity_sorts_last',
  'v2_weight_number_formatting', // str(float) của Python ≠ String() của JS
  'v2_numeric_dimension_keys_group_order', // dict của Python ≠ object của JS
  'v2_output_fields_with_fix',
  'v2_output_fields_without_fix',
  'v2_empty_bank_and_empty_sub_factors',
  'v2_sub_factor_partial_by_band',
  'garbage_empty_object',
];

describe('prompt-render shared fixture (TS ↔ Python drift guard, FR-03)', () => {
  it('AC-03.1 fixture tồn tại, đủ hình dạng và đúng danh sách ca bắt buộc', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect([...cases.map((c) => c.name)].sort()).toEqual([...REQUIRED_CASE_NAMES].sort());
    for (const testCase of cases) {
      expect(typeof testCase.expected_audio).toBe('string');
      expect(typeof testCase.expected_text).toBe('string');
      expect(testCase.expected_audio.length).toBeGreaterThan(0);
    }
  });

  it.each(cases)('AC-03.2 case $name — nhánh audio khớp NGUYÊN VĂN', (testCase: FixtureCase) => {
    expect(buildSystemInstruction(testCase.rubric)).toBe(testCase.expected_audio);
  });

  it.each(cases)('AC-03.2 case $name — nhánh text khớp NGUYÊN VĂN', (testCase: FixtureCase) => {
    expect(buildSystemInstructionText(testCase.rubric)).toBe(testCase.expected_text);
  });

  it.each(cases)('case $name — hai nhánh KHÁC nhau và cùng có khối tiêu chí', (testCase: FixtureCase) => {
    expect(testCase.expected_text).not.toBe(testCase.expected_audio);
    expect(testCase.expected_text).toContain('BẢN CHÉP LỜI');
    expect(testCase.expected_audio).toContain('audio đính kèm');
  });

  it.each(cases)('case $name — render TẤT ĐỊNH (gọi hai lần ra cùng chuỗi)', (testCase: FixtureCase) => {
    expect(buildSystemInstruction(testCase.rubric)).toBe(buildSystemInstruction(testCase.rubric));
  });

  it.each(cases)('case $name — KHÔNG sửa đối số đầu vào', (testCase: FixtureCase) => {
    const before = JSON.stringify(testCase.rubric);
    buildSystemInstruction(testCase.rubric);
    buildSystemInstructionText(testCase.rubric);
    expect(JSON.stringify(testCase.rubric)).toBe(before);
  });
});

describe('BR-09 — prompt KHÔNG được nhắc tổng điểm / trung bình / cấp độ (AC-02.5)', () => {
  const withLevels = cases.find((c) => c.name === 'v2_sub_factors_on_two_dimensions') as FixtureCase;

  it('mã và nhãn cấp độ trong rubric KHÔNG xuất hiện ở cả hai nhánh', () => {
    // Ca này khai `levels: [{code:'SECRET_LEVEL', label:'KHONG_DUOC_XUAT_HIEN'}]` chính là để
    // khẳng định điều này bằng dữ liệu chứ không bằng grep từ khóa chung chung.
    for (const rendered of [withLevels.expected_audio, withLevels.expected_text]) {
      expect(rendered).not.toContain('SECRET_LEVEL');
      expect(rendered).not.toContain('KHONG_DUOC_XUAT_HIEN');
    }
  });

  it('không ca nào lọt chữ "tổng điểm" / "trung bình" / "cấp độ" / "levels"', () => {
    for (const testCase of cases) {
      for (const rendered of [testCase.expected_audio, testCase.expected_text]) {
        expect(rendered.toLowerCase()).not.toContain('tổng điểm');
        expect(rendered.toLowerCase()).not.toContain('điểm trung bình');
        expect(rendered.toLowerCase()).not.toContain('cấp độ');
        expect(rendered).not.toContain('levels');
      }
    }
  });
});

/**
 * AC-03.6 — hai mẫu hệ thống được render QUA IMPORT, không paste (AC-03.5 cấm chép literal của
 * seed vào fixture).
 *
 * Lưu ý phạm vi: cả hai seed cố ý để trống `comment_bank` và `sub_factors` (chúng là CẤU TRÚC, nội
 * dung do `criteria_author` soạn sau), nên phần "lưới yếu tố con + ngân hàng nhận xét đã gom nhóm"
 * của AC-03.6 được phủ bởi các ca fixture `v2_sub_factors_*` / `v2_comment_bank_*` — chỗ duy nhất
 * trong repo có dữ liệu đó. Ở đây khẳng định thứ seed THỰC SỰ có: đầy đủ tiêu chí, gạch đầu dòng
 * band, không tiêu đề rỗng, không rò cấp độ.
 */
describe('AC-03.6 — render hai seed hệ thống (import, không paste)', () => {
  const SEEDS: Array<[string, RubricTemplateSeed]> = [
    ['cambridge_yl_a0_a2', CAMBRIDGE_YL_SEED],
    ['ielts_speaking', IELTS_SPEAKING_SEED],
  ];

  it.each(SEEDS)('%s render ra prompt đọc được', (_key, seed) => {
    const rendered = buildSystemInstruction(seed.rubric);

    expect(rendered.startsWith('Bạn là giáo viên chấm bài nói tiếng Anh')).toBe(true);
    expect(rendered).toContain('Chấm từng tiêu chí sau theo thang điểm và mô tả band tương ứng:');
    // Mọi tiêu chí của seed đều có mặt kèm khóa máy của nó.
    for (const dim of seed.rubric.dimensions) {
      expect(rendered).toContain(`- Tiêu chí: ${dim.label} [key=${dim.key}]`);
    }
    // Mọi band có mô tả đều thành gạch đầu dòng riêng.
    for (const dim of seed.rubric.dimensions) {
      for (const [band, bullets] of Object.entries(dim.bands)) {
        if (bullets.length === 0) continue;
        expect(rendered).toContain(`  Band ${band}:`);
        for (const bullet of bullets) expect(rendered).toContain(`    • ${bullet}`);
      }
    }
    // Seed không có yếu tố con / ngân hàng nhận xét ⇒ KHÔNG được có tiêu đề rỗng.
    expect(rendered).not.toContain('Yếu tố con');
    expect(rendered).not.toContain('Ví dụ nhận xét mẫu');
    // BR-09 trên dữ liệu thật: không mã/nhãn cấp độ nào của seed lọt vào prompt.
    for (const level of seed.rubric.levels) {
      expect(rendered).not.toContain(level.code);
      expect(rendered).not.toContain(level.label);
    }
    expect(rendered.endsWith('Trả về đúng theo schema JSON đã cung cấp — không thêm chữ nào ngoài JSON.')).toBe(
      true,
    );
  });

  it('seed Cambridge: trọng số in ra là "1", không phải "1.0"', () => {
    expect(buildSystemInstruction(CAMBRIDGE_YL_SEED.rubric)).toContain('(trọng số 1):');
  });
});

describe('AC-02.4 — đầu vào rác không bao giờ ném, luôn ra chuỗi', () => {
  const GARBAGE: unknown[] = [
    null,
    undefined,
    [],
    'str',
    42,
    {},
    true,
    1e308,
    { dimensions: 'not-an-array', comment_bank: 42, output_fields: {} },
    { dimensions: [{ key: null, label: [1, 2], weight: 'x', bands: { a: [null, true] } }] },
    { comment_bank: [{ dimension: {}, intent: [], text: { a: 1 } }] },
    { dimensions: [{ key: 'a', bands: { '1': { deep: { deeper: [1] } } } }] },
  ];

  it.each(GARBAGE.map((g, i) => [i, g]))('rác #%i ⇒ chuỗi, cả hai nhánh', (_index, garbage) => {
    expect(typeof buildSystemInstruction(garbage)).toBe('string');
    expect(typeof buildSystemInstructionText(garbage)).toBe('string');
    expect(buildSystemInstruction(garbage).length).toBeGreaterThan(0);
  });

  it('renderPrompt chọn đúng nhánh theo variant', () => {
    expect(renderPrompt({}, 'audio')).toBe(buildSystemInstruction({}));
    expect(renderPrompt({}, 'text')).toBe(buildSystemInstructionText({}));
  });
});

/**
 * `pyFloat` là bản chép văn phạm `float()` của CPython, KHÔNG phải `Number()`. Năm dòng đầu là
 * năm chỗ hai hàm cho kết quả khác nhau — mỗi chỗ đều đổi THỨ TỰ dòng band trong prompt thật.
 */
describe('pyFloat — văn phạm float() của Python', () => {
  it.each([
    ['0', 0],
    ['10', 10],
    ['0.5', 0.5],
    ['.5', 0.5],
    ['5.', 5],
    ['+5', 5],
    ['-2.5', -2.5],
    ['1e3', 1000],
    ['1E3', 1000],
    ['1_0', 10], // Number('1_0') = NaN
    ['١٢', 12], // chữ số Ả Rập-Ấn; Number(...) = NaN
    [' 3　', 3], // khoảng trắng Unicode hai đầu
    ['  3  ', 3],
    ['1e400', Infinity],
  ])('float(%p) = %p', (text, expected) => {
    expect(pyFloat(text as string)).toBe(expected);
  });

  it.each([
    [''], // Number('') = 0
    ['0x10'], // Number('0x10') = 16
    ['abc'],
    ['1__0'],
    ['_1'],
    ['1_'],
    ['.'],
    ['1e'],
    ['᠎5'], // U+180E KHÔNG phải khoảng trắng với Python
    ['​5'],
    ['1,5'],
  ])('float(%p) ném ValueError ⇒ null', (text) => {
    expect(pyFloat(text)).toBeNull();
  });

  it('inf/nan đọc được (Number() thì không)', () => {
    expect(pyFloat('inf')).toBe(Infinity);
    expect(pyFloat('Infinity')).toBe(Infinity);
    expect(pyFloat('-inf')).toBe(-Infinity);
    expect(Number.isNaN(pyFloat('nan') as number)).toBe(true);
  });

  /**
   * MIỀN TƯƠNG ĐƯƠNG điểm 3: với khóa đọc ra NaN, `sorted` của Python chạy với phép so sánh mâu
   * thuẫn (mọi so sánh với NaN đều False) nên kết quả phụ thuộc chi tiết Timsort — Python không
   * đặc tả. Bản TS chọn hành vi TẤT ĐỊNH: coi là không phải số ⇒ giữ thứ tự chèn. Test này chốt
   * cứng lựa chọn đó để nó không đổi âm thầm.
   */
  it('khóa band đọc ra NaN ⇒ giữ thứ tự chèn (lựa chọn tất định, đã ghi ở đầu prompt-render.ts)', () => {
    const rendered = buildSystemInstruction({
      dimensions: [{ key: 'p', label: 'P', weight: 1, bands: { z9: ['b'], nan: ['a'], z1: ['c'] } }],
    });
    expect(rendered.indexOf('Band z9:')).toBeLessThan(rendered.indexOf('Band nan:'));
    expect(rendered.indexOf('Band nan:')).toBeLessThan(rendered.indexOf('Band z1:'));
  });
});

/** `f"{x}"` của Python = `str(x)`, KHÁC `String(x)` của JS ở ba chỗ dưới đây. */
describe('pyNumberToString — str() của Python cho một số', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [-3, '-3'],
    [0.5, '0.5'],
    [2.25, '2.25'],
    [0.1, '0.1'],
    [1e-4, '0.0001'],
    [1e-5, '1e-05'], // String() ⇒ "0.00001"
    [1e-7, '1e-07'], // String() ⇒ "1e-7" (JS không đệm số 0 vào mũ)
    [1e15, '1000000000000000'],
    [1e16, '1e+16'], // String() ⇒ "10000000000000000"
    [1e17, '1e+17'],
    [1e21, '1e+21'],
    [1.2345678901234568e16, '1.2345678901234568e+16'],
    [5e-324, '5e-324'],
    [1.5e300, '1.5e+300'],
    [Number.MAX_SAFE_INTEGER, '9007199254740991'],
  ])('str(%p) = %p', (value, expected) => {
    expect(pyNumberToString(value as number)).toBe(expected);
  });
});
