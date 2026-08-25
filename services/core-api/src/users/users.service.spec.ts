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
    delete: jest.Mock;
    count: jest.Mock;
  };
};

/**
 * F10 FR-10: `UserView` mọc thêm `privileges`. Đây là một ĐỊNH NGHĨA fixture, không phải một
 * assertion bị nới — mọi câu `expect(...).toEqual(VIEW_KEYS)` bên dưới giữ nguyên từng chữ và
 * giờ ĐÒI HỎI THÊM sự có mặt của `privileges` (chặt hơn trước, không lỏng hơn).
 */
const VIEW_KEYS = ['createdAt', 'email', 'id', 'mustChangePassword', 'privileges', 'role'];

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
      delete: jest.fn(),
      count: jest.fn(),
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
    privileges: [],
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
    // F10 FR-10: `privileges` là cột hợp lệ thứ năm. Danh sách vẫn VÉT CẠN — chỉ thêm một tên.
    expect(Object.keys(arg.data).sort()).toEqual([
      'email',
      'mustChangePassword',
      'passwordHash',
      'privileges',
      'role',
    ]);
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
    // F10: `privileges` là cột thứ năm được ghi hợp lệ (FR-10). Danh sách vẫn VÉT CẠN và vẫn
    // chứng minh `mustChangePassword` không tới từ body — chỉ thêm một tên, không bỏ tên nào.
    expect(Object.keys(arg.data).sort()).toEqual([
      'email',
      'mustChangePassword',
      'passwordHash',
      'privileges',
      'role',
    ]);
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

describe('UsersService.update', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UsersService(prisma as never);
    prisma.dashboardUser.findFirst.mockResolvedValue(null);
    prisma.dashboardUser.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(view({ email: data.email as string | undefined, role: data.role as string | undefined })),
    );
  });

  it('404s for an unknown id and writes nothing', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue(null);
    const err = await rejection(service.update(999, { email: 'new@ilm.local' }));
    expect(err).toBeInstanceOf(NotFoundException);
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });

  it('updates email and role for a staff user with no admin-count check', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'staff' });
    const result = await service.update(2, { email: 'new@ilm.local', role: 'admin' });
    expect(prisma.dashboardUser.count).not.toHaveBeenCalled();
    expect(prisma.dashboardUser.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { email: 'new@ilm.local', role: 'admin' },
      select: expect.anything(),
    });
    expect(result.email).toBe('new@ilm.local');
  });

  it('blocks demoting the last admin to staff', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 1, role: 'admin' });
    prisma.dashboardUser.count.mockResolvedValue(0);
    const err = await rejection(service.update(1, { role: 'staff' }));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('cannot remove the last admin account');
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin still remains', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'admin' });
    prisma.dashboardUser.count.mockResolvedValue(1);
    await service.update(2, { role: 'staff' });
    expect(prisma.dashboardUser.update).toHaveBeenCalled();
  });

  it('maps a duplicate email on update to 409', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'staff' });
    prisma.dashboardUser.findFirst.mockResolvedValue({ id: 5 });
    const err = await rejection(service.update(2, { email: 'taken@ilm.local' }));
    expect(err).toBeInstanceOf(ConflictException);
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });
});

describe('UsersService.delete', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UsersService(prisma as never);
  });

  it('refuses to delete your own account without touching the database', async () => {
    const err = await rejection(service.delete(1, 1));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('cannot delete your own account');
    expect(prisma.dashboardUser.findUnique).not.toHaveBeenCalled();
  });

  it('404s for an unknown id', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue(null);
    const err = await rejection(service.delete(999, 1));
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('deletes a staff account without checking admin count', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'staff' });
    await service.delete(2, 1);
    expect(prisma.dashboardUser.count).not.toHaveBeenCalled();
    expect(prisma.dashboardUser.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('blocks deleting the last admin', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'admin' });
    prisma.dashboardUser.count.mockResolvedValue(0);
    const err = await rejection(service.delete(2, 1));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('cannot remove the last admin account');
    expect(prisma.dashboardUser.delete).not.toHaveBeenCalled();
  });

  it('allows deleting an admin when another admin still remains', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'admin' });
    prisma.dashboardUser.count.mockResolvedValue(1);
    await service.delete(2, 1);
    expect(prisma.dashboardUser.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});

