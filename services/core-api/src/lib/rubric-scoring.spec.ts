import { DEFAULT_SCALE, type RubricDimensionV2, type RubricV2 } from '../criteria/rubric-schema';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED } from '../criteria/templates';
import { computeTotal, findLevel, maxTotal, validateLevels } from './rubric-scoring';

/**
 * F9 — `computeTotal` / `findLevel` / `maxTotal` / `validateLevels`.
 *
 * Hai fixture đầu file tái hiện ĐÚNG hai PDF nguồn trong `Criteria-Source/` (FR-07):
 *  - `KID_RUBRIC`  ← RubricSpeakingA0-C.pdf  ("Mỗi tiêu chí 0–5 điểm · Tổng tối đa = 25 điểm"
 *                     + bảng quy đổi 0–10 / 11–15 / 16–20 / 21–25).
 *  - `IELTS_RUBRIC` ← Analystic-ScoringBand.pdf ("thang điểm 1-9 · không có số lẻ như 4.5, 5.5
 *                     hay 6.5 · điểm từng phần chiếm 25%" ⇒ average + nearest_int; bảng
 *                     "Nhận xét / Hướng sửa bài" ⇒ output_fields ["comment","fix"]).
 *
 * F10 ĐÃ THAY hai fixture dựng tay bằng chính SEED được ship (F8 AC-15.9 / F10 AC-06.3):
 * "seed CHÍNH LÀ fixture", một bản duy nhất trong repo. Mọi assertion bên dưới giữ NGUYÊN — nếu
 * một trong hai seed lệch khỏi PDF nguồn thì file này đỏ ngay, tức là bộ test cũ của F9 giờ kiêm
 * luôn vai trò lưới đỡ cho hai mẫu mặc định (AC-06.4).
 *
 * Hai seed đều đã `Object.freeze` sâu; các ca dưới đây chỉ SPREAD (`{...KID_RUBRIC, ...}`) hoặc
 * `.map()` nên luôn tạo object mới, không bao giờ ghi vào bản gốc.
 */

function dimension(key: string, weight = 1): RubricDimensionV2 {
  return { key, label: key, weight, bands: {}, sub_factors: [] };
}

const KID_RUBRIC: RubricV2 = CAMBRIDGE_YL_SEED.rubric;
const IELTS_RUBRIC: RubricV2 = IELTS_SPEAKING_SEED.rubric;

/** Điểm đúng hình dạng LLM trả về (`{score, comment}`), không phải số trần. */
const s = (score: number) => ({ score, comment: 'x' });

function kidScores(
  pronunciation: number,
  intonation: number,
  endingSounds: number,
  wordStress: number,
  fluency: number,
): Record<string, unknown> {
  return {
    pronunciation: s(pronunciation),
    intonation: s(intonation),
    ending_sounds: s(endingSounds),
    word_stress: s(wordStress),
    fluency: s(fluency),
  };
}

function ieltsScores(fc: number, lr: number, gr: number, pron: number): Record<string, unknown> {
  return {
    fluency_coherence: s(fc),
    lexical_resource: s(lr),
    grammatical_range: s(gr),
    pronunciation: s(pron),
  };
}

