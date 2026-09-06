import { existsSync, unlinkSync } from 'fs';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Submission } from '@prisma/client';
import { normalizeRubric } from '../criteria/rubric-schema';
import { resolveMediaPath } from '../lib/media-path';
import { computeTotal } from '../lib/rubric-scoring';
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
} satisfies Prisma.SubmissionInclude;

export interface SubmissionFilters {
  status?: string;
  /** Tìm chung theo họ tên / mã học viên / SĐT — không phân biệt hoa thường. */
  q?: string;
  className?: string;
  kind?: string;
  /** Ngày ISO `YYYY-MM-DD`, tính theo `received_at`, BAO GỒM cả hai đầu. */
  from?: string;
  to?: string;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

/**
 * `to` được đẩy tới CUỐI ngày. Nếu không, chọn from=to=hôm nay sẽ trả về rỗng vì mọi bài đều
 * có giờ > 00:00 — đúng loại lỗi khiến người dùng tưởng hệ thống mất dữ liệu.
 */
function endOfDay(isoDate: string): Date {
  const d = new Date(`${isoDate.trim()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function buildWhere(filters: SubmissionFilters): Prisma.SubmissionWhereInput | undefined {
  const and: Prisma.SubmissionWhereInput[] = [];

  if (!isBlank(filters.status)) and.push({ status: filters.status!.trim() as never });
  if (!isBlank(filters.kind)) and.push({ kind: filters.kind!.trim() as never });
  if (!isBlank(filters.className)) and.push({ student: { className: filters.className!.trim() } });

  if (!isBlank(filters.q)) {
    const q = filters.q!.trim();
    // Bài của người CHƯA gán học viên (`student` null) tự nhiên rơi khỏi kết quả khi đang tìm
    // theo người — đó là điều mong muốn, không phải mất dữ liệu.
    and.push({
      student: {
        is: {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        },
      },
    });
  }

  const receivedAt: Prisma.DateTimeFilter = {};
  if (!isBlank(filters.from)) receivedAt.gte = new Date(`${filters.from!.trim()}T00:00:00.000Z`);
  if (!isBlank(filters.to)) receivedAt.lt = endOfDay(filters.to!);
  // Ngày gõ sai (`new Date` ra Invalid Date) bị bỏ qua thay vì ném lỗi 500 lên màn hình.
  const validDates = Object.values(receivedAt).every((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (Object.keys(receivedAt).length > 0 && validDates) and.push({ receivedAt });

  return and.length === 0 ? undefined : { AND: and };
}

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bộ lọc màn Bài nộp. Với ~400 học viên × ~20 bài/tháng thì danh sách chỉ-lọc-theo-trạng-thái
   * là vài nghìn dòng chia trang 20 — không dùng được để tra một học viên cụ thể.
   *
   * `q` tìm đồng thời theo họ tên / mã học viên / SĐT: tư vấn cầm trong tay thứ nào thì gõ thứ
   * đó, không phải đoán xem ô tìm kiếm này dành cho trường nào.
   */
  async list(filters: SubmissionFilters, page: number): Promise<SubmissionPage> {
    const where = buildWhere(filters);
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

    // AC-13.1: `totalMax` được DẪN XUẤT Ở SERVER. Dashboard KHÔNG được tự tính lại số học chấm
    // điểm (`dashboard/src/lib/rubric.ts` là file của F12, không tạo ở đây). `max <= 0` (rubric
    // hỏng/không đọc được) ⇒ null để màn hình rơi vào nhánh "chưa có tổng điểm", không phải 0.
    const grading = submission.grading;
    if (!grading) return { ...submission, grading: null };

    const max = computeTotal(normalizeRubric(grading.criteria?.rubric), grading.scores).max;
    return { ...submission, grading: { ...grading, totalMax: max > 0 ? max : null } };
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
