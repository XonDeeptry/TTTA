import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DashboardUser } from '@prisma/client';
import { PrismaService } from '../prisma.service';

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
