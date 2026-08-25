import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { MACHINE_KEY_PATTERN } from '../rubric-validation';

/** Body của `POST /criteria/templates/:key/duplicate`. `name` vắng ⇒ service tự đặt
 * `"<tên nguồn> (bản sao)"` (AC-15.2). */
export class DuplicateRubricTemplateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(MACHINE_KEY_PATTERN, {
    message: 'key must match ^[a-z0-9][a-z0-9_]{0,63}$ (lowercase, digits, underscore)',
  })
  key!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  name?: string;
}
