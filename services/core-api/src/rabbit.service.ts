import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { DLX, EXCHANGE, Q_OUTBOUND, Q_SUBMISSIONS, RETRY_EXCHANGE, RETRY_TTL_MS } from './contracts';

/**
 * Publish-only + topology assert (mục 3.5) — port từ zalo-gateway/src/rabbit.service.ts,
 * bỏ phần consume/retry-backoff vì core-api không tiêu thụ hàng đợi trong M2.
 * DLQ retry (mục 3.5 "dashboard có nút Retry") và queue depth dùng thẳng channel AMQP
 * sẵn có (channel.get/checkQueue) — không cần thêm client HTTP quản trị RabbitMQ.
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

  /** Lấy 1 message khỏi {queueBaseName}.dlq và publish lại vào exchange chính (nút Retry). */
  async retryOneFromDlq(queueBaseName: string): Promise<boolean> {
    if (!this.channel) throw new Error('RabbitMQ channel not ready');
    const msg = await this.channel.get(`${queueBaseName}.dlq`, { noAck: false });
    if (!msg) return false;
    this.channel.publish(EXCHANGE, queueBaseName, msg.content, {
      persistent: true,
      contentType: 'application/json',
      headers: { ...msg.properties.headers, 'x-retry': 0 },
    });
    this.channel.ack(msg);
    return true;
  }

  async queueDepth(queueName: string): Promise<number> {
    if (!this.channel) throw new Error('RabbitMQ channel not ready');
    const info = await this.channel.checkQueue(queueName);
    return info.messageCount;
  }
}
