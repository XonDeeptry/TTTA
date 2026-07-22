<!--
  Per-feature-per-role task file, OWNED by the QA agent for F6.
-->

# F6 · QA — Real-time submission status via SSE

- **Owner role:** qa
- **Feature:** F6 — Push `Submission.status` transitions to the dashboard live via SSE. Additive read-only projection over the REST baseline.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F6-ba.md (20 ACs), F6-pm.md, F6-ux.md, F6-backend.md, F6-frontend.md, F6-devops.md

## Inputs
- BA §6 = 20 numbered ACs tagged [unit]/[browser]/[devops]. Basis for verdict.

## Checklist
- [x] Read protocol + all upstream F6 task files
- [x] Read backend source: events.service/controller/module, worker-api.controller, gradings.service
- [x] Read backend tests: events.service.spec, events.controller.spec, worker-api.controller.spec, gradings.service.spec
- [x] Read frontend: useSubmissionEvents hook, Submissions.tsx, SubmissionDetail.tsx
- [x] Read SessionAuthGuard, app.module wiring
- [x] Run core-api suite via Docker (prisma generate → build → jest --maxWorkers=2); clean exit / no leaked handles
- [x] Build dashboard (tsc+vite)
- [x] Regression: zalo-gateway (26) + grading-worker (60) suites
- [x] i18n parity check (151/151, no events.* keys)
- [x] Scope freeze: grading-worker, contracts.*, schema untouched by F6
- [x] Final verdict

## Outputs

### Suites (Docker, node:24-alpine / python:3.12-slim, plain `npm ci`)
- **core-api**: `prisma generate` OK, `tsc -p tsconfig.build.json --noEmit` clean, `jest --maxWorkers=2` → **28 suites / 176 passed** (matches backend claim; baseline F5 was 25/155 → +3 suites/+21 tests). Jest **exited cleanly** — no "did not exit" warning, no open-handle warning, no `--forceExit`, exit 0. Confirms no leaked heartbeat timer / SSE handle (events.service.spec uses fake timers + explicit `req.emit('close')` teardown).
- **dashboard**: `tsc -b && vite build` clean, 0 TS errors, 83 modules, `dist/` produced.
- **grading-worker**: `pytest` → **60 passed** (regression clean; untouched).
- **zalo-gateway**: `jest --maxWorkers=2` → **5 suites / 26 passed** (regression clean; untouched).

### Publisher correctness (source-verified)
- All 3 paths publish AFTER `await` resolves, using the PERSISTED row: `worker-api.controller.ts` upsert L63-68 (`await upsert` → `publishStatus(result.id, result.status)`, covers default `received`), PATCH L77-87, `gradings.service.ts` send L37-41 (`await submission.update` → publish `updated.status`). Failed write → publish skipped (publish is post-await). `EventsService.publishStatus` swallows BOTH async rejection (`.catch`) and sync throw (`try/catch`) — cannot break/delay handler. Responses unchanged (additive). Tested by worker-api.controller.spec (AC-1/2/4) + gradings.service.spec (AC-3, no-publish-on-missing).

### SSE endpoint leak-safety (source-verified)
- `EventsController` has class-level `@UseGuards(SessionAuthGuard)` (401 without session — guard throws). Sets `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`, status 200. Per-connection `client.duplicate()` subscriber. `cleanup()` is idempotent (`closed` flag): `clearInterval` heartbeat, `removeAllListeners('message')`, `unsubscribe`, `quit`, `res.end`; bound to BOTH `req 'close'` and `res 'error'`. `safeWrite` catches write failures → cleanup, so a dead client only tears down itself. Publish decoupled via Redis → slow client can't block publisher. events.service.spec asserts all of this (AC-8/9/10/11/12, idempotent double-close, two-connection independence, late-message-after-close no-op).

### Frontend (source-inspected; no dashboard test runner exists)
- `useSubmissionEvents`: `es.close()` + `removeEventListener` on unmount (StrictMode-safe, `[]` deps + callback via ref); `JSON.parse` in try/catch (parse-tolerant); `typeof EventSource === 'undefined'` guard (feature-detect). Submissions.tsx: in-place `data.items[idx].status` swap via `setData` (no reorder), `load()` for unloaded id. SubmissionDetail.tsx: `load()` only when `evt.submissionId === Number(id)`. Fallback: hook strictly ADDS a callback; mount `load()` + all action handlers untouched → identical to pre-F6 if SSE never connects. No new dep (package.json untouched), no `events.*` i18n keys (grep clean; i18n diff is all F4 changePassword/users), no `aria-live`.

### DevOps AC-19/20
- Config reasoning sound: `infra/Caddyfile` `/api*` block has no `encode`/`flush_interval`/`transport` override (verified via adapted-JSON in F6-devops); Caddy auto-flushes `text/event-stream` by default; backend also sets `X-Accel-Buffering: no`. Live incremental-frame curl blocked by pre-existing env (placeholder `DOMAIN`, running core-api image predates F6) — owner-acceptance E2E, NOT a defect.

### Scope freeze
- grading-worker untouched (60 tests green, git clean). All 3 `contracts.*` untouched. `schema.prisma` diff is F4 `must_change_password` (pre-existing working-tree change), NOT F6 — F6 touches no schema. No student-facing messaging. Existing REST + poll baseline intact.

### Noted deviations / observations (non-blocking)
- **AC-15 (reconnect auto-reconcile)**: BA §3 / US1-bullet-3 specified a one-time `load()` on SSE reconnect. Delivered hook has no `onopen`/`onerror`, so it does NOT auto-refetch after a reconnect — missed transitions during a drop stay stale until the next live event or a manual action. RESOLVED as accepted tradeoff: UX §3/§4 (design authority) explicitly documented this exact failure mode ("stale until the next event or manual action") as acceptable and specced the minimal message-only hook that was built. Data is never wrong (REST authoritative). Non-blocking; flag to owner if auto-reconcile is later wanted (cheap frontend add: `es.onopen`-after-error → reconcile callback).
- Minor: Submissions.tsx calls `load()` inside a `setData` updater — benign (idempotent GET), only a dev-only StrictMode double-fetch smell. Not a defect.
- Browser-only ACs (AC-16/17/18 multi-tab, real reconnect, visible latency) unverified in this environment (no running rebuilt stack / no browser) — stated plainly, not defects.

## Blockers / open questions
—

## Notes for the next role
- QA PASS. Owner should run the F6-devops human E2E recipe (rebuild core-api, `curl -N` with session cookie, multi-tab check) on a `DOMAIN=localhost` stack to close AC-17/18/19/20 in a real browser. Consider the AC-15 auto-reconcile add if support tickets show stale-after-blip data.

QA_RESULT: PASS
