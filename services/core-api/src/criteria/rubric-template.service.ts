import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RubricTemplate } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { CreateRubricTemplateDto } from './dto/create-rubric-template.dto';
import type { DuplicateRubricTemplateDto } from './dto/duplicate-rubric-template.dto';
import type { UpdateRubricTemplateDto } from './dto/update-rubric-template.dto';
import { dedupeLocked } from './lockable-fields';
import { normalizeRubric, type RubricV2 } from './rubric-schema';
import { assertAuthorableRubric } from './rubric-validation';
import { findSeed } from './templates';

/** Shape trả về của MỌI route template (§5.2). `rubric` luôn là RubricV2 đã chuẩn hóa. */
export interface RubricTemplateView {
  id: number;
  key: string;
  name: string;
  rubric: RubricV2;
  locked: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Prisma known-request-error nhận diện theo `code` (duck-typing) để test mock được —
 * cùng khuôn `users.service.ts`. */
function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Bản sao SÂU qua JSON — cắt đứt mọi tham chiếu tới seed đã Object.freeze và tới hàng nguồn khi
 * nhân bản (AC-15.4: sửa bản sao sau đó không được đụng tới JSON của bản gốc). */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Tám thao tác CRUD trên CẤU TRÚC chấm điểm (thiết kế mục 4.1).
 *
 * Ba bất biến chạy suốt file:
 *  1. Địa chỉ của một mẫu là `key`, không phải `id` — `id` chỉ là khóa thay thế. Vì vậy mọi route
 *     nhận `:key` dạng chuỗi và 404 khi không thấy (kể cả `:key` trông như số — AC-13.4).
 *  2. `rubric` LƯU XUỐNG luôn đã `normalizeRubric` (BR-06) ⇒ mọi hàng trên đĩa là điểm bất động
 *     v2, và `GET` cũng chuẩn hóa lại lúc đọc nên một hàng bị sửa tay trong DB vẫn trả ra đúng
 *     hình.
 *  3. `isSystem` KHÔNG BAO GIỜ được ghi ở đây — chỉ seeder ghi (BR-04). Nó chỉ đổi đúng hai
 *     hành vi: cấm xóa (409) và cho phép reset.
 */
@Injectable()
export class RubricTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(row: RubricTemplate): RubricTemplateView {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      rubric: normalizeRubric(row.rubric),
      locked: [...row.locked],
      isSystem: row.isSystem,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async findRowOr404(key: string): Promise<RubricTemplate> {
    const row = await this.prisma.rubricTemplate.findUnique({ where: { key } });
    if (!row) throw new NotFoundException('template not found');
    return row;
  }

  /**
   * KIỂM (FR-19) rồi trả về rubric đã chuẩn hóa để ghi.
   *
   * `assertAuthorableRubric` tự gọi `normalizeRubric` bên trong. TUYỆT ĐỐI KHÔNG chuẩn hóa ở đây
   * rồi mới truyền vào: bản trước làm đúng như vậy và `normalizeRubric` đã âm thầm ép mọi
   * `scale.step` không dương về 1, khiến luật AC-19.6 thành code chết trên cả hai đường ghi
   * (QA fix round 1, DEF-1).
   */
  private prepareRubric(raw: unknown): RubricV2 {
    return assertAuthorableRubric(raw);
  }

  // ─── 1. Liệt kê ────────────────────────────────────────────────────────────────

  /**
   * Mặc định CHỈ trả mẫu đang hiện. `includeInactive` chấp nhận `'true'`/`'1'`; mọi giá trị khác
   * (và vắng mặt) đều nghĩa là LOẠI — tham số này KHÔNG BAO GIỜ trả 400 (AC-12.3), vì một danh
   * sách hụt do gõ sai query còn dễ nhận ra hơn một màn hình trắng vì 400.
   *
   * Thứ tự tất định `isSystem DESC, key ASC` ⇒ hai mẫu mặc định luôn đứng đầu (thiết kế mục 7).
   */
  async list(includeInactive: string | undefined): Promise<RubricTemplateView[]> {
    const wantInactive = includeInactive === 'true' || includeInactive === '1';
    const rows = await this.prisma.rubricTemplate.findMany({
      where: wantInactive ? {} : { isActive: true },
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    });
    return rows.map((row) => this.toView(row));
  }

  // ─── 2. Xem chi tiết ───────────────────────────────────────────────────────────

