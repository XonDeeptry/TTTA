import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CostLog, Criteria, Flag, Grading, Submission, ZaloBinding } from '@prisma/client';
import { InternalTokenGuard } from '../auth/internal-token.guard';
import { PrismaService } from '../prisma.service';
import { CreateCostLogDto } from './dto/create-cost-log.dto';
import { CreateFlagDto } from './dto/create-flag.dto';
import { CreateGradingDto } from './dto/create-grading.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';

export interface StudentForGrading {
  id: number;
  fullName: string;
  className: string | null;
  courseId: number | null;
  llmConfig: unknown;
  autoSend: boolean;
}

/** API nội bộ cho grading-worker (mục 3.2/3.6, M3) — không phải endpoint cho dashboard. */
@Controller('internal')
@UseGuards(InternalTokenGuard)
export class WorkerApiController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('bindings/:zaloUserId')
  bindings(@Param('zaloUserId') zaloUserId: string): Promise<ZaloBinding[]> {
    return this.prisma.zaloBinding.findMany({ where: { zaloUserId } });
  }

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
  createSubmission(@Body() body: CreateSubmissionDto): Promise<Submission> {
    const data = {
      zaloUserId: body.zaloUserId,
      studentId: body.studentId,
      kind: body.kind,
      mediaUrlZalo: body.mediaUrlZalo,
      mediaPath: body.mediaPath,
      durationSec: body.durationSec,
      status: (body.status as Submission['status']) ?? undefined,
    };
    return this.prisma.submission.upsert({
      where: { messageId: body.messageId },
      create: { messageId: body.messageId, ...data },
      update: data,
    });
  }

  @Patch('submissions/:id')
  async updateSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSubmissionDto,
  ): Promise<Submission> {
    return this.prisma.submission.update({
      where: { id },
      data: {
        status: body.status as Submission['status'],
        mediaPath: body.mediaPath,
        durationSec: body.durationSec,
        studentId: body.studentId,
      },
    });
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

  @Post('gradings')
  createGrading(@Body() body: CreateGradingDto): Promise<Grading> {
    return this.prisma.grading.create({
      data: {
        submissionId: body.submissionId,
        criteriaId: body.criteriaId,
        criteriaVersion: body.criteriaVersion,
        scores: body.scores as never,
        llmFeedback: body.llmFeedback,
        autoSent: body.autoSent ?? false,
      },
    });
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
      },
    });
  }
}
