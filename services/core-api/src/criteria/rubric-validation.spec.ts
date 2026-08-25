import { BadRequestException } from '@nestjs/common';
import type { LevelIssue } from '../lib/rubric-scoring';
import { normalizeRubric } from './rubric-schema';
import { assertAuthorableRubric } from './rubric-validation';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED } from './templates';

/**
 * F10 FR-19 — cổng chặn lúc soạn. Đây là nơi F9 `validateLevels` (ship ra nhưng chưa nối vào đâu)
 * cuối cùng trở thành một mã lỗi HTTP, và là nơi đóng lại OBS-2 của F9-qa (`scale.max <= 0`).
 */

/**
 * Rubric hợp lệ tối thiểu — mỗi ca chỉ ghi đè đúng phần đang thử.
 *
 * ⚠ CỐ Ý **KHÔNG** gọi `normalizeRubric` ở đây (QA fix round 1, DEF-1). Bản trước có gọi, và đó
 * chính là lý do bộ test xanh trong khi production hỏng: `normalizeRubric` ép `scale.step` không
 * dương về 1, nên ca "step = 0 ⇒ 400" thực ra chưa bao giờ chạm tới luật thật. Validator nhận
 * rubric THÔ đúng như HTTP đưa vào, nên fixture ở đây cũng phải thô.
 */
function rubric(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    schema_version: 2,
    scale: { min: 0, max: 5, step: 1 },
    aggregation: { method: 'sum', round: 'none' },
    levels: [],
    output_fields: ['comment'],
    dimensions: [{ key: 'pronunciation', label: 'Pronunciation', weight: 1 }],
    ...patch,
  };
}

function caught(input: unknown): BadRequestException {
  try {
    assertAuthorableRubric(input);
  } catch (err) {
    return err as BadRequestException;
  }
  throw new Error('expected assertAuthorableRubric to throw, but it returned');
}

function message(input: unknown): string {
  const response = caught(input).getResponse();
  return typeof response === 'string' ? response : ((response as { message: string }).message ?? '');
}

function issues(input: unknown): LevelIssue[] {
  const response = caught(input).getResponse() as { issues?: LevelIssue[] };
  return response.issues ?? [];
}

/** Bảng cấp độ phủ kín 0..5 của rubric tối thiểu (1 tiêu chí × sum × scale 0–5). */
const OK_LEVELS = [
  { min: 0, max: 2, code: 'LOW', label: 'thấp' },
  { min: 3, max: 5, code: 'HIGH', label: 'cao' },
];

