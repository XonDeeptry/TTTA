# F8 · BA — Rubric schema v2 + `normalizeRubric` v1→v2 shim (TS + Python)

- **Owner role:** ba
- **Feature:** F8 — Rubric schema v2 types, a pure `normalizeRubric()` shim duplicated in core-api (TS) and grading-worker (Python), docx-parser emitting v2, and worker schema/prompt builders consuming v2. Pure code + types, zero DB migration.
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** F8-pm.md

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F8-pm.md` — US1–US5 (MoSCoW), in/out of scope, 3 assumptions.
- `Idea/20260819-ChamDiemRubricV2.md` **Part 3** (v2 schema + v1→v2 mapping table — authoritative, not redesigned here), Part 1 (source-PDF analysis), Part 5 (scoring stays server-side — F9), Part 8 (file scope), Part 10 (acceptance).
- `CLAUDE.md` — no npm on host (TS tests via Docker, **service dir is the only mounted path**), Vietnamese code comments in the 3 backend services, contracts triplication precedent.
- Code read for grounding: `services/core-api/src/criteria/docx-parser.ts`, `docx-parser.spec.ts`, `criteria.service.ts`, `criteria.controller.ts`, `worker-api/worker-api.controller.ts` (`GET internal/criteria/:courseId`), `reports/reports.service.ts` (`bandMaxFromRubric`, `dimensionScore`, `scorePctForGrading`), `grading-worker/.../grading/schema.py`, `grading/prompt.py`, `pipeline.py`, `tests/test_schema.py`, `tests/test_pipeline.py`, `core-api/package.json` (jest `roots: <rootDir>/src`), `grading-worker/pyproject.toml` (`testpaths = ["tests"]`).

## Checklist

- [x] Read TASK-PROTOCOL + template
- [x] Read F8-pm.md (upstream)
- [x] Read design doc Part 3 mapping table + Parts 1/5/8/10
- [x] Read all 6 code files in scope + their existing tests
- [x] Define exact v2 TS interface + exact Python equivalent (data dictionary)
- [x] Turn the Part 3 mapping table into numbered testable ACs (FR-03/FR-04)
- [x] Specify docx-parser v2 output + unchanged `pronunciation` gate (FR-06/FR-07)
- [x] Specify `schema.py` and BOTH `prompt.py` builders (FR-09..FR-12)
- [x] Specify `reports.service.ts` dual-shape tolerance (FR-14)
- [x] Specify shared fixture location + cross-language equivalence test (FR-15)
- [x] Business rules, NFRs, use cases, assumptions/dependencies/open questions

---

# Functional specification — F8

## 0. Scope & traceability

| FR | Title | Traces to |
| :-- | :-- | :-- |
| FR-01 | v2 type module + `normalizeRubric` (TypeScript) | US1 |
| FR-02 | v2 type module + `normalize_rubric` (Python) | US2 |
| FR-03 | v1 → v2 normalization rules (Part 3 mapping table) | US1, US2 |
| FR-04 | v2 → v2 pass-through, default fill, idempotency | US1, US2 |
| FR-05 | Degenerate / malformed input tolerance | US1, US2 |
| FR-06 | `docx-parser.ts` emits v2 directly | US4 |
| FR-07 | Mandatory `pronunciation` gate at upload — unchanged behaviour | US4 |
| FR-08 | core-api read paths call `normalizeRubric`; worker-facing endpoint unchanged | US1 |
| FR-09 | `grading/schema.py` builds the LLM output schema from v2 | US5 |
| FR-10 | Mandatory `pronunciation` gate at grading — unchanged behaviour | US5 |
| FR-11 | `prompt.py` audio builder renders v2 | US5 |
| FR-12 | `prompt.py` text/pilot builder renders v2 | US5 |
| FR-13 | `pipeline.py` normalizes once per submission | US5 |
| FR-14 | `reports.service.ts` tolerates both rubric shapes | US1 (regression guard) |
| FR-15 | Shared fixture + cross-language equivalence test | US3 |
| FR-16 | Zero data migration / no persisted mutation | US1 (hard requirement) |

**Out of scope (do not build in F8):** `computeTotal` and any use of `aggregation`/`levels` for real scoring (F9); any Prisma migration (F9); `RubricTemplate` table, seeds, CRUD, `privileges` (F10); Zalo buttons and any use of `student_reply.buttons` (F11); dashboard drawers / any UI (F12); re-saving stored v1 rubrics as v2 (never — see BR-01).

---

## 1. Data dictionary — rubric schema v2

### 1.1 TypeScript (`services/core-api/src/criteria/rubric-schema.ts`)

Exported names are normative — F9/F10/F12 will import them.

```ts
export type AggregationMethod = 'sum' | 'average' | 'weighted_average';
export type RoundingMode = 'none' | 'nearest_int';
export type OutputField = 'comment' | 'fix';

