/**
 * Khung 48h miễn phí của Zalo OA — BẢN SAO có chủ đích của `zalo-gateway/src/lib/time-window.ts`
 * (không có package dùng chung giữa các service). Hai bên phải cùng một quy tắc, cùng biên an toàn.
 *
 * Vì sao core-api cũng cần: sự cố 2026-09-29 — giáo viên bấm Gửi cho bài nộp từ 27/9, core-api đặt
 * `sent` rồi publish; gateway chặn vì quá 48h và chỉ ghi Redis `blocked_48h`. Dashboard báo "Đã gửi"
 * trong khi học viên không nhận được gì (8 tin). Kiểm tra TRƯỚC khi publish để giáo viên được báo thật.
 */
export const WINDOW_48H_MS = 48 * 60 * 60 * 1000;
export const DEFAULT_MARGIN_MS = 5 * 60 * 1000;

export function canSendWithin48h(
  lastInboundMs: number | null,
  nowMs: number,
  marginMs: number = DEFAULT_MARGIN_MS,
): boolean {
  if (lastInboundMs === null || !Number.isFinite(lastInboundMs)) return false;
  return nowMs - lastInboundMs <= WINDOW_48H_MS - marginMs;
}

/** Đọc đúng hai khóa Redis gateway dùng: `config:limits.outbound_48h_guard` và `zalo:lastin:{id}`. */
export async function outboundWindow(
  redis: { get(key: string): Promise<string | null> },
  zaloUserId: string,
  nowMs: number = Date.now(),
): Promise<{ allowed: boolean; lastInboundMs: number | null }> {
  // Y hệt gateway `getConfigBool(key, true)`: rỗng/thiếu ⇒ bật; chỉ 'true'/'1' là bật; còn lại ⇒ tắt.
  const guard = await redis.get('config:limits.outbound_48h_guard');
  const raw = await redis.get(`zalo:lastin:${zaloUserId}`);
  const lastInboundMs = raw === null ? null : Number(raw);
  const guardOn = guard === null || guard === '' || guard === 'true' || guard === '1';
  if (!guardOn) return { allowed: true, lastInboundMs };
  return { allowed: canSendWithin48h(lastInboundMs, nowMs), lastInboundMs };
}
