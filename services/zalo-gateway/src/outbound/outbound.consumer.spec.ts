import { OutboundMessage } from '../contracts';
import { OutboundConsumer } from './outbound.consumer';

describe('OutboundConsumer.handle', () => {
  let redis: {
    getConfigBool: jest.Mock;
    getLastInbound: jest.Mock;
    client: { lpush: jest.Mock };
  };
  let zaloApi: { sendText: jest.Mock };
  let consumer: OutboundConsumer;

  const msg: OutboundMessage = { v: 1, zaloUserId: 'user-1', text: 'Nhận xét bài nói của em…' };

  beforeEach(() => {
    redis = {
      getConfigBool: jest.fn().mockResolvedValue(true),
      getLastInbound: jest.fn().mockResolvedValue(Date.now() - 60_000),
      client: { lpush: jest.fn().mockResolvedValue(1) },
    };
    zaloApi = { sendText: jest.fn().mockResolvedValue(undefined) };
    consumer = new OutboundConsumer({ consume: jest.fn() } as never, redis as never, zaloApi as never);
  });

  it('sends when inside the 48h window', async () => {
    await consumer.handle(msg);
    expect(zaloApi.sendText).toHaveBeenCalledWith('user-1', msg.text);
  });

  it('blocks and records when outside the 48h window', async () => {
    redis.getLastInbound.mockResolvedValue(Date.now() - 49 * 3600 * 1000);
    await consumer.handle(msg);
    expect(zaloApi.sendText).not.toHaveBeenCalled();
    expect(redis.client.lpush).toHaveBeenCalledWith('blocked_48h', expect.stringContaining('user-1'));
  });

  it('sends regardless when the guard is disabled via dashboard config', async () => {
    redis.getConfigBool.mockResolvedValue(false);
    redis.getLastInbound.mockResolvedValue(null);
    await consumer.handle(msg);
    expect(zaloApi.sendText).toHaveBeenCalled();
  });

  it('drops malformed messages without retrying', async () => {
    await consumer.handle({ v: 1, zaloUserId: '', text: '' } as OutboundMessage);
    expect(zaloApi.sendText).not.toHaveBeenCalled();
  });

  it('propagates send errors so RabbitService can retry/DLQ', async () => {
    zaloApi.sendText.mockRejectedValue(new Error('Zalo 5xx'));
    await expect(consumer.handle(msg)).rejects.toThrow('Zalo 5xx');
  });
});
