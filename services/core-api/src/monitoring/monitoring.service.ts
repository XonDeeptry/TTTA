import { Injectable } from '@nestjs/common';
import { Q_OUTBOUND, Q_SUBMISSIONS } from '../contracts';
import { vnDate } from '../lib/zalo-call-counter';
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

export interface DiskStatus {
  alert: string | null;
}

/** Lượt hệ thống gọi ra Zalo Open API — do `lib/zalo-call-counter.ts` ghi ở cả gateway lẫn core-api. */
export interface ZaloApiUsage {
  generatedAt: string;
  /** Giới hạn req/phút của các gói Zalo OA đang cân nhắc (Nâng cao, Premium). */
  plans: number[];
  today: {
    date: string;
    total: number;
    byEndpoint: Record<string, number>;
    errors: Record<string, number>;
    peakPerMinute: number;
    peakAt: string | null;
  };
  /** 24 giờ gần nhất, cũ nhất trước. */
  hours: { start: string; total: number; peakPerMinute: number }[];
  /** 7 ngày theo giờ Việt Nam, cũ nhất trước. */
  days: { date: string; total: number; peakPerMinute: number; peakAt: string | null }[];
  weekPeak: { perMinute: number; at: string | null };
}

const ZALO_OA_PLANS = [100, 2000];
const DAY_MS = 86_400_000;

function peakOf(totals: number[], firstMinute: number): { peak: number; at: string | null } {
  let peak = 0;
  let at: string | null = null;
  totals.forEach((n, i) => {
    if (n > peak) {
      peak = n;
      at = new Date((firstMinute + i) * 60_000).toISOString();
    }
  });
  return { peak, at };
}

function prefixed(hash: Record<string, string>, prefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(hash)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = Number(v) || 0;
  return out;
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

  /** Cảnh báo đĩa media đầy (mục 3.8) — do MediaLifecycleService bật/tắt. */
  async diskStatus(): Promise<DiskStatus> {
    const alert = await this.redis.client.get('alert:media_disk_high');
    return { alert };
  }

  /**
   * Lượt gọi Zalo API 7 ngày gần nhất (pilot 09-15) — để chọn gói OA theo ĐỈNH MỖI PHÚT đo được.
   *
   * Một pipeline Redis: `HGET total` cho từng phút (~10.080 lệnh cho 7 ngày, chạy trên Redis cục
   * bộ) và `HGETALL` cho 7 hash ngày. Đỉnh phải tính từ bucket phút — hash ngày chỉ có tổng.
   */
  async zaloApiUsage(nowMs: number = Date.now()): Promise<ZaloApiUsage> {
    const nowMinute = Math.floor(nowMs / 60_000);
    const todayStartMs = Date.parse(`${vnDate(nowMs)}T00:00:00+07:00`);
    const firstDayStartMs = todayStartMs - 6 * DAY_MS;
    const firstMinute = Math.floor(firstDayStartMs / 60_000);
    const minuteCount = nowMinute - firstMinute + 1;
    const dayStarts = Array.from({ length: 7 }, (_, i) => firstDayStartMs + i * DAY_MS);

    const pipe = this.redis.client.pipeline();
    for (let m = firstMinute; m <= nowMinute; m++) pipe.hget(`zalo:api:m:${m}`, 'total');
    for (const start of dayStarts) pipe.hgetall(`zalo:api:d:${vnDate(start)}`);
    const results = (await pipe.exec()) ?? [];

    const totals = Array.from({ length: minuteCount }, (_, i) => Number(results[i]?.[1] ?? 0) || 0);
    const dayHashes = dayStarts.map((_, i) => (results[minuteCount + i]?.[1] ?? {}) as Record<string, string>);

    const days = dayStarts.map((start, i) => {
      const from = Math.floor(start / 60_000) - firstMinute;
      const slice = totals.slice(from, from + 1440);
      const { peak, at } = peakOf(slice, firstMinute + from);
      const summed = slice.reduce((a, b) => a + b, 0);
      return { date: vnDate(start), total: Number(dayHashes[i].total ?? summed) || summed, peakPerMinute: peak, peakAt: at };
    });

    const firstHourMinute = Math.floor(nowMinute / 60) * 60 - 23 * 60;
    const hours = Array.from({ length: 24 }, (_, h) => {
      const from = firstHourMinute + h * 60 - firstMinute;
      const slice = totals.slice(Math.max(0, from), Math.max(0, from + 60));
      return {
        start: new Date((firstHourMinute + h * 60) * 60_000).toISOString(),
        total: slice.reduce((a, b) => a + b, 0),
        peakPerMinute: slice.length ? Math.max(...slice) : 0,
      };
    });

    const today = days[6];
    const todayHash = dayHashes[6];
    const week = days.reduce((best, d) => (d.peakPerMinute > best.perMinute ? { perMinute: d.peakPerMinute, at: d.peakAt } : best), {
      perMinute: 0,
      at: null as string | null,
    });

    return {
      generatedAt: new Date(nowMs).toISOString(),
      plans: ZALO_OA_PLANS,
      today: {
        date: today.date,
        total: today.total,
        byEndpoint: prefixed(todayHash, 'ep:'),
        errors: prefixed(todayHash, 'err:'),
        peakPerMinute: today.peakPerMinute,
        peakAt: today.peakAt,
      },
      hours,
      days,
      weekPeak: week,
    };
  }
}
