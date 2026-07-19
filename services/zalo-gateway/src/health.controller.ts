import { Controller, Get } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  async health(): Promise<{ ok: boolean; tokenAlert: boolean }> {
    const alert = await this.redis.client.get('alert:zalo_token_failed');
    return { ok: true, tokenAlert: alert !== null };
  }
}
