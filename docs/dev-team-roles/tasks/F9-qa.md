# F9 · QA — `computeTotal` server-side scoring + Prisma migration + `weight`-bug fix

- **Owner role:** qa
- **Feature:** F9 — pure `computeTotal(rubric, scores)`; additive Prisma migration (6 nullable columns); `POST /internal/gradings` computes+persists total/level and updates `Student.currentLevel*`; `reports.service.ts` recomputes via `computeTotal` (fixes the standing `weight`-ignored bug); read-only total/level/`fix` on `SubmissionDetail.tsx`.
- **Status:** DONE
- **Verdict:** **PASS** (2 non-blocking observations recorded for BA / F10 — no defect assigned to any role)
- **Last updated:** 2026-08-21
- **Depends on:** `F9-ba.md` (14 FR / 101 AC), `F9-backend.md`, `F9-pm.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 5, `Criteria-Source/*.pdf`

## Inputs (what this role received)

- `F9-ba.md` — 101 numbered ACs, 14 business rules; the gate.
- `F9-backend.md` — implementation claims + a §"Deviations" list of 7 items, 3 of which the
  coordinator asked me to arbitrate.
- Ground truth read directly, not via the design doc: `Criteria-Source/RubricSpeakingA0-C.pdf`
  and `Criteria-Source/Analystic-ScoringBand.pdf`.

## Checklist

- [x] Read protocol + upstream task files + **both source PDFs (pages read, not summarised)**
- [x] Arbitrate deviation 1 (AC-07.5 `A0` vs `A1-`) against the PDF → **backend is right, spec is wrong**
- [x] Arbitrate deviation 2 (`scorePctForGrading` signature / splice coverage) → **accepted**
- [x] Arbitrate deviation 3 (`DEFAULT_SCALE` value import) → **accepted, no cycle possible**
- [x] Static review of `rubric-scoring.ts`, `worker-api.controller.ts`, `reports.service.ts`, `submissions.service.ts`, `SubmissionDetail.tsx`, `i18n/index.ts`, `schema.prisma`, `migration.sql`
- [x] `git diff` proof that no pre-existing assertion was weakened (numstat, deleted-line count)
- [x] Grep proof: reports never read `Grading.totalScore`; zero F9 references in grading-worker/zalo-gateway
- [x] Run core-api `prisma generate` + `tsc --noEmit` + jest in Docker → 32 / 502
- [x] Write and run **34 independent QA probe cases** derived from the PDFs + ACs (not from backend's spec)
- [x] **Mutation test**: reverse-patch the weight fix, prove the 6.2-vs-6.25 fixture actually bites
- [x] Run dashboard build in Docker
- [x] Run grading-worker pytest (261) and zalo-gateway jest (26)
- [x] Migration re-validated independently on a populated `postgres:16-alpine` + `prisma migrate diff`
- [x] `updateMany` level-guard tested against real Postgres (5 scenarios)
- [x] Restore every mutated/temporary file; verify md5 + clean `git status`

---

## 1. Suite results (all executed by QA, not taken from the backend's report)

| Suite | Command | Result | Backend claimed | Verdict |
| :-- | :-- | :-- | :-- | :-- |
| core-api TS | `docker run … node:24-alpine "apk add openssl; npm ci && npx prisma generate && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2"` | **32 suites / 502 tests passed**, 0 failed; `tsc --noEmit` clean; `prisma generate` OK; 302.8 s | 32 / 502 | **CONFIRMED** |
| dashboard | `docker run … "npm ci && npm run build"` (`tsc -b && vite build`) | **build OK**, **88 modules**, 21.4 s, 0 TS errors | build OK / 88 modules | **CONFIRMED** |
| grading-worker | `.venv/Scripts/pytest.exe -q` | **261 passed**, 0 failed, 63 s | untouched | **CONFIRMED** (= F8 baseline 261) |
| zalo-gateway | `docker run … "npm ci && npm test -- --maxWorkers=2"` | **5 suites / 26 tests passed** | untouched | **CONFIRMED** (= F8 baseline 26) |
| QA probe suite | 34 independent cases, `npx jest src/lib/qa-f9-probe.spec.ts` | **34 passed / 34** | n/a | **PASS** |
| mutation test | pre-F9 math reverse-patched into `scorePctForGrading` | **4 targeted failures**, incl. AC-12.7 receiving exactly **69.4** | n/a | fixture is load-bearing |

Baseline check: F8 left 31 suites / 409 tests → F9 is 32 / 502 (+1 suite, +93 tests).

---

## 2. Arbitration of the three backend deviations

### D1 — AC-07.5 `level.code = "A0"` · **RULING: the BA spec is wrong; the code is right.**

`Criteria-Source/RubricSpeakingA0-C.pdf`, page 3–4, "Cách tính":

```
0–10 điểm:  Pre-starter (A0) ~ Tiny rabbit
11–15 điểm: Starter (A1-) ~ Little Fox
16–20 điểm: Mover (A1) ~ Junior Panda
21–25 điểm: Flyer (A2) ~ Great Big Dino
```

AC-07.5's own scenario (KID rubric, `pronunciation` missing, remaining scores 3+4+3+4) yields
**14**, which falls in the `11–15` band ⇒ **`A1-` / "Starter (A1-) ~ Little Fox"**. The AC's
`"A0"` is an arithmetic slip that contradicts the level table printed three lines above it in the
same AC block. My independent probe QA-05 asserts `A1-` and `findLevel(KID_LEVELS, 14).code === 'A1-'`.

**Action for the BA (documentation only, no code change):** annotate `F9-ba.md` AC-07.5 —
`level.code` should read `"A1-"`, label `"Starter (A1-) ~ Little Fox"`. Everything else in AC-07.5
(`total 14`, `max 25` unchanged, `counted 4`, `missing ["pronunciation"]`) is correct and reproduced.

### D2 — `scorePctForGrading(scores, rubric)` drops the `bandMax` argument · **RULING: accepted.**

I traced every path that can reach the function:
- `GradingInRange.rubric` is assigned in exactly one place — `resolveRubric()` inside
  `fetchGradingsInRange` (`reports.service.ts:300-318`), which applies the AC-12.4 splice
  (`normalized.scale.max > 0 ? normalized : {…, scale:{…, max: bandMax}}`) before the row is built.
- `scorePctForGrading` has exactly three callers — `kpis()` (l.358), `trends()` (l.417),
  `classPerformance()` (l.453) — and all three read `g.rubric` from `fetchGradingsInRange`.
  No caller constructs a `GradingInRange` by hand; no spec file calls the private method directly.
- Therefore **no path can reach the function with an un-spliced rubric**, and passing `bandMax`
  again would force a per-row splice, contradicting AC-12.2's "at most once per `criteriaId`".
- The splice is **not** vestigial: the F8 fixture `{schema_version:2, scale:{min:0,max:0}, band_scale:[0,9]}`
  in `analytics.spec.ts` exercises it and reports 100 %, which passes.
- `bandMaxFromRubric` is retained and still reads the **raw** rubric for
  `avgPronunciation`/`dimensionBreakdown` (AC-12.8) — verified by reading l.372 and l.488.

### D3 — `rubric-scoring.ts` imports the `DEFAULT_SCALE` **value** · **RULING: accepted.**

- `criteria/rubric-schema.ts` has **zero** import statements of its own (verified line by line),
  so `rubric-scoring.ts → rubric-schema.ts` is a leaf edge: **no cycle is structurally possible**,
  and AC-01.1's real intent (no `@nestjs/*`, no Prisma, no Redis, no `fs`, no I/O) holds.
- The alternative — literal `3` in a second file — would violate F8 BR-06 ("one fallback repo-wide").
  Probe QA-22 pins that a scale-less rubric falls back to `{min:0,max:3}` from that single constant.
- Drift risk: nil, since the constant is imported rather than copied.

---

## 3. Test cases — design, technique, traceability, result

Independent probe suite (34 cases) written from the PDFs and the ACs, executed, then deleted
(`git status` clean). Technique legend: EP = equivalence partition, BVA = boundary value,
DT = decision table, EG = error guessing, MUT = mutation, ST = state transition.

### 3.1 PDF 1 — Cambridge YL (`RubricSpeakingA0-C.pdf`)

| ID | AC | Technique | Case | Expected | Result |
| :-- | :-- | :-- | :-- | :-- | :-- |
| QA-01 | AC-07.1 | EP+ | 4,3,4,3,4 | total 18, max 25, counted 5, level `A1` "Mover (A1) ~ Junior Panda", missing/ignored/clamped all `[]` | PASS |
| QA-02 | AC-07.2 | BVA | all 5s | 25 ⇒ `A2` "Flyer (A2) ~ Great Big Dino" (upper bound inclusive) | PASS |
| QA-03 | AC-07.3 | BVA | all 0s | 0, counted 5, `A0` — a genuine zero DOES get a level | PASS |
| QA-04 | AC-07.4 | BVA | **all six PDF band edges**: 10\|11, 15\|16, 20\|21 | `A0,A1-,A1-,A1,A1,A2` | PASS |
| QA-05 | AC-07.5 | EP− | `pronunciation` absent | 14, max **25** (does not shrink), counted 4, `missing:["pronunciation"]`, **`A1-`** | PASS |
| QA-06 | AC-07.6 | EP− | extra key `listening` | total 18 unchanged, `ignored:["listening"]` | PASS |
| QA-07 | AC-07.7 / BR-03 | DT | all weights 2, then all weights 7 | 18/25 both times — `sum` ignores `weight` | PASS |
| QA-08 | AC-04.5 / BR-05 | EG | 7 unusable payloads (`{}`,`null`,`undefined`,`42`,`'x'`,`[]`,`{score:'bốn'}`) | counted 0, total 0, **level `null`** — never "0 ⇒ Tiny Rabbit" | PASS |
| QA-09 | AC-01.7 | inspection | `maxTotal` vs `computeTotal().max` | 25 == 25; IELTS 9 | PASS |

### 3.2 PDF 2 — IELTS Speaking (`Analystic-ScoringBand.pdf`)

| ID | AC | Technique | Case | Expected | Result |
| :-- | :-- | :-- | :-- | :-- | :-- |
| QA-10 | AC-07.8 | EP+ | 6,7,6,6 · `average`+`nearest_int` | raw 6.25 ⇒ **6**, max 9, counted 4, level `null` (`levels: []`) | PASS |
| QA-11 | AC-07.9 | EP+ | 7,7,6,7 | raw 6.75 ⇒ **7** | PASS |
| QA-12 | AC-07.10 / AC-03.2 | **BVA (the tie)** | 6,7,7,6 ⇒ raw **6.5** | **7** (ties toward +Infinity). Also pinned the documented negative consequence `Math.round(-6.5) === -6` on a `min:-9,max:0` rubric | PASS |
| QA-13 | AC-07.11 | DT | same rubric, `round:"none"` | **6.25** — integer-only is expressed by `round`, not baked into `average` | PASS |
| QA-14 | AC-07.12 / AC-12.7 | **the weight-bug proof** | weights 2,1,1,1 on 6,7,6,6 | total **6.2**; pct **68.9 %** vs old-math **69.4 %** (old expression re-implemented in the test, independently of `reports.service.ts`); `nearest_int` variant ⇒ 6 | PASS |
| QA-15 | AC-02.4 / BR-14 | property/random | 20 pseudo-random 4-dimension draws under `average` | new pct **identical** to the transcribed pre-F9 expression every time | PASS |

### 3.3 Adversarial / degenerate (FR-05) — "try to make it fail"

| ID | AC | Technique | Case | Expected | Result |
| :-- | :-- | :-- | :-- | :-- | :-- |
| QA-16 | AC-01.2 / AC-01.5 | EG, 96 combinations | 24 hostile `scores` (`NaN`, `±Infinity`, `-0`, `MAX_VALUE`, arrays, nested, `constructor`, …) × 4 broken rubrics (`null`, `'garbage'`, `42`, all-wrong-typed fields) | **never throws**; `total`/`max`/`counted` always finite | PASS |
| QA-17 | AC-05.9 | security/EG | `JSON.parse('{"__proto__":{"score":5},…}')` | `Object.prototype` unpolluted; the `__proto__` entry never scored | PASS |
| QA-18 | AC-01.3 | EG | deep-frozen rubric **and** deep-frozen scores | no throw; `JSON.stringify` of both unchanged | PASS |
| QA-19 | AC-01.4 | repetition | 200 repeats of a `weighted_average` computation | `Object.is`-identical every time (the invariant FR-12's recompute policy rests on) | PASS |
| QA-20 | BR-10 / NFR-06 | BVA both ways | scores 99 and −99 on a 0–5 scale | clamped to 5 and 0; `clamped` lists both keys; `total/max ≤ 1` | PASS |
| QA-21 | AC-05.6 | EG | **inverted** scale `min 5 > max 1` | clamping **disabled** (`clamped: []`), values pass through — the author's mistake is not silently flipped | PASS |
| QA-22 | AC-05.6 / F8 BR-06 | EP | rubric with no `scale` at all | falls back to `DEFAULT_SCALE {0,3}` — the single repo-wide fallback | PASS |
| QA-23 | AC-02.5/02.6/05.7 | DT | weights `[-5,1]`, `[0,0]`, `['x',1]` | `-5⇒0`; **Σw=0 ⇒ plain mean, never NaN**, counted still 2; non-finite ⇒ 1 | PASS |
| QA-24 | AC-05.4/05.5 | EG | dimensions `[a,'junk',42,null,{key:''},{noKey},a,b]` | exactly 2 effective dims ⇒ `max 10` not 40; dropped duplicate appears **once** in `ignored` | PASS |
| QA-25 | AC-02.7 | **the legacy-report trap** | `normalizeRubric({band_scale:[0,3]})` (no dimensions) + 2 scores | falls back to the `scores` keys ⇒ 2.5/3 = 83.3 %, i.e. the identical pre-F9 number; `maxTotal` returns 0 (documented divergence) | PASS |
| QA-26 | AC-04.1/04.3/04.4 | DT | overlapping levels; a gap; `NaN` bounds; `[]` | first-match-wins; `null` in a gap (no snapping); non-finite skipped | PASS |
| QA-27 | AC-02.10/03.5 | EG | `method:'median'`, `round:'banker'` | treated as `average` / `none` ⇒ 6.5, no throw | PASS |

### 3.4 `validateLevels` (FR-06)

| ID | AC | Case | Expected | Result |
| :-- | :-- | :-- | :-- | :-- |
| QA-28 | AC-06.9 | the real Cambridge table | `[]` | PASS |
| QA-29 | AC-06.9 | `11–15` → `10–15` | exactly one `level_overlap`, message names 10 | PASS |
| QA-30 | AC-06.9 | `11–15` → `12–15` | exactly one `level_gap` | PASS |
| QA-31 | AC-06.9 | first `1–10`; last `21–24` | one `level_coverage_start`; one `level_coverage_end` | PASS |
| QA-32 | AC-06.9 + backend deviation 6 | `code: "  "` | **exactly one** `level_invalid` at index 2 — the entry stays in the ordering pass so no phantom `level_gap` is manufactured | PASS |
| QA-33 | AC-06.1/06.8 | `levels: []`; 6 garbage rubrics | `[]`; never throws | PASS |

### 3.5 Write path, migration, and cross-checks

| ID | AC | Technique | Evidence | Result |
| :-- | :-- | :-- | :-- | :-- |
| QA-34 | AC-12.10 | invariant | write-path and report-path totals `Object.is`-equal; `normalizeRubric` idempotent on the fixture | PASS |
| QA-35 | AC-11.3 | real DB, populated | See §4 — MD5 of pre-F9 columns byte-identical before/after | PASS |
| QA-36 | AC-11.1/11.2/11.5 | `prisma migrate diff --from-url … --to-schema-datamodel` | **"This is an empty migration"** ⇒ hand-authored SQL matches `schema.prisma` exactly | PASS |
| QA-37 | AC-09.3/09.4/09.5/09.10 | ST, real DB | 5 transitions — see §5 | PASS |
| QA-38 | AC-12.7 | **MUT** | reverse-patched old math ⇒ AC-12.7 fails with **exactly 69.4** | PASS |
| QA-39 | BR-06 | grep | `reports.service.ts` contains `totalScore` only inside a comment; the only writer is `worker-api.controller.ts:167` | PASS |
| QA-40 | AC-08.10 | grep | `computeTotal` imported by exactly `worker-api.controller.ts`, `reports.service.ts`, `submissions.service.ts` + spec files | PASS |
| QA-41 | FR-10 / AC-10.1/10.4 | diff + grep | zero F9 references (`rubric-scoring`, `computeTotal`, `total_score`, `current_level`, `student_ack`) anywhere under `services/grading-worker` or `services/zalo-gateway`; the dirty worker files are all F8's (every added comment is marked "F8:"); `zalo-gateway` has **no diff at all** | PASS |
| QA-42 | AC-08.2 / F8 AC-08.2 / OQ-4 | diff | `GET /internal/criteria/:courseId` is byte-unchanged — the only removed lines in `worker-api.controller.ts` are the two old `createGrading` lines | PASS |
| QA-43 | NFR-04 / AC-12.5 | `git diff --numstat` | `analytics.spec.ts` **+197/−0**, `worker-api.controller.spec.ts` **+184/−0**, `submissions.service.spec.ts` **+40/−0** — **zero deleted lines**, so no pre-existing assertion could have been edited or weakened. (The −2/−9 in `criteria.service.spec.ts`/`docx-parser.spec.ts` are **F8's** `band_scale`→`scale` and `name`→`key` changes, already gated by `F8-qa.md`.) | PASS |
| QA-44 | NFR-05 | diff | both `package.json` files untouched — no new dependency, no DevOps work | PASS |
| QA-45 | FR-13/FR-14 | inspection + build | three render states present and correct (total+level / total only with **no dangling `—`** / muted `totalUnavailable`); `fix` sub-line renders only when non-empty; no new input/button/mutation; all three keys added to **both** `vi` and `en`; no hard-coded string in JSX; level label rendered verbatim | PASS |

---

## 4. Migration re-validated independently (AC-11.3/11.5/11.6/11.7)

Fresh `postgres:16-alpine`, the four pre-F9 migrations applied via `psql`, then seeded with a real
course / criteria / student / 2 submissions / 1 pre-F9 grading, **then** the F9 migration applied.

```
BEFORE  gradings_md5=6b958c676171d92237be614444dbb80f
        students_md5=3381e4bfc45012194c7ad8eac902aaa2
        idx_md5     =35f28da9e7fda45af12070f905358a12
AFTER   gradings_md5=6b958c676171d92237be614444dbb80f   ← byte-identical
        students_md5=3381e4bfc45012194c7ad8eac902aaa2   ← byte-identical
        idx_md5     =35f28da9e7fda45af12070f905358a12   ← no index added
gradings_all_null=true      students_all_null=true       (no backfill, BR-07)
constraints on gradings+students = 5  (unchanged — no FK, no unique, no check)
```

`information_schema.columns`: all six columns `is_nullable = YES`, `column_default` empty, types
`double precision` / `text` / `timestamp(3)` — exactly the data dictionary in `F9-ba.md` §1.1.
`prisma migrate diff` from that live DB to `schema.prisma` ⇒ **no difference**.
The migration SQL contains no `UPDATE`, no `NOT NULL`, no `DEFAULT`, no `CREATE INDEX`, and states
the rollback story in its Vietnamese header (AC-11.7).

## 5. The `updateMany` level guard, against real Postgres (AC-09.3/09.4/09.5/09.10)

The exact predicate Prisma emits (`id = ? AND (current_level_at IS NULL OR current_level_at <= ?)`):

| # | Scenario | Rows updated | Student after |
| :-- | :-- | :-- | :-- |
| A | first grading, `current_level_at IS NULL`, `receivedAt = 2026-08-10` | **1** | `A1 @ 2026-08-10` |
| B | **older** submission (`2026-07-01`) re-graded to `A0` | **0** ← the guard | unchanged `A1 @ 2026-08-10` |
| C | the **same newest** submission re-graded (equal `receivedAt`) | **1** (guard is `<=`, AC-09.4) | `A0 @ 2026-08-10` |
| D | deleted/absent student id | **0**, no exception (AC-09.10) | — |
| E | newer submission scoring lower | **1** — level moves **down** (AC-09.5, not a high-water mark) | `A0 @ 2026-09-01` |

Complementing this, `worker-api.controller.spec.ts` asserts the Prisma `where`/`data` object is
built exactly as above, and that `updateMany` is **not called at all** when `level === null`
(AC-09.6) or `studentId === null` (AC-09.8), and that both writes ride one `$transaction` (AC-09.9).

## 6. Mutation test — is the weight fix proven, or is the fixture tautological?

I reverse-patched `scorePctForGrading` back to the pre-F9 expression
(`sum / n / bandMaxFromRubric(rubric)`) and ran `analytics.spec.ts` unchanged:

```
✕ AC-12.7 the weight fix bites            Expected: 68.9   Received: 69.4
✕ AC-03.4/OQ-3 nearest_int before the %   Expected: 66.7   Received: 69.4
✕ AC-12.3 clamping ⇒ % ≤ 100              Expected: 100    Received: 3300
✕ AC-12.6 `sum` divides by the RUBRIC max Expected: 56     Received: 70
✓ … all 10 pre-F9 legacy cases + AC-12.6 pinned values still pass  ← the compatibility anchor
```

Two things are proven at once: the weighted fixture is **not** tautological (the old code produces
exactly the 69.4 the test forbids), and the ten legacy `average` cases are genuinely
version-agnostic — they pass under **both** implementations, which is what AC-12.5/BR-14 asks for.
File restored afterwards; md5 `f161cd36b9138cbf557b867bbd760d34` verified identical.

---

## Outputs (what this role produced)

- **This file** — 45 traced test cases across 6 techniques, 4 suite runs, 1 mutation run,
  1 real-Postgres migration validation, 1 real-Postgres state-transition table, 3 arbitrations.
- **Verdict: PASS.** No defect is assigned to any role. Every derived case and every existing
  suite is green; nothing was weakened.
- **Temporary QA artifacts, all removed:** `src/lib/qa-f9-probe.spec.ts`,
  `src/lib/qa-f9-corner.spec.ts`, the mutated `reports.service.ts`, container `qa-f9-pg`.
  `git status` carries no QA-created file and `reports.service.ts` md5 is unchanged.

## Blockers / open questions

None blocking. Two non-blocking observations, neither a defect against backend (both are
spec-level items — backend implemented the ACs verbatim):

**OBS-1 (documentation, owner: BA) — `F9-ba.md` AC-07.5 states the wrong level.**
Total 14 falls in the PDF's `11–15` band ⇒ `A1-` / "Starter (A1-) ~ Little Fox", not `A0`.
Fix the AC text; the code and its test are correct. See §2 D1.

**OBS-2 (low, owner: BA + F10 backend) — the AC-12.4 splice is report-path-only, so a rubric with an explicitly non-positive `scale.max` makes the stored total disagree with the reported one.**
Reproduced (temporary probe, since removed) on
`{schema_version:2, scale:{min:0,max:0}, band_scale:[0,5], method:'sum', 5 dims}` with scores 4,3,4,3,4:

```
WRITE path (worker-api, AC-08.1 — no splice) : total 0,  max 0,  level "A0", all 5 keys clamped
REPORT path (AC-12.4 — spliced to max 5)     : total 18, max 25, level "A1"
```

The write path stores `0 ⇒ "Pre-starter (A0) ~ Tiny Rabbit"` — the exact "plausible-looking wrong
answer" AC-04.5 was written to prevent — while reports say 18/25. This is **not** a backend defect:
AC-08.1 prescribes plain `computeTotal(normalizeRubric(rubric), scores)` and AC-12.4 scopes the
splice to `fetchGradingsInRange`; the internal inconsistency is between AC-12.10 and
AC-08.1/AC-12.4. It is also **unreachable today** — the `.docx` parser always emits a positive
scale, and the JSON authoring route is F10's. Recommended follow-ups, in F10:
1. reject `scale.max <= 0` at the authoring boundary (next to `validateLevels`); and/or
2. guard the two non-report `computeTotal` call sites with `counted > 0 && max > 0` before
   persisting a total/level, so AC-12.10's invariant holds for every rubric shape.

Also recorded, cosmetic, no action needed: `levelText()` in `worker-api.controller.ts:30-35`
coerces a non-string `level.code`/`label` to `null` independently, so a hand-broken rubric with
`code: {}` and `label: "x"` would store `levelCode = null` with `levelLabel = "x"`, momentarily
breaking `F9-ba.md` §1.1's "always null/non-null together". Nothing reads `levelCode` in the UI,
F11 reads `levelLabel`, and the shape is unreachable via any current authoring path.

## Notes for the next role

- **F10 backend:** `validateLevels` ships wired to nothing and is fully verified (6 fixtures,
  including that a bad `code` yields exactly one issue and no phantom gap). When you wire it into
  `POST /criteria/json`, please also close **OBS-2** by rejecting `scale.max <= 0` — that is the
  one rubric shape that can currently make a stored total disagree with the reported one.
  Your seed templates must replace `rubric-scoring.spec.ts`'s `KID_RUBRIC`/`IELTS_RUBRIC` by
  **import**, not by copy; both fixtures are byte-faithful to the two PDFs and are `normalizeRubric`
  fixed points.
- **F11 backend:** `Grading.studentAckAt` exists and is `NULL` on every row — verified on a real
  database, and `worker-api.controller.spec.ts` asserts F9 never writes it.
  `totalScore`/`levelCode`/`levelLabel` are populated from deploy onward; `Student.currentLevel*`
  is a *snapshot of the latest submitted work*, can move down, and cannot be overwritten by an
  older re-grade (all five transitions verified in §5).
- **BA:** one text correction to make (OBS-1) and one spec gap to consider (OBS-2).
