import type { DashboardRole } from '../auth/session.types';

/**
 * Chỉ admin được biết engine nào chạy phía sau (Gemini/OpenAI…) — chủ dự án 2026-09-28: học
 * thuật (staff) không được thấy. Lọc ở API chứ không chỉ ẩn cột trên dashboard: staff vẫn gọi
 * được `GET /courses` (ô chọn khóa ở Học viên/Tiêu chí) và `GET /reports/cost`.
 */
export function canSeeEngine(role: DashboardRole | undefined): boolean {
  return role === 'admin';
}

/** Bỏ `llmConfig` khỏi từng khóa — staff chỉ cần id/key để chọn khóa. */
export function withoutLlmConfig<T extends { llmConfig?: unknown }>(rows: T[]): Omit<T, 'llmConfig'>[] {
  return rows.map(({ llmConfig: _omit, ...rest }) => rest);
}

export interface CostTotals {
  date: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/** Gộp các dòng chi phí theo ngày, bỏ cột `provider` — tổng tiền giữ nguyên. */
export function mergeCostAcrossProviders(rows: (CostTotals & { provider: string })[]): CostTotals[] {
  const byDate = new Map<string, CostTotals>();
  for (const r of rows) {
    const e = byDate.get(r.date) ?? { date: r.date, totalUsd: 0, inputTokens: 0, outputTokens: 0 };
    e.totalUsd = Math.round((e.totalUsd + r.totalUsd) * 1_000_000) / 1_000_000;
    e.inputTokens += r.inputTokens;
    e.outputTokens += r.outputTokens;
    byDate.set(r.date, e);
  }
  return Array.from(byDate.values());
}
