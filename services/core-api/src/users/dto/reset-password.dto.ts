import { IsString, MinLength } from 'class-validator';

/**
 * Body cho POST /users/:id/reset-password (F5-ba.md §1.6).
 *
 * KHÔNG có `currentPassword` — đây là chủ ý (BR-4): admin đặt lại mật khẩu hộ người
 * khác thì không thể biết mật khẩu hiện tại của họ. Vì vậy endpoint này là một đường
 * đi riêng, gác bằng @Roles('admin'), tách hẳn với POST /auth/change-password
 * (self-service, chỉ SessionAuthGuard, vẫn bắt buộc currentPassword).
 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
