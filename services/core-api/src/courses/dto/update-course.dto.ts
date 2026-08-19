import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  bandDesc?: string;

  @IsOptional()
  @IsIn(['gemini', 'openai'])
  provider?: 'gemini' | 'openai';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
