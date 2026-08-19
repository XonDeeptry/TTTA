import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Student } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';

const PAGE_SIZE = 20;

export interface StudentPage {
  items: Student[];
  page: number;
  pageSize: number;
  total: number;
}

/** Prisma known-request-error nhận diện theo `code` (duck-typing, cùng cách users.service.ts). */
function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Map lỗi ghi Postgres về HTTP đúng nghĩa — dùng chung cho cả create lẫn update vì cả hai
 * đều có thể chạm unique (code) hoặc FK (courseId trỏ tới khóa không tồn tại). */
function rethrowAsHttpError(err: unknown): never {
  const code = prismaErrorCode(err);
  if (code === 'P2002') throw new ConflictException('student code already exists');
  if (code === 'P2003') throw new BadRequestException('courseId does not reference an existing course');
  throw err as Error;
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

  async update(id: number, data: Prisma.StudentUpdateInput): Promise<Student> {
    try {
      return await this.prisma.student.update({ where: { id }, data });
    } catch (err) {
      rethrowAsHttpError(err);
    }
  }

  /**
   * Tạo học viên thủ công — bình thường `students` chỉ được nạp qua cron đồng bộ
   * Google Sheets (`sheets-sync/`); nút này cho admin thêm tay khi chưa cấu hình
   * Sheets, hoặc để tạo học viên test cho tính năng Test Upload.
   */
  async create(dto: CreateStudentDto): Promise<Student> {
    try {
      return await this.prisma.student.create({
        data: {
          code: dto.code,
          fullName: dto.fullName,
          phone: dto.phone,
          courseId: dto.courseId,
          className: dto.className,
          campus: dto.campus,
        },
      });
    } catch (err) {
      rethrowAsHttpError(err);
    }
  }

  /** Chặn nếu còn `submissions`/`zalo_bindings` tham chiếu (FK) — xóa lúc đó sẽ mồ côi lịch sử
   * chấm điểm. Học viên đồng bộ từ Sheets nên thường không cần xóa; nút này chủ yếu dọn
   * học viên test tạo thủ công (xem create()). */
  async delete(id: number): Promise<void> {
    try {
      await this.prisma.student.delete({ where: { id } });
    } catch (err) {
      const code = prismaErrorCode(err);
      if (code === 'P2003') {
        throw new ConflictException('cannot delete: student has existing submissions or Zalo bindings');
      }
      if (code === 'P2025') throw new NotFoundException('student not found');
      throw err as Error;
    }
  }
}
