import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { normalizeRubric } from '../criteria/rubric-schema';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED } from '../criteria/templates';
import { computeTotal } from '../lib/rubric-scoring';
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

/**
 * F9 — `POST /internal/gradings` là ĐIỂM GỌI `computeTotal` duy nhất trên đường ghi (FR-08/FR-09).
 * Rubric KID lấy từ `Criteria-Source/RubricSpeakingA0-C.pdf` (0–5 × 5 tiêu chí, tổng tối đa 25).
 */
describe('WorkerApiController — F9 createGrading (computeTotal + student level)', () => {
  /**
   * F10 AC-06.3 — KHÔNG chép lại seed, DẪN XUẤT từ nó (seed là bản duy nhất trong repo).
   * Vẫn giữ đúng tính chất "rubric THÔ như đang nằm trong DB": chỉ có `key`, không `label`,
   * không `bands`, không `sub_factors` — đó là thứ chứng minh `createGrading` có gọi
   * `normalizeRubric` trước khi tính. Giá trị từng con số y hệt bản dựng tay trước đây, nên
   * mọi assertion bên dưới không đổi một chữ.
   */
  const KID_RUBRIC = {
    schema_version: 2,
    scale: CAMBRIDGE_YL_SEED.rubric.scale,
    aggregation: CAMBRIDGE_YL_SEED.rubric.aggregation,
    levels: CAMBRIDGE_YL_SEED.rubric.levels,
    dimensions: CAMBRIDGE_YL_SEED.rubric.dimensions.map((d) => ({ key: d.key })),
  };
  const IELTS_RUBRIC = {
    schema_version: 2,
    scale: IELTS_SPEAKING_SEED.rubric.scale,
    aggregation: IELTS_SPEAKING_SEED.rubric.aggregation,
    levels: IELTS_SPEAKING_SEED.rubric.levels,
    dimensions: IELTS_SPEAKING_SEED.rubric.dimensions.map((d) => ({ key: d.key })),
  };
  const KID_SCORES = {
    pronunciation: { score: 4, comment: 'x' },
    intonation: { score: 3, comment: 'x' },
    ending_sounds: { score: 4, comment: 'x' },
    word_stress: { score: 3, comment: 'x' },
    fluency: { score: 4, comment: 'x' },
  };
  const RECEIVED_AT = new Date('2026-08-01T10:00:00Z');
  const GRADING_ROW = { id: 99 };

  let prisma: {
    criteria: { findUnique: jest.Mock };
    submission: { findUnique: jest.Mock };
    grading: { create: jest.Mock };
    student: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let controller: WorkerApiController;

  const body = (overrides: Record<string, unknown> = {}) =>
    ({
      submissionId: 1,
      criteriaId: 10,
      criteriaVersion: 3,
      scores: KID_SCORES,
      llmFeedback: 'ok',
      ...overrides,
    }) as never;

  const gradingData = () => prisma.grading.create.mock.calls[0][0].data as Record<string, unknown>;

  beforeEach(() => {
    prisma = {
      criteria: { findUnique: jest.fn().mockResolvedValue({ id: 10, rubric: KID_RUBRIC }) },
      submission: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, studentId: 55, receivedAt: RECEIVED_AT }),
      },
      grading: { create: jest.fn().mockReturnValue(GRADING_ROW) },
      student: { updateMany: jest.fn().mockReturnValue({ count: 1 }) },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    controller = new WorkerApiController(prisma as never, { publishStatus: jest.fn() } as never);
  });

  it('AC-08.1/08.3 persists total 18 / level A1 for the Cambridge YL worked example', async () => {
    const result = await controller.createGrading(body());

    expect(result).toBe(GRADING_ROW);
    expect(gradingData()).toMatchObject({
      totalScore: 18,
      levelCode: 'A1',
      levelLabel: 'Mover (A1) ~ Junior Panda',
    });
  });

  it('AC-08.5 every pre-existing field is written unchanged (the worker DTO gains nothing)', async () => {
    await controller.createGrading(body({ autoSent: true }));
    expect(gradingData()).toMatchObject({
      submissionId: 1,
      criteriaId: 10,
      criteriaVersion: 3,
      scores: KID_SCORES,
      llmFeedback: 'ok',
      autoSent: true,
    });
    // studentAckAt là của F11 — F9 KHÔNG BAO GIỜ ghi nó (BR-11).
    expect(gradingData()).not.toHaveProperty('studentAckAt');
  });

  it('AC-08.4/BR-05 no usable score ⇒ NULL total and level, and no student update', async () => {
    await controller.createGrading(body({ scores: {} }));
    expect(gradingData()).toMatchObject({ totalScore: null, levelCode: null, levelLabel: null });
    expect(prisma.student.updateMany).not.toHaveBeenCalled();
  });

  it('AC-08.7 unknown criteria / submission ⇒ NotFoundException, nothing written', async () => {
    prisma.criteria.findUnique.mockResolvedValue(null);
    await expect(controller.createGrading(body())).rejects.toThrow(NotFoundException);

    prisma.criteria.findUnique.mockResolvedValue({ id: 10, rubric: KID_RUBRIC });
    prisma.submission.findUnique.mockResolvedValue(null);
    await expect(controller.createGrading(body())).rejects.toThrow('submission not found');
    expect(prisma.grading.create).not.toHaveBeenCalled();
  });

  it('AC-08.8 a malformed rubric never fails the request', async () => {
    prisma.criteria.findUnique.mockResolvedValue({ id: 10, rubric: 'not a rubric at all' });
    await expect(controller.createGrading(body())).resolves.toBe(GRADING_ROW);
    // đường di sản (AC-02.7): 5 khóa của `scores`, average, thang mặc định 0–3 ⇒ điểm bị kẹp về 3
    expect(gradingData().totalScore).toBe(3);
  });

  it('AC-09.1/09.2/09.3 updates the student level with receivedAt and the out-of-order guard', async () => {
    await controller.createGrading(body());
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: {
        id: 55,
        OR: [{ currentLevelAt: null }, { currentLevelAt: { lte: RECEIVED_AT } }],
      },
      data: { currentLevelCode: 'A1', currentLevelAt: RECEIVED_AT },
    });
  });

  it('AC-09.6 a rubric with no levels writes the total but leaves currentLevel* untouched', async () => {
    prisma.criteria.findUnique.mockResolvedValue({ id: 10, rubric: IELTS_RUBRIC });
    await controller.createGrading(
      body({
        scores: {
          fluency_coherence: { score: 6 },
          lexical_resource: { score: 7 },
          grammatical_range: { score: 6 },
          pronunciation: { score: 6 },
        },
      }),
    );
    expect(gradingData()).toMatchObject({ totalScore: 6, levelCode: null, levelLabel: null });
    expect(prisma.student.updateMany).not.toHaveBeenCalled();
  });

  it('AC-09.8 an unbound submission still creates the grading, with no student update', async () => {
    prisma.submission.findUnique.mockResolvedValue({ id: 1, studentId: null, receivedAt: RECEIVED_AT });
    await expect(controller.createGrading(body())).resolves.toBe(GRADING_ROW);
    expect(prisma.student.updateMany).not.toHaveBeenCalled();
  });

  it('AC-09.9 the grading create and the student update run in ONE $transaction', async () => {
    await controller.createGrading(body());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect((prisma.$transaction.mock.calls[0][0] as unknown[]).length).toBe(2);

    prisma.$transaction.mockClear();
    prisma.submission.findUnique.mockResolvedValue({ id: 1, studentId: null, receivedAt: RECEIVED_AT });
    await controller.createGrading(body());
    expect((prisma.$transaction.mock.calls[0][0] as unknown[]).length).toBe(1);
  });

  it('AC-12.10 the stored totalScore equals what the report path recomputes from `scores`', async () => {
    await controller.createGrading(body());
    const stored = gradingData().totalScore;
    // đúng phép tính mà `reports.service.ts` chạy lại: normalize rubric đã ghim + computeTotal.
    const recomputed = computeTotal(normalizeRubric(KID_RUBRIC), KID_SCORES);
    expect(Object.is(stored, recomputed.total)).toBe(true);
    expect(recomputed.max).toBe(25);
  });
});

