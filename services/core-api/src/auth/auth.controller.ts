import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: Request): Promise<{ email: string; role: string }> {
    const user = await this.auth.validate(body.email, body.password);
    if (!user) throw new UnauthorizedException('invalid credentials');
    req.session.user = { id: user.id, email: user.email, role: user.role };
    return { email: user.email, role: user.role };
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
  me(@Req() req: Request): { id: number; email: string; role: string } | undefined {
    return req.session.user;
  }
}
