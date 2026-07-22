import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { parseRange } from './date-range';
import { toCsv, toXlsxBuffer } from './report-export';
import { CostRow, PilotComparisonRow, ReportsService, SubmissionRateRow } from './reports.service';

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

  @Get('cost')
  async cost(@Query('from') from?: string, @Query('to') to?: string): Promise<CostRow[]> {
    const range = parseRange(from, to);
    return this.reports.cost(range.from, range.to);
  }

  @Get('cost/export')
  async exportCost(
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseRange(from, to);
    const rows = await this.reports.cost(range.from, range.to);
    await respondExport(res, format, rows as unknown as Record<string, unknown>[], 'chi-phi-llm');
  }

  @Get('pilot-comparison')
  async pilotComparison(@Query('from') from?: string, @Query('to') to?: string): Promise<PilotComparisonRow[]> {
    const range = parseRange(from, to);
    return this.reports.pilotComparison(range.from, range.to);
  }

  @Get('pilot-comparison/export')
  async exportPilotComparison(
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseRange(from, to);
    const rows = await this.reports.pilotComparison(range.from, range.to);
    await respondExport(res, format, rows as unknown as Record<string, unknown>[], 'pilot-so-sanh');
  }
}
