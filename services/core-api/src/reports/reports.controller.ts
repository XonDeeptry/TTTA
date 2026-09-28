import { BadRequestException, Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { canSeeEngine, CostTotals, mergeCostAcrossProviders } from '../lib/hide-engine';
import { parseRange } from './date-range';
import { toCsv, toXlsxBuffer } from './report-export';
import { CostRow, ReportsService, SubmissionRateRow } from './reports.service';

async function respondExport(res: Response, format: string | undefined, rows: Record<string, unknown>[], filename: string): Promise<void> {
  if (format === 'xlsx') {
    const buffer = await toXlsxBuffer(rows, filename);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    });
    res.send(buffer);
    return;
  }
  if (format === 'csv' || format === undefined) {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    });
    res.send(toCsv(rows));
    return;
  }
  throw new BadRequestException(`unknown export format: ${format}`);
}

/** Phân hệ 4 (mục 3.7) — cả admin lẫn staff. */
@Controller('reports')
@UseGuards(SessionAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('submission-rate')
  async submissionRate(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('className') className?: string,
  ): Promise<SubmissionRateRow[]> {
    const range = parseRange(from, to);
    return this.reports.submissionRate(range.from, range.to, className);
  }

  @Get('submission-rate/export')
  async exportSubmissionRate(
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('className') className?: string,
  ): Promise<void> {
    const range = parseRange(from, to);
    const rows = await this.reports.submissionRate(range.from, range.to, className);
    await respondExport(res, format, rows as unknown as Record<string, unknown>[], 'ty-le-nop-bai');
  }

  // Staff thấy tổng chi phí theo ngày nhưng KHÔNG thấy provider nào (lib/hide-engine.ts).
  private async costFor(req: Request, from?: string, to?: string): Promise<CostRow[] | CostTotals[]> {
    const range = parseRange(from, to);
    const rows = await this.reports.cost(range.from, range.to);
    return canSeeEngine(req.session.user?.role) ? rows : mergeCostAcrossProviders(rows);
  }

  @Get('cost')
  cost(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string): Promise<CostRow[] | CostTotals[]> {
    return this.costFor(req, from, to);
  }

  @Get('cost/export')
  async exportCost(
    @Req() req: Request,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const rows = await this.costFor(req, from, to);
    await respondExport(res, format, rows as unknown as Record<string, unknown>[], 'chi-phi-llm');
  }

}
