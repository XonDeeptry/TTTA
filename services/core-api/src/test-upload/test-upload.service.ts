import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Q_SUBMISSIONS, SubmissionMessage } from '../contracts';
import { MEDIA_ROOT } from '../lib/media-path';
import { PrismaService } from '../prisma.service';
import { RabbitService } from '../rabbit.service';

const DEFAULT_EXT: Record<'audio' | 'video', string> = { audio: 'm4a', video: 'mp4' };
const TEST_UPLOAD_DIR = 'test-uploads';

export interface TestUploadResult {
  messageId: string;
  zaloUserId: string;
  studentId: number;
  kind: 'audio' | 'video';
}

/**
 * Admin test-upload (dashboard "Test Upload" page): chấm thử pipeline LLM bằng file
 * audio/video ghi sẵn, không cần đợi tin nhắn Zalo thật. Ghi file thẳng vào volume
 * `media` dùng chung với grading-worker rồi publish một SubmissionMessage bình thường
 * (kèm mediaPath + testMode) vào Q_SUBMISSIONS — pipeline chấm điểm chạy y hệt luồng
 * thật, chỉ khác bước tải Zalo bị bỏ qua và autoSend bị ép tắt.
 */
@Injectable()
export class TestUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitService,
  ) {}

  async upload(studentId: number, file: Express.Multer.File): Promise<TestUploadResult> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('student not found');
    if (!student.courseId) {
      throw new BadRequestException('student has no course assigned — no rubric to grade against');
    }

    const kind = this.detectKind(file.mimetype);
    if (!kind) throw new BadRequestException('file must be audio/* or video/*');

    // Binding giả, cố định theo studentId — cho pipeline một "active binding" duy nhất mà
    // không cần đi qua luồng ChoGan thật. Tái dùng nếu đã tạo từ lần test trước.
    const zaloUserId = `test:${studentId}`;
    const existingBinding = await this.prisma.zaloBinding.findFirst({ where: { zaloUserId, studentId } });
    if (!existingBinding) {
      await this.prisma.zaloBinding.create({
        data: { zaloUserId, studentId, displayName: student.fullName, phoneEntered: student.phone, status: 'active' },
      });
    }

    const messageId = `test-${randomUUID()}`;
    const ext = this.detectExtension(file.originalname, kind);
    const relativePath = `${TEST_UPLOAD_DIR}/${messageId}.${ext}`;
    await fs.mkdir(join(MEDIA_ROOT, TEST_UPLOAD_DIR), { recursive: true });
    await fs.writeFile(join(MEDIA_ROOT, relativePath), file.buffer);

    const message: SubmissionMessage = {
      v: 1,
      messageId,
      eventName: 'admin_test_upload',
      kind,
      zaloUserId,
      mediaPath: relativePath,
      testMode: true,
      receivedAt: new Date().toISOString(),
    };
    this.rabbit.publish(Q_SUBMISSIONS, message);

    return { messageId, zaloUserId, studentId, kind };
  }

  private detectKind(mimetype: string): 'audio' | 'video' | null {
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    return null;
  }

  private detectExtension(originalname: string, kind: 'audio' | 'video'): string {
    const match = /\.([a-zA-Z0-9]+)$/.exec(originalname);
    return match ? match[1].toLowerCase() : DEFAULT_EXT[kind];
  }
}