/** Rubric v2 tối thiểu — dùng cho các ca biên, ghi đè đúng phần cần thử. */
function rubric(patch: Partial<RubricV2>): RubricV2 {
  return { ...KID_RUBRIC, levels: [], dimensions: [], ...patch };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe('rubric-scoring — FR-01 module contract & purity', () => {
  it('AC-01.2 never throws for any hostile `scores`', () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      'x',
      true,
      [],
      [1, 2, 3],
      {},
      { pronunciation: { score: { nested: true } } },
      { pronunciation: NaN },
      { pronunciation: Infinity },
      { pronunciation: -0 },
      { pronunciation: Number.MAX_VALUE },
      { pronunciation: { score: -1e308 } },
    ];
    for (const scores of hostile) {
      expect(() => computeTotal(KID_RUBRIC, scores)).not.toThrow();
      const result = computeTotal(KID_RUBRIC, scores);
      expect(Number.isFinite(result.total)).toBe(true);
      expect(Number.isFinite(result.max)).toBe(true);
      expect(Number.isFinite(result.counted)).toBe(true);
    }
  });

  it('AC-01.2 never throws for a structurally damaged rubric', () => {
    const broken: unknown[] = [
      null,
      undefined,
      42,
      'x',
      [],
      {},
      { dimensions: 'nope', scale: 5, aggregation: 7, levels: 'no' },
      { dimensions: [null, 1, 'x', {}, { key: '' }], scale: { min: 'a', max: 'b' } },
      { dimensions: [{ key: 'a', weight: NaN }], aggregation: { method: 'mystery', round: 'later' } },
    ];
    for (const r of broken) {
      expect(() => computeTotal(r as RubricV2, kidScores(1, 1, 1, 1, 1))).not.toThrow();
      expect(() => maxTotal(r as RubricV2)).not.toThrow();
      expect(() => validateLevels(r as RubricV2)).not.toThrow(); // AC-06.8
    }
  });

  it('AC-01.3 mutates neither argument (deep-frozen inputs)', () => {
    const frozenRubric = deepFreeze(JSON.parse(JSON.stringify(KID_RUBRIC)) as RubricV2);
    const frozenScores = deepFreeze(kidScores(4, 3, 4, 3, 4));
    const rubricBefore = JSON.stringify(frozenRubric);
    const scoresBefore = JSON.stringify(frozenScores);

    expect(() => computeTotal(frozenRubric, frozenScores)).not.toThrow();

    expect(JSON.stringify(frozenRubric)).toBe(rubricBefore);
    expect(JSON.stringify(frozenScores)).toBe(scoresBefore);
  });

  it('AC-01.4 is deterministic — repeated calls are bit-identical', () => {
    const a = computeTotal(IELTS_RUBRIC, ieltsScores(6, 7, 6, 6));
    const b = computeTotal(IELTS_RUBRIC, ieltsScores(6, 7, 6, 6));
    expect(a).toEqual(b);
    expect(Object.is(a.total, b.total)).toBe(true);
  });

  it('AC-01.7 maxTotal(rubric) === computeTotal(rubric, any).max when dimensions are present', () => {
    expect(maxTotal(KID_RUBRIC)).toBe(25);
    expect(maxTotal(KID_RUBRIC)).toBe(computeTotal(KID_RUBRIC, kidScores(0, 0, 0, 0, 0)).max);
    expect(maxTotal(KID_RUBRIC)).toBe(computeTotal(KID_RUBRIC, null).max);
    expect(maxTotal(IELTS_RUBRIC)).toBe(9);
    expect(maxTotal(IELTS_RUBRIC)).toBe(computeTotal(IELTS_RUBRIC, ieltsScores(1, 2, 3, 4)).max);
  });

  it('AC-01.7 maxTotal is 0 for a dimension-less rubric, while computeTotal uses the legacy path', () => {
    const legacy = rubric({ aggregation: { method: 'average', round: 'none' }, scale: { min: 0, max: 3, step: 1 } });
    expect(maxTotal(legacy)).toBe(0);
    expect(computeTotal(legacy, { pronunciation: s(3), fluency: s(3) }).max).toBe(3);
  });
});

