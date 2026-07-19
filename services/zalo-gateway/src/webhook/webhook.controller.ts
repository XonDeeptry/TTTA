import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyZaloSignature } from '../lib/zalo-signature';
import { RedisService } from '../redis.service';
import { WebhookService, ZaloWebhookEvent } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly redis: RedisService,
  ) {}

  /** Zalo gọi GET khi xác minh domain webhook */
  @Get()
  verify(): string {
    return 'OK';
  }

  /**
   * Yêu cầu cứng (mục 3.5): ACK 200 ngay lập tức. Chỉ dedup + publish (vài ms)
   * rồi trả về — KHÔNG chờ bất kỳ xử lý nghiệp vụ nào.
   */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: ZaloWebhookEvent,
    @Headers('x-zevent-signature') signature: string | undefined,
  ): Promise<{ status: string }> {
    const secret = await this.redis.getConfig('zalo.webhook_secret');
    const appId = await this.redis.getConfig('zalo.app_id');
    if (secret && appId) {
      const rawBody = req.rawBody?.toString('utf8') ?? '';
      const ok = verifyZaloSignature(signature, appId, rawBody, String(body.timestamp ?? ''), secret);
      if (!ok) {
        this.logger.warn('Webhook signature mismatch — rejected');
        throw new UnauthorizedException('invalid signature');
      }
    }
    const result = await this.webhookService.handle(body);
    return { status: result };
  }
}
