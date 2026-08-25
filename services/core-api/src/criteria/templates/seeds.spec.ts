import { ValidationPipe } from '@nestjs/common';
import { computeTotal, maxTotal, validateLevels } from '../../lib/rubric-scoring';
import { CreateRubricTemplateDto } from '../dto/create-rubric-template.dto';
import { LOCKABLE_FIELD_PATHS } from '../lockable-fields';
import { normalizeRubric } from '../rubric-schema';
import { assertAuthorableRubric } from '../rubric-validation';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED, RUBRIC_TEMPLATE_SEEDS, findSeed } from './index';

/**
 * F10 FR-04 / FR-05 / FR-06 — hai mẫu mặc định.
 *
 * File này là hợp đồng của SEED, không phải của service: nó ghim đúng những con số mà hai PDF
 * nguồn nói ra, để một lần "dọn dẹp" seed sau này không âm thầm đổi thang điểm của cả trung tâm.
 * `lib/rubric-scoring.spec.ts` là lưới đỡ thứ hai — nó chạy TOÀN BỘ bộ test F9 trên chính hai
 * seed này (AC-06.3/06.4).
 */

const LOCKED_DEFAULT = ['dimensions[].key', 'scale', 'aggregation', 'levels', 'output_fields'];

/** 12 khóa top-level whitelist của `normalizeRubric` (F8 BR-05). */
const TOP_LEVEL_KEYS = [
  'aggregation',
  'comment_bank',
  'course_key',
  'dimensions',
  'feedback_language',
  'levels',
  'output_fields',
  'scale',
  'schema_version',
  'student_reply',
  'task_type',
  'tone',
];

describe('FR-04 — seed Cambridge YL (cambridge_yl_a0_a2)', () => {
  const seed = CAMBRIDGE_YL_SEED;

  it('AC-04.1 key / name / hình dạng seed', () => {
    expect(seed.key).toBe('cambridge_yl_a0_a2');
    expect(typeof seed.name).toBe('string');
    expect(seed.name.length).toBeGreaterThan(0);
    expect(seed.name).toBe('Cambridge Young Learners (A0–A2) — Speaking');
  });

  it('AC-04.2 schema_version + scale 0–5 bước 1', () => {
    expect(seed.rubric.schema_version).toBe(2);
    expect(seed.rubric.scale).toEqual({ min: 0, max: 5, step: 1 });
  });

  it('AC-04.3 aggregation = sum / none (PDF: "tổng tối đa = 25 điểm")', () => {
    expect(seed.rubric.aggregation).toEqual({ method: 'sum', round: 'none' });
  });

  it('AC-04.4 đúng 5 tiêu chí, đúng thứ tự, weight = 1, pronunciation đứng đầu', () => {
    expect(seed.rubric.dimensions.map((d) => d.key)).toEqual([
      'pronunciation',
      'intonation',
      'ending_sounds',
      'word_stress',
      'fluency',
    ]);
    expect(seed.rubric.dimensions).toHaveLength(5);
    expect(seed.rubric.dimensions[0].key).toBe('pronunciation');
    for (const dim of seed.rubric.dimensions) expect(dim.weight).toBe(1);
  });

  it('AC-04.5 nhãn song ngữ đúng bảng A của thiết kế mục 1.1', () => {
    expect(seed.rubric.dimensions.map((d) => d.label)).toEqual([
      'Pronunciation (Âm chính)',
      'Intonation (Ngữ điệu)',
      'Ending sounds (Âm đuôi)',
      'Word Stress (Trọng âm từ/cụm)',
      'Fluency (Trôi chảy)',
    ]);
  });

  it('AC-04.6 band 0 và band 5 nguyên văn, mỗi cái là mảng MỘT phần tử', () => {
    const byKey = Object.fromEntries(seed.rubric.dimensions.map((d) => [d.key, d.bands]));
    expect(byKey.pronunciation['0']).toEqual(['Không phát âm được, khó hiểu.']);
    expect(byKey.pronunciation['5']).toEqual(['Phát âm rõ ràng, dễ hiểu, gần chuẩn người bản ngữ.']);
    expect(byKey.intonation['0']).toEqual(['Không có ngữ điệu, đều giọng.']);
    expect(byKey.intonation['5']).toEqual([
      'Ngữ điệu tự nhiên, biểu cảm tốt, hỗ trợ truyền đạt ý nghĩa.',
    ]);
    expect(byKey.ending_sounds['0']).toEqual(['Luôn bỏ âm cuối.']);
    expect(byKey.ending_sounds['5']).toEqual(['Phát âm hầu hết âm cuối chuẩn xác, rõ ràng.']);
    expect(byKey.word_stress['0']).toEqual(['Không có trọng âm, đọc đều từng âm tiết.']);
    expect(byKey.word_stress['5']).toEqual(['Trọng âm chuẩn xác, tự nhiên cả ở từ và cụm.']);
    expect(byKey.fluency['0']).toEqual(['Không nói được / im lặng.']);
    expect(byKey.fluency['5']).toEqual([
      'Nói mượt mà, tự nhiên, có thể diễn đạt ý phức đơn giản.',
    ]);
    // Band 1–4 để trống có chủ ý (A-2: mẫu là CẤU TRÚC, prose là việc của criteria_author).
    for (const dim of seed.rubric.dimensions) {
      expect(Object.keys(dim.bands).sort()).toEqual(['0', '5']);
    }
  });

  it('AC-04.7 bảng quy đổi 4 cấp độ, đúng thứ tự', () => {
    expect(seed.rubric.levels).toEqual([
      { min: 0, max: 10, code: 'A0', label: 'Pre-starter (A0) ~ Tiny Rabbit' },
      { min: 11, max: 15, code: 'A1-', label: 'Starter (A1-) ~ Little Fox' },
      { min: 16, max: 20, code: 'A1', label: 'Mover (A1) ~ Junior Panda' },
      { min: 21, max: 25, code: 'A2', label: 'Flyer (A2) ~ Great Big Dino' },
    ]);
  });

  it('AC-04.8 output_fields chỉ có "comment"', () => {
    expect(seed.rubric.output_fields).toEqual(['comment']);
  });

  it('AC-04.9 maxTotal = 25 — đúng "Tổng tối đa = 25 điểm" của PDF', () => {
    expect(maxTotal(seed.rubric)).toBe(25);
  });

  it('AC-04.10 computeTotal 4/3/4/3/4 ⇒ 18/25, cấp độ A1 (thiết kế mục 10 ý 1)', () => {
    const result = computeTotal(seed.rubric, {
      pronunciation: { score: 4 },
      intonation: { score: 3 },
      ending_sounds: { score: 4 },
      word_stress: { score: 3 },
      fluency: { score: 4 },
    });
    expect(result.total).toBe(18);
    expect(result.max).toBe(25);
    expect(result.counted).toBe(5);
    expect(result.level?.code).toBe('A1');
    expect(result.level?.label).toBe('Mover (A1) ~ Junior Panda');
  });

  it('AC-04.11 validateLevels = [] (không hở, không chồng lấn, phủ kín 0..25)', () => {
    expect(validateLevels(seed.rubric)).toEqual([]);
  });

  it('AC-04.12 locked mặc định đúng 5 mục của thiết kế mục 11', () => {
    expect(seed.locked).toEqual(LOCKED_DEFAULT);
  });
});

