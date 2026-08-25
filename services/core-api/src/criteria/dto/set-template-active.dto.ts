import { IsBoolean } from 'class-validator';

/** Body của `PATCH /criteria/templates/:key/active`. Bắt buộc và phải là boolean THẬT —
 * chuỗi `"true"` bị trả 400 (AC-17.2). `ValidationPipe({transform:true})` KHÔNG bật
 * `enableImplicitConversion`, nên `@IsBoolean()` giữ đúng ngữ nghĩa nghiêm ngặt đó. */
export class SetTemplateActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
