/** Khoảng thời gian mặc định cho báo cáo/analytics (mục 3.7 phân hệ 4). Tách ra khỏi
 * reports.controller để cả AnalyticsController dùng chung. */
export const DEFAULT_RANGE_DAYS = 30;

/**
 * `to` được đẩy tới CUỐI ngày đó.
 *
 * Trước 2026-09-06, `new Date('2026-09-06')` cho 00:00:00Z, nên chọn "đến hôm nay" sẽ loại
 * SẠCH mọi bài nộp của chính hôm nay — màn Phân tích hiện 0 bài, 0% và 0 USD trong khi dữ liệu
 * vẫn nằm đủ trong DB. Không có lỗi, không có cảnh báo; người dùng chỉ thấy một màn hình trống
 * và kết luận là hệ thống chưa chạy.
 *
 * Chỉ đẩy khi `to` là ngày trần `YYYY-MM-DD`. Nếu người gọi đã truyền cả giờ thì tôn trọng
 * nguyên văn — họ đang chỉ định một mốc chính xác, không phải một ngày.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  let toDate: Date;
  if (to && DATE_ONLY.test(to.trim())) {
    toDate = new Date(`${to.trim()}T23:59:59.999Z`);
  } else {
    toDate = to ? new Date(to) : new Date();
  }
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 3600 * 1000);
  return { from: fromDate, to: toDate };
}
