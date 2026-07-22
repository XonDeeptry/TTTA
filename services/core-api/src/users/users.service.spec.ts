import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';
import type { CreateUserDto } from './dto/create-user.dto';

type PrismaMock = {
  dashboardUser: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

const VIEW_KEYS = ['createdAt', 'email', 'id', 'mustChangePassword', 'role'];

/** Bắt lỗi HTTP để kiểm cả status lẫn message (không phụ thuộc field nội bộ của Nest). */
async function rejection(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (err) {
    return err as HttpException;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

function makePrisma(): PrismaMock {
  return {
    dashboardUser: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

/** Row đúng hình dạng USER_SELECT trả về (không bao giờ có passwordHash). */
function view(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 2,
    email: 'teacher@ilm.local',
    role: 'staff',
    mustChangePassword: true,
    createdAt: new Date('2026-07-22T12:30:00.000Z'),
    ...over,
  };
}

describe('UsersService.list', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UsersService(prisma as never);
  });

  // AC-01
  it('returns every row as a UserView with exactly the five allowed keys, oldest first', async () => {
    const rows = [
      view({ id: 1, email: 'admin@ilm.local', role: 'admin', mustChangePassword: false, createdAt: new Date('2026-07-22T09:00:00.000Z') }),
      view({ id: 2 }),
      view({ id: 3, email: 'staff2@ilm.local', createdAt: new Date('2026-07-22T13:00:00.000Z') }),
    ];
    prisma.dashboardUser.findMany.mockResolvedValue(rows);

    const result = await service.list();

    expect(result).toHaveLength(3);
    for (const item of result) {
      expect(Object.keys(item).sort()).toEqual(VIEW_KEYS);
    }
    expect(prisma.dashboardUser.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  // AC-02 / NFR-S1
  it('queries with a select that cannot return passwordHash', async () => {
    prisma.dashboardUser.findMany.mockResolvedValue([view()]);

    const result = await service.list();

    const arg = prisma.dashboardUser.findMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(arg.select).toBeDefined();
    expect(Object.keys(arg.select).sort()).toEqual(VIEW_KEYS);
    expect(arg.select).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });
});

describe('UsersService.create', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  const dto: CreateUserDto = {
    email: 'teacher@ilm.local',
    role: 'staff',
    password: 'initial-pass-1',
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new UsersService(prisma as never);
    prisma.dashboardUser.findFirst.mockResolvedValue(null);
    prisma.dashboardUser.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(view({ email: data.email, role: data.role, mustChangePassword: data.mustChangePassword })),
    );
  });

  // AC-04 / NFR-S4 / NFR-S6
  it('persists exactly email+passwordHash+role+mustChangePassword with a cost-12 hash', async () => {
    await service.create(dto);

    expect(prisma.dashboardUser.create).toHaveBeenCalledTimes(1);
    const arg = prisma.dashboardUser.create.mock.calls[0][0] as {
      data: { email: string; passwordHash: string; role: string; mustChangePassword: boolean };
      select: Record<string, boolean>;
    };
    expect(Object.keys(arg.data).sort()).toEqual(['email', 'mustChangePassword', 'passwordHash', 'role']);
    expect(arg.data.mustChangePassword).toBe(true);
    expect(arg.data.role).toBe('staff');
    expect(arg.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(bcrypt.compare('initial-pass-1', arg.data.passwordHash)).resolves.toBe(true);
    expect(Object.keys(arg.select).sort()).toEqual(VIEW_KEYS);
  });

  // AC-05
  it('returns the UserView of the new row with mustChangePassword true and no hash', async () => {
    const created = await service.create(dto);

    expect(Object.keys(created).sort()).toEqual(VIEW_KEYS);
    expect(created.mustChangePassword).toBe(true);
    expect(JSON.stringify(created)).not.toContain('passwordHash');
  });

  // NFR-S5: cờ không bao giờ lấy từ body
  it('forces mustChangePassword true even if the body asked for false', async () => {
    await service.create({ ...dto, mustChangePassword: false } as unknown as CreateUserDto);

    const arg = prisma.dashboardUser.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.mustChangePassword).toBe(true);
    expect(Object.keys(arg.data).sort()).toEqual(['email', 'mustChangePassword', 'passwordHash', 'role']);
  });

  // AC-07 / NFR-S7
  it('maps a Prisma P2002 unique violation to 409 "email already exists"', async () => {
    prisma.dashboardUser.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });

    const err = await rejection(service.create(dto));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getStatus()).toBe(409);
    expect(err.message).toBe('email already exists');
  });

  it('rethrows a non-P2002 Prisma error instead of masking it as 409', async () => {
    prisma.dashboardUser.create.mockRejectedValue({ code: 'P1001' });
    await expect(service.create(dto)).rejects.not.toBeInstanceOf(ConflictException);
  });

  // Sai lệch có chủ ý so với AC-06: email lưu NGUYÊN VĂN (login đang phân biệt hoa thường)
  it('stores the email exactly as typed — no lowercasing, no normalization', async () => {
    await service.create({ ...dto, email: 'GiaoVien@ILM.Local' });

    const arg = prisma.dashboardUser.create.mock.calls[0][0] as { data: { email: string } };
    expect(arg.data.email).toBe('GiaoVien@ILM.Local');
  });

  // Sai lệch (2): duy nhất KHÔNG phân biệt hoa thường, cùng 409
  it('rejects a case-insensitive duplicate with the same 409 shape and writes nothing', async () => {
    prisma.dashboardUser.findFirst.mockResolvedValue({ id: 9 });

    const err = await rejection(service.create({ ...dto, email: 'GiaoVien@ILM.Local' }));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getStatus()).toBe(409);
    expect(err.message).toBe('email already exists');
    expect(prisma.dashboardUser.create).not.toHaveBeenCalled();
  });

  it('performs the duplicate pre-check case-insensitively on the exact input', async () => {
    await service.create({ ...dto, email: 'GiaoVien@ILM.Local' });

    expect(prisma.dashboardUser.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'GiaoVien@ILM.Local', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  // AC-22: tài khoản do F5 tạo tự động "lên đạn" luồng ép đổi mật khẩu của F4
  it('creates credentials that AuthService.validate accepts and that carry the forced-change flag', async () => {
    await service.create(dto);
    const { passwordHash } = (prisma.dashboardUser.create.mock.calls[0][0] as { data: { passwordHash: string } }).data;

    const authPrisma = {
      dashboardUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          email: dto.email,
          passwordHash,
          role: 'staff',
          mustChangePassword: true,
        }),
      },
    };
    const auth = new AuthService(authPrisma as never);

    const user = await auth.validate(dto.email, 'initial-pass-1');
    expect(user).not.toBeNull();
    expect(user?.mustChangePassword).toBe(true);
    await expect(auth.validate(dto.email, 'wrong-password')).resolves.toBeNull();
  });
});

