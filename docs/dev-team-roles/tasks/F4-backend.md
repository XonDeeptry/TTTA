<!--
  Per-feature-per-role task file, OWNED by the Backend agent.
  docs/dev-team-roles/tasks/F4-backend.md
-->

# F4 · Backend — Forced password change on first login (core-api)

- **Owner role:** backend
- **Feature:** F4 — session shape + bootstrap flag + `POST /auth/change-password` + login/me flag surfacing, per approved design.
- **Status:** DONE
- **Last updated:** 2026-07-22 (QA round-1 fix: D3 doc correction only)
- **Depends on:** `docs/dev-team-roles/tasks/F4-ba.md` (API contract + ACs), `docs/dev-team-roles/tasks/F4-dba.md` (schema/migration), `docs/superpowers/specs/2026-07-22-forced-password-change-design.md`

## Inputs (what this role received)

- BA contract (F4-ba.md §1–§5): exact login/me/change-password request+response bodies & status codes; `ChangePasswordDto` shape; `AuthService.changePassword` logic; session shape; jest cases.
- DBA (F4-dba.md): `mustChangePassword Boolean @default(false) @map("must_change_password")` already on `DashboardUser`; migration `20260722110000_add_must_change_password` already written. Backend MUST run `prisma:generate` before build so the client type carries the field.
- Current auth code read: `auth.service.ts`, `auth.controller.ts`, `session.types.ts`, `bootstrap-admin.service.ts`, `session-auth.guard.ts`, `dto/login.dto.ts`, existing `*.spec.ts`. Global ValidationPipe is `{ whitelist: true, transform: true }` (no forbidNonWhitelisted).

## Checklist

