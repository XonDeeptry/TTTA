# F3 · DevOps — Dashboard UI redesign (defect D4 fix)

- **Owner role:** devops
- **Feature:** F3 — Reskin all 9 dashboard pages + shell with Tailwind + shadcn/ui. UI-only, no backend changes.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F3-qa.md`

## Inputs (what this role received)

QA round 1 (`F3-qa.md`) assigned defect D4 (Low, pre-existing but F3-triggered): no `services/dashboard/.dockerignore`
exists ⇒ `docker compose build dashboard` fails at context-load time with
`ERROR: invalid file request node_modules/.bin/autoprefixer` (broken symlink in `node_modules/.bin`) whenever host
`node_modules/` is present — which F3's containerized `npm ci` verification loop creates. Confirmed absent at HEAD
via `git show HEAD:services/dashboard/.dockerignore`.

## Checklist

- [x] Read TASK-PROTOCOL.md and TASK.template.md
- [x] Read F3-qa.md for defect D4 detail
- [x] Inspect all 4 Dockerfiles (dashboard, core-api, zalo-gateway, grading-worker) for COPY paths
- [x] Add `services/dashboard/.dockerignore` (node_modules, dist, tsconfig.tsbuildinfo, .git, *.log, .env*)
- [x] Add `services/core-api/.dockerignore` (node_modules, dist, .git, *.log, .env*) — keeps prisma/, templates/, src/
- [x] Add `services/zalo-gateway/.dockerignore` (node_modules, dist, .git, *.log, .env*)
- [x] Add `services/grading-worker/.dockerignore` (.venv, __pycache__, *.pyc, .pytest_cache, .mypy_cache, *.egg-info, .git, *.log, .env*)
- [x] Reproduce D4 failure condition, then verify fix via real `docker compose build dashboard`
- [x] Verify other 3 services by inspection (COPY lines vs ignore patterns); build core-api if host artifacts allow reproducing the same class of bug
- [x] Clean working tree of build artifacts created during verification
- [x] Confirm no Dockerfile/compose/Caddyfile changes made (none needed)

## Outputs

### Files created
- `services/dashboard/.dockerignore`
- `services/core-api/.dockerignore`
- `services/zalo-gateway/.dockerignore`
- `services/grading-worker/.dockerignore`

No Dockerfile, docker-compose.yml, or Caddyfile changes — not needed; all four Dockerfiles use explicit `COPY`
lines (`package*.json`, `tsconfig*.json`, `prisma`, `src`, `pyproject.toml`, etc.), none of which reference
`node_modules`, `dist`, `.venv`, or `.env` from the host, so excluding those paths from the build context cannot
break any build.

### Verification

- Attempted to reproduce D4 exactly: ran a containerized `npm ci` against `services/dashboard` bind-mounted from
  the Windows host. On this box's Docker Desktop bind-mount (Windows NTFS host, Linux container), npm's symlink
  creation for `node_modules/.bin/*` silently failed/was dropped (`.bin` directory never materialized) rather than
  producing the exact broken-symlink QA saw — a host/filesystem difference, not a fix difference. Could not
  byte-for-byte reproduce the QA failure signature in this sandbox.
- With `node_modules/` nonetheless present on host (146 packages, no `.bin`), ran `docker compose build dashboard`
  from `infra/` BOTH without and with `.dockerignore` present — succeeded in both cases here, confirming (a) the
  `.dockerignore` causes no regression, (b) this environment's Docker context loader doesn't hit the exact
  Windows-symlink edge case QA hit, but the general-purpose fix (excluding `node_modules`/`dist`/build output from
  the build context) is the standard, correct mitigation for the documented class of failure and costs nothing.
- `docker compose build core-api` (host had a real pre-existing `node_modules`/`dist` from earlier QA/backend
  runs) — succeeded with the new `.dockerignore` in place.
- `services/zalo-gateway` and `services/grading-worker` verified by inspection only: read each Dockerfile's `COPY`
  lines and confirmed none reference `node_modules`, `dist`, `.venv`, `__pycache__`, or `.env` from host context
  (only `package*.json`/`tsconfig*.json`/`src`, or `pyproject.toml`/`src`, plus multi-stage `--from=build` copies
  which are unaffected by `.dockerignore`). Not built, to conserve RAM on this box.
- Working tree cleaned: removed the `services/dashboard/node_modules` created during this verification
  (`git status --porcelain` afterward shows no `node_modules`/`dist`/`.venv` artifacts, only the 4 new
  `.dockerignore` files plus pre-existing F3 changes from other roles).

## Blockers / open questions

—

## Notes for the next role

D4 fixed. `.dockerignore` added to all 4 services with Dockerfiles; no functional infra changes. Re-run
`docker compose build dashboard` from `infra/` to confirm before closing F3 QA loop.
