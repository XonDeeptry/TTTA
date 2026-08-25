import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { LOCKABLE_FIELD_PATHS } from '../lockable-fields';

/**
 * Body của `PUT /criteria/templates/:key` (§6.4). Mọi trường TÙY CHỌN; trường vắng mặt thì cột
 * tương ứng KHÔNG bị ghi (AC-16.2) — một `PUT {name}` không được đụng tới `rubric`.
 *
 * KHÔNG có `isSystem` (chỉ seeder ghi) và KHÔNG có `isActive` (có route riêng
 * `PATCH .../active`) — `whitelist: true` cắt bỏ cả hai nếu client gửi lên, không đổi gì.
 *
 * `key` thì KHÁC: nó CÓ mặt trong DTO nhưng KHÔNG BAO GIỜ được ghi. `key` bất biến sau khi tạo
 * (D-2: `reset` tra seed theo key, `criteria.templateKey` truy vết theo key — đổi tên sẽ phá cả
 * hai trong im lặng). Sở dĩ khai báo nó ở đây thay vì để `whitelist` cắt là để service PHÁT HIỆN
 * được ý định đổi tên và trả 400 `template key is immutable`; im lặng nuốt một ý định đổi tên là
 * hành vi dễ gây hiểu lầm nhất trong ba trường hợp.
 */
export class UpdateRubricTemplateDto {
  /** CHỈ ĐỂ PHÁT HIỆN ý định đổi tên — không bao giờ được ghi xuống DB (AC-16.4). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  key?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsObject()
  rubric?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsIn(LOCKABLE_FIELD_PATHS, { each: true })
  locked?: string[];
}
