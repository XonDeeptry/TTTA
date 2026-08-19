import { IsEmail, IsIn, IsOptional } from 'class-validator';
import type { DashboardRole } from '../../auth/session.types';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['admin', 'staff'])
  role?: DashboardRole;
}
