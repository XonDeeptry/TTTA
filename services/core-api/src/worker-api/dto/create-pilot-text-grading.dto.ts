import { IsInt, IsObject, IsString } from 'class-validator';

/** Pilot A/B (nhánh text): worker gửi bản chấm transcript-only song song để đối chiếu — không
 * bao giờ gửi học viên. Quan hệ 1-1 với Submission (submissionId @unique). */
export class CreatePilotTextGradingDto {
  @IsInt()
  submissionId!: number;

  @IsInt()
  criteriaId!: number;

  @IsInt()
  criteriaVersion!: number;

  @IsString()
  transcript!: string;

  @IsObject()
  scores!: Record<string, unknown>;

  @IsString()
  llmFeedback!: string;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;
}
