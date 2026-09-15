import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GradingsController } from './gradings.controller';

/**
 * ILM 09-15: số liệu AI ↔ giáo viên chỉ dành cho Chủ tịch / vận hành (admin), như trang Giám sát.
 * Giáo viên (staff) vẫn phải sửa và gửi bài được.
 */
describe('GradingsController access', () => {
  const proto = GradingsController.prototype;

  function contextFor(handler: (...args: never[]) => unknown, role: 'admin' | 'staff'): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => GradingsController,
      switchToHttp: () => ({ getRequest: () => ({ session: { user: { id: 1, email: 'x', role, mustChangePassword: false } } }) }),
    } as unknown as ExecutionContext;
  }

  it('word-review-stats is admin-only: RolesGuard on the handler, staff gets 403', () => {
    expect(Reflect.getMetadata(ROLES_KEY, proto.wordReviewStats)).toEqual(['admin']);
    expect(Reflect.getMetadata('__guards__', proto.wordReviewStats)).toContain(RolesGuard);

    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextFor(proto.wordReviewStats, 'admin'))).toBe(true);
    expect(() => guard.canActivate(contextFor(proto.wordReviewStats, 'staff'))).toThrow(ForbiddenException);
  });

  it('teachers can still review and send: no role restriction on those handlers', () => {
    expect(Reflect.getMetadata(ROLES_KEY, proto.review)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, proto.send)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, GradingsController)).toBeUndefined();
  });
});
