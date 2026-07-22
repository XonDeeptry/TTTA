import { existsSync, unlinkSync } from 'fs';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Submission } from '@prisma/client';
import { resolveMediaPath } from '../lib/media-path';
import { PrismaService } from '../prisma.service';

const PAGE_SIZE = 20;

export interface SubmissionPage {
  items: unknown[];
  page: number;
  pageSize: number;
  total: number;
}

const LIST_INCLUDE = {
  student: { select: { id: true, fullName: true, className: true } },
  grading: { select: { id: true, autoSent: true, sentAt: true } },
} satisfies Prisma.SubmissionInclude;

const DETAIL_INCLUDE = {
  student: true,
  grading: { include: { criteria: true } },
  flags: true,
  pilotTextGrading: true,
} satisfies Prisma.SubmissionInclude;

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status: string | undefined, page: number): Promise<SubmissionPage> {
    const where: Prisma.SubmissionWhereInput | undefined = status ? { status: status as never } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        include: LIST_INCLUDE,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.submission.count({ where }),
    ]);
    return { items, page, pageSize: PAGE_SIZE, total };
  }

  async detail(id: number) {
    const submission = await this.prisma.submission.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!submission) throw new NotFoundException('submission not found');
    return submission;
  }

  async deleteMedia(id: number): Promise<Submission> {
    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('submission not found');
    if (submission.mediaPath && !submission.mediaDeletedAt) {
      const filePath = resolveMediaPath(submission.mediaPath);
      if (existsSync(filePath)) unlinkSync(filePath);
    }
    return this.prisma.submission.update({ where: { id }, data: { mediaDeletedAt: new Date() } });
  }
}
