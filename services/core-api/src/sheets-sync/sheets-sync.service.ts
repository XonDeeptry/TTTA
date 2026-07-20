import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';
import { GoogleSheetsClient } from './google-sheets-client';
import { SHEETS_CLIENT_FACTORY, SheetRow, SheetsClient, SheetsClientFactory } from './sheets-client';

interface RowError {
  code: string;
  reason: string;
}

/**
 * PostgreSQL là nguồn sự thật duy nhất; Sheets chỉ là kênh nhập liệu quen tay cho tư vấn
 * (Tranh luận 2). Cron 15 phút/lần, lỗi từng dòng được GHI LẠI chứ không nuốt im lặng.
 */
@Injectable()
export class SheetsSyncService {
  private readonly logger = new Logger(SheetsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(SHEETS_CLIENT_FACTORY) private readonly clientFactory: SheetsClientFactory,
  ) {}

  @Cron('0 */15 * * * *')
  async syncNow(): Promise<void> {
    const serviceAccountJson = await this.settings.getRaw('sheets.service_account_json');
    const spreadsheetId = await this.settings.getRaw('sheets.spreadsheet_id');
    if (!serviceAccountJson || !spreadsheetId) {
      this.logger.debug('Sheets chưa cấu hình (settings) — bỏ qua lần sync này');
      return;
    }

    const client = this.clientFactory(serviceAccountJson);
    let rows: SheetRow[];
    try {
      rows = await client.fetchRows(spreadsheetId);
    } catch (err) {
      await this.prisma.sheetSyncLog.create({
        data: { rowsOk: 0, rowsError: 0, errorDetail: { fetchError: (err as Error).message } },
      });
      this.logger.error(`Sheets fetch thất bại: ${(err as Error).message}`);
      return;
    }

    const errors: RowError[] = [];
    let rowsOk = 0;
    for (const row of rows) {
      try {
        await this.upsertRow(row);
        rowsOk += 1;
      } catch (err) {
        errors.push({ code: row.code, reason: (err as Error).message });
      }
    }

    await this.prisma.sheetSyncLog.create({
      data: { rowsOk, rowsError: errors.length, errorDetail: errors.length ? (errors as object[]) : undefined },
    });
    if (errors.length > 0) {
      this.logger.warn(`Sheets sync: ${errors.length} dòng lỗi — xem sheet_sync_log`);
    }
  }

  private async upsertRow(row: SheetRow): Promise<void> {
    if (!/^0\d{9,10}$/.test(row.phone)) throw new Error(`SĐT không hợp lệ: "${row.phone}"`);
    const course = await this.prisma.course.findUnique({ where: { key: row.courseKey } });
    if (!course) throw new Error(`Khóa "${row.courseKey}" không tồn tại trong courses`);
    await this.prisma.student.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        fullName: row.fullName,
        phone: row.phone,
        courseId: course.id,
        className: row.className,
        campus: row.campus,
        syncedFromSheetAt: new Date(),
      },
      update: {
        fullName: row.fullName,
        phone: row.phone,
        courseId: course.id,
        className: row.className,
        campus: row.campus,
        syncedFromSheetAt: new Date(),
      },
    });
  }
}

export const realSheetsClientFactory: SheetsClientFactory = (serviceAccountJson) =>
  new GoogleSheetsClient(serviceAccountJson) as SheetsClient;
