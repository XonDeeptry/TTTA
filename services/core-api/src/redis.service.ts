import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Cùng channel/key convention với zalo-gateway/src/redis.service.ts (mục 3.3 v1.2). */
export const CONFIG_CHANNEL = 'config:changed';

/**
 * Set các `zalo_user_id` ĐÃ có binding `active`. core-api ghi, zalo-gateway chỉ đọc.
 * Dùng để gateway phân biệt học viên với người lạ mà không phải chạm Postgres.
 * Tên key phải khớp từng ký tự với hằng cùng tên bên `zalo-gateway/src/redis.service.ts`.
 */
export const KNOWN_USERS_KEY = 'zalo:known_users';

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

  /** Thêm một user vừa được kích hoạt vào danh sách "đã biết". */
  async addKnownUser(zaloUserId: string): Promise<void> {
    await this.client.sadd(KNOWN_USERS_KEY, zaloUserId);
  }

  /**
   * Dựng lại toàn bộ danh sách lúc khởi động. Ghi vào key tạm rồi RENAME đè lên — thao tác
   * nguyên tử, nên gateway không bao giờ nhìn thấy khoảnh khắc danh sách rỗng và tưởng mọi học
   * viên đều là người lạ. Xóa-rồi-ghi-lại sẽ tạo đúng khoảng hở đó.
   */
  async replaceKnownUsers(zaloUserIds: string[]): Promise<void> {
    const tmp = `${KNOWN_USERS_KEY}:rebuild`;
    await this.client.del(tmp);
    if (zaloUserIds.length === 0) {
      await this.client.del(KNOWN_USERS_KEY);
      return;
    }
    await this.client.sadd(tmp, ...zaloUserIds);
    await this.client.rename(tmp, KNOWN_USERS_KEY);
  }
}
