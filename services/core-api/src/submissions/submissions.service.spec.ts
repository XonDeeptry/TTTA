import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
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
    await service.list('awaiting_review', 1);
    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'awaiting_review' } }),
    );
  });

  it('detail throws NotFoundException when submission does not exist', async () => {
    prisma.submission.findUnique.mockResolvedValue(null);
    await expect(service.detail(999)).rejects.toThrow(NotFoundException);
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
