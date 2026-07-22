<!--
  Per-feature-per-role task file, OWNED by the DevOps agent.
  docs/dev-team-roles/tasks/F4-devops.md
-->

# F4 · DevOps — Forced password change on first login (infra/config audit)

- **Owner role:** devops
- **Feature:** F4 — audit `infra/.env.example` for missing core-api env vars, confirm docker-compose/Caddyfile need no change, write rollout note.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/superpowers/specs/2026-07-22-forced-password-change-design.md` (design, esp. "Rollout for this dev machine"), `docs/dev-team-roles/tasks/F4-backend.md`, `docs/dev-team-roles/tasks/F4-ba.md`

## Inputs (what this role received)

- Design doc §Rollout: claims `SESSION_SECRET`/`INTERNAL_API_TOKEN` were added to `.env.example` (M2) but never propagated to this machine's real `infra/.env`, so core-api falls back to insecure in-code defaults; also states `CORE_API_BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` must be set for the seeded-admin/force-change flow to be meaningful.
- F4-backend.md: no docker/compose/Caddyfile changes made by backend; only one new route (`POST /auth/change-password`) on the existing core-api service, migration must be applied before the new build runs.
- F4-ba.md: confirms scope is session-auth only, no new service/port.

## Checklist

- [x] Read protocol, design doc, F4-backend.md, F4-ba.md
- [x] Grep core-api `src/` for every `process.env.*` it reads
- [x] Compare against `infra/.env.example` — identify genuinely missing keys
- [x] Check real (untracked) `infra/.env` on this machine for the gap the design doc describes
- [x] Confirm docker-compose.yml / Caddyfile need no change for F4 (evidence, not assumption)
- [x] Run `docker compose config` from `infra/` as a parse sanity check (no start/restart)
- [x] Write rollout note for the owner
- [x] Set Status DONE

## Outputs

### 1. `.env.example` audit — result: no changes needed to `.env.example` itself

Grepped every `process.env.*` read in `services/core-api/src/`:

| Var | Read at | In `.env.example`? |
|---|---|---|
| `REDIS_URL` | `redis.service.ts:12` | yes (`REDIS_URL=redis://redis:6379`) |
| `RABBITMQ_URL` | `rabbit.service.ts:28` | yes |
| `SESSION_SECRET` | `main.ts:29` (falls back to `'dev-only-insecure-secret'` if unset) | yes, `SESSION_SECRET=change-me-session-secret` |
| `CORE_API_PORT` | `main.ts:36` | yes |
| `MEDIA_ROOT` | `lib/media-path.ts:4` (defaults `/data/media`, matches the compose `media` volume mount) | not present, but the code default already matches the volume path — no gap |
| `CORE_API_BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` | `auth/bootstrap-admin.service.ts:19-20` | yes, present as blank keys (intentionally no default value committed) |
| `INTERNAL_API_TOKEN` | `auth/internal-token.guard.ts:17` (fallback if `settings['internal.worker_api_token']` unset) | yes, `INTERNAL_API_TOKEN=change-me-internal-token` |

**Finding: `infra/.env.example` already carries every genuinely-missing key** — `SESSION_SECRET`, `INTERNAL_API_TOKEN`, `CORE_API_BOOTSTRAP_ADMIN_EMAIL`, `CORE_API_BOOTSTRAP_ADMIN_PASSWORD` are all already lines 37-43 of the current file (added during M2/M3, confirmed via `git log` — no F4-specific change needed here). **No edit made to `infra/.env.example`.**

### 2. The real gap is in the untracked `infra/.env` on this machine, not in `.env.example`

`infra/.env` is git-ignored (`.gitignore`: `.env`, `.env.local`) and was last modified **2026-07-19** (pre-M2). Confirmed by direct inspection (file exists, `grep -c` for the three var names returned `0`): **`infra/.env` on this machine has none of `SESSION_SECRET`, `INTERNAL_API_TOKEN`, `CORE_API_BOOTSTRAP_ADMIN_EMAIL`, `CORE_API_BOOTSTRAP_ADMIN_PASSWORD`** — exactly the gap the design doc describes. Since `env_file: .env` on the `core-api` service, this means core-api is currently running (or would run, on restart) with `main.ts`'s insecure literal `'dev-only-insecure-secret'` for session signing, and no bootstrap admin ever gets created (both env vars empty → `bootstrap-admin.service.ts` early-returns without creating a row).

