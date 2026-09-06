import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { CAMBRIDGE_YL_SEED } from '../criteria/templates';
import { SubmissionsService } from './submissions.service';

jest.mock('fs', () => ({ existsSync: jest.fn(), unlinkSync: jest.fn() }));

describe('SubmissionsService', () => {
  let prisma: { submission: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };
  let service: SubmissionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      submission: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SubmissionsService(prisma as never);
  });

  it('filters list by status when given', async () => {
    await service.list({ status: 'awaiting_review' }, 1);
    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ status: 'awaiting_review' }] } }),
    );
  });

  it('không có bộ lọc nào ⇒ where undefined, truy vấn y hệt trước khi có bộ lọc', async () => {
    await service.list({}, 1);
    expect(prisma.submission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('detail throws NotFoundException when submission does not exist', async () => {
    prisma.submission.findUnique.mockResolvedValue(null);
    await expect(service.detail(999)).rejects.toThrow(NotFoundException);
  });

  // F9 AC-13.1 — `totalMax` được dẫn xuất Ở SERVER; dashboard không tự tính lại số học chấm điểm.
  describe('F9 detail().grading.totalMax', () => {
    const KID_RUBRIC = {
      // F10 AC-06.3: dẫn xuất từ seed, KHÔNG chép lại. Giữ nguyên dạng "thô" (chỉ `key`) và
      // nguyên các giá trị cũ, nên assertion `totalMax === 25` bên dưới không đổi.
      schema_version: 2,
      scale: CAMBRIDGE_YL_SEED.rubric.scale,
      aggregation: CAMBRIDGE_YL_SEED.rubric.aggregation,
      dimensions: CAMBRIDGE_YL_SEED.rubric.dimensions.map((d) => ({ key: d.key })),
    };

    it('derives 25 for the Cambridge YL rubric (5 dimensions × scale max 5)', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 1,
        grading: { id: 7, scores: { pronunciation: { score: 4 } }, criteria: { rubric: KID_RUBRIC } },
      });
      const res = (await service.detail(1)) as { grading: { totalMax: number | null } };
      expect(res.grading.totalMax).toBe(25);
    });

    it('is null when there is no grading', async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: 1, grading: null });
      const res = (await service.detail(1)) as { grading: null };
      expect(res.grading).toBeNull();
    });

    it('is null (never 0) when the pinned rubric is unreadable garbage', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 1,
        grading: { id: 7, scores: 'garbage', criteria: { rubric: 'garbage' } },
      });
      const res = (await service.detail(1)) as { grading: { totalMax: number | null } };
      expect(res.grading.totalMax).toBeNull();
    });
  });

  describe('deleteMedia', () => {
    it('throws when submission does not exist', async () => {
      prisma.submission.findUnique.mockResolvedValue(null);
      await expect(service.deleteMedia(1)).rejects.toThrow(NotFoundException);
    });

    it('deletes the file on disk and sets mediaDeletedAt', async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: 1, mediaPath: '2026/07/1/audio.mp3', mediaDeletedAt: null });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      prisma.submission.update.mockResolvedValue({ id: 1, mediaDeletedAt: new Date() });

      await service.deleteMedia(1);

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { mediaDeletedAt: expect.any(Date) },
      });
    });

    it('is a no-op on the filesystem when media was already deleted', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 1,
        mediaPath: '2026/07/1/audio.mp3',
        mediaDeletedAt: new Date(),
      });
      prisma.submission.update.mockResolvedValue({ id: 1 });

      await service.deleteMedia(1);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('does not throw when the file is already missing on disk', async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: 1, mediaPath: '2026/07/1/audio.mp3', mediaDeletedAt: null });
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      prisma.submission.update.mockResolvedValue({ id: 1 });

      await expect(service.deleteMedia(1)).resolves.toBeDefined();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