  /** Trả cả mẫu đang ẩn lẫn mẫu hệ thống — `includeInactive` KHÔNG áp dụng cho chi tiết
   * (AC-13.1): người dùng đã biết `key` thì không có lý do gì giấu. */
  async get(key: string): Promise<RubricTemplateView> {
    return this.toView(await this.findRowOr404(key));
  }

  // ─── 3. Tạo mới ────────────────────────────────────────────────────────────────

  async create(dto: CreateRubricTemplateDto): Promise<RubricTemplateView> {
    const rubric = this.prepareRubric(dto.rubric);

    const existing = await this.prisma.rubricTemplate.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (existing) throw new ConflictException('template key already exists');

    try {
      const row = await this.prisma.rubricTemplate.create({
        data: {
          key: dto.key,
          name: dto.name,
          rubric: rubric as never,
          locked: dedupeLocked(dto.locked ?? []),
          // Luôn false, bất kể body chứa gì (AC-14.3) — tạo mới chỉ ra được mẫu THƯỜNG.
          isSystem: false,
          isActive: dto.isActive ?? true,
        },
      });
      return this.toView(row);
    } catch (err) {
      // Unique index của Postgres mới là nguồn chân lý: kiểm ở trên có thể thua một request song
      // song, nên vẫn phải bắt P2002 (cùng khuôn phòng thủ `UsersService.create`).
      if (prismaErrorCode(err) === 'P2002') throw new ConflictException('template key already exists');
      throw err;
    }
  }

  // ─── 4. Nhân bản ───────────────────────────────────────────────────────────────

  /**
   * Bản sao LUÔN là mẫu thường và luôn đang hiện — kể cả khi nguồn là mẫu hệ thống hoặc đang ẩn
   * (AC-15.3/15.8). Nhờ vậy "nhân bản mẫu mặc định rồi sửa" là đường đi chính thức thay cho việc
   * sửa thẳng bản gốc, và bản sao đó XÓA ĐƯỢC (AC-15.5).
   *
   * CỐ Ý KHÔNG chạy `assertAuthorableRubric` (AC-15.9): nguồn đã qua cổng đó lúc được lưu, và một
   * hàng bị sửa tay trong DB vẫn phải nhân bản được — chặn ở đây chỉ khiến người dùng kẹt cứng,
   * không cứu được dữ liệu nào. Vẫn `normalizeRubric` như mọi đường ghi khác.
   */
  async duplicate(sourceKey: string, dto: DuplicateRubricTemplateDto): Promise<RubricTemplateView> {
    const source = await this.findRowOr404(sourceKey);

    const existing = await this.prisma.rubricTemplate.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (existing) throw new ConflictException('template key already exists');

    try {
      const row = await this.prisma.rubricTemplate.create({
        data: {
          key: dto.key,
          name: dto.name ?? `${source.name} (bản sao)`,
          rubric: deepCopy(normalizeRubric(source.rubric)) as never,
          locked: [...source.locked],
          isSystem: false,
          isActive: true,
        },
      });
      return this.toView(row);
    } catch (err) {
      if (prismaErrorCode(err) === 'P2002') throw new ConflictException('template key already exists');
      throw err;
    }
  }

  // ─── 5. Sửa ────────────────────────────────────────────────────────────────────

  /**
   * Sửa được MỌI trường của mọi mẫu, kể cả mẫu hệ thống và kể cả những trường nằm trong chính
   * `locked` của nó (AC-16.3) — `locked` ràng buộc drawer soạn NỘI DUNG của F12, không ràng buộc
   * người giữ quyền `rubric_template` (thiết kế mục 4.1 + mục 11).
   *
   * Trường vắng mặt thì cột KHÔNG bị ghi. `rubric` sai luật ⇒ 400 và KHÔNG cột nào được ghi
   * (AC-16.7) — vì việc kiểm chạy TRƯỚC lệnh `update`, không có ghi từng phần.
   */
  async update(key: string, dto: UpdateRubricTemplateDto): Promise<RubricTemplateView> {
    // `key` giống hệt path ⇒ BỎ QUA (client gửi lại nguyên object vừa GET là chuyện thường);
    // khác path ⇒ 400, không im lặng nuốt một ý định đổi tên (AC-16.4).
    if (dto.key !== undefined && dto.key !== key) {
      throw new BadRequestException('template key is immutable');
    }

    await this.findRowOr404(key);

    const rubric = dto.rubric !== undefined ? this.prepareRubric(dto.rubric) : undefined;

    try {
      const row = await this.prisma.rubricTemplate.update({
        where: { key },
        data: {
          name: dto.name,
          // `undefined` ⇒ Prisma bỏ qua cột (AC-16.2/16.10). KHÔNG dùng `null` ở đây.
          rubric: rubric === undefined ? undefined : (rubric as never),
          locked: dto.locked === undefined ? undefined : dedupeLocked(dto.locked),
        },
      });
      return this.toView(row);
    } catch (err) {
      if (prismaErrorCode(err) === 'P2025') throw new NotFoundException('template not found');
      throw err;
    }
  }

