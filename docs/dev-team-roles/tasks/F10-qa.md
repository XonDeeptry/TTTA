# F10 · QA — Seeded rubric templates + template CRUD + 2 privileges

- **Owner role:** qa
- **Feature:** F10 — `RubricTemplate` table + bootstrap seeder (2 default templates) + 7-operation template CRUD + `rubric_template`/`criteria_author` privileges + `PrivilegeGuard` + staff-backfill migration
- **Status:** DONE
- **Verdict:** **PASS** (after fix round 1 — see the "Fix round 1 re-gate" section at the end).
  Both round-0 defects independently verified as closed; no defect open; 3 informational
  observations carried to BA/F12.
- **Round 0 verdict:** **FAIL** — 2 defects (both Minor, both owned by **backend**): DEF-1 `AC-19.6`
  `scale.step <= 0` is accepted (201) instead of rejected (400); DEF-2 `AC-03.1`/§5.1 `NOT NULL`
  missing on `privileges`/`locked` and backend's stated justification is disproven by experiment.
  154 + 11 of my own derived cases pass; all four other suites are green.
- **Last updated:** 2026-08-23 (fix round 1)
- **Depends on:** `F10-ba.md` (181 ACs), `F10-backend.md`, `F9-qa.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 4, `Criteria-Source/*.pdf`

## Inputs (what this role received)

- `F10-ba.md` — 22 FRs / 181 numbered ACs, 8-row endpoint table, §9 deviations D-1…D-5.
- `F10-backend.md` — implementation claims, 3 self-flagged deviations to arbitrate,
  claimed suite **39 suites / 706 tests** (F9 baseline 32/502).

## Checklist (the concrete work items for this task)

- [x] Create task file, Status IN_PROGRESS
- [x] Read BA + backend task files, design Phần 4, source PDFs (both read directly — seeds
      confirmed faithful to `RubricSpeakingA0-C.pdf` Table A and `Analystic-ScoringBand.pdf`)
- [x] Run core-api: `npm ci` (589 pkgs) + `prisma generate` OK + `tsc -p tsconfig.build.json
      --noEmit` clean + `tsc -p tsconfig.json --noEmit` clean + jest **39 suites / 706 tests
      passed, 0 failed** (261 s) — backend's claim CONFIRMED exactly
- [x] Run dashboard build in Docker — `tsc -b && vite build` clean, 88 modules, 19.25 s, exit 0
- [x] Run grading-worker pytest (**261 passed**, 66.8 s) and zalo-gateway jest
      (**5 suites / 26 tests passed**, 131 s) — both untouched, both green
- [x] Static code review of all new/changed files against the ACs
- [x] Real Postgres: migration + AC-01.3 migrate diff ("No difference detected") + AC-01.4/03.4/
      03.5 fingerprints (6/6 byte-identical) + AC-03.3 idempotency (`UPDATE 0`) + AC-01.2/02.2 FKs
- [x] Real Postgres: **AC-02.4 PASSES** — delete a template, derived `criteria` still reads,
      lists, returns verbatim internally, and grades **18 / A1 / "Mover (A1) ~ Junior Panda"**
- [x] Real Postgres: AC-07.3 mutate-then-reboot anti-clobber — row byte-identical, `updatedAt`
      unchanged; AC-16.9 an edit to a system template survives a reboot
- [x] AC-06.3 grep for pasted seed duplicates — no duplicate of either seed; one pre-existing F8
      note recorded as OBS-1 (not F10's)
- [x] Privilege matrix AC-09.3 / AC-08.6-08.8 / AC-08.10 — full matrix green incl. grant and
      revoke taking effect on the very next request with no re-login
- [x] Endpoint table: all 8 routes, exact status codes, all three 409s — green
- [x] FR-19 validation — `scale.max <= 0` (F9 OBS-2) closed; **AC-19.6 `scale.step <= 0` FAILS**
- [x] Route order AC-20.1-20.4 — green over real HTTP
- [x] Arbitrate backend's 3 self-flagged deviations — #1 rejected (justification disproven by
      experiment ⇒ DEF-2), #2 and #3 accepted
- [x] Verify AC-22.4 verbatim internal criteria (proven behaviourally) + AC-22.2 no new dependency
      (`git diff HEAD -- package.json` empty in **both** services) + AC-22.3 (zalo-gateway clean;
      the dirty grading-worker files are F8's, named as such in `F8-backend.md`)
- [x] Clean working tree of QA artifacts — probes lived in the scratchpad, mounted into the
      container at `/app/qa-tmp`; `git status` shows only F8/F9/F10 source. QA containers/network
      (`f10qapg`/`f10qaredis`/`f10qarabbit`/`f10qanet`) torn down. The running dev compose stack
      was never touched.
- [x] Write results, verdict, set Status

### Fix round 1 re-gate checklist

- [x] core-api re-run: `npm ci` + `prisma generate` + `tsc -p tsconfig.build.json --noEmit`
      (TSC_BUILD_OK) + `tsc -p tsconfig.json --noEmit` (TSC_ALL_OK) + jest
      **39 suites / 723 tests passed** (194.7 s) — +17 vs round 0's 706
- [x] Migration re-validated on a fresh populated pre-F10 DB: 6/6 fingerprints identical,
      backfill correct, `UPDATE 0`, `migrate diff` "No difference detected"
- [x] **DEF-2 closed** — both columns `NOT NULL DEFAULT ARRAY[]::text[]`; Postgres now *refuses*
      `SET privileges = NULL` and `INSERT … locked = NULL`
- [x] **DEF-1 closed** — re-ran my verbatim round-0 repro over real HTTP
- [x] DEF-1 regression sweep: previously-legal authoring inputs still accepted
- [x] Full 165-case probe re-run
- [x] Rule on OBS-2
- [x] Re-run dashboard build, grading-worker, zalo-gateway; re-check package.json diffs
- [x] Reverse-patch proof independently reproduced (14 failures / 3 suites) via a container-only
      bind-mount, repo file verified untouched
- [x] Tear down, final verdict — **PASS**

## Outputs (what this role produced)

### 1. Suites — all re-run by me, none taken on trust

| Suite | Command | Result | Backend claimed | Verdict |
| :-- | :-- | :-- | :-- | :-- |
| core-api | `docker run … node:24-alpine "apk add openssl && npm ci && npx prisma generate && npx tsc -p tsconfig.build.json --noEmit && npx tsc -p tsconfig.json --noEmit && npm test -- --maxWorkers=2"` | **39 suites / 706 tests passed, 0 failed** (261 s); `prisma generate` OK; both `tsc --noEmit` clean | 39 / 706 | **confirmed exactly** |
| dashboard | `npm ci && npm run build` (`tsc -b && vite build`) | **exit 0**, 88 modules, 19.25 s | build OK | confirmed |
| grading-worker | `.venv/Scripts/pytest -q` | **261 passed** (66.8 s) | untouched | confirmed |
| zalo-gateway | `docker … npm test -- --maxWorkers=2` | **5 suites / 26 tests passed** (131 s) | untouched | confirmed |

F9 baseline was 32 suites / 502 tests ⇒ F10 adds **+7 suites / +204 tests** and breaks nothing.

### 2. Real-Postgres migration verification (disposable `postgres:16-alpine`, F9's procedure)

Pre-F10 head applied first (F10 migration copied aside inside the container — repo untouched),
then a populated DB: 1 course, 1 criteria, 1 student, 1 submission, 1 grading, 1 admin + 2 staff.

| AC | Result |
| :-- | :-- |
| AC-01.3 | `prisma migrate diff --from-url <migrated> --to-schema-datamodel` ⇒ **"No difference detected"** |
| AC-01.4 / AC-03.5 | **6/6 MD5 fingerprints byte-identical** before/after: `criteria 3e7af070…`, `gradings e621cb71…`, `students 2dcff50c…`, `submissions 5bd7a652…`, `dashboard_users(old cols) 00b5c633…`, `courses 122a27d3…` |
| **AC-03.4** | `teacher1`/`teacher2` (staff) ⇒ `{criteria_author}`; `admin@ilm.local` ⇒ `{}` — **the anti-lock-out backfill works** |
| AC-03.3 | re-running the `UPDATE` ⇒ `UPDATE 0`, all 6 fingerprints still identical |
| AC-01.2 | `rubric_templates`: exactly 2 indexes (`_pkey`, `_key_key` UNIQUE on `key`); `SELECT count(*) FROM pg_constraint WHERE contype='f' AND (conrelid|confrelid='rubric_templates')` ⇒ **0** |
| AC-02.2 / AC-02.3 | `criteria` still has only `criteria_pkey` + `criteria_course_id_fkey`; no index and no FK on `template_key`; the pre-existing row is `NULL` |

### 3. My own black-box probe — 165 derived cases against the real stack

The app was booted for real (`NestFactory.create(AppModule)` + `express-session`/`connect-redis`,
`ValidationPipe({whitelist,transform})` exactly as `main.ts`) on a disposable
Postgres + Redis + RabbitMQ network, with **four real logged-in sessions** (admin, staff `[]`,
staff `criteria_author`, staff `rubric_template`) — not mocks.

**Probe 1: 154 passed / 5 "failed"** — 4 of the 5 were my own strict `JSON.stringify` comparison
tripping over Postgres jsonb key reordering (F8 OBS-03) and over the fact that `GET /criteria/:id`
normalizes on read (pre-existing F8 behaviour). **Probe 3 re-tested all four with key-order-
insensitive deep equality and a proper before/after comparison: all 4 PASS.** The 5th is real —
DEF-1 below. Probe 3: 11 passed / 3 failed (the 3 are DEF-1 at both write paths).

Highlights, by the BA's own "decisive tests" list:

- **AC-02.4 — the feature's most important test — PASSES on a real Postgres.** `doomed_template`
  duplicated from a system template, `criteria.templateKey` pointed at it, then
  `DELETE /criteria/templates/doomed_template` ⇒ **204**. Afterwards, with the key now an orphan:
  `GET /criteria/1` ⇒ 200 with `templateKey: "doomed_template"` and a response **byte-identical to
  the same GET taken before the delete**; `GET /criteria?courseId=1` still lists it;
  `GET /internal/criteria/1` ⇒ 200 **verbatim** (deep-equal to the raw jsonb, not normalized —
  AC-22.4 holds); `POST /internal/gradings` ⇒ 201 with **`totalScore 18`, `levelCode "A1"`,
  `levelLabel "Mover (A1) ~ Junior Panda"`**, and `students.current_level_code` ⇒ `A1`. Nothing
  returned 409 or 5xx. The raw `criteria` row is byte-identical before/after. Backend's live-probe
  claim is **independently reproduced**.
- **AC-07.3** — seeded row mutated (`name`, `rubric`, `isActive=false`), seeder re-run: row
  **byte-identical**, `updatedAt` unchanged, still exactly 2 rows. AC-16.9 also verified: an edit
  to a system template survives a reboot.
- **AC-07.1/07.6** — boot on an empty table logged `Seeded 2 rubric templates` **once**; both rows
  `isSystem`/`isActive` true; `rubric`/`locked`/`name` deep-equal the seeds. Second boot: no log.
- **AC-06.1** — both seeds are `normalizeRubric` fixed points. **AC-06.7** — posting each seed's
  own body to `POST /criteria/templates` returns 201.
- **AC-18.2/18.4** — reset restores `name`+`rubric`+`locked` from the seed, leaves `isActive`
  alone (D-4), keeps `id`/`createdAt`/`isSystem`; a second reset yields an identical row.
- **Privilege matrix** — `POST /criteria` (.docx, using the repo's own `templates/rubric-template.docx`):
  admin ⇒ 201 · staff+`criteria_author` ⇒ 201 · staff+`rubric_template` only ⇒ **403
  `insufficient privilege`** · staff+`[]` ⇒ 403 · anonymous ⇒ 401. Reads (`GET /criteria`,
  `/criteria/:id`, `/criteria/templates`) stay 200 for a staff with `[]`. AC-08.9: a live session
  whose row was deleted ⇒ 403, never 500. AC-08.11: junk strings in `privileges` grant nothing.
- **AC-08.10** — the same cookie: 403 → admin `PATCH /users/:id {privileges:['rubric_template']}`
  → **201 on the very next request, no re-login** → `PATCH … {privileges:[]}` → 403 again.
- **Endpoint table** — all 8 routes exercised over real HTTP with their exact codes, plus all
  three 409s (`system templates cannot be deleted`, `reset is only available for system
  templates`, `template key already exists`) and the 409 for `no seed definition for this template`.
- **AC-20.x** — every literal route routes correctly (never `ParseIntPipe`'s "numeric string is
  expected"); `GET /criteria/1` ⇒ 200, `/criteria/abc` ⇒ 400, `/criteria/templates/123` ⇒ **404**.
- **FR-19** — `scale.max = 0` and a negative max ⇒ 400 `scale.max must be greater than 0`
  (**F9-qa OBS-2 is closed**); inverted scale, empty dimensions, missing `pronunciation`,
  duplicate/invalid dimension key, negative weight, empty `output_fields` all ⇒ 400 with the exact
  documented messages; all five `LevelIssue` codes reproduced with F9's Vietnamese text verbatim
  inside `{message:'invalid rubric', issues:[…]}`; `levels: []` and `weight: 0` accepted; 5 garbage
  payloads (incl. `{}`, deep nesting, `1e308`) — **never a 500**.
- **FR-10/11** — `PATCH` full-replace + de-dupe + 400 on a typo + "absent ⇒ not written";
  new staff ⇒ `[]`; `/auth/me` gives an admin the **full effective set** while the stored column
  is `[]`; `POST /auth/login` shape still `["email","role","mustChangePassword"]` (AC-11.5).

### 4. Arbitration of backend's three self-flagged deviations

1. **`privileges`/`locked` NULL-able instead of `NOT NULL` — REJECTED ⇒ DEF-2.** Backend's stated
   reason ("adding `NOT NULL` would make AC-01.3's `migrate diff` report a difference") is
   **factually wrong**, and I tested it directly: on the migrated DB I ran
   `ALTER TABLE rubric_templates ALTER COLUMN locked SET NOT NULL;` +
   `ALTER TABLE dashboard_users ALTER COLUMN privileges SET NOT NULL;` — both applied cleanly to a
   populated table, and `prisma migrate diff` **still reported "No difference detected"**. Prisma
   simply does not diff nullability on scalar-list columns, so both forms are diff-clean and the
   AC-worded form was available at zero cost. (Reverted afterwards.) See DEF-2 for severity.
2. **Five moved pre-existing assertions — ACCEPTED, none weakened.** I read every diff:
   `auth.controller.spec.ts` `toEqual(user)` → `resolves.toEqual({...user, privileges: []})` still
   pins all four original fields by value and adds 2 new cases; `users.service.spec.ts` `VIEW_KEYS`
   5→6 and the two exhaustive `Object.keys(data)` lists gained one name each — every
   `expect(...).toEqual(VIEW_KEYS)` line is byte-identical and now demands *more*;
   `users.dto.spec.ts` gained `'privileges'` while the three `not.toHaveProperty(...)` security
   lines are untouched. The F9-fixture re-pointing in `worker-api.controller.spec.ts`,
   `analytics.spec.ts` and `submissions.service.spec.ts` now derives `scale`/`aggregation`/
   dimension keys from `CAMBRIDGE_YL_SEED`/`IELTS_SPEAKING_SEED`; the seed values are identical to
   F9's hand-built literals (`{0,5,1}` + `sum/none` + the 5 keys / `{0,9,1}` + `average/nearest_int`
   + the 4 keys), so **zero assertions moved** — confirmed by reading, and by the whole suite
   passing. `rubric-scoring.spec.ts`'s 149 `expect` calls now run against the shipped seeds, which
   is exactly what AC-06.3/06.4 asked for.
3. **jest "worker failed to exit gracefully" — ACCEPTED as pre-existing.** Reproduced by running
   *only* `src/auth/auth.service.spec.ts` + `src/auth/bootstrap-admin.service.spec.ts` (2 suites /
   10 tests, both untouched by F10): the warning appears. bcrypt's native thread pool.

### 5. Defects

#### DEF-1 — `scale.step <= 0` is silently accepted and rewritten instead of rejected

- **Severity:** Minor (functional-requirement miss; no wrong grading results)
- **AC violated:** **AC-19.6** ("`scale.step <= 0` ⇒ 400 `scale.step must be greater than 0`");
  also BR-12's spirit that authoring-time is where strictness lives
- **Owning role:** **backend**
- **File/line:** `services/core-api/src/criteria/rubric-template.service.ts:84-88`
  (`prepareRubric` = `normalizeRubric` **then** `assertAuthorableRubric`) against
  `services/core-api/src/criteria/rubric-schema.ts:152`
  (`step: step !== null && step > 0 ? step : DEFAULT_SCALE.step`)
- **Repro:** as a user holding `rubric_template`,
  `POST /criteria/templates {"key":"x","name":"x","rubric":{…seed…,"scale":{"min":0,"max":5,"step":0}}}`
- **Actual:** `201 Created`, stored `scale.step = 1`. Same for `step: -1`, `null`, `"x"`. Same on
  `PUT /criteria/templates/:key` ⇒ `200`.
- **Expected:** `400 {"message":"scale.step must be greater than 0"}`, no row created/updated.
- **Evidence:** probe 3 —
  `AC-19.6 POST … scale.step=0 ⇒ 400 — got 201, stored step=1`;
  `… scale.step=-1 ⇒ 400 — got 201, stored step=1`;
  `AC-19.6 PUT … scale.step=0 ⇒ 400 — got 200, stored step=1`.
  Root cause isolated in probe 2: `normalizeRubric` coerces **every** non-positive/non-numeric
  `step` to `1` *before* the validator runs, so `rubric-validation.ts:57`'s
  `if (!(scale.step > 0)) reject('scale.step must be greater than 0')` is **unreachable from both
  HTTP write paths**. `scale.max` is *not* coerced, which is why the structurally identical
  AC-19.4 check does fire — the code is inconsistent with itself, not deliberately relaxed, and
  backend did not flag this as a deviation.
- **Why the green suite missed it:** `rubric-validation.spec.ts` calls `assertAuthorableRubric`
  with a **non-normalized** rubric, an input shape FR-19 states the validator never receives. The
  branch is covered but dead in production — false confidence.
- **Suggested fix (one place):** in `prepareRubric`, inspect the *raw* `scale.step` before
  normalizing (e.g. `if (isPlainObject(raw.scale) && raw.scale.step !== undefined && !(Number(raw.scale.step) > 0)) reject(...)`),
  or make `normalizeRubric` preserve a non-positive step so the existing check can fire. Add a
  spec that goes through `RubricTemplateService.create`, not through the validator directly.
  If the project owner would rather keep silent coercion, that is a BA change to AC-19.6, not a
  code change — but it must be written down, because F12 reuses this validator verbatim.

#### DEF-2 — `privileges` / `locked` are nullable in Postgres; the stated justification is false

- **Severity:** Minor (defence-in-depth only — see "impact" below)
- **AC violated:** **AC-03.1** ("`privileges String[] @default([])` (Postgres `text[]`,
  **`NOT NULL DEFAULT ARRAY[]::text[]`**)"), **§5.1** (`locked` Required = yes), and BA's explicit
  DBA note "`ALTER TABLE dashboard_users ADD privileges text[] NOT NULL DEFAULT '{}'`"
- **Owning role:** **backend** (hand-authored the migration; DBA if the orchestrator prefers)
- **File/line:** `services/core-api/prisma/migrations/20260822090000_add_rubric_templates_and_privileges/migration.sql:38`
  (`"locked" TEXT[] DEFAULT ARRAY[]::TEXT[]`) and `:54`
  (`ADD COLUMN "privileges" TEXT[] DEFAULT ARRAY[]::TEXT[]`) — neither carries `NOT NULL`
- **Repro:** apply the migration, then `\d dashboard_users` / `\d rubric_templates` ⇒ both columns
  `Nullable = yes`; `UPDATE dashboard_users SET privileges = NULL WHERE id = 1;` succeeds.
- **Actual vs expected:** nullable vs `NOT NULL DEFAULT ARRAY[]::TEXT[]`.
- **Evidence / why the justification fails:** I applied
  `ALTER … SET NOT NULL` to both columns on the fully-migrated, populated DB and re-ran
  `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` — output was still
  **"No difference detected"**. So AC-01.3 and AC-03.1 are *not* in conflict; the deviation buys
  nothing.
- **Impact (measured, not assumed):** I forced NULLs into both columns and exercised the app —
  `GET /criteria/templates` ⇒ 200, `GET /criteria/templates/:key` ⇒ 200, a gated write ⇒ 403,
  `GET /auth/me` ⇒ 200 `[]`, `GET /users` ⇒ 200 `[]`. `PrivilegeGuard` and `effectivePrivileges`
  both `Array.isArray`-guard, `Users.tsx` uses `u.privileges ?? []`, and Prisma never writes NULL.
  So this is **not** an exploitable or crashing bug today — it is a missing constraint that the
  spec asked for and that costs two lines. It matters because `RubricTemplateService.toView`'s
  `locked: [...row.locked]` would throw on a NULL, so the only thing standing between a raw-SQL
  NULL and a 500 is that nobody has written one.
- **Suggested fix:** append to the same (not-yet-committed) migration:
  `ALTER TABLE "rubric_templates" ALTER COLUMN "locked" SET NOT NULL;` and
  `ALTER TABLE "dashboard_users" ALTER COLUMN "privileges" SET NOT NULL;` — verified to apply
  cleanly to a populated database and to keep `migrate diff` clean. Then delete deviation 1 from
  `F10-backend.md`.

### 6. Non-blocking observations (no defect, no owner)

- **OBS-1 (AC-06.3, informational).** `services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json`
  (case `v2_complete_kid`) contains the same 4-entry `levels` ladder and the same
  `scale`/`aggregation` literals as `CAMBRIDGE_YL_SEED`. Read literally, AC-06.3 forbids that. I am
  **not** filing it: the file is **F8's** (`F8-ba.md` AC-15.2/15.3, `F8-backend.md`), its
  `dimensions` are deliberately different (`vocabulary`/`grammar`/`interaction`), so it is not a
  copy of the seed — and it is a **cross-language** TS↔Python drift fixture read by
  `grading-worker/tests/test_rubric_schema.py`, so it physically cannot import a TypeScript seed.
  AC-06.3 is unsatisfiable for that one file. F10's own obligation — no pasted seed in any spec —
  is met: `rubric-scoring.spec.ts`, `worker-api.controller.spec.ts`, `analytics.spec.ts` and
  `submissions.service.spec.ts` all import/derive from the seeds.
- **OBS-2 (for BA).** `scale.step: 0.5` is *accepted* by the step rule but then rejected with
  `level_gap`/`level_coverage_*` issues, because a fractional step changes `granularity()`. The
  400 is correct but the message points at `levels` rather than at the step the author changed. If
  F12's drawer exposes `step`, consider an explicit "step must divide the scale" message. Not an
  F10 defect — no AC covers it.
- **OBS-3 (for F12).** `GET /criteria/:id` and `GET /criteria` return the **normalized** rubric
  (pre-existing F8 read-time behaviour) while `GET /internal/criteria/:courseId` returns the
  **raw** stored row. Both are per spec; they differ in top-level key order and in the presence of
  `comment_bank`/`student_reply`. Do not treat one as a byte-identity check on the other — that is
  what made 4 of my probe-1 cases look like failures.

---

# Fix round 1 re-gate (2026-08-23) — **PASS**

Everything below was re-run from scratch by me on a **freshly created** disposable
Postgres + Redis + RabbitMQ; nothing was carried over from round 0.

## R1.1 Suites

| Suite | Result | Coordinator's number | Verdict |
| :-- | :-- | :-- | :-- |
| core-api | `npm ci` → `prisma generate` OK → `tsc -p tsconfig.build.json --noEmit` **TSC_BUILD_OK** → `tsc -p tsconfig.json --noEmit` **TSC_ALL_OK** → jest **39 suites / 723 tests passed, 0 failed** (194.7 s) | 39 / 723 (+17) | **confirmed exactly** |
| dashboard | `npm ci && npm run build` ⇒ exit 0, **88 modules**, 28.5 s | 88 modules | confirmed |
| grading-worker | **261 passed** (42.0 s) | untouched | confirmed |
| zalo-gateway | **5 suites / 26 tests passed** | clean | confirmed; `git status services/zalo-gateway` empty |
| deps | `git diff HEAD -- package.json` **empty in both services** | empty | confirmed (AC-22.2) |

Scope of the fix round is tight — exactly **6 files** changed:
`criteria/rubric-validation.ts` (+`.spec`), `criteria/rubric-template.service.ts` (+`.spec`),
`criteria/criteria-routes.e2e.spec.ts`, and the migration SQL. No new file, no new dependency,
no change outside `core-api`.

## R1.2 DEF-1 — **CLOSED**, and closed as a class

My round-0 repro, verbatim, over real HTTP against real Postgres (probe 3 and probe 4):

| Input | Round 0 | Round 1 |
| :-- | :-- | :-- |
| `POST` `scale.step: 0` | **201**, stored `step=1` | **400** `scale.step must be greater than 0` |
| `POST` `scale.step: -1` | **201**, stored `step=1` | **400** `scale.step must be greater than 0` |
| `PUT` `scale.step: 0` | **200**, stored `step=1` | **400**, and no column written (AC-16.7 re-verified) |
| `POST` `scale.step: null` / `"x"` | 201, silently `1` | **400** `scale.step must be a finite number` |
| `POST` `scale.min: "a"` / `scale.max: null` | 201, silently defaulted | **400** `scale.<field> must be a finite number` |
| `POST` `scale: null` / `"x"` / `42` / `[]` | 201 (silently defaulted) | **400** `scale must be an object with numeric min, max and step` |

Backend was right that the miss was wider than I filed: the same normalize-then-validate ordering
was silently swallowing a non-finite `min`/`max` too. Moving normalization *inside*
`assertAuthorableRubric` (signature `(input: unknown) => RubricV2`) removes the ordering hazard
structurally rather than by comment — `prepareRubric` is now a single delegating line, so there is
no longer a call site that *can* get the order wrong. This is the right shape of fix.

**Reverse-patch proof independently reproduced.** I bind-mounted a reverted copy of
`rubric-validation.ts` (normalize first, then `assertScale(rubric.scale)` — the round-0 semantics)
over the container path only, leaving the repo file untouched, and ran `jest src/criteria src/lib`:
**14 failed / 442 passed across 3 suites** — exactly backend's number, and the failures span the
unit suite (`create` **and** `update`), the validator suite, and the real-HTTP e2e suite. The new
tests genuinely guard the fix; they are not tautological. (Repo file verified unmodified afterwards:
0 occurrences of the patch marker, `authoredScale` still at line 122.)

## R1.3 DEF-1 regression sweep — the widened rejection breaks nothing (probe 4, 56/56)

The thing I was asked to press hardest on. **Every previously-legal authoring input is still
accepted, with the same fallback semantics:**

| Input | Result |
| :-- | :-- |
| `scale` absent entirely | **201**, `{min:0,max:3,step:1}` (`DEFAULT_SCALE`) |
| `scale` absent + v1 `band_scale:[0,9]` (**F8 v1→v2 path**) | **201**, `{min:0,max:9,step:1}` |
| `scale:{max:5}` only | **201**, `{0,5,1}` — min/step defaulted |
| `scale:{min:0,max:5}` (step missing) | **201**, `step:1` |
| `scale:{step:1}` only | **201**, `{0,3,1}` |
| `scale:{}` | **201**, `{0,3,1}` |
| `scale:{min:-3,max:3,step:1}` (negative band) | **201**, preserved |
| `scale:{min:0,max:100,step:1}` | **201**, preserved |
| `scale:{min:0,max:5,step:0.5}` | **201**, **stored as `0.5`** — round 0 silently rewrote it to `1` |

So "a missing field still falls back to a default" and "an absent `scale` still falls back" both
hold; only a **declared-but-non-numeric** value is now rejected, which is the correct line.

- **AC-06.7 re-verified:** both shipped seeds, posted as their own request bodies, ⇒ **201**.
  Seeds are still `normalizeRubric` fixed points.
- **AC-19.15 re-verified:** the `.docx` path is untouched — `POST /criteria` with the repo's own
  `templates/rubric-template.docx` ⇒ **201**; a legacy v1 `criteria` row (raw `band_scale`, inserted
  straight into Postgres) still reads 200. The gate is write-only, on template routes only.
  Informational: that same `.docx` parses to `scale {0,3,1}` and **would also pass** the new gate.
- **F8 fixture sweep** (the strongest "did we break the v1→v2 path" evidence): I ran
  `assertAuthorableRubric` over all **15** cases in F8's `rubric-normalize.fixtures.json`.
  **0 are rejected for a scale reason.** The 4 non-accepted ones fail on pre-existing, correct rules
  (`v1_empty_object` → no dimension; `v2_bands_already_arrays` → empty `output_fields`;
  `v2_mixed_legacy_keys` → dimension key `Vocabulary`; `v2_non_string_band_values` → output field
  `7`) — all deliberately-degenerate *normalize* fixtures, not authoring inputs. No regression.
- **AC-19.13 still holds:** 10 garbage payloads over HTTP ⇒ never ≥ 500; and called directly the
  validator throws **only** `BadRequestException`, including for `null`, `[]`, `"str"`, `42` — the
  new `unknown` signature widened the input domain and it is still safe. **AC-19.14:** the argument
  is not mutated.

## R1.4 DEF-2 — **CLOSED**

Migration re-validated on a *fresh* populated pre-F10 database (same F9 procedure):

- Both columns are now `nullable=NO default=ARRAY[]::text[]` (migration lines 43 and 62).
- **AC-01.4 / AC-03.5:** all **6** fingerprints byte-identical before/after
  (`criteria 3e7af070…`, `gradings e621cb71…`, `students 2dcff50c…`, `submissions 5bd7a652…`,
  `dashboard_users(old) 00b5c633…`, `courses 122a27d3…`).
- **AC-03.4:** `teacher1`/`teacher2` ⇒ `{criteria_author}`, `admin@ilm.local` ⇒ `{}`.
- **AC-03.3:** re-running the `UPDATE` ⇒ `UPDATE 0`.
- **AC-01.3:** `prisma migrate diff` ⇒ **"No difference detected"** *with* the `NOT NULL` present —
  which is exactly what my round-0 experiment predicted and what backend's withdrawn deviation
  denied. `ADD COLUMN … NOT NULL DEFAULT` also applied cleanly to the already-populated table.
- **AC-01.2 / AC-02.2 unaffected:** still 0 foreign keys on or into `rubric_templates`; indexes are
  still exactly `criteria_pkey`, `rubric_templates_pkey`, `rubric_templates_key_key`;
  `criteria.template_key` all NULL.
- **My round-0 NULL-forcing probe re-run:** Postgres now **refuses** both writes —
  `ERROR: null value in column "privileges" … violates not-null constraint` and
  `ERROR: null value in column "locked" … violates not-null constraint` (via psql), and through
  Prisma `P2010 / SQLSTATE 23502`. Rows survive; the app is unaffected. The `toView` 500 path I
  measured in round 0 is now unreachable.

## R1.5 Full 165-case probe re-run

**157 passed.** The 4 remaining "failures" are the same round-0 comparison artifacts (strict
`JSON.stringify` vs Postgres jsonb key reordering, and `GET /criteria/:id` normalizing on read) —
probe 3 re-tested all four with key-order-insensitive deep equality and a proper before/after
comparison: **14/14 PASS**. 2 further "failures" were my own `rejects()` helper not matching
Prisma's `P2010` wording; corrected in probe 4 ⇒ PASS. Net: **no real failure**.

Re-confirmed unchanged by the fix round: **AC-02.4** (delete a template ⇒ derived `criteria` still
reads, lists, returns verbatim internally, and grades **18 / A1 / "Mover (A1) ~ Junior Panda"`**,
student level mapping still runs, nothing 409/5xx), **AC-07.3** (mutate + reboot ⇒ byte-identical,
`updatedAt` unchanged), the whole privilege matrix, all 8 routes, all three 409s, route ordering,
and `AC-19.4` (`scale.max <= 0`).

## R1.6 Ruling on OBS-2 — **accepted as a non-defect, closed**

I verified backend's reasoning empirically rather than on argument. With `scale.step: 0.5` and the
Cambridge ladder, the 400 body is:

```
{"code":"level_gap","index":1,"message":"Hở khoảng giữa 10 và 11: …"}
{"code":"level_gap","index":2,"message":"Hở khoảng giữa 15 và 16: …"}
{"code":"level_gap","index":3,"message":"Hở khoảng giữa 20 và 21: …"}
```

Those gaps are **real**: with a 0.5 step, totals of 10.5 / 15.5 / 20.5 are reachable and map to no
level. So `level_gap` is the correct code, the correct index, and an actionable message — it is not
a mislabel. And backend is right that the alternatives are all AC breaches: AC-19.1 pins the body
shape and F9's Vietnamese strings verbatim (I verified both in round 0 and again now), so adding a
field/code or rewording would break a verified AC, and rejecting a step that doesn't divide the
scale would newly reject currently-legal input — a BA change, not a code change. **Not re-filed.**
Carried forward as a note for BA/F12 only (see below).

## R1.7 Residual observations (informational, no owner, not gating)

- **OBS-4 (cosmetic).** `criteria/dto/create-rubric-template.dto.ts:26` still says the rubric is
  "`normalizeRubric` rồi mới `assertAuthorableRubric` ở tầng service" — that ordering is precisely
  what DEF-1 removed. The comment is now stale (the code is correct). One-line comment fix whenever
  the file is next touched; no behaviour depends on it.
- **OBS-1 / OBS-3** from round 0 stand unchanged and remain non-defects.

## Final verdict

**PASS.** Both defects are genuinely fixed — DEF-1 verified by my own verbatim repro at both write
paths plus an independently reproduced 14-test reverse-patch proof, DEF-2 verified by Postgres now
refusing the exact writes I forced in round 0. The widened rejection was checked against 9
previously-legal shapes, both shipped seeds, the `.docx` path, a legacy v1 row and all 15 F8
normalize fixtures without a single regression. All four suites are green
(**723 / 261 / 26** tests + a clean dashboard build), both `package.json` diffs are empty, and every
round-0 finding that mattered — AC-02.4, AC-03.4, AC-07.3, the privilege matrix, the endpoint table
— re-passes. No defect remains open.

## Blockers / open questions

None. (Round 0 read:) Neither defect blocks anything downstream: DEF-1 is a one-place validator ordering fix, DEF-2 is
two lines in a migration that has **not been committed yet** (it is still untracked), so it can be
amended in place with no follow-up migration. Both should be fixed before F10 is merged, and
`F10-backend.md`'s deviation 1 should be withdrawn.

## Notes for the next role (fix round 1 — current)

- **orchestrator:** F10 is **cleared to merge**. Nothing is outstanding. The only carried-forward
  items are informational: OBS-4 (one stale comment in `create-rubric-template.dto.ts:26`) and the
  BA notes below.
- **BA:** two things worth a line in the spec so they are decisions rather than accidents.
  (a) **AC-19.6 is now reachable**, and the implementation deliberately validates the *author's raw*
  `scale` before normalizing — FR-19's sentence "It runs on the **normalized** rubric" is what made
  the AC vacuous in round 0 and should be reworded to "it owns normalization; numeric `scale` rules
  apply to the authored values". (b) **OBS-2 is closed as a non-defect**: a `step` that does not
  divide the scale produces correct `level_gap` issues, and tightening it further would newly reject
  legal input. If the centre ever wants "step must divide the scale", that is a new AC.
- **F12:** `assertAuthorableRubric` is now `(input: unknown) => RubricV2` and **normalizes
  internally** — call it as `const rubric = assertAuthorableRubric(body.rubric)` and store what it
  returns. Do **not** normalize first; that is exactly the defect that was just fixed.

## Notes for the next role (round 0 — historical)

- **backend:** fix DEF-1 (`prepareRubric` must see the raw `scale.step`; add a spec that goes
  through `RubricTemplateService.create` rather than calling `assertAuthorableRubric` directly —
  the current unit test covers a branch that production can never reach) and DEF-2 (two
  `ALTER … SET NOT NULL` lines appended to the existing migration file; I verified they apply to a
  populated DB and keep `prisma migrate diff` at "No difference detected"). Nothing else in F10
  needs to change — the other ~163 checks pass.
- **orchestrator:** everything else in F10 is verified working against a real Postgres, including
  the two tests the BA called decisive (AC-02.4 and AC-03.4). Re-run this gate after the two fixes;
  the probe methodology is reproducible from §3 above.
- **F12:** `assertAuthorableRubric` is your authoring gate too — DEF-1 affects `POST /criteria/json`
  the moment you reuse it, so wait for the fix rather than working around it.