describe('FR-19 — thang điểm', () => {
  it('AC-19.4 scale.max = 0 ⇒ 400 "scale.max must be greater than 0" (F9-qa OBS-2)', () => {
    const err = caught(rubric({ scale: { min: 0, max: 0, step: 1 } }));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getStatus()).toBe(400);
    expect(message(rubric({ scale: { min: 0, max: 0, step: 1 } }))).toBe(
      'scale.max must be greater than 0',
    );
  });

  it('AC-19.4 scale.max âm ⇒ cùng thông điệp', () => {
    expect(message(rubric({ scale: { min: -10, max: -1, step: 1 } }))).toBe(
      'scale.max must be greater than 0',
    );
  });

  it('AC-19.5 scale.max <= scale.min (thang đảo ngược) ⇒ 400', () => {
    expect(message(rubric({ scale: { min: 9, max: 5, step: 1 } }))).toBe(
      'scale.max must be greater than scale.min',
    );
    expect(message(rubric({ scale: { min: 5, max: 5, step: 1 } }))).toBe(
      'scale.max must be greater than scale.min',
    );
  });

  // DEF-1: luật này phải nổ trên rubric THÔ, vì `normalizeRubric` ép step không dương về 1.
  it('AC-19.6 scale.step <= 0 ⇒ 400 "scale.step must be greater than 0"', () => {
    for (const step of [0, -1, -0.5]) {
      const input = rubric({ scale: { min: 0, max: 5, step } });
      expect(() => assertAuthorableRubric(input)).toThrow(BadRequestException);
      expect(message(input)).toBe('scale.step must be greater than 0');
    }
  });

  it('AC-19.6 step không phải số hữu hạn ⇒ 400, không bị normalize nuốt', () => {
    for (const step of [null, 'x', NaN, Infinity, [], {}]) {
      expect(message(rubric({ scale: { min: 0, max: 5, step } }))).toBe(
        'scale.step must be a finite number',
      );
    }
  });

  /**
   * DEF-1 nói rộng hơn `step`: QA chỉ ra "code tự mâu thuẫn" vì `scale.max` không bị normalize ép
   * nên luật của nó nổ, còn `step` thì bị. Sau bản vá, CẢ BA trường đều được đọc thô, nên một
   * `min`/`max` sai kiểu cũng không còn lặng lẽ biến thành giá trị mặc định.
   */
  it('AC-19.6 (mở rộng) min/max không phải số hữu hạn ⇒ 400 thay vì âm thầm về mặc định', () => {
    expect(message(rubric({ scale: { min: 'a', max: 5, step: 1 } }))).toBe(
      'scale.min must be a finite number',
    );
    expect(message(rubric({ scale: { min: 0, max: null, step: 1 } }))).toBe(
      'scale.max must be a finite number',
    );
  });

  it('scale không phải object ⇒ 400 có nghĩa', () => {
    for (const scale of [null, 'x', 42, [0, 5], true]) {
      expect(message(rubric({ scale }))).toBe(
        'scale must be an object with numeric min, max and step',
      );
    }
  });

  it('scale VẮNG MẶT ⇒ hợp lệ (normalize suy ra từ band_scale của v1 hoặc dùng mặc định)', () => {
    const noScale = rubric({});
    delete (noScale as Record<string, unknown>).scale;
    expect(() => assertAuthorableRubric(noScale)).not.toThrow();

    // v1: band_scale [0,5] ⇒ thang {0,5,1}; các luật vẫn áp lên thang suy ra đó.
    const v1 = rubric({});
    delete (v1 as Record<string, unknown>).scale;
    expect(() => assertAuthorableRubric({ ...v1, band_scale: [0, 5] })).not.toThrow();
    expect(message({ ...v1, band_scale: [0, 0] })).toBe('scale.max must be greater than 0');
  });

  it('thiếu MỘT trường trong scale ⇒ lấy mặc định của trường đó, không 400', () => {
    expect(() => assertAuthorableRubric(rubric({ scale: { min: 0, max: 5 } }))).not.toThrow();
    expect(() => assertAuthorableRubric(rubric({ scale: { max: 5, step: 1 } }))).not.toThrow();
  });

  it('thang hợp lệ ⇒ không ném', () => {
    expect(() => assertAuthorableRubric(rubric({}))).not.toThrow();
  });
});

