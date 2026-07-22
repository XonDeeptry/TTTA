import { WorkerApiController } from './worker-api.controller';

describe('WorkerApiController — F6 status-event publishing', () => {
  let prisma: {
    submission: { upsert: jest.Mock; update: jest.Mock };
  };
  let events: { publishStatus: jest.Mock };
  let controller: WorkerApiController;

  beforeEach(() => {
    prisma = { submission: { upsert: jest.fn(), update: jest.fn() } };
    events = { publishStatus: jest.fn() };
    controller = new WorkerApiController(prisma as never, events as never);
  });

  describe('createSubmission (POST /internal/submissions upsert)', () => {
    it('publishes the PERSISTED id+status once after the upsert resolves, incl. default `received` (AC-1/CR-5)', async () => {
      // body omits status -> Prisma default 'received'; publish must reflect the persisted row, not body.
      prisma.submission.upsert.mockResolvedValue({ id: 42, status: 'received' });

      const result = await controller.createSubmission({
        messageId: 'm1',
        zaloUserId: 'u1',
        kind: 'audio',
      } as never);

      expect(result).toEqual({ id: 42, status: 'received' });
      expect(events.publishStatus).toHaveBeenCalledTimes(1);
      expect(events.publishStatus).toHaveBeenCalledWith(42, 'received');
    });

    it('does NOT publish when the upsert rejects (AC-4 — event strictly after a resolved write)', async () => {
      prisma.submission.upsert.mockRejectedValue(new Error('db down'));

      await expect(
        controller.createSubmission({ messageId: 'm1', zaloUserId: 'u1', kind: 'audio' } as never),
      ).rejects.toThrow('db down');
      expect(events.publishStatus).not.toHaveBeenCalled();
    });
  });

  describe('updateSubmission (PATCH /internal/submissions/:id)', () => {
    it('publishes exactly one event with the resolved id+status (AC-2)', async () => {
      prisma.submission.update.mockResolvedValue({ id: 7, status: 'graded' });

      const result = await controller.updateSubmission(7, { status: 'graded' } as never);

      expect(result).toEqual({ id: 7, status: 'graded' });
      expect(events.publishStatus).toHaveBeenCalledTimes(1);
      expect(events.publishStatus).toHaveBeenCalledWith(7, 'graded');
    });

    it('does NOT publish when the update rejects (AC-4)', async () => {
      prisma.submission.update.mockRejectedValue(new Error('no such row'));

      await expect(controller.updateSubmission(7, { status: 'graded' } as never)).rejects.toThrow('no such row');
      expect(events.publishStatus).not.toHaveBeenCalled();
    });
  });
});
