import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Q_OUTBOUND } from '../contracts';
import { buildWordReviewRows, findAzureWord, GradingsService, summarizeWordReview } from './gradings.service';

describe('GradingsService', () => {
  let prisma: {
    grading: { update: jest.Mock; findUnique: jest.Mock };
    submission: { update: jest.Mock };
    wordReviewLog: { createMany: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let events: { publishStatus: jest.Mock };
  let redisStore: Record<string, string>;
  let service: GradingsService;

  beforeEach(() => {
    prisma = {
      grading: { update: jest.fn(), findUnique: jest.fn() },
      submission: { update: jest.fn() },
      wordReviewLog: { createMany: jest.fn() },
    };
    rabbit = { publish: jest.fn() };
    events = { publishStatus: jest.fn() };
    // Mặc định: học viên vừa nhắn 1 giờ trước ⇒ trong khung 48h (sự cố 2026-09-29 có test riêng).
    redisStore = {};
    const redis = { client: { get: jest.fn(async (k: string) => (k.startsWith('zalo:lastin:') ? String(Date.now() - 3_600_000) : (redisStore[k] ?? null))) } };
    service = new GradingsService(prisma as never, rabbit as never, events as never, redis as never);
  });

  it('reviewFeedback updates reviewedFeedback and reviewedBy', async () => {
    await service.reviewFeedback(1, 'Sửa lại nhận xét', 'teacher@ilm.edu.vn');
    expect(prisma.grading.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { reviewedFeedback: 'Sửa lại nhận xét', reviewedBy: 'teacher@ilm.edu.vn' },
    });
  });

  describe('send', () => {
    it('throws when grading does not exist', async () => {
      prisma.grading.findUnique.mockResolvedValue(null);
      await expect(service.send(1)).rejects.toThrow(NotFoundException);
    });

    it('publishes the reviewed feedback when present, marks submission sent', async () => {
      prisma.grading.findUnique.mockResolvedValue({
        id: 1,
        submissionId: 10,
        llmFeedback: 'Bản gốc AI',
        reviewedFeedback: 'Bản đã sửa',
        submission: { zaloUserId: 'zalo-1' },
      });
      prisma.submission.update.mockResolvedValue({ id: 10, status: 'sent' });
      prisma.grading.update.mockResolvedValue({ id: 1, sentAt: new Date() });

      await service.send(1);

      expect(rabbit.publish).toHaveBeenCalledWith(Q_OUTBOUND, {
        v: 1,
        zaloUserId: 'zalo-1',
        submissionId: '10',
        text: 'Bản đã sửa',
      });
      expect(prisma.submission.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { status: 'sent' } });
      expect(prisma.grading.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { sentAt: expect.any(Date) } });
    });

    describe('48h Zalo window (incident 2026-09-29)', () => {
      const GRADING = { id: 1, submissionId: 10, llmFeedback: 'x', reviewedFeedback: null, submission: { zaloUserId: 'zalo-1' } };
      const withLastIn = (lastIn: string | null, guard: string | null = null) =>
        new GradingsService(prisma as never, rabbit as never, events as never, {
          client: { get: jest.fn(async (k: string) => (k === 'zalo:lastin:zalo-1' ? lastIn : k === 'config:limits.outbound_48h_guard' ? guard : null)) },
        } as never);

      it.each([
        ['last message 49h ago', String(Date.now() - 49 * 3_600_000)],
        ['no inbound message on record', null],
      ])('refuses with 409 and neither publishes nor marks sent: %s', async (_label, lastIn) => {
        prisma.grading.findUnique.mockResolvedValue(GRADING);
        await expect(withLastIn(lastIn).send(1)).rejects.toThrow(ConflictException);
        expect(rabbit.publish).not.toHaveBeenCalled();
        expect(prisma.submission.update).not.toHaveBeenCalled();
        expect(prisma.grading.update).not.toHaveBeenCalled();
      });

      it('still saves the teacher edits before refusing', async () => {
        prisma.grading.findUnique.mockResolvedValue(GRADING);
        await expect(withLastIn(null).send(1, { reviewedFeedback: 'sửa' } as never)).rejects.toThrow(ConflictException);
        expect(prisma.grading.update).toHaveBeenCalledTimes(1); // bản sửa được lưu, không có sentAt
        expect(prisma.grading.update.mock.calls[0][0].data).not.toHaveProperty('sentAt');
      });

      it('sends when the guard is switched off, exactly like the gateway', async () => {
        prisma.grading.findUnique.mockResolvedValue(GRADING);
        prisma.submission.update.mockResolvedValue({ id: 10, status: 'sent' });
        prisma.grading.update.mockResolvedValue({ id: 1 });
        await withLastIn(null, 'false').send(1);
        expect(rabbit.publish).toHaveBeenCalled();
      });
    });

    it('publishes a submission:events status change after marking sent (F6)', async () => {
      prisma.grading.findUnique.mockResolvedValue({
        id: 1,
        submissionId: 10,
        llmFeedback: 'Bản gốc AI',
        reviewedFeedback: 'Bản đã sửa',
        submission: { zaloUserId: 'zalo-1' },
      });
      prisma.submission.update.mockResolvedValue({ id: 10, status: 'sent' });
      prisma.grading.update.mockResolvedValue({ id: 1, sentAt: new Date() });

      await service.send(1);

      expect(events.publishStatus).toHaveBeenCalledTimes(1);
      expect(events.publishStatus).toHaveBeenCalledWith(10, 'sent');
    });

    it('does NOT publish an event when the grading is missing (no status write)', async () => {
      prisma.grading.findUnique.mockResolvedValue(null);
      await expect(service.send(1)).rejects.toThrow();
      expect(events.publishStatus).not.toHaveBeenCalled();
    });

    it('falls back to llmFeedback when the teacher never edited it', async () => {
      prisma.grading.findUnique.mockResolvedValue({
        id: 2,
        submissionId: 20,
        llmFeedback: 'Bản gốc AI',
        reviewedFeedback: null,
        submission: { zaloUserId: 'zalo-2' },
      });
      prisma.submission.update.mockResolvedValue({ id: 20, status: 'sent' });
      prisma.grading.update.mockResolvedValue({ id: 2 });

      await service.send(2);

      expect(rabbit.publish).toHaveBeenCalledWith(Q_OUTBOUND, expect.objectContaining({ text: 'Bản gốc AI' }));
    });
  });

  /**
   * F11 FR-08 — `send()` là đường gửi CHÍNH (autoSend mặc định false), nên nút phải gắn ở đây.
   * Mọi ca hỏng đều phải hạ cấp về tin text thuần y như trước F11, không bao giờ 500.
   */
  describe('F11 — send() attaches student_reply buttons', () => {
    const rubric = {
      schema_version: 2,
      course_key: 'basic',
      student_reply: {
        show_total: true,
        show_level: true,
        template: '{{feedback}}',
        buttons: [
          { title: 'Em đã xem', action: 'ack' },
          { title: 'Nhờ cô giải thích thêm', action: 'request_advisor' },
        ],
      },
    };

    function mockGrading(criteria: unknown): void {
      prisma.grading.findUnique.mockResolvedValue({
        id: 7,
        submissionId: 10,
        llmFeedback: 'Bản gốc AI',
        reviewedFeedback: null,
        submission: { zaloUserId: 'zalo-1' },
        criteria,
      });
      prisma.submission.update.mockResolvedValue({ id: 10, status: 'sent' });
      prisma.grading.update.mockResolvedValue({ id: 7, sentAt: new Date() });
    }

    it('AC-08.1 — payloads carry the GRADING id and the message keeps every pre-F11 field', async () => {
      mockGrading({ rubric });
      await service.send(7);

      expect(rabbit.publish).toHaveBeenCalledWith(Q_OUTBOUND, {
        v: 1,
        zaloUserId: 'zalo-1',
        submissionId: '10',
        text: 'Bản gốc AI',
        buttons: [
          { title: 'Em đã xem', action: 'ack', payload: '#ilm:ack:7' },
          { title: 'Nhờ cô giải thích thêm', action: 'request_advisor', payload: '#ilm:request_advisor:7' },
        ],
      });
    });

    it('AC-08.3 — status/sentAt/events still happen in the same order', async () => {
      mockGrading({ rubric });
      await service.send(7);

      expect(prisma.submission.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { status: 'sent' } });
      expect(events.publishStatus).toHaveBeenCalledWith(10, 'sent');
      expect(prisma.grading.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { sentAt: expect.any(Date) } });
      expect(rabbit.publish.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.submission.update.mock.invocationCallOrder[0],
      );
    });

    it.each([
      ['criteria row missing', null],
      ['rubric unparseable', { rubric: 'not-a-rubric' }],
      ['student_reply absent', { rubric: { schema_version: 2 } }],
      ['buttons empty', { rubric: { schema_version: 2, student_reply: { buttons: [] } } }],
    ])('AC-08.4 — %s ⇒ plain-text message with NO buttons key, no 500', async (_label, criteria) => {
      mockGrading(criteria);
      await expect(service.send(7)).resolves.toBeDefined();

      const published = rabbit.publish.mock.calls[0][1] as Record<string, unknown>;
      expect(published).not.toHaveProperty('buttons');
      expect(published).toEqual({ v: 1, zaloUserId: 'zalo-1', submissionId: '10', text: 'Bản gốc AI' });
    });

    it('NFR-04 — send() publishes exactly once (no extra outbound introduced by F11)', async () => {
      mockGrading({ rubric });
      await service.send(7);
      expect(rabbit.publish).toHaveBeenCalledTimes(1);
    });
  });

  /** ILM-Clone D153: giáo viên sửa mọi trường AI; Gửi = lưu bản đang sửa rồi gửi đúng bản đó. */
  describe('D153 — teacher edits', () => {
    const rubric = {
      schema_version: 2,
      scale: { min: 0, max: 5, step: 1 },
      output_fields: ['comment', 'fix'],
      dimensions: [
        { key: 'pronunciation', label: 'Pronunciation' },
        { key: 'fluency', label: 'Fluency' },
      ],
      student_reply: { template: '{{feedback}}\n\n{{criteria}}' },
    };

    it('review() stores a sanitised copy and never touches the AI scores', async () => {
      prisma.grading.findUnique.mockResolvedValue({ id: 3, sentAt: null, criteria: { rubric } });
      prisma.grading.update.mockResolvedValue({ id: 3 });

      await service.review(
        3,
        {
          reviewedFeedback: 'Mở đầu của cô',
          reviewedScores: {
            pronunciation: {
              score: 4,
              comment: 'Rõ hơn',
              fix: 'Luyện /θ/',
              injected: 'x',
              mispronounced_words: [
                {
                  word: 'think', heard_as: '/t/', suggestion: 'Đặt lưỡi giữa răng', approx_position_sec: 43, start_sec: 43.21, end_sec: 43.62,
                  source: 'gemini', issue: '/θ/ thành /t/', needs_review: true, gemini_confirmed: false, junk: 'x',
                },
                { word: '   ' },
              ],
            },
            invented_dimension: { score: 1, comment: 'không có trong rubric' },
          },
        },
        'gv@ilm.edu.vn',
      );

      const data = prisma.grading.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ reviewedBy: 'gv@ilm.edu.vn', reviewedFeedback: 'Mở đầu của cô' });
      expect(data.reviewedAt).toBeInstanceOf(Date);
      expect(data.reviewedScores).toEqual({
        pronunciation: {
          score: 4,
          comment: 'Rõ hơn',
          fix: 'Luyện /θ/',
          mispronounced_words: [
            {
              word: 'think', heard_as: '/t/', suggestion: 'Đặt lưỡi giữa răng', approx_position_sec: 43, start_sec: 43.21, end_sec: 43.62,
              source: 'gemini', issue: '/θ/ thành /t/', needs_review: true, gemini_confirmed: false,
            },
          ],
        },
      });
      expect(data).not.toHaveProperty('scores');
    });

    it('review() rejects a score outside the rubric scale and writes nothing', async () => {
      prisma.grading.findUnique.mockResolvedValue({ id: 3, sentAt: null, criteria: { rubric } });
      await expect(
        service.review(3, { reviewedScores: { pronunciation: { score: 7, comment: 'x' } } }, 'gv'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.grading.update).not.toHaveBeenCalled();
    });

    it('review() refuses to edit a grading that was already sent', async () => {
      prisma.grading.findUnique.mockResolvedValue({ id: 3, sentAt: new Date(), criteria: { rubric } });
      await expect(service.review(3, { reviewedFeedback: 'muộn' }, 'gv')).rejects.toThrow(BadRequestException);
      expect(prisma.grading.update).not.toHaveBeenCalled();
    });

    it('send() with edits saves them FIRST and the message is built from the edited version, not the AI one', async () => {
      prisma.grading.findUnique
        .mockResolvedValueOnce({ id: 3, sentAt: null, criteria: { rubric } })
        .mockResolvedValueOnce({
          id: 3,
          submissionId: 30,
          llmFeedback: 'AI mở đầu',
          reviewedFeedback: 'Cô mở đầu',
          scores: { pronunciation: { score: 1, comment: 'AI nhận xét', fix: 'AI hướng sửa' } },
          reviewedScores: { pronunciation: { score: 4, comment: 'Cô nhận xét', fix: 'Cô hướng sửa' } },
          submission: { zaloUserId: 'zalo-3' },
          criteria: { rubric },
        });
      prisma.grading.update.mockResolvedValue({ id: 3 });
      prisma.submission.update.mockResolvedValue({ id: 30, status: 'sent' });

      await service.send(
        3,
        { reviewedFeedback: 'Cô mở đầu', reviewedScores: { pronunciation: { score: 4, comment: 'Cô nhận xét', fix: 'Cô hướng sửa' } } },
        'gv@ilm.edu.vn',
      );

      expect(prisma.grading.update.mock.calls[0][0].data.reviewedScores).toEqual({
        pronunciation: { score: 4, comment: 'Cô nhận xét', fix: 'Cô hướng sửa' },
      });
      const text = (rabbit.publish.mock.calls[0][1] as { text: string }).text;
      expect(text).toContain('Cô mở đầu');
      expect(text).toContain('Nhận xét: Cô nhận xét');
      expect(text).toContain('→ Hướng sửa: Cô hướng sửa');
      expect(text).not.toContain('AI');
    });
  });

  describe('ILM 09-15 — AI vs teacher log for mispronounced words', () => {
    const assessment = {
      words: [
        { word: 'work', start_sec: 12.0, end_sec: 12.4, accuracy: 91, error_type: 'None' },
        { word: 'work', start_sec: 27.1, end_sec: 27.61, accuracy: 48, error_type: 'Mispronunciation' },
        { word: 'think', start_sec: 40.2, end_sec: 40.5, accuracy: 72, error_type: 'None' },
      ],
    };
    const ai = {
      pronunciation: {
        score: 2,
        comment: 'AI',
        mispronounced_words: [
          { word: 'musicians', start_sec: 6.85, end_sec: 8.03, source: 'azure', heard_as: '/s/', gemini_confirmed: true },
          { word: 'work', start_sec: 27.1, end_sec: 27.61, source: 'azure', needs_review: true, gemini_confirmed: false },
          { word: 'genres', start_sec: 120, end_sec: 120.5, source: 'gemini', gemini_confirmed: true },
        ],
      },
    };
    // Giáo viên: sửa gợi ý "musicians" (vẫn là giữ), "Gắn sai" từ "work", thêm "think" ở chỗ dừng audio 40,9 s.
    const final = {
      pronunciation: {
        score: 3,
        comment: 'Cô',
        mispronounced_words: [
          { word: 'musicians', start_sec: 6.85, end_sec: 8.03, source: 'azure', suggestion: 'Cô sửa gợi ý' },
          { word: 'genres', start_sec: 120, end_sec: 120.5, source: 'gemini' },
          { word: 'think', start_sec: 40.9, approx_position_sec: 40.9, source: 'teacher', suggestion: 'Đặt lưỡi giữa răng' },
        ],
      },
    };

    it('findAzureWord picks the nearest occurrence within tolerance, ignoring punctuation and case', () => {
      expect(findAzureWord(assessment, 'Work.', 27.1)).toEqual({ accuracy: 48, errorType: 'Mispronunciation' });
      expect(findAzureWord(assessment, 'work', 50)).toBeNull();
      expect(findAzureWord(assessment, 'think', 40.9, 1.5)).toEqual({ accuracy: 72, errorType: 'None' });
      expect(findAzureWord(null, 'work', 27.1)).toBeNull();
    });

    it('buildWordReviewRows: kept / removed ("Gắn sai") / added, editing a suggestion is still "kept"', () => {
      const rows = buildWordReviewRows(ai, final, assessment);
      expect(rows.map((r) => [r.word, r.outcome, r.source])).toEqual([
        ['musicians', 'kept', 'azure'],
        ['work', 'removed', 'azure'],
        ['genres', 'kept', 'gemini'],
        ['think', 'added', 'teacher'],
      ]);
      expect(rows[1]).toMatchObject({ startSec: 27.1, endSec: 27.61, needsReview: true, geminiConfirmed: false, azureAccuracy: 48 });
      expect(rows[3]).toMatchObject({ startSec: 40.9, azureAccuracy: 72, azureErrorType: 'None' });
    });

    it('buildWordReviewRows: no teacher edits ⇒ every AI word is "kept"', () => {
      expect(buildWordReviewRows(ai, ai, assessment).every((r) => r.outcome === 'kept')).toBe(true);
    });

    it("summarizeWordReview matches ILM's example: teacher 40 words, AI 27, 20 wrong flags", () => {
      const s = summarizeWordReview(30, 3, [
        { outcome: 'kept', source: 'azure', count: 7 },
        { outcome: 'removed', source: 'azure', count: 20 },
        { outcome: 'added', source: 'teacher', count: 33 },
      ]);
      expect([s.kept + s.removed, s.kept + s.added]).toEqual([27, 40]);
      expect(s.aiPrecision).toBeCloseTo(7 / 27);
      expect(s.aiCoverage).toBeCloseTo(7 / 40);
      expect(s.bySource).toEqual([{ source: 'azure', kept: 7, removed: 20, aiPrecision: 7 / 27 }]);
      expect(summarizeWordReview(30, 0, [])).toMatchObject({ aiPrecision: null, aiCoverage: null, bySource: [] });
    });

    const sendable = (sentAt: Date | null) => ({
      id: 5,
      submissionId: 15,
      sentAt,
      llmFeedback: 'AI',
      reviewedFeedback: 'Cô',
      scores: ai,
      reviewedScores: final,
      assessment,
      submission: { zaloUserId: 'zalo-5' },
      criteria: { rubric: { schema_version: 2, scale: { min: 0, max: 5, step: 1 }, dimensions: [{ key: 'pronunciation', label: 'P' }] }, course: { key: 'IELTS' } },
    });

    it('send() logs the comparison once, on the first send, with course and teacher', async () => {
      prisma.grading.findUnique.mockResolvedValue(sendable(null));
      prisma.submission.update.mockResolvedValue({ id: 15, status: 'sent' });
      await service.send(5, undefined, 'gv@ilm.edu.vn');

      const data = prisma.wordReviewLog.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(4);
      expect(data[1]).toMatchObject({ gradingId: 5, submissionId: 15, courseCode: 'IELTS', reviewedBy: 'gv@ilm.edu.vn', word: 'work', outcome: 'removed' });
      // "Gắn sai" chỉ bỏ khỏi tin học viên
      expect((rabbit.publish.mock.calls[0][1] as { text: string }).text).not.toContain('work');

      prisma.wordReviewLog.createMany.mockClear();
      prisma.grading.findUnique.mockResolvedValue(sendable(new Date()));
      await service.send(5, undefined, 'gv@ilm.edu.vn');
      expect(prisma.wordReviewLog.createMany).not.toHaveBeenCalled();
    });

    it('send() still sends when writing the log fails', async () => {
      prisma.grading.findUnique.mockResolvedValue(sendable(null));
      prisma.submission.update.mockResolvedValue({ id: 15, status: 'sent' });
      prisma.wordReviewLog.createMany.mockRejectedValue(new Error('db down'));
      await service.send(5, undefined, 'gv');
      expect(rabbit.publish).toHaveBeenCalled();
      expect(prisma.grading.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { sentAt: expect.any(Date) } });
    });
  });
});
