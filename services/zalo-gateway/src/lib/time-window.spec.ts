import { canSendWithin48h, DEFAULT_MARGIN_MS, WINDOW_48H_MS } from './time-window';

describe('canSendWithin48h', () => {
  const now = 1_800_000_000_000;

  it('blocks when no inbound has ever been recorded', () => {
    expect(canSendWithin48h(null, now)).toBe(false);
  });

  it('allows right after an inbound message', () => {
    expect(canSendWithin48h(now - 1000, now)).toBe(true);
  });

  it('allows just inside the window minus margin', () => {
    const lastInbound = now - (WINDOW_48H_MS - DEFAULT_MARGIN_MS - 1000);
    expect(canSendWithin48h(lastInbound, now)).toBe(true);
  });

  it('blocks inside the safety margin (không âm thầm phát sinh phí)', () => {
    const lastInbound = now - (WINDOW_48H_MS - DEFAULT_MARGIN_MS + 1000);
    expect(canSendWithin48h(lastInbound, now)).toBe(false);
  });

  it('blocks well past 48h', () => {
    expect(canSendWithin48h(now - WINDOW_48H_MS * 2, now)).toBe(false);
  });
});
