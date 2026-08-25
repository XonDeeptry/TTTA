/**
 * Rubric schema v2 + shim nâng v1 → v2 (F8, thiết kế `Idea/20260819-ChamDiemRubricV2.md` Phần 3).
 *
 * MODULE THUẦN — không import @nestjs/*, Prisma, Redis, fs hay bất cứ I/O nào (AC-01.1).
 * `normalizeRubric()` chạy TRONG BỘ NHỚ lúc ĐỌC: dữ liệu đã lưu trong `criteria.rubric`
 * KHÔNG BAO GIỜ bị ghi đè (BR-01, FR-16) — rubric v1 cũ ở lại v1 trên đĩa vĩnh viễn.
 *
 * ⚠ BẢN SONG SINH: logic dưới đây được nhân đôi sang Python tại
 *   `services/grading-worker/src/grading_worker/grading/rubric_schema.py`
 * (repo không có cơ chế package dùng chung giữa TS và Python — xem tiền lệ `contracts.ts`
 * bị nhân ba). Hai bản PHẢI giống hệt nhau; lưới đỡ chống trôi là fixture dùng chung
 * `__fixtures__/rubric-normalize.fixtures.json` + hai bộ test chạy trên cùng fixture đó.
 * Sửa file này thì PHẢI sửa file Python trong cùng một commit.
 */

export type AggregationMethod = 'sum' | 'average' | 'weighted_average';
export type RoundingMode = 'none' | 'nearest_int';
export type OutputField = 'comment' | 'fix';

export interface RubricScale {
  min: number;
  max: number;
  step: number;
}

export interface RubricAggregation {
  method: AggregationMethod;
  round: RoundingMode;
}

export interface RubricLevel {
  min: number;
  max: number;
  code: string;
  label: string;
}

export interface RubricSubFactor {
  label: string;
  by_band: Record<string, string>;
}

export interface RubricDimensionV2 {
  /** khóa máy, ổn định — dùng làm property name trong JSON Schema đầu ra của LLM */
  key: string;
  /** nhãn giáo viên thấy */
  label: string;
  weight: number;
  /** band -> danh sách gạch đầu dòng (v1 chỉ có một chuỗi ⇒ mảng một phần tử) */
  bands: Record<string, string[]>;
  /** luôn có mặt; [] nếu không dùng */
  sub_factors: RubricSubFactor[];
}

export interface CommentBankEntry {
  /** null = dùng chung mọi tiêu chí */
  dimension: string | null;
  /** "khen" | "góp ý" | ... (chuỗi tự do); null = không phân loại */
  intent: string | null;
  text: string;
}

export interface StudentReplyButton {
  title: string;
  action: string;
}

export interface StudentReply {
  show_total: boolean;
  show_level: boolean;
  template: string;
  buttons: StudentReplyButton[];
}

export interface RubricV2 {
  schema_version: number;
  course_key: string;
  task_type: string;
  tone: string;
  feedback_language: string;
  scale: RubricScale;
  aggregation: RubricAggregation;
  /** luôn có mặt; [] = không quy đổi cấp độ. F8 KHÔNG kiểm tra phủ/chồng lấn (việc của F9). */
  levels: RubricLevel[];
  output_fields: OutputField[];
  dimensions: RubricDimensionV2[];
  /** luôn có mặt; [] nếu trống */
  comment_bank: CommentBankEntry[];
  /** null nếu khóa không định nghĩa; F11 mới dùng tới */
  student_reply: StudentReply | null;
}

/** Dimension bắt buộc (mục 3.10) — hai cổng chặn (upload + lúc chấm) đều dựa vào hằng này. */
export const PRONUNCIATION_DIMENSION = 'pronunciation';

/** Thang mặc định DUY NHẤT toàn repo (BR-06): khớp docx-parser `0-3`, schema.py `[0,3]`,
 * reports.service.ts `DEFAULT_BAND_MAX = 3`. Không ai được bịa fallback khác. */
export const DEFAULT_SCALE: RubricScale = { min: 0, max: 3, step: 1 };
const DEFAULT_TASK_TYPE = 'speaking_clip';
const DEFAULT_TONE = 'khích lệ';
const DEFAULT_FEEDBACK_LANGUAGE = 'vi';

const AGGREGATION_METHODS: readonly string[] = ['sum', 'average', 'weighted_average'];
const ROUNDING_MODES: readonly string[] = ['none', 'nearest_int'];

// ─── tiện ích thuần ────────────────────────────────────────────────────────────────

