import { google } from 'googleapis';
import { SheetRow, SheetsClient } from './sheets-client';

/** Cột A-F trong tab DanhSach: mã HV, họ tên, SĐT, khóa, lớp, cơ sở (mục tranh luận 2 & 3.4). */
const SHEET_RANGE = 'DanhSach!A2:F';

export class GoogleSheetsClient implements SheetsClient {
  constructor(private readonly serviceAccountJson: string) {}

  async fetchRows(spreadsheetId: string): Promise<SheetRow[]> {
    const credentials = JSON.parse(this.serviceAccountJson) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: SHEET_RANGE });
    const rows = res.data.values ?? [];
    return rows
      .filter((r) => r[0])
      .map((r) => ({
        code: String(r[0]),
        fullName: String(r[1] ?? ''),
        phone: String(r[2] ?? ''),
        courseKey: String(r[3] ?? ''),
        className: r[4] ? String(r[4]) : undefined,
        campus: r[5] ? String(r[5]) : undefined,
      }));
  }
}
