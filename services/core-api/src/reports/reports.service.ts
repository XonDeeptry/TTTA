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

/** Pilot A/B (US4): mỗi dòng là một submission có CẢ bản chấm audio (Grading) lẫn text
 * (PilotTextGrading); các cột audio_<dim>/text_<dim>/delta_<dim> là động theo dimension. */
export interface PilotComparisonRow {
  submissionId: number;
  className: string;
  studentCode: string;
  studentName: string;
  [dimensionColumn: string]: number | string;
}

function dimensionScore(scores: unknown, dim: string): number | null {
  if (!scores || typeof scores !== 'object') return null;
  const entry = (scores as Record<string, unknown>)[dim];
  if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).score === 'number') {
    return (entry as { score: number }).score;
  }
  if (typeof entry === 'number') return entry;
  return null;
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

  /** US4 pilot A/B: đối chiếu điểm nhánh audio vs. text theo từng dimension. Chỉ lấy submission
   * có ĐỦ cả hai bản chấm trong khoảng thời gian (receivedAt). delta = audio − text. */
  async pilotComparison(from: Date, to: Date): Promise<PilotComparisonRow[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        receivedAt: { gte: from, lte: to },
        grading: { isNot: null },
        pilotTextGrading: { isNot: null },
      },
      include: {
        grading: true,
        pilotTextGrading: true,
        student: { select: { code: true, fullName: true, className: true } },
      },
      orderBy: { receivedAt: 'asc' },
    });

    const rows: PilotComparisonRow[] = [];
    for (const s of submissions) {
      // where lọc isNot:null nhưng TS không thu hẹp kiểu quan hệ nullable → guard lại cho chắc.
      if (!s.grading || !s.pilotTextGrading) continue;
      const audioScores = s.grading.scores;
      const textScores = s.pilotTextGrading.scores;
      const dims = new Set<string>([
        ...(audioScores && typeof audioScores === 'object' ? Object.keys(audioScores as object) : []),
        ...(textScores && typeof textScores === 'object' ? Object.keys(textScores as object) : []),
      ]);

      const row: PilotComparisonRow = {
        submissionId: s.id,
        className: s.student?.className ?? UNASSIGNED_CLASS,
        studentCode: s.student?.code ?? '',
        studentName: s.student?.fullName ?? '',
      };
      for (const dim of dims) {
        const audio = dimensionScore(audioScores, dim);
        const text = dimensionScore(textScores, dim);
        row[`audio_${dim}`] = audio ?? '';
        row[`text_${dim}`] = text ?? '';
        row[`delta_${dim}`] = audio !== null && text !== null ? audio - text : '';
      }
      rows.push(row);
    }
    return rows;
  }
}
