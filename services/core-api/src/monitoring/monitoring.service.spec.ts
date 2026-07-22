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
