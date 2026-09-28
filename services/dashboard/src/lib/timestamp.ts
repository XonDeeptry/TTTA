/**
 * Mốc giờ trong audio bài nộp — dạng giáo viên đọc và gõ ("1:29"), tách khỏi component để kiểm tra
 * được bằng node mà không cần trình duyệt.
 */

/** 89.4 → "1:29" — cùng cách hiển thị với nút ▶ và dòng "• 1:29 — …" trong tin học viên. */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * "1:29" · "01:29" · "1:29.5" · "89" · "89,5" → giây. Chuỗi rỗng → `null` (bỏ mốc). Sai dạng, giây ≥ 60,
 * hoặc vượt `maxSec` (độ dài audio, khi đã biết) → `undefined`.
 */
export function parseTimestamp(raw: string, maxSec?: number): number | null | undefined {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  let seconds: number;
  const mmss = /^(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/.exec(text);
  if (mmss) {
    const s = Number(mmss[2]);
    if (s >= 60) return undefined;
    seconds = Number(mmss[1]) * 60 + s;
  } else if (/^\d+(?:\.\d+)?$/.test(text)) {
    seconds = Number(text);
  } else {
    return undefined;
  }
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  if (maxSec !== undefined && seconds > maxSec) return undefined;
  return Math.round(seconds * 100) / 100;
}
