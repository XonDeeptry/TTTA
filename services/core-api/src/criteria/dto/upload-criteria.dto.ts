import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class UploadCriteriaDto {
  @Type(() => Number)
  @IsInt()
  courseId!: number;
}
