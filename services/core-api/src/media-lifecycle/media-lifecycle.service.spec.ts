import * as fs from 'fs';
import { MediaLifecycleService } from './media-lifecycle.service';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  promises: { statfs: jest.fn() },
}));

describe('MediaLifecycleService', () => {
  let prisma: { submission: { findMany: jest.Mock; update: jest.Mock } };
  let redis: { client: { get: jest.Mock; set: jest.Mock; del: jest.Mock } };
  let service: MediaLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      submission: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    redis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
    };
    service = new MediaLifecycleService(prisma as never, redis as never);
    // statfs mặc định có tồn tại lại (test có thể ghi đè)
    (fs.promises as { statfs: unknown }).statfs = jest.fn();
  });

  describe('reapSourceVideos', () => {
    it('queries only video rows with audio extracted, not yet video-deleted, older than 7 days', async () => {
      await service.reapSourceVideos();
      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where.kind).toBe('video');
      expect(where.mediaPath).toEqual({ not: null });
      expect(where.videoDeletedAt).toBeNull();
      expect(where.audioExtractedAt.lte).toBeInstanceOf(Date);
      const ageMs = Date.now() - (where.audioExtractedAt.lte as Date).getTime();
      expect(ageMs).toBeGreaterThanOrEqual(7 * 86_400_000 - 5_000);
      expect(ageMs).toBeLessThanOrEqual(7 * 86_400_000 + 5_000);
    });

    it('unlinks the original video and stamps videoDeletedAt', async () => {
      prisma.submission.findMany.mockResolvedValue([{ id: 1, mediaPath: '2026/07/1/original.mp4' }]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await service.reapSourceVideos();

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('original.mp4'));
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { videoDeletedAt: expect.any(Date) },
      });
    });

    it('never touches the sibling audio.mp3 when reaping a video', async () => {
      prisma.submission.findMany.mockResolvedValue([{ id: 1, mediaPath: '2026/07/1/original.mp4' }]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await service.reapSourceVideos();

      const unlinked = (fs.unlinkSync as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(unlinked.some((p) => p.endsWith('audio.mp3'))).toBe(false);
    });

    it('still stamps videoDeletedAt when the file is already missing on disk', async () => {
      prisma.submission.findMany.mockResolvedValue([{ id: 1, mediaPath: '2026/07/1/original.mp4' }]);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.reapSourceVideos();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { videoDeletedAt: expect.any(Date) },
      });
    });

    it('isolates a failing row so the rest of the batch still runs', async () => {
      prisma.submission.findMany.mockResolvedValue([
        { id: 1, mediaPath: '2026/07/1/original.mp4' },
        { id: 2, mediaPath: '2026/07/2/original.mp4' },
      ]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.unlinkSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('EACCES');
      });

      await service.reapSourceVideos();

      // Hàng 1 lỗi khi unlink -> không update; hàng 2 vẫn xử lý.
      expect(prisma.submission.update).toHaveBeenCalledTimes(1);
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { videoDeletedAt: expect.any(Date) },
      });
    });
  });

  describe('deleteExpiredMedia', () => {
    it('uses the default retention when Redis has no value', async () => {
      await service.deleteExpiredMedia();
      const where = prisma.submission.findMany.mock.calls[0][0].where;
      const ageMs = Date.now() - (where.receivedAt.lte as Date).getTime();
      expect(ageMs).toBeGreaterThanOrEqual(90 * 86_400_000 - 5_000);
      expect(ageMs).toBeLessThanOrEqual(90 * 86_400_000 + 5_000);
    });

    it('uses the configured retention days from Redis', async () => {
      redis.client.get.mockResolvedValue('30');
      await service.deleteExpiredMedia();
      const where = prisma.submission.findMany.mock.calls[0][0].where;
      const ageMs = Date.now() - (where.receivedAt.lte as Date).getTime();
      expect(ageMs).toBeGreaterThanOrEqual(30 * 86_400_000 - 5_000);
      expect(ageMs).toBeLessThanOrEqual(30 * 86_400_000 + 5_000);
    });

    it('falls back to default when the Redis value is invalid (NaN / <=0)', async () => {
      for (const bad of ['abc', '0', '-5', '']) {
        prisma.submission.findMany.mockClear();
        redis.client.get.mockResolvedValue(bad);
        await service.deleteExpiredMedia();
        const where = prisma.submission.findMany.mock.calls[0][0].where;
        const ageMs = Date.now() - (where.receivedAt.lte as Date).getTime();
        expect(ageMs).toBeGreaterThanOrEqual(90 * 86_400_000 - 5_000);
      }
    });

    it('queries rows with media not yet deleted, older than retention', async () => {
      await service.deleteExpiredMedia();
      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where.mediaPath).toEqual({ not: null });
      expect(where.mediaDeletedAt).toBeNull();
    });

    it('deletes both original and audio.mp3 and stamps mediaDeletedAt', async () => {
      prisma.submission.findMany.mockResolvedValue([{ id: 7, mediaPath: '2026/07/7/original.m4a' }]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await service.deleteExpiredMedia();

      const unlinked = (fs.unlinkSync as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(unlinked.some((p) => p.endsWith('original.m4a'))).toBe(true);
      expect(unlinked.some((p) => p.endsWith('audio.mp3'))).toBe(true);
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { mediaDeletedAt: expect.any(Date) },
      });
    });

    it('tolerates already-missing files and still stamps mediaDeletedAt', async () => {
      prisma.submission.findMany.mockResolvedValue([{ id: 7, mediaPath: '2026/07/7/original.m4a' }]);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.deleteExpiredMedia();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { mediaDeletedAt: expect.any(Date) },
      });
    });

    it('isolates a failing row so the rest of the batch still runs', async () => {
      prisma.submission.findMany.mockResolvedValue([
        { id: 7, mediaPath: '2026/07/7/original.m4a' },
        { id: 8, mediaPath: '2026/07/8/original.m4a' },
      ]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.unlinkSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('EBUSY');
      });

      await service.deleteExpiredMedia();

      expect(prisma.submission.update).toHaveBeenCalledTimes(1);
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 8 },
        data: { mediaDeletedAt: expect.any(Date) },
      });
    });
  });

  describe('checkDiskUsage', () => {
    it('sets the disk alert when usage strictly exceeds 80%', async () => {
      (fs.promises.statfs as jest.Mock).mockResolvedValue({ blocks: 100, bfree: 10 });

      await service.checkDiskUsage();

      expect(redis.client.set).toHaveBeenCalledTimes(1);
      const [key, value] = redis.client.set.mock.calls[0];
      expect(key).toBe('alert:media_disk_high');
      const payload = JSON.parse(value as string);
      expect(payload.pct).toBe(90);
      expect(typeof payload.at).toBe('string');
      expect(redis.client.del).not.toHaveBeenCalled();
    });

    it('clears the alert (self-heal) when usage is at or below 80%', async () => {
      (fs.promises.statfs as jest.Mock).mockResolvedValue({ blocks: 100, bfree: 50 });

      await service.checkDiskUsage();

      expect(redis.client.del).toHaveBeenCalledWith('alert:media_disk_high');
      expect(redis.client.set).not.toHaveBeenCalled();
    });

    it('treats exactly 80% as not-alerting (threshold is strictly greater than)', async () => {
      (fs.promises.statfs as jest.Mock).mockResolvedValue({ blocks: 100, bfree: 20 });

      await service.checkDiskUsage();

      expect(redis.client.set).not.toHaveBeenCalled();
      expect(redis.client.del).toHaveBeenCalledWith('alert:media_disk_high');
    });

    it('rounds the reported percentage to 1 decimal place', async () => {
      (fs.promises.statfs as jest.Mock).mockResolvedValue({ blocks: 1000, bfree: 87 });

      await service.checkDiskUsage();

      const payload = JSON.parse(redis.client.set.mock.calls[0][1] as string);
      expect(payload.pct).toBe(91.3);
    });

    it('does nothing (no set/del/throw) when statfs is unavailable', async () => {
      (fs.promises as { statfs: unknown }).statfs = undefined;

      await expect(service.checkDiskUsage()).resolves.toBeUndefined();
      expect(redis.client.set).not.toHaveBeenCalled();
      expect(redis.client.del).not.toHaveBeenCalled();
    });

    it('does nothing (no set/del/throw) when statfs throws', async () => {
      (fs.promises.statfs as jest.Mock).mockRejectedValue(new Error('ENOSYS'));

      await expect(service.checkDiskUsage()).resolves.toBeUndefined();
      expect(redis.client.set).not.toHaveBeenCalled();
      expect(redis.client.del).not.toHaveBeenCalled();
    });
  });

  describe('runNightly', () => {
    it('runs all three phases even when the first one throws', async () => {
      const reap = jest.spyOn(service, 'reapSourceVideos').mockRejectedValue(new Error('boom'));
      const del = jest.spyOn(service, 'deleteExpiredMedia').mockResolvedValue();
      const disk = jest.spyOn(service, 'checkDiskUsage').mockResolvedValue();

      await expect(service.runNightly()).resolves.toBeUndefined();

      expect(reap).toHaveBeenCalledTimes(1);
      expect(del).toHaveBeenCalledTimes(1);
      expect(disk).toHaveBeenCalledTimes(1);
    });
  });
});
