import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Course, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Trước tính năng này, `courses` chỉ tạo được bằng SQL tay — `sheets-sync.service.ts`
 * (upsertRow) chỉ TRA CỨU course theo `key`, cố tình không tự tạo (course phải có sẵn
 * trước khi Sheets đổ học viên vào). Đây là chỗ duy nhất trong hệ thống để tạo/sửa/xóa
 * course qua UI, cần cho cả gán `courseId` học viên thủ công lẫn Test Upload.
 */
@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Course[]> {
    return this.prisma.course.findMany({ orderBy: { key: 'asc' } });
  }

  async create(dto: CreateCourseDto): Promise<Course> {
    try {
      return await this.prisma.course.create({
        data: {
          key: dto.key,
          bandDesc: dto.bandDesc,
          llmConfig: dto.provider ? { provider: dto.provider } : {},
        },
      });
    } catch (err) {
      if (prismaErrorCode(err) === 'P2002') throw new ConflictException('course key already exists');
      throw err as Error;
    }
  }

  async update(id: number, dto: UpdateCourseDto): Promise<Course> {
    const data: Prisma.CourseUpdateInput = {};
    if (dto.bandDesc !== undefined) data.bandDesc = dto.bandDesc;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.provider !== undefined) data.llmConfig = { provider: dto.provider };

    try {
      return await this.prisma.course.update({ where: { id }, data });
    } catch (err) {
      if (prismaErrorCode(err) === 'P2025') throw new NotFoundException('course not found');
      throw err as Error;
    }
  }

  /**
   * Xóa cứng — chặn nếu còn `students`/`criteria` tham chiếu, vì xóa lúc đó sẽ mồ côi dữ
   * liệu chấm điểm/lịch sử. Muốn "ẩn" course mà vẫn giữ dữ liệu thì dùng `isActive=false`
   * qua update() thay vì xóa.
   *
   * `students.course_id` là FK optional nên migration sinh `ON DELETE SET NULL` — Postgres
   * sẽ ÂM THẦM xóa được và chỉ gỡ courseId của học viên (không throw P2003) nếu không
   * check tay ở đây. `criteria.course_id` là FK required nên có `ON DELETE RESTRICT` —
   * nhánh đó THẬT SỰ ném P2003, vẫn bắt dự phòng dù đường chính giờ là pre-check `students`.
   */
  async delete(id: number): Promise<void> {
    const studentCount = await this.prisma.student.count({ where: { courseId: id } });
    if (studentCount > 0) {
      throw new ConflictException('cannot delete: course still has students or criteria referencing it — deactivate it instead');
    }

    try {
      await this.prisma.course.delete({ where: { id } });
    } catch (err) {
      const code = prismaErrorCode(err);
      if (code === 'P2003') {
        throw new ConflictException('cannot delete: course still has students or criteria referencing it — deactivate it instead');
      }
      if (code === 'P2025') throw new NotFoundException('course not found');
      throw err as Error;
    }
  }
}