describe('rubric-scoring — FR-02 aggregation', () => {
  it('AC-02.3 sum: total is the unweighted sum, max = |D| × scale.max', () => {
    const r = computeTotal(KID_RUBRIC, kidScores(5, 4, 3, 2, 1));
    expect(r.total).toBe(15);
    expect(r.max).toBe(25);
    expect(r.counted).toBe(5);
  });

  it('AC-02.4 average: total is the unweighted mean over PRESENT dimensions, max = scale.max', () => {
    const r = computeTotal({ ...IELTS_RUBRIC, aggregation: { method: 'average', round: 'none' } }, ieltsScores(6, 7, 6, 6));
    expect(r.total).toBe(6.25);
    expect(r.max).toBe(9);
  });

  it('AC-02.5 weighted_average: Σ(v×w)/Σw over present dimensions only', () => {
    const weighted: RubricV2 = {
      ...IELTS_RUBRIC,
      aggregation: { method: 'weighted_average', round: 'none' },
      dimensions: [
        dimension('fluency_coherence', 2),
        dimension('lexical_resource', 1),
        dimension('grammatical_range', 1),
        dimension('pronunciation', 1),
      ],
    };
    expect(computeTotal(weighted, ieltsScores(6, 7, 6, 6)).total).toBeCloseTo(6.2, 10);

    // dimension vắng mặt KHÔNG được tính vào mẫu số: (6×2 + 7)/(2+1) = 19/3
    const partial = computeTotal(weighted, { fluency_coherence: s(6), lexical_resource: s(7) });
    expect(partial.total).toBeCloseTo(19 / 3, 10);
    expect(partial.counted).toBe(2);
    expect(partial.missing).toEqual(['grammatical_range', 'pronunciation']);
  });

  it('AC-02.5 negative weight ⇒ 0, non-finite weight ⇒ 1 (AC-05.7)', () => {
    const r = rubric({
      aggregation: { method: 'weighted_average', round: 'none' },
      scale: { min: 0, max: 10, step: 1 },
      dimensions: [dimension('a', -5), dimension('b', Number.NaN)],
    });
    // a có weight 0 (không đóng góp) nhưng VẪN được đếm; b có weight 1.
    const result = computeTotal(r, { a: s(10), b: s(4) });
    expect(result.counted).toBe(2);
    expect(result.total).toBe(4);
  });

  it('AC-02.6 weighted_average with Σw = 0 falls back to the unweighted mean (never NaN)', () => {
    const r = rubric({
      aggregation: { method: 'weighted_average', round: 'none' },
      scale: { min: 0, max: 10, step: 1 },
      dimensions: [dimension('a', 0), dimension('b', 0)],
    });
    const result = computeTotal(r, { a: s(4), b: s(6) });
    expect(result.total).toBe(5);
    expect(result.counted).toBe(2);
    expect(Number.isNaN(result.total)).toBe(false);
  });

  it('AC-02.7 dimension-less rubric falls back to the scores keys with weight 1', () => {
    const legacy = rubric({ aggregation: { method: 'average', round: 'none' }, scale: { min: 0, max: 3, step: 1 } });
    const result = computeTotal(legacy, { pronunciation: s(3), fluency: s(0) });
    expect(result.total).toBe(1.5);
    expect(result.max).toBe(3);
    expect(result.counted).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.ignored).toEqual([]);

    // dưới `sum`, số dimension hữu hiệu chính là số khóa dùng được
    const legacySum = rubric({ aggregation: { method: 'sum', round: 'none' }, scale: { min: 0, max: 3, step: 1 } });
    const summed = computeTotal(legacySum, { pronunciation: s(3), fluency: s(2) });
    expect(summed.total).toBe(5);
    expect(summed.max).toBe(6);
  });

  it('AC-02.8 extra score keys never affect total or max', () => {
    const r = computeTotal(KID_RUBRIC, { ...kidScores(4, 3, 4, 3, 4), listening: s(5), writing: s(5) });
    expect(r.total).toBe(18);
    expect(r.max).toBe(25);
    expect(r.ignored).toEqual(['listening', 'writing']);
  });

  it('AC-02.10 an unknown aggregation.method behaves as `average`', () => {
    const r = rubric({
      aggregation: { method: 'mystery' as never, round: 'none' },
      scale: { min: 0, max: 10, step: 1 },
      dimensions: [dimension('a'), dimension('b')],
    });
    expect(computeTotal(r, { a: s(4), b: s(6) }).total).toBe(5);
  });

  it('AC-02.11 no scale.min shift: percentage basis is total/max, not (total−min)/(max−min)', () => {
    const shifted = rubric({
      aggregation: { method: 'average', round: 'none' },
      scale: { min: 1, max: 9, step: 1 },
      dimensions: [dimension('a')],
    });
    const r = computeTotal(shifted, { a: s(5) });
    expect(r.total).toBe(5); // KHÔNG phải 4
    expect(r.max).toBe(9); // KHÔNG phải 8
  });

  it('BR-10 out-of-range scores are clamped into [min,max] and reported', () => {
    const r = computeTotal(KID_RUBRIC, kidScores(99, -4, 5, 0, 5));
    expect(r.total).toBe(5 + 0 + 5 + 0 + 5); // 99→5, −4→0
    expect(r.clamped).toEqual(['pronunciation', 'intonation']);
    expect(r.total).toBeLessThanOrEqual(r.max); // ⇒ phần trăm không bao giờ vượt 100
  });
});

