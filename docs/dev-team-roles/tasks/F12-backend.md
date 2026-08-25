# F12 · Backend — `POST /criteria/json` + `POST /criteria/prompt-preview` + TS↔Python prompt-renderer drift guard

- **Owner role:** backend
- **Feature:** F12 — core-api slice only: the content-save route (`POST /criteria/json`), the stateless
  live prompt preview (`POST /criteria/prompt-preview`) backed by a TypeScript port of
  `grading/prompt.py`, and the mandatory cross-language drift guard (shared fixture asserted by both
  jest and pytest).
- **Status:** DONE
- **Last updated:** 2026-08-23
- **Depends on:** `F12-ba.md` (FR-01…FR-04 are mine), `F10-backend.md`, `F8-backend.md`, `F9-backend.md`

## Inputs (what this role received)

- `F12-ba.md` — FR-01 (`POST /criteria/json`, 13 ACs), FR-02 (`POST /criteria/prompt-preview`, 6 ACs),
  FR-03 (drift guard, 8 ACs incl. **AC-03.8 reverse-patch proof**), FR-04 (no other behaviour change),
  §7.1/7.2 data dictionary, §2 (why the renderer is ported to core-api rather than to the dashboard).
- `F10-backend.md` — `assertAuthorableRubric(input: unknown): RubricV2` **owns** normalization; pass the
  RAW body (DEF-1). Route-order hazard: anything with a literal segment must precede `@Get(':id')`.
- `F8-backend.md` / `rubric-schema.ts` ↔ `rubric_schema.py` — the existing TS↔Python twin + its shared
  fixture mechanism, and the two drift defect classes it cost (`String()` semantics, `.trim()` set).
- Code read: `grading/prompt.py`, `grading/rubric_schema.py` (`_to_text`, `_js_trim`,
  `_js_number_to_string`), `criteria.controller.ts`, `criteria.service.ts`, `rubric-validation.ts`,
  `criteria-routes.e2e.spec.ts`, `main.ts` (`ValidationPipe({whitelist,transform})`), `schema.prisma`.

## Checklist (the concrete work items for this task)

- [x] Read TASK-PROTOCOL + template, create this file, Status IN_PROGRESS
- [x] Read `F12-ba.md` FR-01…FR-04 + assumptions, `F10-backend.md`, `F8-backend.md` mechanism
- [x] Read `prompt.py` (both builders) + `rubric_schema.py` `_to_text`/`_js_trim`/`_js_number_to_string`
- [x] Empirically probe the CPython semantics the port must match (`float()` grammar, `str(float)`
      thresholds, `str.isspace()` vs the set `float()` accepts, `sorted` with NaN keys)
- [x] FR-02/FR-03 — `criteria/prompt-render.ts` (TS port of both builders + `pyFloat`/`pyNumberToString`)
- [x] FR-03 — `criteria/__fixtures__/prompt-render.fixtures.json` (shared, 12 cases)
- [x] FR-03 — `criteria/prompt-render.spec.ts` (fixture + seed rendering + boundary assertions)
- [x] FR-03 — `grading-worker/tests/test_prompt_render_fixtures.py` (same fixture, no production Python change)
- [x] FR-01 — `criteria/dto/create-criteria-json.dto.ts`, FR-02 — `criteria/dto/prompt-preview.dto.ts`
- [x] FR-01 — `CriteriaService.createFromJson()` (raw body → `assertAuthorableRubric`, version n+1)
- [x] FR-01/FR-02 — controller wiring, both routes declared before `@Get(':id')`
- [x] Unit specs: `criteria.service.spec.ts` (additive), `prompt-preview` no-I/O, e2e route+privilege cases
- [x] AC-04.4 — fix the stale OBS-4 comment in `create-rubric-template.dto.ts`
- [x] core-api: `tsc -p tsconfig.build.json --noEmit` + `tsc -p tsconfig.json --noEmit` + full jest
- [x] grading-worker: full pytest
- [x] **AC-03.8 reverse-patch proof** — 3-step differential (mutate TS ⇒ jest red; align fixture ⇒
      pytest red; mutate Python ⇒ pytest red), restored + MD5-verified
