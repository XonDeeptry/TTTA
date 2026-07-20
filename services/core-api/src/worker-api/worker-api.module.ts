import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkerApiController } from './worker-api.controller';

@Module({
  imports: [AuthModule],
  controllers: [WorkerApiController],
})
export class WorkerApiModule {}