describe('rubric-scoring — FR-03 rounding', () => {
  it('AC-03.1 round "none" leaves the value untouched', () => {
    const r = computeTotal({ ...IELTS_RUBRIC, aggregation: { method: 'average', round: 'none' } }, ieltsScores(6, 7, 6, 6));
    expect(r.total).toBe(6.25);
  });

  it('AC-03.2 round "nearest_int" uses ECMAScript Math.round (ties toward +Infinity)', () => {
    expect(computeTotal(IELTS_RUBRIC, ieltsScores(6, 7, 7, 6)).total).toBe(7); // 6.5 → 7
    expect(computeTotal(IELTS_RUBRIC, ieltsScores(6, 6, 6, 7)).total).toBe(6); // 6.25 → 6
    expect(computeTotal(IELTS_RUBRIC, ieltsScores(7, 7, 6, 7)).total).toBe(7); // 6.75 → 7
  });

  it('AC-03.2 negative ties go toward +Infinity (documented, unreachable with a real rubric)', () => {
    const negative = rubric({
      aggregation: { method: 'average', round: 'nearest_int' },
      scale: { min: -10, max: 10, step: 1 },
      dimensions: [dimension('a'), dimension('b')],
    });
    expect(computeTotal(negative, { a: s(-7), b: s(-6) }).total).toBe(-6); // −6.5 → −6
  });

  it('AC-03.3 max is never rounded', () => {
    const r = rubric({
      aggregation: { method: 'average', round: 'nearest_int' },
      scale: { min: 0, max: 7.5, step: 1 },
      dimensions: [dimension('a')],
    });
    expect(computeTotal(r, { a: s(5) }).max).toBe(7.5);
  });

  it('AC-03.4 rounding happens BEFORE the level lookup', () => {
    const r: RubricV2 = {
      ...KID_RUBRIC,
      aggregation: { method: 'average', round: 'nearest_int' },
      scale: { min: 0, max: 25, step: 1 },
      dimensions: [dimension('a'), dimension('b')],
    };
    // mean = 15.5 → nearest_int → 16 → thuộc 16–20 (A1). Nếu dò trước khi làm tròn sẽ ra A1-.
    const result = computeTotal(r, { a: s(15), b: s(16) });
    expect(result.total).toBe(16);
    expect(result.level?.code).toBe('A1');
  });

  it('AC-03.5 an unknown round value behaves as "none"', () => {
    const r = { ...IELTS_RUBRIC, aggregation: { method: 'average' as const, round: 'banker' as never } };
    expect(computeTotal(r, ieltsScores(6, 7, 6, 6)).total).toBe(6.25);
  });
});