- [x] AC-03.7 — mutual twin header in `prompt.py` (comment-only, recorded as a deviation)
- [x] Fill Outputs (incl. the exact API contract for the front-end), set Status DONE

## Outputs (what this role produced)

### Test / build results (all actually executed)

| Suite | Command | Result |
| :-- | :-- | :-- |
| core-api | `docker run … node:24-alpine "npm ci && npx tsc -p tsconfig.build.json --noEmit && npx tsc -p tsconfig.json --noEmit && npm test -- --maxWorkers=2"` | **43 suites / 1004 tests passed**, 0 failed. Both `tsc --noEmit` clean (src *and* tests). 212 s |
| grading-worker | `.venv/Scripts/pytest` | **448 passed**, 0 failed. 17.8 s |

**Baselines preserved and grown: core-api 41/774 → 43/1004 (+2 suites, +230 tests); grading-worker
377 → 448 (+71).** **Zero pre-existing assertions were changed** — the two existing spec files I
touched only gained mock *models* (`course`, `rubricTemplate`) and appended cases; every pre-existing
`expect(...)` line is byte-identical. (`criteria-routes.e2e.spec.ts`'s `criteria.create` mock now
echoes `data` so the new tests can inspect it; no pre-F12 test ever invoked that mock.)

The jest line "A worker process has failed to exit gracefully" is pre-existing bcrypt behaviour
(diagnosed in `F10-backend.md`), not F12.

### AC-03.8 — reverse-patch proof (the deliverable QA should re-run)

The literal AC ("one character makes both suites fail") is not achievable in one step, because pytest
reads the *fixture*, not the TS file. The property that actually matters — **you cannot make one
renderer drift and keep both suites green** — was proven in three measured steps:

| Step | Mutation | jest | pytest |
| :-- | :-- | :-- | :-- |
| A | `prompt-render.ts` only: `` `    • ${bullet}` `` → `` `    - ${bullet}` `` (1 char) | **21 failed** / 594 passed | **71 passed** (still green) |
| B | …then "fix" the fixture to match the mutated TS (60 bullet replacements) | **still 1 failed** (the AC-03.6 seed test, which does not read the fixture) | **20 failed** / 51 passed |
| C | restore both; mutate `prompt.py` only (same 1 char) | — | **21 failed** / 427 passed (20 mine + 1 pre-existing `test_prompt.py`) |

Restored afterwards and verified by MD5 against pre-mutation backups; full suites re-run green
(43/1004 and 448/448). Step B is the load-bearing one: the cheap escape ("just update the golden
file") is exactly what turns the *other* language's suite red.

### New files — core-api

- **`src/criteria/prompt-render.ts`** (≈340 lines) — TS port of `grading/prompt.py`: both builders
  (`buildSystemInstruction`, `buildSystemInstructionText`), `renderPrompt(rubric, variant)`,
  `PROMPT_VARIANTS`. Pure module (no Nest/Prisma/Redis/fs). Carries the mutual "⚠ BẢN SONG SINH"
  header **and** a measured **MIỀN TƯƠNG ĐƯƠNG** block naming the three irreducible divergences
  (see below). Two sub-ports were required and are the reason the port is not a naive transcription:
  - `pyNumberToString()` — Python's `str()`/`repr()` for a number (mirror image of
    `rubric_schema.py`'s `_js_number_to_string`). A weight of `1e-5` renders `1e-05` in Python but
    `0.00001` under JS `String()`; `1e17` renders `1e+17` vs `100000000000000000`. Both are pinned
    by fixture case `v2_weight_number_formatting`.
  - `pyFloat()` — CPython's `float(str)` grammar (PEP 515 underscores, `inf`/`nan`, Unicode
    whitespace padding, Unicode decimal digits), used by `_band_order`. `Number()` differs on five
    inputs that all change band ordering: `''`→0, `'0x10'`→16, `'1_0'`→NaN, `'inf'`→NaN, `'١٢'`→NaN.
    The accepted-whitespace set was measured by sweeping all 0x110000 code points on CPython 3.11:
    it is `str.isspace()` **minus U+001C–U+001F**.
  - `renderCommentBank` uses `Map`, not a plain object: `MACHINE_KEY_PATTERN` permits all-digit
    dimension keys (`"42"`, `"7"`), and a JS object would reorder those ahead of insertion order.
    Pinned by `v2_numeric_dimension_keys_group_order`.
