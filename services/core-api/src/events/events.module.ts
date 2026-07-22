import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * `@Global()` để EventsService tiêm được vào WorkerApiController + GradingsService (các module
 * khác) mà không phải import EventsModule ở từng nơi — RedisService (dependency) cũng là global.
 */
@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
