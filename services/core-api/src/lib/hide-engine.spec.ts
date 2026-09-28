import { canSeeEngine, mergeCostAcrossProviders, withoutLlmConfig } from './hide-engine';

describe('hide-engine — staff không được biết engine chạy phía sau', () => {
  it('chỉ admin thấy engine; staff và phiên thiếu role đều không', () => {
    expect(canSeeEngine('admin')).toBe(true);
    expect(canSeeEngine('staff')).toBe(false);
    expect(canSeeEngine(undefined)).toBe(false);
  });

  it('withoutLlmConfig bỏ llmConfig nhưng giữ mọi trường còn lại', () => {
    const out = withoutLlmConfig([{ id: 1, key: 'basic', llmConfig: { provider: 'gemini' }, isActive: true }]);
    expect(out).toEqual([{ id: 1, key: 'basic', isActive: true }]);
    expect(JSON.stringify(out)).not.toContain('gemini');
  });

  it('mergeCostAcrossProviders gộp theo ngày, bỏ provider, tổng tiền không đổi', () => {
    const out = mergeCostAcrossProviders([
      { date: '2026-09-27', provider: 'gemini', totalUsd: 0.1, inputTokens: 10, outputTokens: 1 },
      { date: '2026-09-27', provider: 'openai', totalUsd: 0.2, inputTokens: 20, outputTokens: 2 },
      { date: '2026-09-28', provider: 'gemini', totalUsd: 0.05, inputTokens: 5, outputTokens: 0 },
    ]);
    expect(out).toEqual([
      { date: '2026-09-27', totalUsd: 0.3, inputTokens: 30, outputTokens: 3 },
      { date: '2026-09-28', totalUsd: 0.05, inputTokens: 5, outputTokens: 0 },
    ]);
    expect(out.every((r) => !('provider' in r))).toBe(true);
  });
});
