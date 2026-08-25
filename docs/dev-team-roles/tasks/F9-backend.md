# F9 · Backend — `computeTotal` server-side scoring + Prisma migration + `weight`-bug fix

- **Owner role:** backend
- **Feature:** F9 — pure `computeTotal(rubric, scores)` in `services/core-api/src/lib/rubric-scoring.ts`; additive Prisma migration (`Grading.totalScore/levelCode/levelLabel/studentAckAt`, `Student.currentLevelCode/currentLevelAt`); `POST /internal/gradings` computes + persists + updates the student level; `reports.service.ts` routed through `computeTotal` (fixes the standing `weight`-ignored bug); read-only total/level/`fix` on `SubmissionDetail.tsx` + i18n.
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** `F9-ba.md` (14 FRs / 101 ACs), `F9-pm.md` (US1–US4), `F8-backend.md` (v2 types + `normalizeRubric`)

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F9-ba.md` — the spec. Four load-bearing decisions restated by the coordinator: (1) reports RECOMPUTE, never read `Grading.totalScore`; (2) AC-02.7 dimension-less rubric falls back to `scores` keys with weight 1; (3) AC-12.4 `bandMaxFromRubric` keeps reading the RAW rubric, spliced into `scale.max` when the normalized one is ≤0; (4) `Student.currentLevelAt = Submission.receivedAt` with an `updateMany` out-of-order guard.
- `docs/dev-team-roles/tasks/F9-pm.md` — US1–US4, no backfill, `studentAckAt` ships here but is written by F11.
- `docs/dev-team-roles/tasks/F8-backend.md` — "Notes → F9 backend": `aggregation`/`levels` are carried but unused; `computeTotal` lives in `lib/rubric-scoring.ts` importing types from `criteria/rubric-schema.ts`; `GET /internal/criteria/:courseId` must stay verbatim.
- `Idea/20260819-ChamDiemRubricV2.md` Phần 5; `CLAUDE.md` (npm only via Docker).

## Checklist (the concrete work items for this task)

- [x] Create this task file, Status IN_PROGRESS
- [x] Read the remaining in-scope sources (schema.prisma, submissions.service.ts, analytics.spec.ts, migrations, SubmissionDetail.tsx, i18n, Criteria-Source)
- [x] FR-01…FR-06: `lib/rubric-scoring.ts`
- [x] FR-07 + every edge AC: `lib/rubric-scoring.spec.ts`
- [x] FR-11: `schema.prisma` 6 nullable fields + hand-authored migration SQL
- [x] FR-11: validate the migration on a disposable Postgres container + `prisma generate`
- [x] FR-08/FR-09: `worker-api.controller.ts` compute + persist + student level in one `$transaction`
- [x] FR-12: `reports.service.ts` recompute path + memoized normalize + `bandMaxFromRubric` splice
- [x] AC-13.1: `submissions.service.ts` `detail()` adds `totalMax`
- [x] FR-13/FR-14: `SubmissionDetail.tsx` + `i18n/index.ts`
- [x] Run core-api `tsc --noEmit` + jest in Docker; report real numbers
- [x] Run dashboard build in Docker
- [x] Fill Outputs, set Status DONE

## Outputs (what this role produced)

### Test / build results (all actually executed)

| Suite | Command | Result |
| :-- | :-- | :-- |
| core-api (TS) | `MSYS_NO_PATHCONV=1 docker run --rm -v ".../core-api:/app" -w /app node:24-alpine sh -c "npm ci && npx prisma generate && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2"` | **32 suites / 502 tests passed**, 0 failed. `tsc --noEmit` clean, `prisma generate` OK. 292.9 s |
| dashboard | `... node:24-alpine sh -c "npm ci && npm run build"` (`tsc -b && vite build`) | **build OK** — 88 modules, 17.63 s, no TS error. No jest suite exists (build-only, matches M4). |
| migration | disposable `postgres:16-alpine` on a throwaway docker network | applied to a **non-empty** DB; `prisma migrate status` = "up to date"; `prisma migrate diff` = **"No difference detected"** |

**Baseline preserved: F8 left 31 suites / 409 tests. F9 = 32 / 502 (+1 suite, +93 tests).**
Every pre-existing test passes with **unchanged assertions** — no assertion was edited, weakened or
deleted anywhere. The only edits to existing spec files are **additive** (`describe` blocks appended):

| Spec file | before → after |
| :-- | :-- |
| `src/lib/rubric-scoring.spec.ts` (new) | 0 → 71 |
| `src/reports/analytics.spec.ts` | +9 (new `describe('F9 — computeTotal-based scoring')`) |
| `src/worker-api/worker-api.controller.spec.ts` | +10 (new `describe('WorkerApiController — F9 createGrading')`) |
| `src/submissions/submissions.service.spec.ts` | +3 (new `describe('F9 detail().grading.totalMax')`) |

`analytics.spec.ts`'s ten pre-F9 cases — including the `{ band_scale: [0,3] }` fixtures and the two
F8 `scale.max`/fallback cases — are byte-identical and green. That is NFR-04/AC-12.5 in practice.

### Migration validated on a real database (FR-11)

Procedure: bring a throwaway `postgres:16-alpine` to the **previous** head (F9 migration stashed) →
seed a `courses`/`criteria`/`students`/`submissions`/`gradings` row → restore the migration →
`prisma migrate deploy`. Verified afterwards:

- the 6 columns exist, `is_nullable = YES`, `column_default` empty, correct types
  (`double precision`, `text`, `timestamp(3)`);
- **MD5 fingerprint over the pre-F9 columns of `gradings` and `students` is byte-identical
  before/after** (`4a914dd6…`, `1eb71aa2…`) — not one existing row was touched;
- all 6 new columns are `NULL` on every pre-existing row (no backfill, BR-07);
- `pg_indexes` on `gradings`/`students` is unchanged (5 indexes, all pre-existing) — no new index,
  unique or FK;
- `prisma migrate diff --from-url … --to-schema-datamodel` ⇒ **"No difference detected"**, i.e. the
  hand-authored SQL matches `schema.prisma` exactly.

**End-to-end write-path probe** (throwaway `ts-node` script against that same live DB, deleted
after the run — `git status` clean of it):

```
A) 18/25 write: computed 18/25 → row {totalScore:18, levelCode:"A1",
   levelLabel:"Mover (A1) ~ Junior Panda", studentAckAt:null}, studentRowsUpdated:1
   student after A: {currentLevelCode:"A1", currentLevelAt:"2026-08-10T10:00:00.000Z"}
