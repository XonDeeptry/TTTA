import { Injectable, NotFoundException } from '@nestjs/common';
import { ZaloBinding } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { MessageTemplatesService } from '../message-templates/message-templates.service';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';

/**
 * ChoGan (mục 3.6): worker (M3) gọi ensureBinding khi thấy zalo_user_id chưa có binding;
 * tư vấn xem danh sách pending trên dashboard rồi điền SĐT để kích hoạt.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
    private readonly templates: MessageTemplatesService,
  ) {}

  /** Upsert-if-absent — hỗ trợ một Zalo nhiều học viên (trả về mọi binding của user đó). */
  async ensureBinding(zaloUserId: string, displayName?: string): Promise<ZaloBinding[]> {
    const existing = await this.prisma.zaloBinding.findMany({ where: { zaloUserId } });
    if (existing.length > 0) return existing;
    const created = await this.prisma.zaloBinding.create({
      data: { zaloUserId, displayName, status: 'pending' },
    });
    return [created];
  }

  listPending(): Promise<ZaloBinding[]> {
    return this.prisma.zaloBinding.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' } });
  }

  async activate(id: number, phone: string): Promise<ZaloBinding> {
    const binding = await this.prisma.zaloBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException('binding not found');

    const student = await this.prisma.student.findFirst({ where: { phone } });
    if (!student) throw new NotFoundException('no student with that phone number');

    const updated = await this.prisma.zaloBinding.update({
      where: { id },
      data: { studentId: student.id, phoneEntered: phone, status: 'active' },
    });

    const text = await this.templates.render('zalo_binding.activated', 'vi', { name: student.fullName });
    const message: OutboundMessage = { v: 1, zaloUserId: binding.zaloUserId, templateKey: 'zalo_binding.activated', text };
    this.rabbit.publish(Q_OUTBOUND, message);

    return updated;
  }
}
