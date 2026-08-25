import { NotFoundException } from '@nestjs/common';
import { Q_OUTBOUND } from '../contracts';
import { GradingsService } from './gradings.service';

describe('GradingsService', () => {
  let prisma: {
    grading: { update: jest.Mock; findUnique: jest.Mock };
    submission: { update: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let events: { publishStatus: jest.Mock };
  let service: GradingsService;

  beforeEach(() => {
    prisma = {
      grading: { update: jest.fn(), findUnique: jest.fn() },
      submission: { update: jest.fn() },
    };
    rabbit = { publish: jest.fn() };
    events = { publishStatus: jest.fn() };
    service = new GradingsService(prisma as never, rabbit as never, events as never);
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
});
