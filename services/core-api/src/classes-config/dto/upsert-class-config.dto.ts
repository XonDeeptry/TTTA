import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertClassConfigDto {
  @IsString()
  @IsNotEmpty()
  advisorZaloId!: string;

  @IsOptional()
  @IsBoolean()
  autoSend?: boolean;

  /**
   * Tiêu chí riêng của lớp ("cấp độ theo lớp"). Ba trạng thái KHÁC NHAU, đừng gộp:
   *   - vắng mặt (undefined) = không đụng tới giá trị đang lưu
   *   - `null`               = GỠ ghim, lớp quay về bản criteria mới nhất của khóa
   *   - số                   = ghim vào đúng criteria đó
   * `@IsOptional()` của class-validator bỏ qua cả `undefined` LẪN `null`, nên `null` đi lọt
   * xuống service — đó chính là điều ta cần để phân biệt "gỡ ghim" với "không nhắc tới".
   */
  @IsOptional()
  @IsInt()
  criteriaId?: number | null;
}
