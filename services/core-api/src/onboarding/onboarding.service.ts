import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZaloBinding } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { MessageTemplatesService } from '../message-templates/message-templates.service';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';
import { KNOWN_USERS_KEY, RedisService } from '../redis.service';

/**
 * Zalo trả SĐT ở dạng có mã quốc gia (`84987654321`), còn `students.phone` lưu dạng nội địa
 * (`0987654321`). Không chuẩn hóa thì phép so khớp KHÔNG BAO GIỜ đúng — và nó sẽ hỏng một cách
 * im lặng: học viên bấm chia sẻ, hệ thống nhận số, rồi vẫn để họ nằm chờ mãi.
 */
export function normalizeVnPhone(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits === '' || Number(digits) === 0) return null;
  if (digits.startsWith('84')) return `0${digits.slice(2)}`;
  if (digits.startsWith('0')) return digits;
  return `0${digits}`;
}

/** Hồ sơ Zalo kèm theo mỗi dòng chờ kích hoạt; mọi trường có thể vắng khi Zalo không trả lời. */
export interface ZaloProfile {
  zaloDisplayName?: string | null;
  zaloAvatar?: string | null;
  /** Chỉ có khi học viên đã CHỦ ĐỘNG chia sẻ SĐT qua Zalo. Là gợi ý, không phải căn cứ tự động. */
  zaloSharedPhone?: string | null;
}

export type PendingBinding = ZaloBinding & ZaloProfile;

/**
 * ChoGan (mục 3.6): worker (M3) gọi ensureBinding khi thấy zalo_user_id chưa có binding;
 * tư vấn xem danh sách pending trên dashboard rồi điền SĐT để kích hoạt.
 */
