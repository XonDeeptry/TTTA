import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrivilegeGuard } from './privilege.guard';
import { PRIVILEGES_KEY, RequiresPrivilege } from './privilege.decorator';
import { DASHBOARD_PRIVILEGES, effectivePrivileges, isDashboardPrivilege } from './privileges';

/** ExecutionContext giả — chỉ phần session mà guard đụng tới. */
function contextFor(sessionUserId: number | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ session: sessionUserId === undefined ? {} : { user: { id: sessionUserId } } }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

type PrismaMock = { dashboardUser: { findUnique: jest.Mock } };

function makeGuard(required: string[] | undefined, prisma: PrismaMock): PrivilegeGuard {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) };
  return new PrivilegeGuard(reflector as never, prisma as never);
}

describe('FR-08 — allow-list quyền (AC-08.1)', () => {
  it('đúng hai tên, khai báo một lần', () => {
    expect(DASHBOARD_PRIVILEGES).toEqual(['rubric_template', 'criteria_author']);
  });

  it('isDashboardPrivilege chỉ nhận đúng hai chuỗi đó', () => {
    expect(isDashboardPrivilege('rubric_template')).toBe(true);
    expect(isDashboardPrivilege('criteria_author')).toBe(true);
    for (const bad of ['rubric_templates', 'admin', '', 'RUBRIC_TEMPLATE', null, 42, undefined, {}]) {
      expect(isDashboardPrivilege(bad)).toBe(false);
    }
  });

  it('effectivePrivileges: admin ⇒ đủ bộ dù cột rỗng; staff ⇒ đúng mảng đã lưu', () => {
    expect(effectivePrivileges('admin', [])).toEqual(['rubric_template', 'criteria_author']);
    expect(effectivePrivileges('admin', ['criteria_author'])).toEqual([
      'rubric_template',
      'criteria_author',
    ]);
    expect(effectivePrivileges('staff', ['criteria_author'])).toEqual(['criteria_author']);
    expect(effectivePrivileges('staff', [])).toEqual([]);
    expect(effectivePrivileges('staff', null)).toEqual([]);
    expect(effectivePrivileges('staff', undefined)).toEqual([]);
  });
});

describe('FR-08 — @RequiresPrivilege (AC-08.2)', () => {
  it('ghi metadata dưới MỘT khóa duy nhất, nhiều tham số nghĩa là HOẶC', () => {
    class Target {
      @RequiresPrivilege('rubric_template', 'criteria_author')
      handler(): void {}
    }
    const meta = Reflect.getMetadata(PRIVILEGES_KEY, Target.prototype.handler) as string[];
    expect(meta).toEqual(['rubric_template', 'criteria_author']);
  });
});

describe('FR-08 — PrivilegeGuard', () => {
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = { dashboardUser: { findUnique: jest.fn() } };
  });

  it('AC-08.4 không có metadata ⇒ cho qua và KHÔNG chạm DB', async () => {
    await expect(makeGuard(undefined, prisma).canActivate(contextFor(1))).resolves.toBe(true);
    await expect(makeGuard([], prisma).canActivate(contextFor(1))).resolves.toBe(true);
    expect(prisma.dashboardUser.findUnique).not.toHaveBeenCalled();
  });

  it('AC-08.5 không có session.user ⇒ 401 "login required", không chạm DB', async () => {
    const guard = makeGuard(['rubric_template'], prisma);
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow('login required');
    expect(prisma.dashboardUser.findUnique).not.toHaveBeenCalled();
  });

  it('AC-08.6 admin được qua BẤT KỂ mảng privileges chứa gì', async () => {
    for (const privileges of [[], ['criteria_author'], ['rac']]) {
      prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'admin', privileges });
      await expect(makeGuard(['rubric_template'], prisma).canActivate(contextFor(1))).resolves.toBe(true);
    }
  });

  it('AC-08.6 đọc từ POSTGRES theo session.user.id, KHÔNG đọc bản sao trong session (D-1)', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['rubric_template'] });
    await makeGuard(['rubric_template'], prisma).canActivate(contextFor(77));
    expect(prisma.dashboardUser.findUnique).toHaveBeenCalledWith({
      where: { id: 77 },
      select: { role: true, privileges: true },
    });
  });

  it('AC-08.7 staff giữ đúng quyền yêu cầu ⇒ qua', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['criteria_author'] });
    await expect(makeGuard(['criteria_author'], prisma).canActivate(contextFor(2))).resolves.toBe(true);
  });

  it('AC-08.2 nhiều quyền yêu cầu = HOẶC — giữ một cái là đủ', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['criteria_author'] });
    await expect(
      makeGuard(['rubric_template', 'criteria_author'], prisma).canActivate(contextFor(2)),
    ).resolves.toBe(true);
  });

  it('AC-08.8 staff thiếu quyền ⇒ 403 "insufficient privilege" (KHÁC "insufficient role")', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: [] });
    const guard = makeGuard(['rubric_template'], prisma);
    await expect(guard.canActivate(contextFor(2))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(contextFor(2))).rejects.toThrow('insufficient privilege');
  });

  it('AC-08.8 staff giữ quyền KHÁC ⇒ vẫn 403 (hai quyền độc lập, BR-02)', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['criteria_author'] });
    await expect(
      makeGuard(['rubric_template'], prisma).canActivate(contextFor(2)),
    ).rejects.toThrow('insufficient privilege');

    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['rubric_template'] });
    await expect(
      makeGuard(['criteria_author'], prisma).canActivate(contextFor(2)),
    ).rejects.toThrow('insufficient privilege');
  });

  it('AC-08.9 hàng không còn tồn tại ⇒ 403, KHÔNG 500 và KHÔNG cho qua', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue(null);
    await expect(makeGuard(['rubric_template'], prisma).canActivate(contextFor(999))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('AC-08.10 quyền được cấp giữa chừng phiên có hiệu lực ngay request kế tiếp', async () => {
    const guard = makeGuard(['rubric_template'], prisma);
    // Trước khi cấp
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: [] });
    await expect(guard.canActivate(contextFor(5))).rejects.toThrow('insufficient privilege');
    // Admin cấp quyền (chỉ đổi DB, KHÔNG đụng session đang sống)
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['rubric_template'] });
    await expect(guard.canActivate(contextFor(5))).resolves.toBe(true);
    // Thu hồi ⇒ 403 ngay
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: [] });
    await expect(guard.canActivate(contextFor(5))).rejects.toThrow('insufficient privilege');
  });

  it('AC-08.11 chuỗi lạ trong mảng không cấp gì và không gây lỗi', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({
      role: 'staff',
      privileges: ['admin', 'rubric_templates', '*', ''],
    });
    await expect(makeGuard(['rubric_template'], prisma).canActivate(contextFor(2))).rejects.toThrow(
      'insufficient privilege',
    );
  });

  it('AC-08.11 privileges null/không phải mảng (sửa tay trong DB) ⇒ 403, không 500', async () => {
    for (const privileges of [null, undefined, 'criteria_author', 42]) {
      prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges });
      await expect(makeGuard(['criteria_author'], prisma).canActivate(contextFor(2))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  it('AC-08.12 ĐÚNG MỘT truy vấn cho mỗi request bị gác', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ role: 'staff', privileges: ['rubric_template'] });
    await makeGuard(['rubric_template'], prisma).canActivate(contextFor(3));
    expect(prisma.dashboardUser.findUnique).toHaveBeenCalledTimes(1);
  });
});
