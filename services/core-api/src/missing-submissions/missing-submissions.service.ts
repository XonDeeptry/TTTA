import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Student } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { startOfDay } from '../lib/date';
import { MessageTemplatesService } from '../message-templates/message-templates.service';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';

const UNASSIGNED_CLASS = '(chưa gán lớp)';

/**
 * Báo chưa nộp cuối ngày (mục 3.6): chỉ gửi tư vấn theo lớp, KHÔNG BAO GIỜ nhắn học sinh
 * hay phụ huynh (ranh giới cứng từ Foundation — xem root CLAUDE.md).
 */
@Injectable()
export class MissingSubmissionsService {
  private readonly logger = new Logger(MissingSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
    private readonly templates: MessageTemplatesService,
  ) {}

  @Cron('0 30 20 * * *')
  async reportNow(): Promise<void> {
    const today = startOfDay(new Date());
    const scheduled = await this.prisma.assignmentCalendar.findUnique({ where: { date: today } });
    if (!scheduled) {
      this.logger.debug('Hôm nay không có trong assignment_calendar — bỏ qua báo cáo');
      return;
    }

    const students = await this.prisma.student.findMany({ where: { status: 'active' } });
    const submittedToday = await this.prisma.submission.findMany({
      where: { receivedAt: { gte: today }, studentId: { not: null } },
      select: { studentId: true },
    });
    const submittedIds = new Set(submittedToday.map((s) => s.studentId));
    const missing = students.filter((s) => !submittedIds.has(s.id));

    const byClass = new Map<string, Student[]>();
    for (const s of missing) {
      const className = s.className ?? UNASSIGNED_CLASS;
      byClass.set(className, [...(byClass.get(className) ?? []), s]);
    }

    for (const [className, list] of byClass) {
      const config = await this.prisma.classConfig.findUnique({ where: { className } });
      if (!config) {
        this.logger.warn(`Lớp "${className}" chưa có classes_config.advisor_zalo_id — không gửi được báo cáo`);
        continue;
      }
      const names = list.map((s) => s.fullName).join(', ');
      const text = await this.templates.render('missing_submission.report', 'vi', {
        className,
        count: String(list.length),
        names,
      });
      const message: OutboundMessage = { v: 1, zaloUserId: config.advisorZaloId, templateKey: 'missing_submission.report', text };
      this.rabbit.publish(Q_OUTBOUND, message);
    }
  }
}
