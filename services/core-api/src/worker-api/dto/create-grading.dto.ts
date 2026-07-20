import { IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateGradingDto {
  @IsInt()
  submissionId!: number;

  @IsInt()
  criteriaId!: number;

  @IsInt()
  criteriaVersion!: number;

  @IsObject()
  scores!: Record<string, unknown>;

  @IsString()
  llmFeedback!: string;

  @IsOptional()
  @IsBoolean()
  autoSent?: boolean;
}
