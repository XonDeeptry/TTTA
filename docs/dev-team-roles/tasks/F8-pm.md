# F8 · PM — Rubric schema v2 + normalizeRubric v1→v2 shim (TS + Python)

- **Owner role:** pm
- **Feature:** F8 — Introduce rubric schema v2 (aggregation method, level bands, bulleted band descriptions, sub-factor grids, structured comment bank, `output_fields`) per `Idea/20260819-ChamDiemRubricV2.md` Part 3, with a pure `normalizeRubric()` v1→v2 shim duplicated in core-api (TS) and grading-worker (Python), and the docx-parser updated to emit v2 directly.
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** — (foundational; nothing upstream in this run)

## Inputs (what this role received)

- Design doc `Idea/20260819-ChamDiemRubricV2.md` Parts 1–3, 8 (source-PDF analysis, gap analysis, v2 schema, v1→v2 mapping table, file-scope list). Design is approved and final — PM does not redesign.
- `Idea/20260719-KienTrucMicroservices.md` §3.9/§3.10 for rubric background (mandatory `pronunciation` dimension, no-shared-package-across-languages constraint).
- Code read for context: `services/core-api/src/criteria/docx-parser.ts` (current `RubricJson` v1 interface, mini-format parser, mandatory-`pronunciation` 400 check — this check is UNCHANGED by F8, only the emitted shape changes).
- `CLAUDE.md` — grading-worker's provider-agnostic `Provider` protocol, `contracts.py` triplication precedent (same duplication pattern this feature repeats for `normalizeRubric`), Node/npm-through-Docker constraint.
- `docs/dev-team-roles/PROGRESS.md` — confirms F1–F7 are unrelated to rubric internals (no conflicting decisions to avoid).

## Checklist

- [x] Read design doc Parts 1–3, 8 fully
- [x] Read current `docx-parser.ts` / `RubricJson` v1 shape for grounding
- [x] Write user stories + Given/When/Then acceptance criteria (MoSCoW)
- [x] Define in-scope / out-of-scope, list assumptions
- [x] Flag the cross-language-drift risk as an explicit required test (not optional)

## Outputs

### User stories (MoSCoW)

