<!--
  Per-feature-per-role task file, OWNED by the Backend agent.
  docs/dev-team-roles/tasks/F5-backend.md
-->

# F5 · Backend — Dashboard user management (core-api `users/` module)

- **Owner role:** backend
- **Feature:** F5 — admin-only `GET /users`, `POST /users`, `POST /users/:id/reset-password`, reusing F4's `mustChangePassword` mechanism.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F5-ba.md` (authoritative contract, 35 ACs), `F5-pm.md`, `F4-backend.md` (auth code as shipped), `F4-ba.md` (frozen behavior)

## Inputs (what this role received)

- **F5-ba.md** §1 exact API contract (3 endpoints, `UserView` projection, all status codes), §2 security NFR-S1..S10 (testable), §8.1 per-file backend inventory, §9 frozen-behavior list, §10 ACs (AC-01..AC-23 are `[U]`, backend-owned), §12 "schema impact: NONE".
- **Orchestrator deviation from F5-ba.md §7/BR-3** (supersedes the spec's `trim().toLowerCase()` on store, which AC-06 asserts):
  - store the email **exactly as typed** (no lowercasing, no normalization);
  - enforce **case-insensitive uniqueness at create time**, same 409 shape as an exact duplicate;
  - do **NOT** touch `AuthService.validate` or any login path.
  Rationale: F5-ba.md §15 Q2 — `validate()` is case-sensitive on email, so lowercasing on store would silently hand out an unusable login for `GiaoVien@ilm.local`.
- **Code read as shipped:** `src/auth/{auth.service,auth.controller,session-auth.guard,roles.guard,roles.decorator,session.types,bootstrap-admin.service}.ts`, `src/auth/dto/*`, `src/settings/settings.controller.ts` (admin-gated controller precedent), `src/students/*` (list/DTO precedent), `src/monitoring/monitoring.module.ts` (no guard providers needed), `src/main.ts` (`ValidationPipe({whitelist:true, transform:true})`, no request logger), `prisma/schema.prisma` `DashboardUser`.

## Checklist

- [x] Read TASK-PROTOCOL, F5-ba.md, F5-pm.md, F4-backend.md, shipped auth/settings/students/monitoring code
- [x] Create this task file (IN_PROGRESS)
- [x] DBA coordination: confirm zero schema change (F5-ba §12) and record why the CI-uniqueness deviation stays in the app layer
- [x] `src/users/dto/create-user.dto.ts` + `src/users/dto/reset-password.dto.ts`
- [x] `src/users/users.service.ts` (USER_SELECT projection, SALT_ROUNDS=12, P2002→409, CI-duplicate→409, 404, BR-5 self-reset→400)
- [x] `src/users/users.controller.ts` (class-level `SessionAuthGuard`+`RolesGuard`+`@Roles('admin')`)
- [x] `src/users/users.module.ts` + register in `src/app.module.ts`
- [x] Unit tests for every `[U]` AC (AC-01..AC-05, AC-07..AC-23; AC-06 replaced by the deviation's tests)
- [x] Docker: `npm ci` → `prisma:generate` → `build` → `test --maxWorkers=2` (baseline 22 suites/117 tests must stay green)
- [x] Fill Outputs with the exact frontend API contract; Status DONE

## Outputs (what this role produced)

### API contract (authoritative for the frontend)

Base path `/users` on core-api; the SPA reaches it as `/api/users`. JSON in / JSON out.
Auth = the existing `express-session` cookie. **All three routes** carry class-level
`@UseGuards(SessionAuthGuard, RolesGuard) @Roles('admin')` — no method opts out.

| Method | Path (SPA) | Auth | Request body | Success |
|---|---|---|---|---|
| GET | `/api/users` | session + admin | — | `200` `UserView[]` |
| POST | `/api/users` | session + admin | `{ email, role, password }` | `201` `UserView` |
| POST | `/api/users/:id/reset-password` | session + admin | `{ newPassword }` | `200` `UserView` |

```ts
interface UserView {
  id: number;
  email: string;
  role: 'admin' | 'staff';
  mustChangePassword: boolean;
  createdAt: string; // ISO-8601
}
```
`UserView` is produced by a Prisma `select` — `passwordHash` is never loaded, never returned.

**`GET /api/users`** — no query params, unpaginated, ordered `createdAt` ascending.
- `200` → `[{ "id":1, "email":"admin@ilm.local", "role":"admin", "mustChangePassword":false, "createdAt":"2026-07-22T09:00:00.000Z" }, ...]`
- `401` → `{ "statusCode":401, "message":"login required", "error":"Unauthorized" }`
- `403` (staff session) → `{ "statusCode":403, "message":"insufficient role", "error":"Forbidden" }`

**`POST /api/users`** — `{ "email": string (IsEmail), "role": "admin"|"staff", "password": string (min 8) }`.
- `201` → the new `UserView`, always `"mustChangePassword": true` (server-set; never read from the body).
  Side effects: exactly one `dashboard_users` row, `password_hash = bcrypt(password, 12)`. No session/Redis/queue effect.
- `400` → `{ "statusCode":400, "message":[...], "error":"Bad Request" }` — bad email, password < 8/missing/non-string, role not exactly `admin`/`staff`.
- `401` / `403` as above.
- `409` → `{ "statusCode":409, "message":"email already exists", "error":"Conflict" }` — raised for an
  **exact** duplicate (Prisma `P2002`, DB-authoritative) **and** for a case-insensitive duplicate
  (`GiaoVien@ilm.local` when `giaovien@ilm.local` exists). Same body either way.
- Email is stored **exactly as typed** (deviation) — the frontend should display the stored value so an
  admin communicates the exact string that will work at login.

**`POST /api/users/:id/reset-password`** — `{ "newPassword": string (min 8) }`. No `currentPassword` by design.
- `200` → the target's `UserView`, always `"mustChangePassword": true`.
  Side effects: exactly two columns written — `password_hash = bcrypt(newPassword, 12)` and `must_change_password = true`.
  The target's **live sessions are deliberately NOT invalidated** (F5-ba §2.7) — residual access ≤ 8 h.
- `400` → validation envelope; **or** `{ "statusCode":400, "message":"cannot reset your own password", "error":"Bad Request" }`
  when `:id` equals the calling admin's own session id (self-service must go through `POST /auth/change-password`).
  Also `400` from `ParseIntPipe` for a non-numeric `:id`.
- `401` / `403` as above.
- `404` → `{ "statusCode":404, "message":"user not found", "error":"Not Found" }`.

**No `PATCH`/`PUT`/`DELETE` exists in this module** — no role edit, no email edit, no delete/deactivate (BR-7, NFR-S10).

Frontend maps errors by **HTTP status only** (`api/client.ts` never parses the body):
409 → `users.emailExists`, 400 → `users.invalid`, 403 → `users.forbidden`, 404 → `users.notFound`, other → `users.error`.

### Deviation from F5-ba.md (recorded, orchestrator-directed)

| F5-ba.md said | Implemented instead | Why |
|---|---|---|
| BR-3 / §7.1 / **AC-06**: store `email.trim().toLowerCase()` | Store the email **verbatim** as the admin typed it | `AuthService.validate` does `findUnique({ where: { email } })` on the raw input and is frozen. Lowercasing on store + case-sensitive login = an account whose advertised address silently 401s. |
| (implicit) uniqueness = the DB `@unique` index only | Uniqueness is **case-insensitive**: a pre-flight `findFirst({ where: { email: { equals, mode: 'insensitive' } } })` → 409, *plus* the P2002 catch → 409 | Prevents `GiaoVien@…` and `giaovien@…` both existing, which under case-sensitive login would be two distinguishable accounts and a support nightmare. Same 409 shape, so the frontend contract in §1.4 is unchanged. |

- `AuthService.validate`, `auth.controller.ts` and the whole login path are **byte-identical** to F4 — login semantics unchanged, all F4 auth specs untouched and green.
- **AC-06 as written in F5-ba.md is intentionally not implemented.** Its replacement tests
  (`users.service.spec.ts` → "stores the email exactly as typed" + the two CI-duplicate cases) assert the deviation.
  QA should treat those as the AC-06 substitutes, not as a defect.
- **Residual (documented, accepted):** the CI check is check-then-act, so two *simultaneous* creates of
  case-differing emails could both pass. Closing it needs `CREATE UNIQUE INDEX ... (lower(email))`, i.e. a
  migration — and `prisma/schema.prisma` + `prisma/migrations/**` are on F5-ba §8.1's zero-diff list. Given an
  admin-only endpoint and a < 20-row table, the app-layer check is the right trade; the DB functional index is
  noted for the DBA as an optional future hardening (see "Notes for the next role").

### Files changed (absolute paths)

- `D:/TTTA/services/core-api/src/users/users.controller.ts` — **A** — `@Controller('users')` + class-level `SessionAuthGuard`/`RolesGuard`/`@Roles('admin')`; 3 handlers; passes the acting admin's session id into the service so BR-5 is unit-testable without a mock Request.
- `D:/TTTA/services/core-api/src/users/users.service.ts` — **A** — `USER_SELECT` projection, `SALT_ROUNDS = 12`, `list()`, `create()`, `resetPassword(targetId, actingAdminId, newPassword)`; P2002 → 409, CI duplicate → 409, missing target/P2025 → 404, self-target → 400 before any write.
- `D:/TTTA/services/core-api/src/users/users.module.ts` — **A** — controller + service only; no imports, no guard providers (`monitoring.module.ts` precedent).
- `D:/TTTA/services/core-api/src/users/dto/create-user.dto.ts` — **A** — `@IsEmail`, `@IsIn(['admin','staff'])`, `@IsString @MinLength(8)`.
- `D:/TTTA/services/core-api/src/users/dto/reset-password.dto.ts` — **A** — `@IsString @MinLength(8)` on `newPassword`; no `currentPassword` field (BR-4).
- `D:/TTTA/services/core-api/src/users/users.service.spec.ts` — **A** — 16 cases (AC-01/02/04/05/07/12/14/15/16/22/23 + NFR-S4/S5/S6 + the two deviation cases + P2025).
- `D:/TTTA/services/core-api/src/users/users.controller.spec.ts` — **A** — 11 cases (AC-03 metadata, AC-17 route inventory + no destructive verb, AC-18 static log scan, AC-19/AC-20 guard behavior, handler delegation).
- `D:/TTTA/services/core-api/src/users/dto/users.dto.spec.ts` — **A** — 11 cases (AC-08 whitelist/mass-assignment, AC-09/AC-13 BVA, AC-10, AC-11, email-case deviation, no `currentPassword`).
- `D:/TTTA/services/core-api/src/app.module.ts` — **M** — one import + `UsersModule` in `imports`. Nothing else.

**Zero diff from F5** — verified with `git diff --stat -- services/core-api`: the only tracked file this
run touched is `src/app.module.ts` (2 insertions). Everything under `src/auth/**`, `prisma/schema.prisma`,
`prisma/migrations/**`, `src/main.ts`, all three `contracts.*` files and `package.json` / `package-lock.json`
is untouched by F5. (The `src/auth/**` + `schema.prisma` modifications visible in `git status` are **F4's**,
still uncommitted from the previous feature — byte-identical to what F4 handed over.)

### Build / test results (Docker, `node:24-alpine`, bind-mounted service dir)

- `npm ci` — plain, as documented in CLAUDE.md (no `--dangerously-allow-all-scripts`; that claim was disproven in F4 round 1). Clean install, exit 0.
- `npm run prisma:generate` → OK (Prisma Client regenerated; no schema change, so the client is identical to F4's).
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, 0 errors, 0 warnings.
- `npm test -- --maxWorkers=2` → **Test Suites: 25 passed, 25 total · Tests: 155 passed, 155 total · 59.2 s**.
  Baseline after F4 was 22 suites / 117 tests — all 117 still green; **+3 suites / +38 tests**, 0 regressions, 0 modified existing expectations.

### AC coverage (backend `[U]` ACs from F5-ba.md §10)

| AC | Where |
|---|---|
| AC-01, AC-02 | `users.service.spec.ts` — list projection + key set + ordering |
| AC-03 | `users.controller.spec.ts` — `__guards__` + `ROLES_KEY` metadata, class and per-handler |
| AC-04, AC-05 | `users.service.spec.ts` — create `data` key set, cost-12 hash, `bcrypt.compare`, returned `UserView` |
| ~~AC-06~~ | **superseded by the deviation** — replaced by "stores the email exactly as typed" + 2 CI-duplicate cases |
| AC-07 | `users.service.spec.ts` — P2002 → `ConflictException('email already exists')` |
| AC-08..AC-11 | `dto/users.dto.spec.ts` — whitelist strips extras; `MinLength(8)` BVA; `@IsEmail`; `@IsIn` rejects `teacher`/`Admin`/`superadmin`/missing |
| AC-12, AC-13, AC-14, AC-15, AC-16 | `users.service.spec.ts` + `dto/users.dto.spec.ts` — reset happy path, BVA, 404 (unknown id **and** P2025), self-reset 400 with no write at all, no `role`/`email`/`id` in `data` |
| AC-17 | `users.controller.spec.ts` — route inventory: exactly 3 routes, no `@Delete`/`@Put`/`@Patch` |
| AC-18 | `users.controller.spec.ts` — static scan of `src/users/**` for `console.`/`Logger`/`logger.` (zero) + `main.ts` has no request-logging middleware |
| AC-19, AC-20 | `users.controller.spec.ts` — `RolesGuard` 403 / `SessionAuthGuard` 401 against the controller's own metadata |
| AC-21 | full-suite run above (117 pre-F5 tests still green) |
| AC-22 | `users.service.spec.ts` — an F5-created hash + flag feeds `AuthService.validate` and yields `mustChangePassword === true` |
| AC-23 | `users.service.spec.ts` — `UsersService.length === 1` (Prisma only, no session store) + no Redis call on reset |

AC-24..AC-34 are frontend/jsdom; AC-35 needs a live stack. Not backend-owned.

## Blockers / open questions

None. Two items carried forward for the owner (already raised by BA, unchanged by this implementation):
- **Q3** — an admin reset does not evict the target's live sessions (≤ 8 h residual access); implemented that way on purpose (F5-ba §2.7). QA must not assert the inverse.
- **Q2** — login remains case-sensitive on email. The deviation above removes the trap (stored email == the address that works) but does not make login itself case-insensitive; that stays a follow-up feature touching the frozen `AuthService.validate`.

## Notes for the next role

- **Frontend**: use the contract table above verbatim. Own-row detection for suppressing the Reset control is by `email` (`CurrentUser` has no `id`) and the emails are now **case-preserved**, so compare exactly — the server enforces the same rule anyway (400 `cannot reset your own password`). Display the stored `email` string as-is; it is what the user must type at login.
- **QA**: AC-06 is deliberately not implemented (see Deviation table); its substitutes are the three email-casing cases in `users.service.spec.ts`. Do not raise a defect for a non-lowercased stored email, and do not assert that a reset kicks the target out (§2.7).
- **DBA**: F5 needs **no** migration (F5-ba §12) and none was written. Optional future hardening, only if the user table ever grows or concurrent admin creates become plausible: a functional unique index `CREATE UNIQUE INDEX dashboard_users_email_lower_key ON dashboard_users (lower(email));` would move case-insensitive uniqueness from the app layer into Postgres. Deliberately out of F5 because `prisma/**` is on the zero-diff list.
