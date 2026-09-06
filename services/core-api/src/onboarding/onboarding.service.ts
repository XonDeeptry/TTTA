import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ZaloBinding } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { MessageTemplatesService } from '../message-templates/message-templates.service';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';
import { KNOWN_USERS_KEY, RedisService } from '../redis.service';

/**
 * ChoGan (mục 3.6): worker (M3) gọi ensureBinding khi thấy zalo_user_id chưa có binding;
 * tư vấn xem danh sách pending trên dashboard rồi điền SĐT để kích hoạt.
 */
@Injectable()
export class OnboardingService implements OnModuleInit {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
    private readonly templates: MessageTemplatesService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Mirror danh sách Zalo user ĐÃ kích hoạt sang Redis để gateway phân biệt được học viên với
   * người lạ — cùng khuôn `SettingsService.onModuleInit`. Postgres vẫn là nguồn sự thật; Redis
   * chỉ là bản sao đọc, dựng lại từ đầu mỗi lần khởi động nên không bao giờ trôi khỏi DB.
   *
   * Vì sao gateway không tự hỏi: nó nằm trên đường nóng phải ACK Zalo trong vài mili-giây
   * (mục 3.5) và cố ý KHÔNG chạm Postgres — thêm một lượt HTTP vào đó là đánh đổi sai.
   */
  async onModuleInit(): Promise<void> {
    const active = await this.prisma.zaloBinding.findMany({
      where: { status: 'active' },
      select: { zaloUserId: true },
    });
    const ids = [...new Set(active.map((b) => b.zaloUserId))];
    await this.redis.replaceKnownUsers(ids);
    this.logger.log(`Mirrored ${ids.length} Zalo user đã kích hoạt sang ${KNOWN_USERS_KEY}`);
  }

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

    // Từ giây phút này user không còn là "người lạ" với gateway nữa. Redis hỏng KHÔNG được làm
    // hỏng việc kích hoạt (binding đã ghi Postgres xong rồi) — hạ cấp về một dòng cảnh báo, và
    // lần khởi động sau `onModuleInit` sẽ dựng lại danh sách đầy đủ.
    await this.redis.addKnownUser(binding.zaloUserId).catch((err) => {
      this.logger.warn(`Không mirror được ${binding.zaloUserId} sang Redis: ${(err as Error).message}`);
    });

    const text = await this.templates.render('zalo_binding.activated', 'vi', { name: student.fullName });
    const message: OutboundMessage = { v: 1, zaloUserId: binding.zaloUserId, templateKey: 'zalo_binding.activated', text };
    this.rabbit.publish(Q_OUTBOUND, message);

    return updated;
  }
}
