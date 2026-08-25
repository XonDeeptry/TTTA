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
  // F11 (OQ-1): rỗng/chưa đặt = KHÔNG gửi trường `template_type` trong payload nút (shape đã xác
  // minh 2026-08-19). Chỉ đặt giá trị nếu OA thật từ chối payload chỉ-có-buttons — sửa được từ
  // dashboard, không cần deploy lại.
  { key: 'zalo.buttons_template_type', kind: 'string', masked: false },
  { key: 'llm.gemini_api_key', kind: 'string', masked: true },
  { key: 'llm.openai_api_key', kind: 'string', masked: true },
  // Chọn model cho TỪNG provider từ dashboard. Trước đây tên model bị hardcode trong
  // `grading-worker/.../providers/factory.py`, và ngày 2026-08-25 Google đã ngừng cấp
  // `gemini-2.5-flash` cho người dùng mới -> mọi lượt chấm 404 cho tới khi sửa code + deploy lại.
  // Để trống = dùng mặc định trong code. Màn Cấu hình gợi ý danh sách model LẤY TRỰC TIẾP từ
  // provider (GET /settings/llm-models/:provider) nhưng vẫn cho gõ tay, để một danh sách lỗi thời
  // không bao giờ chặn được người dùng.
  { key: 'llm.gemini_model', kind: 'string', masked: false },
  { key: 'llm.openai_model', kind: 'string', masked: false },
  // Nhiệt độ mặc định khi `courses.llm_config` không chỉ định. Trước đây hardcode 0.3; chấm thử
  // 2026-08-25 cho thấy cùng một clip có thể lệch 2 band giữa hai lần chấm, nên đây là núm vặn
  // đầu tiên cần thử khi muốn điểm ổn định hơn (0 = tất định nhất).
  { key: 'llm.temperature', kind: 'number', masked: false },
  // Bảng giá bổ sung/ghi đè cho `pricing.py`, dạng JSON {"<model>": [usd_input_1M, usd_output_1M]}.
  // Model chọn được từ UI mà bảng giá lại hardcode thì `est_usd` sẽ về 0 và cảnh báo ngưỡng chi phí
  // (mục 3.12) im lặng — đây là chỗ điền đơn giá thật mà không cần sửa code.
  { key: 'llm.pricing_json', kind: 'string', masked: false },
  { key: 'limits.outbound_48h_guard', kind: 'boolean', masked: false },
  { key: 'limits.pilot_dual_grading', kind: 'boolean', masked: false },
  { key: 'limits.max_clip_duration_sec', kind: 'number', masked: false },
  { key: 'limits.media_retention_days', kind: 'number', masked: false },
  { key: 'sheets.service_account_json', kind: 'string', masked: true },
  { key: 'sheets.spreadsheet_id', kind: 'string', masked: false },
  { key: 'internal.worker_api_token', kind: 'string', masked: true },
];

export function findSettingDef(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((d) => d.key === key);
}
