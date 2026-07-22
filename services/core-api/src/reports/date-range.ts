/** Khoảng thời gian mặc định cho báo cáo/analytics (mục 3.7 phân hệ 4). Tách ra khỏi
 * reports.controller để cả AnalyticsController dùng chung — hành vi giữ nguyên byte-for-byte. */
export const DEFAULT_RANGE_DAYS = 30;

export function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 3600 * 1000);
  return { from: fromDate, to: toDate };
}