describe('rubric-scoring — FR-04 level lookup', () => {
  it('AC-04.1 both bounds inclusive, first match wins on an overlap', () => {
    const levels = [
      { min: 0, max: 10, code: 'LOW', label: 'low' },
      { min: 10, max: 20, code: 'MID', label: 'mid' },
    ];
    expect(findLevel(levels, 0)?.code).toBe('LOW');
    expect(findLevel(levels, 10)?.code).toBe('LOW'); // chồng lấn ⇒ phần tử ĐẦU thắng
    expect(findLevel(levels, 20)?.code).toBe('MID');
  });

  it('AC-04.2 empty levels ⇒ null', () => {
    expect(findLevel([], 5)).toBeNull();
    expect(computeTotal(IELTS_RUBRIC, ieltsScores(6, 7, 6, 6)).level).toBeNull();
  });

  it('AC-04.3 a total in no interval ⇒ null, with no nearest-neighbour snapping', () => {
    const levels = [
      { min: 0, max: 10, code: 'LOW', label: 'low' },
      { min: 20, max: 30, code: 'HIGH', label: 'high' },
    ];
    expect(findLevel(levels, 15)).toBeNull();
    expect(findLevel(levels, -1)).toBeNull();
    expect(findLevel(levels, 31)).toBeNull();
  });

  it('AC-04.4 entries with a non-finite min/max are skipped', () => {
    const levels = [
      { min: Number.NaN, max: 10, code: 'BAD', label: 'bad' },
      { min: 0, max: 'x' as unknown as number, code: 'BAD2', label: 'bad2' },
      { min: 0, max: 10, code: 'OK', label: 'ok' },
    ];
    expect(findLevel(levels, 5)?.code).toBe('OK');
  });

  it('AC-04.5 counted === 0 ⇒ level null and NO lookup (never "0 → Tiny Rabbit")', () => {
    const r = computeTotal(KID_RUBRIC, {});
    expect(r.counted).toBe(0);
    expect(r.total).toBe(0);
    expect(r.level).toBeNull();
    // ...mặc dù cấp độ A0 phủ đúng giá trị 0:
    expect(findLevel(KID_RUBRIC.levels, 0)?.code).toBe('A0');
  });
});