export interface RubricScale { min: number; max: number; step: number; }
export interface RubricAggregation { method: AggregationMethod; round: RoundingMode; }
export interface RubricLevel { min: number; max: number; code: string; label: string; }
export interface RubricSubFactor { label: string; by_band: Record<string, string>; }
export interface RubricDimensionV2 {
  key: string;                       // khóa máy, ổn định
  label: string;                     // nhãn giáo viên thấy
  weight: number;
  bands: Record<string, string[]>;   // band -> danh sách gạch đầu dòng
  sub_factors: RubricSubFactor[];    // luôn có mặt; [] nếu không dùng
}
export interface CommentBankEntry {
  dimension: string | null;          // null = dùng chung mọi tiêu chí
  intent: string | null;             // "khen" | "góp ý" | ... (tự do); null = không phân loại
  text: string;
}
export interface StudentReplyButton { title: string; action: string; }
export interface StudentReply {
  show_total: boolean; show_level: boolean; template: string;
  buttons: StudentReplyButton[];
}
export interface RubricV2 {
  schema_version: number;            // >= 2
  course_key: string;
  task_type: string;
  tone: string;
  feedback_language: string;
  scale: RubricScale;
  aggregation: RubricAggregation;
  levels: RubricLevel[];             // luôn có mặt; [] = không quy đổi cấp độ
  output_fields: OutputField[];
  dimensions: RubricDimensionV2[];
  comment_bank: CommentBankEntry[];  // luôn có mặt; [] nếu trống
  student_reply: StudentReply | null;// null nếu khóa không định nghĩa
}
export function normalizeRubric(input: unknown): RubricV2;
```

The v1 interface stays exported from `docx-parser.ts` for reference but is no longer the parser's return type (FR-06). `normalizeRubric` accepts `unknown` because `Prisma.JsonValue` is what every call site actually holds.

### 1.2 Python (`services/grading-worker/src/grading_worker/grading/rubric_schema.py`)

Field-for-field identical JSON shape. Types are `TypedDict` (matches the codebase's `dict[str, Any]` style; no pydantic dependency added).

```python
PRONUNCIATION_DIMENSION = "pronunciation"   # re-exported for schema.py

class RubricScale(TypedDict): min: int | float; max: int | float; step: int | float
class RubricAggregation(TypedDict): method: str; round: str
class RubricLevel(TypedDict): min: int | float; max: int | float; code: str; label: str
class RubricSubFactor(TypedDict): label: str; by_band: dict[str, str]
class RubricDimensionV2(TypedDict):
    key: str; label: str; weight: int | float
    bands: dict[str, list[str]]; sub_factors: list[RubricSubFactor]
class CommentBankEntry(TypedDict): dimension: str | None; intent: str | None; text: str
class StudentReplyButton(TypedDict): title: str; action: str
class StudentReply(TypedDict):
    show_total: bool; show_level: bool; template: str; buttons: list[StudentReplyButton]
class RubricV2(TypedDict):
    schema_version: int; course_key: str; task_type: str; tone: str; feedback_language: str
    scale: RubricScale; aggregation: RubricAggregation; levels: list[RubricLevel]
    output_fields: list[str]; dimensions: list[RubricDimensionV2]
    comment_bank: list[CommentBankEntry]; student_reply: StudentReply | None

