import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const STATUSES = ['received', 'processing', 'graded', 'awaiting_review', 'sent', 'failed'];

export class UpdateSubmissionDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  mediaPath?: string;

  @IsOptional()
  @IsInt()
  durationSec?: number;

  @IsOptional()
  @IsInt()
  studentId?: number;

  @IsOptional()
  @IsDateString()
  audioExtractedAt?: string;
}
