import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZaloBinding } from '@prisma/client';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { MessageTemplatesService } from '../message-templates/message-templates.service';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';
import { recordZaloCall } from '../lib/zalo-call-counter';
import { KNOWN_USERS_KEY, RedisService } from '../redis.service';

/**
 * Lịch kiểm tra lại một người đang chờ kích hoạt (có chia sẻ SĐT chưa) — THƯA DẦN theo tuổi.
 *
 * Pilot 2026-09-15: cron 2 phút gọi `oa/user/detail` cho MỌI binding pending, nên 200 người chưa
 * chia sẻ = 100 lượt/phút liên tục, tự nó đã chạm trần gói Zalo 100 req/phút. Người vừa nhắn vẫn
 * được kiểm tra dày (họ thường bấm chia sẻ ngay); người để đó qua ngày thì không đốt hạn mức cả ngày.
 */
const PROFILE_CHECK_KEY = (bindingId: number) => `onboarding:profile_checked:${bindingId}`;
const PROFILE_CHECK_TTL_SEC = 7 * 24 * 3600;

/**
 * Tư vấn đã GỠ một liên kết nhầm của Zalo user này ⇒ cron KHÔNG được tự kích hoạt lại nó.
 * Gặp thật 2026-10-03: một tài khoản chia sẻ SĐT của Hoàng Hải Yến (không phải của mình) và được ghép
 * vào cô ấy. Gỡ mà không chặn thì 2 phút sau cron lại ghép đúng cái sai đó. Kích hoạt TAY xóa cờ này.
 */
const NO_AUTO_ACTIVATE_KEY = (zaloUserId: string) => `onboarding:no_auto_activate:${zaloUserId}`;

/** Binding giả của Test Upload (`test:{studentId}`) — không phải tài khoản Zalo thật. */
export const TEST_ZALO_PREFIX = 'test:';
/** Thông điệp 409 — dashboard dựa vào chuỗi này để phân biệt với 409 "SĐT trùng". */
export const STUDENT_ALREADY_LINKED = 'student is already linked to another Zalo account';

/** Bù tên/ảnh cho binding cũ: ít lượt mỗi vòng để không ăn hạn mức `oa/user/detail`. */
const PROFILE_BACKFILL_BATCH = 10;
const PROFILE_BACKFILL_KEY = (bindingId: number) => `onboarding:profile_backfill:${bindingId}`;
const PROFILE_BACKFILL_RETRY_SEC = 24 * 3600;

export function profileCheckIntervalMs(ageMs: number): number {
  if (ageMs < 3600_000) return 2 * 60_000;
  if (ageMs < 24 * 3600_000) return 15 * 60_000;
  return 60 * 60_000;
}

/** `lastCheckedMs` không đọc được (chưa từng kiểm tra) ⇒ đến lượt. Trừ 10 giây để lệch nhịp cron không làm lỡ một vòng. */
export function isDueForProfileCheck(createdAt: Date | undefined, lastCheckedMs: number, nowMs: number): boolean {
  if (!Number.isFinite(lastCheckedMs)) return true;
  const created = createdAt instanceof Date ? createdAt.getTime() : nowMs;
  return nowMs - lastCheckedMs >= profileCheckIntervalMs(nowMs - created) - 10_000;
}

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

/** Khoảng cách tối thiểu giữa hai lần CHỦ ĐỘNG mời cùng một người chia sẻ SĐT. */
const PHONE_SHARE_ASK_TTL_SEC = 24 * 3600;
/** Không lặp lại thông báo cho CÙNG một số đã bị từ chối — nhưng số khác thì báo ngay. */
const PHONE_REJECTED_TTL_SEC = 30 * 24 * 3600;