def normalize_rubric(raw: Any) -> RubricV2: ...
```

Python function name is `normalize_rubric` (PEP8); the JSON it produces is byte-equivalent to the TS one (FR-15).

### 1.3 Field table (validation is *repair-with-default*, not rejection — see BR-04)

| Field | Type | Required after normalize | Default when absent/invalid | Notes |
| :-- | :-- | :-- | :-- | :-- |
| `schema_version` | number | yes | `2` | `>= 2` ⇒ v2 branch |
| `course_key` | string | yes | `""` | copied verbatim |
| `task_type` | string | yes | `"speaking_clip"` | |
| `tone` | string | yes | `"khích lệ"` | |
| `feedback_language` | string | yes | `"vi"` | `vi`/`en`/`bilingual` by convention, not enforced |
| `scale.min` | number | yes | `0` | |
| `scale.max` | number | yes | `3` | matches every existing fallback in the repo (BR-06) |
| `scale.step` | number | yes | `1` | must be `> 0`; `<= 0` or non-finite ⇒ `1` |
| `aggregation.method` | enum | yes | `"average"` | unknown string ⇒ `"average"` (BR-03) |
| `aggregation.round` | enum | yes | `"none"` | unknown string ⇒ `"none"` |
| `levels[]` | array | yes | `[]` | contents copied verbatim; **F8 does not validate coverage/overlap — F9 does** |
| `output_fields[]` | array | yes | `["comment"]` | values outside `comment`/`fix` are kept in the array but ignored by FR-09 |
| `dimensions[].key` | string | yes | from `name`; else `""` | machine key |
| `dimensions[].label` | string | yes | from `name`; else `key` | |
| `dimensions[].weight` | number | yes | `1` | non-finite ⇒ `1` |
| `dimensions[].bands` | `Record<string,string[]>` | yes | `{}` | see FR-03 AC-03.5 |
| `dimensions[].sub_factors` | array | yes | `[]` | |
| `comment_bank[]` | array | yes | `[]` | |
| `comment_bank[].dimension` | string \| null | yes | `null` | free string; not checked against `dimensions[].key` |
| `comment_bank[].intent` | string \| null | yes | `null` | free string |
| `comment_bank[].text` | string | yes | — | entries whose text trims to `""` are dropped |
| `student_reply` | object \| null | yes | `null` | copied verbatim when present; F11 consumes it |

---

## 2. Functional requirements

### FR-01 — v2 type module + `normalizeRubric` (TypeScript)

New file `services/core-api/src/criteria/rubric-schema.ts` exporting everything in §1.1.

- **AC-01.1** The module has no imports from `@nestjs/*`, Prisma, Redis, `fs`, or any I/O — it is a pure module (verifiable by reading the import list; a unit test can import it standalone).
- **AC-01.2** `normalizeRubric(input)` never throws for any JSON-serialisable input, including `null`, `undefined`, `42`, `"x"`, `[]`, `{}`.
- **AC-01.3** `normalizeRubric` does not mutate its argument. Given a deep-frozen v1 object, when normalized, then no error is thrown and a `JSON.stringify` of the input taken before and after the call is identical.
- **AC-01.4** The returned object contains exactly the 12 top-level keys of `RubricV2` — no more (BR-05), no fewer.
- **AC-01.5** Code comments in the file are Vietnamese, matching `docx-parser.ts` style.

### FR-02 — v2 type module + `normalize_rubric` (Python)

New file `services/grading-worker/src/grading_worker/grading/rubric_schema.py` exporting everything in §1.2.

- **AC-02.1** Pure module: imports only from `typing`/stdlib. No `httpx`, no redis, no core-api client.
- **AC-02.2** `normalize_rubric(raw)` never raises for any JSON-decodable input including `None`, `42`, `"x"`, `[]`, `{}`.
- **AC-02.3** Does not mutate its argument: given a v1 dict, `copy.deepcopy` taken before the call equals the argument after the call.
- **AC-02.4** Returns exactly the 12 top-level keys of `RubricV2`.
- **AC-02.5** Behaviour is identical to FR-01/FR-03/FR-04/FR-05 in every AC below; where an AC says "the function", it means both implementations.
- **AC-02.6** Comments in Vietnamese, matching `schema.py` style.

### FR-03 — v1 → v2 normalization (Part 3 mapping table)

Applies when the input is an object whose `schema_version` is absent, not a number, or `< 2`.

- **AC-03.1** `band_scale: [0, 5]` ⇒ `scale: { min: 0, max: 5, step: 1 }`.
- **AC-03.2** `band_scale` absent ⇒ `scale: { min: 0, max: 3, step: 1 }`. `band_scale` present but not an array of ≥2 finite numbers (e.g. `["a", null]`, `[]`, `5`) ⇒ same `{0,3,1}` default.
- **AC-03.3** `dimensions[].name: "fluency"` ⇒ `key: "fluency"` **and** `label: "fluency"` — the same value, **verbatim, no case change** (BR-07).
- **AC-03.4** `dimensions[].weight` copied as-is; absent or non-finite ⇒ `1`.
- **AC-03.5** `bands: { "0": "mô tả" }` ⇒ `bands: { "0": ["mô tả"] }`. Per band value: a string ⇒ `[trimmed]`, or `[]` if it trims to empty; an array ⇒ each element stringified+trimmed, empties dropped; any other type ⇒ `[String(value).trim()]`, `[]` if empty. Band keys are copied verbatim as strings.
- **AC-03.6** `dimensions` absent or not an array ⇒ `dimensions: []`. Non-object array entries are skipped.
- **AC-03.7** `few_shot_examples: ["a", "b"]` ⇒ `comment_bank: [{dimension: null, intent: null, text: "a"}, {…"b"}]`, order preserved. Entries that trim to empty are dropped. `few_shot_examples` absent ⇒ `comment_bank: []`.
- **AC-03.8** `aggregation` is absent in v1 ⇒ `{ method: "average", round: "none" }` — this is what makes today's report numbers reproducible (BR-03).
- **AC-03.9** `levels: []` and `output_fields: ["comment"]` and `sub_factors: []` per dimension and `student_reply: null`.
- **AC-03.10** `schema_version` in the output is `2`.
- **AC-03.11** `course_key`, `task_type`, `tone`, `feedback_language` copied when they are strings, else defaulted per §1.3.
- **AC-03.12** The complete round-trip of the current `docx-parser` v1 output (the object produced by `parseRubricFromHtml(VALID_HTML)` in the existing spec file) equals the fixture case `v1_docx_parser_output` (FR-15).

### FR-04 — v2 pass-through, default fill, idempotency

Applies when the input is an object whose `schema_version` is a number `>= 2`.

- **AC-04.1** A complete v2 rubric (all 12 keys present and well-formed) is returned deep-equal to the input, with **no** transformation: `bands` arrays are not re-wrapped, `key`/`label` are not re-derived, `comment_bank` is not rebuilt.
- **AC-04.2** Absent optional keys are filled with the §1.3 defaults; **present** keys are never overwritten, including intentionally empty ones (`output_fields: []` stays `[]`, `levels: []` stays `[]`).
- **AC-04.3** Mixed-shape tolerance: a `schema_version: 2` object that still carries `band_scale` (and no `scale`) gets `scale` derived per AC-03.1; one that carries `few_shot_examples` (and no `comment_bank`) gets `comment_bank` derived per AC-03.7; a dimension with `name` but no `key` gets `key`/`label` per AC-03.3.
- **AC-04.4** Per-dimension repairs in the v2 branch: `label` absent ⇒ `label = key`; `key` absent but `label` present ⇒ `key = label`; `sub_factors` absent or not an array ⇒ `[]`; band values that are strings are wrapped (AC-03.5), band values that are already arrays are left untouched.
- **AC-04.5** `schema_version > 2` (e.g. `3`) is treated as the v2 branch and the value is preserved, not clamped to 2 — forward compatibility, no crash.
- **AC-04.6 (idempotency, both languages)** For every fixture case: `normalize(normalize(x))` deep-equals `normalize(x)`.

### FR-05 — degenerate input tolerance

- **AC-05.1** `normalize(null)`, `normalize(undefined)/None`, `normalize(42)`, `normalize("x")`, `normalize([])` each return the all-defaults v2 object with `dimensions: []`, `comment_bank: []`, `levels: []`, `output_fields: ["comment"]`, `scale {0,3,1}`, `aggregation {average,none}`, `student_reply: null`, `course_key: ""`.
- **AC-05.2** `sub_factors` entries that are not objects are dropped; an entry missing `by_band` gets `by_band: {}`; `by_band` values are stringified.
- **AC-05.3** `comment_bank` entries that are not objects, or whose `text` is missing/blank after trim, are dropped. `dimension`/`intent` that are not strings become `null`.
- **AC-05.4** `levels` entries are copied verbatim if they are objects; non-objects are dropped. No range validation in F8 (F9 owns that).

### FR-06 — `docx-parser.ts` emits v2 directly

`parseRubricFromHtml` / `parseRubricFromDocxBuffer` return `RubricV2`. **The accepted `.docx` mini-format is UNCHANGED** — no new headings, no new line syntax.

- **AC-06.1** Given the existing `VALID_HTML` fixture, the result has `schema_version: 2`, `scale: {min:0,max:3,step:1}`, and **no** `band_scale` / `name` / `few_shot_examples` keys anywhere.
- **AC-06.2** Each dimension has `key` = the parsed name lowercased and trimmed, and `label` = the parsed name **as written in the document**. For `VALID_HTML` (already lowercase) `key === label` for all three dimensions.
- **AC-06.3** Given `<p>Pronunciation (trọng số 0.5): 0=Khó nghe; 3=Chuẩn</p>`, the dimension has `key: "pronunciation"`, `label: "Pronunciation"` — this closes the existing latent mismatch where the upload gate compared case-insensitively but the worker's gate compared exactly (BR-08).
- **AC-06.4** `bands` values are single-element string arrays: `{ '0': ['Nói rời rạc'], '3': ['Nói trôi chảy tự nhiên'] }`. Multi-bullet authoring is not reachable through `.docx` in F8 (arrives with F12's Drawer 2) — the `;` band separator keeps its current meaning.
- **AC-06.5** The "Ví dụ nhận xét mẫu" paragraphs become `comment_bank: [{dimension: null, intent: null, text: <paragraph>}, …]`, order preserved.
- **AC-06.6** Docx-imported rubrics get `aggregation: {method: "average", round: "none"}`, `levels: []`, `output_fields: ["comment"]`, `sub_factors: []` per dimension, `student_reply: null`.
- **AC-06.7** `normalizeRubric(parseRubricFromHtml(html))` deep-equals `parseRubricFromHtml(html)` — the parser output is already a normalize fixed point.
- **AC-06.8** `criteria.service.ts`'s `title` (`${rubric.course_key} — ${rubric.task_type}`) is unchanged and still resolves, since both fields survive into v2.
- **AC-06.9** The existing spec file `docx-parser.spec.ts` is updated in place (not duplicated); every existing assertion has a v2 equivalent, and the two rejection tests (`pronunciation`, missing headings) keep their current expectations verbatim.

### FR-07 — mandatory `pronunciation` gate at upload (unchanged)

- **AC-07.1** Given a `.docx` with no dimension whose name lowercases to `pronunciation`, when parsed, then a `BadRequestException` (HTTP 400) is thrown with the **same message string as today** ("Rubric thiếu dimension bắt buộc "pronunciation" (mục 3.10) …").
- **AC-07.2** The missing-headings rejection ("File .docx không đúng template chuẩn …") is unchanged, message included.
- **AC-07.3** No new rejection reason is introduced by F8 at the upload gate.

### FR-08 — call sites in core-api

- **AC-08.1** `CriteriaService.get(id)` and `.list(courseId)` return rows whose `rubric` field has been passed through `normalizeRubric` — read-time only, **no `prisma.criteria.update` anywhere** (FR-16).
- **AC-08.2** `GET /internal/criteria/:courseId` in `worker-api.controller.ts` is **unchanged** — it keeps returning the stored row verbatim. Rationale: the worker's own `normalize_rubric` must stay load-bearing in production, otherwise the Python copy becomes dead code and drifts (this is the whole point of FR-15). Any downstream role changing this must say so explicitly.
- **AC-08.3** `CriteriaService.ingestDocx` stores the parser's v2 output as-is; it does **not** call `normalizeRubric` again (AC-06.7 already guarantees fixed point) and its existing version-increment logic is untouched. `criteria.service.spec.ts`'s mocked parser return value may need its shape updated but its assertions (version increment, sourceFilename) must still pass.

### FR-09 — `grading/schema.py` builds the output schema from v2

- **AC-09.1** `build_output_schema(rubric)` calls `normalize_rubric(rubric)` at entry. Consequence: the existing `tests/test_schema.py` v1 `RUBRIC` fixture keeps passing **unchanged** — this is the regression guard for BR-01.
- **AC-09.2** Dimension property names come from `dimension["key"]` (previously `name`), in `dimensions` array order, and `scores.required` lists exactly those keys.
- **AC-09.3** Score bounds come from `scale`: `minimum = scale.min`, `maximum = scale.max`.
- **AC-09.4** When `scale.step == 1` the score property is `{"type": "integer", minimum, maximum}` (today's behaviour). When `scale.step != 1` it is `{"type": "number", minimum, maximum, "multipleOf": step}`.
- **AC-09.5** `comment` is a required string property of each dimension when `output_fields` contains `"comment"`; `fix` is a required string property of each dimension when `output_fields` contains `"fix"`. Both present ⇒ `required == ["score", "comment", "fix"]` in that order.
- **AC-09.6** If `output_fields` after normalize contains neither `comment` nor `fix` (e.g. `[]` or only unknown values), the builder falls back to `["comment"]` — a dimension is never emitted with `score` alone.
- **AC-09.7** Values in `output_fields` other than `comment`/`fix` are ignored (no property emitted, no error).
- **AC-09.8** The `pronunciation` dimension still gets the `mispronounced_words` array property with the same inner schema and the same `required` entry as today; no other dimension does.
- **AC-09.9** Top level is unchanged: `{"type":"object","properties":{"scores":…,"feedback":{"type":"string"}},"required":["scores","feedback"]}`.
- **AC-09.10** Duplicate `dimensions[].key` values ⇒ `RubricError` (defensive; a duplicate would silently drop a dimension from the schema).
- **AC-09.11** `validate_output` is unchanged.

### FR-10 — mandatory `pronunciation` gate at grading (unchanged)

- **AC-10.1** A rubric whose normalized `dimensions` contains no `key == "pronunciation"` (exact, case-sensitive) ⇒ `RubricError` with the same message as today. The only change is the field read (`key` instead of `name`).
- **AC-10.2** For every v1 rubric, `key == name`, so the set of rubrics rejected by this gate is **identical before and after F8** — no rubric that graded yesterday starts failing today, and none that was rejected starts passing.

### FR-11 — `prompt.py` audio builder renders v2

`build_system_instruction(rubric)` calls `normalize_rubric` at entry (AC-09.1 rationale) and renders:

- **AC-11.1** The 6 existing header lines (role, `course_key`/`task_type`, tone, feedback language, "CHỈ đánh giá dựa trên nội dung audio", "Chấm từng tiêu chí…") are unchanged in wording and order.
- **AC-11.2** Each dimension renders as a header line containing `label`, the machine `key`, and the weight, followed by one block per band. Band descriptors render as **one bullet line per array element**, never `;`-joined.
- **AC-11.3** Band blocks are ordered numerically ascending when every band key parses as a number; otherwise insertion order is preserved. Rendering is deterministic (NFR-05).
- **AC-11.4** A dimension with a non-empty `sub_factors` renders a labelled grid: one line per sub-factor with its `label` and its `by_band` pairs in ascending band order. A dimension with `sub_factors: []` renders no grid block and no empty header.
- **AC-11.5** `comment_bank` renders grouped by dimension, then by intent within a dimension: a group header per dimension (using the dimension's `label` when the `dimension` value matches a known `key`, else the raw value), entries prefixed with their `intent` when non-null. Entries with `dimension: null` form a final "chung" group. Group order = order of first appearance in `dimensions`, then unknown dimensions in bank order, then the null group last.
- **AC-11.6** A v1 rubric's `few_shot_examples` therefore still reach the prompt (as the "chung" group) — no teacher content is lost by the migration.
- **AC-11.7** When `output_fields` contains `fix`, the prompt states that each dimension needs both a comment and a concrete fix ("hướng sửa bài"); when it does not, only the comment is requested. The instruction wording matches the JSON schema field names exactly (`comment`, `fix`).
- **AC-11.8** The existing `pronunciation`/`mispronounced_words` instruction line and the closing "Trả về đúng theo schema JSON…" line are unchanged and remain last.
- **AC-11.9 (hard boundary, Part 5)** The prompt contains **no** `levels` content and **no** instruction to compute a total, an average or a level. Testable: for the KID fixture, `"Tiny Rabbit"` and `"25"`-as-total do not appear in the rendered prompt.
- **AC-11.10** `build_user_instruction()` is unchanged.

### FR-12 — `prompt.py` text/pilot builder renders v2

- **AC-12.1** `build_system_instruction_text(rubric)` gets the identical dimension block, sub-factor grid, comment-bank block and `output_fields` instruction as FR-11 — implemented by **shared private helpers called from both builders**, not copy-pasted. Testable: the dimension/comment-bank substring rendered for a given rubric appears verbatim in both prompts.
- **AC-12.2** Everything specific to the pilot branch is unchanged: the "CHỈ nhận được BẢN CHÉP LỜI" warning, the low-confidence pronunciation caveat, and their positions relative to the dimension block.
- **AC-12.3** AC-11.9 applies to this builder too.
- **AC-12.4** `build_user_instruction_text()` is unchanged.

### FR-13 — `pipeline.py` normalizes once

- **AC-13.1** Immediately after `rubric = criteria["rubric"]`, the pipeline assigns `rubric = normalize_rubric(rubric)`; both `build_output_schema` and `build_system_instruction` receive the same normalized object, and the same object is the one passed on to `_run_pilot_text_grading`.
- **AC-13.2** No other pipeline branch, ordering, retry behaviour, cost-valve check or status transition changes. Existing `tests/test_pipeline.py` passes with **no assertion changes** (its v1 rubric fixture may stay v1 — that is the point).
- **AC-13.3** The worker sends no rubric back to core-api, so nothing normalized is ever persisted (FR-16).

### FR-14 — `reports.service.ts` tolerates both shapes

- **AC-14.1** `bandMaxFromRubric` returns `scale.max` when the rubric has a `scale` object with a finite `max > 0`; otherwise falls back to `band_scale[1]` exactly as today; otherwise `DEFAULT_BAND_MAX = 3`.
- **AC-14.2** Existing behaviour for v1 rubrics is byte-identical — the existing `analytics.spec.ts` case (`criteria: { rubric: { band_scale: bandScale } }`) passes unchanged.
- **AC-14.3** `dimensionScore` and `scorePctForGrading` are **not changed** in F8 — they read the grading output, not the rubric, and the unweighted-average bug stays as-is until F9 (documented, deliberate).
- **AC-14.4** No call to `normalizeRubric` is added inside `reports.service.ts` — dual-shape tolerance in one small reader is cheaper than normalizing a rubric per grading row in a report loop (NFR-01).

### FR-15 — shared fixture + cross-language equivalence test (US3, required)

**Fixture path (single copy, no duplicates):**
`services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json`

**Why here and not at repo root:** the documented TS test command mounts **only the service directory** into the container (`docker run -v "<abs-path-to-service>:/app"` — CLAUDE.md), so a repo-root fixture is invisible to jest-in-Docker. pytest runs on the host venv and can reach across the repo. Therefore the file physically lives under core-api and the Python test resolves it relative to its own location. This does **not** make it "core-api's file" — the `_readme` key states it is jointly owned.

**Fixture format:**
```json
{
  "_readme": "Fixture DÙNG CHUNG cho normalizeRubric (TS) và normalize_rubric (Python). ...",
  "cases": [ { "name": "<snake_case>", "input": <any JSON>, "expected": <RubricV2> } ]
}
```

- **AC-15.1** Exactly one copy of this file exists in the repo. Neither test suite may inline, copy or regenerate it.
- **AC-15.2** `services/core-api/src/criteria/rubric-schema.spec.ts` loads it with `fs.readFileSync(path.join(__dirname, '__fixtures__', 'rubric-normalize.fixtures.json'), 'utf8')` (not `import` — avoids `resolveJsonModule` and keeps it out of the tsc build output).
- **AC-15.3** `services/grading-worker/tests/test_rubric_schema.py` loads it via `Path(__file__).resolve().parents[2] / "core-api" / "src" / "criteria" / "__fixtures__" / "rubric-normalize.fixtures.json"`. If the file is missing the test **fails with an explanatory message** — it must never `skip`, otherwise a move/rename silently disables the drift guard.
- **AC-15.4** Both suites iterate every case and assert `normalize(case.input)` deep-equals `case.expected` (structural comparison; object key order irrelevant, array order significant).
- **AC-15.5** Both suites additionally assert idempotency per case (AC-04.6) and non-mutation of `case.input` (AC-01.3 / AC-02.3).
- **AC-15.6** Both suites assert the case count is `>= 10` and that the set of `name`s is exactly the list in AC-15.8 — so deleting a case fails the test rather than silently weakening it.
- **AC-15.7** Every numeric value in the fixture is exactly representable in binary floating point (`0`, `1`, `0.25`, `0.5`, `5`, `9`) so TS `number` and Python `float` compare exactly with no tolerance logic.
- **AC-15.8** Required cases (minimum set):
  1. `v1_minimal` — `band_scale` + one `pronunciation` dimension only.
  2. `v1_docx_parser_output` — the exact object today's parser produces for `VALID_HTML` (3 dimensions, weights `0.25/0.25/0.5`, 2 few-shot examples). Ties FR-03 to FR-06.
  3. `v1_missing_band_scale` — defaults to `{0,3,1}`.
  4. `v1_malformed_band_scale` — `["a", null]` ⇒ `{0,3,1}`.
  5. `v1_empty_object` — `{}` ⇒ all defaults, `dimensions: []`.
  6. `v1_unknown_extra_keys` — extra top-level and extra per-dimension keys are dropped (BR-05).
  7. `v2_complete_kid` — Cambridge-YL-shaped: `sum`, `scale {0,5,1}`, 4 `levels`, 5 dimensions, `output_fields ["comment"]`, a `student_reply` block ⇒ returned unchanged.
  8. `v2_complete_ielts` — IELTS-shaped: `average`, `round: "nearest_int"`, `scale {0,9,1}`, 4 dimensions, `sub_factors` on ≥1 dimension, `output_fields ["comment","fix"]`, a grouped `comment_bank` ⇒ returned unchanged.
  9. `v2_partial_defaults` — `schema_version: 2` with `aggregation`/`levels`/`output_fields`/`comment_bank`/`sub_factors` absent ⇒ defaults filled, nothing else touched.
  10. `v2_bands_already_arrays` — proves no double-wrapping (`["a","b"]` stays `["a","b"]`, not `[["a","b"]]`).
  11. `v2_mixed_legacy_keys` — `schema_version: 2` but carrying `band_scale`, `few_shot_examples` and `name`-only dimensions ⇒ AC-04.3/AC-04.4.
- **AC-15.9** The fixture contains **no copy of the F10 seed templates**. Design doc Part 10 item 2 requires the seeds themselves to be the only copy of that data; F8's fixture is limited to normalization cases. F10 may add seed-driven cases by importing the seeds, never by pasting them.
- **AC-15.10** Both test files carry a Vietnamese comment naming the other language's test file, so whoever edits one is told where the twin lives.

### FR-16 — zero data migration

- **AC-16.1** No Prisma schema change, no migration folder, no `prisma migrate` run in F8.
- **AC-16.2** No code path writes a normalized rubric back to `criteria.rubric`. Verifiable by grep: the only `prisma.criteria.create` remains the one in `ingestDocx`; no `prisma.criteria.update` exists.
- **AC-16.3** After deploying F8 against a database containing only v1 rubrics, an audio submission grades end-to-end (schema built, prompt built, output validated) with no rubric edit and no operator action.

---

## 3. Non-functional requirements

- **NFR-01 (performance)** `normalizeRubric` is O(dimensions × bands + comment_bank) with no I/O; for the largest realistic rubric (10 dimensions × 10 bands × 5 bullets + 200 bank entries) it completes in < 5 ms. It is invoked at most once per graded submission and once per criteria read; it is **not** invoked inside report row loops (AC-14.4).
- **NFR-02 (backward compatibility — the hard one)** Every rubric currently stored in `criteria.rubric` must keep grading with identical dimension keys, identical score bounds and an identical mandatory-dimension verdict. Regression evidence = the existing `tests/test_schema.py`, `tests/test_pipeline.py`, `analytics.spec.ts` and `criteria.service.spec.ts` suites passing with their assertions unchanged.
- **NFR-03 (dependencies)** No new runtime dependency in either service. `package.json` and `pyproject.toml` are untouched.
- **NFR-04 (style)** Vietnamese code comments in `rubric-schema.ts`, `rubric_schema.py`, `docx-parser.ts`, `schema.py`, `prompt.py`. Test names may stay English (matches the existing `docx-parser.spec.ts`).
- **NFR-05 (determinism)** Prompt rendering and schema building are deterministic for a given rubric — stable ordering everywhere (AC-11.3/AC-11.5), so snapshot tests do not flake.
- **NFR-06 (test execution)** TS: `docker run --rm -v "<abs-path>/services/core-api:/app" -w /app node:24-alpine sh -c "npm ci && npm test -- --maxWorkers=2"` (prefix `MSYS_NO_PATHCONV=1` on Git Bash). Python: `.venv/Scripts/pytest`. Both suites must be green before F8 is DONE.
- **NFR-07 (security)** Rubric text is authored by authenticated staff and is inserted into LLM prompt text only — never into SQL, shell or file paths. `normalizeRubric` performs no `eval`/dynamic key execution, and drops unknown keys rather than propagating attacker-controlled structure into the LLM request body.
- **NFR-08 (availability)** No behaviour change to queue consumption, retry, DLQ or the 48h outbound guard. A malformed rubric produces the same `RubricError` → retry → DLQ path as today (design doc §3.9), never a crash loop from an unhandled `TypeError` in normalize (AC-02.2).

---

## 4. Use cases

### UC-01 — Teacher uploads a rubric `.docx`
- **Actor:** staff/admin (dashboard `/criteria`)
- **Preconditions:** authenticated session; a course exists; file follows the §3.9 mini-format (unchanged).
- **Main flow:** upload → `POST /criteria` → mammoth → `parseRubricFromHtml` → v2 object (FR-06) → new `criteria` version stored → response shows the v2 JSON in the preview `<pre>`.
- **Alternative A1:** dimension name written with capitals ⇒ `key` lowercased, `label` preserved (AC-06.3).
- **Exception E1:** no `pronunciation` dimension ⇒ 400, same message as today, nothing stored (FR-07).
- **Exception E2:** missing headings ⇒ 400, same message as today.
- **Postcondition:** `criteria.rubric` holds a v2 document; version counter incremented by exactly 1.

### UC-02 — Worker grades a submission against a **legacy v1** criteria row
- **Actor:** grading-worker (system)
- **Preconditions:** a `criteria` row stored before F8 (v1 shape); student bound and assigned to the course; audio downloaded and within the duration limit.
- **Main flow:** `GET /internal/criteria/:courseId` returns the raw v1 rubric → `normalize_rubric` (FR-13) → `build_output_schema` (bounds from the converted `scale`, keys from `key == name`) → `build_system_instruction` (few-shot examples render as the "chung" comment-bank group) → LLM → validate → write grading.
- **Alternative A1:** pilot dual-grading flag on ⇒ the same normalized object feeds `build_system_instruction_text` (FR-12).
- **Exception E1:** rubric has no `pronunciation` ⇒ `RubricError` ⇒ existing retry/DLQ path, unchanged (FR-10, NFR-08).
- **Postcondition:** `gradings` row written; `criteria.rubric` on disk is **still v1, byte-identical** (FR-16).

### UC-03 — Worker grades against a **v2** criteria row with `fix` + sub-factors
- **Actor:** grading-worker
- **Preconditions:** rubric with `output_fields: ["comment","fix"]`, `scale {0,9,1}`, `sub_factors` populated (authored via direct API/JSON in F8; via UI in F12).
- **Main flow:** as UC-02, but the output schema requires `comment` and `fix` per dimension (AC-09.5) and the prompt includes the sub-factor grid plus a "hướng sửa bài" instruction (AC-11.4/AC-11.7).
- **Alternative A1:** `scale.step = 0.5` ⇒ score property becomes `number` + `multipleOf` (AC-09.4).
- **Exception E1:** LLM returns only `comment` ⇒ `jsonschema.ValidationError` ⇒ existing retry path.
- **Postcondition:** `gradings.scores` contains per-dimension `fix` text; nothing in F8 sums or levels it (F9).

### UC-04 — Developer edits `normalizeRubric` in one language only (drift guard)
- **Actor:** developer
- **Preconditions:** both suites green.
- **Main flow:** change TS rules only → run both suites → the Python equivalence test fails against the shared golden `expected` (or the TS one does), naming the diverging case.
- **Alternative A1:** developer edits the fixture's `expected` to match the new TS behaviour ⇒ the Python test now fails, forcing the twin edit — the intended pressure.
- **Exception E1:** fixture file moved/renamed ⇒ Python test **fails** with an explicit message (AC-15.3), never skips.
- **Postcondition:** the two implementations cannot ship diverged.

---

## 5. Business rules

- **BR-01 — Stored data is never rewritten.** `normalizeRubric` runs in memory at read time. No backfill, no migration, no lazy re-save. v1 rows stay v1 forever.
- **BR-02 — `schema_version` is the sole version discriminator.** Absent / non-numeric / `< 2` ⇒ v1 branch; `>= 2` ⇒ v2 branch. Key names (`band_scale` vs `scale`) are never used to guess a version.
- **BR-03 — v1 rubrics aggregate as `average`.** This preserves today's report arithmetic exactly and is the baseline F9's regression tests measure against.
- **BR-04 — Normalization repairs, it does not reject.** Invalid or missing values fall back to documented defaults. The only two rejection points in the rubric lifecycle stay where they are: the upload gate (FR-07) and the grading gate (FR-10).
- **BR-05 — The output is a whitelist.** Only the 12 documented top-level keys and the documented sub-keys survive; unknown keys are dropped. This is what makes byte-level TS↔Python equality achievable.
- **BR-06 — One fallback scale repo-wide: `{min:0, max:3, step:1}`** — matches the current `docx-parser` default `0-3`, `schema.py`'s `band_scale` default `[0,3]` and `reports.service.ts`'s `DEFAULT_BAND_MAX = 3`. Nobody invents a different fallback.
- **BR-07 — The v1 shim never changes character case.** `key = label = name` verbatim, so a rubric that graded yesterday resolves to the same dimension keys today (NFR-02). Case normalization happens **only** at fresh `.docx` parse time (BR-08).
- **BR-08 — New uploads get lowercase machine keys.** The upload gate compares case-insensitively while the grading gate compares exactly; lowercasing `key` at parse time makes both gates agree for every rubric created from F8 onward.
- **BR-09 — The LLM never aggregates.** Prompts must not mention totals, averages or level names (Part 5). Scoring stays server-side and lands in F9.
- **BR-10 — `pronunciation` stays mandatory at both layers.** Neither gate may be relaxed, moved or made case-insensitive by F8.

---

## 6. Assumptions

1. **A1 (inherited from PM A1):** `schema_version` presence is the version discriminator (BR-02).
2. **A2:** `aggregation.round` accepts `"none" | "nearest_int"`. The design doc only shows `"none"`; `"nearest_int"` is needed to express the IELTS "no .5 scores" rule from Part 1.2. F8 only stores/passes the value — **F9 defines what it does**. If F9 needs more modes, adding a string is non-breaking.
3. **A3:** `scale.step != 1` is expressed as JSON-Schema `multipleOf`. Structured-output support for `multipleOf` across Gemini/OpenAI is unverified (no API keys — same deferred-credentials situation as M1.8/M2.4/M3). Both seed rubrics use `step: 1`, so this path is unreachable in practice until someone authors a half-band scale.
4. **A4:** `GET /internal/criteria/:courseId` keeps returning the raw stored rubric (AC-08.2), deliberately, so the Python shim stays load-bearing.
5. **A5:** `comment_bank[].intent` is a free string ("khen" / "góp ý" / …), not an enum — the source PDF's Bảng C uses ad-hoc Vietnamese labels and F12's UI will let teachers type their own.
6. **A6:** `comment_bank[].dimension` is not validated against `dimensions[].key`; an orphaned value renders under its raw name (AC-11.5) rather than being dropped, so teacher content is never silently lost.
7. **A7:** The `.docx` mini-format stays exactly as-is in F8. Multi-bullet band descriptions, sub-factors, comment-bank grouping and `student_reply` are authorable only via direct JSON in F8, via UI in F12.
8. **A8:** `student_reply` is carried through the schema untouched in F8; F11 owns its semantics and the closed `#ilm:` action set.

## 7. Dependencies

- **Upstream:** F8-pm.md (done). Design doc Part 3 (approved).
- **Downstream (this feature is their foundation):** F9 (`computeTotal`, Prisma migration, `weight` bug fix, `levels` coverage validation), F10 (`RubricTemplate` seeds/CRUD/privileges — its seeds must be valid v2 and must pass `normalizeRubric` unchanged), F11 (Zalo buttons, consumes `student_reply`), F12 (drawers, consume the v2 types + prompt preview).
- **No dependency** on Zalo/Google/LLM credentials — everything in F8 is unit-testable offline.
- **Roles needed:** backend (TS) + backend (Python) + QA. **DBA not needed** (FR-16: no schema change). **UX not needed** (no UI surface). **DevOps not needed** (no new dependency, image, env var or compose change).

## 8. Open questions

1. **OQ-1 (non-blocking, A2):** exact enum for `aggregation.round`. Assumed `none | nearest_int`; F9 confirms when it implements the math. IELTS's integer-only rule is the only real requirement today.
2. **OQ-2 (non-blocking, A3):** whether the LLM providers honour `multipleOf` in structured output. Unverifiable without API keys; unreachable with both seed rubrics.
3. **OQ-3 (non-blocking):** exact prompt wording for the sub-factor grid and comment-bank group headers is left to the implementer as long as AC-11.4/AC-11.5 hold structurally. Snapshot tests lock whatever wording ships; F10 re-points those snapshots at the real seeds.
4. **Closed by decision, recorded here:** the shared fixture lives under `services/core-api/src/criteria/__fixtures__/` rather than a neutral repo-root folder, purely because the documented TS test container mounts only the service directory (AC-15.2 rationale). If the TS test command ever mounts the repo root, the fixture may move — both tests must move with it in the same commit.

---

## Outputs (what this role produced)

- **This file** — the complete F8 functional spec: 16 FRs with 96 numbered acceptance criteria, 8 NFRs, 4 use cases, 10 business rules, the v2 data dictionary in both languages, assumptions/dependencies/open questions.
- **Files the implementers will touch** (from FR traceability):
  - New: `services/core-api/src/criteria/rubric-schema.ts`, `services/core-api/src/criteria/rubric-schema.spec.ts`, `services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json`, `services/grading-worker/src/grading_worker/grading/rubric_schema.py`, `services/grading-worker/tests/test_rubric_schema.py`
  - Changed: `services/core-api/src/criteria/docx-parser.ts`, `docx-parser.spec.ts`, `criteria.service.ts` (+ `criteria.service.spec.ts` fixture shape), `services/core-api/src/reports/reports.service.ts`, `services/grading-worker/src/grading_worker/grading/schema.py`, `grading/prompt.py`, `pipeline.py`
  - Explicitly unchanged: `worker-api/worker-api.controller.ts`, `prisma/schema.prisma`, `contracts.ts`/`contracts.py`, all dashboard files.

## Blockers / open questions

None blocking — see §8; all three open questions are non-blocking and assumed past with a recorded rationale.

## Notes for the next role

- **Backend (TS + Python):** FR-03/FR-04/FR-05 are the whole shim; write them off the fixture (FR-15) rather than off prose. The one trap is idempotency — branch **once** on `schema_version` (BR-02), never per-field, or `bands` gets double-wrapped.
- **QA:** the strongest regression evidence is the *existing* suites passing with **unchanged assertions** (`test_schema.py`, `test_pipeline.py`, `analytics.spec.ts`) — that is NFR-02 in practice. The drift guard (FR-15) must FAIL, never SKIP, when the fixture is missing.
- **F9 owner:** `weight` is still ignored in `reports.service.ts` and `aggregation`/`levels` are carried but unused — deliberate, yours.