B) OLDER submission (2026-07-01) re-graded all-zero → grading row written {total:0, level:"A0"},
   studentRowsUpdated:0   ← the out-of-order guard
   student after B: still {currentLevelCode:"A1", currentLevelAt:"2026-08-10T10:00:00.000Z"}
C) pre-F9 grading row: {totalScore:null, levelCode:null, levelLabel:null, studentAckAt:null}
```

### New files

- **`services/core-api/src/lib/rubric-scoring.ts`** — the whole of FR-01…FR-06. Pure; imports only
  `criteria/rubric-schema` (types + the `DEFAULT_SCALE` constant). Exports:
  ```ts
  computeTotal(rubric: RubricV2, scores: unknown): ComputeTotalResult
  //   { total, max, level, counted, missing, ignored, clamped }
  maxTotal(rubric: RubricV2): number
  findLevel(levels: RubricLevel[], total: number): RubricLevel | null
  validateLevels(rubric: RubricV2): LevelIssue[]   // { code, index, message } — vi messages
  type LevelIssueCode = 'level_invalid' | 'level_overlap' | 'level_gap'
                      | 'level_coverage_start' | 'level_coverage_end'
  ```
  Never throws, never mutates, never normalizes, always finite. Vietnamese comments throughout.
- **`services/core-api/src/lib/rubric-scoring.spec.ts`** — 71 tests. Both source-PDF fixtures
  (`KID_RUBRIC`, `IELTS_RUBRIC`) live here and are hand-built per A8; F10 re-points them at its seeds.
- **`services/core-api/prisma/migrations/20260821120000_add_grading_totals_and_student_level/migration.sql`**
  — two `ALTER TABLE`s, six nullable columns, Vietnamese header stating the no-backfill and rollback
  story. No `UPDATE`, no `NOT NULL`, no `DEFAULT`, no `CREATE INDEX`, no down-migration.

### Changed files

- **`services/core-api/prisma/schema.prisma`** — `Grading.totalScore Float? @map("total_score")`,
  `levelCode`, `levelLabel`, `studentAckAt`; `Student.currentLevelCode`, `currentLevelAt`. Nothing else.
- **`services/core-api/src/worker-api/worker-api.controller.ts`** — `createGrading` is now `async`:
  loads criteria + submission, `computeTotal(normalizeRubric(criteria.rubric), body.scores)`, persists
  the three columns (all `null` when `counted === 0`), and updates the student level inside a single
  `prisma.$transaction([...])`. New module-level helper `levelText()` coerces a teacher-authored
  non-string `level.code`/`label` to `string | null` so a bad rubric cannot become a Prisma 500.
  `GET /internal/criteria/:courseId` **untouched** (still returns the stored row verbatim — F8 AC-08.2).
  `POST /internal/pilot-text-gradings` untouched. `CreateGradingDto` untouched.
- **`services/core-api/src/reports/reports.service.ts`** — `GradingInRange` gains `rubric: RubricV2`;
  `fetchGradingsInRange` selects `criteriaId` and resolves `{rubric, bandMax}` through a
  `Map<number,…>` memo (one `normalizeRubric` per distinct `criteriaId`; rows whose `criteriaId` is
  null/undefined are resolved individually rather than sharing an `undefined` key);
  `scorePctForGrading(scores, rubric)` now returns `round1(total/max*100)` via `computeTotal`, and the
  old `sum / n / bandMax` expression is **deleted**. `bandMaxFromRubric` kept, still reading the RAW
  rubric, spliced into `scale.max` when the normalized value is `<= 0`. `dimensionScore`,
  `kpis().avgPronunciation`, `dimensionBreakdown`, `pilotComparison`, `submissionRate`, `cost`,
  `pendingReview` all unchanged (AC-12.8).
- **`services/core-api/src/submissions/submissions.service.ts`** — `detail()` adds a derived
  `grading.totalMax` (`null` when there is no grading or `max <= 0`). `list()`/`deleteMedia()` unchanged.
- **`services/dashboard/src/pages/SubmissionDetail.tsx`** — `Grading` interface gains
  `totalScore/levelCode/levelLabel/totalMax` and `scores[dim].fix?`; one total/level line (or the muted
  "graded before totals" line) inside the existing scores card; the per-dimension `fix` renders on its
  own line under the comment (`<li>` gained `flex-wrap`, the sub-line `w-full`). No new input, button,
  mutation or focusable element. `Submissions.tsx` and the pilot card untouched.
- **`services/dashboard/src/i18n/index.ts`** — `submissions.total`, `submissions.totalUnavailable`,
  `submissions.scoreFix` in **both** the `vi` and `en` blocks.
- Spec files: `analytics.spec.ts`, `worker-api.controller.spec.ts`, `submissions.service.spec.ts`
  (appended blocks only).

### Not changed (deliberate)

`services/grading-worker/**` and `services/zalo-gateway/**` — **zero F9 edits** (FR-10). The
grading-worker files that show as dirty in `git status` are F8's uncommitted work, not mine; `grep`
confirms nothing under either service references `rubric-scoring`. Also untouched:
`criteria/rubric-schema.ts`, `criteria.service.ts`, `docx-parser.ts`, `gradings.service.ts`,
`CreateGradingDto`, all three `contracts` files, both `package.json`s (NFR-05 — no new dependency).

### API contract (what actually changed on the wire)

| Method | Path | Auth | Request | Response change |
| :-- | :-- | :-- | :-- | :-- |
| `POST` | `/internal/gradings` | `InternalTokenGuard` (static shared token) | **unchanged byte-for-byte** — `{submissionId, criteriaId, criteriaVersion, scores, llmFeedback, autoSent?}` | 201 + the `Grading` row, now **also** carrying `totalScore: number\|null`, `levelCode: string\|null`, `levelLabel: string\|null`, `studentAckAt: null`. Additive, backward compatible; the worker ignores them. New errors: **404** `criteria not found`, **404** `submission not found` (previously surfaced as 500 FK failures; unreachable in normal operation). Side effect: `students.current_level_code/at` updated when a level was resolved and the guard passes. |
| `GET` | `/submissions/:id` | `SessionAuthGuard` (admin+staff) | unchanged | `grading` now carries the three new columns plus a derived `totalMax: number\|null`. `grading: null` when there is none. |
| `GET` | `/internal/criteria/:courseId` | `InternalTokenGuard` | — | **UNCHANGED, verbatim stored row** (F8 AC-08.2 / F9 OQ-4). Not normalized. |
| `GET` | `/reports/*`, `/reports/analytics/*` | `SessionAuthGuard` | unchanged | Shapes unchanged. **Numbers change** only for rubrics with `weighted_average` + uneven weights, `sum`, `nearest_int`, or a `scores` key set differing from the dimension set. Every `average`-normalized (i.e. pre-F9) rubric reports the identical number. |

No new endpoint, no new auth surface, no new env var, no schema-level secret. Rubric-authored strings
(`level.label`, `fix`) are rendered by React as text and never reach SQL, a shell or a file path.

### Deviations from F9-ba.md — read these, they are the QA hot spots

1. **AC-07.5 contains an arithmetic error in the spec and I did NOT reproduce it.** It states
   `total = 14` **and** `level.code = "A0"`. Its own level table (and `RubricSpeakingA0-C.pdf`) maps
   `11–15 → "A1-" (Starter ~ Little Fox)`; `0–10 → A0`. 14 is therefore **A1-**. The test asserts
   `A1-` and carries a comment pointing at this note. Everything else in AC-07.5 (`total 14`,
   `max 25` unchanged, `counted 4`, `missing ["pronunciation"]`) is reproduced exactly.
2. **`scorePctForGrading(scores, rubric)` takes the rubric only**, not "the rubric plus the legacy
   `bandMax`" as AC-12.3's parenthetical suggests. Reason: the AC-12.4 splice is applied **once per
   distinct `criteriaId`** inside `fetchGradingsInRange` (which is what AC-12.2 asks for), so by the
   time the rubric reaches this method it already carries the effective scale. Passing `bandMax`
   again would force a per-row splice. `bandMaxFromRubric` is still present, still reads the raw
   rubric, and is still used directly by `avgPronunciation`/`dimensionBreakdown`.
3. **`rubric-scoring.ts` imports one VALUE**, `DEFAULT_SCALE`, from `criteria/rubric-schema.ts`.
   AC-01.1 says "imports only types"; AC-05.6 and F8 BR-06 say the `3` fallback must exist exactly
   once repo-wide. I chose BR-06. `rubric-schema.ts` has zero imports of its own, so the
   no-I/O intent of AC-01.1 is intact.
4. **`ignored` ordering, reconciling §1.3 with AC-05.5.** §1.3 says `ignored` is "keys present in
   `scores` that are not effective dimensions (extras + duplicates), in `Object.keys(scores)` order",
   but a dropped duplicate dimension key is by definition still an effective key, so it can never be
   an "extra". Implemented as: extras in `Object.keys(scores)` order **first**, then dropped duplicate
   dimension keys, each appearing at most once (satisfies AC-05.5's "appears once").
5. **A non-plain-object `scores` (including an array) is treated as having no keys at all.** AC-05.1
   demands `ignored = []` for an array, which enumerating `Object.keys([1,2,3])` would violate. The
   AC's own parenthetical about index strings is therefore moot; the stated outcome is honoured.
6. **`validateLevels` keeps an entry in the ordering pass when its `min`/`max` are usable, even if it
   is `level_invalid` for a bad `code`/`label`.** Dropping it would manufacture a phantom
   `level_gap` in the hole it left, and AC-06.9 requires the `code: ""` fixture to yield **exactly
   one** issue. There is an explicit test for this.
7. **`max <= 0` is unreachable from the report path** after the AC-12.4 splice, because
   `bandMaxFromRubric` never returns a non-positive number (it falls back to `3`). The guard in
   `scorePctForGrading` is kept as AC-12.3 requires, but it is exercised directly in
   `rubric-scoring.spec.ts` (AC-05.8, inverted-scale) rather than through `reports.service.ts`.

## Blockers / open questions

None. F9-ba.md §8's five open questions were all pre-decided by the spec and implemented as written
(OQ-1 `sum` ignores `weight`; OQ-2 `currentLevel*` preserved on a null level; OQ-3 `nearest_int`
applied before the percentage — there is an explicit test pinning 6/9 = 66.7 %; OQ-4
`GET /internal/criteria/:courseId` left verbatim; OQ-5 `clamped` stays diagnostic-only).

## Notes for the next role

- **QA:** the strongest regression evidence is the pre-existing suite passing with **unchanged
  assertions** — `git diff` on `analytics.spec.ts` shows one appended `describe` and nothing else.
  Two numbers to check by hand: **AC-07.1** (18/25 → "Mover (A1) ~ Junior Panda", proven against a
  real Postgres in the probe above) and **AC-07.12/AC-12.7** (weighted 6.2 vs unweighted 6.25; as a
  report percentage 68.9 % vs 69.4 % — the proof the standing bug was real). **AC-12.10** is asserted
  with `Object.is` on the write-path vs report-path totals. Please read deviations **1** (AC-07.5's
  "A0" is a spec slip — 14 is A1-) and **2** (`scorePctForGrading` signature) before filing them as
  defects. The memoization AC (AC-12.2) is proven *observably* — two rows sharing a `criteriaId` but
  carrying different rubrics must both report the first rubric's number — rather than by mocking the
  import; if you prefer a mock-based check, note that a `jest.mock` of `criteria/rubric-schema` would
  also stub out `normalizeRubric` for `worker-api` and `submissions`.
- **Front-end/QA-UI:** `GET /submissions/:id` → `grading.totalMax` is server-derived. Three render
  states: total+level, total only (`levelLabel` null/empty ⇒ no `—`), and the muted
  `submissions.totalUnavailable` line whenever `totalScore` **or** `totalMax` is null.
- **F10 backend:** `validateLevels(rubric)` is shipped and wired to **nothing**. It returns
  `LevelIssue[]` with Vietnamese `message`s ready to go straight into a 400 body; wire it into
  `POST /criteria/json` and the template routes. Your seed templates should replace
  `rubric-scoring.spec.ts`'s hand-built `KID_RUBRIC`/`IELTS_RUBRIC` by **import**, never by copy
  (F8 AC-15.9) — both are already normalize fixed points. Note `granularity()` reads
  `aggregation.round`/`scale.step`, so a seed with `step != 1` changes what counts as a gap.
- **F11 backend:** `Grading.studentAckAt` exists and is `NULL` on every row — F9 writes it never.
  `totalScore`/`levelCode`/`levelLabel` are populated from F9's deploy onward and are what
  `student_reply.show_total`/`show_level` should read; **do not** recompute in the outbound path.
  `Student.currentLevelCode/currentLevelAt` give you the Zalo-user → student → level mapping.
- **F12 front-end:** `dashboard/src/lib/rubric.ts` does not exist and must not re-derive the math —
  reuse `maxTotal`/`findLevel`/`validateLevels` **semantics** exactly (inclusive bounds, first match
  wins, `sum` ignores `weight`, `counted === 0` ⇒ no total).
