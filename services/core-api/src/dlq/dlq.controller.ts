import { BadRequestException, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { Q_OUTBOUND, Q_SUBMISSIONS } from '../contracts';
import { RabbitService } from '../rabbit.service';

const RETRYABLE_QUEUES = [Q_SUBMISSIONS, Q_OUTBOUND];

@Controller('dlq')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
export class DlqController {
  constructor(private readonly rabbit: RabbitService) {}

  @Get()
  async list(): Promise<Array<{ queue: string; dlqDepth: number }>> {
    return Promise.all(
      RETRYABLE_QUEUES.map(async (queue) => ({ queue, dlqDepth: await this.rabbit.queueDepth(`${queue}.dlq`) })),
    );
  }

  @Post(':queue/retry')
  async retry(@Param('queue') queue: string): Promise<{ retried: boolean }> {
    if (!RETRYABLE_QUEUES.includes(queue)) throw new BadRequestException(`unknown queue: ${queue}`);
    const retried = await this.rabbit.retryOneFromDlq(queue);
    return { retried };
  }
}
