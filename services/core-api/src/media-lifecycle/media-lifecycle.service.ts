import { existsSync, promises as fsp, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MEDIA_ROOT, resolveMediaPath } from '../lib/media-path';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

/**
 * Vòng đời media (mục 3.8): sau khi tách audio, video gốc bị xóa sau 7 ngày; audio giữ 90 ngày
 * (cấu hình qua limits.media_retention_days). Cron chạy 03:15 mỗi đêm, mỗi pha bọc try/catch
 * riêng để một pha lỗi không kéo đổ các pha còn lại. Best-effort/idempotent: mọi thao tác xóa
 * chỉ chạm đường dẫn dưới MEDIA_ROOT qua resolveMediaPath(), chịu được file đã mất, và chỉ
 * đụng bảng submissions (cột video_deleted_at/media_deleted_at).
 */
@Injectable()
export class MediaLifecycleService {
  private readonly logger = new Logger(MediaLifecycleService.name);

  static readonly VIDEO_RETENTION_DAYS = 7;
  static readonly DEFAULT_MEDIA_RETENTION_DAYS = 90;
  static readonly DISK_ALERT_THRESHOLD_PCT = 80;
  static readonly DISK_ALERT_KEY = 'alert:media_disk_high';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Cron('0 15 3 * * *')
  async runNightly(): Promise<void> {
    try {
      await this.reapSourceVideos();
    } catch (err) {
      this.logger.error(`reapSourceVideos lỗi: ${String(err)}`);
    }
    try {
      await this.deleteExpiredMedia();
    } catch (err) {
      this.logger.error(`deleteExpiredMedia lỗi: ${String(err)}`);
    }
    try {
      await this.checkDiskUsage();
    } catch (err) {
      this.logger.error(`checkDiskUsage lỗi: ${String(err)}`);
    }
  }

  /** Xóa video gốc >7 ngày sau khi đã tách audio — KHÔNG BAO GIỜ đụng audio.mp3 anh em. */
  async reapSourceVideos(): Promise<void> {
    const cutoff = new Date(Date.now() - MediaLifecycleService.VIDEO_RETENTION_DAYS * 86_400_000);
    const rows = await this.prisma.submission.findMany({
      where: {
        kind: 'video',
        mediaPath: { not: null },
        videoDeletedAt: null,
        audioExtractedAt: { lte: cutoff },
      },
    });

    for (const row of rows) {
      try {
        const filePath = resolveMediaPath(row.mediaPath as string);
        if (existsSync(filePath)) unlinkSync(filePath);
        await this.prisma.submission.update({ where: { id: row.id }, data: { videoDeletedAt: new Date() } });
      } catch (err) {
        // Một hàng lỗi không được làm hỏng cả mẻ (mục 3.8): log và tiếp tục.
        this.logger.warn(`reapSourceVideos submission ${row.id} lỗi: ${String(err)}`);
      }
    }
    this.logger.log(`reapSourceVideos: quét ${rows.length} video gốc quá hạn`);
  }

  /** Xóa cả original.{ext} lẫn audio.mp3 khi submission quá hạn giữ (media_retention_days). */
  async deleteExpiredMedia(): Promise<void> {
    const retentionDays = await this.resolveRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const rows = await this.prisma.submission.findMany({
      where: {
        mediaPath: { not: null },
        mediaDeletedAt: null,
        receivedAt: { lte: cutoff },
      },
    });

    for (const row of rows) {
      try {
        const mediaPath = row.mediaPath as string;
        const dir = dirname(mediaPath);
        const original = resolveMediaPath(mediaPath);
        if (existsSync(original)) unlinkSync(original);
        const audio = resolveMediaPath(join(dir, 'audio.mp3'));
        if (existsSync(audio)) unlinkSync(audio);
        // Không xóa thư mục — chỉ đánh dấu media_deleted_at.
        await this.prisma.submission.update({ where: { id: row.id }, data: { mediaDeletedAt: new Date() } });
      } catch (err) {
        this.logger.warn(`deleteExpiredMedia submission ${row.id} lỗi: ${String(err)}`);
      }
    }
    this.logger.log(`deleteExpiredMedia: xóa ${rows.length} submission quá hạn (giữ ${retentionDays} ngày)`);
  }

  private async resolveRetentionDays(): Promise<number> {
    const raw = await this.redis.client.get('config:limits.media_retention_days');
    const parsed = parseInt(raw ?? '', 10);
    if (!raw || Number.isNaN(parsed) || parsed <= 0) {
      return MediaLifecycleService.DEFAULT_MEDIA_RETENTION_DAYS;
    }
    return parsed;
  }

  /** Cảnh báo đĩa đầy (>80%) cho dashboard; tự lành (xóa alert) khi xuống ngưỡng. */
  async checkDiskUsage(): Promise<void> {
    // Dev box không có /data/media thật — statfs có thể không tồn tại hoặc ném lỗi.
    const statfs = fsp.statfs?.bind(fsp);
    if (!statfs) {
      this.logger.warn('checkDiskUsage: fs.promises.statfs không khả dụng — bỏ qua');
      return;
    }
    let usedPct: number;
    try {
      const stats = await statfs(MEDIA_ROOT);
      usedPct = ((stats.blocks - stats.bfree) / stats.blocks) * 100;
    } catch (err) {
      this.logger.warn(`checkDiskUsage: statfs(${MEDIA_ROOT}) lỗi — bỏ qua: ${String(err)}`);
      return;
    }

    if (usedPct > MediaLifecycleService.DISK_ALERT_THRESHOLD_PCT) {
      const pct = Math.round(usedPct * 10) / 10;
      await this.redis.client.set(
        MediaLifecycleService.DISK_ALERT_KEY,
        JSON.stringify({ pct, at: new Date().toISOString() }),
      );
      this.logger.warn(`checkDiskUsage: đĩa media dùng ${pct}% (>80%) — bật alert`);
    } else {
      await this.redis.client.del(MediaLifecycleService.DISK_ALERT_KEY);
    }
  }
}
