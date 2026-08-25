# F9 · BA — `computeTotal` server-side scoring + Prisma migration + `weight`-bug fix

- **Owner role:** ba
- **Feature:** F9 — one pure `computeTotal(rubric, scores)` in `services/core-api/src/lib/rubric-scoring.ts`; persist `Grading.totalScore/levelCode/levelLabel` (+ `studentAckAt` column for F11) and `Student.currentLevelCode/currentLevelAt`; route `reports.service.ts` through it, fixing the standing bug where `weight` is silently ignored; small read-only total/level/`fix` display on `SubmissionDetail.tsx`.
- **Status:** DONE (AC-07.5 corrected post-QA — see the inline note under FR-07)
- **Last updated:** 2026-08-21 (post-QA correction)
- **Depends on:** `F9-pm.md` (US1–US4), `F8-ba.md` + `F8-backend.md` (v2 schema + `normalizeRubric` — the foundation)

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F9-pm.md` — US1–US4 (MoSCoW), in/out of scope, 2 assumptions (no backfill; `studentAckAt` lands here even though F11 writes it).
- `Idea/20260819-ChamDiemRubricV2.md` **Phần 5** (authoritative: one server-side call site, DB columns, `reports.service.ts` uses `computeTotal`, `Student.currentLevel*` is the Zalo-user→student→level mapping), Phần 1.1/1.2 (the two source PDFs), Phần 2 điểm 1 (the bug), Phần 8 (file scope + migration list), Phần 10 mục 1 (mandatory test cases).
- `docs/dev-team-roles/tasks/F8-ba.md` / `F8-backend.md` — v2 types are final and exported from `services/core-api/src/criteria/rubric-schema.ts`; `normalizeRubric` never throws, is idempotent, whitelists 12 top-level keys; `aggregation`/`levels` are carried but unused (F8-backend "Notes → F9 backend"); `GET /internal/criteria/:courseId` must stay verbatim (F8 AC-08.2).
- Code read: `reports/reports.service.ts` (the bug is `scorePctForGrading`, lines 254–267; `bandMaxFromRubric` 103–117; `fetchGradingsInRange` 271–286; 4 consumers), `worker-api/worker-api.controller.ts` (`POST /internal/gradings`, lines 120–132), `prisma/schema.prisma` (`Grading` 131–146 — note: **no `createdAt` column**; `Student` 68–84; `Criteria` 53–65), `submissions/submissions.service.ts` (`DETAIL_INCLUDE` already carries `grading.criteria`), `dashboard/src/pages/SubmissionDetail.tsx`, `reports/analytics.spec.ts` (the regression fixtures), `prisma/migrations/*` (hand-authored SQL precedent).

## Checklist

- [x] Read TASK-PROTOCOL + template; create this file
- [x] Read F9-pm.md, design doc Phần 5 (+1, 2, 8, 10, 11)
- [x] Read F8-ba.md / F8-backend.md (foundation + what F8 left for F9)
- [x] Read every in-scope source file and the existing analytics/report tests
- [x] Specify `computeTotal` — signature, all 3 methods, both `round` modes, every degenerate input
- [x] Specify level lookup + `validateLevels` (gap/overlap/coverage)
- [x] Reproduce both source PDFs as numbered worked examples (KID sum 25, IELTS average 0–9)
- [x] Specify the single write-side call site + `Student.currentLevel*` semantics
- [x] Specify the Prisma migration (additive, nullable) + data dictionary
- [x] **Decide and justify the historical-gradings question** (recompute vs. stored column)
- [x] Specify the `reports.service.ts` change per call site, with the regression anchor
- [x] Specify the read-only UI surface + null handling + i18n
- [x] Business rules, NFRs, use cases, assumptions/dependencies/open questions

---

# Functional specification — F9

## 0. Scope & traceability

| FR | Title | Traces to |
| :-- | :-- | :-- |
| FR-01 | `rubric-scoring.ts` module + `computeTotal` signature and purity | US1 |
| FR-02 | Aggregation semantics — `sum` / `average` / `weighted_average` | US1 |
| FR-03 | Rounding — `none` / `nearest_int` | US1 |
| FR-04 | Level lookup | US1 |
| FR-05 | Degenerate, missing, extra and malformed input | US1 |
| FR-06 | `validateLevels` — gap / overlap / coverage (library only in F9) | US1 |
| FR-07 | Worked examples reproducing both source PDFs | US1 |
| FR-08 | Single write-side call site: `POST /internal/gradings` computes + persists | US2 |
| FR-09 | `Student.currentLevelCode` / `currentLevelAt` update semantics | US2 |
| FR-10 | grading-worker and the LLM stay arithmetic-agnostic (zero files changed) | US2 |
| FR-11 | Prisma migration — additive, nullable, no backfill | US2 |
| FR-12 | `reports.service.ts` weight-bug fix + the historical-gradings policy | US3 |
| FR-13 | `SubmissionDetail.tsx` — read-only total / level / `fix` | US4 |
| FR-14 | i18n keys (vi + en) | US4 |

**Out of scope (do not build in F9):** any backfill/recompute job for existing `gradings` rows (BR-07); writing `Grading.studentAckAt` (F11 — F9 only creates the column); Zalo buttons and `student_reply.show_total`/`show_level` in the outbound message (F11); `RubricTemplate` table, seeds, CRUD, `privileges` (F10); wiring `validateLevels` into any HTTP endpoint (F10's `POST /criteria/json` + template routes); any rubric-editing UI or `dashboard/src/lib/rubric.ts` (F12); totals for `PilotTextGrading` (comparison-only rows, no columns added); changing `GET /internal/criteria/:courseId` (F8 AC-08.2 — see §8 OQ-4).

---

## 1. Data dictionary

### 1.1 New Prisma columns (all additive, all nullable, no defaults, no backfill)

| Model.field | Prisma type | Column | SQL type | Nullable | Written by | Validation / meaning |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `Grading.totalScore` | `Float?` | `total_score` | `DOUBLE PRECISION` | yes | F9 (`POST /internal/gradings`) | `computeTotal().total` after rounding. `null` ⇔ not computed: either a pre-F9 row, or `counted === 0` (BR-05). Never `NaN`/`Infinity`. |
| `Grading.levelCode` | `String?` | `level_code` | `TEXT` | yes | F9 | `computeTotal().level.code`. `null` when `levels: []`, when the total maps to no level, or when `totalScore` is null. |
| `Grading.levelLabel` | `String?` | `level_label` | `TEXT` | yes | F9 | `computeTotal().level.label`. Always null/non-null together with `levelCode`. |
| `Grading.studentAckAt` | `DateTime?` | `student_ack_at` | `TIMESTAMP(3)` | yes | **F11 only** | Timestamp of the student's `#ilm:ack:<id>` button press. F9 creates the column and writes it **never** — every row is `null` after F9. |
| `Student.currentLevelCode` | `String?` | `current_level_code` | `TEXT` | yes | F9 | Level code of the most recently graded submission for this student (FR-09). |
| `Student.currentLevelAt` | `DateTime?` | `current_level_at` | `TIMESTAMP(3)` | yes | F9 | `Submission.receivedAt` of the submission that set `currentLevelCode` — **not** the write time (FR-09, BR-09). |

No index is added. No unique constraint. No foreign key. No column is dropped, renamed or re-typed.

### 1.2 `computeTotal` inputs

| Input | Type | Required | Validation |
| :-- | :-- | :-- | :-- |
| `rubric` | `RubricV2` (imported from `criteria/rubric-schema.ts`) | yes | Assumed already `normalizeRubric`-d (BR-12). `computeTotal` still tolerates hostile values inside it (FR-05) but does **not** call `normalizeRubric` itself. |
| `scores` | `unknown` (in practice `Prisma.JsonValue` from `Grading.scores`) | yes | Any JSON value. Expected shape `Record<string, { score: number; comment: string; fix?: string }>`; a bare `Record<string, number>` is also accepted (same tolerance `dimensionScore` has today). |

### 1.3 `ComputeTotalResult`

| Field | Type | Meaning |
| :-- | :-- | :-- |
| `total` | `number` | Finite. `0` when `counted === 0`. |
| `max` | `number` | Best achievable total for this rubric (see FR-02). `0` when it cannot be determined. |
| `level` | `RubricLevel \| null` | Matched level, or `null`. |
| `counted` | `number` | How many effective dimensions had a usable score. **`counted === 0` is the caller's "no score" signal.** |
| `missing` | `string[]` | Rubric dimension keys with no usable score, in rubric order. |
| `ignored` | `string[]` | Keys present in `scores` that are not effective dimensions (extras + duplicates), in `Object.keys(scores)` order. |
| `clamped` | `string[]` | Dimension keys whose raw score fell outside `[scale.min, scale.max]` and was clamped (BR-10). |

---

## 2. Functional requirements

### FR-01 — module, signature, purity (US1)

New file `services/core-api/src/lib/rubric-scoring.ts`.

```ts
import type { RubricV2, RubricLevel } from '../criteria/rubric-schema';

export interface ComputeTotalResult {
  total: number; max: number; level: RubricLevel | null;
  counted: number; missing: string[]; ignored: string[]; clamped: string[];
}
export function computeTotal(rubric: RubricV2, scores: unknown): ComputeTotalResult;
export function maxTotal(rubric: RubricV2): number;
export function findLevel(levels: RubricLevel[], total: number): RubricLevel | null;

export type LevelIssueCode =
  | 'level_invalid' | 'level_overlap' | 'level_gap'
  | 'level_coverage_start' | 'level_coverage_end';
export interface LevelIssue { code: LevelIssueCode; index: number; message: string; }
export function validateLevels(rubric: RubricV2): LevelIssue[];
```

- **AC-01.1** The module imports **only** types from `criteria/rubric-schema.ts`. No `@nestjs/*`, no Prisma, no Redis, no `fs`, no I/O. Verifiable by reading the import list; the spec file imports it standalone.
- **AC-01.2** `computeTotal` **never throws** for any `scores` value (`null`, `undefined`, `42`, `"x"`, `[]`, `{}`, deeply nested objects, `NaN`, `Infinity`, `-0`, huge numbers) and for any structurally-damaged `rubric` (FR-05). This is non-negotiable: it runs on the grading write path, and a throw here turns a bad rubric into a RabbitMQ retry→DLQ loop.
- **AC-01.3** `computeTotal` mutates neither argument. Given a deep-frozen rubric and a deep-frozen `scores`, no error is thrown and a `JSON.stringify` of each, taken before and after, is unchanged.
- **AC-01.4** `computeTotal` is deterministic and referentially transparent: same inputs ⇒ **bit-identical** `total` (accumulation happens in effective-dimension order — FR-02 — so re-running it later reproduces the stored value exactly; this is what makes FR-12's recompute policy safe).
- **AC-01.5** `total`, `max` and `counted` are always finite numbers (never `NaN`, never `±Infinity`). If any intermediate would be non-finite, the result is `0`.
- **AC-01.6** Code comments in the file are Vietnamese, matching `rubric-schema.ts` style.
- **AC-01.7** `maxTotal(rubric)` depends on the rubric alone and equals `computeTotal(rubric, anyScores).max` **whenever `rubric.dimensions` is non-empty**. When `dimensions` is empty the two may differ (AC-02.7) — documented, tested.

### FR-02 — aggregation semantics (US1)

**Effective dimensions.** Let `D` = `rubric.dimensions` in array order, de-duplicated by `key` (first occurrence wins; later duplicates are dropped and their key is appended to `ignored`). Let `S = scale.max`, `m = scale.min`.

- **AC-02.1** For each `d ∈ D`, the raw value is `scores[d.key].score` when `scores[d.key]` is an object with a **numeric** `score`; else `scores[d.key]` when that is itself a number; else absent. A value that is not a finite `number` (string `"5"`, `null`, `true`, `NaN`, `Infinity`, missing key) is **absent** — no coercion (AC-05.3).
- **AC-02.2** A present value outside `[m, S]` is clamped into that interval and its key recorded in `clamped` (BR-10). `counted` counts present (post-clamp) values. `missing` lists the absent ones, in `D` order.
- **AC-02.3 (`sum`)** `total = Σ v_d` over present dimensions, accumulated in `D` order. `max = |D| × S`. **`weight` is NOT applied** (BR-03). Cambridge YL: 5 dimensions × max 5 ⇒ `max = 25`, exactly the PDF's "tổng tối đa = 25".
- **AC-02.4 (`average`)** `total = (Σ v_d) / counted` over present dimensions. `max = S`. `weight` is not applied. This is the arithmetic that reproduces today's report numbers exactly (BR-14 / AC-12.4).
- **AC-02.5 (`weighted_average`)** `w_d = d.weight` clamped to `≥ 0` (a negative weight becomes `0`; a non-finite weight becomes `1`, matching F8's default). `total = Σ(v_d × w_d) / Σ(w_d)` over **present** dimensions only. `max = S`.
- **AC-02.6 (`weighted_average`, `Σw = 0`)** When every present dimension has weight `0` (or `D` is empty of present dims), the denominator is `0`. The function does **not** produce `NaN`: it falls back to the unweighted mean of the present values (i.e. behaves as `average`). A weight-0 dimension is still counted in `counted` and contributes nothing to the number.
- **AC-02.7 (dimension-less rubric — the legacy path)** When `D` is empty, the effective dimensions are instead **the keys of `scores` that yield a usable number**, in `Object.keys(scores)` order, each with weight `1`. `max` then uses that count (`sum`) or `S` (`average`/`weighted_average`). Rationale: a rubric that declares no dimensions cannot constrain the score set, and every stub/legacy rubric in the existing test fixtures (`analytics.spec.ts`'s `{ band_scale: [0,3] }`) is exactly this shape — without this rule the weight-bug fix would silently null out every historical report row. `maxTotal(rubric)` returns `0` for such a rubric (AC-01.7).
- **AC-02.8** Keys present in `scores` but not among the effective dimensions never affect `total` or `max`; they are listed in `ignored`.
- **AC-02.9** `max ≤ 0` is possible only for a broken rubric (`S ≤ 0`, or no effective dimension under `sum`). `computeTotal` still returns normally; percentage consumers must treat `max <= 0` as "no score" (AC-12.3).
- **AC-02.10** An unknown `aggregation.method` cannot reach here (F8 normalizes it to `average`), but if one does, it is treated as `average` — never a throw.
- **AC-02.11** No `scale.min` shift is applied anywhere: a percentage is `total / max`, not `(total − min) / (max − min)`. Deliberate — it is what today's code does, and changing it would break the regression anchor (BR-14).

### FR-03 — rounding (US1)

- **AC-03.1 (`round: "none"`)** `total` is returned as computed — no rounding, no decimal truncation. `18` stays `18`; `25/4 = 6.25` stays `6.25`.
- **AC-03.2 (`round: "nearest_int"`)** `total = Math.round(total)` — ECMAScript semantics, i.e. ties go **toward `+Infinity`**: `6.5 → 7`, `6.4999 → 6`, `−6.5 → −6`. The negative case is a documented consequence, unreachable with any real rubric (`scale.min ≥ 0`).
- **AC-03.3** Rounding applies to `total` only. `max` is never rounded.
- **AC-03.4** Rounding happens **before** the level lookup (FR-04), so the level always matches the number that is displayed and stored.
- **AC-03.5** An unknown `round` value is treated as `"none"` (cannot occur after F8 normalization).

### FR-04 — level lookup (US1)

- **AC-04.1** `findLevel(levels, total)` returns the **first** entry, in array order, satisfying `total >= level.min && total <= level.max` — **both bounds inclusive**. First-match-wins makes an overlapping `levels` array deterministic instead of throwing (BR-08).
- **AC-04.2** `levels: []` ⇒ `level = null` (IELTS: no level mapping at all).
- **AC-04.3** A total that falls in no interval (gap, or below the first / above the last) ⇒ `level = null`. No nearest-neighbour snapping, no clamping to the end levels.
- **AC-04.4** Entries with a non-finite `min`/`max` are skipped during lookup (never match).
- **AC-04.5** **`counted === 0` ⇒ `level = null`, and no lookup is performed.** Without this rule a rubric with no usable scores would produce `total = 0` and be reported as "Pre-starter (A0) ~ Tiny Rabbit" — a real, plausible-looking wrong answer, which is worse than a blank.
- **AC-04.6** `computeTotal` never rejects a malformed `levels` array — it degrades per AC-04.1/AC-04.4. Rejection is `validateLevels`' job and belongs at the authoring boundary (FR-06), not the grading path.

### FR-05 — degenerate / hostile input (US1)

- **AC-05.1** `scores` is `null`, `undefined`, a number, a string, a boolean or an array ⇒ `counted = 0`, `total = 0`, `level = null`, `missing` = every effective dimension key, `ignored = []`, `clamped = []`. (For an array, `Object.keys` yields index strings, which will simply not match any dimension key — the result is the same.)
- **AC-05.2** `scores = {}` ⇒ same as AC-05.1.
- **AC-05.3** Non-numeric per-dimension values: `{ pronunciation: { score: "4" } }`, `{ pronunciation: { score: null } }`, `{ pronunciation: {} }`, `{ pronunciation: "4" }`, `{ pronunciation: null }`, `{ pronunciation: NaN }`, `{ pronunciation: Infinity }` are all **absent**, listed in `missing`.
- **AC-05.4** `rubric.dimensions` containing a non-object entry, or an entry with a non-string/empty `key`, ⇒ that entry is skipped (it can never be scored) and does **not** inflate `max` under `sum`.
- **AC-05.5** Duplicate `dimensions[].key` ⇒ first wins, later ones dropped; `max` under `sum` counts the de-duplicated set; the dropped key appears once in `ignored`.
- **AC-05.6** `rubric.scale` with a non-finite or missing `max` ⇒ `S` falls back to `3` (`DEFAULT_SCALE.max`, F8 BR-06 — one fallback repo-wide). Non-finite `min` ⇒ `0`. When `min > max`, the bounds are treated as **unusable**: values pass through unclamped and `clamped` stays empty (silently inverting an author's mistake is worse than not clamping). `S` is still used for `max`.
- **AC-05.7** `weight` non-finite ⇒ `1`; `weight < 0` ⇒ `0` (AC-02.5).
- **AC-05.8** A rubric with `dimensions: []` **and** unusable `scores` ⇒ `counted = 0`, `max = 0`, `total = 0`, `level = null`. No division by zero anywhere.
- **AC-05.9** `scores` containing a prototype-polluting key (`__proto__`, `constructor`) is read safely (own-property access only) and never mutates `Object.prototype`. Test: after `computeTotal(rubric, JSON.parse('{"__proto__":{"x":1}}'))`, `({} as any).x` is `undefined`.

### FR-06 — `validateLevels` (US1)

A pure validator, **shipped as a library in F9 and wired into no HTTP route by F9** (see §7 — F10 owns `POST /criteria/json` and the template routes, which is where a 400 belongs; the `.docx` path cannot produce `levels` at all — F8 AC-06.6 always yields `levels: []`).

Define the **total granularity** `g`: `1` when `aggregation.round === 'nearest_int'`; else `scale.step` when `method === 'sum'`; else `0` (continuous). Define `minPossibleTotal` = `|D| × scale.min` for `sum`, else `scale.min`; `maxPossibleTotal = maxTotal(rubric)`.

- **AC-06.1** `levels: []` ⇒ `[]` (no issues). An empty level table is legal and means "no level mapping" (IELTS).
- **AC-06.2 `level_invalid`** — one issue per entry whose `min`/`max` is not a finite number, or `min > max`, or `code`/`label` is not a non-empty string after trim. `index` = the entry's index in the original array.
- **AC-06.3 `level_overlap`** — over entries sorted ascending by `min`: an issue when `entry[i].min < entry[i-1].max` (for `g === 0`) or `entry[i].min <= entry[i-1].max` (for `g > 0`). So for the KID table (`g = 1`) `[0,10]` followed by `[10,15]` is an overlap; `[0,10]` followed by `[11,15]` is not.
- **AC-06.4 `level_gap`** — an issue when `entry[i].min > entry[i-1].max + g`. KID `0–10, 11–15, 16–20, 21–25` with `g = 1` has **no** gap. `0–10` then `12–20` does.
- **AC-06.5 `level_coverage_start`** — an issue when `sorted[0].min > minPossibleTotal`.
- **AC-06.6 `level_coverage_end`** — an issue when `sorted[last].max < maxPossibleTotal`.
- **AC-06.7** Issues are returned in a deterministic order: all `level_invalid` (by original index) first, then the ordering issues by sorted index. `message` is a Vietnamese, human-readable sentence naming the offending numbers (it goes into an F10 API 400 body and an F12 inline hint).
- **AC-06.8** `validateLevels` never throws, for any rubric.
- **AC-06.9** Mandatory fixtures: the Cambridge YL table ⇒ `[]`; the same table with `11–15` changed to `10–15` ⇒ exactly one `level_overlap`; changed to `12–15` ⇒ exactly one `level_gap`; with the first entry changed to `1–10` ⇒ one `level_coverage_start`; with the last changed to `21–24` ⇒ one `level_coverage_end`; an entry with `code: ""` ⇒ one `level_invalid`.

### FR-07 — worked examples reproducing both source PDFs (US1, design doc Phần 10 mục 1)

These are the headline acceptance cases. Until F10's seed templates exist, hand-built v2 fixtures are acceptable; when the seeds land, these tests re-point at them (never a second copy — F8 AC-15.9).

**KID / Cambridge YL** — `scale {min:0,max:5,step:1}`, `aggregation {method:"sum",round:"none"}`, 5 dimensions (`pronunciation`, `intonation`, `ending_sounds`, `word_stress`, `fluency`), all `weight: 1`, `levels` = the 4 rows of the PDF.

- **AC-07.1** `scores = {pronunciation:4, intonation:3, ending_sounds:4, word_stress:3, fluency:4}` (each as `{score, comment}`) ⇒ `total = 18`, `max = 25`, `counted = 5`, `level = { min:16, max:20, code:"A1", label:"Mover (A1) ~ Junior Panda" }`.
- **AC-07.2** All fives ⇒ `total = 25`, `level.code = "A2"` ("Flyer (A2) ~ Great Big Dino") — proves the **upper bound is inclusive**.
- **AC-07.3** All zeros ⇒ `total = 0`, `counted = 5`, `level.code = "A0"` ("Pre-starter (A0) ~ Tiny Rabbit") — a genuine all-zero grading **does** get a level (contrast AC-04.5).
- **AC-07.4** `total = 10` ⇒ `"A0"`; `total = 11` ⇒ `"A1-"` ("Starter (A1-) ~ Little Fox") — proves both bounds inclusive and the 10/11 boundary.
- **AC-07.5** Same rubric with `pronunciation` missing from `scores` ⇒ `total = 14`, `max = 25` (**unchanged**), `counted = 4`, `missing = ["pronunciation"]`, `level.code = "A1-"` ("Starter (A1-) ~ Little Fox" — 14 falls in the `11–15` band of the table above). `max` never shrinks to match a partial grading.
  > **Corrected 2026-08-21, post-QA.** This AC originally said `"A0"`, which contradicted the level table printed three lines above it and `Criteria-Source/RubricSpeakingA0-C.pdf` (p.3–4). Backend spotted the slip during implementation, implemented the correct `A1-`, and flagged it; QA re-checked the PDF and ruled the **spec text** was wrong, not the code. **The code did not drift from the spec** — the spec drifted from the source, and F9 passed its gate with `A1-`.
- **AC-07.6** Same rubric with `{... , listening: {score:5}}` ⇒ `total = 18`, `max = 25`, `ignored = ["listening"]`.
- **AC-07.7** Every dimension carries `weight: 2` instead of `1` ⇒ result is **identical** to AC-07.1 (`total = 18`, `max = 25`) — proves `sum` ignores `weight` (BR-03).

**IELTS Speaking** — `scale {min:0,max:9,step:1}`, `aggregation {method:"average",round:"nearest_int"}`, 4 dimensions (`fluency_coherence`, `lexical_resource`, `grammatical_range`, `pronunciation`), `levels: []`, `output_fields ["comment","fix"]`.

- **AC-07.8** `scores = 6,7,6,6` ⇒ raw mean `6.25` ⇒ `total = 6` (`nearest_int`), `max = 9`, `counted = 4`, `level = null` (`levels: []`).
- **AC-07.9** `scores = 7,7,6,7` ⇒ raw `6.75` ⇒ `total = 7`.
- **AC-07.10** `scores = 6,7,7,6` ⇒ raw `6.5` ⇒ `total = 7` (ties toward `+Infinity`, AC-03.2).
- **AC-07.11** The same rubric with `round: "none"` ⇒ `total = 6.25` — proves the integer-only rule of the PDF is expressed by `round`, not baked into `average`.
- **AC-07.12** The same rubric switched to `weighted_average` with weights `2,1,1,1` and scores `6,7,6,6` ⇒ `(12+7+6+6)/5 = 6.2` ⇒ `nearest_int` ⇒ `6`. **The same scores under the pre-F9 unweighted math give `6.25`** — this is the fixture that proves the standing bug was real and is now fixed (US3).

### FR-08 — one server-side call site (US2)

`POST /internal/gradings` in `services/core-api/src/worker-api/worker-api.controller.ts` is the **only** place `computeTotal` is called on a write path.

- **AC-08.1** Before creating the row, the handler loads the pinned criteria (`prisma.criteria.findUnique({ where: { id: body.criteriaId } })`) and the submission (`select: { id, studentId, receivedAt }`), then computes `computeTotal(normalizeRubric(criteria.rubric), body.scores)`.
- **AC-08.2** `normalizeRubric` is called **here**, on the stored rubric, at write time. `computeTotal` itself never normalizes (BR-12).
- **AC-08.3** When `result.counted > 0`: persist `totalScore = result.total`, `levelCode = result.level?.code ?? null`, `levelLabel = result.level?.label ?? null`.
- **AC-08.4** When `result.counted === 0`: persist `totalScore = null`, `levelCode = null`, `levelLabel = null` (BR-05). A grading with no usable scores must not be recorded as "0 points".
- **AC-08.5** Every other field written by this endpoint (`submissionId`, `criteriaId`, `criteriaVersion`, `scores`, `llmFeedback`, `autoSent`) is unchanged, as is the request DTO — **`CreateGradingDto` gains no field**. The worker's request body is byte-identical to today's.
- **AC-08.6** The response body is the created `Grading` row and therefore now also carries `totalScore`/`levelCode`/`levelLabel`/`studentAckAt`. The worker ignores them (FR-10); this is an additive, backward-compatible response change.
- **AC-08.7** Criteria row not found ⇒ `NotFoundException` ("criteria not found"); submission not found ⇒ `NotFoundException` ("submission not found"). Both were previously Prisma foreign-key failures surfacing as 500s; both are unreachable in normal operation (the worker always posts ids it just read).
- **AC-08.8** A rubric that is malformed, empty, or missing `levels` never fails the request — `computeTotal` cannot throw (AC-01.2), so grading persistence is never blocked by rubric quality.
- **AC-08.9** `POST /internal/pilot-text-gradings` is **unchanged** — no total, no level, no columns. Pilot rows exist only for A/B comparison.
- **AC-08.10** No other module computes a total. Grep evidence: `computeTotal` is imported by exactly `worker-api.controller.ts`, `reports.service.ts`, `submissions.service.ts` (for `totalMax`, FR-13) and the spec files.

### FR-09 — `Student.currentLevelCode` / `currentLevelAt` (US2)

- **AC-09.1** Immediately after the grading is created, and **only** when `result.level !== null` and `submission.studentId !== null`, the student row is updated with `currentLevelCode = result.level.code`, `currentLevelAt = submission.receivedAt`.
- **AC-09.2 (timestamp semantics)** `currentLevelAt` is the **submission's `receivedAt`**, not the write time. Rationale: `Grading` has no `createdAt` column, and "level as of the most recent piece of work" is the meaningful business statement.
- **AC-09.3 (out-of-order guard)** The update is applied only when `student.currentLevelAt IS NULL OR student.currentLevelAt <= submission.receivedAt`. Implemented as a single `prisma.student.updateMany({ where: { id, OR: [{ currentLevelAt: null }, { currentLevelAt: { lte: receivedAt } }] }, data })` — `updateMany` matching zero rows is a no-op, which also covers a deleted/absent student without an exception.
- **AC-09.4 (regrade of an old submission)** Re-grading a submission older than the student's current level leaves `currentLevelCode`/`currentLevelAt` untouched. Re-grading the newest submission (equal `receivedAt`) **does** overwrite (guard is `<=`, not `<`).
- **AC-09.5 (backwards movement is allowed)** A newer submission that scores lower moves the level down. `currentLevel*` is a snapshot of the latest assessment, not a high-water mark — a monotonic maximum would hide regression and could never be corrected without manual DB surgery.
- **AC-09.6 (`level === null`)** Nothing is written — the previous `currentLevelCode`/`currentLevelAt` are preserved, not cleared. Consequence, accepted and recorded: a student whose course moves to a levels-less rubric (IELTS) keeps their last KID-era level until another level-bearing grading arrives (§8 OQ-2).
- **AC-09.7 (siblings / multiple bindings)** A `Grading` belongs to exactly one `Submission`, which carries exactly one `studentId` (already resolved by the worker's binding logic). Multiple Zalo bindings therefore cannot ambiguate this update: two siblings sharing one Zalo account get two independent `students` rows and two independent levels. `zalo_bindings` is never read here.
- **AC-09.8 (unbound submission)** `submission.studentId === null` ⇒ no student update, grading still created, no error, no log-level alarm.
- **AC-09.9 (atomicity)** The grading `create` and the student `updateMany` run inside one `prisma.$transaction([...])`, so a partially applied write is impossible. The two preparatory reads (criteria, submission) happen before the transaction.
- **AC-09.10** The student update never causes the endpoint to fail for a reason the grading create would not also fail for. Specifically, a missing student produces zero updated rows, not an exception (AC-09.3).

### FR-10 — grading-worker and the LLM stay arithmetic-agnostic (US2, BR-01/BR-02)

- **AC-10.1** **Zero files change under `services/grading-worker/`.** Verifiable by `git diff --stat services/grading-worker` being empty for F9.
- **AC-10.2** No prompt mentions a total, an average, a sum or a level name. This is already locked by F8 AC-11.9/AC-12.3 and must still pass unchanged.
- **AC-10.3** The LLM output JSON Schema gains no total/level property (F8 AC-09.9 unchanged).
- **AC-10.4** `services/zalo-gateway/` is untouched; `contracts.ts`/`contracts.py` are untouched (buttons and `show_total` are F11).

### FR-11 — Prisma migration (US2)

- **AC-11.1** `services/core-api/prisma/schema.prisma` gains exactly the six fields in §1.1, with the `@map` names given there. No other model, field, index or relation changes.
- **AC-11.2** A hand-authored migration folder `services/core-api/prisma/migrations/20260821HHMMSS_add_grading_totals_and_student_level/migration.sql` (following the F1/F2 precedent and `20260722100000_add_pilot_text_grading`) containing exactly two `ALTER TABLE` statements adding nullable columns — no `UPDATE`, no `NOT NULL`, no `DEFAULT`, no `CREATE INDEX`.
- **AC-11.3** The migration applies cleanly to a database at the current head, and applies to a **non-empty** `gradings`/`students` table without touching a single existing row (all six columns are `NULL` afterwards).
- **AC-11.4** After migration + deploy, but **before** any new grading is created, every existing API response and every dashboard screen still renders (the new fields are simply `null`) — no client-side crash, no 500.
- **AC-11.5** The migration is validated against a disposable Postgres container before handoff (F1/F2 precedent recorded in `PROGRESS.md`), and `npx prisma generate` produces a client where all six fields are optional.
- **AC-11.6** No backfill script exists, is scheduled, or is referenced (BR-07).
- **AC-11.7** Down-migration is not authored (the repo has no precedent for one); the rollback story is "the columns are nullable and unread by the previous code", stated in the migration's leading SQL comment (Vietnamese).

### FR-12 — `reports.service.ts`: the `weight` fix and the historical-gradings policy (US3)

**Decision (the subtlest call in F9): reports RECOMPUTE from stored `scores` + the grading's own pinned rubric. Reports never read `Grading.totalScore`.**

Justification, recorded because a future reader will question it:
1. **Coverage.** Reading the column would make every pre-F9 grading invisible to `avgScore`, `trends.score` and `classPerformance` — an entire history silently dropping out of the analytics on deploy day. That is a far worse defect than the weight bug being fixed. There is no backfill (PM assumption 1), so the column is `NULL` for all of them.
2. **No mixed vintage.** Recomputation applies today's math uniformly to every row, so a report never averages old-math and new-math numbers together. The alternative ("stored column where present, recompute where null") would produce exactly that hybrid, undetectably.
3. **Correctness is pinned, not drifting.** `Grading.criteriaId` points at an immutable, versioned `criteria` row (a rubric edit creates a new version, never mutates one), so recomputing reproduces precisely what would have been stored. Combined with AC-01.4 (bit-identical determinism), recompute and column are equal by construction for post-F9 rows — asserted directly by AC-12.10.
4. **Reports need `max`, which is not stored.** Every reporting figure is a percentage of the band scale; storing only `total` would still force a rubric read.
5. **Cost is negligible** (AC-12.9): one `normalizeRubric` per distinct `criteriaId` (memoized), then O(dimensions) per row, inside a query that already scans the whole range.

`Grading.totalScore/levelCode/levelLabel` therefore serve **display, the student's Zalo reply (F11) and the student-level mapping** — they are a point-in-time record, not the reporting source of truth. Both derive from the same function, so they cannot disagree.

- **AC-12.1** `fetchGradingsInRange` additionally selects `criteriaId`, and each returned row carries `rubric: RubricV2` (normalized) alongside the existing `bandMax`.
- **AC-12.2** `normalizeRubric` is called **at most once per distinct `criteriaId`** per report call, via a `Map<number, RubricV2>` memo inside `fetchGradingsInRange` (honours F8 AC-14.4's intent: no per-row normalization).
- **AC-12.3** `scorePctForGrading` changes signature to take the rubric (plus the legacy `bandMax`) instead of `bandMax` alone, and returns `round1((result.total / max) * 100)`, or `null` when `result.counted === 0` **or** `max <= 0`. `round1` is unchanged. The old `sum / n / bandMax` expression is deleted, not left dead.
- **AC-12.4 (effective scale, the F8 compatibility splice)** `bandMaxFromRubric` keeps operating on the **raw** stored rubric and is **not** deleted — it is still the fallback chain `scale.max → band_scale[1] → 3`. The rubric handed to `computeTotal` is the normalized one, except that when `normalized.scale.max <= 0` the value from `bandMaxFromRubric(raw)` is spliced into `scale.max`. Reason: `normalizeRubric` whitelists away `band_scale`, so a rubric that relies on the v1 fallback would otherwise lose its scale (this is exactly F8's `analytics.spec.ts` case at line 144).
- **AC-12.5 (regression anchor — non-negotiable)** Every existing assertion in `services/core-api/src/reports/analytics.spec.ts` passes **unchanged**, including its `{ band_scale: [0,3] }` and `{ schema_version: 2, scale: {…} }` fixtures and the two F8 cases. Mechanism: those fixtures declare no `dimensions`, so AC-02.7's legacy path iterates `Object.keys(scores)` in the same order, with `average` (F8 BR-03), producing the identical `mean / bandMax × 100`.
- **AC-12.6 (general regression statement)** For any rubric whose `aggregation.method` is `average` (i.e. every rubric authored before F9) **and** whose stored `scores` key set equals its dimension key set, the reported percentage is numerically identical to the pre-F9 output. A pinned-value test records before/after for at least three such gradings. Where the key sets differ (extra or missing dimensions) the new code deliberately differs — extras are excluded, missing dimensions no longer shrink the denominator for `sum` — and that difference is itself asserted (AC-07.5/AC-07.6).
- **AC-12.7 (the fix actually bites)** A synthetic `weighted_average` rubric with uneven weights (FR-07's AC-07.12 fixture) yields a report percentage different from the pre-F9 unweighted result, asserted with both numbers written out.
- **AC-12.8 (deliberately unchanged consumers)** `kpis().avgPronunciation` and `dimensionBreakdown()` keep normalizing a **single** dimension by `bandMax` and are **not** routed through `computeTotal`: weighting one dimension by its own weight is meaningless, and a per-dimension figure has no aggregation method. `pilotComparison()` and `dimensionScore` are unchanged. `submissionRate()`, `cost()` and `pendingReview()` are untouched.
- **AC-12.9 (performance)** For 10 000 gradings across 20 distinct criteria, the added work is 20 `normalizeRubric` calls plus O(dimensions) per row — measurably under 100 ms and with no additional database round-trip (the rubric already rides on the existing `include`).
- **AC-12.10 (cross-check invariant)** For any post-F9 grading, `scorePctForGrading`'s recomputed total equals the stored `Grading.totalScore`. A test asserts this on the KID fixture by running the write-path computation and the report-path computation over the same inputs and comparing exactly.

### FR-13 — `SubmissionDetail.tsx`: read-only total / level / `fix` (US4)

- **AC-13.1 (API)** `GET /submissions/:id` returns the grading with the three new fields plus a derived `totalMax: number | null`, computed server-side in `SubmissionsService.detail()` as `computeTotal(normalizeRubric(grading.criteria.rubric), grading.scores).max` (`null` when there is no grading, or when `max <= 0`). The scoring math is **not** duplicated in the dashboard — `dashboard/src/lib/rubric.ts` is F12's file and is not created here.
- **AC-13.2** The dashboard's local `Grading` interface gains `totalScore: number | null`, `levelCode: string | null`, `levelLabel: string | null`, `totalMax: number | null`, and its `scores` value type gains `fix?: string`.
- **AC-13.3 (happy path)** `totalScore !== null && totalMax !== null` ⇒ one line renders as `{t('submissions.total')}: {totalScore}/{totalMax}`, followed by ` — {levelLabel}` **only when `levelLabel` is a non-empty string**. Example: "Tổng: 18/25 — Mover (A1) ~ Junior Panda".
- **AC-13.4 (no level)** `levelLabel` null/empty ⇒ only "Tổng: 6/9" renders. No `—`, no `null`, no empty separator (PM US4).
- **AC-13.5 (historical row)** `totalScore === null` ⇒ neither the total nor the level renders; a single muted line `{t('submissions.totalUnavailable')}` renders instead ("Bài này được chấm trước khi hệ thống tính tổng điểm."). No `0`, no `—/—`, no `NaN`, no missing element that shifts the layout.
- **AC-13.6 (`fix`)** For each dimension whose `scores[dim].fix` is a non-empty string, the `fix` text renders read-only beneath the `comment`, prefixed by `{t('submissions.scoreFix')}`. Absent/empty `fix` renders nothing (no empty label) — this is the common case, since only `output_fields: ["comment","fix"]` rubrics produce it.
- **AC-13.7 (read-only)** No new input, textarea, button or mutation. The review textarea, save, send and delete-media controls behave exactly as today; `PATCH /gradings/:id` and `POST /gradings/:id/send` are untouched.
- **AC-13.8** The pilot comparison card is unchanged (no total column there).
- **AC-13.9 (a11y)** The total/level line is plain text inside the existing scores card, keyboard- and screen-reader-reachable in the existing tab order; no new focusable element, no colour-only meaning.
- **AC-13.10** `Submissions.tsx` (the list) is unchanged — no total column in F9.

### FR-14 — i18n (US4)

- **AC-14.1** New keys added to **both** the `vi` and `en` blocks of `services/dashboard/src/i18n/index.ts`: `submissions.total`, `submissions.totalUnavailable`, `submissions.scoreFix`. Suggested vi: "Tổng điểm" / "Bài này được chấm trước khi hệ thống tính tổng điểm." / "Hướng sửa". en: "Total" / "Graded before total scoring was enabled." / "Fix".
- **AC-14.2** No hard-coded Vietnamese or English string appears in the JSX (every new string goes through `t()`).
- **AC-14.3** Level `code`/`label` are teacher-authored rubric content and are rendered **verbatim, untranslated**, in both locales.

---

## 3. Non-functional requirements

- **NFR-01 (performance — write path)** `computeTotal` is O(dimensions + |scores keys|) with no I/O. `POST /internal/gradings` adds at most two `SELECT`s and one `UPDATE` to what is already a `INSERT`; the added latency budget is < 20 ms and is dwarfed by the 30–90 s LLM call that preceded it.
- **NFR-02 (performance — read path)** Per AC-12.9: no new query, no N+1, one memoized normalize per distinct criteria per report.
- **NFR-03 (availability)** `computeTotal` and `validateLevels` never throw (AC-01.2, AC-06.8), so no rubric content can turn the grading write path into a RabbitMQ retry→DLQ loop. Queue topology, retry counters, the 48h outbound guard and DLQ behaviour are unchanged.
- **NFR-04 (backward compatibility)** Pre-F9 gradings keep rendering (AC-13.5) and keep counting in reports (AC-12.5/AC-12.6). No stored value is rewritten by F9 — the only writes are to the six new columns.
- **NFR-05 (no new dependency)** `services/core-api/package.json` and `services/dashboard/package.json` are untouched. No new runtime package, image, env var, compose service or Caddy route ⇒ **DevOps not required**.
- **NFR-06 (numeric hygiene)** No report or API field is ever `NaN`, `Infinity`, or a division-by-zero artefact. Percentages are capped at 100 % by clamping (BR-10) plus `total ≤ max`.
- **NFR-07 (style)** Vietnamese code comments in `rubric-scoring.ts`, in the changed parts of `worker-api.controller.ts` and `reports.service.ts`, and in the migration SQL header. Test names may stay English (matches the existing suites).
- **NFR-08 (test execution)** TS: `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Docs/Project/TTTA/services/core-api:/app" -w /app node:24-alpine sh -c "npm ci && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2"`. Dashboard likewise from its own service dir. The full pre-existing core-api suite (409 tests as of F8) must stay green with **unchanged assertions**.
- **NFR-09 (security)** No new endpoint, no new auth surface. `POST /internal/gradings` keeps `InternalTokenGuard`; `GET /submissions/:id` keeps `SessionAuthGuard`. Rubric-authored strings (`level.label`, `fix`) are rendered by React as text (auto-escaped) and never as HTML; they never reach SQL, a shell or a file path. AC-05.9 covers prototype pollution from LLM-authored JSON keys.
- **NFR-10 (auditability)** Because reports recompute (FR-12) and the columns are written once at grading time, a discrepancy between the two is a detectable bug rather than a silent divergence — AC-12.10 encodes exactly that check.

---

## 4. Use cases

### UC-01 — Worker posts a KID grading (happy path)
- **Actor:** grading-worker (system), via `InternalTokenGuard`.
- **Preconditions:** submission exists with `studentId` set and `receivedAt = T`; the course's latest `criteria` row holds a v2 KID rubric; the LLM returned 5 per-dimension scores.
- **Main flow:** worker `POST /internal/gradings` (body unchanged) → core-api loads criteria + submission → `normalizeRubric` → `computeTotal` ⇒ 18/25, level A1 → `$transaction([create grading with totalScore=18/levelCode="A1"/levelLabel="Mover (A1) ~ Junior Panda", updateMany student currentLevelCode="A1", currentLevelAt=T])` → 201 with the row.
- **A1:** the class has `autoSend=false` ⇒ nothing else changes; the review screen shows the total immediately.
- **A2:** the student's `currentLevelAt` is already newer than `T` (an out-of-order re-grade) ⇒ `updateMany` matches 0 rows; grading still written (AC-09.3/AC-09.4).
- **E1:** the LLM returned no usable scores ⇒ `counted = 0` ⇒ grading written with all three fields `null`, student untouched (AC-08.4).
- **E2:** the rubric has `levels: []` (IELTS) ⇒ `totalScore` written, `levelCode`/`levelLabel` null, student untouched (AC-09.6).
- **Postcondition:** exactly one `gradings` row; `students.current_level_*` reflects the newest graded submission; nothing was computed by the worker or the LLM.

### UC-02 — Admin opens a submission graded before F9
- **Actor:** admin/staff on `/submissions/:id`.
- **Preconditions:** the grading row predates the migration ⇒ `total_score IS NULL`.
- **Main flow:** detail loads → scores, feedback, review box render exactly as before → in place of the total, one muted line "Bài này được chấm trước khi hệ thống tính tổng điểm."
- **A1:** the same page for a post-F9 grading shows "Tổng: 18/25 — Mover (A1) ~ Junior Panda".
- **E1:** `grading.criteria.rubric` is unreadable garbage ⇒ `totalMax` is `null` ⇒ the AC-13.5 branch renders; no crash.
- **Postcondition:** no write; the page never displays `0`, `null` or `NaN`.

### UC-03 — Admin runs Reports over a date range spanning the deploy
- **Actor:** admin/staff on `/reports`.
- **Preconditions:** the range contains both pre-F9 and post-F9 gradings, across two courses with different band scales.
- **Main flow:** `fetchGradingsInRange` returns every grading with its pinned rubric (memoized normalize) → each row's percentage is **recomputed** via `computeTotal` → KPIs/trends/class-performance aggregate them.
- **A1:** a course whose rubric is `weighted_average` with uneven weights now reports a different (correct) number than it did pre-F9 — the intended behaviour change (AC-12.7).
- **A2:** a legacy `{band_scale:[0,3]}` rubric with no `dimensions` takes AC-02.7's path and reports the identical number as pre-F9 (AC-12.5).
- **E1:** a grading whose `scores` blob is empty/corrupt ⇒ `counted = 0` ⇒ excluded from the average (not counted as 0 %), same as today.
- **Postcondition:** every grading in the range contributes, regardless of vintage; `Grading.totalScore` was not read.

### UC-04 — Teacher authors a level table with a gap (F10/F12 preview)
- **Actor:** teacher, via the future template API/drawer.
- **Preconditions:** F9 has shipped `validateLevels`; F10 wires it.
- **Main flow:** teacher enters `0–10, 12–20` → `validateLevels` returns one `level_gap` with a Vietnamese message naming 10 and 12 → the caller rejects the save.
- **A1:** in F9 itself nothing calls it — a rubric with a gapped `levels` array can still be stored via a direct DB/JSON route, and `computeTotal` degrades to `level = null` for totals in the hole (AC-04.3).
- **Postcondition:** no bad level table can be *authored* once F10 wires the validator; a bad one that already exists never crashes grading.

### UC-05 — Sibling submissions from one Zalo account
- **Actor:** grading-worker.
- **Preconditions:** one `zaloUserId` with two `active` bindings to students X and Y; the worker has already resolved each submission to one of them.
- **Main flow:** submission A (student X) grades to level A1 ⇒ only X's row updates. Submission B (student Y) grades to A0 ⇒ only Y's row updates.
- **Postcondition:** two independent `current_level_code` values; the binding table was never consulted by the scoring path (AC-09.7).

---

## 5. Business rules

- **BR-01** The LLM is never asked to add up, average, or name a level. (Design doc Phần 5; inherited from F8 BR-09.)
- **BR-02** Total and level are computed in **core-api only** — never in grading-worker, never in the dashboard, never in SQL. One implementation, `computeTotal`.
- **BR-03** `weight` affects the number **only** under `weighted_average`. Under `sum` and `average` it is ignored. This is what reproduces the Cambridge PDF's literal "tổng tối đa = 25" for a 5×5 rubric regardless of the weights an author happens to leave in the table.
- **BR-04** `computeTotal` repairs, it never rejects (inherits F8 BR-04). The rubric lifecycle keeps exactly two rejection points — the `.docx` upload gate and the worker's `pronunciation` gate — plus, from F10 onward, the authoring API using `validateLevels`.
- **BR-05** `counted === 0` ⇒ no total, no level, and `NULL` in the database. "No usable score" is never recorded as zero.
- **BR-06** Reports recompute from `scores`; they never read `Grading.totalScore`. (FR-12, with its five justifications.)
- **BR-07** No backfill, ever. `NULL` in the new columns means "not computed", and pre-F9 rows keep that value permanently unless re-graded.
- **BR-08** Level intervals are inclusive on both ends; on an overlap, the first matching entry in array order wins.
- **BR-09** `Student.currentLevel*` is a snapshot of the most recently *submitted* graded work (by `receivedAt`), not a high-water mark; it may move down; an older re-grade cannot overwrite a newer level.
- **BR-10** Per-dimension scores are clamped into `[scale.min, scale.max]` before aggregation, and the clamped keys are reported. This guarantees `total ≤ max` and therefore percentages ≤ 100 %.
- **BR-11** `Grading.studentAckAt` is created by F9 and written only by F11. F9 code must not reference it outside the schema.
- **BR-12** `computeTotal` consumes an already-normalized `RubricV2` and never calls `normalizeRubric` itself; normalization is the caller's responsibility, done once per read (AC-08.2, AC-12.2). This keeps the function pure, cheap and free of a second version-branching site.
- **BR-13** `Grading.criteriaId` pins an immutable criteria version; recomputation is therefore reproducible. No code path may mutate an existing `criteria.rubric` (F8 FR-16 / AC-16.2 remains in force).
- **BR-14** The `average` path is the compatibility contract: for a v1-normalized rubric it must reproduce the pre-F9 arithmetic exactly, or the fix has broken the reports it was meant to correct.

---

## 6. Assumptions

1. **A1 (from PM)** No retroactive backfill. Accepted with the display and reporting consequences specified explicitly (AC-13.5, FR-12).
2. **A2 (from PM)** `studentAckAt` ships in this migration although F11 writes it — one migration instead of two, matching the design doc's Phần 8 grouping.
3. **A3** `aggregation.round` stays the two values F8 assumed (`none | nearest_int`); F9 now defines their semantics (FR-03), closing F8's OQ-1. Adding a third mode later is non-breaking.
4. **A4** `Grading` has no `createdAt` column and F9 does not add one; `Submission.receivedAt` is used wherever a grading timestamp is needed (AC-09.2).
5. **A5** `Float`/`DOUBLE PRECISION` is the right type for `totalScore`. `average` produces non-terminating decimals (`6.25`, `6.333…`); `Decimal` would buy exactness nobody needs and would complicate the recompute-equality check (AC-12.10), which relies on both sides being the same IEEE double.
6. **A6** The LLM output schema makes `scores`' key set equal the rubric's dimension key set (F8 AC-09.2), so the "extra/missing dimension" branches are defensive, not routine. They are still fully specified because legacy rows and provider drift can violate it.
7. **A7** Criteria rows are immutable versions (BR-13), so recompute-from-`scores` is stable over time. If a future feature ever mutates a stored rubric in place, FR-12's decision must be revisited in the same commit.
8. **A8** The two source-PDF rubrics used as fixtures in FR-07 are hand-built in F9 and re-pointed at F10's seed templates when those land — F10's seeds remain the single copy of that data (F8 AC-15.9).

## 7. Dependencies

- **Upstream:** F8 (DONE, QA-passed) — `RubricV2`, `RubricLevel`, `aggregation`, `levels`, `normalizeRubric`. F9 imports these types and must not redefine them. F9-pm.md (DONE).
- **Downstream:** **F10** wires `validateLevels` into the template/JSON write endpoints (400) and replaces FR-07's hand-built fixtures with its seeds; **F11** writes `Grading.studentAckAt` and reads `totalScore`/`levelLabel` for `student_reply.show_total`/`show_level`; **F12** reuses `maxTotal`/`findLevel`/`validateLevels` semantics in the drawers (its own `lib/rubric.ts` must not re-derive different math).
- **Roles needed:** **backend (TS)** — the whole of FR-01…FR-12 plus the migration (per F1/F2 precedent the backend author writes the hand-authored SQL, so a **separate DBA role is not required**; if one is engaged, the entire DBA scope is §1.1 + FR-11). **frontend** — FR-13/FR-14 (small). **QA** — the numbered ACs here. **UX not required**: two lines of read-only text inside an existing card, reusing existing components and existing typography/muted styles; no new layout, flow or component. **DevOps not required** (NFR-05).
- **No dependency** on Zalo, Google or LLM credentials — every AC in F9 is unit-testable offline.

## 8. Open questions

1. **OQ-1 (non-blocking, decided by BR-03)** Should `sum` apply `weight`? PM's US1 says no, and it reproduces the PDF. The cost: an author who sets `method: "sum"` with uneven weights gets weights silently ignored. Mitigation is F12's editor showing the computed maximum live; if the centre ever wants weighted sums, the honest fix is a fourth method (`weighted_sum`), not changing `sum`'s meaning under existing rubrics.
2. **OQ-2 (non-blocking, decided by AC-09.6)** When a grading yields no level, should `Student.currentLevel*` be cleared or preserved? F9 preserves (non-destructive). A student moved from a KID course to IELTS therefore keeps a stale-looking level. Revisit if the level is ever surfaced to students or parents.
3. **OQ-3 (non-blocking, decided by AC-03.4/FR-12)** `nearest_int` is applied inside `computeTotal`, so report percentages for IELTS-shaped rubrics use the rounded total (6/9 = 66.7 %) rather than the raw mean (6.25/9 = 69.4 %). One function, one number everywhere. No historical impact (no v2 rubric exists before F10). Flagged in case analytics later wants unrounded precision — that would need a second, explicitly-named accessor, not a change to `computeTotal`.
4. **OQ-4 (closed by decision, recorded per the coordinator's instruction)** Should `GET /internal/criteria/:courseId` normalize server-side now that core-api normalizes at the grading write path? **The argument for:** core-api would then hold the single normalization implementation, and the Python copy — with its `_js_trim`/`_to_text` JS-emulation burden documented at length in F8-backend — could be deleted. **The decision: NO, and F9 does not specify it.** F8's QA verified the endpoint stays verbatim, and the Python `normalize_rubric` has exactly one production caller; removing it turns the cross-language drift guard (F8 FR-15) into theatre while the Python module rots in the tree. If the project ever wants this, it must be its own feature that deletes the Python module and its test in the same commit.
5. **OQ-5 (non-blocking, tracked — logged to the Emergent backlog as an F10 action)** AC-12.4 splices `bandMaxFromRubric(raw)` into `scale.max` on the **report** path, while AC-08.1 hands the un-spliced normalized rubric to `computeTotal` on the **write** path. For a rubric with an explicitly non-positive `scale.max` the two disagree: the grading would store `total = 0 ⇒ "A0 ~ Tiny Rabbit"` while reports show 18/25. Unreachable through any current authoring path (the `.docx` parser cannot emit it and no JSON write endpoint exists until F10), so **no change is made in F9**. The fix belongs at the authoring boundary: F10 rejects `scale.max <= 0`. Raised by QA against this file after F9's gate; recorded here so it is not rediscovered as a new defect.
6. **OQ-6 (non-blocking)** `clamped` is currently only a diagnostic in the return value. Whether an out-of-range LLM score should also raise a `flags` row for advisor attention is a product question for a later feature; F9 records it and moves on.

---

## Outputs (what this role produced)

- **This file** — the complete F9 functional spec: 14 FRs with **101 numbered acceptance criteria**, 10 NFRs, 5 use cases, 14 business rules, the new-column data dictionary, 8 assumptions, 6 open questions (two closed by explicit decision, one tracked to F10).
- **Post-QA correction (2026-08-21):** AC-07.5's level was corrected `A0` → `A1-` against the source PDF (see the note inline). No other AC changed; F9 shipped green (core-api 32 suites / 502 tests).
- **Files the implementers will touch** (from FR traceability):
  - **New:** `services/core-api/src/lib/rubric-scoring.ts` (FR-01…FR-06); `services/core-api/src/lib/rubric-scoring.spec.ts` (FR-07 fixtures + every edge AC); `services/core-api/prisma/migrations/20260821HHMMSS_add_grading_totals_and_student_level/migration.sql` (FR-11).
  - **Changed:** `services/core-api/prisma/schema.prisma` (6 nullable fields); `services/core-api/src/worker-api/worker-api.controller.ts` (`createGrading` → compute + persist + student level, FR-08/FR-09); `services/core-api/src/reports/reports.service.ts` (`fetchGradingsInRange` + `scorePctForGrading`, FR-12); `services/core-api/src/submissions/submissions.service.ts` (`detail()` adds `totalMax`, AC-13.1); `services/dashboard/src/pages/SubmissionDetail.tsx` (FR-13); `services/dashboard/src/i18n/index.ts` (FR-14, both locale blocks).
  - **Explicitly unchanged:** everything under `services/grading-worker/` and `services/zalo-gateway/` (FR-10); `criteria/rubric-schema.ts`; `worker-api`'s `GET criteria/:courseId` (OQ-4); `CreateGradingDto`; `gradings.service.ts`; `Submissions.tsx`; all three `contracts` files; `package.json` files.

## Blockers / open questions

None blocking. §8's six open questions are all non-blocking: OQ-1, OQ-2, OQ-3 and OQ-4 are decided in this spec with the rationale recorded; OQ-5 is tracked as an F10 action (Emergent backlog); OQ-6 is deferred to a later feature.

## Notes for the next role

- **Backend:** the two traps are (a) **AC-02.7** — a rubric with no `dimensions` must fall back to the `scores` keys, or you will null out every historical report row and break `analytics.spec.ts` (that fixture is `{ band_scale: [0,3] }` with no dimensions); and (b) **AC-12.4** — hand `computeTotal` the normalized rubric but splice `bandMaxFromRubric(raw)` into `scale.max` when the normalized one is `<= 0`, because `normalizeRubric` whitelists `band_scale` away. Write FR-07's twelve worked examples first; they pin both PDFs.
- **QA:** the strongest evidence is not new tests but the pre-existing core-api suite (409 tests after F8) passing with **unchanged assertions** — that is NFR-04 in practice. The two numbers to check by hand are AC-07.1 (18/25 → "Mover (A1) ~ Junior Panda") and AC-07.12 (weighted 6.2→6 vs. unweighted 6.25 — the proof the standing bug was real). AC-12.10 (recomputed total == stored `totalScore`) is the invariant that keeps FR-12's decision honest.
- **Frontend:** read-only, two lines plus a `fix` sub-line. `totalMax` comes from the API (AC-13.1) — do **not** re-derive the scoring math in the dashboard; `lib/rubric.ts` belongs to F12.
- **F11 owner:** `Grading.studentAckAt` exists after this migration and is `NULL` on every row; `totalScore`/`levelLabel` are populated from F9's deploy onward and are what `student_reply.show_total`/`show_level` should read.
