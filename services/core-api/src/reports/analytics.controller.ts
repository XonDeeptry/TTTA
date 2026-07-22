import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { parseRange } from './date-range';
import {
  ClassPerformanceRow,
  DimensionRow,
  KpiSummary,
  PendingReviewSummary,
  ReportsService,
  TrendBucket,
  TrendSeries,
} from './reports.service';

/** F7 — dashboard analytics (mục 3.7 phân hệ 4): CHỈ ĐỌC, cộng thêm trên reports/. Cả admin lẫn
 * staff (SessionAuthGuard, KHÔNG admin-only). Không đổi schema, không đổi /reports/* hiện có. */
@Controller('analytics')
@UseGuards(SessionAuthGuard)
export class AnalyticsController {
  constructor(private readonly reports: ReportsService) {}

  /** GET /analytics/kpis?from&to → 6 KPI card (khoảng mặc định 30 ngày). */
  @Get('kpis')
  async kpis(@Query('from') from?: string, @Query('to') to?: string): Promise<KpiSummary> {
    const range = parseRange(from, to);
    return this.reports.kpis(range.from, range.to);
  }

  /** GET /analytics/trends?from&to&bucket=day|week → 3 chuỗi chart-ready (dãy dày). */
  @Get('trends')
  async trends(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: string,
  ): Promise<TrendSeries> {
    const range = parseRange(from, to);
    const b: TrendBucket = bucket === 'week' ? 'week' : 'day';
    return this.reports.trends(range.from, range.to, b);
  }

  /** GET /analytics/class-performance?from&to → mỗi lớp một dòng, lớp yếu nhất lên đầu. */
  @Get('class-performance')
  async classPerformance(@Query('from') from?: string, @Query('to') to?: string): Promise<ClassPerformanceRow[]> {
    const range = parseRange(from, to);
    return this.reports.classPerformance(range.from, range.to);
  }

  /** GET /analytics/dimension-breakdown?from&to → điểm TB theo từng tiêu chí, yếu nhất lên đầu. */
  @Get('dimension-breakdown')
  async dimensionBreakdown(@Query('from') from?: string, @Query('to') to?: string): Promise<DimensionRow[]> {
    const range = parseRange(from, to);
    return this.reports.dimensionBreakdown(range.from, range.to);
  }

  /** GET /analytics/pending-review → snapshot tồn đọng chờ duyệt (KHÔNG nhận tham số khoảng — BR-03). */
  @Get('pending-review')
  async pendingReview(): Promise<PendingReviewSummary> {
    return this.reports.pendingReview();
  }
}