describe('FR-19 — tiêu chí', () => {
  it('AC-19.7 dimensions rỗng ⇒ 400', () => {
    expect(message(rubric({ dimensions: [] }))).toBe('rubric must declare at least one dimension');
  });

  it('AC-19.8 thiếu dimension "pronunciation" ⇒ 400 (kiến trúc mục 3.10, D-3)', () => {
    expect(
      message(rubric({ dimensions: [{ key: 'fluency', label: 'Fluency', weight: 1 }] as never })),
    ).toBe('rubric must include the "pronunciation" dimension');
  });

  it('AC-19.9 trùng key ⇒ 400 kèm tên khóa', () => {
    expect(
      message(
        rubric({
          dimensions: [
            { key: 'pronunciation', label: 'a', weight: 1 },
            { key: 'pronunciation', label: 'b', weight: 1 },
          ] as never,
        }),
      ),
    ).toBe('duplicate dimension key: pronunciation');
  });

  it('AC-19.10 key không đúng dạng khóa máy ⇒ 400', () => {
    for (const badKey of ['Pronunciation', 'ngữ điệu', 'word stress', 'word-stress', '_x', '', '9'.repeat(65)]) {
      const built = rubric({
        dimensions: [
          { key: 'pronunciation', label: 'p', weight: 1 },
          { key: badKey, label: 'x', weight: 1 },
        ] as never,
      });
      expect(message(built)).toContain('invalid dimension key');
    }
    // Biên: đúng 64 ký tự vẫn được nhận.
    expect(() =>
      assertAuthorableRubric(
        rubric({
          dimensions: [
            { key: 'pronunciation', label: 'p', weight: 1 },
            { key: `a${'b'.repeat(63)}`, label: 'x', weight: 1 },
          ] as never,
        }),
      ),
    ).not.toThrow();
  });

  it('AC-19.11 weight âm ⇒ 400; weight 0 ĐƯỢC PHÉP', () => {
    expect(
      message(rubric({ dimensions: [{ key: 'pronunciation', label: 'p', weight: -1 }] as never })),
    ).toBe('dimension weight must be >= 0');
    expect(() =>
      assertAuthorableRubric(
        rubric({ dimensions: [{ key: 'pronunciation', label: 'p', weight: 0 }] as never }),
      ),
    ).not.toThrow();
  });
});

describe('FR-19 — output_fields', () => {
  it('AC-19.12 rỗng ⇒ 400', () => {
    expect(message(rubric({ output_fields: [] }))).toBe('output_fields must not be empty');
  });

  it('AC-19.12 giá trị ngoài tập {comment, fix} ⇒ 400', () => {
    expect(message(rubric({ output_fields: ['comment', 'score'] as never }))).toContain(
      'invalid output field: score',
    );
  });

  it('AC-19.12 trùng lặp ⇒ 400', () => {
    expect(message(rubric({ output_fields: ['comment', 'comment'] as never }))).toBe(
      'duplicate output field: comment',
    );
  });

  it('["fix"] và ["comment","fix"] đều hợp lệ', () => {
    expect(() => assertAuthorableRubric(rubric({ output_fields: ['fix'] }))).not.toThrow();
    expect(() => assertAuthorableRubric(rubric({ output_fields: ['comment', 'fix'] }))).not.toThrow();
  });
});

