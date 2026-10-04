import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Grading, Prisma } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { normalizeRubric, RubricV2 } from '../criteria/rubric-schema';
import { EventsService } from '../events/events.service';
import { buildReplyButtons } from '../lib/outbound-buttons';
import { computeTotal } from '../lib/rubric-scoring';
import { renderStudentMessage } from '../lib/student-message';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';
import { RedisService } from '../redis.service';
import { outboundWindow } from '../lib/zalo-window';
import { UpdateGradingDto } from './dto/update-grading.dto';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Làm sạch bản giáo viên sửa theo rubric của CHÍNH bài chấm (ILM-Clone D153): chỉ giữ tiêu chí có
 * trong rubric, điểm phải là số trong thang, các trường chữ là chuỗi. Trường lạ bị bỏ — bản sửa
 * đi thẳng vào tin nhắn học viên, nên không cho dữ liệu tùy ý lọt qua.
 */
export function sanitizeReviewedScores(rubric: RubricV2, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const { min, max } = rubric.scale;
  for (const dim of rubric.dimensions) {
    const entry = raw[dim.key];
    if (!isRecord(entry)) continue;
    const score = entry.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < min || score > max) {
      throw new BadRequestException(`Điểm "${dim.label || dim.key}" phải là số từ ${min} đến ${max}`);
    }
    const item: Record<string, unknown> = { score, comment: typeof entry.comment === 'string' ? entry.comment : '' };
    if (typeof entry.fix === 'string') item.fix = entry.fix;
    if (Array.isArray(entry.mispronounced_words)) {
      item.mispronounced_words = entry.mispronounced_words
        .filter(isRecord)
        .filter((w) => typeof w.word === 'string' && w.word.trim() !== '')
        .map((w) => ({
          word: w.word,
          heard_as: typeof w.heard_as === 'string' ? w.heard_as : '',
          suggestion: typeof w.suggestion === 'string' ? w.suggestion : '',
          ...(typeof w.approx_position_sec === 'number' && Number.isFinite(w.approx_position_sec)
            ? { approx_position_sec: w.approx_position_sec }
            : {}),
          // Khoảng thời gian đo bằng Azure — hệ thống phía sau cần, giáo viên sửa gợi ý không được làm mất.
          ...(typeof w.start_sec === 'number' && Number.isFinite(w.start_sec) ? { start_sec: w.start_sec } : {}),
          ...(typeof w.end_sec === 'number' && Number.isFinite(w.end_sec) ? { end_sec: w.end_sec } : {}),
          // Kết quả nghe lại đoạn lỗi (grading-worker `clip_analysis.py`) — giữ nguyên khi giáo viên lưu.
          // "teacher" = giáo viên thêm từ AI bỏ sót (ILM 09-15) — cần để ghi log `added` khi Gửi.
          ...(w.source === 'azure' || w.source === 'gemini' || w.source === 'teacher' ? { source: w.source } : {}),
          ...(typeof w.issue === 'string' && w.issue ? { issue: w.issue } : {}),
          ...(typeof w.needs_review === 'boolean' ? { needs_review: w.needs_review } : {}),
          ...(typeof w.gemini_confirmed === 'boolean' ? { gemini_confirmed: w.gemini_confirmed } : {}),
        }));
    }
    out[dim.key] = item;
  }
  return out;
}

const normWord = (w: unknown): string =>
  String(w ?? '')
    .trim()
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
    .toLowerCase();

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Tra số đo Azure của một từ trong `gradings.assessment` (dòng thời gian mọi từ, rồi danh sách lỗi):
 * cùng chữ, lần xuất hiện có mốc gần `startSec` nhất trong `toleranceSec`. Không thấy ⇒ null.
 */
