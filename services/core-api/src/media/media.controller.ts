import { existsSync, createReadStream, statSync } from 'fs';
import { extname } from 'path';
import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { resolveMediaPath } from '../lib/media-path';
import { PrismaService } from '../prisma.service';

/** Đủ dùng cho các định dạng pipeline sinh ra (`audio.mp3`) và Zalo gửi tới. */
const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.3gp': 'video/3gpp',
  '.amr': 'audio/amr',
  '.aac': 'audio/aac',
};

interface ByteRange {
  start: number;
  end: number;
}

/**
 * `Range: bytes=<start>-<end>` — chỉ hỗ trợ MỘT khoảng, đủ cho mọi trình duyệt phát media.
 * Trả `null` khi không có header hoặc cú pháp lạ (⇒ gửi nguyên file, đúng như trước).
 * Trả `'unsatisfiable'` khi cú pháp đúng nhưng khoảng nằm ngoài file (⇒ 416).
 */
export function parseRange(header: string | undefined, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  let start: number;
  let end: number;
  if (rawStart === '') {
    // `bytes=-500` = 500 byte CUỐI file, không phải từ 0 đến 500.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'unsatisfiable';
  return { start, end };
}

/**
 * Stream file media có auth (mục 3.8) — cả admin lẫn staff nghe được, chỉ admin mới xóa.
 *
 * HỖ TRỢ HTTP RANGE (bổ sung 2026-09-06). Trước đó endpoint chỉ trả `StreamableFile` của cả
 * file, không có `Accept-Ranges` và không xử lý header `Range`. Hệ quả không hiển nhiên: trình
 * duyệt **không tua được** — thanh trượt kéo không nhảy, và nút "nghe lại từ phát âm sai" trên
 * màn Kiểm duyệt đặt `audio.currentTime` xong bị trình duyệt bỏ qua. Không có lỗi, không có log;
 * người dùng chỉ thấy bấm mà không có gì xảy ra.
 */
@Controller('media')
@UseGuards(SessionAuthGuard)
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':submissionId')
  async stream(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission?.mediaPath || submission.mediaDeletedAt) {
      throw new NotFoundException('no media available for this submission');
    }

    const filePath = resolveMediaPath(submission.mediaPath);
    if (!existsSync(filePath)) throw new NotFoundException('media file missing on disk');

    const size = statSync(filePath).size;
    const contentType = MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    // Phải có mặt kể cả ở phản hồi 200 — đó là cách trình duyệt BIẾT rằng nó được phép tua.
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);

    const range = parseRange(rangeHeader, size);

    if (range === 'unsatisfiable') {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${size}`);
      return new StreamableFile(Buffer.alloc(0));
    }

    if (range === null) {
      res.setHeader('Content-Length', String(size));
      return new StreamableFile(createReadStream(filePath));
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    return new StreamableFile(createReadStream(filePath, { start: range.start, end: range.end }));
  }
}
