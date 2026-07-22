import { Injectable } from '@nestjs/common';
import { Prisma, Student } from '@prisma/client';
import { PrismaService } from '../prisma.service';

const PAGE_SIZE = 20;

export interface StudentPage {
  items: Student[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search: string | undefined, page: number): Promise<StudentPage> {
    const where: Prisma.StudentWhereInput | undefined = search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: { code: 'asc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    return { items, page, pageSize: PAGE_SIZE, total };
  }

  update(id: number, data: Prisma.StudentUpdateInput): Promise<Student> {
    return this.prisma.student.update({ where: { id }, data });
  }
}
