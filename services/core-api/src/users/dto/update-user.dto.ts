import { IsArray, IsEmail, IsIn, IsOptional } from 'class-validator';
import { DASHBOARD_PRIVILEGES, type DashboardPrivilege } from '../../auth/privileges';
import type { DashboardRole } from '../../auth/session.types';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['admin', 'staff'])
  role?: DashboardRole;

  /**
   * F10 — quyền phụ, THAY THẾ TOÀN BỘ mảng (không merge): gửi `[]` là thu hồi hết.
   * VẮNG MẶT ⇒ cột KHÔNG bị ghi (AC-10.2) — một PATCH chỉ đổi `email` không được âm thầm xóa
   * quyền của người ta. Chuỗi lạ ⇒ 400 (AC-10.4): một lỗi gõ mà "cấp" ra con số không thì tệ hơn
   * nhiều so với một thông báo lỗi.
   */
  @IsOptional()
  @IsArray()
  @IsIn(DASHBOARD_PRIVILEGES as readonly string[], { each: true })
  privileges?: DashboardPrivilege[];
}
