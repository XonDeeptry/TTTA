import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Grading, Prisma } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { normalizeRubric, RubricV2 } from '../criteria/rubric-schema';
import { EventsService } from '../events/events.service';
import { buildReplyButtons } from '../lib/outbound-buttons';
import { computeTotal } from '../lib/rubric-scoring';
import { renderStudentMessage } from '../lib/student-message';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';
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
        }));
    }
    out[dim.key] = item;
  }
  return out;
}

/** Kiểm duyệt (mục 3.7 phân hệ 3, Tranh luận 4): giáo viên sửa kết quả rồi bấm gửi. */
@Injectable()
export class GradingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
    private readonly events: EventsService,
  ) {}

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
      include: { submission: true, criteria: true },
    });
    if (!grading) throw new NotFoundException('grading not found');

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
    return this.prisma.grading.update({ where: { id }, data: { sentAt: new Date() } });
  }
}
