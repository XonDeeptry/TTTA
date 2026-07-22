<!--
  Per-feature-per-role task file, OWNED by the BA agent for F6.
-->

# F6 · BA — Real-time submission status via SSE

- **Owner role:** ba
- **Feature:** F6 — Push submission-lifecycle status transitions to the dashboard live via Server-Sent Events (SSE), so `Submissions.tsx` (list) and `SubmissionDetail.tsx` (detail) update in place without manual refresh. Additive over the existing poll/refresh baseline.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F6-pm.md

## Inputs (what this role received)

- `F6-pm.md` — user stories US1–US4, MoSCoW, recommended architecture (Redis pub/sub `submission:events`, `GET /events/submissions`, `EventSource`, one shared stream, Caddy-buffering caveat), key architecture finding.
- Code read to ground (not speculate) the spec:
  - `services/core-api/prisma/schema.prisma` — `enum SubmissionStatus { received, processing, graded, awaiting_review, sent, failed }` (the exact, closed set of values a status event can carry).
  - `services/core-api/src/worker-api/worker-api.controller.ts` — `POST /internal/submissions` upsert (line 47–63) and `PATCH /internal/submissions/:id` (line 65–80): the two worker-driven status writes. **Both return the Prisma promise directly with no service layer and no `await`** — relevant to the publish hook (see FR-01 note).
  - `services/core-api/src/gradings/gradings.service.ts` — `GradingsService.send()` line 35 sets `status: 'sent'` (the only dashboard-driven status write). `reviewFeedback()` does NOT touch status.
  - `services/core-api/src/submissions/submissions.service.ts` — `deleteMedia` does NOT change `status` (confirmed; out of event scope).
  - `services/core-api/src/onboarding/onboarding.service.ts` — writes `zaloBinding.status` (`pending`/`active`), a DIFFERENT table; NOT a `submission.status` write. Not in scope.
  - `services/core-api/src/redis.service.ts` — `RedisService.client` (single ioredis connection); existing pub/sub precedent `client.publish(CONFIG_CHANNEL, key)` for `config:changed`. Proven pattern to mirror.
  - `services/core-api/src/main.ts` — global `express-session` (`app.use(session(...))`) with cookie `httpOnly:true, sameSite:'lax', maxAge:8h`, `connect-redis` store. Runs before Nest routing → session available on the SSE request.
  - `services/core-api/src/auth/session-auth.guard.ts` — `SessionAuthGuard` throws 401 if `!req.session.user`; any logged-in role passes (same access level as the Submissions list).
  - `infra/Caddyfile` — `handle /api*` → `uri strip_prefix /api` → `reverse_proxy core-api:3001`. The SSE endpoint will be reached at `/api/events/submissions` and proxied to `/events/submissions`.
  - `services/dashboard/src/pages/Submissions.tsx`, `SubmissionDetail.tsx`, `src/api/client.ts` (`fetch` with `credentials:'include'`), `src/i18n/index.ts` (flat vi/en key map, `lng:'vi'`).

## Checklist

- [x] Read F6-pm.md + protocol + template
- [x] Trace ALL `submission.status` write paths in core-api; confirm/correct PM's central claim
- [x] Confirm enum values from schema.prisma
- [x] Verify session-auth works for `EventSource` (cookie/middleware ordering)
- [x] Verify Caddy path + flag buffering verification for DevOps
- [x] Define event model, Redis channel, publisher hook points (exact methods/lines)
- [x] Define SSE endpoint contract (path, headers, auth, heartbeat, reconnect, cleanup)
- [x] Define frontend behavior + fallback for both pages
- [x] Define concurrency/lifecycle correctness requirements
- [x] Define frozen-behavior / scope
- [x] Write numbered testable ACs tagged unit-testable vs browser-only vs devops
- [x] Specify exact vi+en i18n keys
- [x] Set Status DONE

## Outputs (the buildable spec)

### 0. Architecture claim — CONFIRMED (PM was correct)

Every write that mutates `Submission.status` is inside core-api. Exhaustive enumeration (grep on `submission.update`/`submission.upsert`/`status:` across `services/core-api/src`):

| # | Write path | Method / line | Transition(s) it causes |
|---|---|---|---|
| 1 | `POST /internal/submissions` (upsert by `messageId`) | `WorkerApiController.createSubmission`, worker-api.controller.ts:47–63 | creates row (default `received`) or updates status on redelivery |
| 2 | `PATCH /internal/submissions/:id` | `WorkerApiController.updateSubmission`, worker-api.controller.ts:65–80 | `received → processing → graded / awaiting_review / failed` (worker-driven progression) |
| 3 | `POST /gradings/:id/send` | `GradingsService.send`, gradings.service.ts:35 | `graded / awaiting_review → sent` |

