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
  let auth: { validate: jest.Mock; changePassword: jest.Mock; effectivePrivileges: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    auth = { validate: jest.fn(), changePassword: jest.fn(), effectivePrivileges: jest.fn().mockResolvedValue([]) };
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
    /**
     * F10 AC-11.3 — assertion này BUỘC phải đổi vì `/auth/me` mọc thêm `privileges` (FR-11) và
     * `toEqual` so khớp CHÍNH XÁC tập khóa. Nó được LÀM CHẶT chứ không nới: bốn trường cũ vẫn bị
     * ghim từng giá trị y như trước, cộng thêm một trường mới. Đây là spec DUY NHẤT ngoài
     * `rubric-scoring.spec.ts`/`users.service.spec.ts` mà F10 sửa assertion.
     */
    it('surfaces mustChangePassword from the session', async () => {
      const user: SessionUser = {
        id: 7,
        email: 'admin@ilm.edu.vn',
        role: 'admin',
        mustChangePassword: true,
      };
      await expect(controller.me(requestWithSession(user))).resolves.toEqual({ ...user, privileges: [] });
    });

    // F10 AC-11.1/11.2: tập quyền đọc TƯƠI từ service (DB), không lấy từ session.
    it('returns the effective privileges resolved for the session user id', async () => {
      auth.effectivePrivileges.mockResolvedValue(['rubric_template', 'criteria_author']);
      const user: SessionUser = { id: 7, email: 'a@b.c', role: 'admin', mustChangePassword: false };

      await expect(controller.me(requestWithSession(user))).resolves.toEqual({
        ...user,
        privileges: ['rubric_template', 'criteria_author'],
      });
      expect(auth.effectivePrivileges).toHaveBeenCalledWith(7);
    });

    // F10 AC-11.4: hàng đã bị xóa nhưng session còn sống ⇒ [] chứ không 500.
    it('returns privileges: [] when the row is gone', async () => {
      auth.effectivePrivileges.mockResolvedValue([]);
      const user: SessionUser = { id: 99, email: 'gone@b.c', role: 'staff', mustChangePassword: false };
      await expect(controller.me(requestWithSession(user))).resolves.toEqual({ ...user, privileges: [] });
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
