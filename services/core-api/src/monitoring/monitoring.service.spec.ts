import { Q_OUTBOUND, Q_SUBMISSIONS } from '../contracts';
import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  let rabbit: { queueDepth: jest.Mock };
  let redis: { client: { get: jest.Mock } };
  let service: MonitoringService;

  beforeEach(() => {
    rabbit = { queueDepth: jest.fn().mockResolvedValue(0) };
    redis = { client: { get: jest.fn().mockResolvedValue(null) } };
    service = new MonitoringService(rabbit as never, redis as never);
  });

  it('reports main and dlq depth for both queues', async () => {
    rabbit.queueDepth.mockImplementation((name: string) => Promise.resolve(name.endsWith('.dlq') ? 2 : 5));

    const depths = await service.queueDepths();

    expect(depths).toEqual([
      { queue: Q_SUBMISSIONS, mainDepth: 5, dlqDepth: 2 },
      { queue: Q_OUTBOUND, mainDepth: 5, dlqDepth: 2 },
    ]);
  });

  it('reports no access token and no alert when Redis has neither', async () => {
    const status = await service.tokenStatus();
    expect(status).toEqual({ hasAccessToken: false, expiresAt: null, alert: null });
  });

  it('reports token present and surfaces the failure alert', async () => {
    redis.client.get.mockImplementation((key: string) => {
      if (key === 'zalo:access_token') return Promise.resolve('some-token');
      if (key === 'zalo:token_expires_at') return Promise.resolve('1234567890');
      if (key === 'alert:zalo_token_failed') return Promise.resolve('{"reason":"refresh failed"}');
      return Promise.resolve(null);
    });

    const status = await service.tokenStatus();
    expect(status.hasAccessToken).toBe(true);
    expect(status.expiresAt).toBe('1234567890');
    expect(status.alert).toContain('refresh failed');
  });

  it('reports no disk alert when Redis has none', async () => {
    const status = await service.diskStatus();
    expect(status).toEqual({ alert: null });
  });

  it('surfaces the disk-high alert from Redis', async () => {
    redis.client.get.mockImplementation((key: string) =>
      key === 'alert:media_disk_high' ? Promise.resolve('{"pct":90,"at":"2026-07-22T03:15:00.000Z"}') : Promise.resolve(null),
    );

    const status = await service.diskStatus();
    expect(status.alert).toContain('90');
  });
});

describe('MonitoringService.zaloApiUsage', () => {
  // 2026-09-15 10:30 giờ Việt Nam = 03:30Z
  const NOW = Date.UTC(2026, 8, 15, 3, 30, 0);
  const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

  function serviceWith(minuteTotals: Record<number, number>, dayHashes: Record<string, Record<string, string>>) {
    const ops: [string, string][] = [];
    const pipe = {
      hget: (key: string) => {
        ops.push(['hget', key]);
        return pipe;
      },
      hgetall: (key: string) => {
        ops.push(['hgetall', key]);
        return pipe;
      },
      exec: jest.fn(async () =>
        ops.map(([op, key]) => {
          if (op === 'hgetall') return [null, dayHashes[key.slice('zalo:api:d:'.length)] ?? {}];
          const m = Number(key.slice('zalo:api:m:'.length));
          return [null, minuteTotals[m] === undefined ? null : String(minuteTotals[m])];
        }),
      ),
    };
    const redis = { client: { pipeline: () => pipe } };
    return { service: new MonitoringService({} as never, redis as never), ops };
  }

  it('finds the PEAK minute (not just the daily total), per day and over the week, in Vietnam dates', async () => {
    const { service } = serviceWith(
      {
        [minute('2026-09-15T02:00:00Z')]: 5, // 09:00 VN hôm nay
        [minute('2026-09-15T02:07:00Z')]: 12, // 09:07 VN hôm nay — đỉnh hôm nay
        [minute('2026-09-14T13:00:00Z')]: 30, // 20:00 VN hôm qua — đỉnh tuần
      },
      { '2026-09-15': { total: '17', 'ep:message_cs': '15', 'ep:user_detail': '2', 'err:-210': '1' } },
    );

    const usage = await service.zaloApiUsage(NOW);

    expect(usage.plans).toEqual([100, 2000]);
    expect(usage.today).toEqual({
      date: '2026-09-15',
      total: 17,
      byEndpoint: { message_cs: 15, user_detail: 2 },
      errors: { '-210': 1 },
      peakPerMinute: 12,
      peakAt: '2026-09-15T02:07:00.000Z',
    });
    expect(usage.days.map((d) => d.date)).toEqual([
      '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
    ]);
    // Hash ngày hôm qua vắng ⇒ tổng lấy từ các bucket phút
    expect(usage.days[5]).toEqual({ date: '2026-09-14', total: 30, peakPerMinute: 30, peakAt: '2026-09-14T13:00:00.000Z' });
    expect(usage.weekPeak).toEqual({ perMinute: 30, at: '2026-09-14T13:00:00.000Z' });
  });

  it('24 hourly buckets ending with the current hour, each with total and peak', async () => {
    const { service } = serviceWith(
      { [minute('2026-09-15T03:10:00Z')]: 4, [minute('2026-09-15T03:20:00Z')]: 9 },
      {},
    );
    const { hours } = await service.zaloApiUsage(NOW);
    expect(hours).toHaveLength(24);
    expect(hours[23]).toEqual({ start: '2026-09-15T03:00:00.000Z', total: 13, peakPerMinute: 9 });
    expect(hours[0].start).toBe('2026-09-14T04:00:00.000Z');
  });

  it('no calls recorded ⇒ zeros and null peaks, never NaN', async () => {
    const { service, ops } = serviceWith({}, {});
    const usage = await service.zaloApiUsage(NOW);
    expect(usage.today).toMatchObject({ total: 0, peakPerMinute: 0, peakAt: null, byEndpoint: {}, errors: {} });
    expect(usage.weekPeak).toEqual({ perMinute: 0, at: null });
    // 6 ngày trước + 10 giờ 30 phút hôm nay, tính cả phút hiện tại; + 7 hash ngày
    expect(ops.filter(([op]) => op === 'hget')).toHaveLength(6 * 1440 + 10 * 60 + 30 + 1);
    expect(ops.filter(([op]) => op === 'hgetall')).toHaveLength(7);
  });
});
