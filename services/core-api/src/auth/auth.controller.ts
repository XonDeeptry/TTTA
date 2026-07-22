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

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(
    @Req() req: Request,
  ): { id: number; email: string; role: DashboardRole; mustChangePassword: boolean } | undefined {
    return req.session.user;
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
