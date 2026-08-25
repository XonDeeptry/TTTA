import { BadRequestException } from '@nestjs/common';
import { validateLevels, type LevelIssue } from '../lib/rubric-scoring';
import {
  DEFAULT_SCALE,
  normalizeRubric,
  PRONUNCIATION_DIMENSION,
  type RubricScale,
  type RubricV2,
} from './rubric-schema';

/**
 * CỔNG CHẶN LÚC SOẠN (F10 FR-19). Đây là nơi DUY NHẤT trong core-api từ chối một cấu trúc rubric.
 *
 * Vì sao phải có, khi `normalizeRubric` đã "vá" mọi thứ? Vì normalize cố tình DỄ DÃI (BR-04: đọc
 * rubric cũ không bao giờ được ném lỗi) còn lúc GHI thì phải NGHIÊM. Hai chỗ dễ dãi + nghiêm này
 * bù nhau: dữ liệu lịch sử vẫn đọc/chấm được, nhưng không ai lưu thêm được một cấu trúc mà chắc
 * chắn sẽ hỏng lúc chấm.
 *
 * Hai lỗi nguy hiểm nhất mà nó chặn:
 *  - `scale.max <= 0` — F9-qa OBS-2. `computeTotal` sẽ kẹp mọi điểm về 0, ghi `total = 0` rồi quy
 *    đổi thành "A0 ~ Tiny Rabbit", trong khi báo cáo lại tính ra 18/25. Một câu trả lời SAI mà
 *    TRÔNG RẤT THẬT. Trước F10 hình dạng này không thể tạo ra qua API; ngay khi F12 mở trình soạn
 *    thì nó tạo ra được, nên cổng chặn phải có mặt TRƯỚC.
 *  - `levels` hở/chồng lấn — F9 `validateLevels`, tới F10 mới được nối vào HTTP (F9 giao lại).
 *
 * TÍNH CHẤT: THUẦN (không DB/Redis/I/O), KHÔNG sửa đối số, và chỉ ném đúng MỘT loại ngoại lệ là
 * `BadRequestException` (AC-19.13) — không bao giờ 500, kể cả với `{}`, `null` hay rác lồng sâu:
 * mọi luật đọc dữ liệu qua `normalizeRubric` (vốn không bao giờ ném) hoặc qua `readAuthoredScale`
 * (chỉ đọc, có kiểm kiểu trước).
 *
 * THỨ TỰ BÊN TRONG LÀ MỘT RÀNG BUỘC: các luật về `scale` chạy trên giá trị THÔ, TRƯỚC khi
 * `normalizeRubric` kịp vá — xem `readAuthoredScale`. Hàm tự lo cả hai bước và trả về rubric đã
 * chuẩn hóa, nên bên gọi không thể vô tình đảo thứ tự (DEF-1 của QA fix round 1 chính là hậu quả
 * của việc hai bước đó nằm ở hai nơi).
 */

/** Khóa máy: chữ thường/số/gạch dưới, bắt đầu bằng chữ-số, tối đa 64 ký tự. Dùng chung cho
 * `dimensions[].key` (nó trở thành property name trong JSON Schema gửi cho LLM) và
 * `rubric_templates.key` (nó nằm trong URL). */
export const MACHINE_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{0,63}$/;

/** Tập đóng của `output_fields` (§5.3, thiết kế mục 1.2 ý 4: "Nhận xét" + "Hướng sửa bài"). */
const ALLOWED_OUTPUT_FIELDS: readonly string[] = ['comment', 'fix'];

/** Body 400 cho lỗi bảng cấp độ — `issues` giữ NGUYÊN VĂN message tiếng Việt của F9 để F12 gắn
 * được gợi ý inline ngay cạnh dòng cấp độ sai (AC-19.1). */
export interface InvalidRubricBody {
  message: 'invalid rubric';
  issues: LevelIssue[];
}

