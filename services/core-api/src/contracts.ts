/**
 * Mirror của services/zalo-gateway/src/contracts.ts — PHẢI giữ đúng cùng shape.
 * core-api chỉ publish vào Q_OUTBOUND (kích hoạt onboarding, báo chưa nộp…) nhưng vẫn
 * assert topology đầy đủ vì cả 2 service có thể khởi động trước sau bất kỳ thứ tự nào.
 */

export type SubmissionKind = 'audio' | 'video' | 'text' | 'image' | 'file' | 'follow';

export interface OutboundMessage {
  v: 1;
  zaloUserId: string;
  templateKey?: string;
  text: string;
  submissionId?: string;
}

export const EXCHANGE = 'ilm.direct';
export const DLX = 'ilm.dlx';
export const RETRY_EXCHANGE = 'ilm.retry';
export const Q_SUBMISSIONS = 'submissions';
export const Q_OUTBOUND = 'outbound';
export const MAX_RETRIES = 3;
export const RETRY_TTL_MS = 30_000;
