import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OutboundMessage, Q_OUTBOUND } from '../contracts';
import { canSendWithin48h } from '../lib/time-window';
import { RabbitService } from '../rabbit.service';
import { RedisService } from '../redis.service';
import { ZaloApiService } from '../zalo/zalo-api.service';

/**
 * Consumer queue `outbound`: điểm ra DUY NHẤT của mọi tin nhắn tới người dùng.
 * Guard 48h (mục 3.5): không bao giờ âm thầm gửi tin phát sinh phí ngoài khung
 * miễn phí — tin bị chặn được ghi lại cho tư vấn xử lý tay (M2: outbound_log).
 */
@Injectable()
export class OutboundConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboundConsumer.name);

  constructor(
    private readonly rabbit: RabbitService,
    private readonly redis: RedisService,
    private readonly zaloApi: ZaloApiService,
  ) {}

  onApplicationBootstrap(): void {
    // Chờ RabbitService connect xong (onModuleInit chạy trước bootstrap)
    this.rabbit.consume(Q_OUTBOUND, (payload) => this.handle(payload as OutboundMessage));
  }

  async handle(msg: OutboundMessage): Promise<void> {
    if (!msg?.zaloUserId || !msg?.text) {
      this.logger.error(`Malformed outbound message — dropped: ${JSON.stringify(msg)}`);
      return; // không retry tin hỏng cấu trúc
    }
    const guardEnabled = await this.redis.getConfigBool('limits.outbound_48h_guard', true);
    if (guardEnabled) {
      const lastInbound = await this.redis.getLastInbound(msg.zaloUserId);
      if (!canSendWithin48h(lastInbound, Date.now())) {
        // M2: ghi outbound_log status='blocked_48h' qua core-api; tạm thời ghi Redis cho dashboard đọc
        await this.redis.client.lpush(
          'blocked_48h',
          JSON.stringify({ ...msg, blockedAt: new Date().toISOString() }),
        );
        this.logger.warn(`Blocked by 48h window: user ${msg.zaloUserId} — advisor phải xử lý tay`);
        return; // gửi muộn hơn cũng không giúp — không retry
      }
    }
    await this.zaloApi.sendText(msg.zaloUserId, msg.text); // lỗi → RabbitService retry/DLQ
  }
}
