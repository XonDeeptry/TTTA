import type { RubricV2 } from '../rubric-schema';

/**
 * Định nghĩa GỐC của một mẫu hệ thống, nằm trong code (thiết kế mục 4: "Định nghĩa gốc vẫn nằm
 * trong code (`criteria/templates/*.seed.ts`) → nút Khôi phục bản gốc").
 *
 * Đây KHÔNG phải shape trả về của API — hàng trong `rubric_templates` mới là nguồn sự thật lúc
 * chạy. Seed chỉ được đọc ở đúng hai chỗ: `BootstrapRubricTemplatesService` (khi bảng rỗng) và
 * `POST /criteria/templates/:key/reset`.
 *
 * `isSystem` KHÔNG có ở đây: mọi seed đều là mẫu hệ thống, giá trị `true` do seeder đặt (BR-04 —
 * seeder là bên GHI DUY NHẤT của cột đó).
 */
export interface RubricTemplateSeed {
  /** khóa ổn định, bất biến — trùng với `rubric_templates.key` */
  key: string;
  /** tên giáo viên thấy */
  name: string;
  /** rubric v2, PHẢI là điểm bất động của `normalizeRubric` (AC-06.1) */
  rubric: RubricV2;
  /** đường dẫn trường mà người soạn NỘI DUNG không được sửa (§5.4) */
  locked: string[];
}

/**
 * Đóng băng SÂU một giá trị. Seed là singleton dùng chung cho cả seeder, route reset lẫn test —
 * một lần lỡ tay `seed.rubric.scale.max = 9` ở bất kỳ đâu sẽ làm hỏng mọi lần reset sau đó trong
 * cùng tiến trình. `Object.freeze` biến tai nạn đó thành no-op (hoặc TypeError ở strict mode)
 * ngay tại dòng gây lỗi (AC-06.5).
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
