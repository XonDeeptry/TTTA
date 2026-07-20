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