/**
 * F10 FR-10 — `/users` mang thêm `privileges`. Khối này được THÊM VÀO, không sửa ca nào có trước.
 */
describe('F10 — UsersService privileges', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UsersService(prisma as never);
    prisma.dashboardUser.findFirst.mockResolvedValue(null);
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 2, role: 'staff' });
    prisma.dashboardUser.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(view({ privileges: data.privileges as string[] })),
    );
    prisma.dashboardUser.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(view({ privileges: (data.privileges as string[] | undefined) ?? [] })),
    );
  });

  // AC-10.1
  it('USER_SELECT nạp privileges và vẫn KHÔNG BAO GIỜ nạp passwordHash', async () => {
    prisma.dashboardUser.findMany.mockResolvedValue([view()]);
    await service.list();
    const arg = prisma.dashboardUser.findMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(arg.select.privileges).toBe(true);
    expect(arg.select).not.toHaveProperty('passwordHash');
  });

  // AC-10.6 / AC-03.6
  it('POST /users không gửi privileges ⇒ ghi [] (backfill là chuyện MỘT LẦN, không phải mặc định)', async () => {
    await service.create({ email: 'a@b.c', role: 'staff', password: 'initial1' } as CreateUserDto);
    const data = (prisma.dashboardUser.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.privileges).toEqual([]);
  });

  it('POST /users có privileges ⇒ ghi đúng mảng đó', async () => {
    await service.create({
      email: 'a@b.c',
      role: 'staff',
      password: 'initial1',
      privileges: ['criteria_author'],
    } as CreateUserDto);
    const data = (prisma.dashboardUser.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.privileges).toEqual(['criteria_author']);
  });

  // AC-10.2
  it('PATCH không gửi privileges ⇒ cột KHÔNG bị ghi (undefined, không phải [])', async () => {
    await service.update(2, { email: 'new@ilm.local' });
    const data = (prisma.dashboardUser.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.privileges).toBeUndefined();
    expect('privileges' in data).toBe(true); // key có mặt nhưng giá trị undefined ⇒ Prisma bỏ qua
  });

  // AC-10.3
  it('PATCH privileges = THAY THẾ TOÀN BỘ, kể cả về rỗng', async () => {
    await service.update(2, { privileges: ['criteria_author'] });
    expect(
      (prisma.dashboardUser.update.mock.calls[0][0] as { data: Record<string, unknown> }).data.privileges,
    ).toEqual(['criteria_author']);

    await service.update(2, { privileges: [] });
    expect(
      (prisma.dashboardUser.update.mock.calls[1][0] as { data: Record<string, unknown> }).data.privileges,
    ).toEqual([]);
  });

  // AC-10.5
  it('trùng lặp trong mảng bị khử trước khi lưu', async () => {
    await service.update(2, { privileges: ['criteria_author', 'criteria_author', 'rubric_template'] });
    expect(
      (prisma.dashboardUser.update.mock.calls[0][0] as { data: Record<string, unknown> }).data.privileges,
    ).toEqual(['criteria_author', 'rubric_template']);
  });

  // AC-10.7
  it('đặt privileges cho một admin được CHẤP NHẬN và lưu nguyên văn (dù không ảnh hưởng phân quyền)', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 1, role: 'admin' });
    await service.update(1, { privileges: ['rubric_template'] });
    expect(
      (prisma.dashboardUser.update.mock.calls[0][0] as { data: Record<string, unknown> }).data.privileges,
    ).toEqual(['rubric_template']);
  });
});