describe('rubric-scoring — FR-05 degenerate input', () => {
  const DEGENERATE: { name: string; scores: unknown }[] = [
    { name: 'null', scores: null },
    { name: 'undefined', scores: undefined },
    { name: 'number', scores: 42 },
    { name: 'string', scores: 'x' },
    { name: 'boolean', scores: true },
    { name: 'empty array', scores: [] },
    { name: 'non-empty array', scores: [1, 2, 3] },
    { name: 'empty object', scores: {} },
  ];

  it.each(DEGENERATE)(
    'AC-05.1/05.2 scores=$name ⇒ counted 0, total 0, level null, every dimension missing',
    ({ scores }) => {
      const r = computeTotal(KID_RUBRIC, scores);
      expect(r.counted).toBe(0);
      expect(r.total).toBe(0);
      expect(r.level).toBeNull();
      expect(r.missing).toEqual([
        'pronunciation',
        'intonation',
        'ending_sounds',
        'word_stress',
        'fluency',
      ]);
      expect(r.ignored).toEqual([]);
      expect(r.clamped).toEqual([]);
    },
  );

  it.each([
    [{ pronunciation: { score: '4' } }],
    [{ pronunciation: { score: null } }],
    [{ pronunciation: {} }],
    [{ pronunciation: '4' }],
    [{ pronunciation: null }],
    [{ pronunciation: Number.NaN }],
    [{ pronunciation: Number.POSITIVE_INFINITY }],
    [{ pronunciation: true }],
  ])('AC-05.3 non-numeric per-dimension value %p is ABSENT (no coercion)', (scores) => {
    const r = computeTotal(KID_RUBRIC, scores);
    expect(r.counted).toBe(0);
    expect(r.missing).toContain('pronunciation');
  });

  it('AC-05.4 non-object / empty-key dimensions are skipped and do not inflate max', () => {
    const r = rubric({
      aggregation: { method: 'sum', round: 'none' },
      scale: { min: 0, max: 5, step: 1 },
      dimensions: [
        null as never,
        'x' as never,
        { key: '', label: '', weight: 1, bands: {}, sub_factors: [] },
        { key: 42 as unknown as string, label: '', weight: 1, bands: {}, sub_factors: [] },
        dimension('a'),
        dimension('b'),
      ],
    });
    expect(computeTotal(r, { a: s(5), b: s(5) }).max).toBe(10); // 2 dimension, không phải 6
    expect(maxTotal(r)).toBe(10);
  });

  it('AC-05.5 duplicate dimension keys: first wins, max counts the de-duplicated set, dup in `ignored`', () => {
    const r = rubric({
      aggregation: { method: 'sum', round: 'none' },
      scale: { min: 0, max: 5, step: 1 },
      dimensions: [dimension('a'), dimension('a'), dimension('a'), dimension('b')],
    });
    const result = computeTotal(r, { a: s(5), b: s(4) });
    expect(result.max).toBe(10);
    expect(result.total).toBe(9);
    expect(result.ignored).toEqual(['a']); // đúng MỘT lần dù trùng hai lần
  });

  it('AC-05.6 scale fallbacks: missing max ⇒ DEFAULT_SCALE.max, non-finite min ⇒ 0', () => {
    const noScale = rubric({
      aggregation: { method: 'average', round: 'none' },
      scale: undefined as unknown as RubricV2['scale'],
      dimensions: [dimension('a')],
    });
    expect(computeTotal(noScale, { a: s(2) }).max).toBe(DEFAULT_SCALE.max);

    const badMin = rubric({
      aggregation: { method: 'average', round: 'none' },
      scale: { min: 'x' as unknown as number, max: 5, step: 1 },
      dimensions: [dimension('a')],
    });
    const clampedLow = computeTotal(badMin, { a: s(-3) });
    expect(clampedLow.total).toBe(0);
    expect(clampedLow.clamped).toEqual(['a']);
  });

  it('AC-05.6 min > max ⇒ bounds unusable: no clamping at all, `clamped` stays empty', () => {
    const inverted = rubric({
      aggregation: { method: 'average', round: 'none' },
      scale: { min: 9, max: 2, step: 1 },
      dimensions: [dimension('a')],
    });
    const result = computeTotal(inverted, { a: s(100) });
    expect(result.total).toBe(100);
    expect(result.clamped).toEqual([]);
    expect(result.max).toBe(2); // scale.max vẫn được dùng cho `max`
  });

  it('AC-05.8 dimensions [] + unusable scores ⇒ counted 0, max 0, total 0, level null', () => {
    const empty = rubric({ aggregation: { method: 'average', round: 'none' } });
    const result = computeTotal(empty, {});
    expect(result).toEqual({
      total: 0,
      max: 0,
      level: null,
      counted: 0,
      missing: [],
      ignored: [],
      clamped: [],
    });
  });

  it('AC-05.9 prototype-polluting keys are read safely and never touch Object.prototype', () => {
    const polluted = JSON.parse('{"__proto__":{"x":1},"constructor":{"score":5}}') as unknown;
    expect(() => computeTotal(KID_RUBRIC, polluted)).not.toThrow();
    expect(({} as Record<string, unknown>).x).toBeUndefined();

    // `__proto__` là dimension: đọc theo own-property ⇒ không nhặt nhầm Object.prototype
    const protoDim = rubric({
      aggregation: { method: 'average', round: 'none' },
      scale: { min: 0, max: 5, step: 1 },
      dimensions: [dimension('__proto__')],
    });
    expect(computeTotal(protoDim, {}).counted).toBe(0);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('rubric-scoring — FR-06 validateLevels', () => {
  const withLevels = (levels: RubricV2['levels']): RubricV2 => ({ ...KID_RUBRIC, levels });

  it('AC-06.1 empty levels ⇒ no issues', () => {
    expect(validateLevels(IELTS_RUBRIC)).toEqual([]);
  });

  it('AC-06.9 the Cambridge YL table is clean', () => {
    expect(validateLevels(KID_RUBRIC)).toEqual([]);
  });

  it('AC-06.9 11–15 → 10–15 ⇒ exactly one level_overlap', () => {
    const issues = validateLevels(
      withLevels(KID_RUBRIC.levels.map((l) => (l.code === 'A1-' ? { ...l, min: 10 } : l))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('level_overlap');
    expect(issues[0].message).toContain('10');
  });

  it('AC-06.9 11–15 → 12–15 ⇒ exactly one level_gap', () => {
    const issues = validateLevels(
      withLevels(KID_RUBRIC.levels.map((l) => (l.code === 'A1-' ? { ...l, min: 12 } : l))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('level_gap');
    expect(issues[0].message).toContain('12');
  });

  it('AC-06.9 first entry 0–10 → 1–10 ⇒ exactly one level_coverage_start', () => {
    const issues = validateLevels(
      withLevels(KID_RUBRIC.levels.map((l) => (l.code === 'A0' ? { ...l, min: 1 } : l))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('level_coverage_start');
  });

  it('AC-06.9 last entry 21–25 → 21–24 ⇒ exactly one level_coverage_end', () => {
    const issues = validateLevels(
      withLevels(KID_RUBRIC.levels.map((l) => (l.code === 'A2' ? { ...l, max: 24 } : l))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('level_coverage_end');
    expect(issues[0].message).toContain('25');
  });

  it('AC-06.9 an entry with code "" ⇒ exactly one level_invalid (and NO phantom gap)', () => {
    const issues = validateLevels(
      withLevels(KID_RUBRIC.levels.map((l) => (l.code === 'A1-' ? { ...l, code: '   ' } : l))),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('level_invalid');
    expect(issues[0].index).toBe(1); // chỉ số trong MẢNG GỐC
  });

  it('AC-06.2 a non-finite bound / inverted interval / empty label is one level_invalid per entry', () => {
    const issues = validateLevels(
      withLevels([
        { min: Number.NaN, max: 10, code: 'A', label: 'a' },
        { min: 20, max: 5, code: 'B', label: '' },
        { min: 0, max: 25, code: 'C', label: 'c' },
      ]),
    );
    const invalid = issues.filter((i) => i.code === 'level_invalid');
    expect(invalid).toHaveLength(2);
    expect(invalid.map((i) => i.index)).toEqual([0, 1]);
  });

  it('AC-06.3 with a continuous total (g = 0) touching bounds are contiguous, not overlapping', () => {
    const continuous: RubricV2 = {
      ...IELTS_RUBRIC,
      levels: [
        { min: 0, max: 4.5, code: 'LOW', label: 'low' },
        { min: 4.5, max: 9, code: 'HIGH', label: 'high' },
      ],
      aggregation: { method: 'average', round: 'none' },
    };
    expect(validateLevels(continuous)).toEqual([]);
  });

  it('AC-06.7 level_invalid issues come first, ordering issues after', () => {
    const issues = validateLevels(
      withLevels([
        { min: 0, max: 10, code: '', label: 'a' },
        { min: 14, max: 25, code: 'B', label: 'b' },
      ]),
    );
    expect(issues.map((i) => i.code)).toEqual(['level_invalid', 'level_gap']);
  });
});

describe('rubric-scoring — FR-07 worked example: Cambridge YL (KID), sum 0–5 × 5 ⇒ max 25', () => {
  it('AC-07.1 4/3/4/3/4 ⇒ 18/25, level "Mover (A1) ~ Junior Panda"', () => {
    const r = computeTotal(KID_RUBRIC, kidScores(4, 3, 4, 3, 4));
    expect(r.total).toBe(18);
    expect(r.max).toBe(25);
    expect(r.counted).toBe(5);
    expect(r.level).toEqual({ min: 16, max: 20, code: 'A1', label: 'Mover (A1) ~ Junior Panda' });
  });

  it('AC-07.2 all fives ⇒ 25 and A2 (proves the UPPER bound is inclusive)', () => {
    const r = computeTotal(KID_RUBRIC, kidScores(5, 5, 5, 5, 5));
    expect(r.total).toBe(25);
    expect(r.level?.code).toBe('A2');
    expect(r.level?.label).toBe('Flyer (A2) ~ Great Big Dino');
  });

  it('AC-07.3 a genuine all-zero grading DOES get a level (contrast AC-04.5)', () => {
    const r = computeTotal(KID_RUBRIC, kidScores(0, 0, 0, 0, 0));
    expect(r.total).toBe(0);
    expect(r.counted).toBe(5);
    expect(r.level?.code).toBe('A0');
    expect(r.level?.label).toBe('Pre-starter (A0) ~ Tiny Rabbit');
  });

  it('AC-07.4 the 10/11 boundary: 10 ⇒ A0, 11 ⇒ A1-', () => {
    expect(computeTotal(KID_RUBRIC, kidScores(2, 2, 2, 2, 2)).level?.code).toBe('A0');
    const eleven = computeTotal(KID_RUBRIC, kidScores(3, 2, 2, 2, 2));
    expect(eleven.total).toBe(11);
    expect(eleven.level?.code).toBe('A1-');
    expect(eleven.level?.label).toBe('Starter (A1-) ~ Little Fox');
  });

  it('AC-07.5 a missing dimension shrinks the total but NEVER the max', () => {
    const scores = kidScores(4, 3, 4, 3, 4);
    delete (scores as Record<string, unknown>).pronunciation;
    const r = computeTotal(KID_RUBRIC, scores);
    expect(r.total).toBe(14);
    expect(r.max).toBe(25);
    expect(r.counted).toBe(4);
    expect(r.missing).toEqual(['pronunciation']);
    // 14 ∈ [11,15] ⇒ A1- theo đúng bảng quy đổi của PDF.
    // (F9-ba.md AC-07.5 ghi "A0" — sai số học so với chính bảng nó dựng; xem F9-backend.md.)
    expect(r.level?.code).toBe('A1-');
  });

  it('AC-07.6 an extra dimension is ignored, total and max unchanged', () => {
    const r = computeTotal(KID_RUBRIC, { ...kidScores(4, 3, 4, 3, 4), listening: s(5) });
    expect(r.total).toBe(18);
    expect(r.max).toBe(25);
    expect(r.ignored).toEqual(['listening']);
  });

  it('AC-07.7 `sum` ignores weight: every dimension at weight 2 gives an IDENTICAL result (BR-03)', () => {
    const weighted: RubricV2 = {
      ...KID_RUBRIC,
      dimensions: KID_RUBRIC.dimensions.map((d) => ({ ...d, weight: 2 })),
    };
    expect(computeTotal(weighted, kidScores(4, 3, 4, 3, 4))).toEqual(
      computeTotal(KID_RUBRIC, kidScores(4, 3, 4, 3, 4)),
    );
  });
});

describe('rubric-scoring — FR-07 worked example: IELTS Speaking, average 0–9, whole numbers only', () => {
  it('AC-07.8 6/7/6/6 ⇒ raw 6.25 ⇒ 6, max 9, no level', () => {
    const r = computeTotal(IELTS_RUBRIC, ieltsScores(6, 7, 6, 6));
    expect(r.total).toBe(6);
    expect(r.max).toBe(9);
    expect(r.counted).toBe(4);
    expect(r.level).toBeNull();
  });

  it('AC-07.9 7/7/6/7 ⇒ raw 6.75 ⇒ 7', () => {
    expect(computeTotal(IELTS_RUBRIC, ieltsScores(7, 7, 6, 7)).total).toBe(7);
  });

  it('AC-07.10 6/7/7/6 ⇒ raw 6.5 ⇒ 7 (ties toward +Infinity)', () => {
    expect(computeTotal(IELTS_RUBRIC, ieltsScores(6, 7, 7, 6)).total).toBe(7);
  });

  it('AC-07.11 the same rubric with round "none" ⇒ 6.25 (integers come from `round`, not `average`)', () => {
    const raw = { ...IELTS_RUBRIC, aggregation: { method: 'average' as const, round: 'none' as const } };
    expect(computeTotal(raw, ieltsScores(6, 7, 6, 6)).total).toBe(6.25);
  });

  it('AC-07.12 weighted_average 2/1/1/1 on 6/7/6/6 ⇒ 6.2 (vs 6.25 unweighted) — the bug is real', () => {
    const weighted: RubricV2 = {
      ...IELTS_RUBRIC,
      aggregation: { method: 'weighted_average', round: 'none' },
      dimensions: [
        dimension('fluency_coherence', 2),
        dimension('lexical_resource', 1),
        dimension('grammatical_range', 1),
        dimension('pronunciation', 1),
      ],
    };
    const scores = ieltsScores(6, 7, 6, 6);
    expect(computeTotal(weighted, scores).total).toBeCloseTo(6.2, 10);
    // số học TRƯỚC F9 (bỏ qua weight hoàn toàn):
    expect(computeTotal({ ...weighted, aggregation: { method: 'average', round: 'none' } }, scores).total).toBe(6.25);

    // và cùng rubric đó với nearest_int:
    expect(computeTotal({ ...weighted, aggregation: { method: 'weighted_average', round: 'nearest_int' } }, scores).total).toBe(6);
  });
});
