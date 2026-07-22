import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let prisma: {
    student: { findMany: jest.Mock };
    submission: { findMany: jest.Mock };
    costLog: { findMany: jest.Mock };
  };
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      student: { findMany: jest.fn().mockResolvedValue([]) },
      submission: { findMany: jest.fn().mockResolvedValue([]) },
      costLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReportsService(prisma as never);
  });

  describe('submissionRate', () => {
    it('computes rate per class from active students vs. submitted student ids', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 1, className: '10A' },
        { id: 2, className: '10A' },
        { id: 3, className: '10B' },
      ]);
      prisma.submission.findMany.mockResolvedValue([{ studentId: 1 }]);

      const rows = await service.submissionRate(new Date('2026-07-01'), new Date('2026-07-31'));

      const row10A = rows.find((r) => r.className === '10A')!;
      expect(row10A.totalStudents).toBe(2);
      expect(row10A.submittedStudents).toBe(1);
      expect(row10A.ratePercent).toBe(50);

      const row10B = rows.find((r) => r.className === '10B')!;
      expect(row10B.ratePercent).toBe(0);
    });

    it('groups students with no class under a placeholder label', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 1, className: null }]);
      const rows = await service.submissionRate(new Date(), new Date());
      expect(rows[0].className).toBe('(chưa gán lớp)');
    });
  });

  describe('cost', () => {
    it('aggregates cost_log rows by day and provider', async () => {
      prisma.costLog.findMany.mockResolvedValue([
        { createdAt: new Date('2026-07-20T10:00:00Z'), provider: 'gemini', estUsd: 1.5, inputTokens: 100, outputTokens: 50 },
        { createdAt: new Date('2026-07-20T15:00:00Z'), provider: 'gemini', estUsd: 0.5, inputTokens: 20, outputTokens: 10 },
        { createdAt: new Date('2026-07-20T15:00:00Z'), provider: 'openai', estUsd: 2, inputTokens: 30, outputTokens: 15 },
      ]);

      const rows = await service.cost(new Date('2026-07-01'), new Date('2026-07-31'));

      expect(rows).toHaveLength(2);
      const gemini = rows.find((r) => r.provider === 'gemini')!;
      expect(gemini.totalUsd).toBe(2);
      expect(gemini.inputTokens).toBe(120);
    });
  });

  describe('pilotComparison', () => {
    it('only queries submissions having BOTH gradings and builds per-dimension deltas', async () => {
      prisma.submission.findMany.mockResolvedValue([
        {
          id: 7,
          student: { code: 'S01', fullName: 'Nam', className: '10A' },
          grading: {
            scores: {
              fluency: { score: 3, comment: 'x' },
              pronunciation: { score: 2, comment: 'y' },
            },
          },
          pilotTextGrading: {
            scores: {
              fluency: { score: 2, comment: 'x' },
              pronunciation: { score: 1, comment: 'y' },
            },
          },
        },
      ]);

      const rows = await service.pilotComparison(new Date('2026-07-01'), new Date('2026-07-31'));

      // đảm bảo query lọc đúng: cả grading lẫn pilotTextGrading phải khác null
      const whereArg = prisma.submission.findMany.mock.calls[0][0].where;
      expect(whereArg.grading).toEqual({ isNot: null });
      expect(whereArg.pilotTextGrading).toEqual({ isNot: null });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.submissionId).toBe(7);
      expect(row.className).toBe('10A');
      expect(row.studentName).toBe('Nam');
      expect(row.audio_fluency).toBe(3);
      expect(row.text_fluency).toBe(2);
      expect(row.delta_fluency).toBe(1);
      expect(row.audio_pronunciation).toBe(2);
      expect(row.text_pronunciation).toBe(1);
      expect(row.delta_pronunciation).toBe(1);
    });

    it('covers the union of dimension keys across both scores objects', async () => {
      prisma.submission.findMany.mockResolvedValue([
        {
          id: 8,
          student: { code: 'S02', fullName: 'Lan', className: null },
          grading: { scores: { fluency: { score: 3 }, pronunciation: { score: 2 } } },
          pilotTextGrading: { scores: { pronunciation: { score: 2 }, grammar: { score: 1 } } },
        },
      ]);

      const rows = await service.pilotComparison(new Date(), new Date());
      const row = rows[0];
      expect(row.className).toBe('(chưa gán lớp)');
      // fluency chỉ có ở audio → text rỗng, delta rỗng
      expect(row.audio_fluency).toBe(3);
      expect(row.text_fluency).toBe('');
      expect(row.delta_fluency).toBe('');
      // grammar chỉ có ở text
      expect(row.audio_grammar).toBe('');
      expect(row.text_grammar).toBe(1);
      // pronunciation ở cả hai
      expect(row.delta_pronunciation).toBe(0);
    });
  });
});