export function findAzureWord(
  assessment: unknown,
  word: string,
  startSec: number | null,
  toleranceSec = 0.05,
): { accuracy: number | null; errorType: string | null } | null {
  if (!isRecord(assessment)) return null;
  const target = normWord(word);
  let best: { item: Record<string, unknown>; distance: number } | null = null;
  for (const pool of [assessment.words, assessment.errors]) {
    if (!Array.isArray(pool)) continue;
    for (const item of pool) {
      if (!isRecord(item) || normWord(item.word) !== target) continue;
      const start = num(item.start_sec);
      const distance = startSec === null || start === null ? 0 : Math.abs(start - startSec);
      if (distance > toleranceSec) continue;
      if (!best || distance < best.distance) best = { item, distance };
    }
    if (best) break;
  }
  if (!best) return null;
  return {
    accuracy: num(best.item.accuracy),
    errorType: typeof best.item.error_type === 'string' ? best.item.error_type : null,
  };
}

export type WordOutcome = 'kept' | 'removed' | 'added';

export type WordReviewRow = Omit<Prisma.WordReviewLogCreateManyInput, 'gradingId' | 'submissionId' | 'courseCode' | 'reviewedBy'>;

function mispronouncedOf(scores: unknown, dimension: string): Record<string, unknown>[] {
  if (!isRecord(scores)) return [];
  const dim = scores[dimension];
  if (!isRecord(dim) || !Array.isArray(dim.mispronounced_words)) return [];
  return dim.mispronounced_words.filter(isRecord).filter((w) => normWord(w.word) !== '');
}

const wordStart = (w: Record<string, unknown>): number | null => num(w.start_sec) ?? num(w.approx_position_sec);
const wordIdentity = (w: Record<string, unknown>): string => `${normWord(w.word)}@${wordStart(w) ?? ''}`;

/**
 * ILM 09-15 — so danh sách từ phát âm sai của AI (`scores`) với bản giáo viên gửi đi:
 * AI đánh dấu mà còn trong bản gửi ⇒ `kept`; AI đánh dấu mà giáo viên "Gắn sai" bỏ đi ⇒ `removed`;
 * có trong bản gửi mà AI không đánh dấu (giáo viên thêm) ⇒ `added`. Khớp theo chữ + mốc bắt đầu — giao
 * diện không cho sửa chữ hay mốc của từ AI, nên sửa gợi ý không làm từ bị tính là bỏ.
 */
export function buildWordReviewRows(aiScores: unknown, finalScores: unknown, assessment: unknown): WordReviewRow[] {
  const dimensions = new Set([...Object.keys(isRecord(aiScores) ? aiScores : {}), ...Object.keys(isRecord(finalScores) ? finalScores : {})]);
  const rows: WordReviewRow[] = [];
  const toRow = (dimension: string, outcome: WordOutcome, w: Record<string, unknown>): WordReviewRow => {
    const startSec = wordStart(w);
    // Từ giáo viên thêm có mốc theo chỗ dừng audio — cho lệch tới 1,5 s khi tra số đo Azure.
    const azure = findAzureWord(assessment, String(w.word), startSec, outcome === 'added' ? 1.5 : 0.05);
    return {
      dimension,
      outcome,
      word: String(w.word).trim(),
      startSec,
      endSec: num(w.end_sec),
      source: typeof w.source === 'string' ? w.source : null,
      needsReview: typeof w.needs_review === 'boolean' ? w.needs_review : null,
      geminiConfirmed: typeof w.gemini_confirmed === 'boolean' ? w.gemini_confirmed : null,
      heardAs: typeof w.heard_as === 'string' && w.heard_as ? w.heard_as : null,
      azureAccuracy: azure?.accuracy ?? null,
      azureErrorType: azure?.errorType ?? null,
    };
  };
  for (const dimension of dimensions) {
    const remaining = mispronouncedOf(finalScores, dimension);
    for (const aiWord of mispronouncedOf(aiScores, dimension)) {
      const index = remaining.findIndex((f) => f.source !== 'teacher' && wordIdentity(f) === wordIdentity(aiWord));
      if (index >= 0) remaining.splice(index, 1);
      rows.push(toRow(dimension, index >= 0 ? 'kept' : 'removed', aiWord));
    }
    for (const added of remaining) rows.push(toRow(dimension, 'added', added));
  }
  return rows;
}

