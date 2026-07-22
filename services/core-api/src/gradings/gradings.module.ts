import { Module } from '@nestjs/common';
import { GradingsController } from './gradings.controller';
import { GradingsService } from './gradings.service';

@Module({
  controllers: [GradingsController],
  providers: [GradingsService],
})
export class GradingsModule {}
