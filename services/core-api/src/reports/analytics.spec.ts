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
