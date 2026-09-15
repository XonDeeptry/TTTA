import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Bản giáo viên sửa (ILM-Clone D153). Cả hai trường đều tùy chọn: sửa nhận xét chung, sửa từng
 * tiêu chí, hoặc cả hai. Dùng chung cho `PATCH /gradings/:id` (Lưu) và `POST /gradings/:id/send`
 * (Gửi = lưu bản đang sửa rồi gửi đúng bản đó).
 *
 * `reviewedScores` chỉ `@IsObject()` ở đây — kiểm tra theo rubric (khóa tiêu chí, thang điểm) nằm
 * ở service, nơi có rubric của chính bài chấm.
 */
export class UpdateGradingDto {
  @IsOptional()
  @IsString()
  reviewedFeedback?: string;

  @IsOptional()
  @IsObject()
  reviewedScores?: Record<string, unknown>;
}
