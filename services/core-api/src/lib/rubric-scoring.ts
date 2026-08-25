/**
 * Tính ĐIỂM TỔNG + quy đổi CẤP ĐỘ từ rubric v2 (F9, thiết kế `Idea/20260819-ChamDiemRubricV2.md` Phần 5).
 *
 * MODULE THUẦN — không @nestjs/*, không Prisma, không Redis, không fs, không I/O (AC-01.1).
 * Ngoại lệ duy nhất về import: hằng `DEFAULT_SCALE` được lấy lại từ `criteria/rubric-schema.ts`
 * thay vì chép số 3 vào đây — F8 BR-06 quy định toàn repo chỉ có MỘT giá trị fallback cho thang
 * điểm; `rubric-schema.ts` bản thân nó là module không import gì cả nên vẫn không kéo theo I/O.
 *
 * BA ĐIỀU BẤT DI BẤT DỊCH:
 *  1. `computeTotal` KHÔNG BAO GIỜ ném lỗi (AC-01.2). Nó chạy trên đường ghi grading — một
 *     exception ở đây biến rubric xấu thành vòng lặp retry→DLQ của RabbitMQ.
 *  2. `computeTotal` KHÔNG tự gọi `normalizeRubric` (BR-12). Người gọi chuẩn hóa một lần rồi
 *     truyền vào, nhờ vậy hàm này thuần, rẻ, và không có điểm rẽ nhánh version thứ hai.
 *  3. `counted === 0` ⇒ người gọi PHẢI ghi NULL, không được ghi 0 (BR-05). "Không có điểm dùng
 *     được" mà hiện thành "0 điểm ~ Tiny Rabbit" là một câu trả lời sai TRÔNG RẤT THẬT.
 *
 * `validateLevels` xuất ra như một THƯ VIỆN trong F9 nhưng chưa được nối vào route nào — F10 sở
 * hữu `POST /criteria/json` + các route template, đó mới là chỗ trả 400 (FR-06).
 */
import {
  DEFAULT_SCALE,
  type AggregationMethod,
  type RoundingMode,
  type RubricLevel,
  type RubricV2,
} from '../criteria/rubric-schema';

export interface ComputeTotalResult {
  /** Hữu hạn. `0` khi `counted === 0`. */
  total: number;
  /** Tổng tối đa đạt được của rubric này. `0` khi không xác định được. */
  max: number;
  level: RubricLevel | null;
  /** Bao nhiêu dimension hữu hiệu có điểm dùng được. `0` là TÍN HIỆU "không có điểm". */
  counted: number;
  /** Khóa dimension không có điểm dùng được, theo thứ tự rubric. */
  missing: string[];
  /** Khóa trong `scores` không phải dimension hữu hiệu (thừa + trùng lặp). */
  ignored: string[];
  /** Khóa có điểm nằm ngoài `[scale.min, scale.max]` và đã bị kẹp (BR-10). */
  clamped: string[];
}

export type LevelIssueCode =
  | 'level_invalid'
  | 'level_overlap'
  | 'level_gap'
  | 'level_coverage_start'
  | 'level_coverage_end';

export interface LevelIssue {
  code: LevelIssueCode;
  index: number;
  message: string;
}

type UnknownRecord = Record<string, unknown>;

const AGGREGATION_METHODS: readonly string[] = ['sum', 'average', 'weighted_average'];

// ─── tiện ích thuần ────────────────────────────────────────────────────────────────

/** Object "thường" — mảng và null KHÔNG tính (khớp `isPlainObject` của `rubric-schema.ts`). */
function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Đọc thuộc tính SỞ HỮU RIÊNG, không bao giờ đi lên prototype chain (AC-05.9). `scores` do LLM
 * sinh ra: nếu nó chứa khóa `__proto__`/`constructor` thì `obj[key]` thường sẽ trả về
 * `Object.prototype` / hàm khởi tạo chứ không phải dữ liệu. Ta chỉ ĐỌC nên không thể làm bẩn
 * `Object.prototype`, nhưng đọc nhầm cũng đủ sai số.
 */
function ownGet(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as UnknownRecord)[key] : undefined;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Chốt chặn cuối: mọi số trả ra ngoài đều hữu hạn (AC-01.5) — NaN/±Infinity ⇒ 0. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

// ─── đọc rubric (chịu được rubric hỏng cấu trúc) ───────────────────────────────────

interface EffectiveScale {
  min: number;
  max: number;
  /** `min > max` ⇒ biên KHÔNG dùng được: không kẹp gì cả (AC-05.6). Tự ý đảo ngược sai sót của
   * người soạn còn tệ hơn là không kẹp. */
  usable: boolean;
}

