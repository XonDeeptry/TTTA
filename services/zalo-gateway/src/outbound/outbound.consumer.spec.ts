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
    // F11 AC-05.1: `sendText` nhận thêm tham số nút thứ ba (undefined ở tin không nút) — đây là
    // thay đổi DUY NHẤT của assertion cũ, bắt buộc vì jest so khớp cả số lượng đối số.
    expect(zaloApi.sendText).toHaveBeenCalledWith('user-1', msg.text, undefined);
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

  /**
   * F11 FR-05 — consumer CHỈ truyền `msg.buttons` xuống; guard 48h / blocked_48h / không-retry
   * giữ nguyên tuyệt đối. Mọi việc lọc-giới-hạn nằm trong `sendText`, không phải ở đây.
   */
  describe('F11 — buttons pass-through, guard giữ nguyên', () => {
    const buttons = [{ title: 'Em đã xem', action: 'ack' as const, payload: '#ilm:ack:123' }];
    const withButtons: OutboundMessage = { ...msg, buttons };

    it('forwards msg.buttons verbatim as the third argument (AC-05.6)', async () => {
      await consumer.handle(withButtons);
      expect(zaloApi.sendText).toHaveBeenCalledTimes(1);
      expect(zaloApi.sendText).toHaveBeenCalledWith('user-1', msg.text, buttons);
      expect(zaloApi.sendText.mock.calls[0][2]).toBe(buttons); // không sao chép/lọc/đảo thứ tự
    });

    it('blocks a buttons message outside the window and stores buttons in blocked_48h (AC-05.4/05.5)', async () => {
      redis.getLastInbound.mockResolvedValue(Date.now() - 49 * 3600 * 1000);
      await consumer.handle(withButtons);
      expect(zaloApi.sendText).not.toHaveBeenCalled();
      const [key, raw] = redis.client.lpush.mock.calls[0] as [string, string];
      expect(key).toBe('blocked_48h');
      const stored = JSON.parse(raw);
      expect(stored.buttons).toEqual(buttons);
      expect(stored.blockedAt).toEqual(expect.any(String));
    });

    it('still reads limits.outbound_48h_guard with default true (AC-05.3)', async () => {
      await consumer.handle(withButtons);
      expect(redis.getConfigBool).toHaveBeenCalledWith('limits.outbound_48h_guard', true);
    });

    it('drops a buttons message that has no text — malformed guard unchanged (AC-05.2)', async () => {
      await consumer.handle({ v: 1, zaloUserId: 'user-1', text: '', buttons } as OutboundMessage);
      expect(zaloApi.sendText).not.toHaveBeenCalled();
    });

    it('propagates send errors for buttons messages too (AC-05.7)', async () => {
      zaloApi.sendText.mockRejectedValue(new Error('Zalo 5xx'));
      await expect(consumer.handle(withButtons)).rejects.toThrow('Zalo 5xx');
    });
  });
});
