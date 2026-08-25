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
});
