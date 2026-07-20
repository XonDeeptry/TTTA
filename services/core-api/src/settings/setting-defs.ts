export type SettingKind = 'string' | 'boolean' | 'number';

export interface SettingDef {
  key: string;
  kind: SettingKind;
  masked: boolean;
}

/**
 * Danh sách khóa cấu hình cố định (mục 3.3/3.7 v1.2) — màn Cấu hình là một form theo các
 * trường đã biết, không phải một trình sửa key-value tự do.
 */
export const SETTING_DEFS: SettingDef[] = [
  { key: 'zalo.app_id', kind: 'string', masked: false },
  { key: 'zalo.app_secret', kind: 'string', masked: true },
  { key: 'zalo.oa_id', kind: 'string', masked: false },
  { key: 'zalo.webhook_secret', kind: 'string', masked: true },
  { key: 'llm.gemini_api_key', kind: 'string', masked: true },
  { key: 'llm.openai_api_key', kind: 'string', masked: true },
  { key: 'limits.outbound_48h_guard', kind: 'boolean', masked: false },
  { key: 'limits.max_clip_duration_sec', kind: 'number', masked: false },
  { key: 'sheets.service_account_json', kind: 'string', masked: true },
  { key: 'sheets.spreadsheet_id', kind: 'string', masked: false },
  { key: 'internal.worker_api_token', kind: 'string', masked: true },
];

export function findSettingDef(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((d) => d.key === key);
}