@Injectable()
export class OnboardingService implements OnModuleInit {
  private readonly logger = new Logger(OnboardingService.name);
  /** injectable để test — mặc định fetch toàn cục của Node (cùng khuôn TokenService của gateway) */
  fetchFn: typeof fetch = fetch;
  /** `undefined` = chưa hỏi lần nào; `null` = đã hỏi và Zalo không trả (đừng hỏi lại liên tục). */
  private oaAvatarCache: string | null | undefined;

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
    // Chỉ hỏi ĐÚNG MỘT LẦN, tại thời điểm binding vừa sinh ra (kể cả khi sự kiện là `follow` —
    // học viên không cần nhắn gì cả). KHÔNG await: grading-worker đang chờ lời gọi này trên
    // đường nóng, và một lượt gọi Zalo chậm không được phép giữ chân nó. Lỗi thì ghi log, binding
    // vẫn tồn tại và tư vấn vẫn kích hoạt tay được như trước.
    void this.requestPhoneShare(zaloUserId).catch((err: Error) => {
      this.logger.warn(`Không gửi được lời mời chia sẻ SĐT tới ${zaloUserId}: ${err.message}`);
    });
    return [created];
  }

  /**
   * `image_url` là BẮT BUỘC với template `request_user_info` — thiếu nó Zalo trả
   * `-201 image_url is not valid` và tin đi hết 3 lần retry rồi vào DLQ (đã gặp thật 2026-09-06).
   *
   * Không hardcode: lấy ảnh đại diện của chính OA qua `oa/getoa`. Ảnh đó do Zalo host nên chắc
   * chắn hợp lệ, và tự đúng với mọi OA mà không cần ai cấu hình. Cache trong tiến trình vì nó
   * gần như không đổi; hỏng thì thôi không gửi, chứ KHÔNG gửi một tin biết trước sẽ lỗi.
   */
  private async resolveRequestInfoImage(accessToken: string): Promise<string | null> {
    if (this.oaAvatarCache !== undefined) return this.oaAvatarCache;
    try {
      const res = await this.fetchFn('https://openapi.zalo.me/v2.0/oa/getoa', {
        headers: { access_token: accessToken },
      });
      const body = (await res.json()) as { error?: number; data?: { avatar?: unknown } };
      const avatar = body.error === 0 && typeof body.data?.avatar === 'string' ? body.data.avatar : null;
      this.oaAvatarCache = avatar;
      return avatar;
    } catch (err) {
      this.logger.warn(`Không lấy được ảnh đại diện OA: ${(err as Error).message}`);
      return null;
    }
  }

  private async requestPhoneShare(zaloUserId: string): Promise<void> {
    const accessToken = await this.redis.client.get('zalo:access_token').catch(() => null);
    if (!accessToken) return;
    const imageUrl = await this.resolveRequestInfoImage(accessToken);
    if (!imageUrl) {
      this.logger.warn(
        `Bỏ qua lời mời chia sẻ SĐT cho ${zaloUserId}: chưa có ảnh đại diện OA mà Zalo lại bắt buộc image_url`,
      );
      return;
    }
    const message: OutboundMessage = {
      v: 1,
      zaloUserId,
      // `text` là bản dự phòng đọc được nếu client không dựng nổi template.
      text: 'Em bấm chia sẻ số điện thoại để trung tâm ghép đúng tài khoản học viên nhé.',
      requestUserInfo: {
        title: 'Xác thực học viên ILM',
        subtitle:
          'Em bấm chia sẻ số điện thoại đã đăng ký với trung tâm để hệ thống ghép đúng tài khoản ' +
          'và bắt đầu gửi nhận xét bài nói cho em nhé.',
        imageUrl,
      },
    };
    this.rabbit.publish(Q_OUTBOUND, message);
  }

  /**
   * Tự kích hoạt binding khi học viên ĐÃ chia sẻ SĐT qua Zalo.
   *
   * Ranh giới an toàn — chỉ tự động khi khớp ĐÚNG MỘT học viên:
   *  - 0 học viên  ⇒ để nguyên chờ tư vấn (số chia sẻ không có trong CRM)
   *  - >1 học viên ⇒ để nguyên chờ tư vấn (anh chị em dùng chung SĐT phụ huynh — mô hình một
   *    Zalo nhiều học viên là CÓ THẬT ở đây, máy không được tự chọn hộ)
   * Tự ghép sai còn tệ hơn để chờ: nhận xét sẽ bay sang nhầm người.
   */
  @Cron('0 */2 * * * *')
  async autoActivateFromSharedPhone(): Promise<void> {
    const accessToken = await this.redis.client.get('zalo:access_token').catch(() => null);
    if (!accessToken) return;
    const rows = await this.prisma.zaloBinding.findMany({ where: { status: 'pending' } });
    if (rows.length === 0) return;

    for (const row of rows) {
      const { zaloSharedPhone } = await this.fetchZaloProfile(accessToken, row.zaloUserId);
      if (!zaloSharedPhone) continue;

      const matches = await this.prisma.student.findMany({ where: { phone: zaloSharedPhone } });
      if (matches.length !== 1) {
        this.logger.warn(
          `Zalo ${row.zaloUserId} chia sẻ SĐT ${zaloSharedPhone} nhưng khớp ${matches.length} học viên — để tư vấn xử lý tay`,
        );
        continue;
      }
      await this.activate(row.id, zaloSharedPhone);
      this.logger.log(`Tự kích hoạt ${row.zaloUserId} → học viên ${matches[0].code} qua SĐT đã chia sẻ`);
    }
  }

  /**
   * Danh sách chờ kích hoạt, LÀM GIÀU bằng hồ sơ Zalo (tên hiển thị + ảnh).
   *
   * Vì sao cần: webhook Zalo chỉ cho một mã ẩn danh kiểu `622991356594920384`. Tư vấn nhìn vào
   * đó thì không thể biết đây là học viên nào để nhập đúng số điện thoại — luồng ChoGan trên
   * giấy thì chạy, nhưng trên màn hình thì bế tắc. `oa/user/detail` trả về `display_name` và
   * `avatar`, đủ để đối chiếu với danh sách lớp.
   *
   * BEST-EFFORT: Zalo lỗi/hết token thì vẫn trả danh sách như cũ, chỉ thiếu tên. Không bao giờ
   * để một lượt gọi ra ngoài làm chết màn hình vận hành.
   */
  async listPending(): Promise<PendingBinding[]> {
    const rows = await this.prisma.zaloBinding.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    const accessToken = await this.redis.client.get('zalo:access_token').catch(() => null);
    if (!accessToken || rows.length === 0) return rows;

    return Promise.all(
      rows.map(async (row) => {
        const profile = await this.fetchZaloProfile(accessToken, row.zaloUserId);
        return { ...row, ...profile };
      }),
    );
  }

  private async fetchZaloProfile(accessToken: string, zaloUserId: string): Promise<ZaloProfile> {
    try {
      const url = new URL('https://openapi.zalo.me/v3.0/oa/user/detail');
      url.searchParams.set('data', JSON.stringify({ user_id: zaloUserId }));
      const res = await this.fetchFn(url.toString(), { headers: { access_token: accessToken } });
      const body = (await res.json()) as { error?: number; data?: Record<string, unknown> };
      if (body.error !== 0 || !body.data) return {};
      const shared = body.data.shared_info as { phone?: unknown; name?: unknown } | undefined;
      // `shared_info.phone` chỉ khác 0 khi học viên đã CHỦ ĐỘNG chia sẻ qua Zalo. Có thì coi như
      // gợi ý điền sẵn cho tư vấn, KHÔNG tự kích hoạt: khớp SĐT vẫn phải do người quyết định.
      const sharedPhone = normalizeVnPhone(shared?.phone as string | number | undefined);
      return {
        zaloDisplayName: typeof body.data.display_name === 'string' ? body.data.display_name : null,
        zaloAvatar: typeof body.data.avatar === 'string' ? body.data.avatar : null,
        zaloSharedPhone: sharedPhone,
      };
    } catch (err) {
      this.logger.warn(`Không lấy được hồ sơ Zalo của ${zaloUserId}: ${(err as Error).message}`);
      return {};
    }
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
