import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DashboardUser } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { effectivePrivileges } from './privileges';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(email: string, password: string): Promise<DashboardUser | null> {
    const user = await this.prisma.dashboardUser.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  /**
   * F10 — tập quyền CÓ HIỆU LỰC của một tài khoản, đọc TƯƠI từ Postgres.
   *
   * Cùng nguồn sự thật với `PrivilegeGuard` (cũng đọc DB mỗi request, xem D-1) — đây chính là lý
   * do: nếu `/auth/me` đọc bản sao trong session còn guard đọc DB, giao diện sẽ hiện nút mà guard
   * từ chối (hoặc giấu nút mà guard cho qua) suốt phần đời còn lại của phiên đó.
   *
   * Hàng không còn tồn tại (tài khoản bị xóa nhưng session còn sống) ⇒ `[]`, KHÔNG ném lỗi:
   * `/auth/me` phải luôn trả 200 để dashboard còn biết đường mà đăng xuất (AC-11.4).
   */
  async effectivePrivileges(userId: number): Promise<string[]> {
    const row = await this.prisma.dashboardUser.findUnique({
      where: { id: userId },
      select: { role: true, privileges: true },
    });
    if (!row) return [];
    return effectivePrivileges(row.role, row.privileges);
  }

  /**
   * Đổi mật khẩu cho user đã đăng nhập. Luôn kiểm lại currentPassword bằng
   * bcrypt.compare (dù session đã xác thực) — giống mọi form "đổi mật khẩu".
   * Sai currentPassword => 401 (không ghi gì). Thành công => hash mật khẩu mới,
   * xoá cờ mustChangePassword ở DB, trả về user đã cập nhật.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<DashboardUser> {
    const user = await this.prisma.dashboardUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('invalid current password');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid current password');

    // Phòng thủ tầng service (DTO đã chặn ở tầng validation => 400): mật khẩu mới phải khác.
    if (newPassword === currentPassword) {
      throw new BadRequestException('new password must differ from current');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    return this.prisma.dashboardUser.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }
}
