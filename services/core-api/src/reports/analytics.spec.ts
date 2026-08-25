import { CAMBRIDGE_YL_SEED } from '../criteria/templates';
import { ReportsService } from './reports.service';

/**
 * F7 analytics unit tests — seed rows, assert EXACT computed numbers. Priority targets (BA NFR-01):
 * no NaN / no divide-by-zero on empty data, and band-normalization across mixed band scales.
 */

type GradingRow = {
  scores: unknown;
  criteria: { rubric: unknown };
  submission: { receivedAt: Date; student: { className: string | null } | null };
};

function grading(
  scores: unknown,
  opts: { bandScale?: [number, number]; className?: string | null; receivedAt?: string } = {},
): GradingRow {
  const { bandScale = [0, 3], className = '10A', receivedAt = '2026-07-15T00:00:00Z' } = opts;
  return {
    scores,
    criteria: { rubric: { band_scale: bandScale } },
    submission: { receivedAt: new Date(receivedAt), student: { className } },
  };
}

const dim = (score: number) => ({ score, comment: 'x' });

describe('ReportsService — F7 analytics', () => {
  let prisma: {
    student: { findMany: jest.Mock };
    submission: { findMany: jest.Mock; count: jest.Mock };
    grading: { findMany: jest.Mock };
    costLog: { findMany: jest.Mock };
  };
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      student: { findMany: jest.fn().mockResolvedValue([]) },
      submission: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      grading: { findMany: jest.fn().mockResolvedValue([]) },
      costLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReportsService(prisma as never);
  });

  const FROM = new Date('2026-07-01T00:00:00Z');
  const TO = new Date('2026-07-31T00:00:00Z');

  /** submission.count is called twice by kpis: homework (kind filter) and pending (status filter). */
  function countByWhere(homework: number, pending: number): void {
    prisma.submission.count.mockImplementation(({ where }: { where: { status?: string } }) =>
      Promise.resolve(where.status === 'awaiting_review' ? pending : homework),
    );
  }

  describe('kpis', () => {
    it('AC-01.1 counts only homework kinds (audio/video), excludes text/image', async () => {
      countByWhere(2, 0);
      const res = await service.kpis(FROM, TO);
      expect(res.submissions.count).toBe(2);
      // proves the kind filter is applied at the query level
      const homeworkCall = prisma.submission.count.mock.calls.find(
        (c) => (c[0].where as { kind?: unknown }).kind,
      )!;
      expect((homeworkCall[0].where as { kind: unknown }).kind).toEqual({ in: ['audio', 'video'] });
    });

    it('AC-01.2 submission rate = distinct submitters / active students * 100', async () => {
      prisma.student.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: i + 1, className: '10A' })),
      );
      prisma.submission.findMany.mockResolvedValue([{ studentId: 1 }, { studentId: 2 }, { studentId: 3 }, { studentId: 4 }]);
      countByWhere(4, 0);
      const res = await service.kpis(FROM, TO);
      expect(res.submissionRate.ratePercent).toBe(40);
    });

    it('AC-01.3 avg score + pronunciation band-normalized, gradedCount counted', async () => {
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(3), fluency: dim(3) }),
        grading({ pronunciation: dim(0), fluency: dim(0) }),
      ]);
      countByWhere(2, 0);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(50);
      expect(res.avgScore.gradedCount).toBe(2);
      expect(res.avgPronunciation.scorePct).toBe(50);
      expect(res.avgPronunciation.gradedCount).toBe(2);
    });

    it('AC-01.4 zero graded → null scores, gradedCount 0, no NaN / no throw', async () => {
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBeNull();
      expect(res.avgPronunciation.scorePct).toBeNull();
      expect(res.avgScore.gradedCount).toBe(0);
      expect(res.submissionRate.ratePercent).toBe(0); // no students → guarded 0
      expect(Number.isNaN(res.submissionRate.ratePercent)).toBe(false);
    });

    it('AC-01.5 pending-review count is a snapshot (status only, no range filter)', async () => {
      countByWhere(0, 3);
      const res = await service.kpis(FROM, TO);
      expect(res.pendingReview.count).toBe(3);
      const pendingCall = prisma.submission.count.mock.calls.find(
        (c) => (c[0].where as { status?: string }).status === 'awaiting_review',
      )!;
      expect((pendingCall[0].where as Record<string, unknown>).receivedAt).toBeUndefined();
    });

    it('AC-01.6 cost sums estUsd of in-range CostLog rows', async () => {
      prisma.costLog.findMany.mockResolvedValue([
        { createdAt: new Date('2026-07-10T00:00:00Z'), provider: 'gemini', estUsd: 1.2, inputTokens: 1, outputTokens: 1 },
        { createdAt: new Date('2026-07-10T00:00:00Z'), provider: 'gemini', estUsd: 0.0345, inputTokens: 1, outputTokens: 1 },
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.cost.totalUsd).toBe(1.2345);
    });

    it('AC-01.7 cross-band: [0,3]@3 and [0,9]@9 both = 100%, avg = 100 (proves normalization)', async () => {
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(3), fluency: dim(3) }, { bandScale: [0, 3] }),
        grading({ pronunciation: dim(9), fluency: dim(9) }, { bandScale: [0, 9] }),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(100);
      expect(res.avgPronunciation.scorePct).toBe(100);
    });

    // F8 AC-14.1/14.2: cùng một khóa, rubric v2 (`scale.max`) và v1 (`band_scale[1]`) phải
    // chuẩn hóa ra CÙNG một con số — shim v1→v2 không được làm lệch báo cáo cũ.
    it('F8 AC-14.1 v2 rubric: band max comes from scale.max', async () => {
      prisma.grading.findMany.mockResolvedValue([
        {
          scores: { pronunciation: dim(9), fluency: dim(9) },
          criteria: { rubric: { schema_version: 2, scale: { min: 0, max: 9, step: 1 } } },
          submission: { receivedAt: new Date('2026-07-15T00:00:00Z'), student: { className: '10A' } },
        },
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(100);
    });

    it('F8 AC-14.1 falls back to band_scale then to 3 when scale is unusable', async () => {
      prisma.grading.findMany.mockResolvedValue([
        {
          scores: { pronunciation: dim(9), fluency: dim(9) },
          criteria: { rubric: { schema_version: 2, scale: { min: 0, max: 0 }, band_scale: [0, 9] } },
          submission: { receivedAt: new Date('2026-07-15T00:00:00Z'), student: { className: '10A' } },
        },
        grading({ pronunciation: dim(3), fluency: dim(3) }, { bandScale: [0, 3] }),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(100);
    });

    it('AC-01.8 malformed scores blobs are skipped, not counted, no throw', async () => {
      prisma.grading.findMany.mockResolvedValue([
        grading(null),
        grading('garbage'),
        grading({}),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBeNull();
      expect(res.avgScore.gradedCount).toBe(0);
      expect(res.avgPronunciation.gradedCount).toBe(0);
    });
  });

  describe('trends', () => {
    it('AC-02.1 dense day series: 7 points, active days carry counts, rest 0', async () => {
      prisma.submission.findMany.mockResolvedValue([
        { receivedAt: new Date('2026-07-01T06:00:00Z') },
        { receivedAt: new Date('2026-07-03T06:00:00Z') },
        { receivedAt: new Date('2026-07-03T09:00:00Z') },
        { receivedAt: new Date('2026-07-06T06:00:00Z') },
      ]);
      const res = await service.trends(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-07T00:00:00Z'), 'day');
      expect(res.bucket).toBe('day');
      expect(res.submissions).toHaveLength(7);
      expect(res.submissions[0]).toEqual({ label: '2026-07-01', value: 1 });
      expect(res.submissions[1].value).toBe(0);
      expect(res.submissions[2]).toEqual({ label: '2026-07-03', value: 2 });
      expect(res.submissions[5]).toEqual({ label: '2026-07-06', value: 1 });
      expect(res.submissions[6].value).toBe(0);
    });

    it('AC-02.2 range > 60 days forces week bucket, keyed by Monday', async () => {
      const res = await service.trends(new Date('2026-04-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'), 'day');
      expect(res.bucket).toBe('week');
      // every label is a Monday (ISO week start)
      for (const p of res.submissions) {
        expect(new Date(p.label + 'T00:00:00Z').getUTCDay()).toBe(1);
      }
    });

    it('AC-02.3 empty bucket: score null, submissions/cost 0 (never NaN)', async () => {
      prisma.submission.findMany.mockResolvedValue([{ receivedAt: new Date('2026-07-02T06:00:00Z') }]);
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(3), fluency: dim(3) }, { receivedAt: '2026-07-02T06:00:00Z' }),
      ]);
      const res = await service.trends(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-03T00:00:00Z'), 'day');
      expect(res.score[0]).toEqual({ label: '2026-07-01', value: null });
      expect(res.score[1].value).toBe(100); // 2026-07-02 has a grading
      expect(res.submissions[0].value).toBe(0);
      expect(res.cost[0].value).toBe(0);
    });

    it('AC-02.4 week bucket aggregates cost into correct Monday-keyed weeks', async () => {
      prisma.costLog.findMany.mockResolvedValue([
        { createdAt: new Date('2026-07-07T00:00:00Z'), provider: 'gemini', estUsd: 1.0, inputTokens: 1, outputTokens: 1 },
        { createdAt: new Date('2026-07-08T00:00:00Z'), provider: 'gemini', estUsd: 0.5, inputTokens: 1, outputTokens: 1 },
        { createdAt: new Date('2026-07-15T00:00:00Z'), provider: 'gemini', estUsd: 2.0, inputTokens: 1, outputTokens: 1 },
      ]);
      const res = await service.trends(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-20T00:00:00Z'), 'week');
      expect(res.bucket).toBe('week');
      const week1 = res.cost.find((p) => p.label === '2026-07-06')!; // Mon of 07-07/07-08
      const week2 = res.cost.find((p) => p.label === '2026-07-13')!; // Mon of 07-15
      expect(week1.value).toBe(1.5);
      expect(week2.value).toBe(2.0);
    });
  });

  describe('classPerformance', () => {
    it('AC-03.1 one row per class incl. unassigned; no gradings → null score / 0 gradedCount', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 1, className: 'A' },
        { id: 2, className: 'B' },
        { id: 3, className: null },
      ]);
      const rows = await service.classPerformance(FROM, TO);
      const names = rows.map((r) => r.className).sort();
      expect(names).toEqual(['(chưa gán lớp)', 'A', 'B']);
      const a = rows.find((r) => r.className === 'A')!;
      expect(a.avgScorePct).toBeNull();
      expect(a.gradedCount).toBe(0);
      expect(a.ratePercent).toBe(0);
    });

    it('AC-03.2 sorted worst-first by ratePercent (A 20% before B 80%)', async () => {
      prisma.student.findMany.mockResolvedValue([
        ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, className: 'A' })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: i + 6, className: 'B' })),
      ]);
      prisma.submission.findMany.mockResolvedValue([
        { studentId: 1 }, // A: 1/5 = 20%
        { studentId: 6 },
        { studentId: 7 },
        { studentId: 8 },
        { studentId: 9 }, // B: 4/5 = 80%
      ]);
      const rows = await service.classPerformance(FROM, TO);
      expect(rows[0].className).toBe('A');
      expect(rows[0].ratePercent).toBe(20);
      expect(rows[1].className).toBe('B');
      expect(rows[1].ratePercent).toBe(80);
    });

    it('band-normalized avgScorePct is grouped by class', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 1, className: 'A' }]);
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(3), fluency: dim(3) }, { className: 'A' }),
        grading({ pronunciation: dim(0), fluency: dim(0) }, { className: 'A' }),
      ]);
      const rows = await service.classPerformance(FROM, TO);
      const a = rows.find((r) => r.className === 'A')!;
      expect(a.avgScorePct).toBe(50);
      expect(a.gradedCount).toBe(2);
    });
  });

  describe('dimensionBreakdown', () => {
    it('AC-04.1 one row per dimension, weakest avgScorePct first', async () => {
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(1), fluency: dim(2), grammar: dim(3) }),
      ]);
      const rows = await service.dimensionBreakdown(FROM, TO);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.dimension)).toEqual(['pronunciation', 'fluency', 'grammar']);
      expect(rows[0].avgScorePct).toBe(33.3);
      expect(rows[2].avgScorePct).toBe(100);
    });

    it('AC-04.2 gradedCount counts only gradings that had that dimension', async () => {
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(3), fluency: dim(3) }),
        grading({ pronunciation: dim(0) }),
      ]);
      const rows = await service.dimensionBreakdown(FROM, TO);
      const pron = rows.find((r) => r.dimension === 'pronunciation')!;
      const flu = rows.find((r) => r.dimension === 'fluency')!;
      expect(pron.gradedCount).toBe(2);
      expect(pron.avgScorePct).toBe(50);
      expect(flu.gradedCount).toBe(1);
      expect(flu.avgScorePct).toBe(100);
    });

    it('AC-04.3 no gradings → empty array', async () => {
      const rows = await service.dimensionBreakdown(FROM, TO);
      expect(rows).toEqual([]);
    });
  });

  /**
   * F9 — `scorePctForGrading` nay đi qua `computeTotal`. Hai điều phải chứng minh:
   *  (a) KHÔNG ĐỔI cho mọi rubric cũ (F8 chuẩn hóa về `average`) — chính là 10 test phía trên,
   *      cộng thêm ba giá trị GHIM before/after ở đây (AC-12.6);
   *  (b) CÓ ĐỔI, đúng hướng, cho rubric `weighted_average` có trọng số lệch (AC-12.7).
   */
  describe('F9 — computeTotal-based scoring', () => {
    function gradingV2(
      scores: unknown,
      rubricJson: unknown,
      opts: { criteriaId?: number; className?: string | null; receivedAt?: string } = {},
    ): GradingRow & { criteriaId?: number } {
      const { criteriaId, className = '10A', receivedAt = '2026-07-15T00:00:00Z' } = opts;
      return {
        scores,
        criteriaId,
        criteria: { rubric: rubricJson },
        submission: { receivedAt: new Date(receivedAt), student: { className } },
      };
    }

    // 4 dimension trên thang 0–9, trọng số 2/1/1/1 (fixture AC-07.12).
    const WEIGHTED_RUBRIC = {
      schema_version: 2,
      scale: { min: 0, max: 9, step: 1 },
      aggregation: { method: 'weighted_average', round: 'none' },
      dimensions: [
        { key: 'fluency_coherence', weight: 2 },
        { key: 'lexical_resource', weight: 1 },
        { key: 'grammatical_range', weight: 1 },
        { key: 'pronunciation', weight: 1 },
      ],
    };
    const IELTS_SCORES = {
      fluency_coherence: dim(6),
      lexical_resource: dim(7),
      grammatical_range: dim(6),
      pronunciation: dim(6),
    };

    it('AC-12.6 pinned values: three legacy `average` gradings report the pre-F9 number exactly', async () => {
      // pre-F9: round1(mean(scores) / bandMax * 100). Cả ba rubric đều là v1 `{band_scale:[0,3]}`.
      const cases: { scores: Record<string, unknown>; expected: number }[] = [
        { scores: { pronunciation: dim(2), fluency: dim(3) }, expected: 83.3 }, // 2.5/3
        { scores: { pronunciation: dim(1), fluency: dim(2), grammar: dim(3) }, expected: 66.7 }, // 2/3
        { scores: { pronunciation: dim(0), fluency: dim(3) }, expected: 50 }, // 1.5/3
      ];
      for (const c of cases) {
        prisma.grading.findMany.mockResolvedValue([grading(c.scores)]);
        const res = await service.kpis(FROM, TO);
        expect(res.avgScore.scorePct).toBe(c.expected);
      }
    });

    it('AC-12.7 the weight fix bites: 68.9% weighted vs 69.4% under the old unweighted math', async () => {
      prisma.grading.findMany.mockResolvedValue([gradingV2(IELTS_SCORES, WEIGHTED_RUBRIC, { criteriaId: 1 })]);
      const res = await service.kpis(FROM, TO);
      // (6×2 + 7 + 6 + 6) / 5 = 6.2  ⇒ 6.2/9 × 100 = 68.888… ⇒ 68.9
      expect(res.avgScore.scorePct).toBe(68.9);
      // pre-F9 (weight bị bỏ qua): (6+7+6+6)/4 = 6.25 ⇒ 6.25/9 × 100 = 69.444… ⇒ 69.4
      expect(res.avgScore.scorePct).not.toBe(69.4);
    });

    it('AC-03.4/OQ-3 `nearest_int` is applied before the percentage (6/9 = 66.7%, not 6.25/9)', async () => {
      prisma.grading.findMany.mockResolvedValue([
        gradingV2(IELTS_SCORES, {
          schema_version: 2,
          scale: { min: 0, max: 9, step: 1 },
          aggregation: { method: 'average', round: 'nearest_int' },
          dimensions: WEIGHTED_RUBRIC.dimensions.map((d) => ({ ...d, weight: 1 })),
        }, { criteriaId: 2 }),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(66.7);
    });

    it('AC-12.2 normalizeRubric is memoized per criteriaId (a second row with the same id reuses it)', async () => {
      // Hai dòng CÙNG criteriaId nhưng rubric khác nhau — trong thực tế không xảy ra (criteria là
      // bản bất biến), ở đây dùng làm bằng chứng QUAN SÁT ĐƯỢC rằng memo có khóa là criteriaId.
      prisma.grading.findMany.mockResolvedValue([
        gradingV2({ pronunciation: dim(3), fluency: dim(3) }, { schema_version: 2, scale: { min: 0, max: 9, step: 1 } }, { criteriaId: 7 }),
        gradingV2({ pronunciation: dim(3), fluency: dim(3) }, { schema_version: 2, scale: { min: 0, max: 3, step: 1 } }, { criteriaId: 7 }),
      ]);
      const res = await service.kpis(FROM, TO);
      // cả hai dùng rubric của dòng ĐẦU (max 9) ⇒ 33.3 mỗi dòng. Không memo thì dòng 2 ra 100.
      expect(res.avgScore.scorePct).toBe(33.3);
      expect(res.avgScore.gradedCount).toBe(2);
    });

    it('AC-12.2 rows without a criteriaId are still normalized independently (no `undefined` memo key)', async () => {
      prisma.grading.findMany.mockResolvedValue([
        grading({ pronunciation: dim(3), fluency: dim(3) }, { bandScale: [0, 3] }),
        grading({ pronunciation: dim(3), fluency: dim(3) }, { bandScale: [0, 6] }),
      ]);
      const res = await service.kpis(FROM, TO);
      // 100 và 50 ⇒ trung bình 75. Nếu memo gộp theo khóa `undefined` thì cả hai ra 100.
      expect(res.avgScore.scorePct).toBe(75);
    });

    it('AC-12.3 a grading with no usable score reports null, never 0%', async () => {
      prisma.grading.findMany.mockResolvedValue([
        gradingV2({}, WEIGHTED_RUBRIC, { criteriaId: 3 }),
        gradingV2('garbage', WEIGHTED_RUBRIC, { criteriaId: 3 }),
        gradingV2({ fluency_coherence: { score: 'sáu' } }, WEIGHTED_RUBRIC, { criteriaId: 3 }),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBeNull();
      expect(res.avgScore.gradedCount).toBe(0);
    });

    it('AC-12.3 out-of-range LLM scores are clamped ⇒ a percentage can never exceed 100', async () => {
      prisma.grading.findMany.mockResolvedValue([
        gradingV2({ pronunciation: dim(99), fluency: dim(99) }, { schema_version: 2, scale: { min: 0, max: 3, step: 1 } }, { criteriaId: 5 }),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(100);
    });

    it('AC-12.8 avgPronunciation and dimensionBreakdown keep the single-dimension bandMax path', async () => {
      prisma.grading.findMany.mockResolvedValue([gradingV2(IELTS_SCORES, WEIGHTED_RUBRIC, { criteriaId: 6 })]);
      const res = await service.kpis(FROM, TO);
      // 6/9 × 100 = 66.666… ⇒ 66.7 — trọng số 2 của fluency_coherence KHÔNG can thiệp vào đây.
      expect(res.avgPronunciation.scorePct).toBe(66.7);

      const rows = await service.dimensionBreakdown(FROM, TO);
      expect(rows.find((r) => r.dimension === 'fluency_coherence')!.avgScorePct).toBe(66.7);
      expect(rows.find((r) => r.dimension === 'lexical_resource')!.avgScorePct).toBe(77.8);
    });

    it('AC-12.6 `sum` divides by the RUBRIC max: 18/25 = 72%, and a missing dimension gives 56% (pre-F9: 70%)', async () => {
      const kid = {
        // F10 AC-06.3: dẫn xuất từ seed, KHÔNG chép lại. Vẫn là rubric "thô" (chỉ `key`) đúng
        // như trước — các con số và assertion bên dưới không đổi.
        schema_version: 2,
        scale: CAMBRIDGE_YL_SEED.rubric.scale,
        aggregation: CAMBRIDGE_YL_SEED.rubric.aggregation,
        dimensions: CAMBRIDGE_YL_SEED.rubric.dimensions.map((d) => ({ key: d.key })),
      };
      prisma.grading.findMany.mockResolvedValue([
        gradingV2(
          {
            pronunciation: dim(4),
            intonation: dim(3),
            ending_sounds: dim(4),
            word_stress: dim(3),
            fluency: dim(4),
          },
          kid,
          { criteriaId: 8 },
        ),
      ]);
      const res = await service.kpis(FROM, TO);
      expect(res.avgScore.scorePct).toBe(72); // 18/25

      // ...và nếu THIẾU một dimension, mẫu số KHÔNG co lại: 14/25 = 56%.
      prisma.grading.findMany.mockResolvedValue([
        gradingV2(
          { intonation: dim(3), ending_sounds: dim(4), word_stress: dim(3), fluency: dim(4) },
          kid,
          { criteriaId: 8 },
        ),
      ]);
      expect((await service.kpis(FROM, TO)).avgScore.scorePct).toBe(56);
    });
  });

  describe('pendingReview', () => {
    it('AC-05.1 count + oldest waiting hours + oldest id', async () => {
      const oldest = { id: 42, receivedAt: new Date(Date.now() - (50 * 3600 * 1000 + 60_000)) };
      prisma.submission.findMany.mockResolvedValue([
        oldest,
        { id: 43, receivedAt: new Date(Date.now() - 3600 * 1000) },
        { id: 44, receivedAt: new Date(Date.now() - 2 * 3600 * 1000) },
      ]);
      const res = await service.pendingReview();
      expect(res.count).toBe(3);
      expect(res.oldestWaitingHours).toBe(50);
      expect(res.oldestSubmissionId).toBe(42);
    });

    it('AC-05.2 zero pending → count 0, nulls (no NaN)', async () => {
      const res = await service.pendingReview();
      expect(res).toEqual({ count: 0, oldestWaitingHours: null, oldestSubmissionId: null });
    });
  });
});
