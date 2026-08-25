import {
  BUTTON_ACTIONS,
  DLX,
  EXCHANGE,
  ILM_PAYLOAD_PREFIX,
  MAX_BUTTONS,
  MAX_BUTTON_PAYLOAD_LEN,
  MAX_BUTTON_TITLE_LEN,
  MAX_OUTBOUND_TEXT_LEN,
  MAX_RETRIES,
  Q_OUTBOUND,
  Q_SUBMISSIONS,
  RETRY_EXCHANGE,
  RETRY_TTL_MS,
} from './contracts';

/**
 * F11 AC-01.4 — bản sao thứ hai của cùng bộ hằng số (gateway TS / core-api TS / worker Python).
 * Test này cố ý TRÙNG với `zalo-gateway/src/contracts.spec.ts` và `tests/test_contracts.py`:
 * một lỗi gõ ở một bản làm nút chết âm thầm, nên phải có lưới đỡ ở cả ba nơi.
 */
describe('contracts — F11 button constants', () => {
  it('AC-01.4 — the closed action set and prefix are exactly these values', () => {
    expect(ILM_PAYLOAD_PREFIX).toBe('#ilm:');
    expect([...BUTTON_ACTIONS]).toEqual(['ack', 'request_advisor', 'select_student']);
  });

  it('AC-01.3 — the four Zalo limits match the gateway/Python copies', () => {
    expect(MAX_BUTTONS).toBe(5);
    expect(MAX_BUTTON_TITLE_LEN).toBe(100);
    expect(MAX_BUTTON_PAYLOAD_LEN).toBe(1000);
    expect(MAX_OUTBOUND_TEXT_LEN).toBe(2000);
  });

  it('AC-01.7 — no pre-F11 topology constant changed value', () => {
    expect(EXCHANGE).toBe('ilm.direct');
    expect(DLX).toBe('ilm.dlx');
    expect(RETRY_EXCHANGE).toBe('ilm.retry');
    expect(Q_SUBMISSIONS).toBe('submissions');
    expect(Q_OUTBOUND).toBe('outbound');
    expect(MAX_RETRIES).toBe(3);
    expect(RETRY_TTL_MS).toBe(30_000);
  });
});
