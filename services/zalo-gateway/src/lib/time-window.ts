export const WINDOW_48H_MS = 48 * 60 * 60 * 1000;
export const DEFAULT_MARGIN_MS = 5 * 60 * 1000;

/**
 * Khung 48h miễn phí của Zalo OA (mục 3.5 tài liệu kiến trúc): chỉ gửi khi còn
 * trong cửa sổ tính từ tin nhắn cuối của user, trừ biên an toàn để không bao giờ
 * âm thầm phát sinh phí.
 */
export function canSendWithin48h(
  lastInboundMs: number | null,
  nowMs: number,
  marginMs: number = DEFAULT_MARGIN_MS,
): boolean {
  if (lastInboundMs === null) return false;
  return nowMs - lastInboundMs <= WINDOW_48H_MS - marginMs;
}
