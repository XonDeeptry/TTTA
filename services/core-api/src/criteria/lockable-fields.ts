/**
 * Tập ĐÓNG các đường dẫn trường mà một mẫu có thể KHÓA lại với người soạn nội dung (§5.4).
 *
 * `locked` chỉ ràng buộc drawer soạn NỘI DUNG của F12 (quyền `criteria_author`). Người giữ quyền
 * `rubric_template` — và mọi `admin` — sửa được mọi trường, KỂ CẢ chính mảng `locked` này
 * (thiết kế mục 4.1 "Sửa: ✔ sửa được mọi trường" + mục 11). Nói cách khác đây là dữ liệu chính
 * sách, không phải cơ chế phân quyền: cơ chế nằm ở `PrivilegeGuard`.
 *
 * Giữ tập đóng để một lỗi gõ (`scales`, `dimension[].key`) bị trả 400 ngay lúc lưu thay vì âm thầm
 * không khóa gì cả.
 */
export const LOCKABLE_FIELD_PATHS: readonly string[] = [
  'scale',
  'aggregation',
  'levels',
  'output_fields',
  'dimensions[].key',
  'dimensions[].weight',
  'student_reply',
];

/** Khử trùng lặp, GIỮ NGUYÊN thứ tự xuất hiện đầu tiên (§5.3: "Duplicates removed"). */
export function dedupeLocked(locked: readonly string[]): string[] {
  return [...new Set(locked)];
}
