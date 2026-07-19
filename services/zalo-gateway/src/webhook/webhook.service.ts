import { Injectable, Logger } from '@nestjs/common';
import { Q_SUBMISSIONS, SubmissionKind, SubmissionMessage } from '../contracts';
import { RabbitService } from '../rabbit.service';
import { RedisService } from '../redis.service';

/** Payload webhook Zalo OA v3 (chỉ các trường gateway cần) */
export interface ZaloWebhookEvent {
  event_name?: string;
  timestamp?: string | number;
  sender?: { id?: string };
  follower?: { id?: string };
  message?: {
    msg_id?: string;
    text?: string;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
}

export type WebhookResult = 'published' | 'duplicate' | 'ignored';

const EVENT_KIND: Record<string, SubmissionKind> = {
  user_send_audio: 'audio',
  user_send_video: 'video',
  user_send_text: 'text',
  user_send_image: 'image',
  user_send_file: 'file',
  follow: 'follow',
};

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly rabbit: RabbitService,
  ) {}

  /**
   * Đường nhận tin (mục 3.6): dedup → publish → ACK. Không nghiệp vụ ở đây —
   * mọi xử lý (binding, chấm, flag) thuộc grading-worker/core-api.
   */
  async handle(event: ZaloWebhookEvent): Promise<WebhookResult> {
    const kind = EVENT_KIND[event.event_name ?? ''];
    if (!kind) return 'ignored';

    const zaloUserId = event.sender?.id ?? event.follower?.id;
    if (!zaloUserId) return 'ignored';

    // follow không có msg_id — tổng hợp id ổn định để dedup khi Zalo bắn lại
    const messageId =
      event.message?.msg_id ?? `${event.event_name}:${zaloUserId}:${event.timestamp ?? ''}`;

    // Mọi tương tác của user đều mở lại cửa sổ 48h
    await this.redis.recordInbound(zaloUserId, Date.now());

    if (!(await this.redis.claimMessage(messageId))) {
      this.logger.debug(`Duplicate message ${messageId} — skipped`);
      return 'duplicate';
    }

    const message: SubmissionMessage = {
      v: 1,
      messageId,
      eventName: event.event_name!,
      kind,
      zaloUserId,
      text: event.message?.text,
      mediaUrl: event.message?.attachments?.[0]?.payload?.url,
      receivedAt: new Date().toISOString(),
    };
    this.rabbit.publish(Q_SUBMISSIONS, message);
    return 'published';
  }
}