**US1 (Must) — v2 TypeScript type + `normalizeRubric()` in core-api.**
As a backend engineer, I want a versioned rubric v2 TS type and a pure `normalizeRubric()` function (`services/core-api/src/criteria/rubric-schema.ts`), so every code path reading `criteria.rubric` gets a consistent v2 shape regardless of whether the stored JSON is legacy v1 or already v2.
- Given a v1 rubric (`band_scale`, `name`, `;`-joined band strings, `few_shot_examples`), when `normalizeRubric()` runs, then it returns v2 per the Part 3 mapping table: `band_scale:[min,max]` → `scale:{min,max,step:1}`; `name` → both `key` and `label` (same value); `bands:{"0":"desc"}` → `bands:{"0":["desc"]}`; `few_shot_examples:[...]` → `comment_bank:[{dimension:null,intent:null,text}]`; `aggregation.method` defaults to `"average"` (preserves today's report behavior exactly); `levels:[]`; `output_fields:["comment"]`.
- Given a rubric already carrying `schema_version:2`, when normalized, then it is returned unchanged — idempotent, no double-wrapping of `bands` arrays, no re-deriving `key`/`label`.
- `schema_version` presence is the sole v1-vs-v2 discriminator (explicit assumption, see below).
- Pure function: no DB/Redis/HTTP calls, safe to unit-test in isolation.

**US2 (Must) — identical `normalizeRubric()` in Python.**
As a grading-worker maintainer, I want `services/grading-worker/src/grading_worker/grading/rubric_schema.py` implementing the exact same mapping table, so the worker's schema-builder and prompt-builder operate on the same v2 shape as core-api, with no shared package.
- Same behavioral ACs as US1, field-for-field equivalent (Python types are the implementer's choice — TypedDict/dataclass/pydantic — as long as the JSON shape matches).

**US3 (Must) — cross-language equivalence test.**
As QA, I want a single shared JSON fixture consumed by BOTH a TS test and a Python test, so the two independently-maintained `normalizeRubric` copies can never silently drift.
- Given one fixture file (checked into the repo once, referenced — not copy-pasted — by both test suites), when both implementations run on it, then their JSON output is deep-equal after canonical stringify.
- This test is REQUIRED, not optional — Part 3 of the design doc explicitly calls out the duplication risk ("Cảnh báo trùng lặp") and Part 10 item 1 lists it as a mandatory unit test.

**US4 (Must) — docx-parser emits v2 directly.**
As a teacher uploading a rubric `.docx`, I want the parser to output a v2-shaped rubric (not v1 requiring a later normalize pass), so uploads are immediately compatible with `computeTotal` (F9) and prompt-building without an extra conversion step.
- Given a valid `.docx` per the existing, UNCHANGED mini-format (§3.9), when parsed, then the output has `schema_version:2`, `scale` (not `band_scale`), each dimension has `key` (snake_case, derived same as today's `name` parsing) and `label` (same value), `bands` values are single-element string arrays (docx import still supports only one description per band — multi-bullet authoring is v2-native-only, arrives with F12's Drawer 2).
- Given a `.docx` missing the mandatory `pronunciation` dimension, when parsed, then it is rejected with 400 exactly as today — no behavior change to this existing guard, only the accepted-case output shape changes.
- `aggregation.method` defaults to `"average"`, `levels:[]`, `output_fields:["comment"]` for docx-imported rubrics (docx import does not yet author `fix`/`sub_factors`/`comment_bank`/`student_reply` — those need F12's UI or direct API use).

**US5 (Should) — grading-worker schema/prompt read v2 fields.**
As the grading pipeline, I want `grading/schema.py` and `grading/prompt.py` to consume v2's `scale`/`step`, `output_fields`, bulleted `bands`, `sub_factors`, and grouped `comment_bank`, so the LLM output contract and prompt reflect the richer rubric content the source PDFs actually need.
- Given `output_fields:["comment","fix"]`, when the JSON output schema is built, then each dimension requires both `comment` and `fix` string properties (Part 1.2 point 4 — IELTS needs both).
- Given a dimension's discriminator is now `key` (not `name`), when the mandatory-dimension check runs, then `pronunciation` is still enforced exactly as today (§3.10) — a rename of the check field, not a behavior change.
- Given band descriptions as string arrays, when `build_system_instruction` renders, then each band shows as multiple bullet lines (not the current `;`-joined single line).
- Given `sub_factors` on a dimension, when the prompt is built, then they render as a labeled band→keyword grid.
- Given `comment_bank` entries carry `dimension`/`intent`, when the prompt is built, then examples are grouped by both, preserving the "văn phong mẫu" intent from Part 1.1 Bảng C.
- Snapshot tests may use a hand-built v2 fixture for this feature; re-pointing snapshots at the REAL seed templates is F10's responsibility once those seeds exist (explicit forward-reference, not silently deferred).

### In scope
- `rubric-schema.ts` (core-api) + `rubric_schema.py` (grading-worker): v2 types + `normalizeRubric`.
- `docx-parser.ts` updated to emit v2 directly (mini-format itself is UNCHANGED).
- `grading/schema.py` + `grading/prompt.py` updated to consume v2 fields.
- Cross-language equivalence test (shared fixture).
- vi/en: none — this feature has no UI-facing strings.

### Out of scope
- `computeTotal` / total-score math (F9).
- Any Prisma migration — `criteria.rubric` stays `Json`; normalization is purely in-memory at read time.
- `RubricTemplate` table, seeded defaults, CRUD, privileges (F10).
- Zalo buttons (F11).
- Dashboard drawers (F12) — no new UI in this feature.
- Retroactively re-normalizing/re-saving already-stored v1 rubrics — they stay v1 on disk forever; `normalizeRubric` runs at every read, not as a one-time migration.

### Assumptions
1. `schema_version` field presence/absence is the sole v1-vs-v2 discriminator. The doc doesn't say this explicitly, but no other field is a reliable signal (key-renames like `band_scale`→`scale` can't be safely used to detect version). Stated explicitly so BA/backend don't have to guess.
2. Exact call sites where `normalizeRubric()` gets invoked (docx-parser output, template service reads, worker pipeline reads) are a BA/backend implementation decision — PM only requires that EVERY read path produces v2 before use, not a specific call-site list.
3. `aggregation.method` defaulting to `"average"` for anything not explicitly `"sum"`/`"weighted_average"` is required to keep existing report numbers byte-identical for all rubrics authored before this feature ships (protects F9's regression AC).

## Blockers / open questions

None. Both open questions from the design doc (Part 11: `template_type` field, exact `locked` list) belong to F11/F10 respectively, not F8.

## Notes for the next role

BA: the mapping table in Part 3 of the design doc is complete and unambiguous — treat it as the spec, no further product decisions needed for this feature. Backend (TS): mind the idempotency AC (US1) carefully, it's easy to accidentally double-wrap `bands` arrays if the v1/v2 check is done per-field instead of once via `schema_version`. Backend (Python): the shared fixture for US3 should live somewhere both suites can reference without either language "owning" it — recommend a small JSON file under a neutral path (e.g. repo-root `Idea/` sibling or a `fixtures/` folder BA designates), not inside either service's own test directory.