No other write path exists. Specifically NOT status writes: `GradingsService.reviewFeedback` (edits feedback only), `SubmissionsService.deleteMedia` (media only), `OnboardingService` (`zaloBinding.status`, different table). grading-worker reaches all of #1/#2 through core-api's REST API — it never touches Postgres.

**Therefore, confirmed:** no change to `services/grading-worker` and no change to any of the three `contracts.ts` / `contracts.py` files. The feature is additive within core-api + dashboard. No status transition bypasses core-api. **No DBA/schema change** — pure Redis pub/sub, no new table/column/index.

`SubmissionStatus` closed value set (frozen contract): `received | processing | graded | awaiting_review | sent | failed`.

---

### 1. Event model

**Redis channel (single, global):** `submission:events`. One authenticated stream of all status changes, filtered client-side. Rationale: this is a single small internal staff dashboard (one ILM center, modest concurrent staff). A per-submission topic (`submission:{id}:events`) would force the server to subscribe/unsubscribe on every list-row hover or detail-open and add churn with no scale benefit; one channel exactly mirrors the proven `config:changed` single-channel pattern where subscribers decide relevance. Client-side filtering is trivial (match by `submissionId`).

**Published message payload** (raw string on the Redis channel — JSON, unlike `config:changed` which mirrors a raw config value; this channel is new so JSON is free to choose):

```json
{ "submissionId": 123, "status": "graded", "at": "2026-07-22T10:15:30.000Z" }
```

