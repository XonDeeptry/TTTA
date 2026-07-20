import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { SubmissionKind } from '../../contracts';

const KINDS: SubmissionKind[] = ['audio', 'video', 'text', 'image', 'file', 'follow'];
const STATUSES = ['received', 'processing', 'graded', 'awaiting_review', 'sent', 'failed'];

export class CreateSubmissionDto {
  @IsString()
  messageId!: string;

  @IsString()
  zaloUserId!: string;

  @IsOptional()
  @IsInt()
  studentId?: number;

  @IsIn(KINDS)
  kind!: SubmissionKind;

  @IsOptional()
  @IsString()
  mediaUrlZalo?: string;

  @IsOptional()
  @IsString()
  mediaPath?: string;

  @IsOptional()
  @IsInt()
  durationSec?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}
