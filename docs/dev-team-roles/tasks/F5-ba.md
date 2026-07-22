<!--
  Per-feature-per-role task file, OWNED by the BA agent.
  docs/dev-team-roles/tasks/F5-ba.md
-->

# F5 · BA — Dashboard user management (create user, admin reset, self-service change-password entry)

- **Owner role:** ba
- **Feature:** F5 — admin-only `users/` module (list / create / admin reset-password) reusing F4's `mustChangePassword`, plus a voluntary entry point to F4's already-shipped `/change-password` page.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F5-pm.md` (stories US1–US4), `F4-ba.md` (§0 UI-only-gate decision, §3 frozen behavior), `F4-backend.md` (auth contract **as shipped**), `F4-qa.md` (round-2 carry-forwards), `F4-ux.md` (page is entry-agnostic by design), `docs/superpowers/specs/2026-07-22-forced-password-change-design.md` (Non-goals deferred exactly this feature)

## Inputs (what this role received)

- **F5-pm.md**: US1 create user (Must), US2 list users (Must), US3 admin reset password (Should), US4 self-service change-password entry point (Must). Out of scope per PM: delete/deactivate, self-registration, audit log, password-complexity changes, new role enum value.
- **F4 as shipped** (read from source, not from docs): `POST /auth/change-password` (SessionAuthGuard only, re-verifies `currentPassword` with `bcrypt.compare`, `SALT_ROUNDS = 12`, clears the flag in DB **and** in the live session), `mustChangePassword` on `DashboardUser` with an applied additive migration, `ProtectedShell` gate order `loading → !user → mustChangePassword → adminOnly`, `/change-password` registered as a **sibling of `/login`** (outside `ProtectedShell`, no nav chrome).
- **F4-qa.md round-2 carry-forwards** (explicitly recorded for F5): (1) a password change neither regenerates the session ID nor invalidates the user's other live sessions; (2) a session expiring on an already-open form still surfaces as "current password is incorrect". §2.7 below rules on both.
- **F4-ux.md §5**: the `/change-password` page is deliberately agnostic to *how* it was reached; F5 is expected to add the voluntary entry with "no prop/query-param differences required".
- **Design doc Non-goals**: "No 'add user' / user-management UI — out of scope, not part of this change" and "no password complexity policy beyond what already exists". F5 implements the first; F5 keeps the second.
- **Live code symbols this spec references**: `services/core-api/src/auth/{auth.controller.ts,auth.service.ts,session-auth.guard.ts,roles.guard.ts,roles.decorator.ts,session.types.ts,bootstrap-admin.service.ts,dto/login.dto.ts,dto/change-password.dto.ts}`, `prisma/schema.prisma` L36-39 + L244-253, `src/settings/settings.controller.ts` (admin-gated controller precedent), `src/students/{students.controller.ts,students.service.ts,dto/update-student.dto.ts}` (list + DTO precedent), `src/monitoring/monitoring.module.ts` (proof that an admin-gated module needs **no** guard providers), `src/main.ts:22` (`ValidationPipe({ whitelist: true, transform: true })`), `services/dashboard/src/{App.tsx,pages/Students.tsx,pages/ChangePassword.tsx,auth/AuthContext.tsx,api/client.ts,i18n/index.ts,components/ui/select-native.tsx}`.

## Checklist

- [x] Read TASK-PROTOCOL, F5-pm.md, F4 ba/backend/qa/ux, F4 design doc
- [x] Read shipped code (auth/*, schema.prisma, students/, settings/, monitoring/, App.tsx, Students.tsx, ChangePassword.tsx, AuthContext.tsx, i18n, api/client.ts, main.ts)
- [x] Validate the "teacher = staff" assumption + price out a new enum value
- [x] Exact API contract (3 endpoints, all codes + bodies + error shapes)
- [x] Security rules as testable requirements (incl. the session-invalidation ruling)
- [x] Functional + non-functional requirements, use cases, business rules, data dictionary
- [x] Per-file behavior inventory (backend + frontend) + frozen-behavior list
- [x] Numbered Given/When/Then ACs tagged [U]/[B]
- [x] i18n key list (vi + en)
- [x] Schema impact for DBA
- [x] Assumptions / dependencies / open questions
- [x] Status DONE

---

# Outputs — the F5 specification

## 0. Role model ruling: "teacher" maps to the existing `staff` role — CONFIRMED

**Verdict: confirm PM's assumption. Do NOT add a `teacher` value to `DashboardRole`.** Evidence and cost, so this is a decision and not a guess:

**Evidence for the mapping**
1. `prisma/schema.prisma:36-39` — `enum DashboardRole { admin staff }`. Two values, no third.
2. `src/students/students.controller.ts:7` — the shipped comment on the largest staff-facing subsystem reads *"Phân hệ 2 (mục 3.7) — cả admin lẫn staff (**tư vấn/giáo viên**) đều dùng được"*: advisor **and teacher** are already documented as one role in code, not just in `CLAUDE.md`.
3. The permission model is binary in both tiers. Server: only **4** `@Roles('admin')` call sites exist (`settings`, `monitoring`, `dlq`, `submissions DELETE :id/media`); every other dashboard controller is `@UseGuards(SessionAuthGuard)` with **no** role metadata, i.e. "any logged-in user". Client: `ProtectedShell` takes a boolean `adminOnly` prop, not a role list.
4. Nothing in the owner's request or F5-pm.md states a single capability a teacher should have that an advisor should not (or vice versa). A third role with identical permissions is a pure liability.

**Cost if the owner later rejects the mapping** (quantified so the decision is reversible with eyes open):
- **Schema/migration**: `enum DashboardRole` + a migration `ALTER TYPE "DashboardRole" ADD VALUE 'teacher';`. Postgres is `postgres:16-alpine` (`infra/docker-compose.yml:5`) so this is legal inside Prisma's transactional migration, but the new value **cannot be used by another statement in the same transaction** — any backfill must be a separate migration. Plus `prisma generate`.
- **Type union**: `src/auth/session.types.ts:3` `DashboardRole = 'admin' | 'staff'` — consumed by `roles.decorator.ts`, `roles.guard.ts`, `auth.controller.ts`; and the client-side duplicate at `services/dashboard/src/auth/AuthContext.tsx:6`.
- **`@Roles()` call sites**: the 4 existing `@Roles('admin')` sites keep working unchanged (they whitelist `admin` only). The real cost is the inverse: the **9 currently role-agnostic controllers** (`students`, `submissions`, `gradings`, `onboarding`, `criteria`, `classes-config`, `reports`, `media`, `sheets-sync`) would each need an explicit `@Roles('admin','staff', …)` decorator, because today a new enum value silently inherits full phân hệ 2-5 access.
- **Frontend gating**: `ProtectedShell`'s `adminOnly: boolean` would have to become `allowedRoles: DashboardRole[]` (touching all 9 route registrations in `App.tsx`), plus `SidebarNav`'s `items[]` role filter.
- **i18n**: a `users.roleTeacher` label in both bundles, plus wherever a role is displayed.
- **Tests**: `roles.guard.spec.ts` + new gating cases + the F4 jsdom precedence harness.

**Mitigation shipped with F5** so the assumption is visible to the owner the first time they use the screen: the role dropdown labels `staff` as **"Nhân viên (tư vấn / giáo viên)" / "Staff (advisor / teacher)"** (`users.roleStaff`, §8) rather than a bare "Staff". If the owner disagrees, they will see it immediately.

Recorded as **assumption A1** (§11). Not blocking.

---

## 1. Exact API contract

New module `services/core-api/src/users/`, controller base path `/users` (SPA reaches it as `/api/users` through the Vite/Caddy proxy). JSON in / JSON out. Auth = the existing `express-session` cookie — no new mechanism.

**Controller-level guards (all three routes):**
```ts
@Controller('users')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
```
This is a byte-for-byte copy of `settings.controller.ts:9-11` / `monitoring.controller.ts:7-9`. Guard order matters: `SessionAuthGuard` first (401 for anonymous), `RolesGuard` second (403 for staff). No per-method guard overrides.

### 1.0 The shared response projection — `UserView`

Every endpoint in this module returns this exact shape, and **only** this shape:

```ts
export interface UserView {
  id: number;
  email: string;
  role: 'admin' | 'staff';
  mustChangePassword: boolean;
  createdAt: string; // ISO-8601, serialized from the Prisma DateTime
}
```

It MUST be produced by a Prisma `select` (`{ id: true, email: true, role: true, mustChangePassword: true, createdAt: true }`), not by fetching the row and deleting `passwordHash` afterwards — see NFR-S1.

### 1.1 `GET /users` — list all dashboard accounts (US2)

- **Guards**: session + `admin`.
- **Query params**: none. Unpaginated by design (see NFR-P1); do NOT copy `StudentsService`'s pagination.
- **200 OK**: `UserView[]`, ordered `createdAt` ascending (creation order — the bootstrap admin is first).
  ```json
  [
    { "id": 1, "email": "admin@ilm.local", "role": "admin",  "mustChangePassword": false, "createdAt": "2026-07-22T09:00:00.000Z" },
    { "id": 2, "email": "teacher@ilm.local", "role": "staff", "mustChangePassword": true,  "createdAt": "2026-07-22T12:30:00.000Z" }
  ]
  ```
- **401 Unauthorized** (no session): `{ "statusCode": 401, "message": "login required", "error": "Unauthorized" }` (from `SessionAuthGuard`).
- **403 Forbidden** (logged in as `staff`): `{ "statusCode": 403, "message": "insufficient role", "error": "Forbidden" }` (from `RolesGuard`).

### 1.2 `POST /users` — create a dashboard account (US1)

- **Guards**: session + `admin`.
- **Request body** (`CreateUserDto`, §1.5):
  ```json
  { "email": "teacher@ilm.local", "role": "staff", "password": "initial-pass-1" }
  ```
- **201 Created** (Nest's default for `@Post` — do **not** add `@HttpCode(200)`; `api/client.ts` accepts any `res.ok`): the new `UserView`, always with `"mustChangePassword": true`.
  ```json
  { "id": 2, "email": "teacher@ilm.local", "role": "staff", "mustChangePassword": true, "createdAt": "2026-07-22T12:30:00.000Z" }
  ```
  Side effects: exactly one `dashboard_users` row inserted, `password_hash = bcrypt(password, 12)`, `must_change_password = true`. No session, Redis, queue or outbound-message side effect of any kind.
- **400 Bad Request** (DTO validation): `{ "statusCode": 400, "message": [ ... ], "error": "Bad Request" }`. Triggers: `email` not a valid email / missing; `password` missing, non-string, or < 8 chars; `role` not exactly `"admin"` or `"staff"`.
- **401 / 403**: as §1.1.
- **409 Conflict** (email already exists): `{ "statusCode": 409, "message": "email already exists", "error": "Conflict" }`. MUST be produced by catching Prisma error code **`P2002`** on the unique `email` index (not by a pre-flight `findUnique`, which races) — a `findUnique` pre-check is permitted *in addition* for a nicer path, but P2002 must still be caught and mapped.

### 1.3 `POST /users/:id/reset-password` — admin-triggered reset (US3)

- **Guards**: session + `admin`. `:id` parsed with `ParseIntPipe` (mirrors `students.controller.ts:19`), so a non-numeric id yields the standard 400.
- **Request body** (`ResetPasswordDto`, §1.6):
  ```json
  { "newPassword": "brand-new-pass-9" }
  ```
- **200 OK** (add `@HttpCode(200)` — this is not a creation): the updated `UserView`, always with `"mustChangePassword": true`.
  ```json
  { "id": 2, "email": "teacher@ilm.local", "role": "staff", "mustChangePassword": true, "createdAt": "2026-07-22T12:30:00.000Z" }
  ```
  Side effects: `password_hash = bcrypt(newPassword, 12)` and `must_change_password = true` on that row **and nothing else** (BR-6). The target's live sessions are **not** touched — see §2.7.
- **400 Bad Request**: `newPassword` missing / non-string / < 8 chars; **or** `:id` equals the calling admin's own `req.session.user.id` → `{ "statusCode": 400, "message": "cannot reset your own password", "error": "Bad Request" }` (BR-5).
- **401 / 403**: as §1.1.
- **404 Not Found** (no such user id): `{ "statusCode": 404, "message": "user not found", "error": "Not Found" }`. Either a pre-flight `findUnique` or catching Prisma `P2025` on `update` is acceptable; the status/message must match.

**Deliberately absent from this contract**: no `PATCH /users/:id` (no role or email editing), no `DELETE /users/:id`, no deactivate. See BR-7 / AC-17.

### 1.4 How the SPA must map errors (load-bearing constraint)

`services/dashboard/src/api/client.ts:16-18` throws `new ApiError(res.status, "POST /users failed: 409")` — **the response body is never parsed**. The frontend therefore maps errors by **HTTP status only**:

| status | UI message key |
|---|---|
| 409 | `users.emailExists` |
| 400 | `users.invalid` |
| 403 | `users.forbidden` (defensive — the nav item and route are already admin-gated) |
| 404 | `users.notFound` |
| other | `users.error` |

`api/client.ts` is **frozen** (§9, item 10) — do not add body parsing for F5; that is why every distinguishable failure above was given its own status code.

### 1.5 `CreateUserDto` — `services/core-api/src/users/dto/create-user.dto.ts`

Mirrors the class-validator style of `dto/login.dto.ts` and `students/dto/update-student.dto.ts` exactly:

```ts
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import type { DashboardRole } from '../../auth/session.types';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'staff'])
  role!: DashboardRole;

  @IsString()
  @MinLength(8)
  password!: string;
}
```
- `MinLength(8)` is the **same rule as `LoginDto.password` and `ChangePasswordDto.newPassword`** — no new complexity policy (design-doc Non-goal, PM out-of-scope item).
- No `mustChangePassword` field: the flag is set server-side, unconditionally (NFR-S5).
- The global `ValidationPipe({ whitelist: true })` (`main.ts:22`) strips any extra property, so `{ id, passwordHash, mustChangePassword }` smuggled into the body cannot reach Prisma (NFR-S6).

### 1.6 `ResetPasswordDto` — `services/core-api/src/users/dto/reset-password.dto.ts`

```ts
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
```
Note the asymmetry with F4's `ChangePasswordDto`, and it is intentional (BR-4): there is **no `currentPassword` field**, because an admin resetting someone else's forgotten password cannot supply it. This is exactly why the two endpoints are separate code paths and why this one is `@Roles('admin')` while `/auth/change-password` is `SessionAuthGuard`-only.

---

## 2. Security requirements (testable — this feature mints credentials)

Stated as requirements, each with a verification method. QA should treat §2 as the highest-priority section.

**NFR-S1 — No password hash ever leaves the API.** No response body of any endpoint in this feature contains `passwordHash` (or any substring of it). Enforced structurally by the Prisma `select` in §1.0, not by post-hoc deletion.
*Verify [U]:* assert `Object.keys(body).sort()` is exactly `['createdAt','email','id','mustChangePassword','role']` for `GET /users` items, `POST /users`, and `POST /users/:id/reset-password`; assert the `select` argument passed to `prisma.dashboardUser.findMany/create/update` has no `passwordHash: true` and no bare `select`-less call.

**NFR-S2 — Only admins may list, create, or reset.** All three routes carry `SessionAuthGuard` + `RolesGuard` + `@Roles('admin')` at the class level; no method opts out.
*Verify [U]:* Nest metadata assertion on `UsersController` (`Reflect.getMetadata('__guards__', UsersController)` contains both guards; `Reflect.getMetadata(ROLES_KEY, UsersController) === ['admin']`; no per-method `__guards__`/roles metadata that widens access) — the technique F4-qa already used successfully.
*Verify [U]:* staff session → 403 `insufficient role`; no session → 401 `login required`.

**NFR-S3 — Passwords and hashes are never logged.** No `console.*` / `Logger` call in `src/users/**` receives a request body, a `password`, a `newPassword`, or a `passwordHash`. At most, a create may log the email only, mirroring `bootstrap-admin.service.ts:30` (`Bootstrap admin created: ${email}`).
*Verify [U/static]:* grep `src/users/**` for `console.`, `Logger`, `logger.` and inspect every argument; also assert no global logging middleware/interceptor was added to `main.ts` (it currently has none).

**NFR-S4 — Hash cost is 12, everywhere.** Both create and reset use `bcrypt.hash(pw, 12)`, the same `SALT_ROUNDS` constant value as `auth.service.ts:6` and `bootstrap-admin.service.ts:5`. Backend should import/redeclare a single `SALT_ROUNDS = 12` in the users service (a shared constant is nice-to-have; consistency of the **value** is the requirement).
*Verify [U]:* the persisted hash matches `/^\$2[aby]\$12\$/`.

**NFR-S5 — Created and reset users are always force-flagged.** `POST /users` always persists `mustChangePassword: true`; `POST /users/:id/reset-password` always persists `mustChangePassword: true`. Neither value is ever taken from the request body.
*Verify [U]:* the `data` object passed to `prisma.dashboardUser.create` contains `mustChangePassword: true` regardless of the body; a body containing `"mustChangePassword": false` still results in `true`.

**NFR-S6 — No mass assignment.** The `data` passed to `create` has exactly the keys `['email','passwordHash','role','mustChangePassword']`; the `data` passed to reset's `update` has exactly `['passwordHash','mustChangePassword']` — never `role`, `email` or `id` (BR-6).
*Verify [U]:* key-set assertions on the Prisma mock call args (the exact assertion style F4-qa used on `changePassword`).

**NFR-S7 — Email uniqueness is enforced by the database, and surfaced as 409.** The `email String @unique` constraint (`schema.prisma:246`) is the authority; a duplicate insert MUST be mapped from Prisma `P2002` to `ConflictException('email already exists')`, never a raw 500.
*Verify [U]:* mock `create` to reject with `{ code: 'P2002' }` (a `Prisma.PrismaClientKnownRequestError`-shaped object) → expect `ConflictException`, status 409, message `email already exists`.

**NFR-S8 — Password rules are unchanged from F4.** `MinLength(8)`, no character-class/entropy/history/expiry rules, no rate limiting, no lockout. Any of these would be a new policy; F5 introduces none (design-doc Non-goal).
*Verify [U]:* BVA — 8 chars accepted, 7 rejected, empty rejected, `null` rejected, a 200-char password accepted.

**NFR-S9 — An admin cannot reset their own password through this endpoint** (BR-5). They must use `POST /auth/change-password`, which proves knowledge of the current password.
*Rationale:* (a) it keeps "prove you know the current password" true for every self-service credential change, so a hijacked admin session cannot silently take over the account without the old password; (b) it prevents an admin from re-arming their own `mustChangePassword` flag and bouncing themselves into the forced-change page.
*Verify [U]:* `:id === req.session.user.id` → 400 `cannot reset your own password`, and `prisma.dashboardUser.update` is **never** called.
*Verify [B]:* the Reset control is not offered on the current admin's own row (matched by `email`, since `CurrentUser` carries no `id` — `AuthContext.tsx:4-8`).

**NFR-S10 — The "at least one admin" invariant holds by construction.** F5 ships **no** endpoint that can delete a user, deactivate a user, or change an existing user's role. Therefore the number of admins is monotonically non-decreasing and an admin cannot lock themselves — or the system — out. **The rule I want, stated for whoever adds those endpoints later:** *any future endpoint that deletes a user, deactivates a user, or changes a user's role away from `admin` MUST reject the request with 400 when it would leave `count(dashboard_users where role = 'admin' and active) === 0`, and MUST additionally reject an admin's attempt to delete or demote their own account.* Not implemented in F5 because there is nothing to guard.
*Verify [U]:* route-inventory assertion — the routes registered by `UsersController` are exactly `GET /users`, `POST /users`, `POST /users/:id/reset-password`; no `@Delete`, no `@Put`, no `@Patch` anywhere in `src/users/**`.

### 2.7 Session invalidation on admin reset — DECIDED: **OUT OF SCOPE, stated plainly**

**Decision: an admin resetting user X's password does NOT invalidate X's existing sessions, and F5 adds no session-revocation mechanism.**

What this means concretely, spelled out so nobody assumes otherwise: if X is logged in when the admin resets their password, X's browser keeps working — X can continue using the dashboard until the session cookie's `maxAge` of **8 hours** (`main.ts:32`) elapses or X logs out. X will not be forced onto `/change-password` in that window either, because the flag is read into the session at **login** (`auth.controller.ts:21-26`) and the reset does not rewrite X's stored session. The next time X logs in, the old password fails and the new one lands them on the forced-change page.

**Why it is out of scope** (not laziness — a cost statement): `connect-redis` stores sessions under opaque `sess:<sid>` keys with no user→session index, so revoking X's sessions would need either a Redis key scan (an O(all sessions) operation with no index) or a new `passwordChangedAt` / token-version column on `DashboardUser` plus a per-request check inside `SessionAuthGuard` — i.e. a schema change **and** a change to the guard that every authenticated route in core-api depends on. That is a materially larger, riskier change than everything else in F5, and F4-qa.md explicitly recorded it as a *hardening candidate*, not a requirement.

**Consequences the owner should know** (also §11 open questions):
- The PM's US3 motivation "they left" is only partially served: a departed staff member retains dashboard access for **at most 8 hours** after the reset, and permanently loses it only because they no longer know the password. There is no immediate revocation and no deactivate/delete endpoint (PM put both out of scope).
- F4-qa carry-forward (1) — no session-ID regeneration on password change — likewise remains open and unchanged.
- F4-qa carry-forward (2) — a session expiring on an already-open form shows "current password is incorrect" — is app-wide pre-existing behavior; F5 does not change it and QA must not raise it against F5.

QA MUST NOT write an AC asserting that a reset kicks the target out. The correct AC is the inverse (AC-23).

---

## 3. Functional requirements

Each traces to a PM story. "MUST" = required for F5 to be accepted.

**FR-01 — List dashboard users (traces US2).** An admin can retrieve every `dashboard_users` row as `UserView[]` via `GET /users`, and the Users screen renders them in a table with columns: email, role, "must change password", created at, and a row action. Non-admins cannot reach the data (NFR-S2) or the screen (FR-07).
*AC:* AC-01, AC-02, AC-03, AC-19, AC-20, AC-25.

**FR-02 — Create a dashboard user (traces US1).** An admin can create an account by supplying email + role + initial password. The account is created with `mustChangePassword: true` so the F4 gate forces the new user to set their own password at first login — F5 adds **no** new forcing mechanism, it only sets the existing flag. On success the list refreshes, the form clears (all three fields, including the password), and a success message names the created email and states that the user must change this password on first login.
*AC:* AC-04..AC-11, AC-22, AC-26.

**FR-03 — Admin-triggered password reset (traces US3).** An admin can set a new password for another user without knowing that user's current password. The target's `passwordHash` is replaced and `mustChangePassword` is re-armed to `true`. Session behavior is governed by §2.7. An admin cannot target themselves (NFR-S9).
*AC:* AC-12..AC-16, AC-23, AC-28, AC-29.

**FR-04 — Self-service change-password entry point (traces US4).** Every logged-in user (admin **or** staff), while **not** forced, can reach the password-change form from the persistent sidebar — a control in the sidebar footer alongside Logout, present in both the expanded (`lg`) and icon-only (`md`) sidebar renderings, with an accessible name. It navigates to the **existing** `/change-password` route; **no new page, no new endpoint, no modal.** The route and page stay exactly as F4 shipped them (chrome-less, sibling of `/login`) — see §9 frozen list, item 3.
*AC:* AC-30, AC-31, AC-32, AC-33.

**FR-05 — Escape hatch for the voluntary path.** Because `/change-password` renders without nav chrome, a *voluntary* visitor MUST have a way back that does not require changing their password: a secondary "Cancel" control rendered **only when `user.mustChangePassword === false`**. A forced visitor MUST NOT see it (they have nowhere to go — the F4 gate would bounce them straight back). Cancel returns to the route the user came from, defaulting to `/students`.
*Implementation shape (recommended, keeps every F4 assertion green):* the sidebar entry passes `state={{ from: location.pathname }}`; `ChangePassword.tsx` reads `useLocation().state?.from` and uses `from ?? '/students'` for **both** Cancel and the post-success `navigate(..., { replace: true })`. A forced arrival carries no state (`ProtectedShell`'s `<Navigate to="/change-password" replace />` passes none), so the forced path still lands on `/students` — F4's AC-14 and QA harness case G3.6 stay green.
*AC:* AC-31, AC-32, AC-33.

**FR-06 — Role selection.** The create form offers exactly two roles via the existing `SelectNative` primitive: `admin` and `staff`. The `staff` option is labelled "Nhân viên (tư vấn / giáo viên)" / "Staff (advisor / teacher)" so the teacher→staff mapping (§0) is self-evident to the owner. The server independently rejects any other value (`@IsIn`), i.e. the client select is convenience, not enforcement.
*AC:* AC-11, AC-26.

**FR-07 — Screen routing and role gating.** A new `/users` route registered in `App.tsx` inside `<ProtectedShell adminOnly>`, and a new admin-only nav item added to `SidebarNav`'s `items[]` (same conditional-spread pattern as `/monitoring` and `/settings` at `App.tsx:44-45`). A staff user navigating to `/users` is redirected to `/students` by the existing `adminOnly` branch; the nav item is not rendered for them. The route must be registered **before** the catch-all `<Route path="*">` (which stays last).
*AC:* AC-24, AC-25.

**FR-08 — Bilingual UI.** Every new user-facing string goes through `t(...)`; both the `vi` and `en` bundles in `src/i18n/index.ts` contain every key in §11, with no dead keys (F4's D2 defect class) and no undefined keys.
*AC:* AC-34.

---

## 4. Non-functional requirements

**NFR-P1 — List size and latency.** `GET /users` is unpaginated. Expected population: **< 20 rows** (one per staff member of a single language centre). Requirement: p95 server-side response time **< 300 ms** for up to 200 rows on the existing single-VPS Postgres. **Trigger for revisiting:** if `dashboard_users` ever exceeds **200 rows**, pagination MUST be added following `StudentsService`'s `PAGE_SIZE = 20` pattern. Until then, pagination is deliberately not built.

**NFR-P2 — Write latency.** `bcrypt.hash(pw, 12)` costs roughly 200–400 ms of CPU on this VPS class. Requirement: p95 **< 1.5 s** end-to-end for `POST /users` and `POST /users/:id/reset-password`. The submit button MUST be disabled while the request is in flight (mirroring `ChangePassword.tsx:103` `disabled={submitting}`) so a double-click cannot create two accounts or issue two hashes.

**NFR-A1 — No new infrastructure dependency.** The users module depends only on `PrismaService` (available globally via `@Global() PrismaModule`). It touches **no** Redis, **no** RabbitMQ, **no** outbound queue, **no** Zalo/LLM/Sheets integration. If Postgres is unavailable the endpoints fail exactly like every other module (500); no new failure mode, no new degraded mode, no cron.

**NFR-A2 — Zero downtime, zero migration.** F5 requires no schema change (§9), so it deploys as a plain `docker compose up -d --build core-api dashboard` with no migration step and no ordering constraint against the F4 migration (already applied).

**NFR-C1 — Convention compliance.** The new module mirrors the shipped conventions exactly: controller/service/dto/module file split (`students/`, `settings/`), Vietnamese code comments (project convention for core-api), class-validator DTOs, guards declared at the controller class level, no new dependency added to `package.json` (bcrypt, class-validator, Prisma are all present).

---

## 5. Use cases

### UC-1 — Admin creates a dashboard account for a new teacher (US1, US2)

- **Actor:** Admin (`DashboardRole = 'admin'`), authenticated, `mustChangePassword === false`.
- **Preconditions:** core-api and dashboard running; at least one admin exists (bootstrap admin has completed its own F4 forced change, otherwise the admin is stuck on `/change-password` and cannot reach `/users` — the gate precedes `adminOnly`).
- **Main flow:**
  1. Admin clicks "Người dùng / Users" in the sidebar (visible only to admins) → `/users`.
  2. The page issues `GET /users` and renders the table.
  3. Admin fills email, picks role `staff`, types an initial password (≥ 8 chars), submits.
  4. Client disables submit, `POST /users` → 201.
  5. Page shows `users.created` (naming the email + "must change password on first login"), clears all three form fields, and re-issues `GET /users`; the new row appears with "must change password = yes".
  6. Admin communicates the email + initial password to the new user out of band (no email infrastructure exists in this repo — design-doc Non-goal).
- **Alternative flows:**
  - *A1 — role `admin` chosen*: identical, row shows role `admin`. No extra confirmation step (not requested).
  - *A2 — admin creates several accounts in a row*: the cleared form allows immediate re-entry; each create is independent.
- **Exceptions:**
  - *E1 — duplicate email*: 409 → inline destructive `Alert` with `users.emailExists`; nothing is created; the form keeps its values so the admin can edit the email (but the password field is **not** re-sent in cleartext anywhere except the same in-memory field it already occupied).
  - *E2 — password < 8 chars*: the client's `minLength={8}` + `required` blocks submission; if it still reaches the server, 400 → `users.invalid`.
  - *E3 — malformed email*: `type="email"` + server `@IsEmail()` → 400 → `users.invalid`.
  - *E4 — session expired mid-form*: 401. Because `api/client.ts` does not distinguish, the UI shows `users.error`; the user's next navigation hits `ProtectedShell` and is redirected to `/login`. (Same app-wide limitation as F4 carry-forward (2); not a new defect.)
  - *E5 — staff user calls `POST /users` directly with curl*: 403 `insufficient role`, nothing created.
- **Postconditions:** exactly one new `dashboard_users` row with `must_change_password = true` and a cost-12 bcrypt hash; no other table, queue or Redis key modified.

### UC-2 — The created user logs in for the first time (integration with F4 — no new F5 code)

- **Actor:** the newly created staff user.
- **Preconditions:** UC-1 completed; the user knows the email + initial password.
- **Main flow:** login → `POST /auth/login` 200 with `mustChangePassword: true` → `Login.tsx`'s untouched `navigate('/settings')` → `ProtectedShell` gate redirects to `/change-password` (F4 gate, step 3, before `adminOnly`, so a staff user is *not* first bounced to `/students`) → user sets a new password → flag cleared in DB **and** live session → `navigate('/students')` → full chrome.
- **Alternative flow:** *A1* — the user is an admin: identical; the gate precedes `adminOnly` so `/settings` is not reachable until the change is done.
- **Exceptions:** *E1* — the user types the wrong initial password on the change form → 401 → `changePassword.error` (F4 behavior, unchanged).
- **Postconditions:** `must_change_password = false` for that row; the initial password chosen by the admin is no longer valid.
- **Note:** this use case is **entirely F4 code**. F5's only contribution is having set the flag. This is the "reuse for free" the design doc's Goals promised, and it is the reason F5 needs no forcing logic of its own.

### UC-3 — Admin resets a locked-out user's password (US3)

- **Actor:** Admin.
- **Preconditions:** the target user exists and is not the acting admin.
- **Main flow:**
  1. Admin opens `/users`, clicks "Đặt lại mật khẩu / Reset password" on the target's row.
  2. The row enters an inline edit state (same pattern as `Students.tsx`'s `editingId`/`draft`) exposing one `type="password"` input + a confirm button. **No modal** — the codebase has no Dialog primitive.
  3. Admin types the new password (≥ 8) and confirms → `POST /users/:id/reset-password` → 200.
  4. Row exits edit state, list refreshes, the row's "must change password" now reads yes; `users.resetDone` is shown.
  5. Admin communicates the new password out of band.
- **Alternative flows:** *A1* — admin cancels the inline edit → no request is sent, no state changes.
- **Exceptions:**
  - *E1 — admin targets their own row*: the action is not offered (row matched by `email === currentUser.email`); if forced by a direct API call → 400 `cannot reset your own password`, no write.
  - *E2 — the user was deleted from the DB out of band*: 404 → `users.notFound`; the list refresh removes the row.
  - *E3 — password < 8*: client `minLength` blocks; server 400 → `users.invalid`.
- **Postconditions:** target row has a new cost-12 hash and `must_change_password = true`; `role`, `email`, `id`, `created_at` unchanged; the target's live sessions are **untouched** (§2.7).

### UC-4 — Any user voluntarily changes their own password (US4)

- **Actor:** any logged-in user (admin or staff) with `mustChangePassword === false`.
- **Preconditions:** authenticated; the user knows their current password.
- **Main flow:** clicks "Đổi mật khẩu / Change password" in the sidebar footer → `/change-password` (chrome-less, carrying `state.from`) → fills current + new + confirm → `POST /auth/change-password` (F4 endpoint, unchanged) → 200 → `AuthContext.setUser` → redirected back to `from`.
- **Alternative flows:**
  - *A1 — user clicks Cancel*: returns to `from` (default `/students`) with no request sent.
  - *A2 — forced user arrives via the gate*: no Cancel is rendered; success goes to `/students` — F4 behavior, bit-for-bit.
- **Exceptions:** *E1* wrong current password → 401 → `changePassword.error`; *E2* new ≠ confirm → client-side `changePassword.mismatch`, no request; *E3* new === current → client-side `changePassword.sameAsCurrent`, no request. All three are shipped F4 behavior and must remain unchanged.
- **Postconditions:** the user's own hash is replaced; `mustChangePassword` stays/becomes `false`; the session remains valid (no re-login).

---

## 6. Business rules

- **BR-1** — Dashboard accounts are created by an admin only. There is no self-registration and no invite-by-email flow (no email infrastructure exists in this repo).
- **BR-2** — Every account created or reset by an admin starts in the forced-change state (`mustChangePassword = true`). An admin-chosen password is a one-time credential, never a durable one.
- **BR-3** — `email` uniquely identifies a dashboard account (DB unique index). Emails are stored **normalized**: `trim()` + `toLowerCase()` applied in the service before persisting (see open question Q2 for the login-side caveat).
- **BR-4** — Proving knowledge of the current password is required for **self**-service changes (`/auth/change-password`) and is impossible-by-definition for **admin** resets (`/users/:id/reset-password`). These are two distinct endpoints with two distinct guard sets; neither may be collapsed into the other.
- **BR-5** — An admin may not reset their own password via the admin endpoint (NFR-S9). Self-service is the only path for one's own credentials.
- **BR-6** — A password reset changes exactly two columns: `password_hash` and `must_change_password`. Role, email, id and created_at are immutable in F5.
- **BR-7** — F5 provides no way to delete, deactivate, or re-role an account (PM out-of-scope). Consequently the admin count can never drop (NFR-S10).
- **BR-8** — Two roles exist: `admin` and `staff`; "teacher" is `staff` (§0). Admin-only surfaces are exactly phân hệ 1 (`/settings`, `/monitoring`, DLQ, media deletion) plus, new in F5, `/users`.
- **BR-9** — Minimum password length is 8 characters, everywhere, with no other complexity, history, expiry, lockout, or rate-limiting rule.
- **BR-10** — F5 introduces no student-facing, Zalo-facing, or LLM-facing behavior whatsoever. Nothing here may publish to a queue or send a message.

---

## 7. Data dictionary

### 7.1 `POST /users` request (`CreateUserDto`)

| Field | Type | Required | Validation | Notes |
|---|---|---|---|---|
| `email` | string | yes | `@IsEmail()`; service applies `trim().toLowerCase()`; DB-unique | 409 on duplicate |
| `role` | `'admin' \| 'staff'` | yes | `@IsIn(['admin','staff'])` | maps to Prisma `DashboardRole` |
| `password` | string | yes | `@IsString() @MinLength(8)` | never stored/logged in clear; hashed at cost 12 |
| *(any other key)* | — | — | stripped by `ValidationPipe({whitelist:true})` | mass-assignment guard |

### 7.2 `POST /users/:id/reset-password` request (`ResetPasswordDto`)

| Field | Type | Required | Validation | Notes |
|---|---|---|---|---|
| `id` (route param) | int | yes | `ParseIntPipe`; must exist (404); must ≠ session user id (400) | — |
| `newPassword` | string | yes | `@IsString() @MinLength(8)` | no `currentPassword` field by design (BR-4) |

### 7.3 `UserView` response

| Field | Type | Nullable | Source |
|---|---|---|---|
| `id` | int | no | `dashboard_users.id` |
| `email` | string | no | `dashboard_users.email` |
| `role` | `'admin' \| 'staff'` | no | `dashboard_users.role` |
| `mustChangePassword` | boolean | no | `dashboard_users.must_change_password` (F4 column) |
| `createdAt` | string (ISO-8601) | no | `dashboard_users.created_at` |
| ~~`passwordHash`~~ | — | — | **NEVER selected, NEVER returned** (NFR-S1) |

### 7.4 Persisted entity (existing — `DashboardUser`, `schema.prisma:244-253`)

| Column | Prisma field | Type | Constraints | Written by F5? |
|---|---|---|---|---|
| `id` | `id` | Int | PK, autoincrement | no (generated) |
| `email` | `email` | String | `@unique` | yes, on create only |
| `password_hash` | `passwordHash` | String | not null | yes, on create + reset |
| `role` | `role` | `DashboardRole` | enum(admin,staff) | yes, on create only |
| `must_change_password` | `mustChangePassword` | Boolean | `@default(false)` | yes, always `true` on create + reset |
| `created_at` | `createdAt` | DateTime | `@default(now())` | no (generated) |

---

## 8. Per-file behavior inventory

### 8.1 Backend (`services/core-api`)

**NEW `src/users/users.module.ts`** — `@Module({ controllers: [UsersController], providers: [UsersService] })`. **No `imports`, no guard providers**: `PrismaService` comes from the `@Global()` `PrismaModule`, and `RolesGuard`'s only dependency (`Reflector`) is provided by Nest itself. Precedent: `monitoring.module.ts` is exactly this shape while its controller uses `@UseGuards(SessionAuthGuard, RolesGuard)`.

**NEW `src/users/users.controller.ts`** — class-level `@Controller('users') @UseGuards(SessionAuthGuard, RolesGuard) @Roles('admin')`; three handlers per §1.1–1.3. The reset handler reads `req.session.user!.id` (guaranteed by the guard) to enforce BR-5 **in the controller or the service — but it must be enforced before any DB write**; passing the acting admin's id into the service (e.g. `reset(targetId, actingAdminId, newPassword)`) is the recommended shape because it keeps the rule unit-testable without a mock `Request`.

**NEW `src/users/users.service.ts`** — `SALT_ROUNDS = 12`; `list()`, `create(dto)`, `resetPassword(targetId, actingAdminId, newPassword)`; a private `USER_SELECT` const holding the §1.0 `select`. Maps P2002→409, P2025/absent→404. Vietnamese comments per core-api convention.

**NEW `src/users/dto/create-user.dto.ts`**, **NEW `src/users/dto/reset-password.dto.ts`** — §1.5, §1.6 verbatim.

**NEW specs** — `users.service.spec.ts`, `users.controller.spec.ts`, `dto/create-user.dto.spec.ts` (+ reset DTO cases). Follow `auth.service.spec.ts`'s style: `jest.fn()`-mocked `prisma.dashboardUser`, real bcrypt (its cost-12 calls are the slow part — keep the number of real hashes small, or assert the cost prefix on a single one).

**MODIFIED `src/app.module.ts`** — one import line + `UsersModule` in the `imports` array. Nothing else.

**NOT MODIFIED (must show zero diff):** every file under `src/auth/` (`auth.controller.ts`, `auth.service.ts`, `session-auth.guard.ts`, `roles.guard.ts`, `roles.decorator.ts`, `session.types.ts`, `bootstrap-admin.service.ts`, `auth.module.ts`, `dto/login.dto.ts`, `dto/change-password.dto.ts` and all their specs), `prisma/schema.prisma`, `prisma/migrations/**`, `src/main.ts`, all three `contracts.*` files, `package.json`/`package-lock.json`.

### 8.2 Frontend (`services/dashboard`)

**NEW `src/pages/Users.tsx`** — admin-only screen. Structure mirrors `Students.tsx` (`main#main-content.space-y-6.p-6` → `h1.text-h1` → content):
- A create `Card` with a `<form>`: `Input type="email"`, `SelectNative` for role (two `<option>`s), `Input type="password" minLength={8} autoComplete="new-password"`, submit `Button` disabled while in flight. Errors and the success message use the single-slot `Alert` pattern (`variant="destructive" role="alert"` for errors; `variant="default"`/`Badge`-free success line is fine, but it must have `role="status"` or be announced via the same `Alert` element to stay consistent with the app's one-alert-slot convention).
- A `Card > Table` listing users: columns `users.email`, `users.role`, `users.mustChangePassword` (rendered as `common.yes`/`common.no`), `users.createdAt`, action.
- Inline reset: `resettingId` + a draft password string in state (the `editingId`/`draft` pattern from `Students.tsx:32-33`), a `type="password"` input in the row plus confirm/cancel buttons. The action is **omitted for the row whose `email === user.email`** (NFR-S9 client half).
- Data loading with `api.get<UserView[]>('/users')` in a `useEffect`, refetched after create and after reset — same `load()` shape as `Students.tsx:35-41`. No spinner (project-wide convention).

**MODIFIED `src/App.tsx`** — (a) import `Users`; (b) add `{ to: '/users', label: t('nav.users'), icon: IconUsers }` to `SidebarNav`'s `items[]` using the same admin conditional-spread as lines 44-45 — adding it to `items[]` gives both the `lg` list and the `md` icon-only/Tooltip list for free; (c) register `<Route path="/users" element={<ProtectedShell adminOnly><Users /></ProtectedShell>} />` **before** the catch-all; (d) add the sidebar-footer "Change password" control next to the existing Logout `Button` (same `variant="ghost" className="justify-start gap-3 px-3"` + `aria-label` + icon + `<span className="md:hidden lg:inline">` treatment, navigating to `/change-password` with `state={{ from: location.pathname }}`). **The `ProtectedShell` gate body (lines 129-136) must not be touched.**

**MODIFIED `src/components/icons.tsx`** — add `IconUsers` (and, if UX wants a distinct one, `IconKey`) following the existing `SVGProps<SVGSVGElement>` + `stroke="currentColor"` convention. Icon choice/geometry is F5-ux's call, not BA's.

**MODIFIED `src/pages/ChangePassword.tsx`** — the **only** two changes permitted: (a) read `useLocation().state?.from` and use `from ?? '/students'` as the post-success navigation target; (b) render a Cancel control **only** when `!user.mustChangePassword`, navigating to the same `from ?? '/students'`. Everything else on that page — the three fields, the mismatch/same-as-current pre-checks, the 400-vs-other error mapping, the `disabled={submitting}` guard, the `loading`/`!user` guards added in F4's round-2 fix, the chrome-less layout — is frozen.

**MODIFIED `src/i18n/index.ts`** — the §11 keys in both `vi` and `en`. No other key touched.

**NOT MODIFIED:** `src/auth/AuthContext.tsx` (F5 needs no new context state — `CurrentUser.email` is enough to detect one's own row), `src/api/client.ts`, `src/pages/Login.tsx`, all other pages, `package.json`.

---

## 9. Frozen behavior (MUST still work identically after F5)

1. **F4 forced-change flow, end to end**: bootstrap/created user logs in → `mustChangePassword: true` in the login body and session → `ProtectedShell` redirects **every** `ProtectedShell` route (including `adminOnly` ones) to `/change-password` → change succeeds → flag cleared in DB and live session → `/students` with chrome, no re-login.
2. **Gate precedence in `ProtectedShell`**, exactly: `loading → !user → mustChangePassword → adminOnly` (`App.tsx:129-136`). No reordering, no new gate inserted.
3. **`/change-password` stays a sibling of `/login`, outside `ProtectedShell`, chrome-less** (no `<aside>`, no `<nav>`). F4's AC-15 and QA harness cases G2.12/G3.9 must still pass. *This is why FR-04 adds only an entry point and not a chromed variant of the page.*
4. **`Login.tsx`'s `navigate('/settings')` line stays untouched** (`Login.tsx:24`).
5. **`POST /auth/change-password` contract unchanged**: `SessionAuthGuard` only (never `RolesGuard`), still requires `currentPassword`, still returns `{ email, role, mustChangePassword: false }`.
6. **`POST /auth/login`, `POST /auth/logout`, `GET /auth/me`** unchanged in shape and behavior.
7. **`BootstrapAdminService`** unchanged — still the seed path, still `mustChangePassword: true`, still gated on an empty table + env vars.
8. **Existing role gating unchanged**: the 4 `@Roles('admin')` sites keep their behavior; staff still get redirected from `adminOnly` routes to `/students`; every currently role-agnostic controller stays role-agnostic.
9. **Session model unchanged**: `express-session` + `connect-redis`, 8h cookie, no regeneration, no revocation (§2.7).
10. **`api/client.ts` unchanged** — status-only error mapping (§1.4).
11. **`App.tsx`'s catch-all `<Route path="*" element={<Navigate to="/students" replace />} />` stays last.**
12. **All 117 existing core-api jest tests stay green**; the dashboard `tsc -b && vite build` stays clean; zalo-gateway (26) and grading-worker (60) suites untouched.

---

## 10. Acceptance criteria (numbered, Given/When/Then)

Tags: **[U]** = unit-testable in core-api jest, no browser. **[B]** = browser/DOM-level; QA has no browser automation but demonstrated in F4 round 2 that a throwaway Vite-SSR + jsdom harness (installed `--no-save`, deleted after the run) can execute React components and `MemoryRouter` routing — every `[B]` below is written to be reachable that way, except where noted `[B-manual]`.

### Backend — list

**AC-01 [U]** Given three `dashboard_users` rows, When an admin session calls `GET /users`, Then the 200 body is an array of 3 objects whose key set is exactly `['createdAt','email','id','mustChangePassword','role']` for every element, ordered by `createdAt` ascending.

**AC-02 [U]** Given `UsersService.list()`, When it runs, Then `prisma.dashboardUser.findMany` is called with a `select` that includes `passwordHash: false`/omits it entirely, and the string `passwordHash` appears nowhere in the serialized response.

**AC-03 [U]** Given `UsersController`, When its Nest metadata is inspected, Then the class carries `SessionAuthGuard` **and** `RolesGuard` in `__guards__` and `ROLES_KEY === ['admin']`, and no handler declares metadata that widens this.

### Backend — create

**AC-04 [U]** Given a valid `{email, role:'staff', password}`, When `POST /users` is handled, Then `prisma.dashboardUser.create` receives `data` with exactly the keys `['email','mustChangePassword','passwordHash','role']`, `mustChangePassword === true`, and `passwordHash` matching `/^\$2[aby]\$12\$/` with `bcrypt.compare(password, hash) === true`.

**AC-05 [U]** Given a successful create, When the response is returned, Then the status is **201** and the body is the `UserView` of the new row with `mustChangePassword: true` and no `passwordHash` key.

**AC-06 [U]** Given `email = "  Teacher@ILM.Local  "`, When the user is created, Then the persisted email is `"teacher@ilm.local"` (trimmed + lowercased).

**AC-07 [U]** Given `prisma.dashboardUser.create` rejects with a Prisma error whose `code === 'P2002'`, When `POST /users` runs, Then a `ConflictException` is thrown → HTTP **409** with message `email already exists` (not a 500).

**AC-08 [U]** Given a request body containing extra properties `{ id: 99, passwordHash: 'x', mustChangePassword: false }` alongside valid fields, When the global `ValidationPipe({whitelist:true})` and the service run, Then those properties never reach Prisma and the created row still has `mustChangePassword === true`.

**AC-09 [U]** Given `password` of exactly 8 characters, When validated, Then it is ACCEPTED; Given 7 characters, empty string, `null`, or a non-string, Then it is REJECTED with HTTP **400** and no row is created.

**AC-10 [U]** Given `email = "not-an-email"`, When validated, Then HTTP **400** and no row is created.

**AC-11 [U]** Given `role = "teacher"` (or `"Admin"`, `"superadmin"`, missing), When validated, Then HTTP **400** and no row is created — i.e. the only accepted values are `admin` and `staff` (§0).

### Backend — reset

**AC-12 [U]** Given an existing target user id ≠ the acting admin's id and a valid `newPassword`, When `POST /users/:id/reset-password` runs, Then `prisma.dashboardUser.update` is called once with `where:{id: target}` and `data` keys exactly `['mustChangePassword','passwordHash']`, `mustChangePassword === true`, the new hash matches `/^\$2[aby]\$12\$/`, `bcrypt.compare(newPassword, hash) === true`, and the 200 body is the target's `UserView` with `mustChangePassword: true` and no hash.

**AC-13 [U]** Given `newPassword` shorter than 8 (or missing / non-string), When the request is validated, Then HTTP **400** and `update` is never called. Exactly 8 characters is accepted (BVA).

**AC-14 [U]** Given an id that does not exist, When the reset runs, Then HTTP **404** with message `user not found` and no write occurs.

**AC-15 [U]** Given `:id` equal to `req.session.user.id`, When the reset runs, Then HTTP **400** with message `cannot reset your own password` and `prisma.dashboardUser.update` is **never** called.

**AC-16 [U]** Given any successful reset, When the Prisma call args are inspected, Then `data` contains **no** `role`, `email` or `id` key (BR-6).

### Backend — security invariants

**AC-17 [U]** Given the whole `src/users/**` tree, When routes are enumerated, Then exactly three exist — `GET /users`, `POST /users`, `POST /users/:id/reset-password` — and there is **no** `@Delete`, `@Put` or `@Patch` decorator anywhere in the module (NFR-S10).

**AC-18 [U/static]** Given `src/users/**`, When every `console.*` / `Logger` / `logger.*` call is inspected, Then no argument is or contains a request body, `password`, `newPassword`, or `passwordHash`; and `src/main.ts` still registers no request-logging middleware/interceptor.

**AC-19 [U]** Given a session whose `role === 'staff'`, When any of the three routes is called, Then `RolesGuard` throws → HTTP **403** `insufficient role`, and no service method runs.

**AC-20 [U]** Given no session at all, When any of the three routes is called, Then `SessionAuthGuard` throws → HTTP **401** `login required` before any handler logic.

**AC-21 [U]** Given the pre-F5 core-api suite (117 tests, 22 suites), When the full suite is re-run after F5, Then all 117 still pass and the new users specs are additive (no modified expectations in `auth/**`).

**AC-22 [U]** Given a user created through `POST /users` with initial password `P`, When `AuthService.validate(email, P)` is called, Then it returns that user with `mustChangePassword === true` (proving the F4 forced flow is armed by an F5-created account — the "reuse for free" claim).

**AC-23 [U]** Given a successful admin reset, When the code path is inspected, Then **no** session store is touched: `UsersService` has no `RedisService` (or session-store) constructor dependency and the reset makes no Redis call. (This asserts the §2.7 decision **as intended behavior**; QA must not invert it.)

### Frontend

**AC-24 [B]** Given a logged-in **staff** user (flag false) navigating to `/users`, Then `ProtectedShell`'s `adminOnly` branch redirects to `/students`; Given an **admin**, Then `/users` renders with nav chrome. (Mirrors F4 harness cases G2.8/G2.9.)

**AC-25 [B]** Given the sidebar, Then the "Users" nav item is present for `role === 'admin'` and absent for `role === 'staff'` — in both the `lg` list and the `md` icon-only list.

**AC-26 [B]** Given the create form with a valid email, role `staff` and an 8+ char password, When submitted, Then exactly one `POST /users` is issued, the submit button is disabled while in flight, and on success all three fields are cleared, a success message naming the email is shown, and `GET /users` is re-issued.

**AC-27 [B]** Given the API responds **409**, When the create promise rejects, Then the destructive `Alert` shows `users.emailExists` (status-only mapping, §1.4) and the form values are retained.

**AC-28 [B]** Given the current admin's own row in the table (matched by `email === user.email`), Then no reset control is rendered for it, while every other row has one.

**AC-29 [B]** Given the reset control on another user's row, When clicked, Then an inline `type="password"` input appears; When a valid password is confirmed, Then exactly one `POST /users/:id/reset-password` is issued and the list is refetched; When cancelled, Then **zero** API calls are made.

**AC-30 [B]** Given any logged-in user (admin **or** staff, flag false), Then a "Change password" control is present in the sidebar footer with an accessible name, and activating it navigates to `/change-password`.

**AC-31 [B]** Given `/change-password` rendered for a user with `mustChangePassword === false`, Then a Cancel control is present; Given `mustChangePassword === true`, Then **no** Cancel control is rendered.

**AC-32 [B]** Given a voluntary visit that arrived with `state.from === '/submissions'`, When Cancel is activated (or the change succeeds), Then the app navigates to `/submissions`; Given no `state.from` (the forced path), Then it navigates to `/students`.

**AC-33 [B]** Given F4's shipped behaviors, When the F4 jsdom harness cases G1.1–G1.6, G2.1–G2.13 and G3.1–G3.9 are re-run against the F5 tree, Then all still pass — specifically: the gate order, the chrome-less `/change-password`, the unauthenticated redirect to `/login`, and the forced-path `/students` landing.

**AC-34 [B/scripted]** Given the i18n bundles, Then vi and en have identical key sets, every key in §11 exists in both, every new user-facing string in `Users.tsx` and the modified `App.tsx`/`ChangePassword.tsx` goes through `t(...)` (no literal JSX text nodes, no literal `placeholder`/`aria-label`/`title`/`alt`), there are **zero** dead keys and **zero** undefined keys.

**AC-35 [B-manual]** Given the running stack (`docker compose up -d --build`), When an admin creates a user and that user logs in with the initial password, Then they are redirected to `/change-password`, can set a new password, and land on `/students` — the real end-to-end proof of UC-1 + UC-2. (Requires a live stack and `infra/.env` secrets; not reproducible in the agent environment.)

---

## 11. i18n keys (exact — add to BOTH `vi` and `en` in `services/dashboard/src/i18n/index.ts`)

| key | vi | en |
|---|---|---|
| `nav.users` | Người dùng | Users |
| `nav.changePassword` | Đổi mật khẩu | Change password |
| `users.title` | Quản lý người dùng | User management |
| `users.create` | Tạo người dùng | Create user |
| `users.email` | Email | Email |
| `users.role` | Vai trò | Role |
| `users.roleAdmin` | Quản trị viên | Admin |
| `users.roleStaff` | Nhân viên (tư vấn / giáo viên) | Staff (advisor / teacher) |
| `users.password` | Mật khẩu ban đầu | Initial password |
| `users.submit` | Tạo | Create |
| `users.created` | Đã tạo {{email}} — người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên | Created {{email}} — they must change this password at first login |
| `users.mustChangePassword` | Phải đổi mật khẩu | Must change password |
| `users.createdAt` | Ngày tạo | Created at |
| `users.reset` | Đặt lại mật khẩu | Reset password |
| `users.newPassword` | Mật khẩu mới | New password |
| `users.resetConfirm` | Xác nhận đặt lại | Confirm reset |
| `users.resetCancel` | Hủy | Cancel |
| `users.resetDone` | Đã đặt lại mật khẩu — người dùng phải đổi ở lần đăng nhập kế tiếp | Password reset — they must change it at next login |
| `users.emailExists` | Email này đã tồn tại | This email already exists |
| `users.invalid` | Dữ liệu không hợp lệ (email sai định dạng hoặc mật khẩu dưới 8 ký tự) | Invalid input (bad email format or password shorter than 8 characters) |
| `users.notFound` | Không tìm thấy người dùng | User not found |
| `users.forbidden` | Bạn không có quyền thực hiện thao tác này | You do not have permission for this action |
| `users.error` | Không thực hiện được, vui lòng thử lại | The action failed, please try again |
| `users.empty` | Chưa có người dùng nào | No users yet |
| `changePassword.cancel` | Hủy | Cancel |
| `common.yes` | Có | Yes |
| `common.no` | Không | No |

Notes for frontend: `users.created` uses interpolation (`t('users.created', { email })`) — the bundle already contains interpolating keys (`monitoring.diskAlert`, `submissions.pilotProviderModel`), so QA's i18n audit resolves them. **Every key above must be referenced somewhere** — F4's D2 defect was a single dead key; do not ship one. If the implementation ends up not needing a key (e.g. `users.forbidden` if you decide the 403 branch is unreachable), **delete it from both bundles** rather than shipping it unused. `common.yes`/`common.no` are new namespaces; if a `Badge` is used instead of text for the flag column, keep them only if still referenced.

---

## 12. Schema impact for the DBA — **NONE**

**F5 requires no schema change, no migration, and no `prisma generate` run.** `DashboardUser` (`schema.prisma:244-253`) already has every column this feature reads or writes: `id`, `email` (`@unique` — the constraint backing the 409), `passwordHash`, `role` (`DashboardRole` enum with both needed values), `mustChangePassword` (added and migrated by F4 as `20260722110000_add_must_change_password`), `createdAt`. The `F5-dba.md` task file can legitimately be closed as a **no-op** — that is the correct outcome, not an omission.

Explicitly **not** proposed (would be inventing work): no `updatedAt`, no `createdBy`, no `lastLoginAt`, no `isActive`, no `passwordChangedAt`/token-version column, no audit table. The first three are PM out-of-scope items; the last two would only be needed if §2.7's session-revocation decision were reversed.

The only DB-adjacent requirement is a **read** one: `GET /users` must use a projection (`select`) rather than `findMany()` with no arguments, so `password_hash` is never even loaded into the API process (NFR-S1).

---

## 13. Assumptions

- **A1 (unconfirmed by the owner)** — "Teacher" is the existing `staff` role; no third `DashboardRole` value. Fully argued in §0, mitigated by the `users.roleStaff` label. Escalate only if the owner rejects it after seeing the dropdown.
- **A2** — Initial and reset passwords are communicated to the user **out of band** (chat/phone/in person). There is no mail transport anywhere in this repo and the design doc rules out an email/notification flow.
- **A3** — The dashboard-user population stays small (< 20, hard revisit trigger at 200 — NFR-P1), so an unpaginated list is correct.
- **A4** — The acting admin is trusted with the plaintext initial password they themselves choose; F5 introduces no generated-password or one-time-link mechanism (not requested).
- **A5** — `req.session.user.id` is always present behind `SessionAuthGuard` (written at login, `auth.controller.ts:21-26`), so BR-5's self-check has a reliable id to compare against.

## 14. Dependencies

- **F4 must be deployed** (migration `20260722110000_add_must_change_password` applied, new core-api build running). F5's whole value proposition — created users are forced to change their password — is F4 code. Per `F4-devops.md`, that deployment is still an **owner action** (apply migration + set `SESSION_SECRET`/`CORE_API_BOOTSTRAP_ADMIN_*` in the untracked `infra/.env`).
- **At least one usable admin account must exist** before `/users` is reachable at all — the bootstrap admin, having completed its own forced change (the gate precedes `adminOnly`, so a still-flagged admin cannot open `/users`).
- No new npm/pip dependency. bcrypt, class-validator, Prisma, `SelectNative`, `Table`, `Alert` all already ship.
- Downstream roles: **UX** owns the `/users` screen layout, the sidebar footer control's icon/placement, and the Cancel control's appearance; **DBA** is a no-op (§12); **Backend** and **Frontend** build §8; **QA** verifies §10 with §2 as the priority section.

## 15. Blockers / open questions

None blocking. Four items for the owner/PM, all with a stated default so work proceeds:

- **Q1 (owner, non-blocking)** — Confirm A1: is "teacher" the same as `staff`? Default: yes (§0). Cost of reversing is quantified in §0.
- **Q2 (follow-up feature, out of F5 scope)** — Login is **case-sensitive** on email (`AuthService.validate` does `findUnique({ where: { email } })` on the raw input). F5 normalizes stored emails to lowercase (BR-3), which makes uniqueness robust but means a user typing `Teacher@ILM.local` at login gets a 401. Fixing this means touching `AuthService.validate`, which F4 froze and QA regression-tested. **Recommendation:** a small follow-up feature that lowercases the email in `validate()` (and optionally backfills existing rows). Until then, the admin should communicate the exact lowercase email shown in the users table — which is why the table displays the stored value.
- **Q3 (owner awareness)** — A password reset does **not** evict the target's live sessions (§2.7): a departed staff member keeps dashboard access for up to 8 hours. Combined with PM's exclusion of delete/deactivate, there is currently **no immediate way to revoke access**. If the owner considers that unacceptable, the fix is a follow-up feature (deactivate flag + guard check, or session revocation) — not a tweak to F5.
- **Q4 (UX, not a product question)** — Exact placement/iconography of the sidebar "Change password" control (footer next to Logout is BA's recommendation; it is the only persistent chrome that exists for both roles). F5-ux decides.

## Notes for the next role

- **Backend**: build `src/users/` per §1 and §8.1; the three status codes that must be distinct are **409** (duplicate email), **404** (unknown id), **400** (validation *and* self-reset) — the SPA cannot read error bodies (§1.4), so do not collapse them. Enforce BR-5 before any write. Never `select` `passwordHash`. Reuse the value `12` for salt rounds. Register `UsersModule` in `app.module.ts`; no guard providers needed (`monitoring.module.ts` precedent).
- **Frontend**: only **five** files change (§8.2) — new `pages/Users.tsx`, plus `App.tsx`, `icons.tsx`, `ChangePassword.tsx` (two narrowly-scoped edits only), `i18n/index.ts`. Do **not** touch `AuthContext.tsx`, `api/client.ts`, `Login.tsx`, or `ProtectedShell`'s gate body. Own-row detection is by `email`, because `CurrentUser` has no `id`.
- **QA**: §2 is the priority section — hash leakage, role gating, mass assignment, the self-reset rule, and the absence of delete/role-change routes. AC-01..AC-23 are jest-verifiable; AC-24..AC-34 are reachable with the jsdom harness technique you built in F4 round 2; AC-35 needs a live stack. **Do not** write an AC asserting that an admin reset invalidates the target's sessions — §2.7 rules that explicitly out of scope, as F4 did for server-side gate enforcement.
- **UX**: the `/change-password` page must stay chrome-less and outside `ProtectedShell` (frozen item 3) — F5 adds an entry point and a conditional Cancel, not a chromed variant.

Handoff to Design + Dev + QA: F5 adds an admin-only `users/` module — `GET /users` (UserView[] via a Prisma `select` that never touches `passwordHash`), `POST /users` (201; email/role/password; always persists `mustChangePassword: true` so F4's forced-change flow arms for free; P2002 → 409 `email already exists`), and `POST /users/:id/reset-password` (200; no `currentPassword` by design; re-arms the flag; 404 unknown id; **400 if an admin targets their own id** — self-service must go through F4's `/auth/change-password`) — all three behind class-level `SessionAuthGuard + RolesGuard + @Roles('admin')` copied from `settings.controller.ts`; plus a dashboard `/users` screen (`ProtectedShell adminOnly`, `Students.tsx` list + inline-edit pattern, `SelectNative` role dropdown, own-row reset suppressed) and a sidebar "Change password" entry to F4's existing chrome-less `/change-password` page with a Cancel control shown only to non-forced users; "teacher" is CONFIRMED as the existing `staff` role (new-enum cost priced out in §0); admin resets deliberately do **not** invalidate the target's live sessions (≤8h residual access, rationale and cost in §2.7); **zero schema change — DBA is a no-op**; 35 numbered ACs (23 core-api-jest-verifiable, 11 jsdom-harness-reachable, 1 live-stack-manual), 27 i18n keys in vi+en, and a 12-item frozen-behavior list guarding everything F4 shipped.
