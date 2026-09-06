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
  /** Test Upload only (core-api `test-upload/` module) — gateway không bao giờ set 2 field
   * này, chỉ giữ shape đồng bộ với core-api/worker. */
  mediaPath?: string;
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

/**
 * Yêu cầu học viên CHIA SẺ SỐ ĐIỆN THOẠI qua Zalo (`template_type: request_user_info`).
 * Học viên bấm đồng ý một lần, số về `oa/user/detail → shared_info.phone`, core-api tự đối
 * chiếu với `students.phone`. Đây là cách duy nhất lấy được SĐT hợp lệ: webhook Zalo chỉ đưa
 * một mã ẩn danh, không kèm thông tin cá nhân nào.
 */
export interface RequestUserInfo {
  /** Zalo giới hạn 100 ký tự. */
  title: string;
  /** Zalo giới hạn 500 ký tự. */
  subtitle: string;
  imageUrl?: string;
}

export interface OutboundMessage {
  v: 1;
  zaloUserId: string;
  /** key trong bảng message_templates (core-api render sẵn body trước khi publish) */
  templateKey?: string;
  text: string;
  submissionId?: string;
  /** F11: vắng mặt hoặc rỗng = tin text thuần đúng như trước F11. */
  buttons?: OutboundButton[];
  /** Có mặt ⇒ gateway gửi template xin SĐT THAY CHO tin text thuần. Loại trừ lẫn nhau với
   * `buttons`: Zalo chỉ nhận MỘT `attachment` mỗi tin. */
  requestUserInfo?: RequestUserInfo;
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
