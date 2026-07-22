<!--
  Per-feature-per-role task file, OWNED by the QA agent.
  docs/dev-team-roles/tasks/F5-qa.md
-->

# F5 · QA — Dashboard user management (create user / admin reset / change-password entry)

- **Owner role:** qa
- **Feature:** F5 — admin-only `users/` core-api module (`GET/POST /users`, `POST /users/:id/reset-password`) + `/users` dashboard screen + sidebar change-password entry with conditional Cancel.
- **Status:** DONE  <!-- Round 1 PASS, no defects -->
- **Last updated:** 2026-07-22
- **Depends on:** `F5-ba.md` (35 ACs, test basis), `F5-pm.md`, `F5-ux.md`, `F5-backend.md` (deviation), `F5-frontend.md`, `F4-qa.md` (jsdom harness technique)

## Inputs
- 35 numbered ACs in F5-ba.md §10; §2 security NFRs are the priority section.
- Orchestrator deviation (F5-backend.md): email stored verbatim + case-insensitive uniqueness at create → 409; login path frozen. AC-06 (lowercase-on-store) deliberately superseded.
- Backend claims 25 suites / 155 tests (F4 baseline 22/117). Frontend claims i18n 151/151, dashboard build clean.

## Checklist
- [x] Read protocol + all upstream F5 task files + F4-qa round-2 record
- [x] Line-by-line source audit: users.service/controller/module, DTOs (security ACs)
- [x] Confirm AuthService.validate / login path frozen; email verbatim; CI-dup → 409
- [x] Frontend source audit: Users.tsx, App.tsx, ChangePassword.tsx (own-row, gate, Cancel)
- [x] Confirm scope: no F5 migration, schema unchanged, no queue/contract changes
- [x] Run core-api suite (prisma:generate + build + jest --maxWorkers=2) → 25 suites / 155 tests
- [x] Write + run 7 QA-derived boundary/negative/security jest tests (temp, removed after)
- [x] Run dashboard build (tsc+vite) → clean, 82 modules
- [x] jsdom harness (24 checks) for the [B] ACs — all pass
- [x] Regression: zalo-gateway 26, grading-worker 60
- [x] i18n parity / dead-key / undefined-key / hardcoded-string audit → 151/151, 0 real dead
- [x] Verdict + Status

## Outputs

### Suite results (all Docker, no Node on host)
| Suite | Command | Result |
|---|---|---|
| core-api jest | `npm ci && prisma:generate && build && test --maxWorkers=2` | **25 suites / 155 tests passed** (F4 baseline 22/117; +3/+38, 0 regressions) |
| core-api build | `tsc -p tsconfig.build.json` | clean, 0 errors |
| dashboard build | `tsc -b && vite build` | clean, 0 errors, 82 modules, 294.57 kB / 90.25 kB gzip |
| zalo-gateway jest | `npm ci && test --maxWorkers=2` | **5 suites / 26 tests** (baseline) |
| grading-worker pytest | `pip install -e .[dev] && pytest -q` | **60 passed** (baseline) |
| QA jest extras | temp `src/users/__qa_f5_tmp.spec.ts`, deleted after | **7/7 passed** |
| QA jsdom harness | throwaway esbuild+jsdom `__qa/`, deleted after | **24/24 checks passed** |

