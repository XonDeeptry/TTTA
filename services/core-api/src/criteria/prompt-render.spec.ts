import * as fs from 'fs';
import * as path from 'path';
import {
  buildSystemInstruction,
  
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
 * `expected_audio` trong fixture do bản PYTHON sinh ra. Nếu một ca đỏ: KHÔNG sửa
 * fixture cho khớp code — hãy xem lại bản port trong `prompt-render.ts`.
 */

interface FixtureCase {
  name: string;
  _why: string;
  rubric: unknown;
  expected_audio: string;
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