describe('FR-05 — seed IELTS Speaking (ielts_speaking)', () => {
  const seed = IELTS_SPEAKING_SEED;

  it('AC-05.1 key / name', () => {
    expect(seed.key).toBe('ielts_speaking');
    expect(seed.name).toBe('IELTS Speaking — Analytic Scoring Band');
  });

  it('AC-05.2 scale band 0–9', () => {
    expect(seed.rubric.scale).toEqual({ min: 0, max: 9, step: 1 });
  });

  it('AC-05.3 aggregation = average / nearest_int ("không có số lẻ như 4.5, 5.5 hay 6.5")', () => {
    expect(seed.rubric.aggregation).toEqual({ method: 'average', round: 'nearest_int' });
  });

  it('AC-05.4 đúng 4 tiêu chí với nhãn của thiết kế mục 1.2, weight = 1', () => {
    expect(seed.rubric.dimensions.map((d) => d.key)).toEqual([
      'fluency_coherence',
      'lexical_resource',
      'grammatical_range',
      'pronunciation',
    ]);
    expect(seed.rubric.dimensions.map((d) => d.label)).toEqual([
      'Fluency and coherence',
      'Lexical resources',
      'Grammatical range and accuracy',
      'Pronunciation',
    ]);
    for (const dim of seed.rubric.dimensions) expect(dim.weight).toBe(1);
  });

  it('AC-05.5 output_fields = ["comment","fix"] ("Nhận xét" VÀ "Hướng sửa bài")', () => {
    expect(seed.rubric.output_fields).toEqual(['comment', 'fix']);
  });

  it('AC-05.6 levels = [] (band IELTS không phải bậc thang quy đổi)', () => {
    expect(seed.rubric.levels).toEqual([]);
  });

  it('AC-05.7 maxTotal = 9, KHÔNG phải 4 × 9 = 36 (average, không phải sum)', () => {
    expect(maxTotal(seed.rubric)).toBe(9);
  });

  it('AC-05.8 computeTotal 6/7/6/6 ⇒ 6 (6.25 làm tròn), max 9, không cấp độ', () => {
    const result = computeTotal(seed.rubric, {
      fluency_coherence: { score: 6 },
      lexical_resource: { score: 7 },
      grammatical_range: { score: 6 },
      pronunciation: { score: 6 },
    });
    expect(result.total).toBe(6);
    expect(result.max).toBe(9);
    expect(result.counted).toBe(4);
    expect(result.level).toBeNull();
  });

  it('AC-05.9 validateLevels = [] cho bảng cấp độ rỗng', () => {
    expect(validateLevels(seed.rubric)).toEqual([]);
  });

  it('AC-05.10 sub_factors rỗng, và nếu có thì đúng shape {label, by_band}', () => {
    for (const dim of seed.rubric.dimensions) {
      expect(Array.isArray(dim.sub_factors)).toBe(true);
      for (const sf of dim.sub_factors) {
        expect(typeof sf.label).toBe('string');
        expect(typeof sf.by_band).toBe('object');
        for (const band of Object.keys(sf.by_band)) {
          const value = Number(band);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(9);
        }
      }
    }
  });

  it('AC-05.11 locked mặc định giống seed Cambridge', () => {
    expect(seed.locked).toEqual(LOCKED_DEFAULT);
  });
});

