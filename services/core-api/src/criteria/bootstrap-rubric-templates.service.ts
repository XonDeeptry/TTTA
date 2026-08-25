import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RUBRIC_TEMPLATE_SEEDS } from './templates';

/**
 * Seed hai mẫu cấu trúc mặc định vào `rubric_templates` — đúng khuôn `BootstrapAdminService`
 * (implements OnApplicationBootstrap, ĐẾM trước, chỉ ghi khi bảng rỗng).
 *
 * "CHỈ KHI BẢNG RỖNG" LÀ ĐIỀU QUAN TRỌNG NHẤT Ở ĐÂY (BR-05, thiết kế mục 4: "Seed chỉ chạy khi
 * bảng rỗng → không bao giờ ghi đè bản đã bị sửa ở lần khởi động sau"). Bản sửa của admin phải
 * sống sót qua MỌI lần khởi động lại, vĩnh viễn. Đường khôi phục là nút "Khôi phục bản gốc"
 * (`POST /criteria/templates/:key/reset`) — một hành động CÓ CHỦ Ý, không phải tác dụng phụ của
 * việc `docker compose restart`.
 *
 * KHÁC `BootstrapAdminService` ở hai điểm, đều có lý do:
 *  1. KHÔNG cần biến môi trường nào (AC-07.7) — mẫu mặc định là một phần của sản phẩm, không phải
 *     credential.
 *  2. Lỗi khi seed KHÔNG được làm sập boot (AC-07.5/NFR-A1). Thiếu tài khoản admin thì không ai
 *     đăng nhập được nên fail-fast là đúng; thiếu mẫu mặc định chỉ làm rỗng một danh sách chọn,
 *     trong khi cả đường chấm bài vẫn chạy. Chặn boot vì lý do đó là tự gây sự cố.
 */
@Injectable()
export class BootstrapRubricTemplatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapRubricTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const count = await this.prisma.rubricTemplate.count();
      // Bảng đã có dữ liệu ⇒ KHÔNG ghi gì, KHÔNG log gì (AC-07.2/07.6). Đúng một query (NFR-P1).
      if (count > 0) return;

      const created = await this.prisma.rubricTemplate.createMany({
        data: RUBRIC_TEMPLATE_SEEDS.map((seed) => ({
          key: seed.key,
          name: seed.name,
          // Sao chép SÂU: seed là singleton đã Object.freeze, và Prisma không được giữ tham chiếu
          // tới nó (một client tương lai lỡ tay chuẩn hóa tại chỗ sẽ hỏng mọi lần reset sau đó).
          rubric: JSON.parse(JSON.stringify(seed.rubric)) as never,
          locked: [...seed.locked],
          isSystem: true,
          isActive: true,
        })),
        // Hai tiến trình core-api khởi động cùng lúc trên một DB: cả hai cùng thấy count = 0,
        // kẻ thua sẽ đụng unique index `key`. `skipDuplicates` biến đụng độ đó thành no-op thay vì
        // một P2002 làm hỏng boot (AC-07.4).
        skipDuplicates: true,
      });

      this.logger.log(`Seeded ${created.count} rubric templates`);
    } catch (err) {
      // Nuốt lỗi CÓ CHỦ Ý — xem chú thích đầu class. Vẫn log ở mức error kèm danh sách key để
      // người vận hành biết chính xác thiếu cái gì.
      const keys = RUBRIC_TEMPLATE_SEEDS.map((seed) => seed.key).join(', ');
      this.logger.error(`Failed to seed rubric templates (${keys}): ${String(err)}`);
    }
  }
}
