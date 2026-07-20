import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';

function contextWithSession(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ session: { user } }) }),
  } as unknown as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  const guard = new SessionAuthGuard();

  it('allows a request with a logged-in session user', () => {
    expect(guard.canActivate(contextWithSession({ id: 1, email: 'a@ilm.edu.vn', role: 'staff' }))).toBe(true);
  });

  it('rejects a request with no session user', () => {
    expect(() => guard.canActivate(contextWithSession(undefined))).toThrow(UnauthorizedException);
  });
});
