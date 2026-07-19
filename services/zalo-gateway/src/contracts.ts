/**
 * Message contracts trên RabbitMQ — grading-worker (Python) phải giữ đúng shape này.
 * Exchange: ilm.direct · Queues: submissions, outbound (DLQ: *.dlq, retry: *.retry)
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
  receivedAt: string; // ISO 8601
}

export interface OutboundMessage {
  v: 1;
  zaloUserId: string;
  /** key trong bảng message_templates (core-api render sẵn body trước khi publish) */
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
