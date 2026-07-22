import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import type { DashboardRole } from '../../auth/session.types';

/**
 * Body cho POST /users (F5-ba.md §1.5). Cùng phong cách class-validator với LoginDto /
 * ChangePasswordDto: MinLength(8) — KHÔNG thêm chính sách độ phức tạp mới.
 *
 * Cố ý không có trường `mustChangePassword`: cờ này luôn do server đặt = true
 * (NFR-S5). ValidationPipe({ whitelist: true }) ở main.ts loại mọi thuộc tính lạ,
 * nên không thể "mass assign" id/passwordHash/mustChangePassword qua body (NFR-S6).
 */
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'staff'])
  role!: DashboardRole;

  @IsString()
  @MinLength(8)
  password!: string;
}
