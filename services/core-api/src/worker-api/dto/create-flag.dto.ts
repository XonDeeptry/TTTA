import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateFlagDto {
  @IsInt()
  submissionId!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