function effectiveScale(rubric: RubricV2): EffectiveScale {
  const raw = ownGet(rubric, 'scale');
  const min = asFiniteNumber(ownGet(raw, 'min')) ?? DEFAULT_SCALE.min;
  const max = asFiniteNumber(ownGet(raw, 'max')) ?? DEFAULT_SCALE.max;
  return { min, max, usable: min <= max };
}

function readMethod(rubric: RubricV2): AggregationMethod {
  const method = ownGet(ownGet(rubric, 'aggregation'), 'method');
  // AC-02.10: method lạ ⇒ coi như `average`, không bao giờ ném lỗi.
  return typeof method === 'string' && AGGREGATION_METHODS.includes(method)
    ? (method as AggregationMethod)
    : 'average';
}

function readRound(rubric: RubricV2): RoundingMode {
  // AC-03.5: giá trị lạ ⇒ `none`.
  return ownGet(ownGet(rubric, 'aggregation'), 'round') === 'nearest_int' ? 'nearest_int' : 'none';
}

function readLevels(rubric: RubricV2): RubricLevel[] {
  const levels = ownGet(rubric, 'levels');
  return Array.isArray(levels) ? (levels as RubricLevel[]) : [];
}

interface EffectiveDim {
  key: string;
  weight: number;
}

/** AC-05.7: weight không hữu hạn ⇒ 1 (mặc định của F8); weight âm ⇒ 0. */
function readWeight(raw: unknown): number {
  const weight = asFiniteNumber(raw);
  if (weight === null) return 1;
  return weight < 0 ? 0 : weight;
}

/**
 * Danh sách dimension khai báo trong rubric, đã lọc rác (AC-05.4) và khử trùng khóa
 * (AC-05.5 — phần tử ĐẦU thắng, các bản sau bị loại và ghi vào `ignored`).
 */
function rubricDimensions(rubric: RubricV2): { dims: EffectiveDim[]; duplicates: string[] } {
  const list = ownGet(rubric, 'dimensions');
  if (!Array.isArray(list)) return { dims: [], duplicates: [] };

  const dims: EffectiveDim[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!isPlainObject(entry)) continue;
    const key = ownGet(entry, 'key');
    if (typeof key !== 'string' || key.length === 0) continue;
    if (seen.has(key)) {
      if (!duplicates.includes(key)) duplicates.push(key);
      continue;
    }
    seen.add(key);
    dims.push({ key, weight: readWeight(ownGet(entry, 'weight')) });
  }
  return { dims, duplicates };
}

/**
 * AC-02.1: `scores[key].score` khi phần tử là object có `score` là SỐ HỮU HẠN; nếu không thì
 * chính `scores[key]` khi nó là số. Mọi thứ khác (chuỗi "5", null, true, NaN, Infinity, thiếu
 * khóa) đều coi là VẮNG MẶT — tuyệt đối không ép kiểu (AC-05.3).
 */
function readScore(bag: UnknownRecord | null, key: string): number | null {
  if (bag === null) return null;
  const entry = ownGet(bag, key);
  if (typeof entry === 'object' && entry !== null) return asFiniteNumber(ownGet(entry, 'score'));
  return asFiniteNumber(entry);
}

// ─── điểm vào ──────────────────────────────────────────────────────────────────────

/**
 * Tổng điểm + cấp độ của MỘT lần chấm.
 *
 * `rubric` phải là RubricV2 đã `normalizeRubric` (BR-12) nhưng hàm vẫn chịu được rubric hỏng.
 * `scores` là JSON tùy ý lấy thẳng từ `Grading.scores`.
 *
 * Tất định tuyệt đối: cộng dồn theo ĐÚNG thứ tự dimension hữu hiệu ⇒ chạy lại sau này ra đúng
 * từng bit con số đã lưu (AC-01.4). Chính tính chất này khiến quyết định "báo cáo tính lại từ
 * `scores`" ở FR-12 là an toàn.
 */
