# F10 · BA — Seeded rubric templates + template CRUD + 2 privileges

- **Owner role:** ba
- **Feature:** F10 — `RubricTemplate` table + bootstrap seeder (2 default templates) + 7-operation template CRUD + `rubric_template`/`criteria_author` privileges + `PrivilegeGuard` + staff-backfill migration
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** `F10-pm.md`, `F8-backend.md`, `F9-backend.md`, `F9-qa.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 1 / 4 / 8 / 10 / 11

## Inputs (what this role received)

- `F10-pm.md` — US1–US5 (MoSCoW), in/out of scope, the `locked` default-list assumption.
- Design doc **Phần 4** (authoritative): `RubricTemplate` columns, §4.1's 7-operation CRUD table with
  the `isSystem` column, §4.2's two privileges + the migration lock-out warning; Phần 8 (file scope);
  Phần 10 items 2–4 (mandatory test cases); Phần 11 (`locked` list is an open business decision).
- `F8-backend.md` — `normalizeRubric` behavioural contract (never throws, 12 top-level keys,
  idempotent); AC-15.9 "add seed-driven fixture cases by **import**, never by paste".
- `F9-backend.md` — `computeTotal` / `maxTotal` / `findLevel` / `validateLevels` signatures;
  `validateLevels` ships **wired to nothing**; `granularity()` reads `aggregation.round` + `scale.step`.
- `F9-qa.md` **OBS-2** — a rubric with `scale.max <= 0` makes the stored total disagree with the
  reported one; must be rejected at the authoring boundary, which is F10.
- Code read: `auth/{roles.guard,roles.decorator,session.types,session-auth.guard,bootstrap-admin.service,auth.controller,auth.service}.ts`,
  `users/{users.controller,users.service}.ts` + `dto/{create,update}-user.dto.ts`,
  `criteria/{criteria.controller,criteria.service,rubric-schema}.ts`, `lib/rubric-scoring.ts`,
  `prisma/schema.prisma` (`enum DashboardRole {admin,staff}`, `Criteria`, `DashboardUser`, the
  `PilotTextGrading.criteriaId` raw-id precedent).

## Checklist (the concrete work items for this task)

- [x] Read TASK-PROTOCOL + template, create this file
- [x] Read `F10-pm.md`, design doc Phần 4 (+1/8/10/11), `F8-backend.md`, `F9-backend.md`, `F9-qa.md` OBS-2
- [x] Read `auth/`, `users/`, `criteria/`, `lib/rubric-scoring.ts`, `schema.prisma`
- [x] FR-01…FR-22 with numbered, individually testable ACs
- [x] NFRs (performance / security / availability / maintainability)
- [x] Use cases UC-1…UC-6 (actor, preconditions, main + alternative flows, exceptions, postconditions)
- [x] Business rules BR-01…BR-14 + data dictionary (table, columns, DTOs, validation)
- [x] Assumptions, dependencies, open questions, deviations from PM wording
- [x] Set Status DONE

---

# F10 Functional Specification

## 0. Scope in one paragraph

Add a new, fully CRUD-able `rubric_templates` table to core-api, seeded **once, only when empty**
with two default v2 rubric structures transcribed from `Criteria-Source/*.pdf`; expose the seven
operations of design §4.1 under `/criteria/templates*`; add two independent string privileges to
`dashboard_users` enforced by a new `PrivilegeGuard`; and, in the same migration, grant
`criteria_author` to every pre-existing `staff` row so nobody loses the `.docx` upload they have
today. Also wire F9's already-shipped `validateLevels` (and two new scale guards) into a 400 at the
authoring boundary. No change to `grading-worker`, `zalo-gateway`, or
`GET /internal/criteria/:courseId`.

**Traceability:** every FR below names the PM story it serves. FR-01…FR-07 ⇒ US1; FR-12…FR-20 ⇒ US2;
FR-08…FR-11 ⇒ US3; FR-03 ⇒ US4; FR-21 ⇒ US5.

---

## 1. Functional requirements

### FR-01 — `RubricTemplate` Prisma model + table *(US1, US2)*

A new model `RubricTemplate` mapped to table `rubric_templates`, exactly the columns of design §4.
Additive migration; no existing table is altered except as stated in FR-02/FR-03.

- **AC-01.1** `schema.prisma` gains `model RubricTemplate` with `@@map("rubric_templates")` and the
  fields of §6.1's data dictionary: `id Int @id @default(autoincrement())`,
  `key String @unique`, `name String`, `rubric Json`, `locked String[] @default([])`,
  `isSystem Boolean @default(false) @map("is_system")`,
  `isActive Boolean @default(true) @map("is_active")`,
  `createdAt DateTime @default(now()) @map("created_at")`,
  `updatedAt DateTime @updatedAt @map("updated_at")`.
- **AC-01.2** The migration creates the table plus **exactly one** unique index, on `key`. No foreign
  key of any kind is created on this table or pointing at it.
- **AC-01.3** `prisma migrate diff --from-url <migrated db> --to-schema-datamodel prisma/schema.prisma`
  reports **"No difference detected"** — the hand-authored SQL matches the schema file (same
  verification procedure F9 used).
- **AC-01.4** Applying the migration to a database that already holds `courses`, `criteria`,
  `students`, `submissions`, `gradings` and `dashboard_users` rows changes **no** value in any
  pre-existing column of `criteria`, `gradings`, `students` or `submissions` (MD5 fingerprint over
  the pre-F10 columns identical before/after).
- **AC-01.5** The migration is forward-only; no down-migration file is authored (repo convention,
  same as F9). The migration SQL carries a Vietnamese header comment stating what it adds and that
  the one `UPDATE` (FR-03) is idempotent.

### FR-02 — `Criteria.templateKey`: a plain traceability string, **not** a foreign key *(US2)*

- **AC-02.1** `Criteria` gains `templateKey String? @map("template_key")`. Nullable, no default.
- **AC-02.2** There is **no** `@relation`, no `REFERENCES`, no `ON DELETE`/`ON UPDATE` clause and no
  index on `criteria.template_key`. Rationale recorded in a Vietnamese comment naming the existing
  `PilotTextGrading.criteriaId` precedent ("lưu id thô, không có quan hệ").
- **AC-02.3** After migration, every pre-existing `criteria` row has `template_key IS NULL`; no
  backfill is attempted.
- **AC-02.4** **The single most important test of this feature (design §10 item 3).** Given a
  `criteria` row with `templateKey = 'x'` and given the template `x` is then deleted via
  `DELETE /criteria/templates/x` (204), then: `GET /criteria/:id` returns 200 with an unchanged
  `rubric` and `templateKey: 'x'`; `GET /criteria?courseId=` still lists it;
  `GET /internal/criteria/:courseId` still returns it verbatim; and `POST /internal/gradings`
  against it still computes and persists a total exactly as before. Nothing anywhere returns 409/500
  because of the dangling key.
- **AC-02.5** `GET /criteria` and `GET /criteria/:id` responses carry `templateKey` (additive field,
  `null` for every row that predates F12). No other field of those responses changes.
- **AC-02.6** F10 itself **never writes** `templateKey` — the `.docx` upload path leaves it `null`.
  (F12's `POST /criteria/json` is the writer.)

### FR-03 — `DashboardUser.privileges` + the anti-lock-out backfill *(US3, US4)*

- **AC-03.1** `DashboardUser` gains `privileges String[] @default([])` (Postgres `text[]`,
  `NOT NULL DEFAULT ARRAY[]::text[]`).
- **AC-03.2** **The same migration** contains, after the `ADD COLUMN`:
  `UPDATE "dashboard_users" SET "privileges" = ARRAY['criteria_author'] WHERE "role" = 'staff' AND NOT ('criteria_author' = ANY("privileges"));`
- **AC-03.3** The `UPDATE` is **idempotent**: running the statement a second time reports
  `UPDATE 0` and changes no row (guarded by the `NOT … = ANY(…)` predicate).
- **AC-03.4** Regression test with a real/simulated pre-migration database: two `staff` rows and one
  `admin` row exist before the migration; after the migration each `staff` row has
  `privileges = {criteria_author}` and the `admin` row has `privileges = {}`.
- **AC-03.5** The backfill touches **only** the `privileges` column: `email`, `password_hash`,
  `role`, `must_change_password`, `created_at` are byte-identical before/after for every row.
- **AC-03.6** A `staff` account created **after** the migration through `POST /users` with no
  `privileges` in the body gets `privileges = []` — the backfill is one-time, never an ongoing
  default (AC traced to US4's last bullet).
- **AC-03.7** End-to-end lock-out proof: a `staff` user that could `POST /criteria` (.docx) before
  the deploy, and whose row was backfilled, still gets the identical success response after the
  deploy with FR-09's guard in place.

### FR-04 — Seed definition: Cambridge YL (`cambridge_yl_a0_a2`) *(US1)*

New file `services/core-api/src/criteria/templates/cambridge-yl.seed.ts`, exporting a single frozen
seed object. Structure is transcribed from design §1.1 (which is the authoritative transcription of
`Criteria-Source/RubricSpeakingA0-C.pdf`).

- **AC-04.1** `key === 'cambridge_yl_a0_a2'`; `name` is a human title in Vietnamese/English mix as
  seen by teachers (e.g. `"Cambridge Young Learners (A0–A2) — Speaking"`); `isSystem === true`.
- **AC-04.2** `rubric.schema_version === 2`, `rubric.scale` deep-equals `{ min: 0, max: 5, step: 1 }`.
- **AC-04.3** `rubric.aggregation` deep-equals `{ method: 'sum', round: 'none' }`.
- **AC-04.4** `rubric.dimensions` has **exactly 5** entries, in this order, with these `key`s:
  `pronunciation`, `intonation`, `ending_sounds`, `word_stress`, `fluency`; every `weight === 1`;
  `dimensions[0].key === 'pronunciation'`.
- **AC-04.5** Each dimension's `label` is the teacher-facing bilingual label from §1.1's table
  (`"Pronunciation (Âm chính)"`, `"Intonation (Ngữ điệu)"`, `"Ending sounds (Âm đuôi)"`,
  `"Word Stress (Trọng âm từ/cụm)"`, `"Fluency (Trôi chảy)"`).
- **AC-04.6** `bands['0']` and `bands['5']` of each dimension carry the §1.1 "Band 0"/"Band 5" text
  **verbatim**, each as a one-element array (v2 bands are `string[]`). Bands `1`–`4` may be absent or
  empty arrays (see A-2: a template is a structure; band prose is `criteria_author` content).
- **AC-04.7** `rubric.levels` deep-equals, in order:
  `[{min:0,max:10,code:'A0',label:'Pre-starter (A0) ~ Tiny Rabbit'},
    {min:11,max:15,code:'A1-',label:'Starter (A1-) ~ Little Fox'},
    {min:16,max:20,code:'A1',label:'Mover (A1) ~ Junior Panda'},
    {min:21,max:25,code:'A2',label:'Flyer (A2) ~ Great Big Dino'}]`.
- **AC-04.8** `rubric.output_fields` deep-equals `['comment']`.
- **AC-04.9** `maxTotal(seed.rubric) === 25` — reproduces the PDF's "Tổng tối đa = 25 điểm".
- **AC-04.10** `computeTotal(seed.rubric, {pronunciation:{score:4},intonation:{score:3},ending_sounds:{score:4},word_stress:{score:3},fluency:{score:4}})`
  ⇒ `total 18`, `max 25`, `level.code 'A1'`, `level.label 'Mover (A1) ~ Junior Panda'`, `counted 5`
  (this is the design §10 item 1 number, and it must come from the **seed**, not a hand-built copy).
- **AC-04.11** `validateLevels(seed.rubric)` returns `[]` — no gap, no overlap, full `0..25` coverage.
- **AC-04.12** `locked` deep-equals
  `['dimensions[].key','scale','aggregation','levels','output_fields']` (design §11's proposed
  default, adopted by PM's Assumption 1 — see OQ-1).

### FR-05 — Seed definition: IELTS Speaking (`ielts_speaking`) *(US1)*

New file `services/core-api/src/criteria/templates/ielts-speaking.seed.ts`. Transcribed from
design §1.2 (`Criteria-Source/Analystic-ScoringBand.pdf`).

- **AC-05.1** `key === 'ielts_speaking'`; `isSystem === true`; `name` is the teacher-facing title
  (e.g. `"IELTS Speaking — Analytic Scoring Band"`).
- **AC-05.2** `rubric.scale` deep-equals `{ min: 0, max: 9, step: 1 }`.
- **AC-05.3** `rubric.aggregation` deep-equals `{ method: 'average', round: 'nearest_int' }` —
  §1.2's "điểm của từng tiêu chí này sẽ **không có số lẻ** như 4.5, 5.5 hay 6.5".
- **AC-05.4** `rubric.dimensions` has **exactly 4** entries with `key`s
  `fluency_coherence`, `lexical_resource`, `grammatical_range`, `pronunciation`, every `weight === 1`,
  and labels matching §1.2 (`"Fluency and coherence"`, `"Lexical resources"`,
  `"Grammatical range and accuracy"`, `"Pronunciation"`).
- **AC-05.5** `rubric.output_fields` deep-equals `['comment','fix']` — §1.2 item 4 ("Nhận xét" **và**
  "Hướng sửa bài").
- **AC-05.6** `rubric.levels` deep-equals `[]` (IELTS band ≠ a level ladder; no conversion table in
  the PDF).
- **AC-05.7** `maxTotal(seed.rubric) === 9` (`average` ⇒ max is `scale.max`, not `4 × 9`).
- **AC-05.8** `computeTotal(seed.rubric, {fluency_coherence:{score:6},lexical_resource:{score:7},grammatical_range:{score:6},pronunciation:{score:6}})`
  ⇒ `total 6` (6.25 rounded by `nearest_int`), `max 9`, `counted 4`, `level null`.
- **AC-05.9** `validateLevels(seed.rubric)` returns `[]` (an empty `levels` list is valid — no
  conversion requested).
- **AC-05.10** If a dimension carries `sub_factors`, each entry matches
  `{ label: string, by_band: Record<string,string> }` and its `by_band` keys are band values inside
  `0..9` (§1.2 item 3's keyword grid). `sub_factors: []` is acceptable for the seed.
- **AC-05.11** `locked` deep-equals the same 5-entry list as AC-04.12.

### FR-06 — Seed-module invariants (the "seeds ARE the fixtures" rule) *(US1)*

- **AC-06.1** `normalizeRubric(seed.rubric)` **deep-equals** `seed.rubric` for both seeds — the seeds
  are `normalizeRubric` fixed points (F8 AC-15.9, restated by both F8-backend and F9-qa). Asserted as
  its own test per seed.
- **AC-06.2** `normalizeRubric(seed.rubric)` returns exactly the 12 whitelisted top-level keys, i.e.
  the seed literal itself declares exactly those 12 keys and no extra.
- **AC-06.3** **There is no second copy of either seed anywhere in the repo.** Specifically: no file
  under any `__fixtures__` directory, and no spec file, contains a pasted duplicate of a seed's
  `dimensions`/`levels`/`scale`/`aggregation` literal. `rubric-scoring.spec.ts`'s existing
  `KID_RUBRIC` / `IELTS_RUBRIC` hand-built fixtures are **replaced by an import of the seeds**
  (F8 AC-15.9, F9-backend's and F9-qa's explicit instruction to F10).
- **AC-06.4** After that replacement, **every pre-existing assertion in `rubric-scoring.spec.ts`
  still passes unchanged.** If any assertion would have to be weakened or edited to accommodate the
  seed, that is a defect in the seed, not in the test. (The two hand-built fixtures were verified
  byte-faithful to the PDFs by F9-qa; the seeds must reproduce them structurally.)
- **AC-06.5** Each seed module is deep-frozen (or the service deep-copies before writing) such that
  `POST /criteria/templates/:key/reset` and the bootstrap seeder can never mutate the in-memory seed
  object. Test: reset a system template whose stored `rubric` was edited, then reset a second time —
  the second reset produces the identical row.
- **AC-06.6** A single barrel `criteria/templates/index.ts` (or equivalent) exports the seed list in
  a deterministic order `[cambridge_yl_a0_a2, ielts_speaking]` and a `findSeed(key)` lookup used by
  both the seeder (FR-07) and the reset route (FR-18). No other module reads a seed file directly.
- **AC-06.7** Both seeds satisfy every authoring-boundary rule of FR-19 — i.e. `POST /criteria/templates`
  with a seed's own body would be accepted (200/201), never 400. Test asserts this per seed, so a
  future edit to the validator that would reject the shipped defaults fails loudly.

### FR-07 — `BootstrapRubricTemplatesService` — seed only when the table is empty *(US1)*

New file `services/core-api/src/criteria/bootstrap-rubric-templates.service.ts`, following
`BootstrapAdminService` (implements `OnApplicationBootstrap`, counts first, writes only if 0).

- **AC-07.1** On boot with `rubric_templates` empty ⇒ exactly **2** rows created, `isSystem = true`
  and `isActive = true` on both, `key`s `cambridge_yl_a0_a2` and `ielts_speaking`, `rubric`/`locked`/
  `name` equal to the seed definitions.
- **AC-07.2** On boot with `count > 0` ⇒ **zero writes**. Proven by a mock Prisma whose
  `create`/`createMany`/`update`/`upsert`/`delete` are all asserted **not called** (the fixed form of
  F8's OBS-01: assert *not called*, not "property absent").
- **AC-07.3** **The anti-clobber regression test (design §10 item 2).** Seed on an empty table →
  mutate a seeded row (change `name`, replace `rubric`, set `isActive = false`) → run the bootstrap
  again → the row is byte-identical to the mutated version, and `updatedAt` is unchanged.
- **AC-07.4** The seeder is idempotent under concurrency: it inserts with `skipDuplicates` (or catches
  Prisma `P2002` and logs), so two core-api processes booting simultaneously against one database
  cannot crash on the `key` unique index.
- **AC-07.5** **A seeding failure must not prevent the application from booting.** Any error is
  caught, logged at `error` level with the offending key, and swallowed; `onApplicationBootstrap`
  resolves. (Deliberate difference from `BootstrapAdminService`: no admin account means nobody can
  log in at all, whereas missing templates only means an empty picker.)
- **AC-07.6** Exactly one log line at `log` level on a successful seed, naming the number of rows
  created; no log line when the table was non-empty.
- **AC-07.7** The seeder requires no environment variable — unlike `BootstrapAdminService` it is
  unconditional apart from the emptiness check.
- **AC-07.8** The seeder is registered in `CriteriaModule` providers; it is **not** an HTTP route and
  is not reachable from outside the process.

### FR-08 — `@RequiresPrivilege` + `PrivilegeGuard` *(US3)*

New `services/core-api/src/auth/privilege.guard.ts` (+ decorator; may live in
`privilege.decorator.ts` mirroring `roles.decorator.ts`).

- **AC-08.1** Privilege names are a **fixed, exported allow-list** — exactly
  `['rubric_template','criteria_author']` — declared once (e.g. `auth/privileges.ts`, exported type
  `DashboardPrivilege`). No other module hard-codes the literals.
- **AC-08.2** `@RequiresPrivilege(...p: DashboardPrivilege[])` sets metadata under a single key,
  mirroring `ROLES_KEY`/`Roles`. Multiple arguments mean **OR** (holding any one suffices).
- **AC-08.3** `PrivilegeGuard` is used **after** `SessionAuthGuard`
  (`@UseGuards(SessionAuthGuard, PrivilegeGuard)`), exactly the documented `RolesGuard` ordering.
- **AC-08.4** No metadata on handler or class ⇒ `canActivate` returns `true` without touching the
  database (so the guard can safely sit at class level on a controller with public reads).
- **AC-08.5** No `req.session.user` ⇒ `UnauthorizedException('login required')` (401). Defence in
  depth; `SessionAuthGuard` normally catches this first.
- **AC-08.6** The guard reads `role` and `privileges` **from Postgres by `session.user.id`** on each
  gated request (`select: { role: true, privileges: true }`), **not** from the session copy — see
  decision D-1. `role === 'admin'` ⇒ allow, regardless of the `privileges` array contents
  (design §4.2: "admin mặc nhiên có mọi quyền").
- **AC-08.7** `role === 'staff'` and `privileges` contains at least one required name ⇒ allow.
- **AC-08.8** `role === 'staff'` and no required name present (including `privileges = []`) ⇒
  `ForbiddenException('insufficient privilege')` (403). The message is deliberately **different**
  from `RolesGuard`'s `'insufficient role'` so a 403 can be attributed to the right guard in logs
  and in QA.
- **AC-08.9** Session references a `dashboard_users` row that no longer exists ⇒ 403
  `'insufficient privilege'` (never a 500, never allow).
- **AC-08.10** Privilege changes take effect on the **very next request** with no logout/login:
  grant `rubric_template` to a logged-in staff user via `PATCH /users/:id`, then that user's existing
  session succeeds on `POST /criteria/templates`. Revoking has the mirror effect (immediate 403).
- **AC-08.11** Unknown strings sitting in a user's `privileges` array (e.g. from a manual DB edit)
  grant nothing and cause no error.
- **AC-08.12** The guard performs **at most one** database query per request.

### FR-09 — Privilege enforcement on the existing `criteria` write path *(US3, US4)*

- **AC-09.1** `POST /criteria` (multipart `.docx` upload) is gated
  `@UseGuards(SessionAuthGuard, PrivilegeGuard)` + `@RequiresPrivilege('criteria_author')`.
- **AC-09.2** **Reads stay open.** `GET /criteria?courseId=` and `GET /criteria/:id` keep
  `SessionAuthGuard` **only** — no privilege, no role. Design §4.2's note: "Quyền đọc (`GET`) vẫn mở
  cho mọi `staff` như cũ — chỉ đường **ghi** mới bị gác." Test: `staff` with `privileges = []` gets
  200 on both reads.
- **AC-09.3** Matrix on `POST /criteria` (.docx): `admin` ⇒ allowed; `staff` + `criteria_author` ⇒
  allowed; `staff` + only `rubric_template` ⇒ 403; `staff` + `[]` ⇒ 403; not logged in ⇒ 401.
- **AC-09.4** The two existing 400 rejection messages of the `.docx` parser are unchanged, and a
  privileged user's successful upload response is byte-identical to pre-F10 apart from the additive
  `templateKey: null` (AC-02.5).
- **AC-09.5** `worker-api`'s `/internal/*` routes are **not** touched by `PrivilegeGuard` — they keep
  `InternalTokenGuard` (service-to-service, no session, no privileges).

### FR-10 — Users API carries `privileges` *(US3, US5)*

- **AC-10.1** `UserView` (and therefore `GET /users`, `POST /users`, `PATCH /users/:id`,
  `POST /users/:id/reset-password`) gains `privileges: string[]`. `USER_SELECT` adds
  `privileges: true`. `password_hash` is still never selected.
- **AC-10.2** `UpdateUserDto` gains an optional `privileges?: DashboardPrivilege[]` validated with
  `@IsOptional() @IsArray() @IsIn([...], { each: true })`. Absent ⇒ the column is **not** written
  (a `PATCH` that only changes `email` must not silently clear privileges).
- **AC-10.3** `PATCH /users/:id` with `privileges: ['criteria_author']` ⇒ 200 and the row now holds
  exactly that array; a subsequent `PATCH` with `privileges: []` ⇒ 200 and the array is empty
  (full replace semantics, not merge).
- **AC-10.4** An unknown privilege string (e.g. `'rubric_templates'`, `'admin'`) ⇒ **400**, and the
  row is unchanged. A typo must never silently grant nothing.
- **AC-10.5** Duplicate entries in the array are de-duplicated before persisting
  (`['criteria_author','criteria_author']` ⇒ stored `['criteria_author']`).
- **AC-10.6** `CreateUserDto` gains the same optional field with the same validation; absent ⇒
  `privileges = []` (AC-03.6).
- **AC-10.7** Setting `privileges` on an `admin` user is **accepted and stored verbatim** but has no
  effect on authorisation (AC-08.6). Rationale: demoting that admin to `staff` later then yields a
  predictable privilege set rather than an empty one.
- **AC-10.8** `privileges` remains admin-only to write: `/users` keeps its class-level
  `@Roles('admin')`, so a `staff` user cannot grant themselves anything (403 as today).
- **AC-10.9** Mass-assignment is impossible elsewhere: no other endpoint accepts a `privileges`
  field, and `ValidationPipe({ whitelist: true })` strips it if sent (e.g. to
  `POST /auth/change-password`).

### FR-11 — `GET /auth/me` exposes the caller's privileges *(US3, enables US5/F12)*

- **AC-11.1** `GET /auth/me` response gains `privileges: string[]`, read **fresh from Postgres** for
  the session's user id (consistent with AC-08.6 — the UI must not show buttons the guard will
  reject, nor hide buttons it would allow).
- **AC-11.2** For `role === 'admin'` the response also carries the effective set: `privileges`
  contains **both** names, so the front-end can gate on `privileges.includes(...)` alone without
  re-implementing the admin-bypass rule. (Stored column may be `[]`; this is a *derived* response
  field — the DB is not written.)
- **AC-11.3** The pre-existing fields `id`, `email`, `role`, `mustChangePassword` are unchanged in
  name, type and value.
- **AC-11.4** If the session's user row no longer exists, `GET /auth/me` returns the session copy
  with `privileges: []` and does not throw a 500.
- **AC-11.5** `POST /auth/login` and `POST /auth/change-password` response shapes are **unchanged**
  (F4's contract stays frozen); `session.user` gains no new field.

### FR-12 — `GET /criteria/templates` — list *(US2)*

- **AC-12.1** Route `GET /criteria/templates`. Auth: `SessionAuthGuard` only — **no** privilege
  (design §4.1 marks list/detail as available on both template kinds, and §4.2 keeps reads open).
  `staff` with `privileges = []` ⇒ 200.
- **AC-12.2** Default (no query string) returns only rows with `isActive = true`.
- **AC-12.3** `?includeInactive=true` (also accepted: `1`) returns active **and** inactive rows.
  Any other value, and an absent parameter, mean *exclude* — the parameter never 400s.
- **AC-12.4** Ordering is deterministic: `isSystem DESC, key ASC` — the two seeded templates always
  appear first (design §7: "hai mẫu mặc định … đứng đầu").
- **AC-12.5** Each element is the §6.2 response shape: `{id, key, name, rubric, locked, isSystem,
  isActive, createdAt, updatedAt}`. `rubric` is passed through `normalizeRubric` at read (BR-06).
- **AC-12.6** Empty table ⇒ `200` with `[]` (never 404).
- **AC-12.7** Not logged in ⇒ 401 `login required`.

### FR-13 — `GET /criteria/templates/:key` — detail *(US2)*

- **AC-13.1** Known key ⇒ 200 with the §6.2 shape, including inactive and system templates
  (`includeInactive` does not apply to detail).
- **AC-13.2** Unknown key ⇒ 404 `template not found`.
- **AC-13.3** Auth: `SessionAuthGuard` only (AC-12.1's rationale). `staff` + `[]` ⇒ 200.
- **AC-13.4** The `:key` segment is matched as a string; a numeric-looking key such as `123` returns
  404 (not a 400 from `ParseIntPipe` — see FR-20).

### FR-14 — `POST /criteria/templates` — create *(US2)*

- **AC-14.1** Auth: `SessionAuthGuard` + `@RequiresPrivilege('rubric_template')`.
- **AC-14.2** Body per §6.3 `CreateRubricTemplateDto`: `{ key, name, rubric, locked?, isActive? }`.
  Success ⇒ **201** with the created row.
- **AC-14.3** The created row always has `isSystem = false`, regardless of what the body contains
  (`isSystem` is not a DTO field; `whitelist: true` strips it). Design §4.1: create is available for
  ordinary templates only.
- **AC-14.4** `isActive` defaults to `true` when absent; `locked` defaults to `[]`.
- **AC-14.5** The stored `rubric` is the **normalized** rubric (`normalizeRubric(body.rubric)`), so
  every template row is a v2 fixed point on disk (BR-06). The 201 response echoes the stored value.
- **AC-14.6** Duplicate `key` (an existing row, active or inactive, system or not) ⇒ **409**
  `template key already exists`, and no row is created. The check must also catch the race via
  Prisma `P2002` ⇒ 409 (same defensive pattern as `UsersService.create`).
- **AC-14.7** `key` validation: trimmed, then must match `^[a-z0-9][a-z0-9_]{0,63}$` ⇒ otherwise 400.
  Uppercase, spaces, dots, hyphens and the empty string are rejected.
- **AC-14.8** `name` validation: trimmed, length 1..200 ⇒ otherwise 400.
- **AC-14.9** `rubric` must be a JSON object (not array, not null, not string) ⇒ otherwise 400.
- **AC-14.10** Every FR-19 rubric rule is applied here; a violation ⇒ 400 with the FR-19 body and
  **no row created**.
- **AC-14.11** `staff` with `privileges = []` or with only `criteria_author` ⇒ 403; `admin` ⇒ 201.

### FR-15 — `POST /criteria/templates/:key/duplicate` — duplicate *(US2)*

- **AC-15.1** Auth: `@RequiresPrivilege('rubric_template')`. Success ⇒ **201** with the new row.
- **AC-15.2** Body `{ key, name? }`. The new `key` is required and obeys AC-14.7; `name` defaults to
  `` `${source.name} (bản sao)` `` when absent.
- **AC-15.3** Works on **any** source template including `isSystem = true` ones (design §4.1's
  "✔ → bản sao là mẫu thường").
- **AC-15.4** The copy always has `isSystem = false` and `isActive = true`, and `rubric`/`locked`
  **deep-equal** the source's (a deep copy — mutating the copy afterwards must not change the
  source's stored JSON).
- **AC-15.5** **The copy of a system template is deletable**: `DELETE` on it ⇒ 204 (design §10 item 3).
- **AC-15.6** Unknown source key ⇒ 404 `template not found`, nothing created.
- **AC-15.7** New `key` already taken ⇒ 409 `template key already exists`, nothing created.
- **AC-15.8** Duplicating an **inactive** source is allowed and yields an active copy.
- **AC-15.9** FR-19 validation is **not** re-run on duplicate (the source already passed it, and a
  row hand-edited in the DB must still be copyable) — but the copy is stored through
  `normalizeRubric` exactly like AC-14.5.

### FR-16 — `PUT /criteria/templates/:key` — update *(US2)*

- **AC-16.1** Auth: `@RequiresPrivilege('rubric_template')`. Success ⇒ **200** with the updated row.
- **AC-16.2** Body per §6.4 `UpdateRubricTemplateDto`: `{ name?, rubric?, locked? }`. All optional;
  an absent field is not written.
- **AC-16.3** **`isSystem` templates are fully editable through this route** — `rubric`, `locked`,
  `name`, including fields listed in that row's own `locked` array. `locked` constrains only F12's
  content-authoring drawer (`criteria_author`), never a `rubric_template` holder (design §4.1's
  "Sửa: ✔ (sửa được mọi trường)" and §11's closing note).
- **AC-16.4** `key` is **immutable**: a `key` property in the body is rejected with 400
  `template key is immutable` if it differs from the path key, and ignored if identical. Rationale
  in decision D-2.
- **AC-16.5** `isSystem` and `isActive` are **not** settable here (`isActive` has its own route,
  FR-17; `isSystem` is seeder-only). Sending them is stripped by `whitelist: true` and changes
  nothing.
- **AC-16.6** Unknown key ⇒ 404 `template not found`.
- **AC-16.7** When `rubric` is present, every FR-19 rule is applied and the stored value is
  normalized (AC-14.5). A violation ⇒ 400 and **no column is written** (partial writes are forbidden).
- **AC-16.8** `updatedAt` advances on every successful update; `createdAt` and `isSystem` never change.
- **AC-16.9** Editing a system template makes it diverge from its seed; `GET` afterwards returns the
  edited value and a later boot never reverts it (ties to AC-07.3).
- **AC-16.10** A `PUT` that changes only `name` leaves `rubric` byte-identical (no normalize
  round-trip on an untouched column).

### FR-17 — `PATCH /criteria/templates/:key/active` — hide / show *(US2)*

- **AC-17.1** Auth: `@RequiresPrivilege('rubric_template')`. Success ⇒ **200** with the updated row.
- **AC-17.2** Body `{ isActive: boolean }` — required, strictly boolean (`"true"` string ⇒ 400).
- **AC-17.3** Works on **both** ordinary and `isSystem` templates (design §4.1: "Ẩn / hiện ✔ ✔").
- **AC-17.4** Setting `isActive = false` removes the row from the default `GET /criteria/templates`
  list but it remains visible with `?includeInactive=true` and via `GET …/:key`.
- **AC-17.5** Hiding a template changes **nothing** about `criteria` rows already derived from it.
- **AC-17.6** Unknown key ⇒ 404. Setting the value it already has ⇒ 200, idempotent.

### FR-18 — `POST /criteria/templates/:key/reset` — restore original *(US2)*

- **AC-18.1** Auth: `@RequiresPrivilege('rubric_template')`. Success ⇒ **200** with the restored row.
- **AC-18.2** On an `isSystem` template with a matching seed: `name`, `rubric` and `locked` are
  overwritten from the seed definition (see D-4 for `name`). `isActive` is **left as it is**, and
  `isSystem` stays `true`, and `id`/`createdAt` are unchanged.
- **AC-18.3** On an **ordinary** (`isSystem = false`) template ⇒ **409**
  `reset is only available for system templates`, row untouched (design §4.1: "✘ 409").
- **AC-18.4** Round-trip test (design §10 item 2): edit a seeded template arbitrarily → `reset` →
  the resulting `rubric`/`locked`/`name` deep-equal the seed exactly; a second `reset` yields an
  identical row (idempotent, AC-06.5).
- **AC-18.5** Unknown key ⇒ 404 `template not found`.
- **AC-18.6** `isSystem = true` but no seed definition exists for that key (only reachable by a
  manual DB edit) ⇒ **409** `no seed definition for this template` — never a 500.
- **AC-18.7** `reset` does not touch any `criteria` row, even one whose `templateKey` names this
  template (design §4: "Sửa mẫu **không** hồi tố các `criteria` đã soạn từ nó").

### FR-19 — Rubric validation at the authoring boundary *(US2; closes F9 OBS-2)*

A single exported helper (e.g. `criteria/rubric-validation.ts`,
`assertAuthorableRubric(rubric: RubricV2): void`) used by FR-14 and FR-16 — and **reusable verbatim
by F12's `POST /criteria/json`**. It runs on the **normalized** rubric.

- **AC-19.1** `validateLevels(rubric)` returning a non-empty `LevelIssue[]` ⇒ **400**. The response
  body carries the issues verbatim: `{ message: 'invalid rubric', issues: [{code,index,message}, …] }`
  with F9's Vietnamese `message` strings unmodified.
- **AC-19.2** Concrete level cases, each ⇒ 400 with the matching `code`: overlapping ranges
  (`level_overlap`), a gap between ranges (`level_gap`), `min > max` or a non-string `code`/`label`
  (`level_invalid`), coverage not starting at the minimum total (`level_coverage_start`), coverage
  not reaching `maxTotal` (`level_coverage_end`).
- **AC-19.3** `levels: []` ⇒ **accepted** (no conversion requested — this is the IELTS seed, AC-05.6).
- **AC-19.4** **`scale.max <= 0` ⇒ 400** `scale.max must be greater than 0` — this closes F9-qa's
  OBS-2, which is exactly the shape that would store `total 0 ⇒ "A0 ~ Tiny Rabbit"` on a grading
  while reports say 18/25. Tested with `scale: {min:0,max:0,step:1}` and with a negative max.
- **AC-19.5** `scale.max <= scale.min` ⇒ 400 `scale.max must be greater than scale.min` (an inverted
  scale is the same class of defect; F9's `computeTotal` clamps into an empty interval).
- **AC-19.6** `scale.step <= 0` ⇒ 400 `scale.step must be greater than 0` (F9's `granularity()`
  reads `scale.step`; a zero step makes gap detection meaningless).
- **AC-19.7** `dimensions` empty ⇒ 400 `rubric must declare at least one dimension`.
- **AC-19.8** A rubric whose `dimensions` contains **no** `pronunciation` key ⇒ **400**
  `rubric must include the "pronunciation" dimension` — the same mandatory-dimension rule the
  `.docx` upload already enforces (F8/architecture §3.10), applied one step earlier so a structure
  that is guaranteed to fail at grading time cannot be saved. See decision D-3.
- **AC-19.9** Duplicate `dimensions[].key` values ⇒ 400 `duplicate dimension key: <key>` (the
  worker's `build_output_schema` raises `RubricError` on this; catch it at authoring time).
- **AC-19.10** A dimension `key` not matching `^[a-z0-9][a-z0-9_]{0,63}$` ⇒ 400 (it becomes a JSON
  Schema property name sent to the LLM).
- **AC-19.11** A negative `weight` ⇒ 400 `dimension weight must be >= 0`. Zero is allowed
  (a dimension graded for comment only).
- **AC-19.12** `output_fields` must be a non-empty subset of `['comment','fix']` with no duplicates ⇒
  otherwise 400. (`normalizeRubric` already coerces, so this catches a caller sending `[]`.)
- **AC-19.13** Validation **never throws anything but a 400** — no 500 for any input shape, including
  `rubric: {}`, deeply nested garbage, huge numbers, `NaN`-ish strings. Because `normalizeRubric`
  runs first and never throws, the validator only ever sees a well-formed `RubricV2`.
- **AC-19.14** The validator is **pure**: no database, no Redis, no I/O; it does not mutate its
  argument.
- **AC-19.15** Both seeds pass it (AC-06.7). Every rubric currently stored in `criteria` that would
  *fail* this validator is untouched — the validator gates **writes to templates only** in F10, never
  reads, and never the `.docx` path's existing behaviour (AC-09.4).

### FR-20 — Route ordering in `criteria.controller.ts` (regression hazard) *(US2)*

- **AC-20.1** **Every string-literal route under `/criteria` is declared before `@Get(':id')`.** The
  file order must be: `GET /criteria` (list by courseId) → all `templates*` routes → `@Get(':id')` →
  `@Post()`. Design §8 calls this out by name: "**khai báo mọi route chữ TRƯỚC `@Get(':id')`**, nếu
  không `ParseIntPipe` sẽ trả 400 cho chúng".
- **AC-20.2** Behavioural test (not a code-review item): `GET /criteria/templates` as an
  authenticated user returns **200 with an array** — specifically **not** 400
  `Validation failed (numeric string is expected)` from `ParseIntPipe`.
- **AC-20.3** Same assertion for every other literal route: `GET /criteria/templates/:key`,
  `POST /criteria/templates`, `POST /criteria/templates/:key/duplicate`,
  `PUT /criteria/templates/:key`, `DELETE /criteria/templates/:key`,
  `PATCH /criteria/templates/:key/active`, `POST /criteria/templates/:key/reset`.
- **AC-20.4** `GET /criteria/7` still resolves to the existing numeric detail handler and
  `GET /criteria/abc` still returns 400 from `ParseIntPipe` — the pre-F10 behaviour of `:id` is
  unchanged for non-`templates` paths.
- **AC-20.5** A Vietnamese comment above the `templates` block states the ordering constraint so a
  later refactor cannot silently reorder it.
- **AC-20.6** Whether the template routes live in a separate `RubricTemplateController` with its own
  `@Controller('criteria/templates')` is an implementation choice — but if they do, that controller
  must be registered **before** `CriteriaController` in the module's `controllers` array, and
  AC-20.2/20.3 still apply as written.

### FR-21 — Users screen: two privilege checkboxes *(US5)*

- **AC-21.1** `services/dashboard/src/pages/Users.tsx`'s existing edit form gains two checkboxes,
  reusing F5's form patterns (no new screen, no new component library).
- **AC-21.2** Labels: `rubric_template` ⇒ vi "Cấu trúc chấm điểm" / en "Scoring structure";
  `criteria_author` ⇒ vi "Nội dung chấm điểm" / en "Scoring content". Both keys exist in **both**
  the `vi` and `en` blocks of `src/i18n/index.ts`.
- **AC-21.3** Editing a `staff` user shows both checkboxes, pre-ticked from `user.privileges`.
- **AC-21.4** Editing an `admin` user hides (or disables with an explanatory title) both checkboxes —
  an admin already holds everything, so an unticked box would be a lie.
- **AC-21.5** Saving sends `privileges: string[]` on the existing `PATCH /users/:id` call; no new
  endpoint is added on the client.
- **AC-21.6** After a successful save the list reflects the new value without a full page reload
  (same refresh mechanism the screen already uses for `email`/`role`).
- **AC-21.7** A 400 from AC-10.4 surfaces through the screen's existing error display; no unhandled
  promise rejection.
- **AC-21.8** `npm run build` (tsc -b && vite build) passes in Docker; no new npm dependency.

### FR-22 — Module wiring & non-regression *(US1–US4)*

- **AC-22.1** `CriteriaModule` registers the new service(s), controller(s) and the bootstrap seeder;
  `AuthModule` exports `PrivilegeGuard` (or it is resolvable wherever used — note the repo's existing
  pitfall: a guard is instantiated in the DI scope of the *consuming* module, and `PrismaService`
  is `@Global()`, which is what makes this work).
- **AC-22.2** **No new npm dependency** in `services/core-api/package.json` or
  `services/dashboard/package.json`.
- **AC-22.3** **Zero edits** under `services/grading-worker/` and `services/zalo-gateway/`; the three
  `contracts` files are untouched.
- **AC-22.4** `GET /internal/criteria/:courseId` remains **byte-identical** — still returns the stored
  rubric verbatim, not normalized (F8 AC-08.2, re-affirmed by F9 and by F8's QA: changing it kills
  the Python shim's only production caller).
- **AC-22.5** The full pre-existing core-api jest suite (F9 baseline: **32 suites / 502 tests**)
  passes with **unchanged assertions**, except for `rubric-scoring.spec.ts`'s two fixture *definitions*
  replaced by seed imports per AC-06.3 — its assertions themselves stay unchanged (AC-06.4).
- **AC-22.6** `npx tsc -p tsconfig.build.json --noEmit` is clean; `npx prisma generate` succeeds.
- **AC-22.7** All new code comments are in Vietnamese (repo convention for the three backend services).

---

## 2. Non-functional requirements

- **NFR-P1 (boot cost).** On a non-empty `rubric_templates`, the seeder issues exactly **one** query
  (`count`) and adds < 50 ms to application bootstrap.
- **NFR-P2 (guard cost).** `PrivilegeGuard` issues at most **one** primary-key lookup per gated
  request (AC-08.12). Only *write* routes are gated, so the read-heavy dashboard paths pay nothing.
- **NFR-P3 (list size).** `GET /criteria/templates` is unpaginated; expected volume is < 50 rows and
  the endpoint must stay correct up to 500 rows. If a center ever exceeds that, pagination is a
  follow-up, not a defect.
- **NFR-S1 (least privilege).** Reads stay session-only; **only** writes are privilege-gated
  (design §4.2). No route becomes *more* restrictive for a backfilled `staff` user than it is today.
- **NFR-S2 (no self-escalation).** Privileges are writable only through `/users`, which is
  `@Roles('admin')`. No endpoint lets a user modify their own `privileges`.
- **NFR-S3 (no mass assignment).** `isSystem` is not a DTO field anywhere; `ValidationPipe({whitelist:true})`
  strips it. The only writer of `isSystem = true` is the seeder.
- **NFR-S4 (injection).** Template `key`s are regex-constrained and reach Prisma as parameters, never
  string-concatenated SQL. Teacher-authored rubric strings are stored as JSON and rendered by React
  as text — they never reach SQL, a shell, or a filesystem path.
- **NFR-A1 (boot resilience).** A seeding failure is logged and swallowed; the service still serves
  traffic (AC-07.5). A missing template degrades the authoring UI, it must not degrade grading.
- **NFR-A2 (migration safety).** The migration is additive and its single `UPDATE` is idempotent
  (AC-03.3). Re-running `prisma migrate deploy` is a no-op. Rolling back means restoring a dump —
  documented in the migration header, no down-migration file (repo convention).
- **NFR-A3 (deployment order).** Because the backfill runs inside the migration and the guard is
  added in the same release, there is **no window** in which a migrated `staff` user faces a guard
  with an empty `privileges` array.
- **NFR-M1 (single source of truth).** Exactly one copy of each seed exists repo-wide (AC-06.3), one
  declaration of the privilege names (AC-08.1), one rubric validator shared with F12 (FR-19).
- **NFR-M2 (test strategy).** F10 ships no UI for the templates (that is F12), so its acceptance is
  exercised through the API — jest e2e/controller tests plus the design §10 item 6 curl path.

---

## 3. Use cases

### UC-1 — First boot on a fresh installation
- **Actor:** the system (core-api process). **Preconditions:** migration applied; `rubric_templates`
  empty.
- **Main flow:** app bootstraps → seeder counts rows → 0 → inserts the two seeds with
  `isSystem = true` → logs "seeded 2 rubric templates".
- **Alternative A1:** table non-empty ⇒ zero writes, no log (AC-07.2/07.3).
- **Alternative A2:** two processes boot together ⇒ the loser's insert is skipped by
  `skipDuplicates`/`P2002` (AC-07.4).
- **Exception E1:** database unreachable or a seed rejected by the DB ⇒ error logged, boot continues
  (AC-07.5).
- **Postcondition:** exactly two `isSystem` rows exist, or the table is left exactly as found.

### UC-2 — A curriculum lead builds a Writing rubric from the IELTS default
- **Actor:** `staff` with `rubric_template`. **Preconditions:** logged in; `ielts_speaking` exists.
- **Main flow:** `GET /criteria/templates` (200, IELTS first) → `POST …/ielts_speaking/duplicate`
  `{key:'writing_internal', name:'Writing nội bộ'}` (201, `isSystem=false`) →
  `PUT …/writing_internal` with three dimensions and a new `scale` (200) → the new template appears
  in the list.
- **Alternative A1:** they change their mind ⇒ `DELETE …/writing_internal` ⇒ 204.
- **Alternative A2:** they only want it out of sight ⇒ `PATCH …/active {isActive:false}` ⇒ 200 and it
  vanishes from the default list.
- **Exception E1:** `key` already taken ⇒ 409, nothing created (AC-15.7).
- **Exception E2:** their `levels` leave a gap ⇒ 400 with F9's Vietnamese issue messages (AC-19.1).
- **Exception E3:** they drop `pronunciation` ⇒ 400 (AC-19.8).
- **Exception E4:** they hold only `criteria_author` ⇒ 403 `insufficient privilege` (AC-08.8).
- **Postcondition:** an ordinary template exists (or does not); no `criteria` row is affected.

### UC-3 — Restoring a system template after a bad edit
- **Actor:** `admin`, or `staff` with `rubric_template`. **Preconditions:** `cambridge_yl_a0_a2`
  exists and has been edited.
- **Main flow:** `POST /criteria/templates/cambridge_yl_a0_a2/reset` ⇒ 200; `rubric`/`locked`/`name`
  equal the seed again; `isActive` unchanged.
- **Alternative A1:** the target is an ordinary template ⇒ 409 (AC-18.3).
- **Exception E1:** the key does not exist ⇒ 404. **E2:** `isSystem` with no seed ⇒ 409 (AC-18.6).
- **Postcondition:** the seeded structure is back; `criteria` derived earlier are untouched (AC-18.7).

### UC-4 — Deleting a template that courses were built from
- **Actor:** `staff` with `rubric_template`. **Preconditions:** template `t` exists,
  `isSystem = false`; at least one `criteria` row has `templateKey = 't'`.
- **Main flow:** `DELETE /criteria/templates/t` ⇒ 204 → the `criteria` rows still read, still list,
  still grade, still export in reports; their `templateKey` is now an orphan string (AC-02.4).
- **Alternative A1:** `t.isSystem = true` ⇒ 409, row still present (AC-18/FR-16's table row).
- **Exception E1:** unknown key ⇒ 404.
- **Postcondition:** one fewer template row; zero rows changed in any other table.

### UC-5 — Admin grants a teacher content-authoring rights
- **Actor:** `admin`. **Preconditions:** the teacher has a `staff` account and is logged in.
- **Main flow:** Users screen → edit the teacher → tick "Nội dung chấm điểm" → save ⇒
  `PATCH /users/:id {privileges:['criteria_author']}` ⇒ 200 → the teacher's **existing session**
  can now `POST /criteria` (.docx) on the very next request (AC-08.10).
- **Alternative A1:** untick and save ⇒ next request 403.
- **Exception E1:** unknown privilege string ⇒ 400, row unchanged (AC-10.4).
- **Exception E2:** a `staff` user tries the same call ⇒ 403 `insufficient role` (AC-10.8).
- **Postcondition:** `dashboard_users.privileges` holds exactly the ticked set.

### UC-6 — Deploying F10 onto the live system (the lock-out scenario)
- **Actor:** DevOps / the migration. **Preconditions:** production has `staff` accounts that upload
  `.docx` today under `SessionAuthGuard` alone.
- **Main flow:** `prisma migrate deploy` → column added → `UPDATE` grants `criteria_author` to every
  `staff` row → the new build starts with `PrivilegeGuard` live → those users notice no change.
- **Alternative A1:** the migration is re-run ⇒ `UPDATE 0`, nothing changes (AC-03.3).
- **Exception E1:** an operator applies the code without the migration ⇒ Prisma fails on the missing
  column at first query; this is a hard failure, not a silent lock-out, and is acceptable.
- **Postcondition:** no existing user has lost a capability; new accounts start with `[]`.

---

## 4. Business rules

- **BR-01** `admin` implicitly holds every privilege; `privileges` on an admin row is ignored for
  authorisation (design §4.2). The role model stays exactly two roles — no third role is introduced.
- **BR-02** The two privileges are **independent**: `criteria_author` never implies `rubric_template`
  and vice versa. Someone needing both is granted both.
- **BR-03** **Read is open, write is gated.** No `GET` under `/criteria` gains a privilege check.
- **BR-04** `isSystem` is set **only** by the seeder. It confers exactly two differences and no
  others: delete is forbidden (409) and reset is permitted. Everything else — edit, hide, duplicate —
  behaves identically to an ordinary template.
- **BR-05** **Seeding writes only into an empty table.** An admin's edit must survive every restart,
  forever. The restore path is the explicit `reset` button, never an implicit boot-time overwrite.
- **BR-06** A template's `rubric` is stored **normalized** (v2 fixed point) and is also normalized on
  read, so `GET` is stable even for a row edited directly in the database.
- **BR-07** `criteria.rubric` is an **independent copy** taken at authoring time. Editing or deleting
  a template is never retroactive to `criteria` rows or to anything already graded.
- **BR-08** `Criteria.templateKey` is traceability only — a plain string, no FK, no `ON DELETE`, and
  an orphan value is a normal, expected state.
- **BR-09** A template `key` is immutable after creation (D-2). Renaming means duplicate + delete.
- **BR-10** `locked` constrains **content authoring only** (F12's `criteria_author` drawer). A holder
  of `rubric_template` — and any `admin` — edits every field including `locked` itself (design §11).
- **BR-11** `pronunciation` is a mandatory dimension of every authored rubric structure
  (architecture §3.10). Enforced at three points now: template write (F10), `.docx` upload (F8),
  grading (worker).
- **BR-12** A rubric whose `levels` do not tile `[minTotal .. maxTotal]` contiguously and without
  overlap cannot be saved. F9's `computeTotal` is deliberately forgiving at *grading* time
  (first-match-wins, `null` when unmatched); the strictness lives at *authoring* time.
- **BR-13** A rubric with a non-positive `scale.max` cannot be saved (F9-qa OBS-2): it is the one
  shape that makes a stored grading total disagree with the reported one.
- **BR-14** The two default templates are **not a closed set** — any number of additional templates
  may be created, and there is no cap or naming reservation beyond `key` uniqueness.

---

## 5. Data dictionary

### 5.1 `rubric_templates` (new table)

| Field (Prisma / column) | Type | Required | Default | Validation / notes |
| :-- | :-- | :-- | :-- | :-- |
| `id` / `id` | `Int` PK autoincrement | yes | — | Surrogate key; the API addresses rows by `key`. |
| `key` / `key` | `String` (`text`) **UNIQUE** | yes | — | Trimmed; `^[a-z0-9][a-z0-9_]{0,63}$`. Immutable after create (BR-09). |
| `name` / `name` | `String` | yes | — | Trimmed, 1..200 chars. Teacher-facing title. |
| `rubric` / `rubric` | `Json` | yes | — | A normalized **RubricV2** (12 top-level keys). Validated by FR-19. |
| `locked` / `locked` | `String[]` (`text[]`) | yes | `[]` | Each entry ∈ allow-list §5.4. Duplicates removed. |
| `isSystem` / `is_system` | `Boolean` | yes | `false` | Seeder-only. Blocks delete, enables reset. |
| `isActive` / `is_active` | `Boolean` | yes | `true` | `false` hides from the default list; nothing else. |
| `createdAt` / `created_at` | `DateTime` | yes | `now()` | |
| `updatedAt` / `updated_at` | `DateTime` | yes | `@updatedAt` | Advances on update/reset/toggle. |

### 5.2 Template response shape (all template endpoints)

`{ id: number, key: string, name: string, rubric: RubricV2, locked: string[], isSystem: boolean,
isActive: boolean, createdAt: ISO-8601 string, updatedAt: ISO-8601 string }`

### 5.3 Request DTOs

| DTO | Field | Type | Required | Validation |
| :-- | :-- | :-- | :-- | :-- |
| `CreateRubricTemplateDto` | `key` | string | yes | AC-14.7 regex, unique ⇒ else 409 |
| | `name` | string | yes | 1..200 after trim |
| | `rubric` | object | yes | plain object; FR-19 |
| | `locked` | string[] | no (`[]`) | each ∈ §5.4 |
| | `isActive` | boolean | no (`true`) | strict boolean |
| `DuplicateRubricTemplateDto` | `key` | string | yes | AC-14.7 regex, unique |
| | `name` | string | no | defaults to `"<source> (bản sao)"` |
| `UpdateRubricTemplateDto` | `name` | string | no | 1..200 after trim |
| | `rubric` | object | no | FR-19 when present |
| | `locked` | string[] | no | each ∈ §5.4 |
| `SetTemplateActiveDto` | `isActive` | boolean | yes | strict boolean |
| `CreateUserDto` (extended) | `privileges` | string[] | no (`[]`) | each ∈ §5.5 |
| `UpdateUserDto` (extended) | `privileges` | string[] | no (not written) | each ∈ §5.5; full replace |

### 5.4 `locked` allow-list (field paths a template may lock against content authors)

`scale` · `aggregation` · `levels` · `output_fields` · `dimensions[].key` · `dimensions[].weight` ·
`student_reply`. Any other value ⇒ 400. Both seeds ship with the first five (AC-04.12/AC-05.11).

### 5.5 `dashboard_users.privileges` values

`rubric_template` — create/duplicate/edit/delete/hide/reset **scoring structure** (all of FR-12…FR-18's
writes). `criteria_author` — author **scoring content** within a template's frame: band descriptions,
sub-factors, comment bank, tone; `.docx` upload; new criteria versions (F12's `POST /criteria/json`).
Anything else ⇒ 400 on write, ignored on read.

### 5.6 `criteria.template_key`

`String?` / `text NULL`. Traceability only; no FK, no index, orphan values expected (BR-08). Written
by F12, never by F10.

---

## 6. Endpoint summary (design §4.1 made executable)

| # | Method + path | Auth | Ordinary | `isSystem` | Success | Errors |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | `GET /criteria/templates?includeInactive=` | session | ✔ | ✔ | 200 `[]` | 401 |
| 2 | `GET /criteria/templates/:key` | session | ✔ | ✔ | 200 | 401, 404 |
| 3 | `POST /criteria/templates` | `rubric_template` | ✔ | n/a | **201** | 400, 401, 403, **409** dup key |
| 4 | `POST /criteria/templates/:key/duplicate` | `rubric_template` | ✔ | ✔ ⇒ copy is ordinary | **201** | 400, 401, 403, 404, **409** |
| 5 | `PUT /criteria/templates/:key` | `rubric_template` | ✔ | ✔ (every field) | 200 | 400, 401, 403, 404 |
| 6 | `DELETE /criteria/templates/:key` | `rubric_template` | ✔ hard delete | ✘ **409** | **204** | 401, 403, 404, **409** |
| 7 | `PATCH /criteria/templates/:key/active` | `rubric_template` | ✔ | ✔ | 200 | 400, 401, 403, 404 |
| 8 | `POST /criteria/templates/:key/reset` | `rubric_template` | ✘ **409** | ✔ from seed | 200 | 401, 403, 404, **409** |

*(Row 6's delete rules are specified by FR-16's neighbours; explicitly:* **AC-D.1** *ordinary ⇒ 204 and
the row is gone;* **AC-D.2** *`isSystem` ⇒ 409 `system templates cannot be deleted` and the row is
still readable via `GET …/:key`;* **AC-D.3** *unknown key ⇒ 404;* **AC-D.4** *deleting never touches
`criteria` — AC-02.4;* **AC-D.5** *auth `@RequiresPrivilege('rubric_template')`, `staff`+`[]` ⇒ 403.)*

---

## 7. Assumptions

- **A-1** The `locked` default list is the design doc's own §11 proposal, adopted by PM Assumption 1.
  It is data on a row, changeable at any time via endpoint 5 — no code change needed if the center's
  teachers decide differently (OQ-1).
- **A-2** A **template** is primarily a *structure*; band prose may be empty in a seed
  (design §4: "một rubric v2 với phần mô tả band để trống hoặc điền sẵn"). Consequently the seed ACs
  pin structure exactly and pin band text only where design §1.1 states it verbatim (AC-04.6). The
  BA could not open the source PDFs from this environment (`pdftoppm` unavailable), so design Phần 1
  is treated as the authoritative transcription; anything beyond it is backend transcription work
  with no AC attached.
- **A-3** `GET /auth/me` gaining `privileges` is additive and safe: the dashboard reads it as an
  object and ignores unknown fields.
- **A-4** Volume: single center, tens of templates, tens of dashboard users. No pagination, no
  caching layer, no index beyond `key` unique.
- **A-5** F12 will consume FR-19's validator and FR-11's `privileges` rather than re-deriving either.

## 8. Dependencies

- **F8** (`normalizeRubric`, v2 types) — hard dependency for BR-06, AC-06.1. DONE, QA-passed.
- **F9** (`computeTotal`, `maxTotal`, `validateLevels`, `lib/rubric-scoring.ts`) — hard dependency for
  FR-19 and the seed proof ACs. DONE, QA-passed.
- **F5** (Users screen + `/users` CRUD) — extended by FR-10/FR-21.
- **F4** (session auth) — `PrivilegeGuard` sits behind `SessionAuthGuard`; F4's session shape is
  deliberately left frozen (AC-11.5).
- **F12** (drawers) consumes F10's API; **F11** (Zalo buttons) consumes `student_reply` which F10
  only carries. Neither is in F10's scope.
- **DBA** is needed for the migration (new table + `text[]` column + the idempotent backfill).
  **DevOps is not needed** — no new env var, no compose change, no new container, no new port.
  **UX is not needed** — FR-21 is two checkboxes in an existing F5 form; the drawers are F12.

## 9. Deviations from PM wording (read these before filing a defect)

- **D-1** `PrivilegeGuard` reads `role`/`privileges` **from Postgres per request**, not from
  `session.user` (which is how `RolesGuard` reads `role`). Rationale: privileges are granted
  mid-session by an admin; a session copy would silently require the teacher to log out and back in,
  and there is no mechanism to mutate another user's live session. Cost is one PK lookup on write
  routes only. The `@RequiresPrivilege`/guard *shape* still mirrors `@Roles`/`RolesGuard` exactly, as
  design §4.2 requires.
- **D-2** Template `key` is **immutable** after creation, although design §4.1 says system templates
  are editable "in every field". Rationale: `reset` resolves the seed **by key**, and
  `criteria.templateKey` traceability is by key; a rename would break both silently. Renaming is
  available as duplicate-under-a-new-key + delete. If the project owner objects, the change is small.
- **D-3** FR-19 rejects a template without a `pronunciation` dimension (400). PM did not state this;
  it follows from architecture §3.10 + F8's existing `.docx` gate + the worker's grade-time gate.
  Allowing it would let someone save a structure guaranteed to fail at grading time.
- **D-4** `reset` restores `name` in addition to `rubric` and `locked` (PM's US2 names only the latter
  two). Rationale: `name` is part of the seed definition and "khôi phục bản gốc" that leaves a
  renamed title behind would surprise. `isActive` is deliberately **not** restored — hiding is an
  operational state, not seed content.
- **D-5** F9-ba.md's **AC-07.5 is factually wrong** (a total of 14 is `A1-`, not `A0`), as F9-qa's
  OBS-1 filed against BA. Recorded here for the record; F9's code and tests are correct and F10's
  AC-04.10 uses the independently-correct 18 ⇒ `A1` case.

## 10. Open questions (none blocking)

- **OQ-1** Exact `locked` list on the two defaults — a business decision the design doc itself defers
  to the center's teachers. Proceeding with §11's proposal (A-1). Cheap to change: it is row data.
- **OQ-2** Should `DELETE` on an ordinary template that is referenced by ≥ 1 `criteria` row warn
  (e.g. return a count) rather than silently succeed? Spec says silently succeed (BR-07/BR-08); F12's
  confirmation dialog is where the "các tiêu chí đã soạn từ nó không bị ảnh hưởng" reassurance lives
  (design §7). Revisit only if the owner asks.
- **OQ-3** `student_reply` is carried on template rubrics but consumed by F11. F10 stores it and
  applies no validation beyond `normalizeRubric`. If F11 needs a closed action list, that validation
  belongs in F11's ACs, not here.

---

## Outputs (what this role produced)

- **`docs/dev-team-roles/tasks/F10-ba.md`** (this file) — the functional spec Dev and QA build
  against: **22 FRs, ~150 numbered ACs**, 12 NFRs, 6 use cases, 14 business rules, a 6-part data
  dictionary, an 8-row endpoint/status-code table, 5 assumptions, 5 recorded deviations, 3 open
  questions.
- Files the implementation is expected to touch (for the orchestrator's planning, not a design):
  new — `criteria/templates/{cambridge-yl,ielts-speaking}.seed.ts` + `index.ts`,
  `criteria/bootstrap-rubric-templates.service.ts`, `criteria/rubric-template.{service,controller}.ts`
  + `dto/`, `criteria/rubric-validation.ts`, `auth/{privileges.ts,privilege.decorator.ts,privilege.guard.ts}`,
  one Prisma migration; changed — `prisma/schema.prisma`, `criteria/{criteria.controller,criteria.module}.ts`,
  `users/{users.controller,users.service}.ts` + `dto/{create,update}-user.dto.ts`,
  `auth/{auth.controller,auth.module}.ts`, `lib/rubric-scoring.spec.ts` (fixtures → seed imports),
  `dashboard/src/pages/Users.tsx`, `dashboard/src/i18n/index.ts`.

## Blockers / open questions

None blocking. Three non-blocking open questions in §10; five deviations from PM/design wording,
each with rationale, in §9.

## Notes for the next role

- **Backend:** the three ACs most likely to be got wrong are **AC-20.2** (route order — assert 200,
  not "no 400 from `ParseIntPipe`", by actually calling `GET /criteria/templates`), **AC-06.3**
  (delete `rubric-scoring.spec.ts`'s hand-built `KID_RUBRIC`/`IELTS_RUBRIC` and import the seeds —
  its existing assertions must still pass untouched), and **AC-07.3** (mutate-then-reboot must not
  revert). `validateLevels` is imported from `lib/rubric-scoring.ts`; do not re-implement it.
- **DBA:** one migration, three objects — `CREATE TABLE rubric_templates` (one unique index on `key`,
  no FK), `ALTER TABLE criteria ADD template_key text NULL` (no FK — that is the point),
  `ALTER TABLE dashboard_users ADD privileges text[] NOT NULL DEFAULT '{}'` followed by the guarded
  idempotent `UPDATE … WHERE role='staff' AND NOT ('criteria_author' = ANY(privileges))`.
- **QA:** design §10 items 2–4 map to AC-07.1/07.3, AC-18.4, the endpoint table's every cell, and
  **AC-02.4** (delete a template, prove derived `criteria` still read *and grade*) — that last one is
  the feature's single most important test. The privilege matrix is AC-09.3 + AC-08.6/08.7/08.8 +
  AC-08.10 (grant takes effect without re-login). The migration backfill is AC-03.4 on a real
  Postgres, F9-style.
- **Frontend:** FR-21 only (two checkboxes + i18n in both blocks). `GET /auth/me` now returns
  `privileges`, with admins receiving the full set (AC-11.2) so no client-side admin-bypass logic is
  needed. The drawers are F12.
