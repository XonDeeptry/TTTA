import { Module } from '@nestjs/common';
import { DlqController } from './dlq.controller';

@Module({
  controllers: [DlqController],
})
export class DlqModule {}
