import { OutboundButton } from '../contracts';
import { ZaloApiService } from './zalo-api.service';

const SEND_URL = 'https://openapi.zalo.me/v3.0/oa/message/cs';

type RedisStub = { getAccessToken: jest.Mock; getConfig: jest.Mock };

/** Đọc body JSON của lần fetch thứ `n` (0-based). */
function bodyOf(fetchMock: jest.Mock, n = 0): Record<string, any> {
  return JSON.parse((fetchMock.mock.calls[n][1] as { body: string }).body);
}

function ok(): { json: () => Promise<{ error: number }> } {
  return { json: async () => ({ error: 0 }) };
}

describe('ZaloApiService.sendText', () => {
  let redis: RedisStub;
  let tokenService: { refreshNow: jest.Mock };
  let service: ZaloApiService;
  let fetchMock: jest.Mock;

  const btn = (over: Partial<OutboundButton> = {}): OutboundButton => ({
    title: 'Em đã xem',
    action: 'ack',
    payload: '#ilm:ack:123',
    ...over,
  });

  beforeEach(() => {
    redis = {
      getAccessToken: jest.fn().mockResolvedValue('tok-1'),
      getConfig: jest.fn().mockResolvedValue(null), // zalo.buttons_template_type chưa đặt
    };
    tokenService = { refreshNow: jest.fn().mockResolvedValue(true) };
    service = new ZaloApiService(redis as never, tokenService as never);
    fetchMock = jest.fn().mockResolvedValue(ok());
    service.fetchFn = fetchMock as never;
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  // ─── FR-02: shape đường gửi ────────────────────────────────────────────────────────

  it('AC-02.1 — two-arg call produces the exact pre-F11 body (no attachment key)', async () => {
    await service.sendText('u1', 'xin chào');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(SEND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', access_token: 'tok-1' });
    expect(init.body).toBe(JSON.stringify({ recipient: { user_id: 'u1' }, message: { text: 'xin chào' } }));
    expect(redis.getConfig).not.toHaveBeenCalled(); // AC-04.4: đường text thuần không đọc config
  });

  it('AC-02.3/02.4 — buttons produce the attachment-template body with type oa.query.show', async () => {
    await service.sendText('u1', 'Nhận xét…', [btn(), btn({ title: 'Nhờ cô', action: 'request_advisor', payload: '#ilm:request_advisor:123' })]);

    expect(bodyOf(fetchMock)).toEqual({
      recipient: { user_id: 'u1' },
      message: {
        text: 'Nhận xét…',
        attachment: {
          type: 'template',
          payload: {
            buttons: [
              { title: 'Em đã xem', type: 'oa.query.show', payload: '#ilm:ack:123' },
              { title: 'Nhờ cô', type: 'oa.query.show', payload: '#ilm:request_advisor:123' },
            ],
          },
        },
      },
    });
  });

  it('AC-02.4 — the internal `action` field is never emitted to Zalo', async () => {
    await service.sendText('u1', 't', [btn()]);
    const emitted = bodyOf(fetchMock).message.attachment.payload.buttons[0];
    expect(Object.keys(emitted).sort()).toEqual(['payload', 'title', 'type']);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty array', []],
  ])('AC-02.5 — buttons=%s sends the plain-text body', async (_label, buttons) => {
    await service.sendText('u1', 't', buttons as never);
    expect(bodyOf(fetchMock)).toEqual({ recipient: { user_id: 'u1' }, message: { text: 't' } });
  });

  it('AC-02.7 — throws when no access token is available (both variants)', async () => {
    redis.getAccessToken.mockResolvedValue(null);
    await expect(service.sendText('u1', 't')).rejects.toThrow('No Zalo access token available');
    await expect(service.sendText('u1', 't', [btn()])).rejects.toThrow('No Zalo access token available');
  });

  // ─── FR-03: giới hạn Zalo, tất-cả-hoặc-không ──────────────────────────────────────

  const plain = (): unknown => ({ recipient: { user_id: 'u1' }, message: { text: 't' } });

  it('AC-03.1 — more than 5 buttons drops the WHOLE block (no truncation) + one warn', async () => {
    const warn = jest.spyOn(service['logger'], 'warn');
    await service.sendText('u1', 't', [btn(), btn(), btn(), btn(), btn(), btn()]);
    expect(bodyOf(fetchMock)).toEqual(plain());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('count=6');
  });

  it('AC-03.2 — a title longer than 100 chars drops the whole block', async () => {
    await service.sendText('u1', 't', [btn(), btn({ title: 'x'.repeat(101) })]);
    expect(bodyOf(fetchMock)).toEqual(plain());
  });

  it('AC-03.3 — a payload longer than 1000 chars drops the whole block (never truncated)', async () => {
    await service.sendText('u1', 't', [btn({ payload: '#ilm:ack:' + '1'.repeat(1000) })]);
    expect(bodyOf(fetchMock)).toEqual(plain());
  });

  it.each([
    ['title không phải chuỗi', btn({ title: 42 as never })],
    ['title rỗng sau trim', btn({ title: '   ' })],
    ['payload không có tiền tố #ilm:', btn({ payload: 'ack:1' })],
    ['payload không phải chuỗi', btn({ payload: null as never })],
    ['action ngoài tập đóng', btn({ action: 'delete_account' as never })],
  ])('AC-03.4 — %s drops the whole block', async (_label, bad) => {
    await service.sendText('u1', 't', [btn(), bad]);
    expect(bodyOf(fetchMock)).toEqual(plain());
  });

  it('AC-03.5 — a dropped block never throws; resolution still follows Zalo error===0', async () => {
    await expect(service.sendText('u1', 't', [btn({ action: 'nope' as never })])).resolves.toBeUndefined();
    fetchMock.mockResolvedValue({ json: async () => ({ error: -32, message: 'boom' }) });
    await expect(service.sendText('u1', 't', [btn({ action: 'nope' as never })])).rejects.toThrow('Zalo send failed: -32 boom');
  });

  it('AC-03.6 — text over 2000 chars warns but is sent UNCHANGED (no truncation, no reject)', async () => {
    const warn = jest.spyOn(service['logger'], 'warn');
    const long = 'x'.repeat(2001);
    await service.sendText('u1', long);
    expect(bodyOf(fetchMock).message.text).toBe(long);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('2001');
  });

  it('AC-03.8 — the inclusive maxima (5 buttons / 100-char title / 1000-char payload / 2000-char text) still send WITH buttons', async () => {
    const warn = jest.spyOn(service['logger'], 'warn');
    const five = [1, 2, 3, 4, 5].map(() => btn({ title: 'x'.repeat(100), payload: '#ilm:ack:' + '1'.repeat(991) }));
    await service.sendText('u1', 'y'.repeat(2000), five);
    const body = bodyOf(fetchMock);
    expect(body.message.attachment.payload.buttons).toHaveLength(5);
    expect(body.message.attachment.payload.buttons[0].payload).toHaveLength(1000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('AC-03.7 — validation performs no Redis/HTTP work of its own on a dropped block', async () => {
    await service.sendText('u1', 't', [btn({ action: 'nope' as never })]);
    expect(redis.getConfig).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ─── FR-04: template_type sau cờ cấu hình ─────────────────────────────────────────

  it('AC-04.2 — unset/empty zalo.buttons_template_type omits the field', async () => {
    await service.sendText('u1', 't', [btn()]);
    expect(Object.keys(bodyOf(fetchMock).message.attachment.payload)).toEqual(['buttons']);

    redis.getConfig.mockResolvedValue('');
    await service.sendText('u1', 't', [btn()]);
    expect(Object.keys(bodyOf(fetchMock, 1).message.attachment.payload)).toEqual(['buttons']);
  });

  it('AC-04.1/04.3 — a non-empty value is emitted verbatim alongside buttons', async () => {
    redis.getConfig.mockResolvedValue('button');
    await service.sendText('u1', 't', [btn()]);
    expect(redis.getConfig).toHaveBeenCalledWith('zalo.buttons_template_type');
    expect(bodyOf(fetchMock).message.attachment.payload).toEqual({
      buttons: [{ title: 'Em đã xem', type: 'oa.query.show', payload: '#ilm:ack:123' }],
      template_type: 'button',
    });
  });

  it('AC-04.5 — a Redis failure degrades to "omit template_type", it does not fail the send', async () => {
    redis.getConfig.mockRejectedValue(new Error('redis down'));
    await expect(service.sendText('u1', 't', [btn()])).resolves.toBeUndefined();
    expect(Object.keys(bodyOf(fetchMock).message.attachment.payload)).toEqual(['buttons']);
  });

  // ─── FR-06: -216 refresh-and-retry-once, dùng chung cho cả hai biến thể ────────────

  it('AC-06.1/06.2/06.5 — -216 refreshes once and retries with the SAME buttons payload', async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ error: -216 }) })
      .mockResolvedValueOnce(ok());

    await service.sendText('u1', 't', [btn()]);

    expect(tokenService.refreshNow).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1)).toEqual(bodyOf(fetchMock, 0)); // không hạ cấp khi gửi lại
    expect(bodyOf(fetchMock, 1).message.attachment.payload.buttons).toHaveLength(1);
  });

  it('AC-06.1 — a failed refresh throws the existing message', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ error: -216 }) });
    tokenService.refreshNow.mockResolvedValue(false);
    await expect(service.sendText('u1', 't', [btn()])).rejects.toThrow('Token expired and refresh failed');
  });

  it('AC-06.3 — a second -216 is NOT retried again', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ error: -216, message: 'expired' }) });
    await expect(service.sendText('u1', 't', [btn()])).rejects.toThrow('Zalo send failed: -216 expired');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenService.refreshNow).toHaveBeenCalledTimes(1);
  });

  it('AC-06.4 — any other non-zero error keeps the existing string format', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ error: -213 }) });
    await expect(service.sendText('u1', 't')).rejects.toThrow('Zalo send failed: -213 ');
  });

  it('AC-04.4 — template_type is read at most once per send, only for the buttons variant', async () => {
    await service.sendText('u1', 't', [btn()]);
    expect(redis.getConfig).toHaveBeenCalledTimes(1);
  });
});
