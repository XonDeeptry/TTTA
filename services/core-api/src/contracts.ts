/**
 * Mirror của services/zalo-gateway/src/contracts.ts — PHẢI giữ đúng cùng shape.
 * core-api publish vào Q_OUTBOUND (kích hoạt onboarding, báo chưa nộp…) và, từ tính năng
 * Test Upload (dashboard admin), vào Q_SUBMISSIONS — vẫn assert topology đầy đủ vì các
 * service có thể khởi động trước sau bất kỳ thứ tự nào.
 */

export type SubmissionKind = 'audio' | 'video' | 'text' | 'image' | 'file' | 'follow';

export interface SubmissionMessage {
  v: 1;
  messageId: string;
  eventName: string;
  kind: SubmissionKind;
  zaloUserId: string;
  text?: string;
  mediaUrl?: string;
  /** Test Upload only (`test-upload/` module): file đã nằm sẵn dưới MEDIA_ROOT (đường dẫn
   * tương đối) — worker bỏ qua bước tải từ Zalo và đọc thẳng path này. */
  mediaPath?: string;
  /** Test Upload only: ép `autoSend` về false ở worker dù lớp có bật, vì binding test là
   * giả (`test:{studentId}`) — kết quả luôn dừng ở `awaiting_review` để xem trên dashboard. */
  testMode?: boolean;
  receivedAt: string; // ISO 8601
}

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
