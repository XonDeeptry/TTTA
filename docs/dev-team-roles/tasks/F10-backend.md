# F10 · Backend — Seeded rubric templates + template CRUD + 2 privileges

- **Owner role:** backend
- **Feature:** F10 — `RubricTemplate` table + bootstrap seeder (2 default templates) + 7-operation template CRUD + `rubric_template`/`criteria_author` privileges + `PrivilegeGuard` + staff-backfill migration
- **Status:** DONE   <!-- fix round 1 complete: QA DEF-1 + DEF-2 both resolved -->
- **Last updated:** 2026-08-23
- **Depends on:** `F10-ba.md`, `F8-backend.md`, `F9-backend.md`, `F9-qa.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 4

## Inputs (what this role received)

- `F10-ba.md` — 181 numbered ACs across FR-01…FR-22, NFRs, UC-1…UC-6, BR-01…BR-14, data dictionary,
  8-row endpoint table, §9 deviations D-1…D-5.
- `F8-backend.md` — `normalizeRubric` contract (never throws, 12 top-level keys, idempotent);
  AC-15.9 "seeds ARE the fixtures, import never paste".
- `F9-backend.md` — `computeTotal`/`maxTotal`/`findLevel`/`validateLevels` in `lib/rubric-scoring.ts`;
  `validateLevels` shipped wired to nothing — F10 wires it to a 400.
- `F9-qa.md` OBS-2 — `scale.max <= 0` must be rejected at the authoring boundary.

## Checklist (the concrete work items for this task)

- [x] Read TASK-PROTOCOL + template, create this file, Status IN_PROGRESS
- [x] Read `F10-ba.md`, `F8-backend.md`, `F9-backend.md`, `F9-qa.md`, design Phần 4
- [x] Read core-api code: `auth/`, `users/`, `criteria/`, `lib/rubric-scoring.ts`, `schema.prisma`
- [x] FR-01/02/03 — `schema.prisma`: `RubricTemplate`, `Criteria.templateKey`, `DashboardUser.privileges`
- [x] Hand-authored migration SQL + Vietnamese header + idempotent staff backfill
- [x] FR-04 — `cambridge-yl.seed.ts`
- [x] FR-05 — `ielts-speaking.seed.ts`
- [x] FR-06 — `templates/index.ts` barrel + `findSeed`; deep-freeze
- [x] FR-19 — `criteria/rubric-validation.ts` (`assertAuthorableRubric`)
- [x] FR-08 — `auth/privileges.ts`, `privilege.decorator.ts`, `privilege.guard.ts`
- [x] FR-07 — `bootstrap-rubric-templates.service.ts`
- [x] FR-12…FR-18 + delete — `rubric-template.service.ts` + 4 DTOs + `lockable-fields.ts`
- [x] FR-09 + FR-20 — gate `POST /criteria`, route ordering in `criteria.controller.ts`
- [x] FR-10 — Users API carries `privileges`
- [x] FR-11 — `GET /auth/me` returns `privileges` (admin ⇒ full set)
- [x] FR-22 — module wiring (`criteria.module.ts`)
- [x] FR-06 AC-06.3 — `rubric-scoring.spec.ts` fixtures replaced by seed imports, assertions untouched
- [x] Unit/e2e tests for the new surface (7 new spec files incl. a real-HTTP route-order suite)
- [x] FR-21 — dashboard `Users.tsx` two checkboxes + `Privileges` column + i18n vi/en + `AuthContext`
- [x] core-api: tsc --noEmit clean (src + tests); jest **39 suites / 706 tests** green (baseline 32/502)
- [x] Dashboard build in Docker (`tsc -b && vite build` — 88 modules, 20.0 s, clean)
- [x] Migration validated on disposable postgres:16-alpine with pre-F10 rows (backfill + idempotency
      + `migrate diff` = "No difference detected" + live seeder/reset/delete probe)
- [x] Fill Outputs, set Status DONE

### Fix round 1 (QA FAIL — DEF-1, DEF-2, both Minor)

- [x] Read `F10-qa.md` in full (both defects + the 3 observations)
- [x] DEF-1: reproduced `step: 0` ⇒ accepted-and-rewritten on the real write path
- [x] DEF-1: `assertAuthorableRubric` now OWNS the normalize step and reads the raw scale first
- [x] DEF-1: audited `scale.max` vs `scale.step` — fixed the whole class, all 3 fields read raw
- [x] DEF-1: `rubric-validation.spec.ts` helper no longer pre-normalizes (the false-confidence bug)
- [x] DEF-1: write-path cases added at service level **and** over real HTTP
- [x] DEF-1: reverse-patch proof — pre-fix code fails **14** of the new/updated tests
- [x] DEF-2: `NOT NULL` on `dashboard_users.privileges` and `rubric_templates.locked`
- [x] DEF-2: re-validated on a populated disposable Postgres (6 fingerprints identical, `UPDATE 0`,
      `migrate diff` = "No difference detected", raw NULL now rejected by the DB)
- [x] DEF-2: withdrew deviation 1 from Outputs (QA disproved it)
- [x] OBS-2 assessed — not cheap, every surface is contract-pinned; recorded rather than skipped
- [x] Re-run both `tsc --noEmit`, full jest, dashboard build; report real numbers
- [x] Update Outputs, set Status DONE

## Outputs (what this role produced)

### Fix round 1 — QA DEF-1 + DEF-2 resolved

| Suite | Result | Δ vs round 0 |
| :-- | :-- | :-- |
| core-api | **39 suites / 723 tests passed**, 0 failed; `prisma generate` OK; **both** `tsc --noEmit` clean; 162.8 s | 706 → 723 (+17) |
| dashboard | `tsc -b && vite build` OK — 88 modules, 24.5 s | unchanged (no dashboard file touched in this round) |
| migration | populated disposable `postgres:16-alpine`: **6/6 fingerprints identical**, backfill correct, re-run `UPDATE 0`, `migrate diff` "No difference detected", raw `NULL` now **rejected by the DB** | DEF-2 closed |

#### DEF-1 — `scale.step <= 0` accepted (AC-19.6). Fixed, and the *class* of bug removed.

QA's diagnosis was exactly right, including the part I had not spotted: **the code was inconsistent
with itself.** `normalizeRubric` coerces `scale.step` to `1` and coerces a non-numeric `min`/`max` to
the defaults, but leaves a numeric `max` alone — so AC-19.4 fired while AC-19.6 was dead code. Patching
only `step` would have left `{min:"a", max:5}` still silently becoming `{min:0,max:5}`.

**Fix (`criteria/rubric-validation.ts`).** `assertAuthorableRubric` now **owns** the normalize step:

```ts
export function assertAuthorableRubric(input: unknown): RubricV2   // was (rubric: RubricV2): void
```

It calls `readAuthoredScale(input)` on the **raw** input first — rejecting any declared `min`/`max`/`step`
that is not a finite number (`scale.<field> must be a finite number`), and a non-object `scale`
(`scale must be an object with numeric min, max and step`) — then normalizes, then runs the three
numeric rules on the **author's** scale, then everything else on the normalized rubric, and returns it.
An absent `scale` is still valid (v1 `band_scale` / defaults), and a missing single field still defaults.

Making the function return the normalized rubric is the load-bearing part: `RubricTemplateService.prepareRubric`
is now one line (`return assertAuthorableRubric(raw)`), so **the two steps can no longer be put in the
wrong order by a caller** — which is what the previous "the caller must normalize first" comment failed
to prevent. F12 gets the safe shape for free.

**The test fix QA asked for.** `rubric-validation.spec.ts`'s `rubric()` helper called `normalizeRubric`
on its fixture — feeding the validator a shape production never produces. That is why the branch was
covered but dead. The helper now returns a **raw** object, and the DEF-1 rules are additionally
exercised through `RubricTemplateService.create`/`.update` and over **real HTTP** (QA's verbatim repro).

**Proof the new tests bite:** reverse-patched `assertAuthorableRubric` back to normalize-then-validate ⇒
**14 tests fail across all 3 suites**; restored ⇒ all green. On a real Postgres: `step` `0`/`-1` ⇒ 400
`scale.step must be greater than 0`, `null`/`"x"` ⇒ 400 `scale.step must be a finite number`,
**`rubric_templates` row count unchanged at 2**; and a legitimate `step: 0.5` is now stored as `0.5`
instead of being silently rewritten to `1`.

#### DEF-2 — `NOT NULL` on `privileges` / `locked`. Fixed; my justification was wrong.

QA tested my claim and disproved it: Prisma does not diff nullability on scalar-list columns, so
`NOT NULL` and "No difference detected" coexist. **Deviation 1 of round 0 is withdrawn** — it was
reasoning from an assumption I never tested, and the two-line cost made testing it cheap. Both columns
now carry `NOT NULL DEFAULT ARRAY[]::TEXT[]` in the same (still-uncommitted) migration, with a comment
recording why. Re-verified on a populated DB: `is_nullable = NO` on both, `ADD COLUMN` still applies
cleanly to existing rows, `UPDATE … SET privileges = NULL` and an `INSERT … locked = NULL` are now
**rejected by Postgres**, all six fingerprints unchanged, backfill and idempotency unchanged,
`migrate diff` still clean. This closes the one real hole QA measured: `toView`'s `[...row.locked]`
would have thrown 500 on a raw-SQL NULL.

#### QA's three observations

- **OBS-1 (F8's `rubric-normalize.fixtures.json`)** — agreed, no action. It is F8's cross-language
  TS↔Python drift fixture read by `grading-worker/tests/test_rubric_schema.py`, so it *cannot* import a
  TypeScript seed, and its `dimensions` differ from the seed. AC-06.3 is unsatisfiable for that one file.
- **OBS-2 (confusing 400 for a fractional step)** — assessed, **deliberately not fixed**, and not because
  it was skipped: every surface it could improve is contract-pinned. AC-19.1 pins the body to
  `{message:'invalid rubric', issues}` and pins F9's Vietnamese `issue.message` strings *verbatim*, so I
  cannot add a field, a new `LevelIssueCode`, or reword the text without breaking an AC QA verified.
  The remaining option — rejecting a `step` that does not divide `(max - min)` — is a **new rejection**
  of input that is legal today, i.e. a BA change, exactly as QA classified it. Note the current `level_gap`
  is *correct*: with `step: 0.5` a total of 10.5 is reachable and maps to no level. Right place to fix is
  F12's drawer (client-side hint next to the `step` field) or a new AC.
- **OBS-3 (normalized vs raw read asymmetry)** — agreed and already carried in the F12 notes below.

#### Files changed in fix round 1

- `services/core-api/src/criteria/rubric-validation.ts` — `readAuthoredScale()`, `assertScale()`,
  `isPlainObject()`; `assertAuthorableRubric` signature `(input: unknown) => RubricV2`.
- `services/core-api/src/criteria/rubric-template.service.ts` — `prepareRubric` no longer normalizes.
- `services/core-api/prisma/migrations/20260822090000_add_rubric_templates_and_privileges/migration.sql`
  — `NOT NULL` on `rubric_templates.locked` (line 38 area) and `dashboard_users.privileges`.
- `services/core-api/src/criteria/rubric-validation.spec.ts` — helper de-normalized; +7 cases.
- `services/core-api/src/criteria/rubric-template.service.spec.ts` — +6 write-path cases.
- `services/core-api/src/criteria/criteria-routes.e2e.spec.ts` — +8 HTTP cases (QA's repro).

**Nothing else changed.** No dashboard file, no `package.json`, no `grading-worker`/`zalo-gateway` file,
no `schema.prisma` change (Prisma's model already said `String[] @default([])`; only the hand-authored
SQL was short of it).

---

### Round 0 results (superseded numbers kept for the audit trail)

### Test / build results (all actually executed)

| Suite | Command | Result |
| :-- | :-- | :-- |
| core-api | `MSYS_NO_PATHCONV=1 docker run --rm -v ".../core-api:/app" -w /app node:24-alpine sh -c "apk add --no-cache openssl && npx prisma generate && npx tsc -p tsconfig.build.json --noEmit && npx tsc -p tsconfig.json --noEmit && npm test -- --maxWorkers=2"` | **39 suites / 706 tests passed**, 0 failed. `prisma generate` OK, both `tsc --noEmit` clean (src *and* tests). 369 s |
| dashboard | `... node:24-alpine sh -c "npm ci && npm run build"` (`tsc -b && vite build`) | **build OK** — 88 modules, 20.0 s, no TS error. No jest suite exists (build-only, matches M4/F9). |
| migration | disposable `postgres:16-alpine` on throwaway network `f10net` | applied to a **non-empty** pre-F10 DB; backfill correct; `UPDATE` idempotent; `migrate diff` = **"No difference detected"**; `migrate status` = "Database schema is up to date!" |

**Baseline preserved and grown: F9 left 32 suites / 502 tests. F10 = 39 / 706 (+7 suites, +204 tests).**
Every pre-existing test passes. **Five pre-existing assertions changed, each justified below** —
QA should read this table before filing:

| File | What changed | Why it is not a weakening |
| :-- | :-- | :-- |
| `auth/auth.controller.spec.ts` | `me()` test: `toEqual(user)` → `resolves.toEqual({...user, privileges: []})`, and the mock gained `effectivePrivileges` | FR-11 requires `/auth/me` to gain a field; `toEqual` is exact-set so it **had** to move. All four original fields still pinned by value. **+2 new cases** added. |
| `users/users.service.spec.ts` | `VIEW_KEYS` 5 → 6 names; `view()` fixture gains `privileges: []`; two exhaustive `Object.keys(data)` lists gain `'privileges'` | Fixture/const **definitions**, not assertions. Every `expect(...).toEqual(VIEW_KEYS)` line is byte-identical and now demands *more*. **+7 new cases** appended. |
| `users/dto/users.dto.spec.ts` | expected key list after `whitelist` gains `'privileges'` | `privileges` is a legitimate new DTO field (AC-10.6); class-transformer materialises every declared key. The three `not.toHaveProperty('passwordHash'/'mustChangePassword'/'id')` lines — the security intent of the case — are untouched. |
| `lib/rubric-scoring.spec.ts` | `KID_RUBRIC`/`IELTS_RUBRIC` hand-built literals **deleted**, replaced by `CAMBRIDGE_YL_SEED.rubric` / `IELTS_SPEAKING_SEED.rubric` imports | **This is AC-06.3, mandated.** All 71 assertions unchanged. They now double as the seeds' drift guard. |
| `worker-api/worker-api.controller.spec.ts`, `reports/analytics.spec.ts`, `submissions/submissions.service.spec.ts` | the three F9 "raw rubric" fixtures now **derive** `scale`/`aggregation`/dimension keys from the seed instead of pasting them | Also AC-06.3 ("no spec file contains a pasted duplicate of a seed's `dimensions`/`levels`/`scale`/`aggregation` literal"). Values identical, so **zero** assertions moved; the fixtures keep their deliberately-raw shape (`{key}` only, no `label`/`bands`) that proves `normalizeRubric` runs. |

Pre-existing, **not caused by F10**: jest prints "A worker process has failed to exit gracefully".
Proven by running only `auth/auth.service.spec.ts` + `auth/bootstrap-admin.service.spec.ts` — two files
F10 never touched (`git status --porcelain` empty for both) — which reproduce it alone. It is bcrypt's
native thread pool. My new HTTP e2e suite run in isolation does **not** produce it.

### Migration validated on a real database (FR-01/02/03)

Procedure (F9's, extended): `postgres:16-alpine` → `migrate deploy` with the F10 migration **stashed**
(= pre-F10 head) → seed `courses`/`criteria`/`students`/`submissions`/`gradings` + 1 `admin` + 2 `staff`
→ MD5-fingerprint the pre-F10 columns → restore the migration → `migrate deploy`. Verified:

- **AC-01.4 / AC-03.5 — all five fingerprints byte-identical before/after**:
  `criteria 23f30cc2…`, `gradings ef82c7f8…`, `students 22073817…`, `submissions f509d051…`,
  `dashboard_users(old cols) 2e105d79…`. Not one pre-existing value moved.
- **AC-03.4 — the anti-lock-out backfill works**: `teacher1`/`teacher2` (staff) ⇒ `{criteria_author}`;
  `admin@ilm.local` ⇒ `{}`.
- **AC-03.3 — idempotent**: re-running the `UPDATE` reports `UPDATE 0`, all fingerprints unchanged.
- **AC-01.2** — `rubric_templates` has exactly two indexes (`_pkey`, `_key_key` UNIQUE on `key`) and
  exactly one constraint (the PK). **No foreign key on it or pointing at it.**
- **AC-02.2 / AC-02.3** — `criteria` still has only `criteria_pkey` + `criteria_course_id_fkey`; no index
  and no FK on `template_key`; the pre-existing row's `template_key IS NULL`.
- **AC-01.3** — `prisma migrate diff --from-url <migrated db> --to-schema-datamodel prisma/schema.prisma`
  ⇒ **"No difference detected"**.

**Live end-to-end probe** (throwaway `ts-node` script inside the service dir against that live DB,
deleted after the run — `git status` clean of it):

```
[BootstrapRubricTemplatesService] Seeded 2 rubric templates
1) after first boot: [{id:1,key:cambridge_yl_a0_a2,isSystem:true,isActive:true},
                     {id:2,key:ielts_speaking,isSystem:true,isActive:true}]