- **`src/criteria/__fixtures__/prompt-render.fixtures.json`** — 14 cases; `expected_audio`/
  `expected_text` **generated from the Python original** (the authority). Read by both suites.
- **`src/criteria/prompt-render.spec.ts`** — 133 tests: fixture equality (strict `===`, both
  variants), required-case-name lock, determinism, non-mutation, BR-09 leak checks, both seeds
  rendered **by import**, 12 garbage inputs, and unit tables for `pyFloat` / `pyNumberToString`.
- **`src/criteria/criteria-prompt-preview.spec.ts`** — handler-level FR-02: AC-02.1 zero Prisma
  calls (asserted per model+method), variant defaulting/echo, and AC-02.3 proven *by data* — each
  "lenient" rubric is first asserted to be **rejected** by `assertAuthorableRubric`, then previewed.
- **`src/criteria/dto/create-criteria-json.dto.ts`**, **`src/criteria/dto/prompt-preview.dto.ts`**.

### Changed files — core-api

- **`src/criteria/criteria.controller.ts`** — two routes inserted after the `templates*` block and
  **before `@Get(':id')`**; class header updated with the new mandatory order.
- **`src/criteria/criteria.service.ts`** — `createFromJson()`, `readTemplateKey()`, and
  `defaultTitle()` extracted so `ingestDocx` and the JSON path share one title expression (AC-01.6
  by construction, not by two hand-copied strings). `ingestDocx` behaviour unchanged.
- **`src/criteria/criteria.service.spec.ts`** — +30 cases (additive).
- **`src/criteria/criteria-routes.e2e.spec.ts`** — +37 real-HTTP cases (additive).
- **`src/criteria/dto/create-rubric-template.dto.ts`** — AC-04.4 / F10 OBS-4: stale
  "normalizeRubric rồi mới assertAuthorableRubric" comment corrected.

### New / changed files — grading-worker

- **`tests/test_prompt_render_fixtures.py`** (new, 71 tests) — same fixture, hard-fail (never skip)
  if it is missing, plus a **verified** regeneration recipe in the docstring (running it reproduces
  the committed fixture byte-for-byte).
- **`src/grading_worker/grading/prompt.py`** — **9 added docstring lines, zero code lines.** See
  "Deviations" #1.

### Not changed (deliberate)

`assertAuthorableRubric` / `rubric-validation.ts`, `rubric-schema.ts`, `lib/rubric-scoring.ts`,
`docx-parser.ts`, F10's 8 template routes, all three `contracts` files, `criteria.module.ts`,
`schema.prisma` (**no migration** — `templateKey`/`sourceFilename` already exist), every
`package.json` and `pyproject.toml` (**no new dependency**), and the whole `services/dashboard` tree.

### API contract — what the front-end needs

Both routes are on the existing `CriteriaController` (`SessionAuthGuard` + `PrivilegeGuard`, session
cookie, same-origin, no new header). Errors follow the repo's existing shapes.

#### 1. `POST /criteria/json` → **201**

Privilege: **`criteria_author`** (admins hold it implicitly — do **not** re-implement the bypass).

```jsonc
// request
{ "courseId": 3, "rubric": { /* raw v1 or v2, un-normalized */ },
  "title": "Bản tháng 8",          // optional, trimmed, ≤ 200
  "templateKey": "ielts_speaking" } // optional, string | null
// 201 response = the created `criteria` row
{ "id": 77, "courseId": 3, "title": "kid_a1 — speaking_clip", "rubric": { /* NORMALIZED v2 */ },
  "sourceFilename": null, "version": 2, "templateKey": "ielts_speaking",
  "createdAt": "2026-08-23T…" }
```

