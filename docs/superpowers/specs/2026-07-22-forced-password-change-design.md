# Forced password change on first login — design

Date: 2026-07-22
Status: approved

## Context

Setting up the dev admin account for this milestone surfaced a gap: `BootstrapAdminService`
(core-api) seeds exactly one `dashboard_users` row from `CORE_API_BOOTSTRAP_ADMIN_EMAIL`/
`_PASSWORD` env vars when the table is empty, and that's the *only* place a `DashboardUser`
row is ever created (M4 shipped no "add user" UI). There's no self-registration flow and no
existing password-change endpoint. Seeding a known dev password (`admin@ilm.local` /
`dev-password-123`) directly into a usable session is a bad habit to start even for dev —
the fix is to force a password change on first login rather than leave the seed password live.

## Goals

- The bootstrap-seeded admin cannot use the dashboard for anything until they set their own password.
- The `mustChangePassword` mechanism is generic on `DashboardUser`, not special-cased to bootstrap,
  so any future user-creation path (e.g. an "add staff" screen) can reuse it for free.
- No change to the existing session-auth model (still `express-session` + Redis); this only adds
  one field to the user record and one gate in the frontend route guard.

## Non-goals

- No "add user" / user-management UI — out of scope, not part of this change.
- No password complexity policy beyond what already exists (bcrypt hash, no additional rules) —
  not asked for, YAGNI.
- No email/notification flow for password resets — bootstrap admin is the only path today.

## Design

### Schema (core-api, Prisma)

Add one column to `DashboardUser`:

```prisma
model DashboardUser {
  id                Int           @id @default(autoincrement())
  email             String        @unique
  passwordHash      String        @map("password_hash")
  role              DashboardRole
  mustChangePassword Boolean      @default(false) @map("must_change_password")
  createdAt         DateTime      @default(now()) @map("created_at")

  @@map("dashboard_users")
}
```

Default `false` so existing/normal accounts are unaffected; only creation paths that opt in
(bootstrap now, others later) set it `true`.

### Bootstrap (`bootstrap-admin.service.ts`)

`dashboardUser.create(...)` sets `mustChangePassword: true` on the seeded row.

### Session shape (`session.types.ts`)

`SessionData.user` gains `mustChangePassword: boolean`, kept in sync with the DB value at
login time and updated in-session when the password is changed (no re-login required).

### API (`auth.controller.ts` / `auth.service.ts`)

- `POST /auth/login` and `GET /auth/me` responses include `mustChangePassword`.
- New `POST /auth/change-password` (session-auth guarded, any logged-in role):
  - body: `{ currentPassword, newPassword }`
  - verifies `currentPassword` against the stored hash (bcrypt.compare) — this endpoint is not
    only for the forced-change path, so it always re-checks the current password even though the
    session is already authenticated, same as any "change my password" form.
  - hashes and stores `newPassword`, sets `mustChangePassword: false`, updates `req.session.user`.
  - `newPassword` must differ from `currentPassword` and meet the same non-empty/min-length
    validation as `LoginDto` (no new complexity rules — see Non-goals).

### Dashboard

- `AuthContext`'s `CurrentUser` gains `mustChangePassword: boolean`, populated from `/auth/me`
  and `/auth/login` responses.
- New route `/change-password` rendering a forced form (current + new + confirm password),
  calling the new endpoint, then updating context state so the gate below re-evaluates.
- `ProtectedShell`: if `user.mustChangePassword` and the current route isn't `/change-password`,
  redirect there — mirrors the existing `!user` → `/login` and `adminOnly` → `/students` redirects
  already in that component. This blocks every other route (including admin-only ones) until the
  password is changed, consistent with "cannot use the dashboard for anything" in Goals.
- `/change-password` itself renders outside `ProtectedShell`'s nav chrome (like `/login`) since
  there's nothing else the user can navigate to yet.
- i18n strings added to both `vi` and `en` bundles (project convention — vi default).

## Error handling

- Wrong `currentPassword` on change → 401, surfaced as a form error (reuses the existing
  `login.error`-style inline `Alert` pattern already in `Login.tsx`).
- Attempting any other API call while `mustChangePassword` is true is *not* blocked server-side
  in this change — the gate is UI-only (frontend redirect). Revisit only if this is ever exposed
  beyond a trusted dev/admin context; out of scope for now (see Non-goals).

## Testing

- core-api: unit test for `AuthService`/`AuthController` change-password (wrong current password
  rejected, correct one updates hash and clears flag) and for `BootstrapAdminService` (seeded row
  has `mustChangePassword: true`) — following existing `*.spec.ts` patterns in `auth/`.
- dashboard: no existing test harness for pages to extend (M4 shipped without one); manual
  verification via the running docker-compose stack (login with seed creds → confirm redirect to
  `/change-password` → change password → confirm normal dashboard access).

## Rollout for this dev machine

After the migration ships, `infra/.env` gets:

```
CORE_API_BOOTSTRAP_ADMIN_EMAIL=admin@ilm.local
CORE_API_BOOTSTRAP_ADMIN_PASSWORD=dev-password-123
```

plus the previously-missing `SESSION_SECRET`/`INTERNAL_API_TOKEN` (core-api's M2 env vars were
never added to this machine's `.env` after `.env.example` picked them up — currently falling back
to insecure defaults). `docker compose up -d --build core-api` picks up the schema + code changes;
since `dashboard_users` is currently empty, bootstrap will fire on that restart.
