import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import './session.types';

type SessionUser = { id: number; email: string; role: 'admin' | 'staff'; mustChangePassword: boolean };

/** Request giả chỉ với phần session mà controller đụng tới. */
function requestWithSession(user?: SessionUser): Request {
  return { session: { user } } as unknown as Request;
}

describe('AuthController', () => {
  let auth: { validate: jest.Mock; changePassword: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    auth = { validate: jest.fn(), changePassword: jest.fn() };
    controller = new AuthController(auth as unknown as AuthService);
  });

  describe('login', () => {
    // AC-8
    it('returns mustChangePassword and writes it into the session', async () => {
      auth.validate.mockResolvedValue({
        id: 7,
        email: 'admin@ilm.edu.vn',
        passwordHash: 'x',
        role: 'admin',
        mustChangePassword: true,
      });
      const req = requestWithSession();

      const body = { email: 'admin@ilm.edu.vn', password: 'bootstrap-password' } as LoginDto;
      await expect(controller.login(body, req)).resolves.toEqual({
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: true,
      });
      expect(req.session.user).toEqual({
        id: 7,
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: true,
      });
    });

    // frozen behavior: user bình thường (cờ false) không đổi gì
    it('returns mustChangePassword: false for a normal user', async () => {
      auth.validate.mockResolvedValue({
        id: 8,
        email: 'staff@ilm.edu.vn',
        passwordHash: 'x',
        role: 'staff',
        mustChangePassword: false,
      });
      const req = requestWithSession();

      const body = { email: 'staff@ilm.edu.vn', password: 'staff-password' } as LoginDto;
      await expect(controller.login(body, req)).resolves.toEqual({
        email: 'staff@ilm.edu.vn',
        role: 'staff',
        mustChangePassword: false,
      });
    });

    it('throws 401 and writes no session on bad credentials', async () => {
      auth.validate.mockResolvedValue(null);
      const req = requestWithSession();
      const body = { email: 'admin@ilm.edu.vn', password: 'wrong-password' } as LoginDto;

      await expect(controller.login(body, req)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(req.session.user).toBeUndefined();
    });
  });

  // AC-9
  describe('me', () => {
    it('surfaces mustChangePassword from the session', () => {
      const user: SessionUser = {
        id: 7,
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: true,
      };
      expect(controller.me(requestWithSession(user))).toEqual(user);
    });
  });

  describe('changePassword', () => {
    const body = {
      currentPassword: 'old-password-1',
      newPassword: 'brand-new-password',
    } as ChangePasswordDto;

    // AC-6
    it('clears the flag in the live session and returns the cleared shape', async () => {
      auth.changePassword.mockResolvedValue({
        id: 7,
        email: 'admin@ilm.edu.vn',
        passwordHash: 'new-hash',
        role: 'admin',
        mustChangePassword: false,
      });
      const req = requestWithSession({
        id: 7,
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: true,
      });

      await expect(controller.changePassword(body, req)).resolves.toEqual({
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: false,
      });
      expect(auth.changePassword).toHaveBeenCalledWith(7, 'old-password-1', 'brand-new-password');
      expect(req.session.user).toEqual({
        id: 7,
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: false,
      });
    });

    // AC-4 ở tầng controller: lỗi từ service nổi lên nguyên vẹn, session không đổi
    it('propagates the 401 from the service and leaves the session untouched', async () => {
      auth.changePassword.mockRejectedValue(new UnauthorizedException('invalid current password'));
      const req = requestWithSession({
        id: 7,
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: true,
      });

      await expect(controller.changePassword(body, req)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(req.session.user?.mustChangePassword).toBe(true);
    });

    // AC-7 (defensive belt: SessionAuthGuard đã chặn trước, đây là lớp thứ hai)
    it('throws 401 when there is no session user', async () => {
      await expect(controller.changePassword(body, requestWithSession())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auth.changePassword).not.toHaveBeenCalled();
    });
  });
});