- `version` is **server-computed** (`max(version) for the course + 1`, `1` if none). Never send it —
  `whitelist: true` strips it (proven over HTTP).
- `title` omitted/blank ⇒ `` `${rubric.course_key} — ${rubric.task_type}` `` (em dash U+2014,
  identical to the `.docx` path). `> 200` chars ⇒ 400.
- `templateKey` is **format-checked only** (`^[a-z0-9][a-z0-9_]{0,63}$`); existence is **never**
  looked up, so a key whose template was deleted is stored as-is and still returns 201.
- Errors: **400** `invalid template key` · **400** any of F10's 11 rubric messages as
  `{statusCode,message,error}` (e.g. `scale.step must be greater than 0`,
  `rubric must include the "pronunciation" dimension`) · **400**
  `{message:"invalid rubric", issues:[{code,index,message}]}` for level problems (F9's Vietnamese
  strings verbatim) · **400** array-form `message` for `courseId`/`title` DTO failures · **401**
  `login required` · **403** `insufficient privilege` · **404** `course not found`. **Never 500** —
  `null`, `42`, `"x"`, `[]`, `{}` and a missing `rubric` key all return 400.
- On any 400/403/404 **no row is created** (asserted, not assumed).

#### 2. `POST /criteria/prompt-preview` → **200** (not 201)

Privilege: **`criteria_author` OR `rubric_template`**.

```jsonc
// request
{ "rubric": { /* anything, mid-edit draft */ }, "variant": "audio" }  // variant optional
// 200 response
{ "variant": "audio", "prompt": "Bạn là giáo viên chấm bài nói…\n…" }
```

- Stateless: **no DB / Redis / RabbitMQ** access; nothing is stored; no IDOR surface.
- `variant` omitted ⇒ `"audio"`. `"text"` ⇒ the transcript-only pilot prompt. **Anything else —
  including `null` — ⇒ 400** (deliberately `@ValidateIf`, not `@IsOptional`, so `null` cannot
  silently become `audio`).
- **Lenient by design:** `assertAuthorableRubric` is *not* called. A rubric that `POST /criteria/json`
  would reject (missing `pronunciation`, `step: 0`, level gaps, or plain garbage) still returns 200
  with a rendered string. Only the envelope 400s. So the preview must **never** be used as a
  save-gate, and a preview failure must never block Save.
- `prompt` is a JSON string with real `\n` separators — render it in a `<pre>`; it is never
  pre-escaped and never contains a total, an average or a level name (BR-09).
- Typical size 0.5–4 KB; the render is pure string assembly (sub-millisecond server-side), so the
  300–500 ms debounce is the only latency control needed.

## Blockers / open questions

None blocking. Three **measured, irreducible** limits of the TS↔Python equivalence are recorded in
the header of `prompt-render.ts` and deliberately kept out of the fixture (adding them would create
a permanently-red test that detects nothing). All three change only prompt *formatting*, never a
score, and none is reachable from the F12 drawer:

1. A JSON **float literal with a zero fractional part** (`"weight": 1.0`) or an integer > 2^53.
   Python sees a float and prints `1.0`; JSON carries no int/float distinction, so JS can only see
   `1`. Every other numeric shape (`1`, `0.5`, `2.25`, `1e-5`, `1e17`, `1e21`) is matched exactly.
2. **Object key order in the insertion-order fallback.** When at least one band key is not a Python
   float, both sides "keep insertion order" — but `JSON.parse` hoists array-index-like keys
   (`"0"`,`"42"`) to the front, while `json.loads` keeps file order. Only bites if a rubric *mixes*
   index-like and non-numeric band keys out of ascending order. The all-numeric case (every real
   rubric) takes the sorting branch and is unaffected.
