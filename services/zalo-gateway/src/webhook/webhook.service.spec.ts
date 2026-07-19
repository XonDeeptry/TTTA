import { Q_SUBMISSIONS, SubmissionMessage } from '../contracts';
import { WebhookService, ZaloWebhookEvent } from './webhook.service';

describe('WebhookService.handle', () => {
  let redis: { claimMessage: jest.Mock; recordInbound: jest.Mock };
  let rabbit: { publish: jest.Mock };
  let service: WebhookService;

  beforeEach(() => {
    redis = { claimMessage: jest.fn().mockResolvedValue(true), recordInbound: jest.fn().mockResolvedValue(undefined) };
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
});
