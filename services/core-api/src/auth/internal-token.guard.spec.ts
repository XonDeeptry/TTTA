import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard';

function contextWithHeader(token: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => (name === 'x-internal-token' ? token : undefined) }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalTokenGuard', () => {
  const originalEnv = process.env.INTERNAL_API_TOKEN;
  let settings: { getRaw: jest.Mock };
  let guard: InternalTokenGuard;

  beforeEach(() => {
    settings = { getRaw: jest.fn().mockResolvedValue(null) };
    guard = new InternalTokenGuard(settings as never);
  });

  afterEach(() => {
    process.env.INTERNAL_API_TOKEN = originalEnv;
  });

  it('rejects when no token is configured anywhere (fails closed)', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    await expect(guard.canActivate(contextWithHeader('anything'))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the header is missing', async () => {
    process.env.INTERNAL_API_TOKEN = 'expected-token';
    await expect(guard.canActivate(contextWithHeader(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a mismatched token', async () => {
    process.env.INTERNAL_API_TOKEN = 'expected-token';
    await expect(guard.canActivate(contextWithHeader('wrong-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('accepts the env fallback token when settings has none (dev)', async () => {
    process.env.INTERNAL_API_TOKEN = 'expected-token';
    await expect(guard.canActivate(contextWithHeader('expected-token'))).resolves.toBe(true);
  });

  it('prefers the settings-stored token over the env fallback', async () => {
    process.env.INTERNAL_API_TOKEN = 'env-token';
    settings.getRaw.mockResolvedValue('db-token');
    await expect(guard.canActivate(contextWithHeader('db-token'))).resolves.toBe(true);
    await expect(guard.canActivate(contextWithHeader('env-token'))).rejects.toThrow(UnauthorizedException);
  });
});
