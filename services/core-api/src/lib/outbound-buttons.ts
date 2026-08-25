import { BUTTON_ACTIONS, ButtonAction, MAX_BUTTONS, MAX_BUTTON_TITLE_LEN, OutboundButton } from '../contracts';
import { normalizeRubric } from '../criteria/rubric-schema';

/**
 * F11 FR-08 — dựng bộ nút cho MỘT tin nhận xét, từ `rubric.student_reply.buttons`.
 *
 * Bản song sinh Python: `grading_worker/buttons.py::build_reply_buttons` (nhánh auto-send của
 * worker). Hai bản phải cho cùng kết quả trên cùng cấu hình — đổi một bên phải đổi bên kia.
 *
 * `student_reply` được `normalizeRubric` chép NGUYÊN VĂN (F8 AC-05.4) nên nội dung là dữ liệu
 * giáo viên soạn, KHÔNG đáng tin: mọi phần tử hỏng bị bỏ qua lặng lẽ, không bao giờ ném lỗi —
 * lỗi cấu hình nút không được phép chặn nhận xét đến tay học viên (NFR-03).
 */

/** `select_student` do HỆ THỐNG sinh (BR-14) — giáo viên đặt vào cấu hình thì bị bỏ qua. */
const STUDENT_REPLY_ACTIONS: readonly ButtonAction[] = ['ack', 'request_advisor'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Chỉ chấp nhận số nguyên dương — không bao giờ dựng `#ilm:ack:undefined`/`:NaN` (AC-07.6). */
function asPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function buildReplyButtons(rubricRaw: unknown, gradingId: unknown): OutboundButton[] {
  const id = asPositiveInt(gradingId);
  if (id === null) return [];

  let entries: unknown;
  try {
    entries = normalizeRubric(rubricRaw).student_reply?.buttons;
  } catch {
    return []; // rubric không đọc được ⇒ tin text thuần, KHÔNG 500 (AC-08.4)
  }
  if (!Array.isArray(entries)) return [];

  const buttons: OutboundButton[] = [];
  for (const entry of entries) {
    if (buttons.length >= MAX_BUTTONS) break; // AC-07.7: cắt Ở PRODUCER, không để gateway bỏ cả khối
    if (!isPlainObject(entry)) continue;
    const { title, action } = entry;
    if (typeof title !== 'string' || title.trim() === '' || title.length > MAX_BUTTON_TITLE_LEN) continue;
    if (typeof action !== 'string') continue;
    if (!STUDENT_REPLY_ACTIONS.includes(action as ButtonAction)) continue;
    buttons.push({ title, action: action as ButtonAction, payload: `#ilm:${action}:${id}` });
  }
  return buttons;
}

/** Khóa tập đóng lại một lần nữa ở phía producer — dùng trong test đối chiếu contracts. */
export const CLOSED_ACTION_SET = BUTTON_ACTIONS;
