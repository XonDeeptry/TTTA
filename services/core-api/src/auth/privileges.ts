/**
 * Hai quyền phụ của F10 (thiết kế mục 4.2). KHAI BÁO DUY NHẤT toàn repo (AC-08.1/NFR-M1) —
 * guard, DTO của `/users`, `GET /auth/me` và test đều import từ đây, không ai gõ lại chuỗi.
 *
 * Vẫn đúng HAI role cũ `admin | staff`: quyền là trục THỨ HAI, độc lập với role, cố ý không đẻ
 * thêm role thứ ba (sẽ kéo theo migration enum + rà lại mọi `@Roles()` đang có).
 */

export const DASHBOARD_PRIVILEGES = [
  /** Dựng/sửa/xóa CẤU TRÚC chấm điểm: tiêu chí nào, thang bao nhiêu, cộng hay trung bình,
   * các mốc cấp độ. Toàn bộ 8 thao tác của thiết kế mục 4.1. */
  'rubric_template',
  /** Soạn NỘI DUNG chấm điểm trong khuôn một mẫu: mô tả band, yếu tố con, ngân hàng nhận xét,
   * giọng điệu; upload `.docx`; lưu version mới. */
  'criteria_author',
] as const;

export type DashboardPrivilege = (typeof DASHBOARD_PRIVILEGES)[number];

export function isDashboardPrivilege(value: unknown): value is DashboardPrivilege {
  return typeof value === 'string' && (DASHBOARD_PRIVILEGES as readonly string[]).includes(value);
}

/**
 * Tập quyền CÓ HIỆU LỰC của một tài khoản.
 *
 * `admin` mặc nhiên có mọi quyền (thiết kế mục 4.2), nên hàm trả về đủ bộ BẤT KỂ cột `privileges`
 * đang chứa gì. Đây là giá trị SUY RA để trả cho client — DB không hề bị ghi (AC-11.2), nhờ vậy
 * hạ một admin xuống `staff` sau này vẫn giữ đúng tập quyền đã lưu chứ không về rỗng.
 *
 * Với `staff`, mảng đã lưu được trả nguyên vẹn: chuỗi lạ (chỉ vào được bằng cách sửa tay trong DB)
 * không cấp gì cả và cũng không gây lỗi (AC-08.11) — front-end chỉ hỏi `includes(...)`.
 */
export function effectivePrivileges(role: string, stored: readonly string[] | null | undefined): string[] {
  if (role === 'admin') return [...DASHBOARD_PRIVILEGES];
  return Array.isArray(stored) ? [...stored] : [];
}
