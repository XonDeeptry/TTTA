import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Cùng channel/key convention với zalo-gateway/src/redis.service.ts (mục 3.3 v1.2). */
export const CONFIG_CHANNEL = 'config:changed';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  /**
   * Gateway đọc config:{key} như một chuỗi thô (xem ENV_FALLBACKS ở gateway) — mirror ở đây
   * PHẢI giữ đúng định dạng đó, không JSON.stringify, để không phá vỡ hợp đồng đã có.
   */
  async mirrorConfig(key: string, rawValue: string): Promise<void> {
    await this.client.set(`config:${key}`, rawValue);
    await this.client.publish(CONFIG_CHANNEL, key);
  }
}
