import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DashboardRole } from './session.types';
import { ROLES_KEY } from './roles.decorator';

/** Dùng SAU SessionAuthGuard (`@UseGuards(SessionAuthGuard, RolesGuard)`) — chỉ lọc theo role. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<DashboardRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const role = req.session?.user?.role;
    if (!role || !required.includes(role)) throw new ForbiddenException('insufficient role');
    return true;
  }
}
