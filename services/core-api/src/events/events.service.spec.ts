import { EventEmitter } from 'events';
import { EventsService, HEARTBEAT_MS, SSE_EVENT_NAME, SUBMISSION_EVENTS_CHANNEL } from './events.service';

/** Subscriber Redis giả: EventEmitter thật (để .emit('message',...) hoạt động) + spy cho các lệnh. */
function makeSubscriber(): EventEmitter & {
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  quit: jest.Mock;
} {
  const sub = new EventEmitter() as never as EventEmitter & {
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
    quit: jest.Mock;
  };
  sub.subscribe = jest.fn().mockResolvedValue(1);
  sub.unsubscribe = jest.fn().mockResolvedValue(1);
  sub.quit = jest.fn().mockResolvedValue('OK');
  return sub;
}

/** Response Express giả: EventEmitter (cho res.on('error')) + spy write/end/setHeader/flushHeaders. */
function makeRes(): EventEmitter & {
  statusCode: number;
  setHeader: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  flushHeaders: jest.Mock;
} {
  const res = new EventEmitter() as never as EventEmitter & {
    statusCode: number;
    setHeader: jest.Mock;
    write: jest.Mock;
    end: jest.Mock;
    flushHeaders: jest.Mock;
  };
  res.statusCode = 0;
  res.setHeader = jest.fn();
  res.write = jest.fn();
  res.end = jest.fn();
  res.flushHeaders = jest.fn();
  return res;
}

