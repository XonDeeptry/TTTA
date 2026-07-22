import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../redis.service';

/**
 * Kênh Redis pub/sub cho sự kiện trạng thái submission (F6) — TÁCH BIỆT với `config:changed`.
 * Payload là JSON (kênh mới nên tự do chọn định dạng, khác với config:changed vốn mirror chuỗi thô).
 */
export const SUBMISSION_EVENTS_CHANNEL = 'submission:events';

/** Tên SSE event mà dashboard `EventSource` lắng nghe. */
export const SSE_EVENT_NAME = 'submission.status';

/**
 * Nhịp heartbeat: proxy/LB nhàn rỗi thường ngắt kết nối quanh 30-60s; 25s nằm an toàn dưới ngưỡng.
 * Heartbeat cũng để server phát hiện socket chết (write lỗi -> dọn dẹp).
 */
export const HEARTBEAT_MS = 25_000;

export interface SubmissionStatusEvent {
  submissionId: number;
  status: string;
  at: string;
}

/**
 * F6 — chiếu read-only các chuyển trạng thái submission ra dashboard qua SSE.
 * Publisher (publishStatus) được gọi từ 3 điểm ghi status trong core-api SAU khi Prisma resolve.
 * Subscriber (stream) mở một kết nối SSE, mỗi kết nối có subscriber Redis riêng.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Phát một sự kiện trạng thái lên Redis (fire-and-forget). CHỈ gọi SAU khi ghi DB thành công.
   * KHÔNG BAO GIỜ ném/reject vào luồng HTTP gọi nó (CR-4 / AC-5): mọi lỗi được nuốt + log.
   * `status` phải là giá trị ĐÃ PERSIST (đọc từ kết quả Prisma), không tin body request (AC/CR-5).
   */
  publishStatus(submissionId: number, status: string, at?: string): void {
    try {
      const payload: SubmissionStatusEvent = {
        submissionId,
        status,
        at: at ?? new Date().toISOString(),
      };
      void this.redis.client
        .publish(SUBMISSION_EVENTS_CHANNEL, JSON.stringify(payload))
        .catch((err) => this.logger.warn(`publish ${SUBMISSION_EVENTS_CHANNEL} failed: ${String(err)}`));
    } catch (err) {
      // JSON.stringify hoặc publish có thể ném đồng bộ — vẫn không được vỡ handler gọi nó.
      this.logger.warn(`publishStatus failed: ${String(err)}`);
    }
  }

  /**
   * Thiết lập stream SSE trên response Express thô. Mỗi kết nối:
   *  - tạo subscriber Redis RIÊNG qua `client.duplicate()` (ioredis yêu cầu connection riêng cho
   *    subscribe-mode — KHÔNG được đưa client lệnh dùng chung vào subscribe),
   *  - relay mỗi message thành một SSE frame,
   *  - heartbeat comment mỗi 25s,
   *  - DỌN DẸP toàn bộ (timer + subscriber + res) khi client đóng (req 'close' / res 'error').
   * Publish là fire-and-forget nên một client chậm/chết chỉ kích hoạt cleanup của chính nó,
   * không chặn publisher hay các kết nối khác (CR-2).
   */
  stream(req: Request, res: Response): void {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // belt-and-braces chống proxy buffering
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const subscriber = this.redis.client.duplicate();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      subscriber.removeAllListeners('message');
      void subscriber.unsubscribe(SUBMISSION_EVENTS_CHANNEL).catch(() => undefined);
      void subscriber.quit().catch(() => undefined);
      res.end();
    };

    const safeWrite = (chunk: string): void => {
      try {
        res.write(chunk);
      } catch {
        cleanup();
      }
    };

    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== SUBMISSION_EVENTS_CHANNEL) return;
      safeWrite(`event: ${SSE_EVENT_NAME}\ndata: ${message}\n\n`);
    });
    void subscriber.subscribe(SUBMISSION_EVENTS_CHANNEL).catch((err) => {
      this.logger.warn(`SSE subscribe failed: ${String(err)}`);
      cleanup();
    });

    // Mở stream ngay: một số proxy chờ byte đầu tiên mới flush; cũng khiến EventSource.onopen chạy.
    safeWrite(': connected\n\n');
    heartbeat = setInterval(() => safeWrite(': ping\n\n'), HEARTBEAT_MS);

    req.on('close', cleanup);
    res.on('error', cleanup);
  }
}
