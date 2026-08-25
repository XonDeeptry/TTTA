import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Criteria } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateCriteriaJsonDto } from './dto/create-criteria-json.dto';
import { parseRubricFromDocxBuffer } from './docx-parser';
import { normalizeRubric, type RubricV2 } from './rubric-schema';
import { assertAuthorableRubric, MACHINE_KEY_PATTERN } from './rubric-validation';

@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tiêu đề mặc định của một phiên bản criteria. Dùng chung cho CẢ HAI đường ghi (.docx và JSON)
   * để AC-01.6 ("byte-identical to ingestDocx's expression") đúng theo cấu trúc chứ không nhờ
   * hai chuỗi chép tay tình cờ giống nhau. */
  private defaultTitle(rubric: Pick<RubricV2, 'course_key' | 'task_type'>): string {
    return `${rubric.course_key} — ${rubric.task_type}`;
  }

  /** Nâng rubric lên v2 NGAY LÚC ĐỌC, chỉ trong bộ nhớ — hàng trong DB không bị ghi lại
   * (BR-01/FR-16). Nhờ vậy màn Criteria và mọi consumer dashboard luôn thấy một shape duy
   * nhất, dù hàng đó được lưu trước hay sau F8. */
  private toV2(row: Criteria): Criteria {
    return { ...row, rubric: normalizeRubric(row.rubric) as never };
  }

  async list(courseId: number): Promise<Criteria[]> {
    const rows = await this.prisma.criteria.findMany({ where: { courseId }, orderBy: { version: 'desc' } });
    return rows.map((row) => this.toV2(row));
  }

  async get(id: number): Promise<Criteria> {
    const criteria = await this.prisma.criteria.findUnique({ where: { id } });
    if (!criteria) throw new NotFoundException('criteria not found');
    return this.toV2(criteria);
  }

  /** Upload .docx theo template chuẩn (mục 3.9) — mỗi lần upload là một version mới.
   * Parser đã trả thẳng rubric v2 (F8 FR-06) và đầu ra của nó vốn là điểm bất động của
   * `normalizeRubric` ⇒ KHÔNG gọi normalize lần nữa ở đây. */
  async ingestDocx(courseId: number, buffer: Buffer, sourceFilename: string): Promise<Criteria> {
    const rubric = await parseRubricFromDocxBuffer(buffer);

    const latest = await this.prisma.criteria.findFirst({ where: { courseId }, orderBy: { version: 'desc' } });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.criteria.create({
      data: {
        courseId,
        title: this.defaultTitle(rubric),
        rubric: rubric as never,
        sourceFilename,
        version,
      },
    });
  }

  /**
   * F12 FR-01 — lưu NỘI DUNG chấm điểm do drawer 2 soạn thành MỘT PHIÊN BẢN MỚI.
   *
   * ⚠ THỨ TỰ Ở ĐÂY LÀ RÀNG BUỘC: `assertAuthorableRubric` được gọi trên `dto.rubric` THÔ, chưa qua
   * `normalizeRubric` lần nào. Chuẩn hóa trước sẽ âm thầm vá `scale.step`/`min`/`max` rồi cổng kiểm
   * không còn gì để bắt — đó chính là DEF-1 của F10 (xem chú thích dài trong `rubric-validation.ts`).
   * Hàm đó tự chuẩn hóa bên trong và TRẢ VỀ rubric v2 để lưu, nên ở đây không có (và không được có)
   * một lời gọi `normalizeRubric` nào.
   *
   * BR-05: một phiên bản criteria là BẤT BIẾN. Sửa nội dung ⇒ tạo v+1, không `update` hàng cũ —
   * vì vậy service này vẫn KHÔNG có đường ghi đè nào lên `criteria` đã tồn tại.
   */
  async createFromJson(dto: CreateCriteriaJsonDto): Promise<Criteria> {
    // 1) Cổng rubric TRƯỚC mọi thứ khác: một rubric hỏng không được phép chạm tới database.
    const rubric = assertAuthorableRubric(dto.rubric);
    const templateKey = this.readTemplateKey(dto.templateKey);

    // 2) Khóa học phải tồn tại ⇒ 404 tường minh, KHÔNG để lỗi khóa ngoại của Prisma nổ thành 500.
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId }, select: { id: true } });
    if (!course) throw new NotFoundException('course not found');

    const title = dto.title?.trim() ? dto.title.trim() : this.defaultTitle(rubric);

    // 3) Cùng CƠ CHẾ đánh version với `ingestDocx` (AC-01.4): max hiện có + 1, khóa chưa có ⇒ 1.
    const latest = await this.prisma.criteria.findFirst({
      where: { courseId: dto.courseId },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.criteria.create({
      data: {
        courseId: dto.courseId,
        title,
        rubric: rubric as never,
        // Soạn bằng trình soạn thì không có file nguồn. Cột đã nullable sẵn — không cần migration.
        sourceFilename: null,
        version,
        templateKey,
      },
    });
  }

  /**
   * `templateKey` chỉ để TRUY VẾT (BR-07): kiểm ĐỊNH DẠNG, KHÔNG kiểm sự tồn tại. Một khóa trỏ tới
   * mẫu đã bị xóa là trạng thái BÌNH THƯỜNG (F10 AC-02.4) — kiểm tồn tại ở đây sẽ biến việc xóa một
   * mẫu thành việc làm hỏng các bản nháp đang soạn dở.
   */
  private readTemplateKey(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !MACHINE_KEY_PATTERN.test(value)) {
      throw new BadRequestException('invalid template key');
    }
    return value;
  }
}