3. A band key that `float()` reads as **NaN** (`"nan"`). Python's `sorted` then runs an inconsistent
   comparator, so the result depends on Timsort internals — CPython does not specify it, therefore
   no port can be "correct". TS chooses the deterministic option (treat as non-numeric ⇒ insertion
   order) and a jest test pins that choice.

### Deviations — read before filing a defect

1. **`prompt.py` was edited: 9 docstring lines, zero code lines** (full `diff` in the run log).
   The orchestrator's brief said "no production Python change"; AC-03.7 requires *both* twins to
   carry the mutual "⚠ BẢN SONG SINH" header. I judged a comment-only header to honour both, because
   without it a Python developer editing the renderer has **no** signal that a TS twin exists — which
   is precisely the failure mode FR-03 exists to prevent. pytest re-run green (448). Reverting is one
   edit if the orchestrator disagrees.
2. **AC-03.6 partially relocated.** Both seeds *are* rendered by import and asserted, but the AC's
   "sub-factor grid + grouped comment bank present" cannot come from them: both seeds ship
   `comment_bank: []` and `sub_factors: []` (they are *structure*, content is authored later). Those
   two features are covered by the fixture cases instead; the seed test asserts what a seed really
   has, including that **no empty "Yếu tố con" heading** appears.
3. **AC-02.3's "body not an object ⇒ 400" is satisfied only for scalars.** `express.json({strict})`
   already rejects `42`/`"str"` bodies before Nest. A top-level `[]` body yields 200 with the default
   prompt. Adding machinery to reject it would buy nothing the drawer can hit.
4. **`rubric` and `templateKey` carry `@Allow()` rather than real DTO validators** — deliberate, and
   commented in the DTO. `@IsObject()` on `rubric` would move the 400 message for a missing/`null`
   rubric from the domain gate to the DTO, contradicting AC-01.10; `@Allow()` is also what stops
   `whitelist: true` from deleting the property outright.
5. **Version numbering keeps `ingestDocx`'s read-then-write shape** and therefore inherits its
   pre-existing race: two *concurrent* saves for the same course could compute the same `version`
   (there is no `@@unique([courseId, version])`). AC-01.5 only requires sequential correctness, and a
   transaction would not fix it under READ COMMITTED. If the centre wants it closed, it is a DBA
   migration (one unique index) plus a retry — **not** an F12 code change.

## Notes for the next role

- **Front-end:** the API contract above is exact. Three things worth repeating: (a) the preview
  endpoint is **lenient** — never treat a 200 as "valid" or a failure as "cannot save"; (b) send
  `variant` only as `'audio'`/`'text'` — `null` is a 400, omit the key instead; (c) `POST
  /criteria/json` returns the **normalized** rubric while the stored draft you sent was raw — that
  is F10 QA's OBS-3 again, so keep the dirty-check form-model vs form-model (AC-21.4/21.6).
  The response's `version` is what `authoring.savedVersion` should interpolate.
- **QA:** the highest-value automated check is the three-step table above — re-run it verbatim; step
  **B** is the one that proves the guard is two-sided. Second: `criteria-routes.e2e.spec.ts`'s
  DEF-1 repro block (`scale.step` 0/-1/null/"x" ⇒ 400 **and** `criteria.create` never called) — that
  is F10's defect re-tested on the new write path. Everything in "Deviations" and the three
  equivalence limits is stated so you can check them rather than discover them.
- **Whoever updates the architecture doc:** `Idea/20260719-KienTrucMicroservices.md` needs a v1.6
  line recording that the **prompt renderer now exists twice** (Python original + TS preview port)
  and that `criteria/__fixtures__/prompt-render.fixtures.json` is the contract between them — the
  repo's *third* cross-language duplicate after `contracts.*` and `rubric-schema.ts` ↔
  `rubric_schema.py`. Same for `CLAUDE.md`'s monorepo section. I did not edit either doc (not my
  file); both renderers carry the rule in their headers meanwhile.