2) mutate (name+isActive) + reboot: row identical? TRUE   ← AC-07.3, the anti-clobber proof
3) after reset: name back to seed, isActive STILL false (D-4), id/createdAt unchanged
   stored rubric deep-equals seed: TRUE   (JSON.stringify differs only by jsonb key reordering —
   F8 OBS-03; normalizeRubric(stored) restores canonical order, which is why GET is stable)
4) DELETE system template  ⇒ 409 "system templates cannot be deleted"
5) duplicate system ⇒ ordinary+active; criteria(id=2).templateKey = 'writing_internal'
6) DELETE writing_internal ⇒ ok. THEN, with the templateKey now ORPHANED:
     GET /criteria/2                → 200, templateKey still 'writing_internal'
     GET /criteria?courseId=1       → 1 row
     GET /internal/criteria/1       → 200 (verbatim)
     POST /internal/gradings        → totalScore 18, levelCode A1, "Mover (A1) ~ Junior Panda"
     students.current_level_code    → A1                       ← AC-02.4 on a REAL database
7) POST /criteria/templates with an existing key ⇒ 409 "template key already exists"
```

### New files — core-api

- **`prisma/migrations/20260822090000_add_rubric_templates_and_privileges/migration.sql`** —
  `CREATE TABLE rubric_templates` (+1 unique index on `key`, no FK), `ALTER TABLE criteria ADD template_key TEXT`,
  `ALTER TABLE dashboard_users ADD privileges TEXT[] DEFAULT ARRAY[]::TEXT[]`, then the guarded
  idempotent backfill. Vietnamese header states the lock-out rationale, the idempotency guarantee and
  the "restore from dump" rollback story. No down-migration (repo convention).
- **`src/auth/privileges.ts`** — `DASHBOARD_PRIVILEGES = ['rubric_template','criteria_author'] as const`,
  `type DashboardPrivilege`, `isDashboardPrivilege()`, `effectivePrivileges(role, stored)`
  (admin ⇒ full set, derived, DB never written). Single declaration repo-wide.
- **`src/auth/privilege.decorator.ts`** — `PRIVILEGES_KEY`, `@RequiresPrivilege(...p)` (multiple = OR).
- **`src/auth/privilege.guard.ts`** + **`.spec.ts`** (21 cases) — reads `role`/`privileges` from
  Postgres by `session.user.id`, **one** query, no metadata ⇒ no DB touch.
- **`src/criteria/templates/{seed.types,cambridge-yl.seed,ielts-speaking.seed,index}.ts`** — the two
  seeds (deep-frozen) + the barrel with `RUBRIC_TEMPLATE_SEEDS` and `findSeed(key)`.
- **`src/criteria/templates/seeds.spec.ts`** (31 cases) — every FR-04/05/06 AC.
- **`src/criteria/rubric-validation.ts`** + **`.spec.ts`** (23 cases) — `assertAuthorableRubric()`,
  `MACHINE_KEY_PATTERN`. **Reuse this verbatim in F12's `POST /criteria/json`.**
- **`src/criteria/lockable-fields.ts`** — `LOCKABLE_FIELD_PATHS` (§5.4 closed set) + `dedupeLocked()`.
- **`src/criteria/bootstrap-rubric-templates.service.ts`** + **`.spec.ts`** (10 cases).
- **`src/criteria/rubric-template.service.ts`** + **`.spec.ts`** (38 cases) — the 8 operations.
- **`src/criteria/dto/{create,duplicate,update}-rubric-template.dto.ts`, `set-template-active.dto.ts`**.
- **`src/criteria/criteria-routes.e2e.spec.ts`** (54 cases) — **boots a real Nest HTTP server**
  (`NestFactory` + `@nestjs/platform-express`, global `fetch`; no new dependency) and calls every route
  over the wire. This is the only way FR-20's route-order bug is detectable.
- **`src/criteria/template-deletion-safety.spec.ts`** (8 cases) — AC-02.4, the feature's most important test.

### Changed files — core-api

- **`prisma/schema.prisma`** — `model RubricTemplate`; `Criteria.templateKey String? @map("template_key")`
  (no `@relation`, Vietnamese comment naming the `PilotTextGrading.criteriaId` precedent);
  `DashboardUser.privileges String[] @default([])`.
- **`src/criteria/criteria.controller.ts`** — class guards now `(SessionAuthGuard, PrivilegeGuard)`;
  8 template routes inserted **between** `@Get()` and `@Get(':id')` with a Vietnamese comment stating
  the ordering constraint; `@Post()` (.docx) gains `@RequiresPrivilege('criteria_author')`.
- **`src/criteria/criteria.module.ts`** — registers `RubricTemplateService` + the seeder, exports the service.
- **`src/auth/auth.controller.ts`** — `me()` is now `async` and returns `{...session.user, privileges}`.
- **`src/auth/auth.service.ts`** — new `effectivePrivileges(userId)`; row gone ⇒ `[]`, never throws.
- **`src/users/users.service.ts`** — `USER_SELECT` + `UserView` gain `privileges`; `create` writes
  `dedupePrivileges(dto.privileges ?? [])`; `update` writes `undefined` (skip) vs the deduped array.
- **`src/users/dto/{create,update}-user.dto.ts`** — optional `privileges` with `@IsArray() @IsIn(…, {each:true})`.
- Spec files: the five listed in the justification table.

### Changed files — dashboard (FR-21)

- **`src/pages/Users.tsx`** — `UserView.privileges`; a `Privileges` column (admin row shows
  "admins implicitly hold every privilege"); two checkboxes in the existing inline edit form, disabled +
  pre-ticked + `title` when `editRole === 'admin'`; `PATCH /users/:id` now carries `privileges`.
  No new component, no new endpoint.
- **`src/auth/AuthContext.tsx`** — `CurrentUser.privileges?: string[]`; `login`/`changePassword` follow
  their (deliberately frozen) responses with one tolerant `GET /auth/me` so privileges are live
  immediately without a reload.
- **`src/i18n/index.ts`** — 5 keys in **both** `vi` and `en`: `users.privileges`,
  `users.privRubricTemplate` (vi "Cấu trúc chấm điểm" / en "Scoring structure"),
  `users.privCriteriaAuthor` (vi "Nội dung chấm điểm" / en "Scoring content"),
  `users.privAdminAll`, `users.privNone`.

### Not changed (deliberate)

`services/grading-worker/**` and `services/zalo-gateway/**` — **zero F10 edits** (AC-22.3). The
grading-worker files dirty in `git status` are F8's uncommitted work, exactly as F9-backend.md recorded.
Also untouched: `GET /internal/criteria/:courseId` (AC-22.4 — still returns the stored row verbatim,
proven behaviourally in `template-deletion-safety.spec.ts`), `criteria.service.ts` write path,
`docx-parser.ts` and its two 400 messages, all three `contracts` files, both `package.json`s
(AC-22.2 — **no new dependency**), `POST /auth/login` and `POST /auth/change-password` shapes,
`session.user` (AC-11.5).

### API contract

**New — 8 template operations.** All under `SessionAuthGuard`; writes additionally under
`PrivilegeGuard` + `@RequiresPrivilege('rubric_template')`. Response shape everywhere:
`{ id, key, name, rubric: RubricV2, locked: string[], isSystem, isActive, createdAt, updatedAt }`
(`rubric` normalized on read *and* on write).

| # | Method + path | Privilege | Body | Success | Errors |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | `GET /criteria/templates?includeInactive=true\|1` | — (session) | — | 200 `[]` ordered `isSystem DESC, key ASC` | 401 |
| 2 | `GET /criteria/templates/:key` | — (session) | — | 200 | 401, 404 `template not found` |
| 3 | `POST /criteria/templates` | `rubric_template` | `{key,name,rubric,locked?,isActive?}` | **201** | 400, 401, 403, **409** `template key already exists` |
| 4 | `POST /criteria/templates/:key/duplicate` | `rubric_template` | `{key,name?}` | **201** | 400, 401, 403, 404, **409** |
| 5 | `PUT /criteria/templates/:key` | `rubric_template` | `{name?,rubric?,locked?}` | 200 | 400 (incl. `template key is immutable`), 401, 403, 404 |
| 6 | `DELETE /criteria/templates/:key` | `rubric_template` | — | **204** | 401, 403, 404, **409** `system templates cannot be deleted` |
| 7 | `PATCH /criteria/templates/:key/active` | `rubric_template` | `{isActive: boolean}` (strict) | 200 | 400, 401, 403, 404 |
| 8 | `POST /criteria/templates/:key/reset` | `rubric_template` | — | 200 | 401, 403, 404, **409** `reset is only available for system templates` / `no seed definition for this template` |

**400 body for a rubric rejection.** Level problems return the F9 issues verbatim:
`{ "message": "invalid rubric", "issues": [{ "code": "level_gap", "index": 1, "message": "Hở khoảng giữa 10 và 20: …" }] }`
(`code` ∈ `level_invalid | level_overlap | level_gap | level_coverage_start | level_coverage_end`).
Every other rule returns Nest's standard `{statusCode, message, error}` with one of:
`scale.max must be greater than 0` · `scale.max must be greater than scale.min` ·
`scale.step must be greater than 0` · `rubric must declare at least one dimension` ·
`rubric must include the "pronunciation" dimension` · `duplicate dimension key: <k>` ·
`invalid dimension key: <k> (expected …)` · `dimension weight must be >= 0` ·
`output_fields must not be empty` · `invalid output field: <f> (allowed: comment, fix)` ·
`duplicate output field: <f>`.

**Changed (all additive).**

| Method | Path | Change |
| :-- | :-- | :-- |
| `POST` | `/criteria` (.docx) | **Now requires `criteria_author`** (403 `insufficient privilege` otherwise). Admin always passes. The migration backfill means no existing staff loses it. Success response and the two 400 parser messages unchanged apart from the additive `templateKey: null`. |
| `GET` | `/criteria`, `/criteria/:id` | Response rows carry `templateKey: string \| null` (always `null` until F12 writes it). Auth unchanged — **session only, no privilege** (reads stay open). |
| `GET` | `/auth/me` | Gains `privileges: string[]`, read fresh from Postgres; **admin receives the full set** even when the stored column is `[]`. `id`/`email`/`role`/`mustChangePassword` unchanged. |
| `GET/POST/PATCH` | `/users`, `/users/:id`, `/users/:id/reset-password` | `UserView` gains `privileges: string[]` (stored value, not effective). `POST`/`PATCH` accept optional `privileges` — full replace, de-duplicated, unknown string ⇒ 400. Still `@Roles('admin')`. |
| `GET` | `/internal/criteria/:courseId` | **UNCHANGED, verbatim stored row.** |
| `POST` | `/internal/gradings` | **UNCHANGED.** |

New guard behaviour: 403 message is `insufficient privilege` — deliberately different from
`RolesGuard`'s `insufficient role` so a 403 is attributable. No new env var, no compose change,
no new port, no new secret.

### Deviations / judgement calls — read before filing a defect

1. ~~**`privileges` and `locked` are `NULL`-able in Postgres**, justified by a claimed conflict with
   AC-01.3's `migrate diff`.~~ **WITHDRAWN in fix round 1 — the claim was false and I had not tested
   it.** QA ran the experiment: Prisma does not diff nullability on scalar lists, so `NOT NULL` and
   "No difference detected" coexist. Both columns are now `NOT NULL DEFAULT ARRAY[]::TEXT[]`. Lesson
   recorded: a deviation asserted from an untested assumption is a defect wearing a deviation's coat —
   the experiment cost one `ALTER` and one `migrate diff`.
2. **`key` IS declared on `UpdateRubricTemplateDto`** even though it is never written. If it were
   omitted, `whitelist: true` would silently strip it and a rename attempt would return a cheerful
   200 having changed nothing. Declaring it lets the service detect the intent and answer 400
   `template key is immutable` (AC-16.4). Identical-to-path is accepted and ignored.
3. **`GET /criteria/templates` uses `@Query('includeInactive') includeInactive?: string`, not a DTO.**
   AC-12.3 requires the parameter to *never* 400; a boolean-validating DTO would.
4. **FR-21's checkboxes are shown for an `admin` as disabled + ticked + `title`**, not hidden.
   AC-21.4 allows either; ticking-and-locking states the truth ("admin holds everything") instead of
   removing the control silently. On save, the **stored** array is sent unchanged, honouring AC-10.7's
   rationale (demote later ⇒ predictable set).
5. **`AuthContext` re-fetches `/auth/me` after login/change-password.** Strictly this is beyond FR-21,
   but AC-11.5 freezes those two response shapes, so without it `user.privileges` would be `undefined`
   for the whole session after a fresh login — exactly the bug AC-11.2 exists to prevent. The extra
   call is tolerant (failure falls back to the login response).
6. **AC-06.3 was applied more widely than the AC's example.** It names `rubric-scoring.spec.ts`, but its
   rule ("no spec file contains a pasted duplicate") also caught F9's fixtures in
   `worker-api.controller.spec.ts`, `analytics.spec.ts` and `submissions.service.spec.ts`. All three now
   derive from the seed. No assertion moved.
7. **The e2e suite mocks `PrismaService`, not Postgres.** The thing under test is the *router* and the
   *guards*; the database side is covered by `rubric-template.service.spec.ts` and by the live probe.

## Blockers / open questions

None. BA §10's three open questions were all pre-decided by the spec and implemented as written
(OQ-1 `locked` default = design §11's five paths; OQ-2 delete succeeds silently, no reference count;
OQ-3 `student_reply` carried with no F10-specific validation).

## Notes for the next role

- **QA (fix round 1):** both defects are closed and both were verified the way you verified them —
  DEF-1 through the **real write path** (service + HTTP + a live Postgres probe), DEF-2 on a **populated**
  database with the six-table fingerprint script. Two things beyond the literal asks: (a) DEF-1 is fixed
  as a *class*, not a special case — `min`/`max`/`step` are now all read raw, so the self-inconsistency
  you named is gone rather than inverted; (b) the fix is enforced by the **signature**
  (`assertAuthorableRubric(input: unknown): RubricV2` owns the normalize step), so the ordering mistake
  is no longer expressible by a caller — this matters because F12 reuses it. The reverse-patch check
  (pre-fix code ⇒ 14 failures) is the evidence that the new tests are not the old false confidence.
  **My round-0 deviation 1 is withdrawn**, marked as such above. On OBS-2 I did *not* change the message:
  AC-19.1 pins both the 400 body and F9's issue strings verbatim, so every available surface is one you
  already verified — reasoning written up above rather than silently dropped.
- **QA (round 0):** the two strongest pieces of evidence are (a) the **live probe on a real Postgres** reproduced
  above — AC-07.3 (mutate + reboot ⇒ byte-identical) and AC-02.4 (delete a template, then still grade
  18/25 ⇒ `A1` through the orphaned `templateKey`) were both proven against a real database, not a mock;
  and (b) `criteria-routes.e2e.spec.ts`, which calls **all 8 template routes plus `GET /criteria/:id`
  over real HTTP** — AC-20.2 is asserted as "200 with an array", not as "no 400". Before filing
  anything, please read the five-row assertion-change table and the seven deviations above; deviation
  **1** (`privileges` is NULL-able, forced by AC-01.3) is the one most likely to look like a defect.
  The jest "worker failed to exit gracefully" line is pre-existing bcrypt behaviour — reproducible with
  two files F10 never touched.
- **F12 front-end:** `GET /auth/me` returns `privileges` and **admins already receive the full set**
  (AC-11.2) — gate purely on `privileges.includes('rubric_template' | 'criteria_author')` and do **not**
  re-implement the admin bypass. `AuthContext.CurrentUser.privileges` is populated on load *and*
  immediately after login. `locked` on a template constrains only the **content**-authoring drawer
  (`criteria_author`); a `rubric_template` holder edits every field including `locked` itself — the
  server enforces no `locked` rule at all, so that rule lives entirely in your drawer.
- **F12 backend:** the whole authoring gate is one call — **`const rubric = assertAuthorableRubric(body.rubric)`**
  from `criteria/rubric-validation.ts`. Pass the **RAW** body; it normalizes internally and returns the
  `RubricV2` to store. Do **not** call `normalizeRubric` first — doing exactly that is what caused QA's
  DEF-1 (normalization silently repairs `scale.step`/`min`/`max`, hiding the author's mistake from the
  validator). The signature enforces this now, but the reason is worth knowing.
  `MACHINE_KEY_PATTERN` is exported from the same module.
  `Criteria.templateKey` exists and is **always `null` today** — F12 is its only writer. When you add
  routes to `criteria.controller.ts`, they MUST go inside the `templates*` block or anywhere before
  `@Get(':id')`; there is a Vietnamese comment marking the boundary and an e2e test that will fail if
  you get it wrong.
- **F11:** `rubric.student_reply` rides through untouched — F10 stores whatever `normalizeRubric` keeps
  and applies no validation to it. If you need a closed action list for the buttons, add it to
  `assertAuthorableRubric` (one function, both authoring gates).
