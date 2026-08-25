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

/** F11: tập hành động nút bấm — TẬP ĐÓNG. Thêm giá trị mới phải sửa cả BA bản contracts
 * và nhánh xử lý trong grading-worker/pipeline.py, nếu không tin nhắn sẽ rơi xuống flag. */
export type ButtonAction = 'ack' | 'request_advisor' | 'select_student';

export interface OutboundButton {
  /** Nhãn học viên nhìn thấy — Zalo giới hạn 100 ký tự. */
  title: string;
  action: ButtonAction;
  /** Chuỗi quay lại NGUYÊN VĂN qua sự kiện `user_send_text` — Zalo giới hạn 1.000 ký tự.
   * Luôn có dạng `#ilm:<action>:<arg>[:<arg>]`, mọi arg chỉ gồm chữ số. */
  payload: string;
}

export interface OutboundMessage {
  v: 1;
  zaloUserId: string;
  templateKey?: string;
  text: string;
  submissionId?: string;
  /** F11: vắng mặt hoặc rỗng = tin text thuần đúng như trước F11. */
  buttons?: OutboundButton[];
}

export const ILM_PAYLOAD_PREFIX = '#ilm:';
export const BUTTON_ACTIONS: readonly ButtonAction[] = ['ack', 'request_advisor', 'select_student'];
export const MAX_BUTTONS = 5;
export const MAX_BUTTON_TITLE_LEN = 100;
export const MAX_BUTTON_PAYLOAD_LEN = 1000;
export const MAX_OUTBOUND_TEXT_LEN = 2000;

export const EXCHANGE = 'ilm.direct';
export const DLX = 'ilm.dlx';
export const RETRY_EXCHANGE = 'ilm.retry';
export const Q_SUBMISSIONS = 'submissions';
export const Q_OUTBOUND = 'outbound';
export const MAX_RETRIES = 3;
export const RETRY_TTL_MS = 30_000;
