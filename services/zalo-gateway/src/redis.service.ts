import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const DEDUP_TTL_SEC = 7 * 24 * 3600; // chống trùng message_id 7 ngày (mục 3.5)
const LASTIN_TTL_SEC = 7 * 24 * 3600;

/**
 * Kênh cấu hình (v1.2): core-api mirror bảng `settings` sang Redis key `config:{key}`
 * và publish lên channel `config:changed` khi admin đổi trên dashboard.
 * Gateway đọc config từ đây; biến môi trường chỉ là fallback cho dev.
 */
export const CONFIG_CHANNEL = 'config:changed';

const ENV_FALLBACKS: Record<string, string | undefined> = {
  'zalo.app_id': process.env.ZALO_APP_ID,
  'zalo.app_secret': process.env.ZALO_APP_SECRET,
  'zalo.oa_id': process.env.ZALO_OA_ID,
  'zalo.webhook_secret': process.env.ZALO_WEBHOOK_SECRET,
  'limits.outbound_48h_guard': process.env.OUTBOUND_48H_GUARD,
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private readonly subscriber: Redis;
  private configCache = new Map<string, string | null>();

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
    this.subscriber.subscribe(CONFIG_CHANNEL).catch((e) => this.logger.error(`subscribe failed: ${e}`));
    this.subscriber.on('message', (channel) => {
      if (channel === CONFIG_CHANNEL) {
        this.configCache.clear();
        this.logger.log('Config changed — cache flushed');
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }

  // ---- Cấu hình ứng dụng (quản trị qua UI, mục 3.3 v1.2) ----

  async getConfig(key: string): Promise<string | null> {
    if (this.configCache.has(key)) return this.configCache.get(key)!;
    let value = await this.client.get(`config:${key}`);
    if (value === null) value = ENV_FALLBACKS[key] ?? null; // dev fallback
    this.configCache.set(key, value);
    return value;
  }

  async getConfigBool(key: string, defaultValue: boolean): Promise<boolean> {
    const v = await this.getConfig(key);
    if (v === null || v === '') return defaultValue;
    return v === 'true' || v === '1';
  }

  // ---- Chống trùng (idempotency) ----

  /** true nếu đây là lần đầu thấy message_id (đã claim thành công) */
  async claimMessage(messageId: string): Promise<boolean> {
    const result = await this.client.set(`dedup:${messageId}`, '1', 'EX', DEDUP_TTL_SEC, 'NX');
    return result === 'OK';
  }

  // ---- Khung 48h ----

  async recordInbound(zaloUserId: string, atMs: number): Promise<void> {
    await this.client.set(`zalo:lastin:${zaloUserId}`, String(atMs), 'EX', LASTIN_TTL_SEC);
  }

  async getLastInbound(zaloUserId: string): Promise<number | null> {
    const v = await this.client.get(`zalo:lastin:${zaloUserId}`);
    return v === null ? null : Number(v);
  }

  // ---- Token OA (runtime state; seed từ dashboard, dev fallback từ env) ----

  async getAccessToken(): Promise<string | null> {
    return this.client.get('zalo:access_token');
  }

  async getRefreshToken(): Promise<string | null> {
    return this.client.get('zalo:refresh_token');
  }

  /** refresh_token của Zalo là loại dùng-một-lần — ghi cả cặp atomic bằng MULTI (mục 3.6) */
  async setTokens(accessToken: string, refreshToken: string, expiresInSec: number): Promise<void> {
    await this.client
      .multi()
      .set('zalo:access_token', accessToken)
      .set('zalo:refresh_token', refreshToken)
      .set('zalo:token_expires_at', String(Date.now() + expiresInSec * 1000))
      .del('alert:zalo_token_failed')
      .exec();
  }

  async seedTokensIfEmpty(accessToken?: string, refreshToken?: string): Promise<void> {
    if (!accessToken || !refreshToken) return;
    const existing = await this.client.get('zalo:refresh_token');
    if (existing === null) {
      await this.setTokens(accessToken, refreshToken, 0);
    }
  }

  async setTokenAlert(reason: string): Promise<void> {
    await this.client.set('alert:zalo_token_failed', JSON.stringify({ reason, at: new Date().toISOString() }));
  }
}