  // ─── 6. Xóa ────────────────────────────────────────────────────────────────────

  /**
   * Xóa THẬT một mẫu thường. KHÔNG đụng tới bất kỳ hàng `criteria` nào — `criteria.template_key`
   * là chuỗi thường, không phải khóa ngoại, nên không có `ON DELETE` nào chạy và các `criteria`
   * đã soạn từ mẫu này vẫn đọc/chấm/xuất báo cáo bình thường, chỉ còn lại một `templateKey` mồ
   * côi (BR-07/BR-08, AC-02.4).
   *
   * Mẫu hệ thống ⇒ 409: lỡ xóa thì không có đường lấy lại ngoài redeploy, mà nút "khôi phục bản
   * gốc" + "ẩn" đã phục vụ đúng nhu cầu đó rồi (thiết kế mục 4.1).
   */
  async remove(key: string): Promise<void> {
    const row = await this.findRowOr404(key);
    if (row.isSystem) throw new ConflictException('system templates cannot be deleted');
    await this.prisma.rubricTemplate.delete({ where: { key } });
  }

  // ─── 7. Ẩn / hiện ──────────────────────────────────────────────────────────────

  /** Chỉ đổi cột `is_active`. Hoạt động trên CẢ mẫu thường lẫn mẫu hệ thống, và KHÔNG đụng gì tới
   * các `criteria` đã sinh ra từ mẫu (AC-17.5) — ẩn là trạng thái của DANH SÁCH CHỌN, không phải
   * của dữ liệu đã soạn. Đặt lại đúng giá trị đang có ⇒ vẫn 200 (idempotent). */
  async setActive(key: string, isActive: boolean): Promise<RubricTemplateView> {
    await this.findRowOr404(key);
    try {
      const row = await this.prisma.rubricTemplate.update({ where: { key }, data: { isActive } });
      return this.toView(row);
    } catch (err) {
      if (prismaErrorCode(err) === 'P2025') throw new NotFoundException('template not found');
      throw err;
    }
  }

  // ─── 8. Khôi phục bản gốc ──────────────────────────────────────────────────────

  /**
   * Ghi đè `name`/`rubric`/`locked` từ định nghĩa seed trong code.
   *
   * `isActive` CỐ Ý KHÔNG được khôi phục (D-4): ẩn/hiện là trạng thái VẬN HÀNH, không phải nội
   * dung của seed — khôi phục cấu trúc mà kéo theo việc hiện lại một mẫu vừa bị ẩn là tác dụng
   * phụ không ai mong. `id`/`createdAt`/`isSystem` cũng không đổi.
   *
   * KHÔNG đụng tới bất kỳ `criteria` nào, kể cả hàng có `templateKey` trỏ đúng mẫu này (AC-18.7,
   * thiết kế mục 4: "Sửa mẫu không hồi tố các criteria đã soạn từ nó").
   */
  async reset(key: string): Promise<RubricTemplateView> {
    const row = await this.findRowOr404(key);
    if (!row.isSystem) throw new ConflictException('reset is only available for system templates');

    const seed = findSeed(key);
    // `is_system = true` nhưng không có seed nào mang key đó — chỉ tới được bằng cách sửa tay
    // trong DB. Trả 409 có nghĩa, KHÔNG để thành 500 (AC-18.6).
    if (!seed) throw new ConflictException('no seed definition for this template');

    const updated = await this.prisma.rubricTemplate.update({
      where: { key },
      data: {
        name: seed.name,
        // Bản sao sâu: seed là singleton đã đóng băng, dùng chung cho mọi lần reset trong cùng
        // tiến trình ⇒ reset lần thứ hai phải ra hàng y hệt lần đầu (AC-18.4/06.5).
        rubric: deepCopy(seed.rubric) as never,
        locked: [...seed.locked],
      },
    });
    return this.toView(updated);
  }
}
