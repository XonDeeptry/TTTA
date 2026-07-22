import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertClassConfigDto {
  @IsString()
  @IsNotEmpty()
  advisorZaloId!: string;

  @IsOptional()
  @IsBoolean()
  autoSend?: boolean;
}