/**
 * F11 FR-10/FR-12 — hai endpoint mới. Điểm quan trọng nhất là NFR-01: phân quyền luôn ở SERVER
 * và luôn khóa theo NGƯỜI GỬI mà gateway suy ra từ webhook đã xác thực chữ ký. Một chuỗi `#ilm:`
 * gõ tay không bao giờ ghi được lên dữ liệu của người khác.
 */
describe('WorkerApiController — F11 student-ack (FR-10)', () => {
  let prisma: { grading: { findUnique: jest.Mock; updateMany: jest.Mock } };
  let events: { publishStatus: jest.Mock };
  let controller: WorkerApiController;

  beforeEach(() => {
    prisma = { grading: { findUnique: jest.fn(), updateMany: jest.fn() } };
    events = { publishStatus: jest.fn() };
    controller = new WorkerApiController(prisma as never, events as never);
  });

  it('AC-10.2 — 404 when the grading does not exist, and nothing is written', async () => {
    prisma.grading.findUnique.mockResolvedValue(null);
    await expect(controller.studentAck(1, { zaloUserId: 'zalo-1' })).rejects.toThrow(NotFoundException);
    expect(prisma.grading.updateMany).not.toHaveBeenCalled();
  });

  it('AC-10.2/NFR-01 — 403 and NO write when the grading belongs to another Zalo user', async () => {
    prisma.grading.findUnique.mockResolvedValue({ id: 1, studentAckAt: null, submission: { zaloUserId: 'zalo-A' } });
    await expect(controller.studentAck(1, { zaloUserId: 'zalo-B' })).rejects.toThrow(ForbiddenException);
    expect(prisma.grading.updateMany).not.toHaveBeenCalled();
  });

  it('AC-10.3/10.5 — the first tap stamps ONLY studentAckAt', async () => {
    prisma.grading.findUnique.mockResolvedValue({ id: 1, studentAckAt: null, submission: { zaloUserId: 'zalo-1' } });
    prisma.grading.updateMany.mockResolvedValue({ count: 1 });

    const result = await controller.studentAck(1, { zaloUserId: 'zalo-1' });

    expect(result).toEqual({ id: 1, studentAckAt: expect.any(Date), alreadyAcked: false });
    expect(prisma.grading.updateMany).toHaveBeenCalledWith({
      where: { id: 1, studentAckAt: null },
      data: { studentAckAt: expect.any(Date) },
    });
    // đúng MỘT khóa trong `data` — không đụng scores/feedback/level/sentAt/autoSent
    const data = prisma.grading.updateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['studentAckAt']);
  });

  it('AC-10.4/NFR-07 — a second tap does NOT write and keeps the original timestamp', async () => {
    const first = new Date('2026-08-20T10:00:00.000Z');
    prisma.grading.findUnique.mockResolvedValue({ id: 1, studentAckAt: first, submission: { zaloUserId: 'zalo-1' } });

    const result = await controller.studentAck(1, { zaloUserId: 'zalo-1' });

    expect(result).toEqual({ id: 1, studentAckAt: first, alreadyAcked: true });
    expect(prisma.grading.updateMany).not.toHaveBeenCalled();
  });

  it('AC-10.4 — a concurrent tap that loses the conditional update reports alreadyAcked', async () => {
    const winner = new Date('2026-08-20T10:00:00.000Z');
    prisma.grading.findUnique
      .mockResolvedValueOnce({ id: 1, studentAckAt: null, submission: { zaloUserId: 'zalo-1' } })
      .mockResolvedValueOnce({ studentAckAt: winner });
    prisma.grading.updateMany.mockResolvedValue({ count: 0 });

    await expect(controller.studentAck(1, { zaloUserId: 'zalo-1' })).resolves.toEqual({
      id: 1,
      studentAckAt: winner,
      alreadyAcked: true,
    });
  });

  it('AC-10.6 — no status event is published by this endpoint', async () => {
    prisma.grading.findUnique.mockResolvedValue({ id: 1, studentAckAt: null, submission: { zaloUserId: 'zalo-1' } });
    prisma.grading.updateMany.mockResolvedValue({ count: 1 });
    await controller.studentAck(1, { zaloUserId: 'zalo-1' });
    expect(events.publishStatus).not.toHaveBeenCalled();
  });
});

