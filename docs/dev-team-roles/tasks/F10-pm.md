# F10 · PM — Seeded default rubric templates + bootstrap seeder + template CRUD + 2 privileges

- **Owner role:** pm
- **Feature:** F10 — New `RubricTemplate` table seeded with two default templates (Cambridge YL, IELTS Speaking) transcribed from `Criteria-Source/*.pdf`, seeded once via a `BootstrapAdminService`-style seeder; full CRUD on templates (`criteria/rubric-template.{service,controller}.ts`); two new independent `DashboardUser.privileges` (`rubric_template`, `criteria_author`) enforced by a new `PrivilegeGuard`; migration backfill granting `criteria_author` to all existing `staff` users (regression-risk item); small Users-screen checkbox addition.
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** `F8-pm.md` (v2 schema/normalizeRubric — seeds are authored directly in v2), `F9-pm.md` (`computeTotal`/level-range validation used both to prove the seeds reproduce the source PDFs and to validate `levels` on template writes)

## Inputs (what this role received)

- Design doc Part 1 (source-PDF tables, used verbatim as seed content), Part 4 (template table, CRUD table 4.1, privilege table, migration warning), Part 7 mentions of what the templates list looks like (informs API shape, not this feature's UI — that's F12), Part 8 (file scope: `criteria/templates/*.seed.ts`, `bootstrap-rubric-templates.service.ts`, `auth/privilege.guard.ts`), Part 10 items 2–4 (mandatory tests: seed-once, seed-doesn't-overwrite, full CRUD lifecycle incl. 409s, delete-doesn't-break-derived-criteria, privilege matrix, migration backfill test), Part 11 ("làm sớm vì nó là fixture cho mọi test sau").
- Code read: `services/core-api/src/auth/roles.guard.ts` (existing `@Roles()`/`RolesGuard` pattern — `@RequiresPrivilege`/`PrivilegeGuard` should mirror this shape) and `session.types.ts`'s 2-role model (confirmed: no third role, `admin`/`staff` only).
- `services/core-api/prisma/schema.prisma` — current `Criteria` model (no `templateKey` today), `DashboardUser` model (no `privileges` column today), confirming the "adds a plain traceability string, not an FK" design decision (Part 4: "`PilotTextGrading.criteriaId` cũng lưu id thô, không có quan hệ" — an existing precedent in this exact schema, from F2).
- `docs/dev-team-roles/PROGRESS.md` — no conflicting role/privilege decisions from F1–F7; F5 (user management) is the existing Users screen this feature extends with 2 checkboxes.

## Checklist

- [x] Read design doc Part 1 (source content), Part 4 (table/CRUD/privilege spec), Part 10 items 2–4 (test requirements)
- [x] Read `roles.guard.ts` to confirm the guard pattern F10's `PrivilegeGuard` should mirror
- [x] Read current `Criteria`/`DashboardUser` Prisma models to scope the migration
- [x] Write user stories + acceptance criteria (MoSCoW), explicitly encoding the staff-lockout regression risk as its own Must-Have AC
- [x] Define in/out of scope, assumptions (incl. the `locked` field-list open question)

## Outputs

### User stories (MoSCoW)

**US1 (Must) — two default templates, seeded as data.**
As the project owner, I want the system to ship with two ready-to-use default rubric templates (`cambridge_yl_a0_a2`, `ielts_speaking`), faithfully transcribed from the two source PDFs, so a center can grade immediately without authoring a rubric from scratch — and so the defaults are editable data, never hardcoded into the grading path.
- Given `rubric_templates` is empty at boot, when the bootstrap seeder runs (same pattern as `BootstrapAdminService`), then exactly 2 rows are created: `key=cambridge_yl_a0_a2` (`isSystem=true`, `aggregation.method="sum"`, 5 dimensions scale 0–5, `levels`= the 4 KID bands 0-10/11-15/16-20/21-25 from Part 1.1) and `key=ielts_speaking` (`isSystem=true`, `aggregation.method="average"`, 4 dimensions scale 0–9, `output_fields:["comment","fix"]`).
- Given `criteria/templates/*.seed.ts` is the ONLY copy of these definitions (used both as live seed data and as the test fixture — Part 10 item 2: no second copy under `__fixtures__`), when the seeds are run through F8's `normalizeRubric` + F9's `computeTotal`, then they reproduce the exact source-PDF tables (KID max=25, correct 4 level bands; IELTS 4 dims band 0–9 averaged).
- Given the table already has rows (e.g. an admin previously edited a seeded template), when the app restarts, then the seeder makes ZERO writes — an admin's edits must never be silently reverted by a restart. Explicit regression test: seed once, mutate a seeded row, restart, assert unchanged.

