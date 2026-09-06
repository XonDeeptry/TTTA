import { BadRequestException, Injectable } from '@nestjs/common';
import { ClassConfig } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ClassesConfigService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ClassConfig[]> {
    return this.prisma.classConfig.findMany({ orderBy: { className: 'asc' } });
  }

  /**
   * `criteriaId`: undefined = giữ nguyên · null = gỡ ghim (về fallback theo khóa) · số = ghim.
   * Kiểm tra tồn tại TRƯỚC khi ghi để trả 400 có nội dung, thay vì để Postgres ném lỗi khóa
   * ngoại (P2003) rồi Nest dịch thành 500 vô nghĩa với người dùng dashboard.
   */
  async upsert(
    className: string,
    advisorZaloId: string,
    autoSend?: boolean,
    criteriaId?: number | null,
  ): Promise<ClassConfig> {
    if (criteriaId !== undefined && criteriaId !== null) {
      const exists = await this.prisma.criteria.findUnique({
        where: { id: criteriaId },
        select: { id: true },
      });
      if (!exists) throw new BadRequestException(`criteria ${criteriaId} không tồn tại`);
    }
    return this.prisma.classConfig.upsert({
      where: { className },
      create: {
        className,
        advisorZaloId,
        autoSend: autoSend ?? false,
        criteriaId: criteriaId ?? null,
      },
      update: {
        advisorZaloId,
        ...(autoSend !== undefined ? { autoSend } : {}),
        ...(criteriaId !== undefined ? { criteriaId } : {}),
      },
    });
  }
}