### Security review (priority — read line by line, all PASS)
- **NFR-S1 no hash leak**: `USER_SELECT` = exactly `{id,email,role,mustChangePassword,createdAt}` passed to `findMany`/`create`/`update` — `passwordHash` never selected/loaded. `UserView` never carries it. Verified in source + `JSON.stringify` key-set assertions.
- **NFR-S2 guards**: `UsersController` class-level `@UseGuards(SessionAuthGuard, RolesGuard) @Roles('admin')`; metadata spec proves `__guards__` order (Session before Roles), `ROLES_KEY===['admin']`, and **no per-handler metadata widens it**. Staff→403 `insufficient role`, anon→401 `login required` on all 3 routes.
- **NFR-S3 no logging**: static scan of `src/users/**` — zero `console.`/`Logger`/`logger.`; `main.ts` has no request-logging middleware/interceptor.
- **NFR-S4 cost 12**: create + reset hashes match `/^\$2[aby]\$12\$/`; `SALT_ROUNDS=12`.
- **NFR-S5 force-flag**: create + reset always persist `mustChangePassword:true`, never read from body (confirmed: body `{mustChangePassword:false}` still stores `true`).
- **NFR-S6 no mass assignment**: create `data` keys exactly `[email,mustChangePassword,passwordHash,role]`; reset `data` exactly `[mustChangePassword,passwordHash]` — no `role`/`email`/`id`; `ValidationPipe({whitelist:true})` strips smuggled props (incl. a `role` in the reset body).
- **NFR-S9 self-reset 400**: `:id===session.id` → 400 `cannot reset your own password`, **short-circuits before any DB read** (my QA test: `findUnique` not called, `update` not called). Own-row Reset control also suppressed client-side (matched by email).
- **§2.7 no session eviction on reset**: `UsersService` has only a Prisma dependency (`.length===1`, `Object.keys(prisma)===['dashboardUser']`); reset makes no Redis/session call. Asserted as intended behavior — did **not** assert the inverse.
- **NFR-S10 no destructive routes**: route inventory = exactly `GET /`, `POST /`, `POST /:id/reset-password`; no `@Delete`/`@Put`/`@Patch` decorator anywhere in `src/users/**`.
- **Deviation (orchestrator-directed, NOT a defect)**: email stored **verbatim**; case-insensitive duplicate → **409** (pre-flight `findFirst mode:'insensitive'` + P2002 catch, same shape); `AuthService.validate` is the frozen F4 case-sensitive `findUnique({where:{email}})` — untouched. F5-ba AC-06 (lowercase-on-store) correctly superseded; its replacement tests verified. Residual check-then-act race is accepted backlog.

### Frontend (24/24 jsdom harness)
Own-row reset suppression by email (AC-28); create issues one POST, disables submit, clears all 3 fields, shows success naming the email, refetches (AC-26); 409→`users.emailExists` with values retained (AC-27, status-only mapping); reset reveal/confirm one POST + refetch, cancel zero API calls (AC-29); Cancel present iff `!mustChangePassword` (AC-31); Cancel/success navigate to `state.from` else `/students` (AC-32); staff redirected off `/users`, admin renders it (AC-24); nav Users item admin-only in both renderings (AC-25); sidebar Change-password control present with accessible name, navigates to `/change-password` (AC-30).

### i18n
151/151 vi↔en parity, 0 missing either side, 0 undefined refs, 0 hardcoded user-facing strings. The 5 `users.{emailExists,invalid,notFound,forbidden,error}` keys are referenced **dynamically** via `mapErrorToKey()` → `t(...)` — not dead (naive literal-only regex false positive, same class as F4's `monitoring.diskAlert`).

### Frozen / scope (all PASS)
`AuthService.validate` frozen (case-sensitive F4 version); `Login.tsx` untouched (absent from git status); `ProtectedShell` gate body order `loading→!user→mustChangePassword→adminOnly` intact (`App.tsx:145-152`); `/change-password` Cancel hidden when forced; catch-all route still last; no `contracts.*` change; **no F5 migration** (latest is F4's `20260722110000`); `DashboardUser` schema unchanged; `infra/.env` untouched (mtime 2026-07-19, git-ignored). Files changed by F5: backend `app.module.ts` + new `src/users/**`; frontend new `Users.tsx`, modified `App.tsx`/`icons.tsx`/`i18n/index.ts`/`ChangePassword.tsx`. QA left the tree source-only (all scratch artifacts deleted).

### Unverified-in-this-environment (NOT defects)
AC-35 live-stack end-to-end (admin creates user → first login → forced `/change-password` → `/students`) needs `docker compose up` + owner secrets in `infra/.env`; and visual/CSS correctness — no browser here. Stated plainly per protocol.

## Blockers / open questions
None. Carry-forwards (owner awareness, already raised by BA, not F5 defects): (Q2) login remains case-sensitive on email — deviation removes the trap but a full fix touches frozen `validate()`; (Q3/§2.7) admin reset leaves ≤8h residual access with no delete/deactivate endpoint.

## Notes for the next role
F5 passes clean on round 1 — no defects. Security-critical surface (no hash leak, admin-only guards, no mass assignment, self-reset short-circuit, no destructive routes, no session-store coupling) verified from source + 155 core-api tests + 7 QA extras. Frontend verified via 24-check jsdom harness. All 3 regression suites at baseline.

QA_RESULT: PASS