export interface WordReviewStats {
  days: number;
  gradings: number;
  kept: number;
  removed: number;
  added: number;
  /** giữ / AI đánh dấu — AI đánh dấu đúng bao nhiêu phần. */
  aiPrecision: number | null;
  /** giữ / giáo viên xác định — AI bắt được bao nhiêu phần số từ giáo viên cho là sai. */
  aiCoverage: number | null;
  bySource: { source: string; kept: number; removed: number; aiPrecision: number | null }[];
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function summarizeWordReview(
  days: number,
  gradings: number,
  groups: { outcome: string; source: string | null; count: number }[],
): WordReviewStats {
  const total = (outcome: WordOutcome) => groups.filter((g) => g.outcome === outcome).reduce((s, g) => s + g.count, 0);
  const kept = total('kept');
  const removed = total('removed');
  const added = total('added');
  const sources = new Map<string, { kept: number; removed: number }>();
  for (const g of groups) {
    if (g.outcome === 'added') continue;
    const key = g.source ?? 'other';
    const entry = sources.get(key) ?? { kept: 0, removed: 0 };
    if (g.outcome === 'kept') entry.kept += g.count;
    if (g.outcome === 'removed') entry.removed += g.count;
    sources.set(key, entry);
  }
  return {
    days,
    gradings,
    kept,
    removed,
    added,
    aiPrecision: ratio(kept, kept + removed),
    aiCoverage: ratio(kept, kept + added),
    bySource: [...sources.entries()].map(([source, v]) => ({ source, ...v, aiPrecision: ratio(v.kept, v.kept + v.removed) })),
  };
}

/** Kiểm duyệt (mục 3.7 phân hệ 3, Tranh luận 4): giáo viên sửa kết quả rồi bấm gửi. */
@Injectable()
export class GradingsService {
  private readonly logger = new Logger(GradingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
    private readonly events: EventsService,
    private readonly redis: RedisService,
  ) {}

  /** ILM 09-15: AI ↔ giáo viên trên từ phát âm sai, `days` ngày gần nhất. */
  async wordReviewStats(days = 30): Promise<WordReviewStats> {
    const window = Math.min(Math.max(1, Math.floor(days)), 365);
    const where = { createdAt: { gte: new Date(Date.now() - window * 86_400_000) } };
    const [groups, gradings] = await Promise.all([
      this.prisma.wordReviewLog.groupBy({ by: ['outcome', 'source'], where, _count: { _all: true } }),
      this.prisma.wordReviewLog.findMany({ where, distinct: ['gradingId'], select: { gradingId: true } }),
    ]);
    return summarizeWordReview(
      window,
      gradings.length,
      groups.map((g) => ({ outcome: g.outcome, source: g.source, count: g._count._all })),
    );
  }

  reviewFeedback(id: number, reviewedFeedback: string, reviewedBy: string): Promise<Grading> {
    return this.prisma.grading.update({ where: { id }, data: { reviewedFeedback, reviewedBy } });
  }

  /**
   * D153: lưu bản giáo viên sửa — nhận xét chung và/hoặc từng tiêu chí. `scores` (AI) không bao giờ
   * bị đụng tới. Bài đã gửi thì không sửa được: tin học viên đã nhận không được lệch với bản lưu.
   */
  async review(id: number, dto: UpdateGradingDto, reviewedBy: string): Promise<Grading> {
    const grading = await this.prisma.grading.findUnique({ where: { id }, include: { criteria: true } });
    if (!grading) throw new NotFoundException('grading not found');
    if (grading.sentAt) throw new BadRequestException('Bài đã gửi cho học viên — không sửa được nữa');

    const data: Prisma.GradingUpdateInput = { reviewedBy, reviewedAt: new Date() };
    if (dto.reviewedFeedback !== undefined) {
      data.reviewedFeedback = dto.reviewedFeedback.trim() ? dto.reviewedFeedback : null;
    }
    if (dto.reviewedScores !== undefined) {
      const clean = sanitizeReviewedScores(normalizeRubric(grading.criteria?.rubric), dto.reviewedScores);
      data.reviewedScores = Object.keys(clean).length > 0 ? (clean as Prisma.InputJsonValue) : Prisma.DbNull;
    }
    return this.prisma.grading.update({ where: { id }, data });
  }

