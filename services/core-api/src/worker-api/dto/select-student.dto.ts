import { IsInt, IsNotEmpty, IsString } from 'class-validator';

/** F11 FR-12 — xem ghi chú phân quyền ở `StudentAckDto`: `zaloUserId` luôn là người gửi đã xác thực. */
export class SelectStudentDto {
  @IsString()
  @IsNotEmpty()
  zaloUserId!: string;

  @IsInt()
  bindingId!: number;
}
