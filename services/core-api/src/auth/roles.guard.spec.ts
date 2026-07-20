import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function contextWithRole(role: string | undefined, requiredRoles: string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ session: { user: role ? { role } : undefined } }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  // note: requiredRoles is applied via the mocked reflector below, not read from context here
  void requiredRoles;
}

describe('RolesGuard', () => {
  function makeGuard(required: string[] | undefined) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) };
    return new RolesGuard(reflector as never);
  }

  it('allows any logged-in role when no @Roles() metadata is set', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(contextWithRole('staff', undefined))).toBe(true);
  });

  it('allows a matching role', () => {
    const guard = makeGuard(['admin']);
    expect(guard.canActivate(contextWithRole('admin', ['admin']))).toBe(true);
  });

  it('rejects a non-matching role', () => {
    const guard = makeGuard(['admin']);
    expect(() => guard.canActivate(contextWithRole('staff', ['admin']))).toThrow(ForbiddenException);
  });

  it('rejects when there is no session user at all', () => {
    const guard = makeGuard(['admin']);
    expect(() => guard.canActivate(contextWithRole(undefined, ['admin']))).toThrow(ForbiddenException);
  });
});
