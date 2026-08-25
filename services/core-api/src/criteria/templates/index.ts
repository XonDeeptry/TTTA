import { CAMBRIDGE_YL_SEED } from './cambridge-yl.seed';
import { IELTS_SPEAKING_SEED } from './ielts-speaking.seed';
import { deepFreeze, type RubricTemplateSeed } from './seed.types';

export type { RubricTemplateSeed } from './seed.types';
export { CAMBRIDGE_YL_SEED } from './cambridge-yl.seed';
export { IELTS_SPEAKING_SEED } from './ielts-speaking.seed';

/**
 * BARREL DUY NHẤT của các mẫu hệ thống (AC-06.6). Seeder và route `reset` chỉ được đi qua đây;
 * không module nào khác import thẳng một file `*.seed.ts` — nhờ vậy thêm mẫu mặc định thứ ba chỉ
 * là thêm một dòng vào mảng này.
 *
 * Thứ tự TẤT ĐỊNH và có ý nghĩa: đây cũng là thứ tự chèn của seeder, nên `id` 1/2 luôn rơi vào
 * đúng hai mẫu này trên một cài đặt mới.
 */
export const RUBRIC_TEMPLATE_SEEDS: readonly RubricTemplateSeed[] = deepFreeze([
  CAMBRIDGE_YL_SEED,
  IELTS_SPEAKING_SEED,
]);

/** Tra định nghĩa gốc theo `key`. `undefined` ⇒ mẫu đó không phải mẫu hệ thống (hoặc đã bị đổi
 * `is_system` bằng tay trong DB) — bên gọi phải xử lý, KHÔNG được ném 500 (AC-18.6). */
export function findSeed(key: string): RubricTemplateSeed | undefined {
  return RUBRIC_TEMPLATE_SEEDS.find((seed) => seed.key === key);
}