**US2 (Must) — full CRUD on templates, per Part 4.1's table.**
As a person with the `rubric_template` privilege, I want to list, view, create, duplicate, edit, delete, hide/show, and reset-to-seed any template, so my center can maintain scoring structures beyond the two defaults (they are explicitly NOT a closed set).
- `GET /criteria/templates?includeInactive=` and `GET /criteria/templates/:key`: available to ANY authenticated staff/admin — reads are NOT privilege-gated (doc: "Quyền đọc vẫn mở cho mọi staff như cũ").
- `POST /criteria/templates`: creates an ordinary (`isSystem=false`) template from a blank slate; requires `rubric_template` or admin.
- `POST /criteria/templates/:key/duplicate`: works on ANY template incl. `isSystem` ones; result is ALWAYS `isSystem=false` (and thus deletable) with a new caller-supplied unique `key`.
- `PUT /criteria/templates/:key`: edits every field, including on `isSystem` rows (bypasses that row's own `locked` list — `locked` only constrains ordinary content-authoring via `criteria_author`, not privileged structure edits).
- `DELETE /criteria/templates/:key`: hard-deletes an ordinary template; on `isSystem` → 409, row untouched.
- `PATCH /criteria/templates/:key/active`: toggles `isActive` on any template.
- `POST /criteria/templates/:key/reset`: on `isSystem`, overwrites `rubric`/`locked` back to the seed definition; on ordinary → 409.
- `key` collision on create/duplicate → 409.
- **Route-ordering AC (explicit, not implementation trivia):** all string-literal template routes MUST be declared before any existing `@Get(':id')` numeric route in `criteria.controller.ts` — a test hitting `GET /criteria/templates` must NOT be intercepted by `ParseIntPipe` and 400.
- **Most-important AC (per design doc Part 10 item 3):** given `criteria` rows exist with `templateKey` pointing at a template that has since been deleted, when those `criteria` are read or graded, then everything works exactly as before — `Criteria.templateKey` is a plain traceability string, NOT a foreign key, no `ON DELETE` behavior of any kind.

**US3 (Must) — two independent privileges, enforced by a new guard.**
As an admin, I want `rubric_template` (structure) and `criteria_author` (content) as two independent entries in `DashboardUser.privileges String[]`, enforced by `PrivilegeGuard`/`@RequiresPrivilege` (mirroring the existing `RolesGuard`/`@Roles` pattern), so I can grant a teacher content-authoring rights without letting them redefine scoring structure — without adding a third role.
- `admin` bypasses every privilege check regardless of `privileges` contents (unchanged 2-role model — `admin`/`staff` only).
- `staff` with `privileges:[]` → 403 on any privilege-gated write route.
- `staff` with only `criteria_author` → 403 on `rubric_template`-gated routes (US2's structure CRUD), succeeds on content-authoring routes (`.docx` upload, `POST /criteria/json` from F12).
- `staff` with only `rubric_template` → the inverse.

**US4 (Must) — migration must not lock out existing staff (explicit regression AC).**
As an existing `staff` user who can upload `.docx` rubrics today (gated only by `SessionAuthGuard`, no privilege check exists yet), I want to retain that ability the moment this feature deploys, so I'm not silently locked out.
- The SAME migration that adds `DashboardUser.privileges` includes `UPDATE dashboard_users SET privileges = ARRAY['criteria_author'] WHERE role = 'staff'`.
- Test: seed/simulate a pre-migration `staff` row, run the migration, assert `privileges` now contains `criteria_author`.
- NEW `staff` accounts created AFTER this migration (via F5's existing create-user flow) default to `privileges:[]` — the backfill is one-time, not an ongoing default.
- The existing `.docx` upload route, post-migration, requires only `criteria_author` or admin — for already-migrated staff, this is byte-for-byte the same allowed/denied outcome as before deploy.

**US5 (Should) — Users-screen privilege checkboxes.**
As an admin, I want two checkboxes on the existing Users screen (F5's `pages/Users.tsx`) to grant/revoke the two privileges, so I don't need a direct DB edit.
- Editing a `staff` user shows "Cấu trúc chấm điểm" (`rubric_template`) / "Nội dung chấm điểm" (`criteria_author`) checkboxes, persisted via the existing user-update endpoint extended with a `privileges` field.
- Editing an `admin` user: checkboxes hidden or disabled (admin already has everything; showing them would be confusing, not functional).
- vi/en i18n for both labels.

### In scope
- `RubricTemplate` Prisma model + migration.
- `criteria/templates/cambridge-yl.seed.ts`, `criteria/templates/ielts-speaking.seed.ts`, `criteria/bootstrap-rubric-templates.service.ts`.
- `criteria/rubric-template.{service,controller}.ts` — the 7 routes of table 4.1.
- `auth/privilege.guard.ts` + `@RequiresPrivilege`.
- `Criteria.templateKey String?` column (traceability only).
- `DashboardUser.privileges String[] @default([])` + the one-time `UPDATE` backfill, same migration.
- Small `Users.tsx` checkbox addition + i18n.

### Out of scope
- The actual template-editing DRAWER UI (Drawer 1) and content-editing UI (Drawer 2) — F12. This feature ships a fully usable API; F10's own QA/e2e exercises it via curl/Postman per the design doc's own "chưa cần khóa LLM" e2e approach (Part 10 item 6), same as prior features did before their UI landed.
- Zalo buttons (F11).
- `computeTotal`/schema v2 themselves (F8/F9 — already done, F10 only consumes them).

### Assumptions
1. **`locked` field list on the two default templates**: PM adopts the design doc's own proposal (Part 11, second open question) — `key`, `scale`, `aggregation`, `levels`, `output_fields` locked by default for BOTH seeded templates. This is explicitly flagged by the design doc itself as "a business decision, ask the center's teachers to confirm" — proceeding with the doc's own suggested default per this run's instruction not to block on it. `locked` only constrains ordinary `criteria_author` content-editing (F12); admin/`rubric_template` holders can edit `locked` itself via US2's `PUT`.
2. Two default templates are NOT a closed set — arbitrary additional templates (Writing rubric, internal mock-test rubric, etc.) are first-class or­dinary templates via US2, no cap.
3. `PrivilegeGuard` sits alongside (not replacing) `SessionAuthGuard`/`RolesGuard` — a route can require both a role AND a privilege, or just a privilege; this feature only builds the privilege layer, existing role-gating on other routes is untouched.

## Blockers / open questions

1. Exact `locked` list is a business decision the design doc itself defers to the center's teachers — PM proceeds with the doc's own suggested default (see Assumption 1) rather than blocking. Not escalating; cheap to change later since `locked` is just data on each template row, editable via US2.

## Notes for the next role

BA/DBA: the "make it the fixture, not a second copy" rule for the seed files (Part 10 item 2) is a hard constraint — don't let a fixtures folder accidentally duplicate the seed content. Backend: route-declaration order in `criteria.controller.ts` (string routes before `:id`) is a real, previously-seen NestJS footgun — call it out in code review, not just tests. Frontend (checkbox, US5 only — Drawer UI is F12): reuse F5's existing user-edit form patterns verbatim, this is a small addition, not a new screen.
