export interface SheetRow {
  code: string;
  fullName: string;
  phone: string;
  courseKey: string;
  className?: string;
  campus?: string;
}

export interface SheetsClient {
  fetchRows(spreadsheetId: string): Promise<SheetRow[]>;
}

/** Factory injectable qua DI token — cho phép test thay bằng client giả lập fixture rows. */
export const SHEETS_CLIENT_FACTORY = 'SHEETS_CLIENT_FACTORY';
export type SheetsClientFactory = (serviceAccountJson: string) => SheetsClient;
