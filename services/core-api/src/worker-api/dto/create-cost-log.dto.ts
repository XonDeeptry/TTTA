import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCostLogDto {
  @IsOptional()
  @IsInt()
  submissionId?: number;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;

  @IsInt()
  inputTokens!: number;

  @IsInt()
  outputTokens!: number;

  @IsNumber()
  estUsd!: number;

  @IsOptional()
  @IsString()
  callType?: string;
}
