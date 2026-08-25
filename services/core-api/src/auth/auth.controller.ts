import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './session-auth.guard';
import type { DashboardRole } from './session.types';

/** Shape trả về cho dashboard sau login / đổi mật khẩu (F4-ba.md §1.1, §1.3). */
type AuthUserResponse = { email: string; role: DashboardRole; mustChangePassword: boolean };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: Request): Promise<AuthUserResponse> {
    const user = await this.auth.validate(body.email, body.password);
    if (!user) throw new UnauthorizedException('invalid credentials');
    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    return { email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request): Promise<{ status: string }> {
    return new Promise((resolve) => {
      req.session.destroy(() => resolve({ status: 'ok' }));
    });
  }

  /**
   * F10 — bổ sung `privileges` (THÊM trường, bốn trường cũ giữ nguyên tên/kiểu/giá trị — AC-11.3).
   *
   * Giá trị là tập CÓ HIỆU LỰC đọc tươi từ Postgres, nên với `admin` nó chứa ĐỦ cả hai quyền dù
   * cột trong DB đang rỗng (AC-11.2). Nhờ vậy front-end chỉ cần `privileges.includes('...')` và
   * KHÔNG phải tự cài lại luật "admin có mọi quyền" ở client — một luật bị nhân bản là một luật
   * sẽ lệch.
   *
   * `POST /auth/login` và `POST /auth/change-password` KHÔNG đổi shape, và `session.user` cũng
   * không mọc thêm trường nào (AC-11.5): quyền thay đổi giữa chừng phiên nên không được đóng băng
   * vào session.
   */
  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@Req() req: Request): Promise<
    | { id: number; email: string; role: DashboardRole; mustChangePassword: boolean; privileges: string[] }
    | undefined
  > {
    const user = req.session.user;
    if (!user) return undefined;
    return { ...user, privileges: await this.auth.effectivePrivileges(user.id) };
  }

  /**
   * Đổi mật khẩu cho chính user đang đăng nhập (admin hoặc staff — chỉ SessionAuthGuard,
   * KHÔNG RolesGuard). Sai currentPassword => 401; newPassword < 8 ký tự hoặc trùng
   * currentPassword => 400 (ChangePasswordDto). Thành công: DB đã xoá cờ, đồng thời cập nhật
   * luôn session đang sống để không phải đăng nhập lại.
   */
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  async changePassword(@Body() body: ChangePasswordDto, @Req() req: Request): Promise<AuthUserResponse> {
    const sessionUser = req.session.user;
    if (!sessionUser) throw new UnauthorizedException('login required');

    const updated = await this.auth.changePassword(
      sessionUser.id,
      body.currentPassword,
      body.newPassword,
    );

    req.session.user = { ...sessionUser, mustChangePassword: false };
    return { email: updated.email, role: updated.role, mustChangePassword: false };
  }
}