describe('UsersService.resetPassword', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UsersService(prisma as never);
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2 });
    prisma.dashboardUser.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(view({ mustChangePassword: data.mustChangePassword })),
    );
  });

  // AC-12 / AC-16 / NFR-S4 / NFR-S6
  it('writes only passwordHash + mustChangePassword=true with a cost-12 hash and returns the UserView', async () => {
    const result = await service.resetPassword(2, 1, 'brand-new-pass-9');

    expect(prisma.dashboardUser.update).toHaveBeenCalledTimes(1);
    const arg = prisma.dashboardUser.update.mock.calls[0][0] as {
      where: { id: number };
      data: { passwordHash: string; mustChangePassword: boolean };
      select: Record<string, boolean>;
    };
    expect(arg.where).toEqual({ id: 2 });
    expect(Object.keys(arg.data).sort()).toEqual(['mustChangePassword', 'passwordHash']);
    expect(arg.data).not.toHaveProperty('role');
    expect(arg.data).not.toHaveProperty('email');
    expect(arg.data).not.toHaveProperty('id');
    expect(arg.data.mustChangePassword).toBe(true);
    expect(arg.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(bcrypt.compare('brand-new-pass-9', arg.data.passwordHash)).resolves.toBe(true);
    expect(Object.keys(arg.select).sort()).toEqual(VIEW_KEYS);

    expect(Object.keys(result).sort()).toEqual(VIEW_KEYS);
    expect(result.mustChangePassword).toBe(true);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  // AC-14
  it('throws 404 "user not found" and writes nothing for an unknown id', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue(null);

    const err = await rejection(service.resetPassword(999, 1, 'brand-new-pass-9'));
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getStatus()).toBe(404);
    expect(err.message).toBe('user not found');
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });

  it('maps a Prisma P2025 (row vanished mid-write) to the same 404', async () => {
    prisma.dashboardUser.update.mockRejectedValue({ code: 'P2025' });
    await expect(service.resetPassword(2, 1, 'brand-new-pass-9')).rejects.toBeInstanceOf(NotFoundException);
  });

  // AC-15 / NFR-S9
  it('refuses to reset the acting admin\'s own password with 400 and touches nothing', async () => {
    const err = await rejection(service.resetPassword(1, 1, 'brand-new-pass-9'));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getStatus()).toBe(400);
    expect(err.message).toBe('cannot reset your own password');
    expect(prisma.dashboardUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });

  // AC-23 / §2.7: reset KHÔNG đụng tới session store — service chỉ phụ thuộc Prisma
  it('has no session-store dependency, so an admin reset cannot evict live sessions', async () => {
    expect(UsersService.length).toBe(1);
    await service.resetPassword(2, 1, 'brand-new-pass-9');
    expect(Object.keys(prisma)).toEqual(['dashboardUser']);
  });
});
