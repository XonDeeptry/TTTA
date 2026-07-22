import { Module } from '@nestjs/common';
import { MediaLifecycleService } from './media-lifecycle.service';

@Module({
  providers: [MediaLifecycleService],
})
export class MediaLifecycleModule {}
