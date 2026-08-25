import { Injectable } from '@nestjs/common';
import { Prisma, SubmissionKind } from '@prisma/client';
import { normalizeRubric, type RubricV2 } from '../criteria/rubric-schema';
import { computeTotal } from '../lib/rubric-scoring';
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

// ─── F7 analytics (mục 3.7 phân hệ 4) — additive, chỉ đọc ──────────────────────────
// BR-01 "bài tập" = chỉ audio/video (text/image/file/follow không phải bài nộp để chấm).
const HOMEWORK_KINDS: SubmissionKind[] = ['audio', 'video'];
// BR-02: điểm chuẩn hóa về % của band_scale max mỗi khóa; band_max = rubric.band_scale[1], fallback 3.
const DEFAULT_BAND_MAX = 3;
// US2: quá ngưỡng này (ngày) thì server ép bucket tuần cho dễ đọc, bất kể tham số client.
const WEEK_BUCKET_THRESHOLD_DAYS = 60;

export type TrendBucket = 'day' | 'week';
export interface TrendPoint {
  label: string;
  value: number | null;
}
export interface TrendSeries {
  bucket: TrendBucket;
  submissions: TrendPoint[];
  score: TrendPoint[];
  cost: TrendPoint[];
}
export interface KpiSummary {
  submissions: { count: number };
  submissionRate: { ratePercent: number };
  avgScore: { scorePct: number | null; gradedCount: number };
  avgPronunciation: { scorePct: number | null; gradedCount: number };
  pendingReview: { count: number };
  cost: { totalUsd: number };
}
export interface ClassPerformanceRow {
  className: string;
  totalStudents: number;
  submittedStudents: number;
  ratePercent: number;
  avgScorePct: number | null;
  gradedCount: number;
}
export interface DimensionRow {
  dimension: string;
  avgScorePct: number;
  gradedCount: number;
}
export interface PendingReviewSummary {
  count: number;
  oldestWaitingHours: number | null;
  oldestSubmissionId: number | null;
}

/** Một grading trong khoảng thời gian, kèm rubric đã ghim + band_max của khóa (giải quyết N+1
 * bằng include). `rubric` là bản ĐÃ chuẩn hóa và đã vá `scale.max` (xem `resolveRubric`). */
interface GradingInRange {
  scores: unknown;
  bandMax: number;
  rubric: RubricV2;
  receivedAt: Date;
  className: string;
}

/** band_max = `rubric.scale.max` (v2) → `rubric.band_scale[1]` (v1) → 3 (BR-02/BR-06). Ép về số
 * dương, không bao giờ 0 ⇒ không bao giờ chia cho 0 khi chuẩn hóa.
 *
 * F9 GIỮ NGUYÊN hàm này và vẫn cho nó đọc rubric THÔ (AC-12.4): `normalizeRubric` lọc bỏ
 * `band_scale` khỏi 12 khóa được giữ, nên một rubric v1 chỉ có `band_scale` sẽ MẤT thang điểm
 * nếu ta chỉ nhìn bản đã chuẩn hóa. Giá trị ở đây được VÁ ngược vào `scale.max` khi bản chuẩn
 * hóa cho ra `<= 0` (xem `resolveRubric`). Hai consumer còn dùng trực tiếp `bandMax` là
 * `avgPronunciation` và `dimensionBreakdown` — chúng chuẩn hóa MỘT dimension nên cố ý KHÔNG đi
 * qua `computeTotal` (AC-12.8): nhân trọng số cho một tiêu chí đơn lẻ là vô nghĩa. */
