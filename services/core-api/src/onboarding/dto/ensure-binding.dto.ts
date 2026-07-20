import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EnsureBindingDto {
  @IsString()
  @IsNotEmpty()
  zaloUserId!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