export function computeTotal(rubric: RubricV2, scores: unknown): ComputeTotalResult {
  const bag: UnknownRecord | null = isPlainObject(scores) ? scores : null;
  const scoreKeys = bag ? Object.keys(bag) : [];

  const scale = effectiveScale(rubric);
  const method = readMethod(rubric);
  const round = readRound(rubric);
  const { dims, duplicates } = rubricDimensions(rubric);

  /**
   * AC-02.7 — ĐƯỜNG DI SẢN. Rubric không khai báo dimension nào thì nó không thể ràng buộc được
   * tập điểm; khi đó dimension hữu hiệu chính là các khóa của `scores` cho ra số dùng được, mỗi
   * khóa weight = 1. Mọi rubric v1 cũ (`{band_scale:[0,3]}`) đều đúng hình dạng này — thiếu nhánh
   * này thì bản vá `weight` sẽ âm thầm làm NULL toàn bộ dòng báo cáo lịch sử.
   */
  const effective: EffectiveDim[] =
    dims.length > 0
      ? dims
      : scoreKeys.filter((key) => readScore(bag, key) !== null).map((key) => ({ key, weight: 1 }));

  const effectiveKeys = new Set(effective.map((d) => d.key));
  const ignored: string[] = [];
  for (const key of scoreKeys) if (!effectiveKeys.has(key)) ignored.push(key);
  for (const key of duplicates) if (!ignored.includes(key)) ignored.push(key);

  const missing: string[] = [];
  const clamped: string[] = [];
  let counted = 0;
  let plainSum = 0;
  let weightedSum = 0;
  let weightSum = 0;

  for (const dim of effective) {
    const raw = readScore(bag, dim.key);
    if (raw === null) {
      missing.push(dim.key);
      continue;
    }
    let value = raw;
    if (scale.usable && (value < scale.min || value > scale.max)) {
      value = value < scale.min ? scale.min : scale.max; // BR-10 ⇒ đảm bảo total ≤ max ⇒ % ≤ 100
      clamped.push(dim.key);
    }
    counted += 1;
    plainSum += value;
    weightedSum += value * dim.weight;
    weightSum += dim.weight;
  }

  // `max` phụ thuộc RUBRIC, không phụ thuộc bài chấm: thiếu một dimension thì mẫu số KHÔNG co lại
  // (AC-07.5). Không có dimension hữu hiệu nào ⇒ 0 (AC-05.8).
  const max =
    effective.length === 0 ? 0 : method === 'sum' ? effective.length * scale.max : scale.max;

  let total = 0;
  if (counted > 0) {
    if (method === 'sum') {
      total = plainSum; // AC-02.3: `sum` KHÔNG áp weight (BR-03) — đúng "tổng tối đa = 25" của PDF
    } else if (method === 'weighted_average') {
      // AC-02.6: Σw = 0 ⇒ lùi về trung bình không trọng số, tuyệt đối không sinh NaN.
      total = weightSum > 0 ? weightedSum / weightSum : plainSum / counted;
    } else {
      total = plainSum / counted; // AC-02.4 — đây là số học giữ nguyên kết quả báo cáo cũ (BR-14)
    }
  }
  total = finite(total);
  if (round === 'nearest_int') total = finite(Math.round(total)); // AC-03.2, TRƯỚC khi dò cấp độ

  // AC-04.5: không có điểm nào dùng được thì KHÔNG dò cấp độ.
  const level = counted > 0 ? findLevel(readLevels(rubric), total) : null;

  return { total, max: finite(max), level, counted, missing, ignored, clamped };
}

/**
 * Tổng tối đa suy ra từ RIÊNG rubric. Bằng `computeTotal(rubric, …).max` mọi lúc khi
 * `dimensions` khác rỗng; `dimensions` rỗng thì trả 0 (đường di sản AC-02.7 cần `scores` mới
 * biết được số dimension, nên hai giá trị có thể khác nhau — AC-01.7).
 */
export function maxTotal(rubric: RubricV2): number {
  const { dims } = rubricDimensions(rubric);
  if (dims.length === 0) return 0;
  const scale = effectiveScale(rubric);
  return finite(readMethod(rubric) === 'sum' ? dims.length * scale.max : scale.max);
}

/**
 * Dò cấp độ: phần tử ĐẦU TIÊN theo thứ tự mảng thỏa `min <= total <= max` (HAI ĐẦU ĐỀU ĐÓNG,
 * BR-08). "Phần tử đầu thắng" khiến một bảng chồng lấn vẫn tất định thay vì ném lỗi (AC-04.1).
 * Không có khoảng nào chứa `total` ⇒ null; KHÔNG bắt về cấp gần nhất (AC-04.3).
 */
export function findLevel(levels: RubricLevel[], total: number): RubricLevel | null {
  if (!Array.isArray(levels)) return null;
  for (const level of levels) {
    const min = asFiniteNumber(ownGet(level, 'min'));
    const max = asFiniteNumber(ownGet(level, 'max'));
    if (min === null || max === null) continue; // AC-04.4
    if (total >= min && total <= max) return level;
  }
  return null;
}

// ─── validateLevels (thư viện; F10 mới nối vào HTTP) ───────────────────────────────

