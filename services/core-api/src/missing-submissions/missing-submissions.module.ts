import { Module } from '@nestjs/common';
import { MessageTemplatesModule } from '../message-templates/message-templates.module';
import { MissingSubmissionsService } from './missing-submissions.service';

@Module({
  imports: [MessageTemplatesModule],
  providers: [MissingSubmissionsService],
})
export class MissingSubmissionsModule {}
