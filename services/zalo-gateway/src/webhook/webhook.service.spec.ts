import { Q_SUBMISSIONS, SubmissionMessage } from '../contracts';
import { DEFAULT_STRANGER_DAILY_MAX, WebhookService, ZaloWebhookEvent } from './webhook.service';

describe('WebhookService.handle', () => {
  let redis: {
    claimMessage: jest.Mock;
    recordInbound: jest.Mock;
    isKnownUser: jest.Mock;
    getConfigInt: jest.Mock;
    bumpStrangerCount: jest.Mock;
  };
  let rabbit: { publish: jest.Mock };
  let service: WebhookService;

  beforeEach(() => {
    redis = {
      claimMessage: jest.fn().mockResolvedValue(true),
      recordInbound: jest.fn().mockResolvedValue(undefined),
      // Mặc định của bộ test cũ = học viên đã kích hoạt (trường hợp thường gặp), nên hạn mức
      // người lạ không đụng tới bất kỳ kịch bản nào có sẵn.
      isKnownUser: jest.fn().mockResolvedValue(true),
      getConfigInt: jest.fn().mockResolvedValue(10),
      bumpStrangerCount: jest.fn().mockResolvedValue(1),
    };
    rabbit = { publish: jest.fn() };
    service = new WebhookService(redis as never, rabbit as never);
  });

  const audioEvent: ZaloWebhookEvent = {
    event_name: 'user_send_audio',
    timestamp: '1721000000000',
    sender: { id: 'user-1' },
    message: {
      msg_id: 'msg-123',
      attachments: [{ type: 'audio', payload: { url: 'https://zalo.example/audio.m4a' } }],
    },
  };

  it('publishes a normalized audio submission', async () => {
    await expect(service.handle(audioEvent)).resolves.toBe('published');
    expect(rabbit.publish).toHaveBeenCalledTimes(1);
    const [routingKey, message] = rabbit.publish.mock.calls[0] as [string, SubmissionMessage];
    expect(routingKey).toBe(Q_SUBMISSIONS);
    expect(message).toMatchObject({
      v: 1,
      messageId: 'msg-123',
      kind: 'audio',
      zaloUserId: 'user-1',
      mediaUrl: 'https://zalo.example/audio.m4a',
    });
  });

  it('records inbound timestamp for the 48h window on every user interaction', async () => {
    await service.handle(audioEvent);
    expect(redis.recordInbound).toHaveBeenCalledWith('user-1', expect.any(Number));
  });

  it('skips duplicates (Zalo redelivery)', async () => {
    redis.claimMessage.mockResolvedValue(false);
    await expect(service.handle(audioEvent)).resolves.toBe('duplicate');
    expect(rabbit.publish).not.toHaveBeenCalled();
  });

  it('normalizes text messages with their content', async () => {
    const result = await service.handle({
      event_name: 'user_send_text',
      sender: { id: 'user-2' },
      message: { msg_id: 'msg-9', text: 'em nộp bài ạ' },
    });
    expect(result).toBe('published');
    const [, message] = rabbit.publish.mock.calls[0] as [string, SubmissionMessage];
    expect(message).toMatchObject({ kind: 'text', text: 'em nộp bài ạ' });
  });

  it('synthesizes a stable dedup id for follow events (no msg_id)', async () => {
    const result = await service.handle({
      event_name: 'follow',
      timestamp: 1721000099,
      follower: { id: 'user-3' },
    });
    expect(result).toBe('published');
    expect(redis.claimMessage).toHaveBeenCalledWith('follow:user-3:1721000099');
    const [, message] = rabbit.publish.mock.calls[0] as [string, SubmissionMessage];
    expect(message).toMatchObject({ kind: 'follow', zaloUserId: 'user-3' });
  });

  it('ignores unknown events (user_seen_message, oa_send_text...)', async () => {
    await expect(service.handle({ event_name: 'user_seen_message', sender: { id: 'u' } })).resolves.toBe('ignored');
    expect(rabbit.publish).not.toHaveBeenCalled();
  });

  it('ignores events without a sender id', async () => {
    await expect(service.handle({ event_name: 'user_send_text', message: { msg_id: 'x' } })).resolves.toBe('ignored');
  });

  /**
   * Hạn mức NGƯỜI LẠ (2026-09-06). Bất kỳ ai cũng quan tâm OA và nhắn tin được, nên nếu không
   * chặn thì mỗi tin của người ngoài đều sinh một dòng `submissions` + `flags` + một tin gửi ra.
   * Ranh giới then chốt của bộ test này: **học viên đã kích hoạt không bao giờ bị đếm.**
   */
  describe('hạn mức người lạ', () => {
    const strangerEvent = (msgId: string): ZaloWebhookEvent => ({
      event_name: 'user_send_text',
      sender: { id: 'ke-la' },
      message: { msg_id: msgId, text: 'spam' },
    });

    it('học viên đã kích hoạt KHÔNG bị đếm hạn mức', async () => {
      redis.isKnownUser.mockResolvedValue(true);
      await expect(service.handle(strangerEvent('m1'))).resolves.toBe('published');
      expect(redis.bumpStrangerCount).not.toHaveBeenCalled();
      expect(redis.getConfigInt).not.toHaveBeenCalled();
    });

    it('người lạ dưới ngưỡng ⇒ vẫn nhận bình thường', async () => {
      redis.isKnownUser.mockResolvedValue(false);
      redis.bumpStrangerCount.mockResolvedValue(3);
      await expect(service.handle(strangerEvent('m2'))).resolves.toBe('published');
      expect(rabbit.publish).toHaveBeenCalledTimes(1);
    });

    it('đúng NGƯỠNG vẫn cho qua (biên: count === max)', async () => {
      redis.isKnownUser.mockResolvedValue(false);
      redis.getConfigInt.mockResolvedValue(10);
      redis.bumpStrangerCount.mockResolvedValue(10);
      await expect(service.handle(strangerEvent('m3'))).resolves.toBe('published');
    });

    it('vượt ngưỡng ⇒ bỏ hẳn: không publish, không vào queue, không trả lời', async () => {
      redis.isKnownUser.mockResolvedValue(false);
      redis.getConfigInt.mockResolvedValue(10);
      redis.bumpStrangerCount.mockResolvedValue(11);
      await expect(service.handle(strangerEvent('m4'))).resolves.toBe('stranger_quota');
      expect(rabbit.publish).not.toHaveBeenCalled();
    });

    it('đặt 0 ⇒ chặn người lạ ngay từ tin ĐẦU TIÊN', async () => {
      redis.isKnownUser.mockResolvedValue(false);
      redis.getConfigInt.mockResolvedValue(0);
      redis.bumpStrangerCount.mockResolvedValue(1);
      await expect(service.handle(strangerEvent('m5'))).resolves.toBe('stranger_quota');
      expect(rabbit.publish).not.toHaveBeenCalled();
    });

    it('tin TRÙNG không ăn vào hạn mức (dedup chạy trước)', async () => {
      redis.isKnownUser.mockResolvedValue(false);
      redis.claimMessage.mockResolvedValue(false);
      await expect(service.handle(strangerEvent('m6'))).resolves.toBe('duplicate');
      expect(redis.bumpStrangerCount).not.toHaveBeenCalled();
    });

    it('mặc định 10 khi chưa cấu hình `limits.stranger_daily_max`', async () => {
      redis.isKnownUser.mockResolvedValue(false);
      redis.bumpStrangerCount.mockResolvedValue(1);
      await service.handle(strangerEvent('m7'));
      expect(redis.getConfigInt).toHaveBeenCalledWith('limits.stranger_daily_max', DEFAULT_STRANGER_DAILY_MAX);
      expect(DEFAULT_STRANGER_DAILY_MAX).toBe(10);
    });
  });
});
