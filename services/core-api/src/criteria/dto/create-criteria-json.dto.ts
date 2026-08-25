import { Transform } from 'class-transformer';
import { Allow, IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';

/**
 * Body của `POST /criteria/json` (F12 FR-01, §7.1) — đường LƯU NỘI DUNG chấm điểm do drawer 2 soạn.
 *
 * ⚠ `rubric` cố ý KHÔNG có validator nào ngoài `@Allow()`. Đây không phải sơ suất:
 *   - `assertAuthorableRubric` là CỔNG DUY NHẤT của rubric và nó phải nhận giá trị THÔ. Thêm
 *     `@IsObject()` ở đây sẽ đổi thông điệp 400 của một `rubric` thiếu/`null` từ thông điệp miền
 *     ("rubric must declare at least one dimension") sang thông điệp của DTO — AC-01.10 chốt đúng
 *     điều ngược lại.
 *   - `@Allow()` là thứ giữ cho `whitelist: true` (main.ts) KHÔNG cắt mất thuộc tính không có
 *     decorator. Bỏ nó đi thì `body.rubric` luôn là `undefined` và mọi request đều 400 — một cách
 *     hỏng rất khó nhìn ra.
 *
 * `templateKey` cũng chỉ `@Allow()`: luật của nó (`MACHINE_KEY_PATTERN`, cho phép `null`) nằm ở
 * service để trả về thông điệp VÔ HƯỚNG `invalid template key` giống hệt các thông điệp rubric
 * khác mà F12 front-end đã bám vào (AC-01.8/AC-22.2), thay vì mảng `message: [...]` của
 * ValidationPipe.
 *
 * KHÔNG có `version`: client không bao giờ được đặt số phiên bản (AC-01.5). Nó không được khai ở
 * đây nên `whitelist: true` cắt thẳng — gửi lên cũng không có tác dụng gì.
 */
export class CreateCriteriaJsonDto {
  @IsInt()
  @IsPositive()
  courseId!: number;

  @Allow()
  rubric?: unknown;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 200)
  title?: string;

  @Allow()
  templateKey?: string | null;
}
