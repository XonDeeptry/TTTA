import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService.validate', () => {
  let prisma: { dashboardUser: { findUnique: jest.Mock } };
  let service: AuthService;

  beforeEach(() => {
    prisma = { dashboardUser: { findUnique: jest.fn() } };
    service = new AuthService(prisma as never);
  });

  it('returns null when no user has that email', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue(null);
    await expect(service.validate('nobody@ilm.edu.vn', 'whatever123')).resolves.toBeNull();
  });

  it('returns null when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.dashboardUser.findUnique.mockResolvedValue({ id: 1, email: 'a@ilm.edu.vn', passwordHash, role: 'admin' });
    await expect(service.validate('a@ilm.edu.vn', 'wrong-password')).resolves.toBeNull();
  });

  it('returns the user when the password matches', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const user = { id: 1, email: 'a@ilm.edu.vn', passwordHash, role: 'admin' };
    prisma.dashboardUser.findUnique.mockResolvedValue(user);
    await expect(service.validate('a@ilm.edu.vn', 'correct-password')).resolves.toEqual(user);
  });
});

describe('AuthService.changePassword', () => {
  let prisma: { dashboardUser: { findUnique: jest.Mock; update: jest.Mock } };
  let service: AuthService;
  let storedHash: string;

  beforeEach(async () => {
    storedHash = await bcrypt.hash('old-password-1', 4);
    prisma = { dashboardUser: { findUnique: jest.fn(), update: jest.fn() } };
    service = new AuthService(prisma as never);
    prisma.dashboardUser.findUnique.mockResolvedValue({
      id: 7,
      email: 'admin@ilm.edu.vn',
      passwordHash: storedHash,
      role: 'admin',
      mustChangePassword: true,
    });
    prisma.dashboardUser.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 7, email: 'admin@ilm.edu.vn', role: 'admin', ...data }),
    );
  });

  // AC-4
  it('throws 401 and writes nothing when the current password is wrong', async () => {
    await expect(service.changePassword(7, 'wrong-password', 'brand-new-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });

  // AC-4 (defensive: user vanished behind the guard)
  it('throws 401 and writes nothing when the user no longer exists', async () => {
    prisma.dashboardUser.findUnique.mockResolvedValue(null);
    await expect(service.changePassword(7, 'old-password-1', 'brand-new-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });

  // AC-3
  it('stores a fresh hash of the new password and clears mustChangePassword', async () => {
    const updated = await service.changePassword(7, 'old-password-1', 'brand-new-password');

    expect(prisma.dashboardUser.update).toHaveBeenCalledTimes(1);
    const arg = prisma.dashboardUser.update.mock.calls[0][0] as {
      where: { id: number };
      data: { passwordHash: string; mustChangePassword: boolean };
    };
    expect(arg.where).toEqual({ id: 7 });
    expect(arg.data.mustChangePassword).toBe(false);
    expect(arg.data.passwordHash).not.toBe(storedHash);
    await expect(bcrypt.compare('brand-new-password', arg.data.passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare('old-password-1', arg.data.passwordHash)).resolves.toBe(false);
    expect(updated.mustChangePassword).toBe(false);
  });

  // AC-5 (service-level backstop; the DTO rejects this at validation with 400 too)
  it('rejects a new password identical to the current one with 400, without writing', async () => {
    await expect(service.changePassword(7, 'old-password-1', 'old-password-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.dashboardUser.update).not.toHaveBeenCalled();
  });
});
