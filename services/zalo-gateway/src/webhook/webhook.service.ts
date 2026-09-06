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

export type WebhookResult = 'published' | 'duplicate' | 'ignored' | 'stranger_quota';

/** Mặc định khi `limits.stranger_daily_max` chưa được đặt trên dashboard. */
export const DEFAULT_STRANGER_DAILY_MAX = 10;

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

    // Hạn mức NGƯỜI LẠ. Bất kỳ ai cũng quan tâm được OA rồi nhắn tin, nên nếu không chặn thì
    // mỗi tin của người ngoài đều sinh một dòng `submissions` + một dòng `flags` và một tin
    // onboarding gửi ra — không giới hạn.
    //
    // Học viên (đã có binding `active`, do core-api mirror sang Redis) KHÔNG bao giờ bị đếm:
    // hạn mức này để chặn phá hoại, không phải để giới hạn người học.
    //
    // Đặt SAU dedup có chủ đích — Zalo gửi lại cùng một `msg_id` là chuyện bình thường, và
    // redelivery không được phép ăn vào hạn mức của người dùng.
    if (!(await this.redis.isKnownUser(zaloUserId))) {
      const max = await this.redis.getConfigInt('limits.stranger_daily_max', DEFAULT_STRANGER_DAILY_MAX);
      const count = await this.redis.bumpStrangerCount(zaloUserId, Date.now());
      if (count > max) {
        // Im lặng có chủ đích: trả lời "bạn bị chặn" vừa tốn một lượt gọi Zalo, vừa xác nhận
        // cho kẻ dò biết hệ thống còn sống. Tin bị bỏ hẳn — không vào queue, không vào DB.
        this.logger.warn(`Người lạ ${zaloUserId} vượt hạn mức ngày (${count} > ${max}) — bỏ qua`);
        return 'stranger_quota';
      }
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
