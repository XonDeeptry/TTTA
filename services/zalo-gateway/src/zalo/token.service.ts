import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis.service';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // token OA sống ~1h → refresh mỗi 50 phút (mục 3.6)
const OAUTH_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const ALERT_AFTER_FAILURES = 2;

interface ZaloTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string | number;
  error?: number;
  error_name?: string;
}

@Injectable()
export class TokenService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TokenService.name);
  private timer?: NodeJS.Timeout;
  private consecutiveFailures = 0;
  /** injectable để test — mặc định fetch toàn cục của Node */
  fetchFn: typeof fetch = fetch;

  constructor(private readonly redis: RedisService) {}

  async onApplicationBootstrap(): Promise<void> {
    // Dev fallback: seed cặp token từ env nếu Redis trống (production: nhập qua dashboard)
    await this.redis.seedTokensIfEmpty(
      process.env.ZALO_INITIAL_ACCESS_TOKEN,
      process.env.ZALO_INITIAL_REFRESH_TOKEN,
    );
    this.timer = setInterval(() => void this.refreshNow(), REFRESH_INTERVAL_MS);
    this.timer.unref();
    void this.refreshNow();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async refreshNow(): Promise<boolean> {
    const refreshToken = await this.redis.getRefreshToken();
    const appId = await this.redis.getConfig('zalo.app_id');
    const appSecret = await this.redis.getConfig('zalo.app_secret');
    if (!refreshToken || !appId || !appSecret) {
      this.logger.warn('Chưa có refresh_token / app credentials — chờ cấu hình từ dashboard');
      return false;
    }
    try {
      const res = await this.fetchFn(OAUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: appSecret,
        },
        body: new URLSearchParams({
          app_id: appId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
      const data = (await res.json()) as ZaloTokenResponse;
      if (!data.access_token || !data.refresh_token) {
        throw new Error(`Zalo OAuth error: ${data.error ?? res.status} ${data.error_name ?? ''}`);
      }
      await this.redis.setTokens(data.access_token, data.refresh_token, Number(data.expires_in ?? 3600));
      this.consecutiveFailures = 0;
      this.logger.log('Zalo token refreshed');
      return true;
    } catch (err) {
      this.consecutiveFailures += 1;
      const message = (err as Error).message;
      this.logger.error(`Token refresh failed (lần ${this.consecutiveFailures}): ${message}`);
      if (this.consecutiveFailures >= ALERT_AFTER_FAILURES) {
        // Bot sắp chết sau ~1h — bắn cờ cảnh báo cho dashboard/cron cảnh báo (mục 3.6)
        await this.redis.setTokenAlert(message);
      }
      return false;
    }
  }
}
