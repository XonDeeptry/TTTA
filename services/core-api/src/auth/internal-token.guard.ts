import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SettingsService } from '../settings/settings.service';

/**
 * Service-to-service (grading-worker → core-api, mục 3.2), KHÔNG phải session người dùng.
 * Token lấy từ settings['internal.worker_api_token'], fallback env cho dev — cùng convention
 * ENV_FALLBACKS đã dùng ở zalo-gateway.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-internal-token');
    const expected = (await this.settings.getRaw('internal.worker_api_token')) || process.env.INTERNAL_API_TOKEN;
    if (!expected || !provided || provided !== expected) {
      throw new UnauthorizedException('invalid internal token');
    }
    return true;
  }
}
