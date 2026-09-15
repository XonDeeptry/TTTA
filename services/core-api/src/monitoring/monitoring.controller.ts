import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { DiskStatus, MonitoringService, QueueDepth, TokenStatus, ZaloApiUsage } from './monitoring.service';

@Controller('monitoring')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('queues')
  queues(): Promise<QueueDepth[]> {
    return this.monitoring.queueDepths();
  }

  @Get('token')
  token(): Promise<TokenStatus> {
    return this.monitoring.tokenStatus();
  }

  @Get('disk')
  disk(): Promise<DiskStatus> {
    return this.monitoring.diskStatus();
  }

  /** Lượt gọi Zalo Open API theo phút, 7 ngày — để chọn gói Zalo OA (pilot 09-15). */
  @Get('zalo-api')
  zaloApi(): Promise<ZaloApiUsage> {
    return this.monitoring.zaloApiUsage();
  }
}
