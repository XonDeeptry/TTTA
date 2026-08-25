# F8 · Backend — Rubric schema v2 + `normalizeRubric` v1→v2 shim (TS + Python)

- **Owner role:** backend
- **Feature:** F8 — v2 rubric types + pure `normalizeRubric` duplicated in core-api (TS) and grading-worker (Python), docx-parser emits v2, worker schema/prompt builders consume v2. Zero DB migration.
- **Status:** DONE (fix round 2 complete — QA DEF-01, DEF-02, OBS-01 all resolved)
- **Last updated:** 2026-08-21
- **Depends on:** F8-ba.md, F8-pm.md, F8-qa.md (fix round 1)

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F8-ba.md` — 16 FRs / 96 numbered ACs, v2 data dictionary in both languages, 10 business rules, 8 NFRs. Implemented as written.
- `docs/dev-team-roles/tasks/F8-pm.md` — US1–US5 (MoSCoW).
- `Idea/20260819-ChamDiemRubricV2.md` Part 3 (v2 schema + v1→v2 mapping table), Part 5 (scoring stays server-side = F9), Part 8 (file scope), Part 10 (acceptance).
- `CLAUDE.md` — npm only through Docker (`node:24-alpine`, service dir mounted); pytest via `.venv/Scripts/pytest`; Vietnamese code comments in the 3 backend services.

## Checklist (the concrete work items for this task)

- [x] Read TASK-PROTOCOL + template, create this file
- [x] Read F8-ba.md / F8-pm.md / design doc Part 3
- [x] Read all in-scope source + test files
- [x] FR-01: `criteria/rubric-schema.ts` (v2 types + `normalizeRubric`)
- [x] FR-15: `criteria/__fixtures__/rubric-normalize.fixtures.json` (11 cases)
- [x] FR-15: `criteria/rubric-schema.spec.ts` (fixture-driven, TS side)
- [x] FR-06/FR-07: `docx-parser.ts` emits v2, gates unchanged; spec updated in place
- [x] FR-08: `criteria.service.ts` normalizes on read; worker endpoint behaviour untouched
- [x] FR-14: `reports.service.ts` `bandMaxFromRubric` prefers `scale.max`
- [x] FR-02: `grading/rubric_schema.py` (v2 TypedDicts + `normalize_rubric`)
- [x] FR-15: `tests/test_rubric_schema.py` (same fixture, FAIL-not-skip when missing — verified by moving the file)
- [x] FR-09/FR-10: `grading/schema.py` builds from v2, both gates preserved
- [x] FR-11/FR-12: `grading/prompt.py` — both builders, shared helpers
- [x] FR-13: `pipeline.py` normalizes once
- [x] Run core-api jest suite in Docker → 31 suites / 298 tests passed, `tsc --noEmit` clean
- [x] Run grading-worker pytest suite → 149 passed
- [x] Fill Outputs + set Status DONE

### Fix round 1 (QA FAIL — DEF-01, Major)

- [x] Read `F8-qa.md` in full; reproduce DEF-01 locally in both languages (+ found a bonus AC-02.2 crash: `math.isfinite(10**400)` raised `OverflowError`)
- [x] Python `_to_text`: full JS `String()` semantics (list/tuple, dict, ECMAScript `Number::toString`)
- [x] Python `_normalize_comment_bank`: `item.get("text")` must treat explicit `None` like TS `??`
- [x] Python `_as_finite_number`: huge int ⇒ JS `Infinity` ⇒ `None` (never `OverflowError`)
- [x] Band / `by_band` dict keys stringified via `_to_text` (JS object-key semantics)
- [x] **TS side left byte-identical** (AC-03.5 names `String()` normatively — TS is the reference)
- [x] Shared fixture: 3 new cases (`v1_null_comment_text`, `v2_non_string_band_values`, `v1_non_string_few_shot_examples`); both required-name lists updated
- [x] New TS spec + pytest cases for the `String()` edge set (line-for-line twins)
- [x] Re-run own cross-language differential fuzz ⇒ 0 divergences (see Outputs)
- [x] Re-run both suites, report real numbers (TS 31/335, Py 187 — see Outputs)
- [x] Tick checklist + set Status DONE

### Fix round 2 (QA DEF-02, Minor — `.strip()` ≠ `.trim()`)

- [x] Read `F8-qa.md` §5.3; reproduce the 23-code-point probe locally (6 divergent, exactly as filed)
- [x] `_js_trim()` on the exact ECMAScript WhiteSpace ∪ LineTerminator set; all 4 `.strip()` sites
- [x] **TS side untouched again** — `rubric-schema.ts` stays the reference
- [x] Verified `_js_trim` against real V8 over **all 1 112 064 Unicode code points** ⇒ 0 mismatches
- [x] Fixture case `v2_javascript_trim_semantics` (U+FEFF + U+0085, padded AND count-changing forms)
- [x] Both required-name lists updated in lockstep (15 cases)
- [x] Named trim tests in both suites (all 23 probe code points × 3 shapes)
- [x] Added 25 code points to the differential corpus string pool; replay proves it now bites
- [x] Re-run both suites (TS 31/409, Py 261) + 20 000-input differential ⇒ 0 divergences
- [x] Set Status DONE
- [x] OBS-01: replaced the tautological `not.toHaveProperty('update')` assertion

## Outputs (what this role produced)

### Fix round 2 — DEF-02 resolved (`.strip()` → `_js_trim()`, Python only)

| Suite | Result | Δ vs round 1 |
| :-- | :-- | :-- |
| core-api (TS) | **31 suites / 409 tests passed**, 0 failed, `tsc --noEmit` clean, 190 s | 335 → 409 (+74) |
| grading-worker (Py) | **261 passed**, 0 failed, 0 skipped, 9 s | 187 → 261 (+74) |

**Differential: 20 000 inputs (4 seeds) on a corpus now seeded with 25 whitespace-ish code points
⇒ 0 divergences**, 0 raises, 0 bad key-sets, 0 non-idempotent either side.

**Root cause.** ECMAScript `TrimString` strips `WhiteSpace ∪ LineTerminator`; Python `str.strip()`
strips whatever `str.isspace()` says. The two sets differ on exactly 6 code points — Python strips
`U+001C U+001D U+001E U+001F U+0085` that JS does not, and misses `U+FEFF` that JS does. Because
the trim runs *outside* `_to_text`, round 1's V8 cross-check of `_to_text` structurally could not
see it, and the corpus contained no non-ASCII whitespace at all.

**Fix.** New `_JS_WHITESPACE` literal (25 code points, written as `\uXXXX` escapes — they are
invisible in an editor) + `_js_trim()`, applied at all four sites: `rubric_schema.py:303`, `:304`
(`_normalize_band_value`), `:383` (`_normalize_comment_bank`), `:399` (`few_shot_examples`).
`rubric-schema.ts` untouched again (`git diff` empty).

**Two independent proofs, not just "tests pass":**
1. `_js_trim` compared against **real V8 `String.prototype.trim()` over all 1 112 064 Unicode code
   points** (surrogates excluded) ⇒ **0 mismatches**; the same sweep scores pre-fix `str.strip()`
   at exactly the 6 QA named. V8 trims exactly 25 code points, matching the literal exactly.
2. Replaying the trim-extended corpus against a reverse-patched `.strip()` build ⇒ **744 / 5 000
   divergent (14.9 %)**, dominated by `/comment_bank[len]` (196) and `/dimensions[]/bands/*[len]`
   — i.e. the corpus now reaches the count-changing class it was blind to. Post-fix: 0.

**Files changed in round 2:** `services/grading-worker/src/grading_worker/grading/rubric_schema.py`
(`_JS_WHITESPACE` + `_js_trim` + 4 call sites); `.../__fixtures__/rubric-normalize.fixtures.json`
(**14 → 15 cases**, new `v2_javascript_trim_semantics` covering U+FEFF/U+0085/U+001C/U+00A0/U+3000/
U+200B in padded, whole-value-collapses and array-element forms, plus a `_readme_trim_semantics`
note; the 14 existing cases were spliced around, not reformatted, so the diff stays clean);
`rubric-schema.spec.ts` and `tests/test_rubric_schema.py` (matching `TRIM_PROBES` table of 23 code
points × 3 shapes — padded value, whole band value, whole `comment_bank` text — plus a
"`by_band` is never trimmed" case, and the new name in both required-name lists).

**Lesson recorded (QA's point about the blind spot):** a cross-language equivalence check is only
as wide as the *pipeline* it covers, not the *function* it covers. Round 1 verified `_to_text`
exhaustively against V8 and still missed a divergence one call frame up. Any future helper wrapping
a normalizer needs its own end-to-end probe, and the corpus needs a member of every character class
the code branches on.

**OBS-03 (key order) deliberately left alone** per the coordinator — logged to the F10/F12 backlog.

### Fix round 1 — DEF-01 resolved (Python brought to the TS reference)

| Suite | Result | Δ vs first round |
| :-- | :-- | :-- |
| core-api (TS) | **31 suites / 335 tests passed**, 0 failed, `tsc -p tsconfig.build.json --noEmit` clean, 206 s | 298 → 335 (+37) |
| grading-worker (Py) | **187 passed**, 0 failed, 0 skipped, 41 s | 149 → 187 (+38) |

**Own cross-language differential: 56 000 inputs across 11 seeds ⇒ 0 divergences**, 0 Python
raises, 0 wrong key-sets, 0 non-idempotent on either side. Harness (scratchpad, not in repo):
Python generates a rubric-shaped corpus → same JSON fed to the real `rubric-schema.ts` under
`node:24-alpine` (the module is import-free, Node 24 runs the `.ts` directly) → structural diff
against `normalize_rubric`, numbers compared in the double domain (JS has only doubles; comparing
Python's exact `int` against a `JSON.stringify` round-trip reports false positives above 2^53).

**The harness bites:** replayed against a reverse-patched pre-fix `rubric_schema.py`, the same
6 000-input corpus reports **2791 divergences** (46.5 %) — QA's corpus found 1.1 %. Post-fix: 0.
Separately, `_to_text` was checked value-by-value against **real V8 `String()`** over 14 683 values
(4 000 random 64-bit doubles + every `m×10^e` for e ∈ [−330, 320] + nested lists/dicts): **0
mismatches**. All 6 rows of QA's repro table now match TS exactly.

### Root causes fixed (all in `rubric_schema.py`; TS untouched — AC-03.5 names `String()` normatively)

1. `_to_text` did not implement JS `String()` for **lists** (`join(",")`, `None` elements ⇒ empty
   string, nested lists recurse), **dicts** (`"[object Object]"`), or **exponent-form numbers**.
   New `_js_number_to_string` implements ECMAScript `Number::toString` (§6.1.6.1.20) on top of
   Python's shortest-round-trip `repr` — fixes `1e21` → `"1e+21"` (was
   `"1000000000000000000000"`) and `1e-7` → `"1e-7"` (was `"1e-07"`).
2. `_normalize_comment_bank` used `item.get("text", "")`, which only defaults an **absent** key.
   TS `item.text ?? ''` also catches an explicit `null`. Now `None` is treated as absent — while
   `false`/`0` are deliberately still kept (`??` is nullish-only), which the new fixture locks.
3. **Bonus defect found, not in QA's report:** `_as_finite_number` called `math.isfinite()` on a
   Python `int`, which raises `OverflowError` for `10**400` — a hard violation of AC-02.2
   ("never raises"). JS `JSON.parse("1e400")` yields `Infinity`, so the value must simply be
   non-finite. Ints beyond ±2^53 are now lowered to the double JS actually holds.
4. Band / `by_band` dict keys are stringified via `_to_text`, not `str()` (JS object keys follow
   `String()`: `str(True)` is `"True"`, not `"true"`).

### Files changed in fix round 1

- `services/grading-worker/src/grading_worker/grading/rubric_schema.py` — the 4 fixes above.
- `services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json` — **11 → 14 cases**:
  `v1_null_comment_text` (explicit `null` / absent / blank / `false` / `0` text),
  `v2_non_string_band_values` (number, bool, `null`, array, nested array, object, `1e21`, `2^-23`,
  `2.5`, `""` across `bands`, `by_band`, `output_fields`, `comment_bank[].text`),
  `v1_non_string_few_shot_examples` (the branch with **no** `??`, where `null` correctly survives
  as the literal `"null"`). Added `_readme_string_semantics` explaining the normative rule and why
  the two `text` branches are deliberately asymmetric. All new numerics are exactly representable
  (`1e21 = 2^21·5^21`, `1.1920928955078125e-7 = 2^-23`) so AC-15.7 still holds.
- `services/core-api/src/criteria/rubric-schema.spec.ts` — 3 new names in `REQUIRED_CASE_NAMES`
  (exact-set equality kept, so both languages' lists must move together) + a
  `JS String() semantics` describe block with hand-written expected values.
- `services/grading-worker/tests/test_rubric_schema.py` — same 3 names + a line-for-line twin of
  that block, plus two Python-only tests for the `10**400` and `2^53+1` paths (JSON cannot carry
  `Infinity`, so the TS twin expresses the same rule with a literal `Infinity`).
- `services/core-api/src/criteria/criteria.service.spec.ts` — **OBS-01 fixed.** The mock now carries
  every Prisma write method (`create`/`update`/`updateMany`/`upsert`/`delete`/`deleteMany`) and the
  test asserts none was **called**, instead of asserting the mock lacks a property.

**Unchanged, as required:** `rubric-schema.ts` byte-identical; `worker-api.controller.ts`
(`GET /internal/criteria/:courseId` still verbatim); both `pronunciation` gates; the `weight` bug
at `reports.service.ts:254-267` (F9); every pre-existing v1 assertion.

### Test results (first round — both actually executed)

| Suite | Command | Result |
| :-- | :-- | :-- |
| core-api (TS) | `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Docs/Project/TTTA/services/core-api:/app" -w /app node:24-alpine sh -c "npm ci && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2"` | **31 suites / 298 tests passed**, 0 failed. `tsc --noEmit` clean. ~165 s |
| grading-worker (Python) | `.venv/Scripts/python.exe -m pytest -q` (from `services/grading-worker`) | **149 passed**, 0 failed, 0 skipped. ~31 s |

F8 added **72 TS tests** (298 − 72 = 226 baseline) and **89 Python tests** (149 − 89 = 60 baseline):

| File | before → after |
| :-- | :-- |
| `criteria/rubric-schema.spec.ts` (new) | 0 → 62 |
| `criteria/docx-parser.spec.ts` | 6 → 11 |
| `criteria/criteria.service.spec.ts` | 3 → 6 |
| `reports/analytics.spec.ts` | +2 |
| `tests/test_rubric_schema.py` (new) | 0 → 65 |
| `tests/test_schema.py` | 6 → 18 |
| `tests/test_prompt.py` | 11 → 23 |

Every pre-existing test still passes with **unchanged assertions** (NFR-02) — `test_schema.py`'s v1 `RUBRIC`, `test_pipeline.py`'s v1 `RUBRIC`, `test_prompt.py`'s v1 `RUBRIC`, `analytics.spec.ts`'s `band_scale` rows and `criteria.service.spec.ts`'s version-increment cases were all left as they were.

**Drift guard verified empirically:** moving `rubric-normalize.fixtures.json` aside makes `tests/test_rubric_schema.py` report **6 hard FAILURES, 0 skips**, while the other 103 tests still run (the guard was deliberately built so a missing fixture does not abort collection for the whole suite). File restored afterwards.

### New files

- `services/core-api/src/criteria/rubric-schema.ts` — v2 types (`RubricV2`, `RubricDimensionV2`, `RubricScale`, `RubricAggregation`, `RubricLevel`, `RubricSubFactor`, `CommentBankEntry`, `StudentReply`, `StudentReplyButton`, `AggregationMethod`, `RoundingMode`, `OutputField`), constants `PRONUNCIATION_DIMENSION` and `DEFAULT_SCALE = {min:0,max:3,step:1}`, and `normalizeRubric(input: unknown): RubricV2`. Pure module: zero imports.
- `services/core-api/src/criteria/rubric-schema.spec.ts` — fixture-driven (44 golden/idempotency/non-mutation/12-key assertions) + degenerate-input and BR-07 cases.
- `services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json` — the **single** shared fixture, 11 cases, exactly the AC-15.8 names. Jointly owned by both services (stated in `_readme`).
- `services/grading-worker/src/grading_worker/grading/rubric_schema.py` — field-for-field Python twin (TypedDicts + `normalize_rubric`). Stdlib only.
- `services/grading-worker/tests/test_rubric_schema.py` — same fixture, resolved via `Path(__file__).resolve().parents[2] / "core-api" / ...`; FAILS (never skips) when the fixture is missing.

### Changed files

- `services/core-api/src/criteria/docx-parser.ts` — `parseRubricFromHtml`/`parseRubricFromDocxBuffer` now return `RubricV2`. **Mini-format unchanged.** `key` = name lowercased+trimmed, `label` = name as written (BR-08). Both 400 rejections keep their exact message strings. v1 `RubricJson`/`RubricDimension` kept exported but `@deprecated`; nothing imports them.
- `services/core-api/src/criteria/docx-parser.spec.ts` — updated in place; both rejection tests verbatim.
- `services/core-api/src/criteria/criteria.service.ts` — `get()`/`list()` pass `row.rubric` through `normalizeRubric` at read time (private `toV2`). `ingestDocx` unchanged apart from the parser's new shape; no second normalize (parser output is already a fixed point).
- `services/core-api/src/criteria/criteria.service.spec.ts` — added read-normalization + "never writes back" cases; existing cases untouched.
- `services/core-api/src/reports/reports.service.ts` — `bandMaxFromRubric` now tries `scale.max` (v2) → `band_scale[1]` (v1) → `3`. **`dimensionScore` / `scorePctForGrading` deliberately untouched** (the `weight` bug is F9's).
- `services/core-api/src/reports/analytics.spec.ts` — 2 additive v2/fallback cases.
- `services/core-api/src/worker-api/worker-api.controller.ts` — **behaviour byte-identical**; only a Vietnamese comment block added above `GET criteria/:courseId` explaining why it must keep returning the stored rubric verbatim (AC-08.2 rationale, so a later role does not "optimize" the Python shim into dead code).
- `services/grading-worker/src/grading_worker/grading/schema.py` — `build_output_schema` calls `normalize_rubric` at entry; dimension property names from `key`; bounds from `scale`; `step != 1` ⇒ `{"type":"number", multipleOf}`; `output_fields` drives required `comment`/`fix` (fixed order); duplicate-key `RubricError`; `pronunciation` gate and `validate_output` unchanged. `PRONUNCIATION_DIMENSION` now re-exported from `rubric_schema.py` (single declaration).
- `services/grading-worker/src/grading_worker/grading/prompt.py` — both builders normalize at entry and share `_render_dimensions` / `_render_output_fields_instruction` / `_render_comment_bank` / `_header_lines` / `_band_order`. Header lines, pilot warnings, `mispronounced_words` line and closing line all unchanged in wording and order.
- `services/grading-worker/src/grading_worker/pipeline.py` — one line: `rubric = normalize_rubric(criteria["rubric"])`; no other branch, retry, cost-valve or status change.
- `services/grading-worker/tests/test_schema.py`, `tests/test_prompt.py` — v2 sections appended; v1 sections untouched.

### Not changed (deliberate)

`prisma/schema.prisma` (no migration — FR-16), `contracts.ts` / `contracts.py`, `criteria.controller.ts`, `scripts/generate-rubric-template.ts`, all dashboard files (`Criteria.tsx` types `rubric` as `unknown` and only JSON-previews it, so v2 renders fine), `package.json`, `pyproject.toml` (NFR-03: no new dependency).

### Behavioural contract of `normalizeRubric` / `normalize_rubric`

- Signature: `normalizeRubric(input: unknown): RubricV2` · `normalize_rubric(raw: Any) -> RubricV2`.
- Never throws / never raises; repairs with defaults (BR-04). Never mutates its argument. Returns exactly the 12 whitelisted top-level keys (BR-05). Idempotent.
- **Branches exactly once**, on `schema_version` (`>= 2` ⇒ v2 branch). All per-field helpers dispatch on the *value's type*, so a band that is already an array can never be double-wrapped no matter which branch runs.
- v1 → v2: `band_scale`→`scale{,step:1}`; `name`→`key` **and** `label` verbatim, no case change (BR-07); `bands` string→`[string]`; `few_shot_examples`→`comment_bank[{dimension:null,intent:null,text}]`; `aggregation` defaults to `{average,none}` (BR-03); `levels:[]`, `output_fields:["comment"]`, `sub_factors:[]`, `student_reply:null`.
- `levels` and `student_reply` are deep-copied **verbatim** (per §1.3 / AC-05.4) rather than key-filtered; every other field is whitelisted.
- Python `_to_text()` deliberately mimics JS `String()` (`True`→`"true"`, `None`→`"null"`, `3.0`→`"3"`) — without it the two copies diverge on non-string band/`by_band` values.

## Blockers / open questions

None. The BA's three open questions (OQ-1 `aggregation.round` enum, OQ-2 provider support for `multipleOf`, OQ-3 exact prompt wording) were assumed past exactly as the spec recorded; none blocked implementation.

## Notes for the next role

- **QA (fix round 2):** DEF-02 is closed in Python only; `rubric-schema.ts` `git diff` is empty for
  the second round running. The strongest evidence is not the suites but the **full-Unicode sweep**:
  `_js_trim` matches real V8 on all 1 112 064 code points, so this class is now closed by
  construction rather than by sampling. Your 23-probe set is reproduced verbatim as `TRIM_PROBES` in
  both suites (×3 shapes, including the two count-changing ones). Note `by_band` is deliberately
  **not** trimmed on either side — there is now an explicit test for that, so please do not read it
  as a missed site. If you re-fuzz, the corpus needs whitespace-ish characters in it to reach this
  branch at all; mine now seeds 25 of them and I verified a `.strip()` build scores 744/5 000.
- **QA (fix round 1):** DEF-01 is closed in Python only — `git diff` on `rubric-schema.ts` is empty,
  so the TS reference behaviour you validated is untouched. To re-fuzz, note that comparing numbers
  requires the double domain: `JSON.stringify` prints a JS double as shortest decimal and Python's
  `json.loads` reads it back as an exact `int`, so any value above 2^53 will look divergent on a
  naive `==` even when both sides hold the identical double. Two edges worth re-probing because they
  are asymmetric **on purpose** and now fixture-locked: `comment_bank[].text` drops `null` but keeps
  `false`/`0` (`??` is nullish-only), while `few_shot_examples` keeps `null` as the literal string
  `"null"` (that branch has no `??`). Also new: `10**400` no longer raises `OverflowError` (that was
  an AC-02.2 violation your 20 000-input fuzz did not reach — worth adding huge ints to the corpus).
- **QA (first round):** the strongest regression evidence is the pre-existing suites passing with unchanged assertions — verified above. To exercise the drift guard yourself, rename `services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json` and re-run pytest: expect 6 FAILURES and 0 skips. AC-08.2 is behavioural — `GET /internal/criteria/:courseId` still returns the raw stored row (only a comment was added to that file). AC-11.9/BR-09: prompts contain no `levels`, no total, no average — there is an explicit test for it.
- **Front-end:** no API contract change. `GET /criteria` and `GET /criteria/:id` now always return a v2-shaped `rubric` (12 keys) regardless of what is on disk; `POST /criteria` (multipart `.docx`) stores and returns v2. Status codes and the two 400 messages are unchanged. Dashboard needs no change for F8 — the rubric drawers are F12.
- **F9 backend:** `aggregation` (`sum|average|weighted_average` + `round: none|nearest_int`) and `levels` are carried through but unused — yours. `reports.service.ts`'s `dimensionScore`/`scorePctForGrading` still ignore `weight`; left as-is on purpose. `computeTotal` should live in `lib/rubric-scoring.ts` and import the types from `criteria/rubric-schema.ts` (`RubricV2`, `RubricLevel`). If you make `GET /internal/criteria/:courseId` normalize server-side, you kill the Python shim's only production caller and the drift guard becomes theatre — the BA required that decision be stated explicitly.
- **F10 backend:** seed templates must be valid v2 and must be normalize fixed points (`normalizeRubric(seed) === seed`); add seed-driven cases by *importing* the seeds, never by pasting them into the fixture (AC-15.9).