Per instructions I did **not** edit the real `infra/.env` (it is a secrets file outside version control, and per the DevOps role's "never real deployments" constraint, adding values there and restarting is left to the human owner — see rollout note below). No real secret values are written anywhere in this task's outputs; the rollout note uses only the same dev-only placeholders already present in the approved design doc / `.env.example` (`admin@ilm.local` / `dev-password-123`, `change-me-*`).

### 3. docker-compose.yml / Caddyfile — confirmed no change needed

- F4 adds exactly one new route, `POST /auth/change-password`, on the **existing** `core-api` service — no new container, port, volume, or upstream.
- `infra/Caddyfile` line 11-14: `handle /api*` already `reverse_proxy core-api:3001` with a wildcard — `/api/auth/change-password` (and the updated `/api/auth/login`, `/api/auth/me` bodies) are covered by the existing wildcard proxy rule with zero edits.
- `infra/docker-compose.yml`: `core-api` service definition (build context, `env_file: .env`, `DATABASE_URL` interpolation, `depends_on` health checks) needs no change — F4 doesn't add a dependency, doesn't change the Prisma connection string shape, and the additive migration (`prisma/migrations/20260722110000_add_must_change_password/`, DBA-owned) runs the same way `prisma migrate deploy`/`docker compose up --build` already runs prior migrations.
- Verified `docker compose config` parses cleanly from `infra/` with the real `.env` in place (no changes made) — output rendered normally (full service graph, env interpolation, volumes) with no errors. Did not start/restart any container.

### 4. Rollout note for the project owner (commands only — not run by this agent)

Apply F4 on this dev machine:

1. Add these four lines to the real `infra/.env` (git-ignored, not touched by this task) — dev-only placeholder values, matching what `.env.example` already documents:
   ```
   SESSION_SECRET=change-me-session-secret
   INTERNAL_API_TOKEN=change-me-internal-token
   CORE_API_BOOTSTRAP_ADMIN_EMAIL=admin@ilm.local
   CORE_API_BOOTSTRAP_ADMIN_PASSWORD=dev-password-123
   ```
   Use real random values for `SESSION_SECRET`/`INTERNAL_API_TOKEN` instead of `change-me-*` if this machine is ever exposed beyond localhost.
2. Apply the DBA-owned additive migration (`prisma/migrations/20260722110000_add_must_change_password/`) — either let core-api's own startup path run `prisma migrate deploy` if that's already wired into the container entrypoint, or run it manually against the dev Postgres:
   ```
   docker run --rm -v "D:/TTTA/services/core-api:/app" -w /app --network ilm-bot_default node:24-alpine sh -c "npx prisma migrate deploy"
   ```
   (adjust `--network` to match `docker compose ps` output if the compose project name differs; alternatively run from a machine with `localhost:5432` reachable, matching the `DATABASE_URL` in `.env.example`).
3. Rebuild and restart the two affected services:
   ```
   docker compose up -d --build core-api dashboard
   ```
   `core-api` picks up the new route/session shape and the migration; `dashboard` is a one-shot build that recopies `dist/` (`restart: "no"`, Caddy serves the static output — no restart needed for Caddy itself).
4. **Bootstrap only fires when `dashboard_users` is empty.** If a `dashboard_users` row already exists on this machine from an earlier session, `BootstrapAdminService.onApplicationBootstrap` early-returns and creates nothing — the existing row's `mustChangePassword` will remain whatever it was (`false` by default per the additive migration, since existing rows aren't backfilled to `true`). If the intent is to force the *existing* seeded admin through the new flow rather than only future empty-table seeds, that requires a manual one-time `UPDATE dashboard_users SET must_change_password = true WHERE email = 'admin@ilm.local';` — **not run by this agent**; flag to the owner if desired, since it's a data change outside DevOps' infra scope.
5. Verify: `docker compose logs core-api --tail 20` should show the bootstrap log line (or its absence, if the table was non-empty) and no startup errors; then browser-verify AC-10 (design doc / F4-ba.md AC-10..17): log in with the seed creds and confirm the forced redirect to `/change-password`.

## Blockers / open questions

None. This is a config-audit task; the finding (`.env.example` already complete, real `infra/.env` on this machine is stale/missing four keys) is itself the deliverable, plus the rollout note above.

## Notes for the next role

- **QA**: no infra changes were made to `infra/.env.example`, `docker-compose.yml`, or `Caddyfile` in this task — nothing here to re-test beyond the browser-only ACs already listed in F4-ba.md (AC-10..AC-17), which require the rollout steps above to have been applied first by the human owner (the `mustChangePassword` flag on the *existing* seeded row won't flip to `true` automatically — see rollout step 4).
- **Owner**: the real `infra/.env` on this machine predates M2 (dated 2026-07-19) and is missing `SESSION_SECRET`/`INTERNAL_API_TOKEN`/bootstrap vars entirely — this is a pre-existing gap unrelated to F4's code changes, surfaced by F4's design doc. Apply rollout steps above at your convenience; no destructive action was taken by this agent.
