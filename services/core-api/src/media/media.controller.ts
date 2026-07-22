import { existsSync, createReadStream } from 'fs';
import { Controller, Get, NotFoundException, Param, ParseIntPipe, StreamableFile, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { resolveMediaPath } from '../lib/media-path';
import { PrismaService } from '../prisma.service';

/**
 * Stream file media có auth (mục 3.8) — cả admin lẫn staff nghe được, chỉ admin mới xóa
 * (nút xóa là màn hình M4). Vòng đời xóa file (video 7 ngày, audio 90 ngày) là M3.6, chưa
 * có gì để xóa cho đến khi grading-worker (M3) thật sự ghi file.
 */
@Controller('media')
@UseGuards(SessionAuthGuard)
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':submissionId')
  async stream(@Param('submissionId', ParseIntPipe) submissionId: number): Promise<StreamableFile> {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission?.mediaPath || submission.mediaDeletedAt) {
      throw new NotFoundException('no media available for this submission');
    }

    const filePath = resolveMediaPath(submission.mediaPath);
    if (!existsSync(filePath)) throw new NotFoundException('media file missing on disk');

    return new StreamableFile(createReadStream(filePath));
  }
}
