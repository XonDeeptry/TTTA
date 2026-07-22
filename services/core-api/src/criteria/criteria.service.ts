import { Injectable, NotFoundException } from '@nestjs/common';
import { Criteria } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { parseRubricFromDocxBuffer } from './docx-parser';

@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  list(courseId: number): Promise<Criteria[]> {
    return this.prisma.criteria.findMany({ where: { courseId }, orderBy: { version: 'desc' } });
  }

  async get(id: number): Promise<Criteria> {
    const criteria = await this.prisma.criteria.findUnique({ where: { id } });
    if (!criteria) throw new NotFoundException('criteria not found');
    return criteria;
  }

  /** Upload .docx theo template chuẩn (mục 3.9) — mỗi lần upload là một version mới. */
  async ingestDocx(courseId: number, buffer: Buffer, sourceFilename: string): Promise<Criteria> {
    const rubric = await parseRubricFromDocxBuffer(buffer);

    const latest = await this.prisma.criteria.findFirst({ where: { courseId }, orderBy: { version: 'desc' } });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.criteria.create({
      data: {
        courseId,
        title: `${rubric.course_key} — ${rubric.task_type}`,
        rubric: rubric as never,
        sourceFilename,
        version,
      },
    });
  }
}
