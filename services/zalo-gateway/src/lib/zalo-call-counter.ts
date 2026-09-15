import type Redis from 'ioredis';

/**
 * Đếm MỌI lượt hệ thống gọi ra Zalo Open API, theo phút — để chọn gói Zalo OA theo số đo thật
 * (gói Nâng cao giới hạn 100 req/phút, gói Premium 2.000 req/phút). Pilot 2026-09-15.
 *
 * ⚠ BẢN SONG SINH: `core-api/src/lib/zalo-call-counter.ts` phải giống hệt (tên key, TTL, múi giờ).
 * Hai service cùng gọi Zalo nên cùng ghi vào một bộ key; core-api là bên đọc để hiển thị.
 *
 * Chỉ đếm lượt CÓ PHẢN HỒI từ Zalo (kể cả phản hồi lỗi). Lỗi mạng trước khi tới Zalo không đếm.
 * Tin Zalo đẩy vào webhook của ta KHÔNG phải lượt gọi ra, nên không đếm ở đây.
 */
export type ZaloEndpoint = 'message_cs' | 'oauth_token' | 'user_detail' | 'getoa';

export const MINUTE_TTL_SEC = 8 * 24 * 3600;
export const DAY_TTL_SEC = 35 * 24 * 3600;
const VN_OFFSET_MS = 7 * 3600 * 1000;

export function zaloMinuteKey(ms: number): string {
  return `zalo:api:m:${Math.floor(ms / 60_000)}`;
}

/** Ngày theo giờ Việt Nam (UTC+7, không có giờ mùa hè), dạng YYYY-MM-DD. */
export function vnDate(ms: number): string {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function zaloDayKey(ms: number): string {
  return `zalo:api:d:${vnDate(ms)}`;
}

/**
 * Ghi một lượt gọi. KHÔNG await, KHÔNG ném lỗi: đếm hỏng không bao giờ được làm hỏng một tin
 * gửi thật. `client` thiếu (stub trong test) ⇒ bỏ qua.
 */
export function recordZaloCall(
  client: Pick<Redis, 'multi'> | undefined,
  endpoint: ZaloEndpoint,
  errorCode?: number | string,
  now: number = Date.now(),
): void {
  if (!client || typeof client.multi !== 'function') return;
  try {
    const m = zaloMinuteKey(now);
    const d = zaloDayKey(now);
    const tx = client
      .multi()
      .hincrby(m, 'total', 1)
      .hincrby(m, `ep:${endpoint}`, 1)
      .expire(m, MINUTE_TTL_SEC)
      .hincrby(d, 'total', 1)
      .hincrby(d, `ep:${endpoint}`, 1)
      .expire(d, DAY_TTL_SEC);
    if (errorCode !== undefined && errorCode !== null && errorCode !== 0 && errorCode !== '0') {
      tx.hincrby(m, `err:${errorCode}`, 1).hincrby(d, `err:${errorCode}`, 1);
    }
    void tx.exec().catch(() => undefined);
  } catch {
    // cố ý nuốt: xem chú thích hàm
  }
}
