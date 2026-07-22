# F5 · PM — Dashboard user management (create user, change password)

- **Owner role:** pm
- **Feature:** F5 — Admin-only "create dashboard user" (teacher/staff) reusing F4's `mustChangePassword` mechanism, plus a self-service "change my password" entry point for any logged-in user. Item 3 of the owner's raw request.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F4-pm.md` (this feature reuses F4's `mustChangePassword` field, `POST /auth/change-password`, and `/change-password` route/gate — do not re-implement any of those, only extend)

## Inputs (what this role received)

- Owner's raw request item 3: "User settings → create new user for teacher, change password, etc. (admin user-management)."
- Orchestrator's framing: decide whether "teacher" is a new `DashboardRole` or maps to existing `staff`.
- F4-pm.md (read): `mustChangePassword`, `POST /auth/change-password`, `/change-password` route + `ProtectedShell` gate already exist as of F4 — this feature is additive on top.
- Current code read: `services/core-api/prisma/schema.prisma` (`enum DashboardRole { admin staff }`, `DashboardUser` model), `services/core-api/src/auth/bootstrap-admin.service.ts` (only existing user-creation path), `services/dashboard/src/App.tsx` (nav items, `ProtectedShell adminOnly` pattern), `services/dashboard/src/pages/Settings.tsx` region (admin-only settings screen, pattern to extend or add a sibling page).
- CLAUDE.md hard constraint: 2 roles only (`admin`/`staff`) documented as the deliberate M2 design (`staff` = "tư vấn/GV", i.e. advisor **and** teacher already share one role in the current model).

## Checklist

- [x] Read F4-pm.md for the mechanism this feature reuses
- [x] Read schema/auth code to confirm current role model
- [x] Resolve the "teacher = new role or maps to staff" ambiguity (state assumption, since it's genuinely ambiguous but not blocking)
- [x] Write user stories + acceptance criteria for create-user and self-service change-password
- [x] Define new API surface (`users/` module) additively
- [x] Flag in-scope vs out-of-scope (deactivation, role changes, etc.)

## Outputs

### Resolved ambiguity: "teacher" role

**Decision (assumption, not escalated):** "Teacher" maps to the existing `staff` `DashboardRole` — no new enum value. Rationale: `CLAUDE.md`'s architecture doc already documents `staff` as covering "tư vấn/GV" (advisor **and** teacher) as one merged role for dashboard purposes (phân hệ 2-5 access, no phân hệ-1-only restriction distinguishing them). The owner's request says "create new user for teacher" but the *only* other things requested are password-related, not role-permission differentiation — there is no stated need for teachers to see something staff/advisors can't or vice versa. Adding a third enum value would be additive-safe schema-wise, but introducces a permissions question (what can a "teacher" do that "staff" can't?) that nothing in the request answers, so it's YAGNI until asked for. If the owner wants teachers to have narrower or different permissions than advisory staff, that is a follow-up feature, not blocking this one.
**Escalate only if:** the owner explicitly rejects this mapping once they see the "Role" dropdown only offers Admin/Staff.

### User stories (MoSCoW)

**US1 (Must) — Admin creates a new dashboard user.**
As an admin, I want to create a new dashboard account (role admin or staff/teacher) with an initial password, so a new teacher/advisor/admin can log in without me sharing my own credentials.
- Given I am logged in as admin, when I open the new "Users" screen and submit email + role + initial password, then a `DashboardUser` row is created with `mustChangePassword: true` (reusing F4's field) and I see a success confirmation showing the email and a note that the user must change this password on first login.
- Given the email already exists, when I submit the create form, then the API returns 409/400 and the form shows a translated inline error (mirrors existing patterns like `Login.tsx`'s Alert).
- Given I am logged in as staff (non-admin), when I try to reach the Users screen or call the create-user API directly, then I am blocked (`RolesGuard`/`@Roles('admin')` server-side, and the nav item + route hidden client-side, consistent with `/settings`/`/monitoring`'s existing `adminOnly` pattern).
- Given the initial password field, when validated, then it follows the same min-length-8 rule as `LoginDto`/F4's `ChangePasswordDto` — no new complexity policy (YAGNI, matches F4's precedent).

**US2 (Must) — Admin sees the list of dashboard users.**
As an admin, I want to see all existing dashboard accounts (email, role, created date, whether they still must change their password), so I can audit who has access.
- Given at least one user exists, when I open the Users screen, then I see a table of all `dashboard_users` rows (email, role, createdAt, mustChangePassword status) — no password/hash ever returned by the API.

**US3 (Should) — Admin forces a password reset for an existing user.**
As an admin, I want to reset a user's password (e.g., they're locked out or left), so they can regain access without me needing DB access.
- Given an admin selects "reset password" for a user and supplies a new temporary password, when submitted, then that user's `passwordHash` updates, `mustChangePassword` is set back to `true`, and the current session (if any) is unaffected until their next login/request re-reads the flag — same mechanics as F4's forced-change gate, just admin-triggered instead of self-service.
- This reuses the *mechanism* (flag + hash update) but is a distinct code path from F4's self-service `POST /auth/change-password` (which requires knowing the *current* password) — this one is admin-privileged and does not require the target's current password.

**US4 (Must) — Self-service "change my password" entry point.**
As any logged-in user (admin or staff), I want to change my own password voluntarily at any time (not only when forced), so I can rotate credentials without waiting to be forced or asking an admin.
- Given I am logged in and not currently forced to change my password, when I open a "change password" link (e.g. from a profile/account menu in the sidebar footer, next to Logout), then I reach the same form/endpoint F4 built (`POST /auth/change-password`), but rendered *inside* `ProtectedShell`'s normal chrome (nav still visible) rather than F4's chrome-less forced variant — this is the one UI difference from F4's page and needs a UX/frontend decision on whether that's a second route, a modal, or a conditional render of the same page component based on whether the visit was forced vs voluntary.
- Given the change succeeds, when the response returns, then I stay on the current screen (or return to where I was) rather than being redirected anywhere else — unlike the forced first-login flow, this is not gating my access.

### New API surface (additive, `services/core-api/src/users/` — new module, mirrors existing `students/`-style CRUD module conventions)
- `GET /users` (admin-only, `RolesGuard`) — list, no password hash in response.
- `POST /users` (admin-only) — create `{ email, role, password }` → sets `mustChangePassword: true`.
- `POST /users/:id/reset-password` (admin-only) — `{ newPassword }` → updates hash, sets `mustChangePassword: true`, does **not** require the target's current password (admin-privileged, distinct from F4's self-service endpoint which does).
- No `DELETE`/deactivate endpoint in this feature (see Out of scope).

### In scope
- New `users/` core-api module (list, create, admin-reset-password) + Prisma queries against the existing `DashboardUser` model (no new schema beyond F4's `mustChangePassword`).
- New dashboard "Users" page, admin-only nav entry (same `adminOnly` pattern as `/monitoring`/`/settings`).
- A self-service change-password entry point reachable from anywhere while logged in (exact placement/UI is a UX decision — flagged above).
- i18n vi/en for all new strings.

### Out of scope (explicitly, to prevent scope creep)
- No new `DashboardRole` enum value (see Resolved ambiguity above) — revisit only if owner explicitly asks for teacher-specific permissions.
- No deactivate/delete-user flow (not requested; "create new user ... change password, etc." doesn't name removal — YAGNI, can be a fast follow if asked).
- No self-registration / invite-by-email flow (matches F4's design doc precedent: bootstrap/admin-created accounts only, no email infrastructure exists in this repo).
- No audit log of who created/reset which account beyond the existing `createdAt` column (not requested).
- No password complexity policy changes (matches F4).

### Assumptions
1. "Teacher" = `staff` role, per Resolved ambiguity above.
2. Admin-reset-password is a genuinely separate code path from F4's self-service change (no current-password check), since an admin resetting someone else's forgotten password can't supply their current password — this is a deliberate, minimal addition, not a reuse of the exact F4 endpoint.
3. Placement of the self-service "change password" link is left to UX (sidebar footer near Logout is the natural analog already established by `SidebarNav`'s existing Logout button in `App.tsx`) — flagged as an open item for UX/frontend, not blocking PM sign-off.

## Blockers / open questions

- **Open (non-blocking, proceed with stated assumption):** whether "teacher" ever needs permissions distinct from `staff`. Proceeding on the assumption they're the same role; escalate to owner only if rejected after seeing the UI.
- **Open (for UX/frontend, not PM):** exact placement/interaction pattern (route vs. modal) for the self-service change-password entry point given it must reuse F4's form but render with nav chrome. Not a product ambiguity, just an implementation choice — noted so it isn't missed.

## Notes for the next role

BA: write the precise API contracts (request/response shapes) for the three new `users/` endpoints, and clarify with UX whether "change my password" is a route (`/account/change-password`?) or a modal triggered from the sidebar, before frontend starts. QA: verify role-gating on both the API (`RolesGuard`) and the client (nav/route hidden for staff) — this mirrors the exact pattern already used for `/monitoring`/`/settings`, so regression-test against that existing precedent. Backend: reuse `BootstrapAdminService`'s `bcrypt.hash(..., SALT_ROUNDS=12)` constant rather than re-declaring it.
