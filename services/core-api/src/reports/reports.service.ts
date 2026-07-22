import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

const UNASSIGNED_CLASS = '(chưa gán lớp)';

export interface SubmissionRateRow {
  className: string;
  totalStudents: number;
  submittedStudents: number;
  ratePercent: number;
}

export interface CostRow {
  date: string;
  provider: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/** Phân hệ 4 (mục 3.7): tỷ lệ nộp theo lớp + chi phí LLM theo ngày. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async submissionRate(from: Date, to: Date, className?: string): Promise<SubmissionRateRow[]> {
    const where: Prisma.StudentWhereInput = { status: 'active', ...(className ? { className } : {}) };
    const students = await this.prisma.student.findMany({ where, select: { id: true, className: true } });

    const submitted = await this.prisma.submission.findMany({
      where: { receivedAt: { gte: from, lte: to }, studentId: { not: null } },
      select: { studentId: true },
    });
    const submittedIds = new Set(submitted.map((s) => s.studentId));

    const byClass = new Map<string, { total: number; submitted: number }>();
    for (const s of students) {
      const cls = s.className ?? UNASSIGNED_CLASS;
      const entry = byClass.get(cls) ?? { total: 0, submitted: 0 };
      entry.total += 1;
      if (submittedIds.has(s.id)) entry.submitted += 1;
      byClass.set(cls, entry);
    }

    return Array.from(byClass.entries()).map(([cls, { total, submitted: n }]) => ({
      className: cls,
      totalStudents: total,
      submittedStudents: n,
      ratePercent: total > 0 ? Math.round((n / total) * 1000) / 10 : 0,
    }));
  }

  async cost(from: Date, to: Date): Promise<CostRow[]> {
    const rows = await this.prisma.costLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'asc' },
    });

    const byKey = new Map<string, CostRow>();
    for (const r of rows) {
      const date = r.createdAt.toISOString().slice(0, 10);
      const key = `${date}|${r.provider}`;
      const entry = byKey.get(key) ?? { date, provider: r.provider, totalUsd: 0, inputTokens: 0, outputTokens: 0 };
      entry.totalUsd = Math.round((entry.totalUsd + Number(r.estUsd)) * 1_000_000) / 1_000_000;
      entry.inputTokens += r.inputTokens;
      entry.outputTokens += r.outputTokens;
      byKey.set(key, entry);
    }
    return Array.from(byKey.values());
  }
}