function bandMaxFromRubric(rubric: unknown): number {
  if (rubric && typeof rubric === 'object') {
    const scaleV2 = (rubric as Record<string, unknown>).scale;
    if (scaleV2 && typeof scaleV2 === 'object' && !Array.isArray(scaleV2)) {
      const max = Number((scaleV2 as Record<string, unknown>).max);
      if (Number.isFinite(max) && max > 0) return max;
    }
    const scaleV1 = (rubric as Record<string, unknown>).band_scale;
    if (Array.isArray(scaleV1) && scaleV1.length >= 2) {
      const max = Number(scaleV1[1]);
      if (Number.isFinite(max) && max > 0) return max;
    }
  }
  return DEFAULT_BAND_MAX;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Bucket hóa theo ngày UTC (khớp cost() vốn dùng toISOString().slice(0,10)).
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function mondayOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const diff = (day.getUTCDay() + 6) % 7; // số ngày kể từ thứ Hai (ISO week start)
  return new Date(day.getTime() - diff * 86400000);
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function bucketLabelFor(d: Date, bucket: TrendBucket): string {
  return isoDate(bucket === 'week' ? mondayOfUtcWeek(d) : startOfUtcDay(d));
}
/** Dãy nhãn dày (không hở): mọi kỳ trong [from,to] đều có một điểm — kể cả kỳ không có dữ liệu. */
function denseBucketLabels(from: Date, to: Date, bucket: TrendBucket): string[] {
  const step = bucket === 'week' ? 7 * 86400000 : 86400000;
  let cur = bucket === 'week' ? mondayOfUtcWeek(from) : startOfUtcDay(from);
  const end = bucket === 'week' ? mondayOfUtcWeek(to) : startOfUtcDay(to);
  const labels: string[] = [];
  // guard hữu hạn: nếu from > to thì trả mảng rỗng thay vì lặp vô hạn.
  while (cur.getTime() <= end.getTime()) {
    labels.push(isoDate(cur));
    cur = new Date(cur.getTime() + step);
  }
  return labels;
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

  // ─── F7 analytics ────────────────────────────────────────────────────────────────

  /**
   * Điểm chuẩn hóa của một grading = `computeTotal(rubric, scores).total / .max × 100`, làm tròn
   * 1 chữ số. `null` khi không có điểm dùng được (`counted === 0`) hoặc `max <= 0` — blob
   * rỗng/hỏng bị BỎ QUA chứ không tính là 0 % (giữ nguyên hành vi cũ, AC-01.8).
   *
   * F9 SỬA BUG ĐỨNG LÂU: biểu thức cũ `sum / n / bandMax` cộng trung bình KHÔNG trọng số rồi
   * chia thang điểm — `weight` chưa bao giờ được đọc. Nay mọi con số đi qua `computeTotal`, nên
   * `weighted_average` thật sự ảnh hưởng tới báo cáo (US3).
   *
   * BR-06 — BÁO CÁO TÍNH LẠI, KHÔNG ĐỌC `Grading.totalScore`. Cột đó NULL với mọi grading có
   * trước F9 (không backfill), đọc nó sẽ làm cả lịch sử biến mất khỏi avgScore/trends/
   * classPerformance ngay ngày deploy, và sẽ trộn lẫn "số cũ" với "số mới" trong cùng một trung
   * bình. `Grading.criteriaId` ghim một bản criteria BẤT BIẾN + `computeTotal` tất định từng bit
   * ⇒ tính lại cho ra ĐÚNG con số đã lưu (AC-12.10).
   *
   * `rubric` truyền vào đây ĐÃ được chuẩn hóa và đã vá `scale.max` một lần duy nhất cho mỗi
   * `criteriaId` trong `fetchGradingsInRange` (AC-12.2/AC-12.4) — đừng chuẩn hóa lại theo dòng.
   */
  private scorePctForGrading(scores: unknown, rubric: RubricV2): number | null {
    const result = computeTotal(rubric, scores);
    if (result.counted === 0 || result.max <= 0) return null;
    return round1((result.total / result.max) * 100);
  }

  /** Lấy MỌI grading có submission.receivedAt trong khoảng, kèm rubric đã ghim + band_max của khóa
   * (một query duy nhất với include — tránh N+1, NFR-03). Dùng chung cho
   * kpis/trends/class-performance/dimension-breakdown. */
  private async fetchGradingsInRange(from: Date, to: Date): Promise<GradingInRange[]> {
    const gradings = await this.prisma.grading.findMany({
      where: { submission: { receivedAt: { gte: from, lte: to } } },
      select: {
        scores: true,
        criteriaId: true,
        criteria: { select: { rubric: true } },
        submission: { select: { receivedAt: true, student: { select: { className: true } } } },
      },
    });

    // AC-12.2: `normalizeRubric` chạy TỐI ĐA MỘT LẦN cho mỗi `criteriaId` trong một lần gọi báo
    // cáo. criteria là bản bất biến (một lần sửa rubric = một version mới) nên memo theo id là an
    // toàn. Dòng không có criteriaId (test/dữ liệu lạ) thì tính riêng, không dùng memo — nếu memo
    // theo khóa `undefined` thì hai rubric khác nhau sẽ dùng chung một kết quả.
    const memo = new Map<number, { rubric: RubricV2; bandMax: number }>();
    const resolveRubric = (criteriaId: unknown, raw: unknown): { rubric: RubricV2; bandMax: number } => {
      const key = typeof criteriaId === 'number' && Number.isFinite(criteriaId) ? criteriaId : null;
      if (key !== null) {
        const hit = memo.get(key);
        if (hit) return hit;
      }
      const bandMax = bandMaxFromRubric(raw);
      const normalized = normalizeRubric(raw);
      // AC-12.4: vá thang điểm v1 (`band_scale`) vào `scale.max` khi bản chuẩn hóa không dùng được.
      const entry = {
        bandMax,
        rubric:
          normalized.scale.max > 0
            ? normalized
            : { ...normalized, scale: { ...normalized.scale, max: bandMax } },
      };
      if (key !== null) memo.set(key, entry);
      return entry;
    };

    return gradings.map((g) => {
      const { rubric, bandMax } = resolveRubric(g.criteriaId, g.criteria?.rubric);
      return {
        scores: g.scores,
        bandMax,
        rubric,
        receivedAt: g.submission.receivedAt,
        className: g.submission.student?.className ?? UNASSIGNED_CLASS,
      };
    });
  }

  /** FR-01 (US1): 6 KPI card cho khoảng thời gian. pendingReview là snapshot hiện tại (BR-03),
   * KHÔNG lọc theo khoảng. Mọi phép chia đều có guard (NFR-01). */
  async kpis(from: Date, to: Date): Promise<KpiSummary> {
    const [homeworkCount, rateRows, gradings, costRows, pendingCount] = await Promise.all([
      this.prisma.submission.count({
        where: { kind: { in: HOMEWORK_KINDS }, receivedAt: { gte: from, lte: to } },
      }),
      this.submissionRate(from, to),
      this.fetchGradingsInRange(from, to),
      this.cost(from, to),
      this.prisma.submission.count({ where: { status: 'awaiting_review' } }),
    ]);

    // Tỷ lệ nộp roll-up toàn trung tâm từ submissionRate() theo lớp.
    let totalStudents = 0;
    let submittedStudents = 0;
    for (const r of rateRows) {
      totalStudents += r.totalStudents;
      submittedStudents += r.submittedStudents;
    }
    const ratePercent = totalStudents > 0 ? round1((submittedStudents / totalStudents) * 100) : 0;

    // Điểm tổng thể chuẩn hóa (BR-02).
    let scoreSum = 0;
    let scoreN = 0;
    for (const g of gradings) {
      const p = this.scorePctForGrading(g.scores, g.rubric);
      if (p !== null) {
        scoreSum += p;
        scoreN += 1;
      }
    }
    const avgScorePct = scoreN > 0 ? round1(scoreSum / scoreN) : null;

    // Phát âm (dimension bắt buộc) chuẩn hóa riêng.
    let pronSum = 0;
    let pronN = 0;
    for (const g of gradings) {
      const raw = dimensionScore(g.scores, 'pronunciation');
      if (raw !== null) {
        pronSum += (raw / g.bandMax) * 100;
        pronN += 1;
      }
    }
    const avgPronPct = pronN > 0 ? round1(pronSum / pronN) : null;

    let totalUsd = 0;
    for (const r of costRows) totalUsd += r.totalUsd;
    totalUsd = Math.round(totalUsd * 1_000_000) / 1_000_000;

    return {
      submissions: { count: homeworkCount },
      submissionRate: { ratePercent },
      avgScore: { scorePct: avgScorePct, gradedCount: scoreN },
      avgPronunciation: { scorePct: avgPronPct, gradedCount: pronN },
      pendingReview: { count: pendingCount },
      cost: { totalUsd },
    };
  }

  /** FR-02 (US2): 3 chuỗi chart-ready (bài nộp / điểm TB / chi phí) theo bucket day|week, dãy dày.
   * Khoảng > 60 ngày ⇒ server ép week bất kể tham số (US2, để chart dễ đọc). Bucket điểm không có
   * grading trả `null` (không phải 0, không NaN — AC-02.3). */
  async trends(from: Date, to: Date, bucket: TrendBucket): Promise<TrendSeries> {
    const spanDays = (to.getTime() - from.getTime()) / 86400000;
    const effBucket: TrendBucket = spanDays > WEEK_BUCKET_THRESHOLD_DAYS ? 'week' : bucket;
    const labels = denseBucketLabels(from, to, effBucket);

    const [homework, gradings, costRows] = await Promise.all([
      this.prisma.submission.findMany({
        where: { kind: { in: HOMEWORK_KINDS }, receivedAt: { gte: from, lte: to } },
        select: { receivedAt: true },
      }),
      this.fetchGradingsInRange(from, to),
      this.cost(from, to),
    ]);

    const subByBucket = new Map<string, number>();
    for (const s of homework) {
      const k = bucketLabelFor(s.receivedAt, effBucket);
      subByBucket.set(k, (subByBucket.get(k) ?? 0) + 1);
    }

    const scoreByBucket = new Map<string, { sum: number; n: number }>();
    for (const g of gradings) {
      const p = this.scorePctForGrading(g.scores, g.rubric);
      if (p === null) continue;
      const k = bucketLabelFor(g.receivedAt, effBucket);
      const e = scoreByBucket.get(k) ?? { sum: 0, n: 0 };
      e.sum += p;
      e.n += 1;
      scoreByBucket.set(k, e);
    }

    const costByBucket = new Map<string, number>();
    for (const r of costRows) {
      const k = bucketLabelFor(new Date(r.date), effBucket);
      costByBucket.set(k, Math.round(((costByBucket.get(k) ?? 0) + r.totalUsd) * 1_000_000) / 1_000_000);
    }

    return {
      bucket: effBucket,
      submissions: labels.map((label) => ({ label, value: subByBucket.get(label) ?? 0 })),
      score: labels.map((label) => {
        const e = scoreByBucket.get(label);
        return { label, value: e ? round1(e.sum / e.n) : null };
      }),
      cost: labels.map((label) => ({ label, value: costByBucket.get(label) ?? 0 })),
    };
  }

  /** FR-03 (US3): mỗi lớp một dòng (tỷ lệ nộp từ submissionRate() + điểm TB chuẩn hóa), sắp xếp
   * ratePercent tăng dần — lớp yếu nhất lên đầu. Lớp không có grading ⇒ avgScorePct=null (AC-03.3). */
  async classPerformance(from: Date, to: Date): Promise<ClassPerformanceRow[]> {
    const [rateRows, gradings] = await Promise.all([
      this.submissionRate(from, to),
      this.fetchGradingsInRange(from, to),
    ]);

    const byClass = new Map<string, { sum: number; n: number }>();
    for (const g of gradings) {
      const p = this.scorePctForGrading(g.scores, g.rubric);
      if (p === null) continue;
      const e = byClass.get(g.className) ?? { sum: 0, n: 0 };
      e.sum += p;
      e.n += 1;
      byClass.set(g.className, e);
    }

    const rows: ClassPerformanceRow[] = rateRows.map((r) => {
      const e = byClass.get(r.className);
      return {
        className: r.className,
        totalStudents: r.totalStudents,
        submittedStudents: r.submittedStudents,
        ratePercent: r.ratePercent,
        avgScorePct: e ? round1(e.sum / e.n) : null,
        gradedCount: e?.n ?? 0,
      };
    });
    rows.sort((a, b) => a.ratePercent - b.ratePercent);
    return rows;
  }

  /** FR-04 (US3): điểm TB chuẩn hóa theo từng dimension trên mọi grading trong khoảng. Union các
   * dimension xuất hiện; gradedCount chỉ đếm grading có dimension đó. Sắp tăng dần (kỹ năng yếu nhất
   * lên đầu). Mảng rỗng nếu không có grading (AC-04.3). */
  async dimensionBreakdown(from: Date, to: Date): Promise<DimensionRow[]> {
    const gradings = await this.fetchGradingsInRange(from, to);
    const byDim = new Map<string, { sum: number; n: number }>();
    for (const g of gradings) {
      if (!g.scores || typeof g.scores !== 'object') continue;
      for (const dim of Object.keys(g.scores as object)) {
        const raw = dimensionScore(g.scores, dim);
        if (raw === null) continue;
        const e = byDim.get(dim) ?? { sum: 0, n: 0 };
        e.sum += (raw / g.bandMax) * 100;
        e.n += 1;
        byDim.set(dim, e);
      }
    }
    const rows: DimensionRow[] = Array.from(byDim.entries()).map(([dimension, { sum, n }]) => ({
      dimension,
      avgScorePct: round1(sum / n),
      gradedCount: n,
    }));
    rows.sort((a, b) => a.avgScorePct - b.avgScorePct);
    return rows;
  }

  /** FR-05 (US4): snapshot tồn đọng chờ duyệt (BR-03 — luôn hiện tại, KHÔNG lọc theo khoảng).
   * oldestWaitingHours = số giờ nguyên kể từ receivedAt cũ nhất; null khi count==0 (AC-05.2). */
  async pendingReview(): Promise<PendingReviewSummary> {
    const rows = await this.prisma.submission.findMany({
      where: { status: 'awaiting_review' },
      select: { id: true, receivedAt: true },
      orderBy: { receivedAt: 'asc' },
    });
    if (rows.length === 0) {
      return { count: 0, oldestWaitingHours: null, oldestSubmissionId: null };
    }
    const oldest = rows[0];
    const hours = Math.max(0, Math.floor((Date.now() - oldest.receivedAt.getTime()) / 3600000));
    return { count: rows.length, oldestWaitingHours: hours, oldestSubmissionId: oldest.id };
  }
}
