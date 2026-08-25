import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CostLog, Criteria, Flag, Grading, Submission, ZaloBinding } from '@prisma/client';
import { InternalTokenGuard } from '../auth/internal-token.guard';
import { normalizeRubric } from '../criteria/rubric-schema';
import { EventsService } from '../events/events.service';
import { computeTotal } from '../lib/rubric-scoring';
import { PrismaService } from '../prisma.service';
import { CreateCostLogDto } from './dto/create-cost-log.dto';
import { CreateFlagDto } from './dto/create-flag.dto';
import { CreateGradingDto } from './dto/create-grading.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SelectStudentDto } from './dto/select-student.dto';
import { StudentAckDto } from './dto/student-ack.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';

/** F11 FR-10 — kết quả đóng dấu "học viên đã xem"; `alreadyAcked` = lần bấm thứ hai trở đi. */
export interface StudentAckResult {
  id: number;
  studentAckAt: Date | null;
  alreadyAcked: boolean;
}

/** F11 FR-12 — đủ để worker dựng lại `SubmissionMessage` mà không cần gọi thêm lượt nào. */
export interface SelectStudentResult {
  id: number;
  messageId: string;
  zaloUserId: string;
  kind: Submission['kind'];
  mediaUrlZalo: string | null;
  receivedAt: Date;
  studentId: number | null;
  status: Submission['status'];
}

export interface StudentForGrading {
  id: number;
  fullName: string;
  className: string | null;
  courseId: number | null;
  llmConfig: unknown;
  autoSend: boolean;
}

/**
 * `levels[]` được `normalizeRubric` chép NGUYÊN VĂN (F8 AC-05.4), nên `code`/`label` có thể là
 * số/bool/thiếu nếu giáo viên soạn ẩu. Ép về chuỗi ở đây để một rubric xấu không biến thành lỗi
 * kiểu của Prisma (500) — đúng tinh thần AC-08.8: chất lượng rubric không bao giờ chặn việc lưu
 * kết quả chấm.
 */
function levelText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

