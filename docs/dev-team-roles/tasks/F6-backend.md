<!--
  Per-feature-per-role task file, OWNED by the BACKEND agent for F6.
-->

# F6 · Backend — Real-time submission status via SSE (core-api)

- **Owner role:** backend
- **Feature:** F6 — Push `Submission.status` transitions to the dashboard live via Server-Sent Events. Additive read-only projection over the REST baseline.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F6-ba.md (authoritative contract), F6-pm.md

## Inputs (what this role received)

- `F6-ba.md` — event model, `submission:events` Redis channel, `GET /events/submissions` SSE contract, 20 numbered ACs, frozen-behavior list, no schema change.
- Code traced before touching:
  - `src/worker-api/worker-api.controller.ts` — `POST /internal/submissions` upsert (L47-63) + `PATCH /internal/submissions/:id` (L65-80): worker-driven status writes. Both currently `return this.prisma...` with no `await`.
  - `src/gradings/gradings.service.ts` — `send()` (L35) sets `status:'sent'`, the only dashboard-driven status write. `reviewFeedback()` does NOT touch status.
  - `src/redis.service.ts` / `src/redis.module.ts` — single ioredis `client`, `@Global()` module; existing pub/sub precedent `client.publish(CONFIG_CHANNEL, key)`.
  - `src/auth/session-auth.guard.ts` — throws 401 when `!req.session.user`; any logged-in role passes.
  - `src/app.module.ts` — module wiring.
  - `prisma/schema.prisma` — `SubmissionStatus { received, processing, graded, awaiting_review, sent, failed }`; `Submission` has NO `updatedAt` column → use `new Date().toISOString()` for `at`.

## Checklist

- [x] Read F6-ba.md + F6-pm.md + protocol + template
- [x] Trace the three status-write paths + confirm no schema change
- [x] Create `src/events/events.service.ts` (publisher + per-connection SSE stream)
- [x] Create `src/events/events.controller.ts` (`GET /events/submissions`, SessionAuthGuard, `@Res()`)
- [x] Create `src/events/events.module.ts` (`@Global`, exports EventsService)
- [x] Wire EventsModule into `app.module.ts`
- [x] Hook publish into worker-api upsert + PATCH (await result, publish persisted id/status)
- [x] Hook publish into `GradingsService.send`
- [x] Unit tests: events.service (publish + stream framing/heartbeat/cleanup), events.controller
- [x] Unit tests: worker-api.controller (publish on resolve, no publish on reject)
- [x] Update gradings.service.spec for new EventsService dep + publish assertion
- [x] prisma generate + tsc build + full jest --maxWorkers=2 green
- [x] Set Status DONE, fill Outputs

## Outputs

### Files changed
- NEW `src/events/events.service.ts` — `publishStatus()` (fire-and-forget Redis publish, never throws) + `stream(req,res)` (SSE setup, dedicated `client.duplicate()` subscriber, 25s heartbeat, teardown on close).
- NEW `src/events/events.controller.ts` — `GET /events/submissions`, `@UseGuards(SessionAuthGuard)`, `@Res()` raw stream.
- NEW `src/events/events.module.ts` — `@Global()`, exports `EventsService`.
- NEW `src/events/events.service.spec.ts`, `src/events/events.controller.spec.ts`, `src/worker-api/worker-api.controller.spec.ts`.
- EDIT `src/app.module.ts` — import EventsModule.
- EDIT `src/worker-api/worker-api.controller.ts` — inject EventsService; `createSubmission`/`updateSubmission` now `await` the Prisma write then publish persisted `{id,status}`.
- EDIT `src/gradings/gradings.service.ts` — inject EventsService; publish after the `status:'sent'` write.
- EDIT `src/gradings/gradings.service.spec.ts` — new EventsService dep + publish assertions.

### Event + endpoint contract (for Front-end)
- **SSE endpoint:** `GET /api/events/submissions` (core-api `/events/submissions` via Caddy strip_prefix). Session-cookie auth (`EventSource` sends it same-origin automatically); 401 when unauthenticated.
- **Named event:** `submission.status`. Frame: `event: submission.status\ndata: <json>\n\n`.
- **`data` JSON:** `{ "submissionId": <number>, "status": "<received|processing|graded|awaiting_review|sent|failed>", "at": "<ISO-8601 UTC>" }`.
- **Heartbeat:** comment frame `: ping\n\n` every 25s (plus an initial `: connected\n\n`). No `retry:`/`Last-Event-ID`; rely on native `EventSource` reconnect + a one-time REST refetch to reconcile.
- **Redis channel:** `submission:events` (JSON payloads), published only AFTER a successful status write.

### Verification (Docker, node:24-alpine, `npm ci`)
- `tsc -p tsconfig.build.json --noEmit`: clean. `prisma generate`: OK (via @prisma/client postinstall; no schema change / no migration).
- Full core-api jest `--maxWorkers=2`: **28 suites / 176 tests, all passing** (baseline 25/155 → +3 suites, +21 tests). No leaked timers/handles — jest exited cleanly (SSE tests use fake timers + explicit close).

## Blockers / open questions

None. DevOps still owns AC-19/20 (Caddy no-buffer verification) — flagged in F6-ba.md; endpoint already sets `X-Accel-Buffering: no` + `Cache-Control: no-transform` as belt-and-braces.

## Notes for the next role

- **Front-end:** `new EventSource('/api/events/submissions')`, listen for named event `submission.status`, `JSON.parse(e.data)` → `{submissionId,status,at}`. Additive only — keep the existing REST fetch paths; refetch once on (re)connect to reconcile missed events.
- **QA:** unit coverage lives in the three new specs + updated gradings spec. Browser/devops ACs (multi-tab, real reconnect, Caddy buffering) remain per F6-ba.md §6.
