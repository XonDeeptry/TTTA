# F4 · PM — Forced password change on first login

- **Owner role:** pm
- **Feature:** F4 — Implement the approved design doc `docs/superpowers/specs/2026-07-22-forced-password-change-design.md` exactly: `mustChangePassword` on `DashboardUser`, `POST /auth/change-password`, `/change-password` route + `ProtectedShell` gate, i18n vi/en.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** — (design doc is the direct input; already approved, no upstream BA/UX needed for the mechanism itself)

## Inputs (what this role received)

- Approved design doc (read in full): `docs/superpowers/specs/2026-07-22-forced-password-change-design.md`.
- Current code read for context: `services/core-api/prisma/schema.prisma` (`DashboardUser` has no `mustChangePassword` yet), `services/core-api/src/auth/{auth.service.ts,auth.controller.ts,session.types.ts,bootstrap-admin.service.ts,dto/login.dto.ts,session-auth.guard.ts}`, `services/dashboard/src/{auth/AuthContext.tsx,App.tsx,pages/Login.tsx}`.
- Confirms the doc's claims: today `AuthController` has only `login`/`logout`/`me`; `SessionData.user` is `{id,email,role}` with no password-change flag; `dashboard_users` is created only by `BootstrapAdminService`; `Login.tsx` navigates to `/settings` unconditionally on success (works today because only admin exists) — the `ProtectedShell` gate added by this feature must intercept that redirect too.
- `LoginDto` pattern to mirror for a new `ChangePasswordDto`: `class-validator`, `@MinLength(8)`.

## Checklist

