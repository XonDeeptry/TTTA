import { Injectable } from '@nestjs/common';
import { Q_OUTBOUND, Q_SUBMISSIONS } from '../contracts';
import { RabbitService } from '../rabbit.service';
import { RedisService } from '../redis.service';

export interface QueueDepth {
  queue: string;
  mainDepth: number;
  dlqDepth: number;
}

export interface TokenStatus {
  hasAccessToken: boolean;
  expiresAt: string | null;
  alert: string | null;
}

/** Phân hệ 1 (mục 3.7), admin-only: độ sâu hàng đợi + trạng thái token Zalo. */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly rabbit: RabbitService,
    private readonly redis: RedisService,
  ) {}

  async queueDepths(): Promise<QueueDepth[]> {
    return Promise.all(
      [Q_SUBMISSIONS, Q_OUTBOUND].map(async (queue) => ({
        queue,
        mainDepth: await this.rabbit.queueDepth(queue),
        dlqDepth: await this.rabbit.queueDepth(`${queue}.dlq`),
      })),
    );
  }

  async tokenStatus(): Promise<TokenStatus> {
    const [accessToken, expiresAt, alert] = await Promise.all([
      this.redis.client.get('zalo:access_token'),
      this.redis.client.get('zalo:token_expires_at'),
      this.redis.client.get('alert:zalo_token_failed'),
    ]);
    return { hasAccessToken: accessToken !== null, expiresAt, alert };
  }
}
