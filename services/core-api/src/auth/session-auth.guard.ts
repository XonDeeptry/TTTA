import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/** Bất kỳ ai đã đăng nhập (admin hoặc staff) — mục 3.7 "đăng nhập session đơn giản". */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session?.user) throw new UnauthorizedException('login required');
    return true;
  }
}