  /**
   * F11 FR-08: đây là đường gửi CHÍNH (`classes_config.autoSend` mặc định false), nên nút "Em đã
   * xem"/"Nhờ cô giải thích" phải gắn ở ĐÂY chứ không chỉ ở nhánh auto-send của worker. Rubric
   * hỏng/thiếu ⇒ gửi text thuần như trước F11, không bao giờ 500 (AC-08.4).
   *
   * D153: có bản đang sửa trong body ⇒ LƯU TRƯỚC rồi gửi — trước đây bấm Gửi mà quên Lưu thì học
   * viên nhận bản AI. Tin nhắn luôn dựng từ bản giáo viên đã sửa, chỉ rơi về bản AI khi chưa sửa.
   */
  async send(id: number, dto?: UpdateGradingDto, reviewedBy = 'unknown'): Promise<Grading> {
    if (dto && (dto.reviewedFeedback !== undefined || dto.reviewedScores !== undefined)) {
      await this.review(id, dto, reviewedBy);
    }
    const grading = await this.prisma.grading.findUnique({
      where: { id },
      include: { submission: true, criteria: { include: { course: true } } },
    });
    if (!grading) throw new NotFoundException('grading not found');
    const firstSend = !grading.sentAt;

    // Sự cố 2026-09-29: quá 48h thì gateway CHẶN nhưng bài vẫn bị đặt `sent` — học viên không nhận
    // gì mà dashboard báo đã gửi. Kiểm tra cùng quy tắc với gateway TRƯỚC khi publish; bản sửa ở
    // trên vẫn được lưu, chỉ việc gửi bị từ chối (409) để giáo viên biết mà báo tư vấn.
    const sendWindow = await outboundWindow(this.redis.client, grading.submission.zaloUserId);
    if (!sendWindow.allowed) {
      throw new ConflictException({
        code: 'outside_48h',
        message: 'outside the 48h Zalo window — the student must message the OA again first',
        lastInboundAt: sendWindow.lastInboundMs === null ? null : new Date(sendWindow.lastInboundMs).toISOString(),
      });
    }

    const rubric = normalizeRubric(grading.criteria?.rubric);
    const scores = grading.reviewedScores ?? grading.scores;
    const text = renderStudentMessage(rubric, {
      feedback: grading.reviewedFeedback ?? grading.llmFeedback,
      scores,
      totalScore: grading.totalScore,
      totalMax: computeTotal(rubric, scores).max || null,
      levelLabel: grading.levelLabel,
    });
    const buttons = buildReplyButtons(grading.criteria?.rubric, grading.id);
    const message: OutboundMessage = {
      v: 1,
      zaloUserId: grading.submission.zaloUserId,
      submissionId: String(grading.submissionId),
      text,
    };
    if (buttons.length > 0) message.buttons = buttons; // rỗng ⇒ KHÔNG có khóa `buttons` trên wire
    this.rabbit.publish(Q_OUTBOUND, message);

    const updated = await this.prisma.submission.update({
      where: { id: grading.submissionId },
      data: { status: 'sent' },
    });
    this.events.publishStatus(updated.id, updated.status); // F6: SSE realtime, sau khi ghi resolve
    if (firstSend) await this.logWordReview(grading, reviewedBy);
    return this.prisma.grading.update({ where: { id }, data: { sentAt: new Date() } });
  }

  /**
   * ILM 09-15: ghi giữ / gắn sai / thêm cho từng từ phát âm sai — một lần, ở lần Gửi đầu tiên, khi bản
   * gửi đã chốt. Lỗi ghi log KHÔNG được chặn tin đã gửi cho học viên.
   */
  private async logWordReview(
    grading: Grading & { criteria?: { course?: { key: string } | null } | null },
    reviewedBy: string,
  ): Promise<void> {
    try {
      const rows = buildWordReviewRows(grading.scores, grading.reviewedScores ?? grading.scores, grading.assessment);
      if (rows.length === 0) return;
      await this.prisma.wordReviewLog.createMany({
        data: rows.map((row) => ({
          ...row,
          gradingId: grading.id,
          submissionId: grading.submissionId,
          courseCode: grading.criteria?.course?.key ?? null,
          reviewedBy,
        })),
      });
    } catch (err) {
      this.logger.warn(`word review log failed for grading ${grading.id}: ${(err as Error).message}`);
    }
  }
}
