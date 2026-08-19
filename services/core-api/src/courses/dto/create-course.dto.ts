import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsOptional()
  @IsString()
  bandDesc?: string;

  /** Ghi vào `llmConfig.provider` — factory.py (grading-worker) mặc định 'gemini' nếu thiếu. */
  @IsOptional()
  @IsIn(['gemini', 'openai'])
  provider?: 'gemini' | 'openai';
}
