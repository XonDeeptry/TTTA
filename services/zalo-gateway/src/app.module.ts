import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OutboundConsumer } from './outbound/outbound.consumer';
import { RabbitService } from './rabbit.service';
import { RedisService } from './redis.service';
import { WebhookController } from './webhook/webhook.controller';
import { WebhookService } from './webhook/webhook.service';
import { TokenService } from './zalo/token.service';
import { ZaloApiService } from './zalo/zalo-api.service';

@Module({
  controllers: [WebhookController, HealthController],
  providers: [RedisService, RabbitService, WebhookService, TokenService, ZaloApiService, OutboundConsumer],
})
export class AppModule {}
