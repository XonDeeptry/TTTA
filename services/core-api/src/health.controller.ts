import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ ok: boolean }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