/** API nội bộ cho grading-worker (mục 3.2/3.6, M3) — không phải endpoint cho dashboard. */
@Controller('internal')
@UseGuards(InternalTokenGuard)
export class WorkerApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  @Get('bindings/:zaloUserId')
  bindings(@Param('zaloUserId') zaloUserId: string): Promise<ZaloBinding[]> {
    return this.prisma.zaloBinding.findMany({ where: { zaloUserId } });
  }

  /**
   * CỐ Ý trả rubric NGUYÊN TRẠNG như đang lưu trong DB (có thể là v1 cũ) — KHÔNG gọi
   * `normalizeRubric()` ở đây (F8 AC-08.2). Lý do: worker có bản `normalize_rubric` riêng bằng
   * Python; nếu core-api chuẩn hóa sẵn thì bản Python thành code chết và sẽ âm thầm trôi khỏi
   * bản TS. Đừng "tối ưu" chỗ này — ai đổi phải nêu rõ lý do và cập nhật FR-15.
   */
  @Get('criteria/:courseId')
  async criteria(@Param('courseId', ParseIntPipe) courseId: number): Promise<Criteria> {
    const latest = await this.prisma.criteria.findFirst({
      where: { courseId },
      orderBy: { version: 'desc' },
    });
    if (!latest) throw new NotFoundException('no criteria for this course');
    return latest;
  }

  /**
   * Upsert theo messageId (không phải create thuần) — worker có thể gọi lại endpoint này
   * khi RabbitMQ redeliver/retry một message đã xử lý dở dang, không được vỡ vì unique
   * constraint (mục 3.5 "Idempotency": message_id UNIQUE là lưới đỡ thứ hai sau Redis SETNX).
   */
  @Post('submissions')
  async createSubmission(@Body() body: CreateSubmissionDto): Promise<Submission> {
    const data = {
      zaloUserId: body.zaloUserId,
      studentId: body.studentId,
      kind: body.kind,
      mediaUrlZalo: body.mediaUrlZalo,
      mediaPath: body.mediaPath,
      durationSec: body.durationSec,
      status: (body.status as Submission['status']) ?? undefined,
    };
    // await + publish SAU khi ghi resolve — status có thể default 'received' khi body bỏ trống (CR-5).
    const result = await this.prisma.submission.upsert({
      where: { messageId: body.messageId },
      create: { messageId: body.messageId, ...data },
      update: data,
    });
    this.events.publishStatus(result.id, result.status); // F6: fire-and-forget, không vỡ handler
    return result;
  }

  @Patch('submissions/:id')
  async updateSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSubmissionDto,
  ): Promise<Submission> {
    const result = await this.prisma.submission.update({
      where: { id },
      data: {
        status: body.status as Submission['status'],
        mediaPath: body.mediaPath,
        durationSec: body.durationSec,
        studentId: body.studentId,
        audioExtractedAt: body.audioExtractedAt ? new Date(body.audioExtractedAt) : undefined,
      },
    });
    this.events.publishStatus(result.id, result.status); // F6
    return result;
  }

  /**
   * F11 FR-12 — học viên bấm nút chọn anh/chị/em nào là chủ bài nộp đang treo.
   *
   * Toàn bộ phân quyền nằm Ở ĐÂY (BR-05): `zaloUserId` do gateway suy ra từ webhook đã xác thực
   * chữ ký, KHÔNG lấy từ chuỗi payload học viên gõ. Vì vậy một chuỗi `#ilm:select_student:…` tự
   * gõ tay không bao giờ chạm được vào bài của người khác — cả bài NỘP lẫn BINDING đều phải
   * thuộc đúng người gửi.
   *
   * Ghi bằng `updateMany` có điều kiện (`studentId IS NULL AND status='received'`) nên hai cú
   * bấm đua nhau chỉ MỘT cú thắng ⇒ một bài không bao giờ bị gán hai học viên / chấm hai lần
   * (BR-13). Endpoint KHÔNG publish gì và KHÔNG đổi status (AC-12.5).
   */
  @Patch('submissions/:id/select-student')
  async selectStudent(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SelectStudentDto,
  ): Promise<SelectStudentResult> {
    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException({ code: 'not_found', message: 'submission not found' });
    if (submission.zaloUserId !== body.zaloUserId) {
      // `code` cho phép worker ghi đúng lý do flag cho từng ca 403 mà vẫn giữ nguyên mã HTTP.
      throw new ForbiddenException({ code: 'not_owner', message: 'submission does not belong to this Zalo user' });
    }

    const binding = await this.prisma.zaloBinding.findUnique({ where: { id: body.bindingId } });
    if (
      !binding ||
      binding.zaloUserId !== body.zaloUserId ||
      binding.status !== 'active' ||
      binding.studentId === null
    ) {
      throw new ForbiddenException({
        code: 'invalid_binding',
        message: 'binding is not an active binding of this Zalo user',
      });
    }

    const written = await this.prisma.submission.updateMany({
      where: { id, studentId: null, status: 'received' },
      data: { studentId: binding.studentId },
    });
    if (written.count === 0) {
      throw new ConflictException({ code: 'already_selected', message: 'submission already bound' });
    }

    const row = await this.prisma.submission.findUnique({
      where: { id },
      select: {
        id: true,
        messageId: true,
        zaloUserId: true,
        kind: true,
        mediaUrlZalo: true,
        receivedAt: true,
        studentId: true,
        status: true,
      },
    });
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'submission not found' });
    return row;
  }

  /**
   * F11 FR-10 — nút "Em đã xem". ĐIỂM GHI DUY NHẤT của `gradings.student_ack_at` (BR-11): F9 tạo
   * cột này và không bao giờ ghi. Chỉ ghi ĐÚNG cột đó, không đụng điểm/nhận xét/status.
   *
   * Lần bấm ĐẦU thắng: `updateMany` có điều kiện `studentAckAt IS NULL` nên bấm lại (hoặc
   * RabbitMQ redeliver) không dịch được dấu thời gian — trả 200 kèm `alreadyAcked: true` (NFR-07).
   */
  @Patch('gradings/:id/student-ack')
  async studentAck(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: StudentAckDto,
  ): Promise<StudentAckResult> {
    const grading = await this.prisma.grading.findUnique({
      where: { id },
      select: { id: true, studentAckAt: true, submission: { select: { zaloUserId: true } } },
    });
    if (!grading) throw new NotFoundException('grading not found');
    if (grading.submission.zaloUserId !== body.zaloUserId) {
      throw new ForbiddenException('grading does not belong to this Zalo user');
    }
    if (grading.studentAckAt !== null) {
      return { id: grading.id, studentAckAt: grading.studentAckAt, alreadyAcked: true };
    }

    const ackedAt = new Date();
    const written = await this.prisma.grading.updateMany({
      where: { id, studentAckAt: null },
      data: { studentAckAt: ackedAt },
    });
    if (written.count === 0) {
      // Đua giữa hai cú bấm — giữ nguyên mốc của cú thắng.
      const current = await this.prisma.grading.findUnique({
        where: { id },
        select: { studentAckAt: true },
      });
      return { id, studentAckAt: current?.studentAckAt ?? null, alreadyAcked: true };
    }
    return { id, studentAckAt: ackedAt, alreadyAcked: false };
  }

  @Post('flags')
  createFlag(@Body() body: CreateFlagDto): Promise<Flag> {
    return this.prisma.flag.create({ data: { submissionId: body.submissionId, reason: body.reason } });
  }

  /** Course.llmConfig + classes_config.autoSend theo className — worker cần cả hai để chấm + rẽ nhánh gửi (mục 3.9, Tranh luận 4). */
  @Get('students/:id')
  async student(@Param('id', ParseIntPipe) id: number): Promise<StudentForGrading> {
    const student = await this.prisma.student.findUnique({ where: { id }, include: { course: true } });
    if (!student) throw new NotFoundException('student not found');
    const classConfig = student.className
      ? await this.prisma.classConfig.findUnique({ where: { className: student.className } })
      : null;
    return {
      id: student.id,
      fullName: student.fullName,
      className: student.className,
      courseId: student.courseId,
      llmConfig: student.course?.llmConfig ?? null,
      autoSend: classConfig?.autoSend ?? false,
    };
  }

  /**
   * ĐIỂM GỌI `computeTotal` DUY NHẤT trên đường ghi (FR-08). grading-worker và LLM tuyệt đối
   * không cộng/trung bình/đặt tên cấp độ (BR-01/BR-02) — DTO của worker giữ nguyên từng byte,
   * chỉ có RESPONSE là thêm ba cột mới (thay đổi cộng thêm, tương thích ngược).
   *
   * `normalizeRubric` được gọi Ở ĐÂY, trên rubric đã lưu; `computeTotal` không bao giờ tự
   * chuẩn hóa (BR-12) và không bao giờ ném lỗi (AC-01.2) ⇒ rubric xấu không chặn được việc lưu
   * kết quả chấm, cũng không đẩy message vào vòng retry→DLQ.
   */
  @Post('gradings')
  async createGrading(@Body() body: CreateGradingDto): Promise<Grading> {
    const criteria = await this.prisma.criteria.findUnique({ where: { id: body.criteriaId } });
    if (!criteria) throw new NotFoundException('criteria not found');
    const submission = await this.prisma.submission.findUnique({
      where: { id: body.submissionId },
      select: { id: true, studentId: true, receivedAt: true },
    });
    if (!submission) throw new NotFoundException('submission not found');

    const result = computeTotal(normalizeRubric(criteria.rubric), body.scores);
    // BR-05: không có điểm nào dùng được ⇒ NULL cả ba cột. KHÔNG ghi 0.
    const scored = result.counted > 0;
    const level = scored ? result.level : null;

    const gradingWrite = this.prisma.grading.create({
      data: {
        submissionId: body.submissionId,
        criteriaId: body.criteriaId,
        criteriaVersion: body.criteriaVersion,
        scores: body.scores as never,
        llmFeedback: body.llmFeedback,
        autoSent: body.autoSent ?? false,
        totalScore: scored ? result.total : null,
        levelCode: levelText(level?.code),
        levelLabel: levelText(level?.label),
      },
    });

    // FR-09: cập nhật cấp độ hiện tại của học viên. `currentLevelAt` = `submission.receivedAt`
    // (Grading không có `createdAt`, và "cấp độ tại bài gần nhất" mới là phát biểu nghiệp vụ).
    // Chốt chặn thứ tự: chỉ ghi khi cấp độ đang lưu CŨ HƠN HOẶC BẰNG bài này ⇒ chấm lại một bài
    // cũ không đè được cấp độ mới hơn. `updateMany` khớp 0 dòng là no-op, nên học viên đã bị xóa
    // cũng không ném lỗi (AC-09.3/09.10). Không có cấp độ ⇒ KHÔNG xóa cấp độ cũ (AC-09.6).
    const studentId = submission.studentId;
    const studentWrite =
      level !== null && studentId !== null
        ? this.prisma.student.updateMany({
            where: {
              id: studentId,
              OR: [{ currentLevelAt: null }, { currentLevelAt: { lte: submission.receivedAt } }],
            },
            data: {
              currentLevelCode: levelText(level.code),
              currentLevelAt: submission.receivedAt,
            },
          })
        : null;

    // AC-09.9: ghi grading + cập nhật học viên trong MỘT transaction ⇒ không thể ghi nửa vời.
    const [grading] = studentWrite
      ? await this.prisma.$transaction([gradingWrite, studentWrite])
      : await this.prisma.$transaction([gradingWrite]);
    return grading;
  }

  @Post('cost-log')
  createCostLog(@Body() body: CreateCostLogDto): Promise<CostLog> {
    return this.prisma.costLog.create({
      data: {
        submissionId: body.submissionId,
        provider: body.provider,
        model: body.model,
        inputTokens: body.inputTokens,
        outputTokens: body.outputTokens,
        estUsd: body.estUsd,
        callType: body.callType,
      },
    });
  }
}
