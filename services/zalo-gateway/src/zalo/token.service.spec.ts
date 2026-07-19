import { TokenService } from './token.service';

type RedisStub = {
  getRefreshToken: jest.Mock;
  getConfig: jest.Mock;
  setTokens: jest.Mock;
  setTokenAlert: jest.Mock;
  seedTokensIfEmpty: jest.Mock;
};

describe('TokenService.refreshNow', () => {
  let redis: RedisStub;
  let service: TokenService;

  beforeEach(() => {
    redis = {
      getRefreshToken: jest.fn().mockResolvedValue('old-refresh'),
      getConfig: jest.fn(async (key: string) =>
        ({ 'zalo.app_id': 'app-1', 'zalo.app_secret': 'secret-1' })[key] ?? null,
      ),
      setTokens: jest.fn().mockResolvedValue(undefined),
      setTokenAlert: jest.fn().mockResolvedValue(undefined),
      seedTokensIfEmpty: jest.fn().mockResolvedValue(undefined),
    };
    service = new TokenService(redis as never);
  });

  it('stores the new token pair on success', async () => {
    service.fetchFn = jest.fn().mockResolvedValue({
      json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: '3600' }),
    }) as never;

    await expect(service.refreshNow()).resolves.toBe(true);
    expect(redis.setTokens).toHaveBeenCalledWith('new-access', 'new-refresh', 3600);
    expect(redis.setTokenAlert).not.toHaveBeenCalled();
  });

  it('does nothing when credentials are not yet configured via dashboard', async () => {
    redis.getConfig = jest.fn().mockResolvedValue(null);
    await expect(service.refreshNow()).resolves.toBe(false);
    expect(redis.setTokens).not.toHaveBeenCalled();
    expect(redis.setTokenAlert).not.toHaveBeenCalled();
  });

  it('raises the alert flag after 2 consecutive failures (bot sắp chết)', async () => {
    service.fetchFn = jest.fn().mockResolvedValue({
      json: async () => ({ error: -14014, error_name: 'invalid refresh token' }),
    }) as never;

    await expect(service.refreshNow()).resolves.toBe(false);
    expect(redis.setTokenAlert).not.toHaveBeenCalled(); // lần 1: chưa cảnh báo

    await expect(service.refreshNow()).resolves.toBe(false);
    expect(redis.setTokenAlert).toHaveBeenCalledTimes(1); // lần 2: cảnh báo
  });

  it('resets the failure counter after a success', async () => {
    const fail = { json: async () => ({ error: -1 }) };
    const ok = { json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce(fail);
    service.fetchFn = fetchMock as never;

    await service.refreshNow(); // fail #1
    await service.refreshNow(); // success — reset
    await service.refreshNow(); // fail #1 again
    expect(redis.setTokenAlert).not.toHaveBeenCalled();
  });
});