describe('WorkerApiController — F11 select-student (FR-12)', () => {
  let prisma: {
    submission: { findUnique: jest.Mock; updateMany: jest.Mock };
    zaloBinding: { findUnique: jest.Mock };
  };
  let events: { publishStatus: jest.Mock };
  let controller: WorkerApiController;

  const PENDING = { id: 50, zaloUserId: 'zalo-1', studentId: null, status: 'received' };
  const BINDING = { id: 9, zaloUserId: 'zalo-1', studentId: 77, status: 'active' };
  const ROW = {
    id: 50,
    messageId: 'msg-1',
    zaloUserId: 'zalo-1',
    kind: 'audio',
    mediaUrlZalo: 'https://zalo/clip.m4a',
    receivedAt: new Date('2026-08-20T09:00:00.000Z'),
    studentId: 77,
    status: 'received',
  };
  const body = { zaloUserId: 'zalo-1', bindingId: 9 };

  beforeEach(() => {
    prisma = {
      submission: { findUnique: jest.fn(), updateMany: jest.fn() },
      zaloBinding: { findUnique: jest.fn() },
    };
    events = { publishStatus: jest.fn() };
    controller = new WorkerApiController(prisma as never, events as never);
  });

  it('AC-12.2 — 404 when the submission does not exist', async () => {
    prisma.submission.findUnique.mockResolvedValue(null);
    await expect(controller.selectStudent(50, body)).rejects.toThrow(NotFoundException);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  it('AC-12.2/NFR-01 — 403 when the submission belongs to another Zalo user', async () => {
    prisma.submission.findUnique.mockResolvedValue({ ...PENDING, zaloUserId: 'zalo-OTHER' });
    await expect(controller.selectStudent(50, body)).rejects.toThrow(ForbiddenException);
    expect(prisma.zaloBinding.findUnique).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['binding missing', null],
    ['binding of another Zalo user', { ...BINDING, zaloUserId: 'zalo-OTHER' }],
    ['binding still pending', { ...BINDING, status: 'pending' }],
    ['binding without a studentId (AC-12.8)', { ...BINDING, studentId: null }],
  ])('AC-12.2 — 403 and no write when %s', async (_label, binding) => {
    prisma.submission.findUnique.mockResolvedValue(PENDING);
    prisma.zaloBinding.findUnique.mockResolvedValue(binding);
    await expect(controller.selectStudent(50, body)).rejects.toThrow(ForbiddenException);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  it('AC-12.3 — all checks pass ⇒ binds studentId and returns the rebuildable row', async () => {
    prisma.submission.findUnique.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(ROW);
    prisma.zaloBinding.findUnique.mockResolvedValue(BINDING);
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });

    await expect(controller.selectStudent(50, body)).resolves.toEqual(ROW);
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 50, studentId: null, status: 'received' },
      data: { studentId: 77 },
    });
  });

  it('AC-12.4/12.10 — a second, different tap gets 409 already_selected and writes nothing', async () => {
    prisma.submission.findUnique.mockResolvedValue({ ...PENDING, studentId: 77 });
    prisma.zaloBinding.findUnique.mockResolvedValue({ ...BINDING, id: 10, studentId: 88 });
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      controller.selectStudent(50, { zaloUserId: 'zalo-1', bindingId: 10 }),
    ).rejects.toThrow(ConflictException);
  });

  it('AC-12.5 — the endpoint changes no status and publishes no event', async () => {
    prisma.submission.findUnique.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(ROW);
    prisma.zaloBinding.findUnique.mockResolvedValue(BINDING);
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });

    await controller.selectStudent(50, body);

    expect(events.publishStatus).not.toHaveBeenCalled();
    const data = prisma.submission.updateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['studentId']);
  });
});
