import { existsSync, createReadStream } from 'fs';
import { resolve, sep } from 'path';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PrismaService } from '../prisma.service';

const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? '/data/media');

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

    const filePath = resolve(MEDIA_ROOT, submission.mediaPath);
    if (!filePath.startsWith(MEDIA_ROOT + sep) && filePath !== MEDIA_ROOT) {
      throw new ForbiddenException('invalid media path');
    }
    if (!existsSync(filePath)) throw new NotFoundException('media file missing on disk');

    return new StreamableFile(createReadStream(filePath));
  }
}
