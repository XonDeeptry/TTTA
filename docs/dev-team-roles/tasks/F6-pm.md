# F6 · PM — Real-time submission status via SSE

- **Owner role:** pm
- **Feature:** F6 — Push submission lifecycle transitions (received → processing → graded → sent/awaiting_review/failed) to the dashboard in real time via Server-Sent Events, replacing today's poll/refresh-only Submissions/SubmissionDetail views. Item 1 of the owner's raw request.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** — (independent of F4/F5; reads existing M3/M4 submission write paths)

## Inputs (what this role received)

- Owner's raw request item 1 + orchestrator's architecture hint (Redis pub/sub in worker/core-api, SSE endpoint, `EventSource` in dashboard, Caddy buffering caveat).
- Code read for context:
  - `services/core-api/src/submissions/submissions.service.ts` (`SubmissionsService.list/detail/deleteMedia`).
  - `services/core-api/src/redis.service.ts` (existing pub/sub precedent: `client.publish(CONFIG_CHANNEL, key)` for `config:changed` — proven pattern already in this codebase for hot-reload).
  - `services/core-api/src/monitoring/monitoring.service.ts` (existing read-only status-surface pattern to follow for a new module).
  - CLAUDE.md's grading-worker section: worker never touches Postgres directly — every status transition (`received`→`processing`→`graded`/`awaiting_review`→`sent`/`failed`) already flows through core-api's `/internal/submissions` (upsert + `PATCH`) and `/internal/gradings`/`gradings/:id/send` endpoints. **This means core-api's own service layer is the single choke point for every status write, worker-driven or dashboard-driven (the review-and-send action) — no grading-worker code change is needed for this feature.**
  - Prisma `SubmissionStatus` enum (`received, processing, graded, awaiting_review, sent, failed`) — the exact transitions to broadcast.
  - `infra/Caddyfile` role noted in CLAUDE.md (Caddy serves dashboard SPA + proxies `/api*` to core-api) — SSE responses must not be buffered by the proxy.

## Checklist

- [x] Confirm every status transition already passes through core-api (no worker/contracts.ts change needed) — this is the key architecture finding
- [x] Write user stories + acceptance criteria for list + detail live updates
- [x] Recommend SSE transport design (endpoint shape, auth, payload)
- [x] Flag the Redis pub/sub "no replay on reconnect" limitation and its mitigation
- [x] Flag Caddy buffering as a devops concern, not a product ambiguity
- [x] Define in-scope/out-of-scope boundaries

## Outputs

### Key architecture finding (stated up front because it changes the shape of downstream work)

Every place a `submission.status` changes is already inside core-api:
- `WorkerApiController`'s `POST /internal/submissions` (upsert) and `PATCH /internal/submissions/:id` — called by grading-worker as it progresses a submission through `received → processing → graded/awaiting_review/failed`.
- `GradingsService`'s `POST /gradings/:id/send` (M4) — flips `status` to `sent`.
- `SubmissionsService.deleteMedia` — does not change `status`, out of scope for events.

Therefore: **no changes to `services/grading-worker` or any of the three duplicated `contracts.ts`/`contracts.py` files are required.** The event-publishing hook belongs entirely in core-api's existing write paths (`WorkerApiController`, `GradingsService`), which already sit behind the guards/services this feature extends. This significantly de-risks the feature — it's additive within one service.

### User stories (MoSCoW)

**US1 (Must) — Live status on the Submissions list.**
As a staff/admin user watching the Submissions list, I want status badges to update in real time as a submission moves through its lifecycle, so I don't have to manually refresh to see new work arrive or progress.
- Given the Submissions list page is open and connected, when any submission's `status` changes (via worker PATCH or the review-and-send action), then the corresponding row's status badge updates within a small, bounded latency (target: under ~2s under normal load) without a page reload.
- Given a brand-new submission arrives (webhook → worker → `POST /internal/submissions` upsert), when connected, then it appears in the list live if it matches the current status filter, without requiring a manual refresh.
- Given the SSE connection drops (network blip, container restart), when the client detects this, then it automatically reconnects (native `EventSource` behavior) and re-fetches the current list state once to reconcile any transitions missed while disconnected (see Redis pub/sub limitation below) — manual refresh remains available as a fallback exactly as it works today.

**US2 (Must) — Live status on SubmissionDetail.**
As a staff/admin user reviewing one submission's detail page, I want the stage indicator to update live (e.g. while grading is in progress), so I know when it's ready to review without polling.
- Given `SubmissionDetail` for submission `X` is open, when submission `X`'s status changes, then the page's status indicator (and, when it lands on `graded`/`awaiting_review`, the newly-available scores/feedback) updates without a manual reload.
- Given the event for a *different* submission arrives while viewing `X`, then nothing on this page changes (client filters by id).

**US3 (Should) — Visible connection state.**
As a user relying on live updates, I want a small, unobtrusive indicator if the live connection is down, so I know to trust a manual refresh instead of assuming data is current.
- Given the `EventSource` connection is in a reconnecting/errored state, when this is detected, then a subtle UI cue appears (e.g. a small "reconnecting..." badge) — not a blocking modal; the rest of the UI must remain fully usable via the existing poll/refresh behavior.

