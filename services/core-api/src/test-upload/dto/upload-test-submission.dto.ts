import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class UploadTestSubmissionDto {
  @Type(() => Number)
  @IsInt()
  studentId!: number;
}
