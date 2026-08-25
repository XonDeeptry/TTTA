import { Injectable, NotFoundException } from '@nestjs/common';
import { Grading } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { EventsService } from '../events/events.service';
import { buildReplyButtons } from '../lib/outbound-buttons';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';

/** Kiểm duyệt (mục 3.7 phân hệ 3, Tranh luận 4): giáo viên sửa nhận xét rồi bấm gửi. */
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
   * F11 FR-08: đây là đường gửi CHÍNH (`classes_config.autoSend` mặc định false), nên nút "Em đã
   * xem"/"Nhờ cô giải thích" phải gắn ở ĐÂY chứ không chỉ ở nhánh auto-send của worker. Rubric
   * hỏng/thiếu ⇒ gửi text thuần như trước F11, không bao giờ 500 (AC-08.4).
   */
  async send(id: number): Promise<Grading> {
    const grading = await this.prisma.grading.findUnique({
      where: { id },
      include: { submission: true, criteria: true },
    });
    if (!grading) throw new NotFoundException('grading not found');

    const text = grading.reviewedFeedback ?? grading.llmFeedback;
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