**US4 (Won't, this iteration) — Toast/desktop notifications for individual events.**
Not requested; the ask is "real-time push... as a submission moves through its lifecycle," which US1/US2's live-updating views satisfy. Notifications are additive scope creep — explicitly deferred.

### Recommended architecture (for BA/backend to firm up, not prescriptive beyond what's needed to scope the work)

- **Publish side (core-api):** in `WorkerApiController`'s submission-upsert/PATCH handlers and `GradingsService`'s send handler, after the Prisma write succeeds, `redis.client.publish('submission:events', JSON.stringify({ submissionId, status, updatedAt }))` — mirrors the exact proven pattern already used for `config:changed` in `redis.service.ts`. One channel is enough; the dashboard filters client-side by id where relevant (per US2), matching how `config:changed` already works (single channel, subscribers decide relevance).
- **Subscribe + stream side (core-api, new `events/` module):** `GET /events/submissions` (session-auth guarded, any role — same access as the Submissions list itself), holds the HTTP connection open, sets `Content-Type: text/event-stream`, subscribes to the Redis channel via a dedicated subscriber connection (Redis pub/sub requires a separate connection from command execution — standard `ioredis`/similar pattern; existing `RedisService.client` used for commands should not double as the pub/sub subscriber), forwards each message as an SSE `data:` frame, and unsubscribes/closes cleanly on client disconnect.
- **Dashboard:** a small hook (e.g. `useSubmissionEvents`) wrapping native `EventSource('/api/events/submissions')` (cookie-auth rides along automatically, same reasoning already documented for the audio player and report-export links) used by both `Submissions.tsx` and `SubmissionDetail.tsx`.
- **Caddy:** SSE responses must not be buffered — flag for devops/infra to confirm `infra/Caddyfile`'s `/api*` reverse-proxy block doesn't buffer response bodies (Caddy does not buffer by default for streaming responses, but this must be verified against the actual current Caddyfile config, not assumed).

### In scope
- New core-api `events/` module: Redis pub/sub subscribe + SSE endpoint, session-auth guarded.
- Publish calls added at core-api's existing submission-status write points (`WorkerApiController`, `GradingsService`) — no new write paths, just an added side-effect after existing successful writes.
- Dashboard: `EventSource` hook, wiring into `Submissions.tsx` (list) and `SubmissionDetail.tsx` (single-id filter), connection-state indicator (US3).
- i18n for any new user-facing strings (e.g. "reconnecting" indicator).

### Out of scope
- Any change to `services/grading-worker` or any `contracts.ts`/`contracts.py` file (per the key architecture finding above).
- Event *history*/replay (Redis pub/sub delivers only to currently-subscribed clients; a disconnected client's missed events are not stored or replayed — mitigated by a one-time list re-fetch on reconnect, not by adding an event log/outbox, which would be new scope).
- Notifications/toasts per submission event (US4, explicitly deferred).
- Any relaxation of the product boundary — this is 100% internal staff dashboard telemetry; nothing here sends anything to students/parents via Zalo.
- Guaranteed delivery / at-least-once semantics for events — this is a best-effort UX enhancement over an already-correct poll/refresh baseline, not a new source of truth (Postgres via the existing REST endpoints remains authoritative; SSE only accelerates when the UI notices).

### Assumptions
1. One shared SSE channel (`submission:events`) covering all submissions is sufficient; per-submission subscription topics (`submission:{id}:events`) would add complexity with no clear benefit given the dashboard's scale (single ILM center, modest concurrent staff users) — flagged as an architecture recommendation, not a hard requirement, in case backend finds a strong reason to split.
2. Target latency ("under ~2s") is a usability guideline, not a hard SLA — no load-testing infrastructure exists in this repo to verify it precisely; QA should verify "visibly fast" rather than a strict millisecond budget.
3. `RedisService`'s existing single client is used for commands elsewhere in core-api; the SSE subscriber needs its own connection (standard Redis client library constraint) — this is an implementation detail for backend, not a product decision.

## Blockers / open questions

None that block starting BA/architecture work. One item for devops to verify during build (not a decision, a verification): confirm `infra/Caddyfile`'s existing `/api*` proxy block streams SSE without buffering, since Caddy config could theoretically need `flush_interval -1` or equivalent depending on the exact directive already in place.

## Notes for the next role

BA: turn the "Recommended architecture" section into a firm contract (exact SSE payload JSON shape, exact endpoint path, exact Redis channel name) before backend starts, and confirm with DBA whether any schema change is needed (PM's read of the code says no — pure Redis pub/sub, no new tables/columns). Frontend: reuse the existing `api/client.ts` cookie-auth assumption already proven for `<audio src="/api/media/:id">` and CSV/xlsx export links — no new auth wiring needed for `EventSource`. DevOps: verify Caddy SSE buffering behavior against the real `infra/Caddyfile` before QA signs off on latency-sensitive acceptance criteria.
