import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { DASHBOARD_PRIVILEGES, type DashboardPrivilege } from '../../auth/privileges';
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

  /**
   * F10 — quyền phụ. VẮNG MẶT ⇒ `[]` (AC-10.6/AC-03.6): backfill của migration là chuyện MỘT LẦN
   * cho dữ liệu cũ, KHÔNG phải giá trị mặc định mới. Tài khoản tạo sau F10 khởi đầu rỗng và admin
   * tick checkbox để cấp.
   */
  @IsOptional()
  @IsArray()
  @IsIn(DASHBOARD_PRIVILEGES as readonly string[], { each: true })
  privileges?: DashboardPrivilege[];
}