const DEFAULT_SHARE_SUBTITLE =
  'Em bấm chia sẻ số điện thoại đã đăng ký với trung tâm để hệ thống ghép đúng tài khoản ' +
  'và bắt đầu gửi nhận xét bài nói cho em nhé.';

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
    if (existing.length > 0) {
      // CHƯA xác thực ⇒ hỏi lại mỗi lần họ tương tác (tự chặn ở mức 1 lần/ngày bên trong).
      // ĐÃ có binding active ⇒ KHÔNG BAO GIỜ hỏi nữa: họ đã ghép đúng học viên rồi, hỏi thêm
      // chỉ là làm phiền.
      //
      // Vì sao không chỉ hỏi lúc TẠO binding (bản trước làm vậy): một lần gửi hỏng — hết token,
      // Zalo từ chối, mạng lỗi — sẽ khiến học viên mắc kẹt VĨNH VIỄN ở trạng thái chờ mà không
      // ai biết. Gặp thật 2026-09-06 với lỗi `image_url is not valid`.
      if (existing.every((b) => b.status !== 'active')) {
        this.tryRequestPhoneShare(zaloUserId);
      }
      return existing;
    }
    const created = await this.prisma.zaloBinding.create({
      data: { zaloUserId, displayName, status: 'pending' },
    });
    this.tryRequestPhoneShare(zaloUserId);
    return [created];
  }

  /** KHÔNG await: grading-worker đang chờ `ensureBinding` trên đường nóng, một lượt gọi Zalo
   * chậm không được phép giữ chân nó. Lỗi chỉ ghi log — binding vẫn tồn tại và tư vấn vẫn kích
   * hoạt tay được như trước. */
  private tryRequestPhoneShare(zaloUserId: string): void {
    void this.requestPhoneShare(zaloUserId).catch((err: Error) => {
      this.logger.warn(`Không gửi được lời mời chia sẻ SĐT tới ${zaloUserId}: ${err.message}`);
    });
  }

  /**
   * `image_url` là BẮT BUỘC với template `request_user_info` — thiếu nó Zalo trả
   * `-201 image_url is not valid` và tin đi hết 3 lần retry rồi vào DLQ (đã gặp thật 2026-09-06).
   *
   * Không hardcode: lấy ảnh đại diện của chính OA qua `oa/getoa`. Ảnh đó do Zalo host nên chắc
   * chắn hợp lệ, và tự đúng với mọi OA mà không cần ai cấu hình. Cache trong tiến trình vì nó
   * gần như không đổi; hỏng thì thôi không gửi, chứ KHÔNG gửi một tin biết trước sẽ lỗi.
   */
  /**
   * Báo học viên biết số họ vừa chia sẻ không có trong danh sách, kèm LỜI MỜI MỚI để sửa ngay.
   *
   * Chốt chặn chống lặp là theo TỪNG SỐ, không theo người: chia sẻ nhầm số khác thì được báo
   * tiếp, nhưng chia sẻ đi chia sẻ lại CÙNG một số sai thì không bị nhắc mãi. Nếu chốt theo
   * người thì lượt sửa thứ hai lại rơi vào im lặng — đúng cái bẫy vừa gỡ.
   */
  private async notifyPhoneNotFound(zaloUserId: string, phone: string): Promise<void> {
    const claimed = await this.redis.client
      .set(`phone_share_rejected:${zaloUserId}:${phone}`, '1', 'EX', PHONE_REJECTED_TTL_SEC, 'NX')
      .catch(() => 'OK');
    if (claimed !== 'OK') return;

    this.logger.warn(`SĐT ${phone} (Zalo ${zaloUserId}) không có trong danh sách học viên — đã báo lại để sửa`);
    await this.requestPhoneShare(
      zaloUserId,
      `Số ${phone} chưa có trong danh sách học viên của trung tâm. Em kiểm tra và chia sẻ lại ` +
        'số đã đăng ký giúp cô nhé, hoặc nhắn cho tư vấn để được hỗ trợ.',
      true, // bỏ qua hạn mức ngày: đây là lượt SỬA SAI, không phải lời mời lặp lại
    );
  }

  private async resolveRequestInfoImage(accessToken: string): Promise<string | null> {
    if (this.oaAvatarCache !== undefined) return this.oaAvatarCache;
    try {
      const res = await this.fetchFn('https://openapi.zalo.me/v2.0/oa/getoa', {
        headers: { access_token: accessToken },
      });
      const body = (await res.json()) as { error?: number; data?: { avatar?: unknown } };
      recordZaloCall(this.redis.client, 'getoa', body.error);
      const avatar = body.error === 0 && typeof body.data?.avatar === 'string' ? body.data.avatar : null;
      this.oaAvatarCache = avatar;
      return avatar;
    } catch (err) {
      this.logger.warn(`Không lấy được ảnh đại diện OA: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * @param subtitle  Nội dung hiển thị; mặc định là lời mời lần đầu.
   * @param bypassThrottle  Bỏ qua hạn mức ngày. Dùng cho lượt SỬA SAI — hạn mức sinh ra để
   *   chống spam người nhắn liên tục, KHÔNG phải để khóa một học viên chia sẻ nhầm số suốt 24
   *   giờ. Hai chuyện khác nhau; gộp chúng lại là biến một lỗi gõ nhầm thành một ngày mắc kẹt.
   */
  private async requestPhoneShare(
    zaloUserId: string,
    subtitle = DEFAULT_SHARE_SUBTITLE,
    bypassThrottle = false,
  ): Promise<void> {
    if (!bypassThrottle) {
      // TỐI ĐA 1 LẦN/NGÀY mỗi người. `SET NX EX` — cùng khuôn `claimMessage` của gateway.
      // Redis hỏng ⇒ vẫn gửi: thà trùng một tin còn hơn để họ mắc kẹt im lặng.
      const claimed = await this.redis.client
        .set(`phone_share_asked:${zaloUserId}`, '1', 'EX', PHONE_SHARE_ASK_TTL_SEC, 'NX')
        .catch(() => 'OK');
      if (claimed !== 'OK') return;
    }

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
      requestUserInfo: { title: 'Xác thực học viên ILM', subtitle, imageUrl },
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

    const now = Date.now();
    for (const row of rows) {
      const lastChecked = Number(await this.redis.client.get(PROFILE_CHECK_KEY(row.id)).catch(() => null));
      if (!isDueForProfileCheck(row.createdAt, lastChecked, now)) continue;
      // Đã bị gỡ vì ghép nhầm ⇒ chỉ người mới được kích hoạt lại (xem NO_AUTO_ACTIVATE_KEY).
      if (await this.redis.client.exists(NO_AUTO_ACTIVATE_KEY(row.zaloUserId)).catch(() => 0)) continue;
      const profile = await this.fetchZaloProfile(accessToken, row.zaloUserId);
      const { zaloSharedPhone } = profile;
      await this.redis.client
        .set(PROFILE_CHECK_KEY(row.id), String(now), 'EX', PROFILE_CHECK_TTL_SEC)
        .catch(() => undefined);
      await this.rememberProfile(row, profile);
      if (!zaloSharedPhone) continue;

      const matches = await this.prisma.student.findMany({ where: { phone: zaloSharedPhone } });
      if (matches.length === 0) {
        // Học viên chia sẻ NHẦM số (hoặc số chưa được nhập vào CRM). Trước đây chỉ ghi log rồi
        // im lặng — học viên không biết mình sai, cũng không được hỏi lại trong 24h, tức là mắc
        // kẹt vì một lỗi gõ nhầm. Báo lại NGAY kèm một lời mời mới để họ sửa được liền.
        await this.notifyPhoneNotFound(row.zaloUserId, zaloSharedPhone);
        continue;
      }
      if (matches.length > 1) {
        // Anh chị em dùng chung SĐT phụ huynh — máy KHÔNG được chọn hộ. Im lặng với học viên,
        // để tư vấn quyết định trên dashboard.
        this.logger.warn(
          `Zalo ${row.zaloUserId} chia sẻ SĐT ${zaloSharedPhone} khớp ${matches.length} học viên — để tư vấn xử lý tay`,
        );
        continue;
      }
      try {
        await this.activate(row.id, zaloSharedPhone, profile);
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        // Học viên ĐÃ gắn Zalo khác: một tài khoản thứ hai chia sẻ đúng SĐT của em — có thể là bên thứ
        // ba. Để nguyên chờ, KHÔNG nhắn gì cho người này (không xác nhận cho họ rằng SĐT có thật).
        this.logger.warn(
          `Zalo ${row.zaloUserId} chia sẻ SĐT của ${matches[0].code}, nhưng học viên đã gắn Zalo khác — để tư vấn xem xét`,
        );
        continue;
      }
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
        const saved = await this.rememberProfile(row, profile);
        return { ...saved, ...profile };
      }),
    );
  }

  /**
   * Ghi tên + ảnh Zalo vào binding để sau khi kích hoạt vẫn biết học viên gắn với tài khoản NÀO
   * (màn Học viên). Trước 2026-10-03 hồ sơ chỉ hiện ở danh sách chờ rồi bị bỏ, nên một học viên bị
   * ghép nhầm 3 tài khoản Zalo mà không ai nhận ra. Chỉ ghi khi có giá trị mới — hồ sơ Zalo trả rỗng
   * (hết hạn mức, lỗi mạng) KHÔNG được xóa tên đã lưu. Lỗi ghi chỉ là cảnh báo.
   */
  private async rememberProfile<T extends ZaloBinding>(row: T, profile: ZaloProfile): Promise<T> {
    const data: { displayName?: string; avatarUrl?: string } = {};
    if (profile.zaloDisplayName && profile.zaloDisplayName !== row.displayName) data.displayName = profile.zaloDisplayName;
    if (profile.zaloAvatar && profile.zaloAvatar !== row.avatarUrl) data.avatarUrl = profile.zaloAvatar;
    if (Object.keys(data).length === 0) return row;
    try {
      await this.prisma.zaloBinding.update({ where: { id: row.id }, data });
      return { ...row, ...data };
    } catch (err) {
      this.logger.warn(`Không lưu được hồ sơ Zalo cho binding ${row.id}: ${(err as Error).message}`);
      return row;
    }
  }

  /**
   * Bù tên/ảnh cho các binding đã kích hoạt TRƯỚC khi có `rememberProfile`. Mỗi vòng tối đa
   * PROFILE_BACKFILL_BATCH lượt, mỗi binding thử lại sau 24h nếu Zalo không trả — hết việc thì vòng
   * này không gọi Zalo lần nào.
   */
  @Cron('0 */10 * * * *')
  async backfillProfiles(): Promise<void> {
    const accessToken = await this.redis.client.get('zalo:access_token').catch(() => null);
    if (!accessToken) return;
    const rows = await this.prisma.zaloBinding.findMany({
      where: { status: 'active', displayName: null },
      orderBy: { id: 'asc' },
      take: 200,
    });
    let calls = 0;
    for (const row of rows) {
      if (calls >= PROFILE_BACKFILL_BATCH) break;
      const claimed = await this.redis.client
        .set(PROFILE_BACKFILL_KEY(row.id), '1', 'EX', PROFILE_BACKFILL_RETRY_SEC, 'NX')
        .catch(() => null);
      if (claimed !== 'OK') continue;
      calls += 1;
      await this.rememberProfile(row, await this.fetchZaloProfile(accessToken, row.zaloUserId));
    }
  }

  private async fetchZaloProfile(accessToken: string, zaloUserId: string): Promise<ZaloProfile> {
    try {
      const url = new URL('https://openapi.zalo.me/v3.0/oa/user/detail');
      url.searchParams.set('data', JSON.stringify({ user_id: zaloUserId }));
      const res = await this.fetchFn(url.toString(), { headers: { access_token: accessToken } });
      const body = (await res.json()) as { error?: number; data?: Record<string, unknown> };
      recordZaloCall(this.redis.client, 'user_detail', body.error);
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

  /**
   * @param profile  Hồ sơ Zalo đã có sẵn (cron tự kích hoạt vừa lấy). Vắng ⇒ hỏi Zalo một lượt,
   *   best-effort: hỏng thì vẫn kích hoạt, chỉ thiếu tên — cron `backfillProfiles` bù sau.
   */
  async activate(id: number, phone: string, profile?: ZaloProfile): Promise<ZaloBinding> {
    const binding = await this.prisma.zaloBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException('binding not found');

    // Quy tắc 2026-10-03: mỗi học viên một SĐT riêng. SĐT còn khớp NHIỀU học viên (anh chị em đăng ký
    // bằng số phụ huynh — 18 số như vậy trên pilot lúc viết) ⇒ TỪ CHỐI thay vì `findFirst` chọn bừa
    // một em: nhận xét của em này sẽ bay sang Zalo của em kia. Sửa SĐT trong danh sách trước.
    const matches = await this.prisma.student.findMany({ where: { phone }, take: 2 });
    if (matches.length === 0) throw new NotFoundException('no student with that phone number');
    if (matches.length > 1) throw new ConflictException('phone number matches more than one student');
    const student = matches[0];

    // Chủ tịch 2026-10-04: MỖI HỌC VIÊN CHỈ GẮN MỘT TÀI KHOẢN ZALO — chống bên thứ ba (người biết SĐT
    // của học viên) tự gắn Zalo của mình để nhận nhận xét. Học viên đã có Zalo khác ⇒ từ chối; muốn đổi
    // máy thì tư vấn GỠ liên kết cũ ở màn Học viên trước. Binding `test:*` của Test Upload không tính.
    // Unique index một phần `zalo_bindings_one_active_zalo_per_student` chặn nốt trường hợp hai lượt
    // kích hoạt chạy song song (P2002 bên dưới).
    const other = await this.prisma.zaloBinding.findFirst({
      where: {
        studentId: student.id,
        status: 'active',
        zaloUserId: { not: binding.zaloUserId },
        NOT: { zaloUserId: { startsWith: TEST_ZALO_PREFIX } },
      },
    });
    if (other) throw new ConflictException(STUDENT_ALREADY_LINKED);

    let zaloProfile = profile;
    if (!zaloProfile) {
      const accessToken = await this.redis.client.get('zalo:access_token').catch(() => null);
      zaloProfile = accessToken ? await this.fetchZaloProfile(accessToken, binding.zaloUserId) : {};
    }

    let updated: ZaloBinding;
    try {
      updated = await this.prisma.zaloBinding.update({
        where: { id },
        data: {
          studentId: student.id,
          phoneEntered: phone,
          status: 'active',
          ...(zaloProfile.zaloDisplayName ? { displayName: zaloProfile.zaloDisplayName } : {}),
          ...(zaloProfile.zaloAvatar ? { avatarUrl: zaloProfile.zaloAvatar } : {}),
        },
      });
    } catch (err) {
      // Unique index: một lượt kích hoạt khác vừa gắn học viên này với Zalo khác trong tích tắc.
      if ((err as { code?: unknown }).code === 'P2002') throw new ConflictException(STUDENT_ALREADY_LINKED);
      throw err;
    }
    // Người đã quyết định ⇒ bỏ chặn tự kích hoạt (nếu từng bị gỡ nhầm).
    await this.redis.client.del(NO_AUTO_ACTIVATE_KEY(binding.zaloUserId)).catch(() => undefined);

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

  /**
   * GỠ một liên kết Zalo ↔ học viên bị ghép nhầm (2026-10-03).
   *
   *  - Zalo user này còn binding khác (mô hình anh chị em) ⇒ XÓA đúng dòng này, các dòng kia giữ nguyên.
   *  - Đây là binding duy nhất ⇒ ĐƯA VỀ CHỜ KÍCH HOẠT (bỏ học viên, giữ tên/ảnh Zalo) để tư vấn ghép
   *    lại đúng người ngay trên màn Kích hoạt. Xóa hẳn thì lần nhắn sau họ mới hiện lại.
   *  - Chặn cron tự kích hoạt lại user này (NO_AUTO_ACTIVATE_KEY): nếu SĐT họ chia sẻ khớp đúng một
   *    học viên, cron sẽ ghép lại ĐÚNG cái nhầm vừa gỡ sau 2 phút.
   *  - Không còn binding active nào ⇒ bỏ khỏi `zalo:known_users`: gateway coi họ là người lạ lại.
   *
   * Không gửi tin gì cho người dùng Zalo, không đụng bài nộp/bài chấm cũ (chúng gắn với học viên,
   * không gắn với binding).
   */
  async unbind(id: number, actor: string): Promise<{ id: number; result: 'deleted' | 'pending' }> {
    const binding = await this.prisma.zaloBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException('binding not found');
    if (binding.status !== 'active') throw new ConflictException('binding is not active');

    const siblings = await this.prisma.zaloBinding.count({
      where: { zaloUserId: binding.zaloUserId, id: { not: id } },
    });
    let result: 'deleted' | 'pending';
    if (siblings > 0) {
      await this.prisma.zaloBinding.delete({ where: { id } });
      result = 'deleted';
    } else {
      await this.prisma.zaloBinding.update({
        where: { id },
        data: { status: 'pending', studentId: null, phoneEntered: null },
      });
      result = 'pending';
    }

    await this.redis.client.set(NO_AUTO_ACTIVATE_KEY(binding.zaloUserId), actor).catch(() => undefined);
    const stillActive = await this.prisma.zaloBinding.count({
      where: { zaloUserId: binding.zaloUserId, status: 'active' },
    });
    if (stillActive === 0) {
      await this.redis.removeKnownUser(binding.zaloUserId).catch((err) => {
        this.logger.warn(`Không gỡ được ${binding.zaloUserId} khỏi Redis: ${(err as Error).message}`);
      });
    }

    this.logger.warn(
      `${actor} gỡ liên kết Zalo ${binding.zaloUserId} (${binding.displayName ?? 'chưa có tên'}) khỏi học viên ` +
        `#${binding.studentId} — binding #${id} ${result === 'deleted' ? 'đã xóa' : 'về chờ kích hoạt'}`,
    );
    return { id, result };
  }
}
