import { IsNotEmpty, IsString } from 'class-validator';

/**
 * F11 FR-10 — `zaloUserId` là NGƯỜI GỬI do gateway suy ra từ webhook đã xác thực HMAC, KHÔNG
 * phải dữ liệu học viên tự soạn. Đây là toàn bộ cơ sở phân quyền của endpoint (NFR-01/BR-05).
 */
export class StudentAckDto {
  @IsString()
  @IsNotEmpty()
  zaloUserId!: string;
}
