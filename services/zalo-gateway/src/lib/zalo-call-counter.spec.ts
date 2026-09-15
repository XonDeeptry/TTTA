import { DAY_TTL_SEC, MINUTE_TTL_SEC, recordZaloCall, vnDate, zaloDayKey, zaloMinuteKey } from './zalo-call-counter';

function fakeMulti() {
  const calls: unknown[][] = [];
  const tx: Record<string, unknown> = {};
  for (const op of ['hincrby', 'expire']) {
    tx[op] = (...args: unknown[]) => {
      calls.push([op, ...args]);
      return tx;
    };
  }
  tx.exec = jest.fn().mockResolvedValue([]);
  return { client: { multi: () => tx } as never, calls, tx };
}

describe('zalo-call-counter', () => {
  // 2026-09-14T17:30:00Z = 00:30 ngày 15/09 giờ Việt Nam
  const AT = Date.UTC(2026, 8, 14, 17, 30, 0);

  it('keys: one per minute, and the DAY follows Vietnam time, not UTC', () => {
    expect(zaloMinuteKey(AT)).toBe(`zalo:api:m:${Math.floor(AT / 60_000)}`);
    expect(zaloMinuteKey(AT + 59_999)).toBe(zaloMinuteKey(AT));
    expect(vnDate(AT)).toBe('2026-09-15');
    expect(zaloDayKey(AT)).toBe('zalo:api:d:2026-09-15');
  });

  it('counts total and endpoint in both the minute and the day bucket, with TTLs', () => {
    const { client, calls, tx } = fakeMulti();
    recordZaloCall(client, 'message_cs', 0, AT);
    const m = zaloMinuteKey(AT);
    const d = zaloDayKey(AT);
    expect(calls).toEqual([
      ['hincrby', m, 'total', 1],
      ['hincrby', m, 'ep:message_cs', 1],
      ['expire', m, MINUTE_TTL_SEC],
      ['hincrby', d, 'total', 1],
      ['hincrby', d, 'ep:message_cs', 1],
      ['expire', d, DAY_TTL_SEC],
    ]);
    expect(tx.exec).toHaveBeenCalledTimes(1);
  });

  it('a non-zero Zalo error code is counted separately; 0 is not an error', () => {
    const { client, calls } = fakeMulti();
    recordZaloCall(client, 'message_cs', -210, AT);
    expect(calls).toContainEqual(['hincrby', zaloMinuteKey(AT), 'err:-210', 1]);
    expect(calls).toContainEqual(['hincrby', zaloDayKey(AT), 'err:-210', 1]);
  });

  it('never throws and never breaks a real call: no client, a throwing client, a failing exec', () => {
    expect(() => recordZaloCall(undefined, 'oauth_token')).not.toThrow();
    expect(() => recordZaloCall({} as never, 'oauth_token')).not.toThrow();
    expect(() =>
      recordZaloCall({ multi: () => { throw new Error('redis down'); } } as never, 'oauth_token'),
    ).not.toThrow();
    const { client, tx } = fakeMulti();
    (tx.exec as jest.Mock).mockRejectedValue(new Error('exec failed'));
    expect(() => recordZaloCall(client, 'getoa')).not.toThrow();
  });
});