/** Object "thường" — mảng và null KHÔNG tính (AC-05.1: normalize([]) ⇒ toàn mặc định). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Ép mọi giá trị về chuỗi theo đúng ngữ nghĩa `String()` của JS — bản Python phải bắt chước
 * y hệt (true→"true", null→"null", 3.0→"3"), nếu không hai bản sẽ lệch nhau. */
function toText(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return String(value);
}

/** Sao chép sâu một giá trị JSON (không giữ tham chiếu tới input ⇒ caller sửa kết quả cũng
 * không đụng vào rubric gốc). Chỉ dùng cho `levels` và `student_reply` — hai trường được
 * chép NGUYÊN VẸN (AC-05.4, §1.3) chứ không lọc khóa. */
function deepCopyJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepCopyJson(v)) as unknown as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepCopyJson(v);
    return out as unknown as T;
  }
  return value;
}

// ─── các bước chuẩn hóa từng trường ────────────────────────────────────────────────

/** `scale` v2 trước, rồi `band_scale` v1, cuối cùng là mặc định {0,3,1} (AC-03.1/03.2/04.3). */
function normalizeScale(raw: Record<string, unknown>): RubricScale {
  const scale = raw.scale;
  if (isPlainObject(scale)) {
    const step = asFiniteNumber(scale.step);
    return {
      min: asFiniteNumber(scale.min) ?? DEFAULT_SCALE.min,
      max: asFiniteNumber(scale.max) ?? DEFAULT_SCALE.max,
      step: step !== null && step > 0 ? step : DEFAULT_SCALE.step,
    };
  }
  const bandScale = raw.band_scale;
  if (Array.isArray(bandScale) && bandScale.length >= 2) {
    const min = asFiniteNumber(bandScale[0]);
    const max = asFiniteNumber(bandScale[1]);
    if (min !== null && max !== null) return { min, max, step: 1 };
  }
  return { ...DEFAULT_SCALE };
}

/** v1 không có `aggregation` ⇒ "average" — đúng bằng số học báo cáo hiện tại (BR-03). */
function normalizeAggregation(raw: Record<string, unknown>): RubricAggregation {
  const agg = isPlainObject(raw.aggregation) ? raw.aggregation : {};
  const method = asString(agg.method);
  const round = asString(agg.round);
  return {
    method: (method !== null && AGGREGATION_METHODS.includes(method) ? method : 'average') as AggregationMethod,
    round: (round !== null && ROUNDING_MODES.includes(round) ? round : 'none') as RoundingMode,
  };
}

/** Chép nguyên các phần tử là object; bỏ phần tử không phải object. KHÔNG kiểm tra khoảng
 * (hở/chồng lấn) — đó là việc của F9 (AC-05.4). */
function normalizeLevels(raw: Record<string, unknown>): RubricLevel[] {
  if (!Array.isArray(raw.levels)) return [];
  return raw.levels.filter(isPlainObject).map((lv) => deepCopyJson(lv) as unknown as RubricLevel);
}

/** Có mặt (kể cả []) thì giữ nguyên; vắng mặt mới điền ["comment"] (AC-04.2). Giá trị lạ vẫn
 * nằm trong mảng nhưng FR-09 bỏ qua. */
function normalizeOutputFields(raw: Record<string, unknown>): OutputField[] {
  if (!Array.isArray(raw.output_fields)) return ['comment'];
  return raw.output_fields.map((f) => toText(f)) as OutputField[];
}

/** Một giá trị band → mảng gạch đầu dòng. Hàm này CHỈ nhìn KIỂU của giá trị, không nhìn
 * version ⇒ mảng sẵn có không bao giờ bị bọc thêm một lớp nữa (AC-04.1, AC-15.8 ca 10). */
function normalizeBandValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => toText(v).trim()).filter((v) => v.length > 0);
  }
  const text = toText(value).trim();
  return text.length > 0 ? [text] : [];
}

function normalizeBands(value: unknown): Record<string, string[]> {
  if (!isPlainObject(value)) return {};
  const bands: Record<string, string[]> = {};
  for (const [band, desc] of Object.entries(value)) bands[band] = normalizeBandValue(desc);
  return bands;
}

function normalizeSubFactors(value: unknown): RubricSubFactor[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((sf) => {
    const byBand: Record<string, string> = {};
    if (isPlainObject(sf.by_band)) {
      for (const [band, desc] of Object.entries(sf.by_band)) byBand[band] = toText(desc);
    }
    return { label: asString(sf.label) ?? '', by_band: byBand };
  });
}