describe('FR-06 — bất biến chung của mọi seed ("seed CHÍNH LÀ fixture")', () => {
  it.each(RUBRIC_TEMPLATE_SEEDS.map((seed) => [seed.key, seed] as const))(
    'AC-06.1 %s là ĐIỂM BẤT ĐỘNG của normalizeRubric',
    (_key, seed) => {
      expect(normalizeRubric(seed.rubric)).toEqual(seed.rubric);
      // Idempotent hai vòng — chốt chặn thừa nhưng rẻ.
      expect(normalizeRubric(normalizeRubric(seed.rubric))).toEqual(seed.rubric);
    },
  );

  it.each(RUBRIC_TEMPLATE_SEEDS.map((seed) => [seed.key, seed] as const))(
    'AC-06.2 %s khai báo ĐÚNG 12 khóa top-level, không thừa không thiếu',
    (_key, seed) => {
      expect(Object.keys(seed.rubric).sort()).toEqual(TOP_LEVEL_KEYS);
      expect(Object.keys(normalizeRubric(seed.rubric)).sort()).toEqual(TOP_LEVEL_KEYS);
    },
  );

  it.each(RUBRIC_TEMPLATE_SEEDS.map((seed) => [seed.key, seed] as const))(
    'AC-06.5 %s bị đóng băng SÂU — không ai lỡ tay sửa được singleton',
    (_key, seed) => {
      expect(Object.isFrozen(seed)).toBe(true);
      expect(Object.isFrozen(seed.rubric)).toBe(true);
      expect(Object.isFrozen(seed.rubric.scale)).toBe(true);
      expect(Object.isFrozen(seed.rubric.dimensions)).toBe(true);
      expect(Object.isFrozen(seed.rubric.dimensions[0])).toBe(true);
      expect(Object.isFrozen(seed.rubric.dimensions[0].bands)).toBe(true);
      expect(Object.isFrozen(seed.locked)).toBe(true);
    },
  );

  it('AC-06.6 barrel xuất đúng 2 seed theo thứ tự tất định + findSeed tra được', () => {
    expect(RUBRIC_TEMPLATE_SEEDS.map((s) => s.key)).toEqual(['cambridge_yl_a0_a2', 'ielts_speaking']);
    expect(findSeed('cambridge_yl_a0_a2')).toBe(CAMBRIDGE_YL_SEED);
    expect(findSeed('ielts_speaking')).toBe(IELTS_SPEAKING_SEED);
    expect(findSeed('khong_ton_tai')).toBeUndefined();
    expect(findSeed('')).toBeUndefined();
  });

  it.each(RUBRIC_TEMPLATE_SEEDS.map((seed) => [seed.key, seed] as const))(
    'AC-06.7 %s vượt qua chính cổng chặn FR-19 (mẫu ship sẵn không bao giờ bị 400)',
    (_key, seed) => {
      expect(() => assertAuthorableRubric(seed.rubric)).not.toThrow();
    },
  );

  it.each(RUBRIC_TEMPLATE_SEEDS.map((seed) => [seed.key, seed] as const))(
    'AC-06.7 %s được CreateRubricTemplateDto chấp nhận nguyên xi (không 400)',
    async (_key, seed) => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const cleaned = (await pipe.transform(
        { key: seed.key, name: seed.name, rubric: seed.rubric, locked: [...seed.locked] },
        { type: 'body', metatype: CreateRubricTemplateDto },
      )) as CreateRubricTemplateDto;
      expect(cleaned.key).toBe(seed.key);
      expect(cleaned.locked).toEqual(seed.locked);
    },
  );

  it.each(RUBRIC_TEMPLATE_SEEDS.map((seed) => [seed.key, seed] as const))(
    '%s: mọi mục `locked` nằm trong tập đóng §5.4',
    (_key, seed) => {
      for (const path of seed.locked) expect(LOCKABLE_FIELD_PATHS).toContain(path);
      expect(new Set(seed.locked).size).toBe(seed.locked.length);
    },
  );

  it('mọi seed đều có dimension bắt buộc `pronunciation` (kiến trúc mục 3.10)', () => {
    for (const seed of RUBRIC_TEMPLATE_SEEDS) {
      expect(seed.rubric.dimensions.map((d) => d.key)).toContain('pronunciation');
    }
  });

  it('key của seed là duy nhất và hợp lệ dạng khóa máy', () => {
    const keys = RUBRIC_TEMPLATE_SEEDS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9][a-z0-9_]{0,63}$/);
  });
});