- `submissionId` — number, the `Submission.id`.
- `status` — one of the six enum values; MUST equal the value actually persisted (see FR-01: read it from the Prisma write result, do not trust the request body, because the upsert may default to `received` when the body omits `status`).
- `at` — ISO-8601 UTC timestamp of the write (`updatedAt` of the resulting row, or `new Date().toISOString()`).
- `prevStatus` — OMITTED. Not carried: computing it requires an extra pre-read on the upsert path for no functional value (the client overwrites the row's status regardless). If UX later wants transition animations, add it then.

**SSE frame emitted to the browser** (what the endpoint writes per event):

```
event: submission.status
data: {"submissionId":123,"status":"graded","at":"2026-07-22T10:15:30.000Z"}

```

(named event `submission.status`; blank line terminates the frame). Heartbeats are SSE comment frames: `: ping\n\n`.

**Publisher:** core-api, at the three write points in §0, AFTER the Prisma write resolves successfully (never before — a failed write must not emit an event). **Subscriber:** the SSE controller's per-connection dedicated Redis subscriber (see §2), which relays to the browser. The dashboard `EventSource` is the ultimate consumer.

---

### 2. SSE endpoint contract

- **Path:** `GET /events/submissions` (reached from the browser as `/api/events/submissions` via Caddy strip_prefix). New core-api module `events/` (`events.module.ts`, `events.controller.ts`).
- **Auth:** `@UseGuards(SessionAuthGuard)` — any logged-in role (same access as the Submissions list). No session → **HTTP 401** (guard throws `UnauthorizedException`). `EventSource` cannot set headers, but the request is same-origin GET so the `sameSite:'lax'` session cookie is sent automatically — cookie-based session auth is exactly the right mechanism here and needs no new wiring (same reasoning already proven for `<audio src="/api/media/:id">` and CSV/xlsx `<a href>` downloads).
- **Response headers:** `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` (belt-and-braces against proxy buffering). The controller writes directly to the Express `res` stream (inject `@Res()`), sets `res.statusCode = 200`, flushes headers, then streams frames; it does NOT return a value / does NOT use the JSON serializer.
- **Heartbeat / keep-alive:** send a comment frame `: ping\n\n` every **25 seconds** on an interval timer. Rationale: idle proxies/LBs commonly drop connections around 30–60s; 25s stays safely under. The heartbeat also lets the server notice a dead socket (write error → cleanup).
- **Reconnection semantics:** rely on native `EventSource` auto-reconnect. **No `Last-Event-ID` / no server-side replay** — Redis pub/sub is fire-and-forget and this is a best-effort UX accelerator over an authoritative REST baseline. On (re)connect the client performs a **one-time refetch** of the current list/detail via the existing REST endpoint to reconcile anything missed while disconnected. This is simpler than an event log/outbox and fully sufficient for a status feed. (No `retry:` field needed; default browser backoff is fine.)
- **Subscription lifecycle / cleanup (no leaked subscribers):** on each connection the controller creates a **dedicated** Redis subscriber connection via `RedisService.client.duplicate()` (ioredis requires a separate connection for subscribe mode — the shared command client must NOT be put into subscribe mode). It `SUBSCRIBE`s `submission:events` and relays each message as an SSE frame. On `req.on('close')` (client disconnect / tab close / navigation) the controller MUST: (a) `clearInterval` the heartbeat, (b) `unsubscribe` + `.quit()`/`.disconnect()` the duplicated connection, (c) `res.end()`. This guarantees one Redis subscriber per live connection and zero after disconnect.

---

### 3. Frontend behavior

- New hook `services/dashboard/src/hooks/useSubmissionEvents.ts` (no new dependency — `EventSource` is a browser built-in). It opens `new EventSource('/api/events/submissions')` (cookies ride along automatically), listens for the named `submission.status` event, JSON-parses `event.data`, and invokes a caller-supplied callback `(evt: {submissionId:number; status:string; at:string}) => void`. It exposes a connection state (`'connecting' | 'open' | 'error'`) derived from `EventSource` `onopen`/`onerror`. It closes the `EventSource` on unmount.
- **`Submissions.tsx` (list):** subscribe via the hook. On each event, if the row with `submissionId` is in the current page's `data.items`, update that item's `status` in place (badge re-renders via existing `STATUS_BADGE_VARIANT`). If the event's `submissionId` is not currently loaded (e.g. brand-new submission, or on a different page/filter): trigger the existing `load()` once to reconcile (so new arrivals appear if they match the active filter). Existing filter/pagination/manual behavior is unchanged. On `EventSource` transition to `'open'` after an `'error'` (reconnect), call `load()` once to reconcile missed transitions.
- **`SubmissionDetail.tsx` (detail):** subscribe via the hook, filtering to `evt.submissionId === Number(id)`. On a matching event, call the existing `load()` (re-fetches detail so newly-available scores/feedback appear when status reaches `graded`/`awaiting_review`/`sent`). Events for other submissions are ignored (no-op). On reconnect, `load()` once.
- **Fallback (mandatory):** SSE is strictly additive. If `EventSource` never connects, errors, or is unsupported, both pages remain fully functional via their existing fetch-on-mount + user-initiated actions. No data path depends solely on SSE. The existing manual navigation/refetch continues to work unchanged.
- **US3 connection indicator (Should, optional pending UX):** a small non-blocking cue when state is `'error'`/reconnecting, using i18n keys `events.live` / `events.reconnecting` (§7). Coordinate with UX; if UX declines, the hook still works headless and the keys go unused — do not block on this.

---

### 4. Concurrency / lifecycle correctness (testable requirements)

- **CR-1 Multiple tabs/clients:** each open dashboard tab opens its own `EventSource` → its own SSE connection → its own duplicated Redis subscriber. N tabs = N subscribers, all receiving every event. Closing a tab removes exactly its own subscriber.
- **CR-2 Slow/dead client isolation:** a slow or dead SSE client MUST NOT block the publisher or other clients. Publishing is `redis.client.publish(...)` — fire-and-forget, decoupled from any subscriber's write speed. A failed `res.write` on one connection only triggers that connection's cleanup; it does not throw into the publisher or the Prisma write path.
- **CR-3 No leaked subscribers:** after a client disconnects, the server has zero residual Redis subscriptions/interval timers for it (see §2 cleanup). Unit-verifiable by asserting `unsubscribe`/`quit`/`clearInterval` are called on the mocked subscriber when the mocked `res`/`req` emits `close`.
- **CR-4 Read-only projection:** the feature MUST NOT alter grading-pipeline timing or any submission data. The publish call is a post-write side-effect that occurs after the Prisma write already resolved; a publish failure MUST NOT fail or delay the underlying request (wrap publish so it cannot reject the handler — log-and-continue). The write's HTTP response is unchanged.
- **CR-5 Correct value:** the published `status` equals the persisted status (read from the Prisma result), including the upsert-default `received` case where the request body omits `status`.

---

### 5. Frozen behavior & scope

**Frozen (must not change):**
- Product boundary: internal staff dashboard telemetry only. Nothing here sends anything to students/parents via Zalo. No new outbound message paths.
- `services/grading-worker`: untouched.
- The three duplicated contract files (`services/zalo-gateway/src/contracts.ts`, `services/core-api/src/contracts.ts`, `services/grading-worker/src/grading_worker/contracts.py`): untouched (no queue/topology change — SSE uses Redis pub/sub, not RabbitMQ).
- Existing REST endpoints (`/submissions`, `/submissions/:id`, `/gradings/:id`, `/gradings/:id/send`, `/internal/*`) and their responses: unchanged. Manual refresh/poll continues to work as the authoritative baseline.
- Prisma schema: no change (no new table/column). DBA sign-off: none needed.

**In scope:**
- core-api `events/` module (SSE controller + per-connection Redis subscriber) + publish side-effect at the three §0 write points.
- dashboard `useSubmissionEvents` hook + wiring into `Submissions.tsx` and `SubmissionDetail.tsx` + optional connection indicator.
- New i18n keys (§7).

**Out of scope:** event history/replay/outbox; per-submission Redis topics; toasts/desktop notifications (US4 deferred); at-least-once delivery guarantees; any load-testing infra.

---

### 6. Functional & non-functional requirements + acceptance criteria

Tags: **[unit]** = core-api jest with mocked Redis + mocked req/res stream, or dashboard component test with a mocked `EventSource`; **[browser]** = manual/E2E in a real browser; **[devops]** = infra verification.

**FR-01 — Publish on status write.** After each of the three write paths in §0 persists successfully, core-api publishes one `submission:events` message with the persisted `{submissionId, status, at}`.
- AC-1 **[unit]** Given `POST /internal/submissions` upserts a row, When the Prisma write resolves, Then `redis.client.publish('submission:events', <json>)` is called exactly once with `submissionId` = result id and `status` = result status (including default `received` when body omits status). (Note to backend: the controller currently returns the Prisma promise directly with no `await`; introduce an `await` + publish, or route through a thin service, so the publish sees the resolved row.)
- AC-2 **[unit]** Given `PATCH /internal/submissions/:id` sets status to `graded`, When it resolves, Then exactly one publish fires with `status:'graded'` and the correct id.
- AC-3 **[unit]** Given `POST /gradings/:id/send` (`GradingsService.send`), When `submission.status` is set to `sent`, Then exactly one publish fires with `status:'sent'` and the submission's id.
- AC-4 **[unit]** Given the Prisma write REJECTS, When the handler runs, Then NO publish fires (publish is strictly after a resolved write).
- AC-5 **[unit]** Given `redis.publish` rejects/throws, When a write completes, Then the HTTP handler still returns its normal success response (publish failure is swallowed/logged, never propagated). (CR-4)
- AC-6 **[unit]** Given `GradingsService.reviewFeedback` (feedback edit) or `SubmissionsService.deleteMedia`, When called, Then NO `submission:events` publish fires (neither changes status).

**FR-02 — SSE endpoint stream & auth.** `GET /events/submissions` streams `text/event-stream`, session-auth guarded.
- AC-7 **[unit]** Given no `req.session.user`, When `GET /events/submissions`, Then the guard yields HTTP 401 and no stream/subscription is created.
- AC-8 **[unit]** Given an authenticated request, When it connects, Then the response has `Content-Type: text/event-stream` and status 200, and a Redis subscriber (`client.duplicate()` + `subscribe('submission:events')`) is created.
- AC-9 **[unit]** Given a connected client, When a `submission:events` message arrives on the subscriber, Then the server writes a frame `event: submission.status\ndata: <json>\n\n` to `res`.
- AC-10 **[unit]** Given a connected client, When ~25s idle elapses, Then a heartbeat `: ping\n\n` comment frame is written (verify the interval callback writes it).

**FR-03 — Connection cleanup.** No leaked subscribers/timers.
- AC-11 **[unit]** Given a connected client, When `req` emits `close`, Then the server (a) clears the heartbeat interval, (b) `unsubscribe`s + closes the duplicated Redis connection, and (c) ends the response. (CR-3)
- AC-12 **[unit]** Given two independent connections, When one closes, Then only that one's subscriber/timer is torn down; the other keeps receiving events. (CR-1)

**FR-04 — Frontend live update + fallback.**
- AC-13 **[unit]** (dashboard) Given `Submissions.tsx` mounted with a row `id=5 status=processing` and a mocked `EventSource`, When a `submission.status` event `{submissionId:5,status:'graded'}` is dispatched, Then row 5's badge shows `graded` without a full reload.
- AC-14 **[unit]** (dashboard) Given `SubmissionDetail.tsx` for `id=5`, When an event for `submissionId:9` is dispatched, Then nothing on the page changes; When an event for `submissionId:5` is dispatched, Then `load()` (detail refetch) is invoked.
- AC-15 **[unit]** (dashboard) Given `EventSource` fires `onerror` then `onopen` (reconnect), Then the page calls its list/detail refetch exactly once on the reconnect to reconcile.
- AC-16 **[browser]** Given the SSE endpoint is unreachable (server down), When the page loads, Then the list/detail still renders via REST and remains fully usable (manual navigation works); SSE is additive-only.
- AC-17 **[browser]** Given two browser tabs on the Submissions list, When a submission transitions, Then both tabs update their badge live. (CR-1 end-to-end)
- AC-18 **[browser]** Given a submission moving worker-driven `received→processing→graded/awaiting_review`, When watching the list without refreshing, Then the badge visibly updates at each transition within a usably-short delay (PM's ~2s guideline; QA verifies "visibly fast", not a strict ms budget).

**FR-05 — DevOps / proxy (non-functional).**
- AC-19 **[devops]** Given `infra/Caddyfile`'s `handle /api*` reverse_proxy, When an SSE response is served, Then frames reach the browser incrementally (NOT buffered until connection close). Caddy auto-detects `text/event-stream` and flushes immediately by default; if verification shows buffering, add `flush_interval -1` to the `/api*` `reverse_proxy` block. DevOps must explicitly verify (curl `-N` to `/api/events/submissions` with a valid session cookie and confirm a heartbeat/frame arrives before the connection is closed). No compression/`encode` should apply to `text/event-stream`.
- AC-20 **[devops]** Confirm no idle-timeout in the compose/Caddy path closes the connection under the 25s heartbeat interval (heartbeat should keep it alive; verify a connection survives >60s idle).

**NFR — latency:** target under ~2s from DB write to badge update under normal load (usability guideline, not an SLA; no load-test infra in repo). **NFR — read-only:** feature must not change grading-pipeline timing or submission data (CR-4).

---

### 7. i18n keys (add to `services/dashboard/src/i18n/index.ts`, both `vi` and `en`)

Only needed if UX adopts the US3 connection indicator (optional). Exact keys:

| key | vi | en |
|---|---|---|
| `events.live` | `Đang cập nhật trực tiếp` | `Live` |
| `events.reconnecting` | `Đang kết nối lại…` | `Reconnecting…` |
| `events.offline` | `Mất kết nối trực tiếp — hãy làm mới thủ công` | `Live connection lost — refresh manually` |

(If UX declines the indicator, these keys are simply not added. No other user-facing strings are introduced — status badge values reuse the existing raw enum text as `Submissions.tsx` already renders them.)

---

### Assumptions
1. One shared `submission:events` channel is sufficient (single center, modest concurrency); per-submission topics deferred unless backend finds a strong reason.
2. ~2s latency is a usability guideline; QA verifies "visibly fast".
3. The SSE subscriber uses `RedisService.client.duplicate()` (ioredis subscribe-mode requires a dedicated connection) — implementation detail confirmed against the existing single-client `RedisService`.

### Dependencies
- Backend: core-api `events/` module + publish hooks; must add `await`+publish to the two currently-fire-and-forget `WorkerApiController` handlers (AC-1 note).
- Frontend: `useSubmissionEvents` hook + wiring; reuses existing cookie-auth.
- DevOps: Caddy no-buffering verification (AC-19/20).
- DBA: none (no schema change).

## Blockers / open questions

None blocking. One item for DevOps to VERIFY (not decide): Caddy streams `text/event-stream` without buffering on the real `infra/Caddyfile` (AC-19). One coordination item for UX: whether to render the optional US3 connection indicator (§7 keys) — feature works without it.

## Notes for the next role

- **Backend:** the three publish points are worker-api.controller.ts:47–63 & 65–80 and gradings.service.ts:35. The two controller handlers currently `return this.prisma...` with no `await` — change to await the result, then publish the *resolved* row's `id`+`status` (the upsert may default status to `received`). Wrap publish so it can never reject the HTTP handler (CR-4/AC-5). SSE controller: `@Res()` raw stream, `RedisService.client.duplicate()` for the subscriber, 25s heartbeat, tear down on `req.on('close')`.
- **Frontend:** `EventSource('/api/events/submissions')`, named event `submission.status`, cookie-auth automatic. SSE additive only — never remove the existing REST fetch paths.
- **QA:** ACs tagged [unit]/[browser]/[devops] in §6. Unit-testable: publisher hook (mock Redis), SSE controller stream/auth/cleanup (mock req/res + mock Redis), dashboard hook/badge update (mock EventSource). Browser-only: multi-tab, real reconnect, visible latency. DevOps: Caddy buffering.
- **DBA:** confirmed no schema/table/column/index change required.