function reject(message: string): never {
  throw new BadRequestException(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SCALE_FIELDS = ['min', 'max', 'step'] as const;

/**
 * Đọc thang điểm ĐÚNG NHƯ TÁC GIẢ GÕ, từ rubric THÔ — trước khi `normalizeRubric` kịp vá.
 *
 * ⚠ ĐÂY LÀ TRỌNG TÂM CỦA DEF-1 (QA fix round 1), đừng gỡ bỏ. `normalizeRubric` cố tình DỄ DÃI
 * (BR-04: đọc dữ liệu cũ không bao giờ được ném lỗi) nên nó ÂM THẦM SỬA một số trường:
 * `rubric-schema.ts` ép `step` không dương về `DEFAULT_SCALE.step` (= 1), và ép `min`/`max` không
 * phải số hữu hạn về mặc định. Nếu kiểm tra chạy SAU normalize thì mấy luật đó là code chết —
 * `scale.step: 0` được nhận rồi lưu thành `1`, còn `scale: {min:"a"}` lặng lẽ thành `0`.
 *
 * `scale.max` thì KHÔNG bị ép khi nó đã là số, nên luật AC-19.4 vẫn nổ — chính sự lệch pha đó là
 * thứ QA gọi là "code tự mâu thuẫn với chính nó". Hàm này xoá hẳn lớp lệch pha ấy: cả ba trường
 * đều được đọc thô và kiểm bằng cùng một luật.
 *
 * Trả về thang theo ý tác giả (mặc định điền vào chỗ thiếu), hoặc `null` khi rubric KHÔNG khai báo
 * `scale` — lúc đó thang do normalize suy ra (từ `band_scale` của v1 hoặc mặc định) mới là thang
 * hợp lệ để kiểm.
 */
function readAuthoredScale(input: unknown): RubricScale | null {
  if (!isPlainObject(input)) return null;
  const raw = input.scale;
  // Không khai báo `scale` ⇒ để normalize lo (v1 `band_scale`, hoặc mặc định). Hợp lệ.
  if (raw === undefined) return null;
  if (!isPlainObject(raw)) reject('scale must be an object with numeric min, max and step');

  const authored: RubricScale = { ...DEFAULT_SCALE };
  for (const field of SCALE_FIELDS) {
    const value = raw[field];
    // Thiếu một trường ⇒ dùng mặc định (đúng như normalize). Có mà không phải số hữu hạn ⇒ 400:
    // để normalize nuốt thì tác giả sẽ tưởng mình đã đặt thang mà thực ra không.
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      reject(`scale.${field} must be a finite number`);
    }
    authored[field] = value;
  }
  return authored;
}

/** Ba luật số học của thang điểm (AC-19.4/19.5/19.6), chạy trên thang THEO Ý TÁC GIẢ. */
function assertScale(scale: RubricScale): void {
  // AC-19.4 phải đứng TRƯỚC AC-19.5: với {min:0,max:0} cả hai đều đúng, và thông điệp hữu ích
  // hơn cho người soạn là "max phải > 0".
  if (!(scale.max > 0)) reject('scale.max must be greater than 0');
  if (!(scale.max > scale.min)) reject('scale.max must be greater than scale.min');
  if (!(scale.step > 0)) reject('scale.step must be greater than 0');
}

/**
 * Ném `BadRequestException` (400) nếu rubric không đủ điều kiện để LƯU; nếu hợp lệ thì trả về
 * rubric ĐÃ CHUẨN HÓA, sẵn sàng ghi xuống DB.
 *
 * Hàm này TỰ GỌI `normalizeRubric` — bên gọi KHÔNG được chuẩn hóa trước rồi mới đưa vào. Đó không
 * phải chuyện tiện tay: chuẩn hóa trước sẽ che mất đúng những sai sót mà cổng này sinh ra để bắt
 * (xem `readAuthoredScale`). Gộp hai bước vào một hàm khiến gọi sai TRỞ THÀNH BẤT KHẢ THI, thay vì
 * chỉ được nhắc trong một dòng chú thích như bản trước.
 *
 * F12 dùng lại nguyên hàm này cho `POST /criteria/json`:
 *     const rubric = assertAuthorableRubric(body.rubric);   // ném 400, hoặc trả RubricV2 để lưu
 */
export function assertAuthorableRubric(input: unknown): RubricV2 {
  const authoredScale = readAuthoredScale(input);
  const rubric = normalizeRubric(input);
  assertScale(authoredScale ?? rubric.scale);

  // ─── tiêu chí ──────────────────────────────────────────────────────────────────
  const dimensions = rubric.dimensions;
  if (dimensions.length === 0) reject('rubric must declare at least one dimension');

  const seen = new Set<string>();
  for (const dim of dimensions) {
    if (!MACHINE_KEY_PATTERN.test(dim.key)) {
      reject(`invalid dimension key: ${dim.key} (expected ${MACHINE_KEY_PATTERN.source})`);
    }
    if (seen.has(dim.key)) reject(`duplicate dimension key: ${dim.key}`);
    seen.add(dim.key);
    // 0 được phép (tiêu chí chỉ để nhận xét, không góp điểm); ÂM thì không.
    if (!(dim.weight >= 0)) reject('dimension weight must be >= 0');
  }
  // Kiến trúc mục 3.10 — cùng một luật với cổng upload .docx (F8) và cổng lúc chấm (worker),
  // chỉ bắt sớm hơn một bước để không ai LƯU được cấu trúc chắc chắn hỏng lúc chấm (BR-11).
  if (!seen.has(PRONUNCIATION_DIMENSION)) {
    reject(`rubric must include the "${PRONUNCIATION_DIMENSION}" dimension`);
  }

  // ─── đầu ra ────────────────────────────────────────────────────────────────────
  const outputFields = rubric.output_fields;
  if (outputFields.length === 0) reject('output_fields must not be empty');
  const seenFields = new Set<string>();
  for (const field of outputFields) {
    if (!ALLOWED_OUTPUT_FIELDS.includes(field)) {
      reject(`invalid output field: ${field} (allowed: ${ALLOWED_OUTPUT_FIELDS.join(', ')})`);
    }
    if (seenFields.has(field)) reject(`duplicate output field: ${field}`);
    seenFields.add(field);
  }

  // ─── bảng quy đổi cấp độ (F9 validateLevels, tới đây mới được nối vào HTTP) ─────
  const issues = validateLevels(rubric);
  if (issues.length > 0) {
    const body: InvalidRubricBody = { message: 'invalid rubric', issues };
    throw new BadRequestException(body);
  }

  return rubric;
}
