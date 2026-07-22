import { Injectable, NotFoundException } from '@nestjs/common';
import { Grading } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';

/** Kiểm duyệt (mục 3.7 phân hệ 3, Tranh luận 4): giáo viên sửa nhận xét rồi bấm gửi. */
@Injectable()
export class GradingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
  ) {}

  reviewFeedback(id: number, reviewedFeedback: string, reviewedBy: string): Promise<Grading> {
    return this.prisma.grading.update({ where: { id }, data: { reviewedFeedback, reviewedBy } });
  }

  async send(id: number): Promise<Grading> {
    const grading = await this.prisma.grading.findUnique({
      where: { id },
      include: { submission: true },
    });
    if (!grading) throw new NotFoundException('grading not found');

    const text = grading.reviewedFeedback ?? grading.llmFeedback;
    const message: OutboundMessage = {
      v: 1,
      zaloUserId: grading.submission.zaloUserId,
      submissionId: String(grading.submissionId),
      text,
    };
    this.rabbit.publish(Q_OUTBOUND, message);

    await this.prisma.submission.update({ where: { id: grading.submissionId }, data: { status: 'sent' } });
    return this.prisma.grading.update({ where: { id }, data: { sentAt: new Date() } });
  }
}