describe('FR-19 — bảng cấp độ (nối F9 validateLevels vào 400)', () => {
  it('AC-19.3 levels: [] ĐƯỢC CHẤP NHẬN (IELTS không quy đổi cấp độ)', () => {
    expect(() => assertAuthorableRubric(rubric({ levels: [] }))).not.toThrow();
  });

  it('bảng phủ kín, không hở ⇒ không ném', () => {
    expect(() => assertAuthorableRubric(rubric({ levels: OK_LEVELS }))).not.toThrow();
  });

  it('AC-19.1 body 400 mang message "invalid rubric" + issues nguyên văn của F9', () => {
    const broken = rubric({
      levels: [
        { min: 0, max: 3, code: 'LOW', label: 'thấp' },
        { min: 3, max: 5, code: 'HIGH', label: 'cao' },
      ],
    });
    const body = caught(broken).getResponse() as { message: string; issues: LevelIssue[] };
    expect(body.message).toBe('invalid rubric');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      expect(typeof issue.code).toBe('string');
      expect(typeof issue.index).toBe('number');
      // Thông điệp tiếng Việt của F9, KHÔNG bị viết lại ở F10.
      expect(typeof issue.message).toBe('string');
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  it('AC-19.2 level_overlap', () => {
    const codes = issues(
      rubric({
        levels: [
          { min: 0, max: 3, code: 'LOW', label: 'thấp' },
          { min: 3, max: 5, code: 'HIGH', label: 'cao' },
        ],
      }),
    ).map((i) => i.code);
    expect(codes).toContain('level_overlap');
  });

  it('AC-19.2 level_gap', () => {
    const codes = issues(
      rubric({
        levels: [
          { min: 0, max: 1, code: 'LOW', label: 'thấp' },
          { min: 3, max: 5, code: 'HIGH', label: 'cao' },
        ],
      }),
    ).map((i) => i.code);
    expect(codes).toContain('level_gap');
  });

  it('AC-19.2 level_invalid (min > max, code không phải chuỗi)', () => {
    const codes = issues(
      rubric({
        levels: [
          { min: 5, max: 0, code: 'BAD', label: 'x' },
          { min: 0, max: 5, code: 42 as never, label: 'y' },
        ],
      }),
    ).map((i) => i.code);
    expect(codes).toContain('level_invalid');
  });

  it('AC-19.2 level_coverage_start', () => {
    const codes = issues(
      rubric({ levels: [{ min: 1, max: 5, code: 'X', label: 'x' }] }),
    ).map((i) => i.code);
    expect(codes).toContain('level_coverage_start');
  });

  it('AC-19.2 level_coverage_end', () => {
    const codes = issues(
      rubric({ levels: [{ min: 0, max: 4, code: 'X', label: 'x' }] }),
    ).map((i) => i.code);
    expect(codes).toContain('level_coverage_end');
  });
});

describe('FR-19 — tính chất chung', () => {
  it('AC-19.13 chỉ ném BadRequestException, không bao giờ 500 — với mọi đầu vào quái dị', () => {
    const hostile: unknown[] = [
      {},
      [],
      null,
      undefined,
      42,
      'x',
      { schema_version: 2 },
      { dimensions: 'not-an-array' },
      { scale: { min: 'a', max: null, step: [] } },
      { levels: [1, 2, 3], dimensions: [{ key: 'pronunciation' }] },
      { output_fields: 'comment' },
      { dimensions: [{ key: 'pronunciation', weight: Number.NaN }] },
      { scale: { min: -1e308, max: 1e308, step: 1e-9 }, dimensions: [{ key: 'pronunciation' }] },
      { dimensions: [{ key: 'pronunciation', bands: { a: { b: { c: [[[1]]] } } } }] },
    ];
    // DEF-1: đưa THẲNG rubric thô vào, không normalize trước — đúng như HTTP đưa vào.
    for (const input of hostile) {
      try {
        assertAuthorableRubric(input);
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getStatus()).toBe(400);
      }
    }
  });

  it('AC-19.13 trả về rubric ĐÃ CHUẨN HÓA khi hợp lệ (bên gọi không phải normalize lần nữa)', () => {
    const returned = assertAuthorableRubric({
      band_scale: [0, 5],
      aggregation: { method: 'sum', round: 'none' },
      dimensions: [{ name: 'pronunciation', weight: 1 }],
      levels: [{ min: 0, max: 5, code: 'X', label: 'x' }],
      khoa_la: 'bi loai',
    });
    expect(Object.keys(returned)).toHaveLength(12);
    expect(returned).not.toHaveProperty('khoa_la');
    expect(returned.scale).toEqual({ min: 0, max: 5, step: 1 });
    expect(normalizeRubric(returned)).toEqual(returned); // điểm bất động
  });

  it('AC-19.14 THUẦN — không sửa đối số', () => {
    const before = JSON.stringify(CAMBRIDGE_YL_SEED.rubric);
    assertAuthorableRubric(CAMBRIDGE_YL_SEED.rubric);
    expect(JSON.stringify(CAMBRIDGE_YL_SEED.rubric)).toBe(before);

    const broken = rubric({ scale: { min: 0, max: 0, step: 1 } });
    const brokenBefore = JSON.stringify(broken);
    caught(broken);
    expect(JSON.stringify(broken)).toBe(brokenBefore);
  });

  it('AC-19.15 cả hai seed ship sẵn đều đi qua', () => {
    expect(() => assertAuthorableRubric(CAMBRIDGE_YL_SEED.rubric)).not.toThrow();
    expect(() => assertAuthorableRubric(IELTS_SPEAKING_SEED.rubric)).not.toThrow();
  });
});
