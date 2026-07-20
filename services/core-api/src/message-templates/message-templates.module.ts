import { Module } from '@nestjs/common';
import { MessageTemplatesService } from './message-templates.service';

@Module({
  providers: [MessageTemplatesService],
  exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
