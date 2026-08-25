/**
 * Rubric v2 client-side types + pure helpers (F12 FR-07).
 *
 * ⚠ SOURCE OF TRUTH: `services/core-api/src/criteria/rubric-schema.ts` (types) and
 * `services/core-api/src/lib/rubric-scoring.ts` (`maxTotal`/`validateLevels`). This module is a
 * PORT, not an independent re-derivation — `maxTotal` and `levelIssues` below must keep the same
 * ordering pass / same inputs (`aggregation.round`, `scale.step`) / same inclusive bounds / same
 * five issue codes as the server. A divergence between this port and the server is a DEFECT
 * (F9 said so explicitly), not an accepted inconsistency.
 *
 * `levelIssues` deliberately returns CODES + numeric context only, never the server's Vietnamese
 * `message` strings — those are shown verbatim only when they arrive from an actual server 400
 * (F12 FR-22); the client-side advisory port is localized through i18n instead.
 *
 * Pure module: no `fetch`, no React import, no i18n import (AC-07.6).
 *
 * Verification without a jest suite (AC-07.5, checked by hand — QA re-run):
 *  - Cambridge YL (`sum`, 5 dims × scale 0..5) ⇒ maxTotal = 25
 *  - IELTS (`average`, 4 dims × scale 0..9) ⇒ maxTotal = 9
 *  - `weighted_average` with uneven weights ⇒ maxTotal = scale.max
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
  key: string;
  label: string;
  weight: number;
  bands: Record<string, string[]>;
  sub_factors: RubricSubFactor[];
}

export interface CommentBankEntry {
  dimension: string | null;
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
  levels: RubricLevel[];
  output_fields: OutputField[];
  dimensions: RubricDimensionV2[];
  comment_bank: CommentBankEntry[];
  student_reply: StudentReply | null;
}

export const DEFAULT_SCALE: RubricScale = { min: 0, max: 3, step: 1 };

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownGet(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as UnknownRecord)[key] : undefined;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

const AGGREGATION_METHODS: readonly string[] = ['sum', 'average', 'weighted_average'];

interface EffectiveScale {
  min: number;
  max: number;
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
  return typeof method === 'string' && AGGREGATION_METHODS.includes(method)
    ? (method as AggregationMethod)
    : 'average';
}

function readRound(rubric: RubricV2): RoundingMode {
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

function readWeight(raw: unknown): number {
  const weight = asFiniteNumber(raw);
  if (weight === null) return 1;
  return weight < 0 ? 0 : weight;
}

function rubricDimensions(rubric: RubricV2): { dims: EffectiveDim[] } {
  const list = ownGet(rubric, 'dimensions');
  if (!Array.isArray(list)) return { dims: [] };
  const dims: EffectiveDim[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!isPlainObject(entry)) continue;
    const key = ownGet(entry, 'key');
    if (typeof key !== 'string' || key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    dims.push({ key, weight: readWeight(ownGet(entry, 'weight')) });
  }
  return { dims };
}

/** Port of `rubric-scoring.ts::maxTotal` — same rule: `dimensions` empty ⇒ 0. */
export function maxTotal(rubric: RubricV2): number {
  const { dims } = rubricDimensions(rubric);
  if (dims.length === 0) return 0;
  const scale = effectiveScale(rubric);
  return finite(readMethod(rubric) === 'sum' ? dims.length * scale.max : scale.max);
}

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

export type LevelIssueCode =
  | 'level_invalid'
  | 'level_overlap'
  | 'level_gap'
  | 'level_coverage_start'
  | 'level_coverage_end';

export interface LevelIssue {
  code: LevelIssueCode;
  index: number;
  /** numeric context only — never a copy-pasted server string (AC-07.3) */
  prev?: number;
  next?: number;
}

/**
 * Port of `rubric-scoring.ts::validateLevels`, minus the Vietnamese `message` text (localized
 * client-side instead via `templates.issue.*` i18n keys). ADVISORY ONLY (AC-13.3) — callers must
 * never disable Save because of this list; only the six blocking rules of AC-13.4 do that.
 */
export function levelIssues(rubric: RubricV2): LevelIssue[] {
  const levels = readLevels(rubric);
  if (levels.length === 0) return [];

  const issues: LevelIssue[] = [];
  const orderable: { min: number; max: number }[] = [];

  levels.forEach((entry, index) => {
    const min = asFiniteNumber(ownGet(entry, 'min'));
    const max = asFiniteNumber(ownGet(entry, 'max'));
    const code = ownGet(entry, 'code');
    const label = ownGet(entry, 'label');
    const invalid =
      min === null ||
      max === null ||
      (min !== null && max !== null && min > max) ||
      typeof code !== 'string' ||
      code.trim().length === 0 ||
      typeof label !== 'string' ||
      label.trim().length === 0;
    if (invalid) issues.push({ code: 'level_invalid', index });
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
      issues.push({ code: 'level_overlap', index: i, prev: prev.max, next: cur.min });
    } else if (cur.min > prev.max + step) {
      issues.push({ code: 'level_gap', index: i, prev: prev.max, next: cur.min });
    }
  }

  const minPossible = minPossibleTotal(rubric);
  if (sorted[0].min > minPossible) {
    issues.push({ code: 'level_coverage_start', index: 0, next: sorted[0].min, prev: minPossible });
  }

  const maxPossible = maxTotal(rubric);
  const last = sorted[sorted.length - 1];
  if (last.max < maxPossible) {
    issues.push({ code: 'level_coverage_end', index: sorted.length - 1, prev: last.max, next: maxPossible });
  }

  return issues;
}

const BAND_VALUES_CAP = 50;

/**
 * `min, min+step, …, max` formatted with plain JS `String(number)` (`1` not `1.0`), hard-capped
 * at 50 entries (AC-07.4/AC-16.7). Returns `[]` for a non-finite/degenerate scale rather than
 * looping forever.
 */
export function bandValues(scale: RubricScale): string[] {
  const { min, max, step } = scale;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0 || min > max) {
    return [];
  }
  const out: string[] = [];
  let v = min;
  let guard = 0;
  while (v <= max + 1e-9 && guard <= BAND_VALUES_CAP) {
    out.push(String(Math.round(v * 1e9) / 1e9));
    v += step;
    guard += 1;
    if (out.length > BAND_VALUES_CAP) break;
  }
  return out;
}