/**
 * v1: `name` → `key` VÀ `label` (cùng giá trị, NGUYÊN VĂN, không đổi hoa/thường — BR-07:
 * rubric hôm qua chấm ra khóa nào thì hôm nay vẫn ra đúng khóa đó).
 * v2: ưu tiên `key`, thiếu thì mượn `label`, thiếu nữa mới mượn `name` (AC-04.3/04.4).
 * Việc hạ chữ thường CHỈ xảy ra lúc bóc .docx mới (BR-08), không xảy ra ở đây.
 */
function normalizeDimension(raw: Record<string, unknown>, isV2: boolean): RubricDimensionV2 {
  const name = asString(raw.name);
  const rawKey = asString(raw.key);
  const rawLabel = asString(raw.label);

  const key = (isV2 ? (rawKey ?? rawLabel ?? name) : (name ?? rawKey ?? rawLabel)) ?? '';
  const label = (isV2 ? (rawLabel ?? name) : (name ?? rawLabel)) ?? key;

  return {
    key,
    label,
    weight: asFiniteNumber(raw.weight) ?? 1,
    bands: normalizeBands(raw.bands),
    sub_factors: normalizeSubFactors(raw.sub_factors),
  };
}

function normalizeDimensions(raw: Record<string, unknown>, isV2: boolean): RubricDimensionV2[] {
  if (!Array.isArray(raw.dimensions)) return [];
  return raw.dimensions.filter(isPlainObject).map((d) => normalizeDimension(d, isV2));
}

/** `comment_bank` có sẵn thì dùng; không thì dựng từ `few_shot_examples` của v1 (AC-03.7,
 * AC-04.3) — nội dung giáo viên đã soạn KHÔNG được mất khi nâng version. */
function normalizeCommentBank(raw: Record<string, unknown>): CommentBankEntry[] {
  if (Array.isArray(raw.comment_bank)) {
    const entries: CommentBankEntry[] = [];
    for (const item of raw.comment_bank) {
      if (!isPlainObject(item)) continue;
      const text = toText(item.text ?? '').trim();
      if (!text) continue;
      entries.push({ dimension: asString(item.dimension), intent: asString(item.intent), text });
    }
    return entries;
  }
  if (Array.isArray(raw.few_shot_examples)) {
    const entries: CommentBankEntry[] = [];
    for (const example of raw.few_shot_examples) {
      const text = toText(example).trim();
      if (!text) continue;
      entries.push({ dimension: null, intent: null, text });
    }
    return entries;
  }
  return [];
}

function normalizeStudentReply(raw: Record<string, unknown>): StudentReply | null {
  return isPlainObject(raw.student_reply) ? (deepCopyJson(raw.student_reply) as unknown as StudentReply) : null;
}

// ─── điểm vào ──────────────────────────────────────────────────────────────────────

/**
 * Nâng bất kỳ rubric nào (v1, v2, hay rác) về đúng shape v2.
 *
 * - KHÔNG BAO GIỜ ném lỗi: giá trị sai/thiếu được VÁ bằng mặc định, không bị từ chối (BR-04).
 *   Hai điểm từ chối duy nhất trong vòng đời rubric vẫn nằm nguyên chỗ cũ: cổng upload
 *   (docx-parser) và cổng lúc chấm (grading-worker `schema.py`).
 * - KHÔNG sửa đối số đầu vào (AC-01.3).
 * - Đầu ra là DANH SÁCH TRẮNG đúng 12 khóa top-level (BR-05) ⇒ khóa lạ bị loại, nhờ vậy so
 *   sánh bằng nhau tuyệt đối giữa TS và Python mới khả thi.
 * - PHÂN NHÁNH MỘT LẦN duy nhất theo `schema_version` (BR-02), không phân nhánh theo từng
 *   trường — và các hàm con lại chỉ nhìn KIỂU giá trị ⇒ idempotent (AC-04.6).
 */
export function normalizeRubric(input: unknown): RubricV2 {
  const raw: Record<string, unknown> = isPlainObject(input) ? input : {};

  const version = asFiniteNumber(raw.schema_version);
  const isV2 = version !== null && version >= 2;

  return {
    schema_version: isV2 ? version : 2,
    course_key: asString(raw.course_key) ?? '',
    task_type: asString(raw.task_type) ?? DEFAULT_TASK_TYPE,
    tone: asString(raw.tone) ?? DEFAULT_TONE,
    feedback_language: asString(raw.feedback_language) ?? DEFAULT_FEEDBACK_LANGUAGE,
    scale: normalizeScale(raw),
    aggregation: normalizeAggregation(raw),
    levels: normalizeLevels(raw),
    output_fields: normalizeOutputFields(raw),
    dimensions: normalizeDimensions(raw, isV2),
    comment_bank: normalizeCommentBank(raw),
    student_reply: normalizeStudentReply(raw),
  };
}