- [x] Read protocol, upstream task files, design doc, current auth code + specs
- [x] Create this task file (IN_PROGRESS)
- [x] `session.types.ts`: add `mustChangePassword: boolean` to `SessionData.user`
- [x] `bootstrap-admin.service.ts`: seed with `mustChangePassword: true`
- [x] `dto/change-password.dto.ts`: new DTO (`@IsString`/`@MinLength(8)` + cross-field not-equal → 400)
- [x] `auth.service.ts`: new `changePassword(userId, currentPassword, newPassword)`
- [x] `auth.controller.ts`: `POST /auth/change-password` (SessionAuthGuard); login/me surface flag; clear flag in live session
- [x] Unit tests: auth.service.spec (change-password), bootstrap-admin.service.spec, auth.controller.spec, change-password.dto.spec
- [x] Docker: `prisma:generate` + `tsc build` + jest (full core-api suite green — 117/117)
- [x] Fill Outputs (frontend API contract) + set Status DONE
- [x] QA round 1 fix — D3 (Low): retract the incorrect `npm ci` lifecycle-scripts claim in this file (docs only, no source changes; re-ran the three-arm experiment myself — QA's refutation confirmed)

## Outputs (what this role produced)

### API contract (authoritative for the frontend)

All paths are core-api routes under `@Controller('auth')`; the SPA reaches them through the
`/api` proxy. JSON in / JSON out. Auth = the existing `express-session` cookie (unchanged model,
`credentials: 'include'` behavior as today). No new headers, no token.

| Method | Path (SPA) | Auth | Body | 200 body |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `{ email, password }` | `{ email, role, mustChangePassword }` |
| GET | `/api/auth/me` | session | — | `{ id, email, role, mustChangePassword }` |
| POST | `/api/auth/change-password` | session (admin **or** staff) | `{ currentPassword, newPassword }` | `{ email, role, mustChangePassword: false }` |
| POST | `/api/auth/logout` | none | — | `{ status: "ok" }` (unchanged) |

**`POST /api/auth/login`** — request `{ "email": string (IsEmail), "password": string (min 8) }`.
- `200` → `{ "email": "admin@ilm.local", "role": "admin", "mustChangePassword": true }`. Session written with all four fields (`id` included).
- `401` → `{ "statusCode": 401, "message": "invalid credentials", "error": "Unauthorized" }`, no session.
- `400` → DTO validation envelope (unchanged).

**`GET /api/auth/me`**
- `200` → `{ "id": 1, "email": "admin@ilm.local", "role": "admin", "mustChangePassword": true }`.
- `401` → `{ "statusCode": 401, "message": "login required", "error": "Unauthorized" }`.

**`POST /api/auth/change-password`** — request `{ "currentPassword": string, "newPassword": string }`.
- `200` → `{ "email": "admin@ilm.local", "role": "admin", "mustChangePassword": false }`.
  Side effects: bcrypt(12) hash stored, `must_change_password` set `false` in Postgres, and
  `req.session.user.mustChangePassword` set `false` in the **live** session — **no re-login needed**.
  Frontend should `setUser(response)` from this body so the `ProtectedShell` gate re-evaluates immediately.
- `401` wrong current password → `{ "statusCode": 401, "message": "invalid current password", "error": "Unauthorized" }`. No DB write, session untouched. This is the inline `changePassword.error` case.
- `401` no session → `{ ..., "message": "login required" }` (guard fires before the handler).
- `400` validation → `{ "statusCode": 400, "message": [ ... ], "error": "Bad Request" }`. Triggers:
  `newPassword` (or `currentPassword`) shorter than 8 chars / missing / non-string, **or**
  `newPassword === currentPassword` (message `"new password must differ from current"`).
  Map to `changePassword.sameAsCurrent` when the message array contains that string.

Both roles may call change-password (`SessionAuthGuard` only, never `RolesGuard`).
Per design §0 the gate is **UI-only**: other `/api/*` routes are NOT blocked server-side while the flag is set.

### Files changed (absolute paths)

- `D:/TTTA/services/core-api/src/auth/auth.controller.ts` — **M** — login/me now carry `mustChangePassword`; new `POST change-password` handler (`@HttpCode(200)` + `SessionAuthGuard`), rewrites `req.session.user` with the cleared flag; shared `AuthUserResponse` type.
- `D:/TTTA/services/core-api/src/auth/auth.service.ts` — **M** (pre-existing this run) — `changePassword()`: findUnique → `bcrypt.compare` → 401 / 400-if-same → `bcrypt.hash(…, 12)` → single `update({ passwordHash, mustChangePassword: false })`.
- `D:/TTTA/services/core-api/src/auth/session.types.ts` — **M** (pre-existing) — `SessionData.user` gains `mustChangePassword: boolean`.
- `D:/TTTA/services/core-api/src/auth/bootstrap-admin.service.ts` — **M** (pre-existing) — seeds `mustChangePassword: true`.
- `D:/TTTA/services/core-api/src/auth/dto/change-password.dto.ts` — **A** (pre-existing) — `@IsString`+`@MinLength(8)` on both fields, hand-rolled `IsDifferentFrom('currentPassword')` cross-field validator on `newPassword`.
- `D:/TTTA/services/core-api/src/auth/auth.controller.spec.ts` — **A** — 7 cases (AC-6/7/8/9 + bad-creds + normal-user regression + service-401 propagation).
- `D:/TTTA/services/core-api/src/auth/bootstrap-admin.service.spec.ts` — **A** — 3 cases (AC-1, AC-2, no-env-vars).
- `D:/TTTA/services/core-api/src/auth/dto/change-password.dto.spec.ts` — **A** — 4 cases (AC-5 short + AC-5 same-as-current + valid + missing/non-string).
- `D:/TTTA/services/core-api/src/auth/auth.service.spec.ts` — **M** — +4 cases (AC-3, AC-4 wrong password, AC-4 missing user, AC-5 backstop); existing 3 `validate` cases untouched and still green.
- `D:/TTTA/services/core-api/prisma/schema.prisma` + `prisma/migrations/20260722110000_add_must_change_password/` — DBA-owned, unchanged by backend.

No changes to any of the three duplicated `contracts.*` files, no queue/topology changes, no user-management endpoints (F5).

### Build / test results (Docker, node:24-alpine, bind-mounted service dir)

- `npm ci` — the plain command documented in CLAUDE.md, and it is correct as written.
  **Correction (QA round 1, D3):** an earlier revision of this file claimed npm 11.16 blocks
  lifecycle scripts by default and that `--dangerously-allow-all-scripts` was required. That was
  wrong — I misread npm 11.16's warn-only advisory (`npm warn allow-scripts Run
  \`npm approve-scripts --allow-scripts-pending\` to review…`) as an enforcement message. Re-ran as a
  controlled three-arm experiment on `node:24-alpine` (npm 11.16.0), same package-lock, isolated
  trees: **plain `npm ci`** → `bcrypt_lib.node` present, `require('bcrypt')` + `hashSync` OK,
  `node_modules/.prisma/client/` generated; **`npm ci --ignore-scripts`** → no bcrypt binding, no
  Prisma client (the broken tree I had wrongly attributed to plain `npm ci`);
  **`npm ci --dangerously-allow-all-scripts`** → byte-for-byte the same working result as plain
  `npm ci`. Conclusion: hooks still run; **CLAUDE.md needs no change** and was not modified.
- `npm run prisma:generate` → `✔ Generated Prisma Client (v5.22.0)` — client now carries `mustChangePassword`.
- `npm run build` (`tsc -p tsconfig.build.json`) → clean, 0 errors.
- `npm test -- --maxWorkers=2` → **Test Suites: 22 passed, 22 total · Tests: 117 passed, 117 total · 53.1 s**.
  Baseline before F4 was 99/99; +18 new tests, 0 regressions.

## Blockers / open questions

None.

## Notes for the next role

- **Frontend**: use the table above verbatim. `CurrentUser` gains `mustChangePassword: boolean` (present on both `/auth/login` and `/auth/me`); the context `changePassword(current, new)` action should POST and `setUser(responseBody)` — the server already cleared the live session, so no `/auth/me` refetch and no re-login. Distinguish the two error paths by status: `401` → `changePassword.error`, `400` → `changePassword.sameAsCurrent` (when the message array mentions "must differ") else a generic validation message. Enforce ≥8 chars client-side to avoid an avoidable 400.
- **QA**: AC-1..AC-9 are covered by jest (`src/auth/*.spec.ts` + `src/auth/dto/change-password.dto.spec.ts`), all green. AC-10..AC-17 remain browser-only. Do NOT assert server-side blocking of non-auth routes while the flag is set (out of scope by design §0).
- **Ops**: the migration must be applied (`prisma migrate deploy`) before the new build runs, otherwise every login errors on the missing column.
