import { NotFoundException } from '@nestjs/common';
import { Q_OUTBOUND } from '../contracts';
import { GradingsService } from './gradings.service';

describe('GradingsService', () => {
  let prisma: {
    grading: { update: jest.Mock; findUnique: jest.Mock };
    submission: { update: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let service: GradingsService;

  beforeEach(() => {
    prisma = {
      grading: { update: jest.fn(), findUnique: jest.fn() },
      submission: { update: jest.fn() },
    };
    rabbit = { publish: jest.fn() };
    service = new GradingsService(prisma as never, rabbit as never);
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

    it('falls back to llmFeedback when the teacher never edited it', async () => {
      prisma.grading.findUnique.mockResolvedValue({
        id: 2,
        submissionId: 20,
        llmFeedback: 'Bản gốc AI',
        reviewedFeedback: null,
        submission: { zaloUserId: 'zalo-2' },
      });
      prisma.grading.update.mockResolvedValue({ id: 2 });

      await service.send(2);

      expect(rabbit.publish).toHaveBeenCalledWith(Q_OUTBOUND, expect.objectContaining({ text: 'Bản gốc AI' }));
    });
  });
});