- [x] Read design doc in full
- [x] Read current auth/session/bootstrap/dashboard code for gaps vs. the design
- [x] Write user stories + acceptance criteria (design doc already specifies the mechanism precisely — this is largely a fidelity/completeness check, not new product discovery)
- [x] Flag the one redirect interaction (`Login.tsx` → `/settings`) the doc doesn't call out explicitly but that the gate must handle
- [x] Confirm scope boundaries (no add-user UI, no password policy, no notification flow — per doc's Non-goals)

## Outputs

### User stories (MoSCoW)

**US1 (Must) — Bootstrap admin forced to set own password.**
As the operator who just bootstrapped the first admin account, I want to be forced to change the seed password before I can use any dashboard screen, so the known dev/seed password is never left live.
- Given `dashboard_users` was empty and `BootstrapAdminService` just seeded the admin row, when that row is created, then `mustChangePassword = true` on it.
- Given a user with `mustChangePassword = true` logs in successfully, when the frontend receives the login response, then it is redirected to `/change-password` regardless of which route it would otherwise land on (including admin-only routes like `/settings`, which is `Login.tsx`'s current hardcoded post-login destination).
- Given that same user is on `/change-password`, when they try to navigate (via URL bar or a stale link) to any other route, then `ProtectedShell` redirects them back to `/change-password` until the flag clears.

**US2 (Must) — Change-password endpoint, generic and reusable.**
As any logged-in dashboard user (admin or staff), I want an API to change my password by re-proving my current one, so my credentials can be rotated without a DB-side reset.
- Given a valid session and correct `currentPassword`, when `POST /auth/change-password` is called with a `newPassword` that differs from the current one and passes the same min-length rule as login, then the stored hash updates, `mustChangePassword` clears to `false` in both DB and the live session (`req.session.user`), and the response reflects the new state without requiring re-login.
- Given an incorrect `currentPassword`, when the endpoint is called, then it responds 401 and no state changes.
- Given `newPassword === currentPassword` or `newPassword` fails the length rule, then the request is rejected with a validation error (400), consistent with `LoginDto`'s existing rule, no new complexity policy (per doc's Non-goals).
- Given no session at all, when the endpoint is called, then `SessionAuthGuard` rejects with 401 (any logged-in role, not role-restricted).

**US3 (Must) — `/change-password` page.**
As a forced or voluntary password-changer, I want a simple form (current, new, confirm), so I can complete the change without the rest of the nav chrome distracting/being reachable.
- Given the form is submitted with mismatched new/confirm fields, when validated client-side, then an inline error shows and no API call is made.
- Given the API call fails with 401 (wrong current password), when the response returns, then the existing `Alert`-style inline error pattern from `Login.tsx` renders a translated error message.
- Given the API call succeeds, when the response returns, then `AuthContext`'s user state updates (`mustChangePassword: false`) and the app navigates to the normal default landing route, re-evaluating `ProtectedShell`'s gate.
- The page renders outside `ProtectedShell`'s sidebar/nav (like `/login`), per the design doc, since forced users have nowhere else to go yet.

**US4 (Must) — i18n.**
As a Vietnamese-first or English-reading staff member, I want the change-password screen and errors fully bilingual, so the experience matches every other screen.
- Given the `vi` bundle is default and `en` is the secondary locale (project convention), when new keys are added (e.g. `changePassword.title`, `.currentPassword`, `.newPassword`, `.confirmPassword`, `.submit`, `.error`, `.mismatch`), then both bundles have all keys with no hardcoded strings in the new components.

**US5 (Should) — core-api unit tests matching existing `.spec.ts` conventions.**
As the team maintaining test coverage, I want `AuthService`/`AuthController` change-password logic and `BootstrapAdminService`'s new field covered by unit tests, so a regression is caught before it reaches a real seeded admin.
- Wrong current password rejected; correct one updates hash + clears flag; bootstrap seed sets `mustChangePassword: true`.

### In scope
- Prisma schema: add `mustChangePassword Boolean @default(false) @map("must_change_password")` to `DashboardUser`, hand-authored migration matching existing style (see `20260722090000` migration referenced in `TASKS.md` M3.6 for precedent of an additive-column migration).
- `BootstrapAdminService`: set `mustChangePassword: true` on the seeded row.
- `session.types.ts`: `SessionData.user` gains `mustChangePassword: boolean`.
- `auth.controller.ts`/`auth.service.ts`: `login`/`me` responses include the field; new `POST /auth/change-password` (session-auth guarded, any role) per US2.
- `dashboard`: `AuthContext`'s `CurrentUser` gains the field; new `/change-password` route + component; `ProtectedShell` gate redirect logic; i18n additions.

### Out of scope (per design doc's Non-goals — confirmed, not re-litigated)
- No "add user" / user-management UI (that's F5).
- No password complexity policy beyond existing min-length/bcrypt.
- No email/notification flow for resets.
- No server-side blocking of other API calls while `mustChangePassword` is true — the gate is frontend-only in this feature (doc explicitly defers this).

### Assumptions
1. Migration will be additive/reversible (`@default(false)`) so existing rows (today: just the one bootstrap admin, likely already past first login in a dev environment) are unaffected unless already flagged — no backfill logic needed.
2. `Login.tsx`'s hardcoded `navigate('/settings')` stays as-is; `ProtectedShell`'s gate is what actually intercepts and redirects to `/change-password` when needed, exactly as the design doc's flow implies (doc doesn't explicitly mention this specific line, but it is the only current post-login navigation, and the gate must supersede it for correctness — flagged here for BA/frontend awareness, not a new decision, since the doc's stated behavior already logically requires it).
3. DTO validation for change-password reuses the same `class-validator` min-length-8 pattern as `LoginDto`, per doc's explicit "no new complexity rules."

## Blockers / open questions

None — the design doc is approved and sufficiently detailed to build directly. One implementation note flagged above (item 2 in Assumptions) for whichever role implements the frontend gate, not a decision that needs escalation.

## Notes for the next role

BA: the design doc itself is close to spec-grade already; your main value-add is turning the "Given/When/Then" above into a precise behavior inventory (exact response shapes, exact redirect targets) for QA, and confirming the migration-naming convention with DBA. Frontend: reuse `Login.tsx`'s form/Alert pattern verbatim for `/change-password`, and double check `Login.tsx`'s post-login navigate doesn't fight the new gate (see Assumption 2). Backend: mirror `LoginDto`'s validator style in the new `ChangePasswordDto`; update `contracts.ts`-adjacent nothing (this feature touches no queue/message contract, only session/DB).