describe('EventsService', () => {
  describe('publishStatus', () => {
    it('publishes the persisted {submissionId,status,at} JSON to the Redis channel (AC-1/CR-5)', () => {
      const publish = jest.fn().mockResolvedValue(1);
      const redis = { client: { publish } };
      const service = new EventsService(redis as never);

      service.publishStatus(123, 'graded', '2026-07-22T10:15:30.000Z');

      expect(publish).toHaveBeenCalledTimes(1);
      const [channel, raw] = publish.mock.calls[0];
      expect(channel).toBe(SUBMISSION_EVENTS_CHANNEL);
      expect(JSON.parse(raw)).toEqual({ submissionId: 123, status: 'graded', at: '2026-07-22T10:15:30.000Z' });
    });

    it('defaults `at` to an ISO timestamp when not provided', () => {
      const publish = jest.fn().mockResolvedValue(1);
      const service = new EventsService({ client: { publish } } as never);

      service.publishStatus(1, 'received');

      const parsed = JSON.parse(publish.mock.calls[0][1]);
      expect(parsed).toMatchObject({ submissionId: 1, status: 'received' });
      expect(new Date(parsed.at).toISOString()).toBe(parsed.at);
    });

    it('never throws when redis.publish rejects — failure is swallowed (AC-5/CR-4)', () => {
      const publish = jest.fn().mockRejectedValue(new Error('redis down'));
      const service = new EventsService({ client: { publish } } as never);

      // Không được ném đồng bộ; rejection được nuốt trong .catch nội bộ.
      expect(() => service.publishStatus(1, 'graded')).not.toThrow();
    });

    it('never throws when redis.publish throws synchronously', () => {
      const publish = jest.fn(() => {
        throw new Error('sync boom');
      });
      const service = new EventsService({ client: { publish } } as never);

      expect(() => service.publishStatus(1, 'graded')).not.toThrow();
    });
  });

  describe('stream', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    function setup() {
      const subscriber = makeSubscriber();
      const redis = { client: { duplicate: jest.fn(() => subscriber) } };
      const service = new EventsService(redis as never);
      const req = new EventEmitter();
      const res = makeRes();
      return { service, redis, subscriber, req, res };
    }

    it('sets text/event-stream headers, status 200, and opens with a comment frame (AC-8)', () => {
      const { service, req, res } = setup();

      service.stream(req as never, res as never);

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.write).toHaveBeenCalledWith(': connected\n\n');
    });

    it('creates a dedicated duplicated subscriber and subscribes to the channel (AC-8)', () => {
      const { service, redis, subscriber, req, res } = setup();

      service.stream(req as never, res as never);

      expect(redis.client.duplicate).toHaveBeenCalledTimes(1);
      expect(subscriber.subscribe).toHaveBeenCalledWith(SUBMISSION_EVENTS_CHANNEL);
    });

    it('relays a Redis message as an SSE frame `event: submission.status\\ndata:...\\n\\n` (AC-9)', () => {
      const { service, subscriber, req, res } = setup();
      service.stream(req as never, res as never);
      res.write.mockClear();

      const payload = JSON.stringify({ submissionId: 5, status: 'graded', at: '2026-07-22T00:00:00.000Z' });
      subscriber.emit('message', SUBMISSION_EVENTS_CHANNEL, payload);

      expect(res.write).toHaveBeenCalledWith(`event: ${SSE_EVENT_NAME}\ndata: ${payload}\n\n`);
    });

    it('ignores messages from a different channel', () => {
      const { service, subscriber, req, res } = setup();
      service.stream(req as never, res as never);
      res.write.mockClear();

      subscriber.emit('message', 'some:other:channel', '{"x":1}');

      expect(res.write).not.toHaveBeenCalled();
    });

    it('writes a `: ping` heartbeat every 25s (AC-10)', () => {
      const { service, req, res } = setup();
      service.stream(req as never, res as never);
      res.write.mockClear();

      jest.advanceTimersByTime(HEARTBEAT_MS);
      expect(res.write).toHaveBeenCalledWith(': ping\n\n');

      jest.advanceTimersByTime(HEARTBEAT_MS);
      expect(res.write).toHaveBeenCalledTimes(2);

      req.emit('close'); // dọn dẹp để không rò timer
    });

    it('on req close: clears the heartbeat, unsubscribes+quits the subscriber, ends the response (AC-11/CR-3)', () => {
      const { service, subscriber, req, res } = setup();
      service.stream(req as never, res as never);

      req.emit('close');

      expect(subscriber.unsubscribe).toHaveBeenCalledWith(SUBMISSION_EVENTS_CHANNEL);
      expect(subscriber.quit).toHaveBeenCalledTimes(1);
      expect(res.end).toHaveBeenCalledTimes(1);

      // Heartbeat đã bị clear: không còn ping nào được ghi sau khi đóng.
      res.write.mockClear();
      jest.advanceTimersByTime(HEARTBEAT_MS * 3);
      expect(res.write).not.toHaveBeenCalled();
    });

    it('after close, a late Redis message is not written to the (ended) response', () => {
      const { service, subscriber, req, res } = setup();
      service.stream(req as never, res as never);
      req.emit('close');
      res.write.mockClear();

      subscriber.emit('message', SUBMISSION_EVENTS_CHANNEL, '{"submissionId":1,"status":"graded"}');

      expect(res.write).not.toHaveBeenCalled();
    });

    it('cleanup is idempotent — a second close does not double-quit/end', () => {
      const { service, subscriber, req, res } = setup();
      service.stream(req as never, res as never);

      req.emit('close');
      req.emit('close');

      expect(subscriber.quit).toHaveBeenCalledTimes(1);
      expect(res.end).toHaveBeenCalledTimes(1);
    });

    it('two connections are independent: closing one leaves the other receiving events (AC-12/CR-1)', () => {
      const sub1 = makeSubscriber();
      const sub2 = makeSubscriber();
      const duplicate = jest.fn().mockReturnValueOnce(sub1).mockReturnValueOnce(sub2);
      const service = new EventsService({ client: { duplicate } } as never);

      const req1 = new EventEmitter();
      const res1 = makeRes();
      const req2 = new EventEmitter();
      const res2 = makeRes();

      service.stream(req1 as never, res1 as never);
      service.stream(req2 as never, res2 as never);
      res1.write.mockClear();
      res2.write.mockClear();

      // Đóng connection 1.
      req1.emit('close');
      expect(sub1.quit).toHaveBeenCalledTimes(1);
      expect(sub2.quit).not.toHaveBeenCalled();

      // Connection 2 vẫn nhận sự kiện; connection 1 (đã đóng) thì không.
      const payload = JSON.stringify({ submissionId: 9, status: 'sent' });
      sub2.emit('message', SUBMISSION_EVENTS_CHANNEL, payload);
      expect(res2.write).toHaveBeenCalledWith(`event: ${SSE_EVENT_NAME}\ndata: ${payload}\n\n`);

      sub1.emit('message', SUBMISSION_EVENTS_CHANNEL, payload);
      expect(res1.write).not.toHaveBeenCalled();

      req2.emit('close');
    });

    it('tears down when res emits an error (dead socket)', () => {
      const { service, subscriber, req, res } = setup();
      service.stream(req as never, res as never);

      res.emit('error', new Error('EPIPE'));

      expect(subscriber.quit).toHaveBeenCalledTimes(1);
      expect(res.end).toHaveBeenCalledTimes(1);
      req.emit('close'); // no-op, đã cleanup
    });
  });
});