/**
 * Độ hạt (granularity) của tổng điểm: `nearest_int` ⇒ 1; `sum` ⇒ `scale.step`; còn lại ⇒ 0
 * (liên tục). Dùng để phân biệt "0–10 rồi 11–15" (liền mạch) với "0–10 rồi 12–15" (hở).
 */
function granularity(rubric: RubricV2): number {
  if (readRound(rubric) === 'nearest_int') return 1;
  if (readMethod(rubric) !== 'sum') return 0;
  const step = asFiniteNumber(ownGet(ownGet(rubric, 'scale'), 'step'));
  return step !== null && step > 0 ? step : DEFAULT_SCALE.step;
}

function minPossibleTotal(rubric: RubricV2): number {
  const scale = effectiveScale(rubric);
  if (readMethod(rubric) !== 'sum') return finite(scale.min);
  const { dims } = rubricDimensions(rubric);
  return finite(dims.length * scale.min);
}

/**
 * Kiểm tra bảng quy đổi cấp độ: sai định dạng / chồng lấn / hở khoảng / phủ thiếu hai đầu.
 * KHÔNG BAO GIỜ ném lỗi (AC-06.8). `message` viết bằng tiếng Việt và nêu đúng con số vi phạm —
 * nó sẽ đi thẳng vào body 400 của F10 và gợi ý inline của F12.
 *
 * Lưu ý thiết kế: một mục sai `code`/`label` VẪN tham gia vòng kiểm thứ tự nếu `min`/`max` của
 * nó dùng được. Loại nó ra sẽ đẻ thêm một `level_gap` giả ngay tại chỗ trống nó để lại.
 */
export function validateLevels(rubric: RubricV2): LevelIssue[] {
  const levels = readLevels(rubric);
  if (levels.length === 0) return []; // AC-06.1: bảng rỗng là hợp lệ (IELTS không quy đổi cấp độ)

  const issues: LevelIssue[] = [];
  const orderable: { min: number; max: number }[] = [];

  levels.forEach((entry, index) => {
    const min = asFiniteNumber(ownGet(entry, 'min'));
    const max = asFiniteNumber(ownGet(entry, 'max'));
    const code = ownGet(entry, 'code');
    const label = ownGet(entry, 'label');

    const problems: string[] = [];
    if (min === null) problems.push('`min` không phải số hữu hạn');
    if (max === null) problems.push('`max` không phải số hữu hạn');
    if (min !== null && max !== null && min > max) problems.push(`khoảng ngược (min ${min} > max ${max})`);
    if (typeof code !== 'string' || code.trim().length === 0) problems.push('`code` rỗng');
    if (typeof label !== 'string' || label.trim().length === 0) problems.push('`label` rỗng');

    // AC-06.2: MỘT issue cho mỗi mục hỏng, gộp hết lý do vào `message`.
    if (problems.length > 0) {
      issues.push({
        code: 'level_invalid',
        index,
        message: `Cấp độ #${index + 1} không hợp lệ: ${problems.join('; ')}.`,
      });
    }
    if (min !== null && max !== null && min <= max) orderable.push({ min, max });
  });

  if (orderable.length === 0) return issues;

  const sorted = [...orderable].sort((a, b) => a.min - b.min);
  const step = granularity(rubric);

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const overlaps = step === 0 ? cur.min < prev.max : cur.min <= prev.max;
    if (overlaps) {
      issues.push({
        code: 'level_overlap',
        index: i,
        message: `Hai cấp độ chồng lấn: khoảng trước kết thúc ở ${prev.max} nhưng khoảng sau bắt đầu ở ${cur.min}.`,
      });
    } else if (cur.min > prev.max + step) {
      issues.push({
        code: 'level_gap',
        index: i,
        message: `Hở khoảng giữa ${prev.max} và ${cur.min}: tổng điểm rơi vào đó không quy đổi được cấp độ nào.`,
      });
    }
  }

  const minPossible = minPossibleTotal(rubric);
  if (sorted[0].min > minPossible) {
    issues.push({
      code: 'level_coverage_start',
      index: 0,
      message: `Bảng cấp độ bắt đầu ở ${sorted[0].min} nhưng tổng điểm nhỏ nhất có thể là ${minPossible}.`,
    });
  }

  const maxPossible = maxTotal(rubric);
  const last = sorted[sorted.length - 1];
  if (last.max < maxPossible) {
    issues.push({
      code: 'level_coverage_end',
      index: sorted.length - 1,
      message: `Bảng cấp độ kết thúc ở ${last.max} nhưng tổng điểm lớn nhất có thể là ${maxPossible}.`,
    });
  }

  return issues;
}
