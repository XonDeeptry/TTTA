import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';
import { MACHINE_KEY_PATTERN } from '../rubric-validation';
import { LOCKABLE_FIELD_PATHS } from '../lockable-fields';

/**
 * Body của `POST /criteria/templates` (§6.3).
 *
 * KHÔNG có `isSystem`: chỉ seeder mới đặt được cột đó (BR-04/NFR-S3). `ValidationPipe({whitelist:
 * true})` ở main.ts loại mọi thuộc tính lạ, nên gửi `isSystem: true` trong body cũng không có tác
 * dụng gì — nó bị cắt trước khi tới controller.
 */
export class CreateRubricTemplateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(MACHINE_KEY_PATTERN, {
    message: 'key must match ^[a-z0-9][a-z0-9_]{0,63}$ (lowercase, digits, underscore)',
  })
  key!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  name!: string;

  /** Rubric thô — `assertAuthorableRubric` ở tầng service TỰ chuẩn hóa bên trong rồi trả về bản v2
   * để lưu; KHÔNG ai được gọi `normalizeRubric` trước nó (F10 DEF-1).
   * `@IsObject()` chặn mảng/null/chuỗi ngay tại đây (AC-14.9). */
  @IsObject()
  rubric!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsIn(LOCKABLE_FIELD_PATHS, { each: true })
  locked?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
