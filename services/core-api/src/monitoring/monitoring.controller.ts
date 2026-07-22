import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { DiskStatus, MonitoringService, QueueDepth, TokenStatus } from './monitoring.service';

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
}
