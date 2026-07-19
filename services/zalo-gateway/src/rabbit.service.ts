import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  DLX,
  EXCHANGE,
  MAX_RETRIES,
  Q_OUTBOUND,
  Q_SUBMISSIONS,
  RETRY_EXCHANGE,
  RETRY_TTL_MS,
} from './contracts';

/**
 * Topology (mục 3.5): exchange ilm.direct; mỗi queue chính có
 *  - {queue}.dlq  (qua ilm.dlx) — bài lỗi chờ xử lý tay, dashboard có nút Retry
 *  - {queue}.retry (qua ilm.retry, TTL 30s, DLX ngược về ilm.direct) — retry có backoff
 * Cả gateway lẫn grading-worker cùng assert topology này (idempotent).
 */
@Injectable()
export class RabbitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private closing = false;

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    await this.connection?.close().catch(() => undefined);
  }

  private async connectWithRetry(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    for (;;) {
      try {
        this.connection = await amqp.connect(url);
        this.connection.on('close', () => {
          if (!this.closing) {
            this.logger.warn('RabbitMQ connection closed — reconnecting');
            setTimeout(() => void this.connectWithRetry(), 5000);
          }
        });
        this.channel = await this.connection.createChannel();
        await this.channel.prefetch(10);
        await this.assertTopology(this.channel);
        this.logger.log('RabbitMQ connected, topology asserted');
        return;
      } catch (err) {
        this.logger.error(`RabbitMQ connect failed: ${(err as Error).message} — retry in 5s`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  private async assertTopology(ch: amqp.Channel): Promise<void> {
    await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
    await ch.assertExchange(DLX, 'direct', { durable: true });
    await ch.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });

    for (const q of [Q_SUBMISSIONS, Q_OUTBOUND]) {
      await ch.assertQueue(q, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': q },
      });
      await ch.bindQueue(q, EXCHANGE, q);

      await ch.assertQueue(`${q}.dlq`, { durable: true });
      await ch.bindQueue(`${q}.dlq`, DLX, q);

      await ch.assertQueue(`${q}.retry`, {
        durable: true,
        arguments: {
          'x-message-ttl': RETRY_TTL_MS,
          'x-dead-letter-exchange': EXCHANGE,
          'x-dead-letter-routing-key': q,
        },
      });
      await ch.bindQueue(`${q}.retry`, RETRY_EXCHANGE, q);
    }
  }

  publish(routingKey: string, message: object, headers: Record<string, unknown> = {}): void {
    if (!this.channel) throw new Error('RabbitMQ channel not ready');
    this.channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
      headers,
    });
  }

  /**
   * Consume với retry/backoff: handler ném lỗi → republish sang {queue}.retry
   * (TTL đưa về queue chính); quá MAX_RETRIES lần → đẩy vào {queue}.dlq.
   */
  consume(queue: string, handler: (payload: unknown) => Promise<void>): void {
    if (!this.channel) throw new Error('RabbitMQ channel not ready');
    const ch = this.channel;
    void ch.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(payload);
        } catch (err) {
          const retryCount = Number(msg.properties.headers?.['x-retry'] ?? 0);
          if (retryCount >= MAX_RETRIES) {
            this.logger.error(`${queue}: giving up after ${retryCount} retries → DLQ: ${(err as Error).message}`);
            ch.publish(DLX, queue, msg.content, {
              persistent: true,
              contentType: 'application/json',
              headers: { ...msg.properties.headers, 'x-last-error': String((err as Error).message) },
            });
          } else {
            this.logger.warn(`${queue}: attempt ${retryCount + 1} failed → retry queue: ${(err as Error).message}`);
            ch.publish(RETRY_EXCHANGE, queue, msg.content, {
              persistent: true,
              contentType: 'application/json',
              headers: { ...msg.properties.headers, 'x-retry': retryCount + 1 },
            });
          }
        } finally {
          ch.ack(msg);
        }
      })();
    });
  }
}
