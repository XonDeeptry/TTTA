<!--
  Per-feature-per-role task file, OWNED by the BA agent.
  docs/dev-team-roles/tasks/F4-ba.md
-->

# F4 · BA — Forced password change on first login

- **Owner role:** ba
- **Feature:** F4 — `mustChangePassword` on `DashboardUser`, `POST /auth/change-password`, `/change-password` route + `ProtectedShell` gate, i18n vi/en. Implements the APPROVED design doc exactly.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/superpowers/specs/2026-07-22-forced-password-change-design.md` (approved design — authoritative), `docs/dev-team-roles/tasks/F4-pm.md` (PM stories + ACs).

## Inputs (what this role received)

- Approved design doc (spec-grade already): force a password change on first login for the bootstrap-seeded admin; generic `mustChangePassword` flag reusable by future user-creation paths; UI-only gate (no server-side blocking of other routes this feature).
- PM stories US1–US5 in `F4-pm.md` (MoSCoW).
- Current code read for real symbols: `services/core-api/src/auth/{auth.service.ts,auth.controller.ts,session.types.ts,bootstrap-admin.service.ts,session-auth.guard.ts,dto/login.dto.ts,auth.service.spec.ts}`, `services/core-api/prisma/schema.prisma` (`DashboardUser` L244-252), `services/dashboard/src/{auth/AuthContext.tsx,App.tsx,pages/Login.tsx,i18n/index.ts}`, migration precedent `prisma/migrations/20260722090000_add_media_lifecycle_columns/migration.sql` (additive `ALTER TABLE ... ADD COLUMN`).

## Checklist

- [x] Read design doc + PM stories + all touched source symbols
- [x] Write exact API contract (login / me / change-password) with all response codes and bodies
- [x] Write ChangePasswordDto spec mirroring LoginDto class-validator style
- [x] Write per-file behavior inventory (schema, migration, bootstrap, session shape, service logic, frontend gate precedence)
- [x] Write frozen-behavior list
- [x] Write numbered Given/When/Then ACs tagged unit-testable vs browser-only
- [x] List exact core-api `*.spec.ts` cases from the doc's Testing section
- [x] List i18n keys (vi + en)
- [x] Note F5 split + confirm server-side-gate-is-UI-only decision

---

## Outputs

### 0. Scope, split with F5, and the UI-only-gate decision (CONFIRMED, not re-litigated)

- **F4 = the forced-change mechanism**: DB flag, endpoint, `/change-password` page, `ProtectedShell` gate, i18n. That's all.
- **F5 = add-user / user-management UI** — NOT part of F4. F4 only makes the flag *generic* on `DashboardUser` so F5 can set `mustChangePassword: true` on any user it creates for free. F4 ships with exactly one flag-setter: `BootstrapAdminService`.
- **Server-side-gate-is-UI-only (confirmed from design doc §Error handling)**: while `mustChangePassword === true`, other API calls are **NOT** blocked server-side. A forced user with the session cookie could still call other `/api/*` endpoints directly; the only enforcement is the frontend `ProtectedShell` redirect. This is an accepted trade-off for a trusted dev/admin-only context and is explicitly deferred. QA MUST NOT write an AC asserting server-side blocking of e.g. `GET /students` while the flag is set — that is out of scope by design.

### 1. Exact API contract

All routes under `@Controller('auth')`, base path `/auth`. Frontend reaches them via the Vite/Caddy `/api` proxy (so `/api/auth/...`). JSON bodies. Session via `express-session` cookie (unchanged model).

#### 1.1 `POST /auth/login` — UPDATED response shape

- **Request body** (`LoginDto`, unchanged): `{ "email": string (IsEmail), "password": string (MinLength 8) }`
- **200 OK** (success): body gains `mustChangePassword`:
  ```json
  { "email": "admin@ilm.local", "role": "admin", "mustChangePassword": true }
  ```
  Side effect: `req.session.user = { id, email, role, mustChangePassword }` (all four fields — see §2.4).
- **401 Unauthorized** (bad credentials, unchanged): `UnauthorizedException('invalid credentials')` → `{ "statusCode": 401, "message": "invalid credentials", "error": "Unauthorized" }`. No session written.
- **400 Bad Request**: body fails `LoginDto` validation (unchanged behavior).

#### 1.2 `GET /auth/me` — UPDATED response shape

- Guarded by `SessionAuthGuard`.
- **200 OK**: returns `req.session.user`, now `{ id, email, role, mustChangePassword }`:
  ```json
  { "id": 1, "email": "admin@ilm.local", "role": "admin", "mustChangePassword": true }
  ```
  (Frontend `CurrentUser` reads only `email`/`role`/`mustChangePassword`; `id` is present but unused by the SPA — unchanged from today where `id` is already returned but unused.)
- **401 Unauthorized** (no session): `SessionAuthGuard` → `UnauthorizedException('login required')`.

#### 1.3 `POST /auth/change-password` — NEW

- Decorators: `@Post('change-password')`, `@HttpCode(200)`, `@UseGuards(SessionAuthGuard)` (any logged-in role — admin OR staff; NOT `RolesGuard`-restricted).
- **Request body** (`ChangePasswordDto`, new — see §1.4): `{ "currentPassword": string, "newPassword": string }`
- **200 OK** (success): same shape as login, with the flag now cleared:
  ```json
  { "email": "admin@ilm.local", "role": "admin", "mustChangePassword": false }
  ```
  Side effects (atomic per request): stored `passwordHash` updated to bcrypt(newPassword, 12 rounds); `mustChangePassword` set `false` in Postgres; `req.session.user.mustChangePassword` set `false` in the live session (no re-login needed).
- **401 Unauthorized** (wrong `currentPassword`): `UnauthorizedException` (message e.g. `'invalid current password'`). No DB write, no session change. This is the case the `/change-password` form surfaces as an inline error.
- **401 Unauthorized** (no session): `SessionAuthGuard` fires before the handler body.
- **400 Bad Request** (validation): `newPassword` shorter than 8 chars, non-string/empty either field, OR `newPassword === currentPassword`. Standard Nest `ValidationPipe`/exception envelope `{ statusCode: 400, message: [...], error: "Bad Request" }`.

#### 1.4 `ChangePasswordDto` (new — mirror `LoginDto`'s class-validator style)

File: `services/core-api/src/auth/dto/change-password.dto.ts`. Mirror `dto/login.dto.ts`:

- `currentPassword`: `@IsString()` (non-empty; existing `LoginDto` uses `@IsString @MinLength(8)` on `password` — currentPassword may reuse `@MinLength(8)` or just `@IsString`; either is acceptable since correctness is decided by `bcrypt.compare`, but keep it `@IsString` at minimum).
- `newPassword`: `@IsString()` + `@MinLength(8)` — SAME min-length rule as `LoginDto.password`. No additional complexity rules (design Non-goal).
- **`newPassword !== currentPassword`** is a cross-field rule. class-validator has no first-class cross-field decorator, so implement it either as (a) a small custom `@Match`-negation validator constraint on the DTO, or (b) an explicit check in `AuthService.changePassword` throwing `BadRequestException('new password must differ from current')`. **Both surface as HTTP 400** — QA verifies the 400, not the mechanism. Backend's choice.

### 2. Exact behavior inventory (per touched file/symbol)

#### 2.1 `prisma/schema.prisma` — `DashboardUser` (currently L244-252)
Add exactly one field:
```prisma
mustChangePassword Boolean @default(false) @map("must_change_password")
```
Placed after `role`, before `createdAt` (per design doc snippet). `@default(false)` so existing rows are unaffected (no backfill).

#### 2.2 Migration — additive, hand-authored, matching existing style
New dir `prisma/migrations/<timestamp>_add_must_change_password/migration.sql`, timestamp AFTER `20260722100000` (latest existing). Single statement, mirroring the `20260722090000` additive precedent:
```sql
-- AlterTable
ALTER TABLE "dashboard_users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
```
Reversible/additive; `NOT NULL DEFAULT false` means existing rows get `false` automatically. No data backfill. DBA/backend must also run `prisma generate` so the client type carries the field.

#### 2.3 `bootstrap-admin.service.ts` — one-line change
`this.prisma.dashboardUser.create({ data: { email, passwordHash, role: 'admin' } })` becomes `{ data: { email, passwordHash, role: 'admin', mustChangePassword: true } }`. Everything else (env-var gating, `count > 0` early return, salt rounds 12, logging) UNCHANGED.

#### 2.4 `session.types.ts` — `SessionData.user` shape
`user?: { id: number; email: string; role: DashboardRole }` becomes `user?: { id: number; email: string; role: DashboardRole; mustChangePassword: boolean }`. The flag is written at login from the DB value and mutated in-session by change-password.

#### 2.5 `auth.controller.ts`
- `login`: return type and body add `mustChangePassword: user.mustChangePassword`; session assignment adds the field: `req.session.user = { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword }`.
- `me`: return type widens to include `mustChangePassword` (it already returns `req.session.user` verbatim, so no body-logic change beyond the type).
- NEW `changePassword` handler (§1.3): pulls `req.session.user` (guaranteed by guard) for the current user id/email, delegates to `AuthService.changePassword`, then mutates `req.session.user.mustChangePassword = false` and returns `{ email, role, mustChangePassword: false }`.

#### 2.6 `auth.service.ts` — new `changePassword` method
Signature (indicative): `changePassword(userId: number, currentPassword: string, newPassword: string): Promise<DashboardUser>`.
Logic order:
1. `findUnique({ where: { id: userId } })`; if missing → `UnauthorizedException` (defensive; shouldn't happen behind guard).
2. `bcrypt.compare(currentPassword, user.passwordHash)`; if false → `UnauthorizedException('invalid current password')` — **no writes**.
3. (If not enforced by DTO) if `newPassword === currentPassword` → `BadRequestException`.
4. `bcrypt.hash(newPassword, 12)` (reuse the `SALT_ROUNDS = 12` used by bootstrap; keep consistent).
5. `dashboardUser.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } })`; return updated user.
Existing `validate()` method UNCHANGED.

#### 2.7 `AuthContext.tsx` (`CurrentUser`)
`CurrentUser` gains `mustChangePassword: boolean` (populated from `/auth/me` and `/auth/login` responses — both now include it). Add a `changePassword(currentPassword, newPassword)` action to the context that POSTs `/auth/change-password` and `setUser(response)` so the gate re-evaluates without reload. `login`/`logout` otherwise unchanged.

#### 2.8 `App.tsx` — `ProtectedShell` gate precedence (EXACT ORDER)
Insert the new gate between the existing `!user` and `adminOnly` checks. Final order inside `ProtectedShell`:
1. `if (loading) return null;` (unchanged)
2. `if (!user) return <Navigate to="/login" replace />;` (unchanged)
3. **NEW:** `if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;`
4. `if (adminOnly && user.role !== 'admin') return <Navigate to="/students" replace />;` (unchanged)

Rationale for order: the forced-change gate (3) MUST precede the `adminOnly` gate (4) so a flagged admin hitting `/settings` is sent to `/change-password`, not allowed through. It MUST follow the `!user` gate (2) so unauthenticated users still go to `/login` first. `ProtectedShell` must add `useLocation()` for the pathname check (currently only `SidebarNav` uses it). NOTE: because `/change-password` is rendered OUTSIDE `ProtectedShell` (§2.9), the `pathname !== '/change-password'` clause never actually matches a ProtectedShell route — it is defensive/belt-and-suspenders; the effective rule is "every ProtectedShell-wrapped route redirects to `/change-password` while the flag is set."

New route registration in `App.tsx` `<Routes>`: `<Route path="/change-password" element={<ChangePassword />} />` — a SIBLING of `/login`, NOT wrapped in `ProtectedShell` (renders outside nav chrome). The existing `<Route path="*" ... />` catch-all → `/students` stays last, unchanged.

#### 2.9 `/change-password` page (new component, e.g. `pages/ChangePassword.tsx`)
- Renders outside `ProtectedShell` (like `Login.tsx`): centered card, no sidebar/nav.
- Form: three fields — current password, new password, confirm new password (all `type="password"`).
- Reuses `Login.tsx`'s `Alert variant="destructive" role="alert"` inline-error pattern verbatim.
- Client-side: if `newPassword !== confirmPassword`, show `changePassword.mismatch` error and make NO API call.
- On submit (when confirm matches): call context `changePassword(...)`. On success, `setUser` clears the flag and the app navigates to the default landing route (`/students`) — the gate then permits it. On 401, render `changePassword.error`.
- Must guard against a not-logged-in visit: if a user reaches `/change-password` with no session, the page should redirect to `/login` (or the change action's 401 forces re-login). Minimal requirement: a direct `/change-password` visit while unauthenticated does not crash and ends at `/login`.

### 3. Frozen behavior (MUST NOT change)

- **Normal-user login/logout/me** (`mustChangePassword === false`): identical to today — login → session written → `/auth/me` returns the user → no forced redirect. Adding the field must not alter these flows for unflagged users.
- **Role gating**: `adminOnly` routes still redirect non-admins to `/students`; `SessionAuthGuard`/`RolesGuard` semantics unchanged. `change-password` is `SessionAuthGuard`-only (both roles), never `RolesGuard`.
- **`Login.tsx` post-login `navigate('/settings')`**: the line STAYS AS-IS. The `ProtectedShell` gate (§2.8 step 3) supersedes it at render time by redirecting `/settings` → `/change-password` when flagged; do NOT delete or rewrite the `navigate('/settings')` call.
- **`App.tsx` catch-all** `<Route path="*" element={<Navigate to="/students" replace />} />`: unchanged, stays last.
- **Session-auth model**: still `express-session` + `connect-redis`; no new auth mechanism, no token, no re-login on password change.
- **`AuthService.validate`** and the existing `auth.service.spec.ts` three cases: unchanged and must still pass.

### 4. Acceptance criteria (numbered, Given/When/Then, tagged)

Tags: **[U]** = unit-testable in core-api jest (no browser); **[B]** = browser-only / live-stack manual (no dashboard test harness exists — design doc §Testing).

**AC-1 [U]** Given the DB `passwordHash` for the bootstrap admin, When `BootstrapAdminService.onApplicationBootstrap` runs on an empty `dashboard_users` table, Then it calls `dashboardUser.create` with `mustChangePassword: true` (and `role: 'admin'`).

**AC-2 [U]** Given a non-empty `dashboard_users` table, When bootstrap runs, Then it returns early and creates nothing (unchanged early-return preserved).

**AC-3 [U]** Given a user whose stored hash matches `currentPassword` and a `newPassword` that differs and is ≥8 chars, When `AuthService.changePassword` runs, Then `dashboardUser.update` is called with a NEW bcrypt hash of `newPassword` and `mustChangePassword: false`, and the returned user reflects both.

**AC-4 [U]** Given a wrong `currentPassword`, When `AuthService.changePassword` runs, Then it throws `UnauthorizedException` and `dashboardUser.update` is NEVER called (no state change).

**AC-5 [U]** Given `newPassword === currentPassword` (or `newPassword` < 8 chars), When the request is validated, Then it is rejected with HTTP 400 and no hash update occurs.

**AC-6 [U]** Given a valid session and a successful change, When `POST /auth/change-password` returns, Then the response body is `{ email, role, mustChangePassword: false }` AND `req.session.user.mustChangePassword` is now `false`.

**AC-7 [U]** Given no session, When `POST /auth/change-password` is called, Then `SessionAuthGuard` throws `UnauthorizedException('login required')` (401) before any handler logic.

**AC-8 [U]** Given a successful login for a flagged admin, When `POST /auth/login` returns, Then the body includes `mustChangePassword: true` and the session user carries the flag.

**AC-9 [U]** Given a logged-in flagged user, When `GET /auth/me` returns, Then the body includes `mustChangePassword: true` (session shape carries the field).

**AC-10 [B]** Given the seed admin logs in (flag `true`), When `Login.tsx` runs its `navigate('/settings')`, Then `ProtectedShell` redirects to `/change-password` (the gate supersedes the hardcoded target).

**AC-11 [B]** Given a flagged user on `/change-password`, When they manually navigate to any other route (URL bar / stale link), Then `ProtectedShell` redirects them back to `/change-password` (including admin-only routes — gate precedes `adminOnly`).

**AC-12 [B]** Given the `/change-password` form, When new and confirm fields differ, Then an inline `changePassword.mismatch` error shows and NO API call is made.

**AC-13 [B]** Given the form submitted with a wrong current password, When the endpoint returns 401, Then the `Login.tsx`-style destructive `Alert` renders a translated `changePassword.error`.

**AC-14 [B]** Given the form submitted correctly, When the endpoint returns 200, Then `AuthContext` user updates to `mustChangePassword: false` and the app lands on `/students` (or the default) with full nav chrome, requiring no re-login.

**AC-15 [B]** Given `/change-password` renders, Then it shows outside the sidebar/nav chrome (centered card like `/login`).

**AC-16 [B]** Given a NORMAL user (flag `false`) logs in, Then no `/change-password` redirect occurs and existing role gating (`adminOnly` → `/students` for staff) is unchanged (frozen-behavior regression check).

**AC-17 [B]** Given every new UI string, Then it is rendered via `t(...)` (no hardcoded literals) and both `vi` and `en` bundles contain all §5 keys.

### 5. Required core-api `*.spec.ts` cases (from design doc §Testing)

Follow existing `auth/*.spec.ts` patterns (mock `prisma.dashboardUser` with `jest.fn()`, low bcrypt rounds like 4 for speed, as in `auth.service.spec.ts`).

- `auth.service.spec.ts` (extend or add `changePassword` describe): (a) wrong current password → throws, `update` not called (AC-4); (b) correct current password → `update` called with fresh hash + `mustChangePassword: false`, and `bcrypt.compare(newPassword, storedHash)` is true (AC-3); (c) `newPassword === currentPassword` → rejected (AC-5).
- `bootstrap-admin.service.spec.ts` (new): seeded row created with `mustChangePassword: true` on empty table (AC-1); early return when table non-empty (AC-2).
- (Optional but recommended) `auth.controller.spec.ts`: change-password mutates `req.session.user.mustChangePassword` to `false` and returns the cleared shape (AC-6); login/me bodies include the flag (AC-8/AC-9).

Dashboard has NO test harness (M4 shipped without one) — AC-10..AC-17 are **[B]** manual via `docker compose up -d --build` per design §Testing/§Rollout. QA verifies [U] via jest and documents [B] as a manual checklist.

### 6. i18n keys (exact — add to BOTH `vi` and `en` in `services/dashboard/src/i18n/index.ts`)

| key | vi | en |
|---|---|---|
| `changePassword.title` | Đổi mật khẩu | Change password |
| `changePassword.currentPassword` | Mật khẩu hiện tại | Current password |
| `changePassword.newPassword` | Mật khẩu mới | New password |
| `changePassword.confirmPassword` | Xác nhận mật khẩu mới | Confirm new password |
| `changePassword.submit` | Đổi mật khẩu | Change password |
| `changePassword.mismatch` | Mật khẩu xác nhận không khớp | Passwords do not match |
| `changePassword.error` | Mật khẩu hiện tại không đúng | Current password is incorrect |
| `changePassword.sameAsCurrent` | Mật khẩu mới phải khác mật khẩu hiện tại | New password must differ from the current one |
| `changePassword.success` | Đã đổi mật khẩu | Password changed |

(`changePassword.sameAsCurrent` covers the 400 same-as-current case if surfaced inline; `changePassword.success` optional if a confirmation toast is shown. `changePassword.error` is the wrong-current-password 401 inline error, mirroring `login.error`.)

## Blockers / open questions

None. The design doc is approved and detailed; this spec adds exact shapes/precedence/ACs without introducing new decisions.

## Notes for the next role

- **Backend/DBA**: additive migration (`must_change_password BOOLEAN NOT NULL DEFAULT false`) + `prisma generate`; new `ChangePasswordDto` mirrors `LoginDto`; new `AuthService.changePassword` + controller route (`SessionAuthGuard` only, both roles); update session/login/me shapes; write the §5 jest specs.
- **Frontend**: new `pages/ChangePassword.tsx` (reuse `Login.tsx` form/Alert), new non-ProtectedShell route, insert gate at the EXACT precedence in §2.8 (step 3, between `!user` and `adminOnly`), add `useLocation` to `ProtectedShell`, extend `CurrentUser` + a context `changePassword` action, keep `Login.tsx`'s `navigate('/settings')` line untouched, add §6 i18n keys to both bundles.
- **QA**: [U] ACs (AC-1..AC-9) are jest-verifiable without a browser; [B] ACs (AC-10..AC-17) need the live stack. Do NOT assert server-side blocking of non-auth routes while flagged — UI-only gate by design (§0).
- **F5 boundary**: add-user UI is F5; F4 only leaves the flag generic for F5 to reuse.

Handoff to Design + Dev + QA: F4 adds a `mustChangePassword` boolean to `DashboardUser` (additive migration), set `true` by `BootstrapAdminService`; a `SessionAuthGuard`-only `POST /auth/change-password` (bcrypt-compare current, hash+store new, clear flag in DB and `req.session.user`) returning `{email,role,mustChangePassword:false}`, with `login`/`me` also carrying the flag; a non-nav `/change-password` page and a `ProtectedShell` gate inserted precisely between `!user`→`/login` and `adminOnly`→`/students` (redirecting to `/change-password` while flagged, superseding `Login.tsx`'s untouched `navigate('/settings')`); vi/en i18n; 9 unit-testable + 8 browser-only ACs; gate is UI-only by design; add-user UI is F5.
