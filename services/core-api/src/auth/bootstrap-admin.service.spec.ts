import * as bcrypt from 'bcrypt';
import { BootstrapAdminService } from './bootstrap-admin.service';

describe('BootstrapAdminService', () => {
  let prisma: { dashboardUser: { count: jest.Mock; create: jest.Mock } };
  let service: BootstrapAdminService;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    prisma = { dashboardUser: { count: jest.fn(), create: jest.fn() } };
    service = new BootstrapAdminService(prisma as never);
    process.env.CORE_API_BOOTSTRAP_ADMIN_EMAIL = 'admin@ilm.edu.vn';
    process.env.CORE_API_BOOTSTRAP_ADMIN_PASSWORD = 'bootstrap-password';
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  // AC-1
  it('seeds the first admin with mustChangePassword: true', async () => {
    prisma.dashboardUser.count.mockResolvedValue(0);
    prisma.dashboardUser.create.mockResolvedValue({ id: 1 });

    await service.onApplicationBootstrap();

    expect(prisma.dashboardUser.create).toHaveBeenCalledTimes(1);
    const arg = prisma.dashboardUser.create.mock.calls[0][0] as {
      data: { email: string; passwordHash: string; role: string; mustChangePassword: boolean };
    };
    expect(arg.data.email).toBe('admin@ilm.edu.vn');
    expect(arg.data.role).toBe('admin');
    expect(arg.data.mustChangePassword).toBe(true);
    expect(arg.data.passwordHash).not.toBe('bootstrap-password');
    await expect(bcrypt.compare('bootstrap-password', arg.data.passwordHash)).resolves.toBe(true);
  });

  // AC-2
  it('creates nothing when dashboard_users already has rows', async () => {
    prisma.dashboardUser.count.mockResolvedValue(3);
    await service.onApplicationBootstrap();
    expect(prisma.dashboardUser.create).not.toHaveBeenCalled();
  });

  it('creates nothing when the bootstrap env vars are absent', async () => {
    delete process.env.CORE_API_BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.CORE_API_BOOTSTRAP_ADMIN_PASSWORD;
    await service.onApplicationBootstrap();
    expect(prisma.dashboardUser.count).not.toHaveBeenCalled();
    expect(prisma.dashboardUser.create).not.toHaveBeenCalled();
  });
});
