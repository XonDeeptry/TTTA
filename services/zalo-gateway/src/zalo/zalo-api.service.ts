import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis.service';
import { TokenService } from './token.service';

const SEND_URL = 'https://openapi.zalo.me/v3.0/oa/message/cs';
const ERR_TOKEN_EXPIRED = -216;

interface ZaloSendResponse {
  error: number;
  message?: string;
}

/** Lỗi tạm (mạng, 5xx) → throw để RabbitService retry; lỗi vĩnh viễn cũng throw sau khi hết cách. */
@Injectable()
export class ZaloApiService {
  private readonly logger = new Logger(ZaloApiService.name);
  fetchFn: typeof fetch = fetch;

  constructor(
    private readonly redis: RedisService,
    private readonly tokenService: TokenService,
  ) {}

  async sendText(zaloUserId: string, text: string): Promise<void> {
    let data = await this.trySend(zaloUserId, text);
    if (data.error === ERR_TOKEN_EXPIRED) {
      this.logger.warn('Access token hết hạn giữa chừng — refresh và gửi lại một lần');
      const refreshed = await this.tokenService.refreshNow();
      if (!refreshed) throw new Error('Token expired and refresh failed');
      data = await this.trySend(zaloUserId, text);
    }
    if (data.error !== 0) {
      throw new Error(`Zalo send failed: ${data.error} ${data.message ?? ''}`);
    }
  }

  private async trySend(zaloUserId: string, text: string): Promise<ZaloSendResponse> {
    const token = await this.redis.getAccessToken();
    if (!token) throw new Error('No Zalo access token available');
    const res = await this.fetchFn(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: token },
      body: JSON.stringify({ recipient: { user_id: zaloUserId }, message: { text } }),
    });
    return (await res.json()) as ZaloSendResponse;
  }
}
