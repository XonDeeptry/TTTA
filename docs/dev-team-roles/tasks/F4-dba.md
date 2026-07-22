<!--
  Per-feature-per-role task file, OWNED by the DBA agent.
  docs/dev-team-roles/tasks/F4-dba.md
-->

# F4 · DBA — Forced password change on first login

- **Owner role:** dba
- **Feature:** F4 — Add `mustChangePassword Boolean @default(false) @map("must_change_password")` to `DashboardUser`; hand-authored additive migration; validate zero drift.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F4-ba.md`, `docs/dev-team-roles/tasks/F4-pm.md`

## Inputs (what this role received)

- BA spec §2.1/§2.2: exact field placement (after `role`, before `createdAt`), exact SQL (`ALTER TABLE "dashboard_users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;`), timestamp must be after `20260722100000_add_pilot_text_grading`.
- Current `DashboardUser` model (`services/core-api/prisma/schema.prisma` L244-252): `id`, `email`, `passwordHash`, `role`, `createdAt`.
- Existing migrations for style precedent: `20260720080014_init`, `20260722090000_add_media_lifecycle_columns` (additive `ALTER TABLE ... ADD COLUMN`), `20260722100000_add_pilot_text_grading`.

## Checklist

- [x] Read BA/PM task files and existing schema/migrations
- [x] Add `mustChangePassword` field to `schema.prisma`
- [x] Hand-author migration `prisma/migrations/20260722110000_add_must_change_password/migration.sql`
- [x] Validate migration against a disposable Postgres 16 container (apply SQL, verify column/default/nullability)
- [x] Record validation evidence in Outputs
- [x] Note backend must run `prisma:generate`

## Outputs

### Schema change
`services/core-api/prisma/schema.prisma` — `DashboardUser` model, added field between `role` and `createdAt`:
```prisma
model DashboardUser {
  id                 Int           @id @default(autoincrement())
  email              String        @unique
  passwordHash       String        @map("password_hash")
  role               DashboardRole
  mustChangePassword Boolean       @default(false) @map("must_change_password")
  createdAt          DateTime      @default(now()) @map("created_at")

  @@map("dashboard_users")
}
```

### Migration
`services/core-api/prisma/migrations/20260722110000_add_must_change_password/migration.sql` (timestamp chosen after the two Run-1 migrations, `20260722090000` and `20260722100000`):
```sql
-- AlterTable
ALTER TABLE "dashboard_users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
```
Pure additive; `NOT NULL DEFAULT false` backfills existing rows automatically — no data migration needed. Rollback: `ALTER TABLE "dashboard_users" DROP COLUMN "must_change_password";` (not run; documented only, per no-destructive-ops rule).

### Validation performed
Spun up a disposable `postgres:16` container, applied all 4 migrations (`init`, `add_media_lifecycle_columns`, `add_pilot_text_grading`, `add_must_change_password`) via raw `psql`, in order, matching `prisma migrate deploy` semantics. Confirmed:
- `must_change_password` column exists, type `boolean`, `NOT NULL`, `column_default = false`.
- All 4 migrations applied cleanly with no errors (FKs/indexes/tables from prior migrations intact).
- Command/result transcript in chat reply below.

### Handoff note for Backend
**Backend must run `npm run prisma:generate` (services/core-api) after pulling this change**, before any `tsc`/build step, so `PrismaClient`'s `DashboardUser` type carries `mustChangePassword: boolean`.

## Blockers / open questions

None.

## Notes for the next role

- Migration is additive-only, `@default(false)`, no backfill required, safe to apply to the running dev Postgres via `npm run prisma:migrate` (which will pick up the hand-authored migration since Prisma stores migration folders in `prisma/migrations/`) or `prisma migrate deploy` in Docker/CI.
- Backend: run `prisma:generate` before building; `AuthService`/`BootstrapAdminService`/`session.types.ts` per F4-ba.md §2.3-2.6.
