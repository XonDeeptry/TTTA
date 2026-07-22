# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Node/npm are NOT run directly on the dev machine (project owner's constraint) — build/test
# TS/JS through Docker instead. Reduce jest's --maxWorkers if the box is tight on RAM alongside
# the running docker-compose stack (a jest worker has been OOM-killed at full parallelism before).
docker run --rm -v "<abs-path-to-service>:/app" -w /app node:24-alpine sh -c "npm ci && npm test -- --maxWorkers=2"
# On Windows Git Bash, prefix with MSYS_NO_PATHCONV=1 so `-v`/`-w` paths aren't mangled.
# `docker compose build <service>` also exercises the tsc/vite compile step (see Dockerfiles).

# core-api only (services/core-api)
npm run prisma:migrate  # `prisma migrate dev` — needs Postgres reachable at localhost:5432
                        # (docker-compose binds it loopback-only for exactly this)
npm run prisma:generate # regenerate the Prisma client after schema.prisma changes

# dashboard (services/dashboard) — also in docker-compose since M4 (Caddy serves the built SPA)
npm run dev   # Vite dev server, proxies /api to localhost:3001 — fastest iteration loop

# grading-worker (services/grading-worker) — Python, venv-based (not containerized for dev)
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"  # Windows; Scripts→bin on Linux/Mac
.venv/Scripts/pytest                 # all tests mocked — no real Rabbit/Redis/core-api/LLM needed
.venv/Scripts/pytest tests/test_pipeline.py -v

# Full stack (from infra/; needs infra/.env — copy from .env.example, set DOMAIN=localhost for dev
# or Caddy will try to obtain a real Let's Encrypt cert and fail)
docker compose up -d --build
docker compose logs core-api --tail 20
docker compose logs grading-worker --tail 20
docker compose exec rabbitmq rabbitmqctl list_queues name messages
docker compose exec postgres psql -U ilm -d ilm -c '\dt'
docker compose down

# Publish a fixture message straight onto the submissions queue (no real Zalo message needed) —
# RabbitMQ management API is loopback-only, matches infra/.env RABBITMQ_DEFAULT_USER/PASS:
curl -u ilm:change-me -X POST http://localhost:15672/api/exchanges/%2f/ilm.direct/publish \
  -H "Content-Type: application/json" \
  -d '{"routing_key":"submissions","properties":{},"payload_encoding":"string","payload":"{\"v\":1,\"messageId\":\"m1\",\"eventName\":\"user_send_text\",\"kind\":\"text\",\"zaloUserId\":\"u1\",\"receivedAt\":\"2026-01-01T00:00:00Z\"}"}'
```

## Task tracking

`TASKS.md` (repo root) is the persistent progress tracker, organized by the 5 build milestones. **Update it whenever a task or phase completes** — the session todo list is not enough.

## Monorepo layout

`services/zalo-gateway` (TS/NestJS — implemented, M1) · `services/core-api` (TS/NestJS — implemented, M2-M4) · `services/grading-worker` (Python — implemented, M3; non-LLM branches smoke-tested, real Gemini/OpenAI calls need API keys from the project owner) · `services/dashboard` (React — implemented, M2 + M4; all 5 subsystems, containerized) · `infra/` (docker-compose, Caddyfile, .env). Message contracts and RabbitMQ topology constants are duplicated three times now — no shared package mechanism exists across services, let alone across languages — in `services/zalo-gateway/src/contracts.ts`, `services/core-api/src/contracts.ts`, and `services/grading-worker/src/grading_worker/contracts.py`. Keep all three identical when the topology changes.

## zalo-gateway architecture (implemented)

The gateway is the only service that talks to Zalo. It has no business logic (no binding lookup, no grading, no templating) — that all lands in core-api/grading-worker in later milestones. Two flows:

**Inbound** (`webhook/webhook.controller.ts` → `webhook.service.ts`): request arrives, signature is verified (`lib/zalo-signature.ts`, HMAC-SHA256 over `appId + rawBody + timestamp + secret`, header `x-zevent-signature`; skipped only if no secret/app id is configured yet), the event is deduped via Redis `SET dedup:{messageId} NX EX 7d` (`redis.service.ts`), mapped from Zalo's `event_name` to a `SubmissionKind`, and published to RabbitMQ. The controller ACKs 200 within that path — nothing downstream is awaited.

**Outbound** (`outbound/outbound.consumer.ts`): the single egress point for all messages to users. Before calling `ZaloApiService.sendText`, it checks the 48h free-window guard (`lib/time-window.ts` `canSendWithin48h`, keyed off `zalo:lastin:{userId}` which every inbound event refreshes) unless disabled via config; blocked sends are pushed onto Redis list `blocked_48h` (temporary — becomes `outbound_log` once core-api exists) and are *not* retried, since sending later doesn't help. Malformed messages (no `zaloUserId`/`text`) are dropped, not retried.

**RabbitMQ topology** (`rabbit.service.ts`, constants in `contracts.ts`): one `direct` exchange `ilm.direct` with queues `submissions` and `outbound`. Each queue gets a paired `{queue}.dlq` (bound to exchange `ilm.dlx`) and `{queue}.retry` (bound to `ilm.retry`, message TTL 30s, dead-letters back into `ilm.direct`). `RabbitService.consume()` implements the retry loop generically: handler throws → republish to `{queue}.retry` with `x-retry` header incremented → after `MAX_RETRIES` (3) it goes to `{queue}.dlq` instead. Both gateway and (eventually) grading-worker assert this same topology on boot, so it's safe for either to start first.

**Config-over-Redis** (`redis.service.ts`): per architecture doc v1.2, application config (Zalo credentials, feature flags like the 48h guard) is never read from `.env` in production. `getConfig(key)` reads `config:{key}` from Redis — mirrored there by core-api's `SettingsService` from the Postgres `settings` table — and falls back to a fixed set of `ZALO_*`/env vars only for local dev. Values are cached in-process; a pub/sub message on `config:changed` flushes that cache, which is the hot-reload mechanism referenced throughout the docs. This has been smoke-tested end-to-end: writing a setting via core-api's `PUT /settings/:key` lands in Redis as the exact raw string the gateway expects (no JSON quoting) and fires `config:changed`.

**Token lifecycle** (`zalo/token.service.ts`, `zalo/zalo-api.service.ts`): `TokenService` refreshes the OA access/refresh token pair every 50 minutes (OAuth v4 `refresh_token` grant) and writes the new pair atomically via a Redis `MULTI` (Zalo's refresh tokens are single-use, so a partial write would strand the account). Two consecutive failures set `alert:zalo_token_failed` for the dashboard/cron to surface later. Independently, `ZaloApiService.sendText` catches Zalo error `-216` (token expired mid-request), forces one `TokenService.refreshNow()`, and retries the send once before giving up.

Key Redis namespaces to know when debugging: `dedup:*`, `zalo:lastin:{userId}`, `zalo:access_token`/`zalo:refresh_token`/`zalo:token_expires_at`, `config:*`, `alert:zalo_token_failed`, `blocked_48h`.

## core-api architecture (implemented)

The Postgres source of truth — the only service that talks to Postgres directly (gateway/worker always go through core-api's REST API, per `Idea/20260719-KienTrucMicroservices.md` §3.2). Uses Prisma (`prisma/schema.prisma`, migrations under `prisma/migrations/`) — a deliberate departure from the gateway's no-ORM style, justified in the v1.3 changelog of the architecture doc.

**Auth** (`auth/`): real session auth, not a placeholder — `express-session` + `connect-redis` (reuses the same Redis instance), bcrypt-hashed passwords, 2 roles (`admin`/`staff` on the `dashboard_users` table — a table added in v1.3, not in the original schema doc). `SessionAuthGuard` gates any dashboard-facing route; `RolesGuard` + `@Roles('admin')` further restricts settings/DLQ. `BootstrapAdminService` creates the first admin from `CORE_API_BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` env vars only when `dashboard_users` is empty — there's no self-registration flow. Separately, `InternalTokenGuard` protects worker-facing `/internal/*` routes with a static shared token (`settings['internal.worker_api_token']`, env fallback `INTERNAL_API_TOKEN`) — service-to-service, not a user session.

**Settings** (`settings/`): a fixed allow-list (`setting-defs.ts`), not a generic key-value editor — matches the specific fields the architecture doc names (`zalo.*`, `llm.*`, `limits.*`, `sheets.*`, `internal.*`). Writing a setting upserts Postgres, mirrors the *raw string* value to Redis `config:{key}` (booleans become `"true"`/`"false"`, not JSON — this must stay byte-compatible with what the gateway already reads), and publishes `config:changed`. Masked keys (secrets) show only the last 4 characters in `GET /settings`; `SettingsService.getRaw()` is the unmasked internal accessor used by guards/sync jobs.

**Onboarding / ChoGan** (`onboarding/`): `POST /internal/bindings/ensure` is what grading-worker's pipeline calls on every submission when it sees a `zalo_user_id` — upserts a `pending` `zalo_bindings` row, or returns all existing bindings for that user (supports one Zalo account mapping to several students). `PATCH /onboarding/:id/activate` matches the entered phone against `students.phone`, flips the binding to `active`, and publishes an activation message onto the `outbound` queue — which the *existing* gateway `OutboundConsumer` picks up and runs through its own 48h-guard logic unmodified.

**API additions made during M3** (not in the original M2 design — see `worker-api.controller.ts`): `POST /internal/submissions` changed from a plain `create` to an **upsert keyed on `messageId`**, since a RabbitMQ redelivery/retry of a partially-processed message would otherwise hit the unique constraint on retry; `PATCH /internal/submissions/:id` for status/mediaPath/durationSec updates as the worker progresses through a submission; `GET /internal/students/:id` (returns `course.llmConfig` + `classes_config.autoSend`, looked up by the student's `className` — the worker needs both to pick an LLM provider and decide the auto-send branch); `POST /internal/flags` for out-of-flow messages.

**Sheets sync** (`sheets-sync/`): `SheetsClient` is an interface with a real `googleapis`-backed implementation (`google-sheets-client.ts`) selected via an injectable factory token (`SHEETS_CLIENT_FACTORY`) — tests substitute a fixture-returning factory instead of hitting Google. Runs every 15 minutes, upserts `students` by `code`, and never swallows a bad row silently — failures (invalid phone, unknown `course_id` key) are collected into `sheet_sync_log.error_detail`. Needs a real service-account JSON + spreadsheet ID from the project owner before it does anything (same deferred-credentials situation as the gateway's Zalo OAuth in M1.8).

**Missing-submission report** (`missing-submissions/`): cron at 20:30 — reads `assignment_calendar`, groups students without a submission today by class, and publishes one message per class to `classes_config.advisor_zalo_id` via the RabbitMQ publisher. Never targets students or parents.

**RabbitMQ** (`rabbit.service.ts`): publish-only port of the gateway's service (no consume loop — core-api doesn't consume queues in M2), but asserts the identical topology so either service can start first. DLQ inspection/retry (`dlq/`) and queue-depth reporting reuse this same AMQP channel directly (`channel.get`/`channel.checkQueue`) rather than adding an HTTP client for RabbitMQ's management API.

**Media** (`media/`): `GET /media/:submissionId` streams the file at `submissions.media_path` (session-auth, path-traversal-checked against `MEDIA_ROOT`, factored into `lib/media-path.ts`'s `resolveMediaPath()` — reused by the M4 `submissions/` module's delete endpoint too). The retention/deletion cron (§3.8: video deleted 7 days after audio extraction, audio kept 90 days) is still `TASKS.md` M3.6, deliberately deferred until there's been at least one real graded submission to confirm the write path — grading-worker exists now but hasn't graded a real clip yet (no LLM API keys configured).

**M4 dashboard-facing modules** (`students/`, `submissions/`, `gradings/`, `classes-config/`, `criteria/`, `reports/`, `monitoring/` — all session-auth, phân hệ 1 admin-only per §3.7, phân hệ 2-5 admin+staff):
- `submissions/` + `gradings/`: list/detail/status-filter submissions; `PATCH /gradings/:id` edits `reviewedFeedback`; `POST /gradings/:id/send` publishes `reviewedFeedback ?? llmFeedback` onto `outbound` and flips `submission.status` to `sent` — same outbound path the gateway's `OutboundConsumer` already handles, no new consumer needed.
- `criteria/docx-parser.ts`: `mammoth.convertToHtml()` (not `extractRawText` — that would lose the heading structure) + a hand-written heading-splitter recognizing the four §3.9 sections. A small fixed mini-format per section (`key: value` lines for "Thông tin chung"/"Giọng điệu & ngôn ngữ nhận xét"; `name (trọng số W): band=text; ...` per line for "Tiêu chí") makes automatic parsing unambiguous. Rejects (400) a rubric missing the mandatory `pronunciation` dimension — the same rule grading-worker enforces at grading time (`grading_worker/grading/schema.py`), just caught earlier at upload. `scripts/generate-rubric-template.ts` (using the `docx` package) produces `templates/rubric-template.docx`, the sample file for teachers *and* the fixture this parser was actually smoke-tested against.
- `reports/report-export.ts`: `toCsv()` (manual string-join) and `toXlsxBuffer()` (via `exceljs`) both consume the same row data from `reports.service.ts` — the project owner asked for both formats, not one or the other.
- `monitoring/`: `GET /monitoring/queues` extends `RabbitService.queueDepth()` to report main-queue depth alongside the `.dlq` depth already used by `dlq/`; `GET /monitoring/token` reads `zalo:access_token`/`zalo:token_expires_at`/`alert:zalo_token_failed` straight off `RedisService.client` (already public) rather than proxying through the gateway.

Global `@Global()`-marked infrastructure modules (`prisma.module.ts`, `redis.module.ts`, `rabbit.module.ts`, `settings.module.ts`) exist so guards used via `@UseGuards()` in any feature module (e.g. `InternalTokenGuard`, which depends on `SettingsService`) resolve correctly — Nest instantiates a guard class in the DI scope of whichever module's controller uses it, not the module where the guard was originally declared, so its dependencies must be globally reachable.

## grading-worker architecture (implemented; real LLM calls need API keys)

The only service that calls Gemini/OpenAI. Consumes `submissions`, writes everything back through core-api's `/internal/*` API — never touches Postgres directly. Uses `aio-pika` (not `pika`) specifically because grading calls take 30–90 seconds and an async event loop keeps servicing AMQP heartbeats during that wait.

**`pipeline.py`** (`SubmissionPipeline.handle`) is the whole flow, in order: upsert the `submissions` row → `POST /internal/bindings/ensure` → if `kind == 'text'`, create a `flags` row and stop (bot never replies to free text, per the product boundary) → if no active binding, publish an onboarding message and stop; if multiple active bindings, publish a "which student is this?" clarification and stop → if `kind` isn't `audio`/`video`, flag and stop → download the media (`media/downloader.py`, path convention `/data/media/{yyyy}/{mm}/{submissionId}/original.{ext}`) → `ffprobe` the duration and reject (outbound message + `status='failed'`) if it exceeds `limits.max_clip_duration_sec` **before** calling any LLM (the cost valve) → `ffmpeg` always normalizes to `audio.mp3` regardless of whether the input was audio or video, so exactly one mime type (`audio/mp3`) ever reaches a provider → fetch the rubric via `/internal/criteria/:courseId`, build a JSON Schema from it dynamically (`grading/schema.py` — `pronunciation` is a mandatory dimension; a rubric missing it is rejected outright, not silently graded) → grade via `grading/providers/factory.py`, which picks Gemini or OpenAI per `course.llmConfig.provider` and falls back to the other on failure → validate the output against the same schema (a validation failure is an uncaught exception, which is what lets `rabbit_consumer.py` retry it) → write `gradings`/`cost_log` → branch on `classes_config.autoSend`: publish the feedback onto `outbound` immediately, or leave `status='awaiting_review'` for the M4 review screen.

**Config** (`config.py`): reads `config:*` directly from Redis (same as the gateway), not by round-tripping every value through core-api — this matches the architecture doc's v1.2 changelog, which explicitly mirrors settings "for gateway/worker" to read.

**LLM provider SDKs** (`grading/providers/gemini.py`, `openai_provider.py`): Gemini uses the current `google-genai` SDK's `client.interactions.create(...)` — confirmed against live docs on 2026-07-20 because the SDK shape had changed since pre-cutoff training knowledge (it used to be `generate_content`). OpenAI uses the standard Chat Completions `input_audio` content part, which didn't need re-verification. Neither has been exercised against a real API key yet — `llm.gemini_api_key`/`llm.openai_api_key` need to be set via the dashboard's `/settings` screen first (same deferred-credentials situation as Zalo in M1.8 and Sheets in M2.4). If either SDK's shape has drifted further by the time real keys are available, only that one file needs fixing — the rest of the pipeline is provider-agnostic via `grading/providers/base.py`'s `Provider` protocol.

**Retry/DLQ** (`rabbit_consumer.py`): a line-for-line Python port of the gateway's `RabbitService.consume()` retry logic — same header-based `x-retry` counter, same `MAX_RETRIES`/`RETRY_TTL_MS` constants from `contracts.py`.

**What's been verified without real LLM keys**: publishing fixture messages directly onto `ilm.direct` via RabbitMQ's management API (see Commands above) end-to-end confirmed the text→flag branch, the pending-binding→onboarding-message branch (correctly blocked by the gateway's existing 48h guard, since the fixture user had no prior inbound message), and the multi-binding clarification branch — all through the real queue and a real core-api, not mocks. The grading call itself (and thus the happy-path auto-send/awaiting-review branches against a real LLM) is unit-tested with mocked providers but not yet exercised for real.

## Dashboard architecture (implemented — all 5 subsystems)

`services/dashboard` is a React + Vite + react-i18next (vi default, en) SPA. Routes split by role per §3.7 (`App.tsx`'s `ProtectedShell` takes an `adminOnly` flag): `/monitoring` and `/settings` are admin-only (phân hệ 1); `/onboarding`, `/students`, `/submissions` (+ `/submissions/:id`), `/reports`, `/criteria` are admin+staff (phân hệ 2-5). `AuthContext` exposes `user.role` for both the route guard and conditional nav links.

- `pages/Monitoring.tsx`: queue/DLQ depths + retry button, Zalo token status, last Sheets-sync log — all read-only views over the `monitoring`/`dlq`/`sheets-sync` core-api endpoints.
- `pages/Students.tsx`: search + inline per-row edit mode.
- `pages/Submissions.tsx` + `pages/SubmissionDetail.tsx`: status-filtered list linking to a detail view with a native `<audio src="/api/media/:id">` player (cookies ride along automatically for same-origin requests — no special auth wiring needed), scores/feedback display, a review textarea, and admin-only media deletion.
- `pages/Reports.tsx`: date-ranged submission-rate and cost tables with CSV/`.xlsx` export links (plain `<a href>` downloads — same cookie-auth reasoning as the audio player).
- `pages/Criteria.tsx`: `.docx` upload via `FormData`/`fetch` directly (bypasses `api/client.ts`'s JSON-only wrapper, since multipart needs the browser to set its own `Content-Type` boundary), rubric JSON preview, and the `classes_config.autoSend`/`advisorZaloId` table.

**Containerization** (new in M4 — `infra/Caddyfile` had reserved this spot since M1): `services/dashboard/Dockerfile` builds the SPA then copies `dist/` into a shared named volume (`dashboarddist`) and exits — no Node/nginx runs in production, Caddy just `file_server`s the static output with an SPA fallback (`try_files {path} /index.html`). The `dashboard` compose service has `restart: "no"` since it's a one-shot copy job, not a long-running process.

## What this repository is

A **Zalo OA homework-grading bot** for the ILM English Center, currently mid-build (Milestones 1–4 of 5 shipped — see `TASKS.md`). Students submit homework (mainly ~5-minute speaking clips) via Zalo Official Account; an LLM (Gemini Flash, chosen for direct audio input) grades against course-level criteria and replies. All planning documents are written in Vietnamese; so are code comments in `services/zalo-gateway`, `services/core-api`, and `services/grading-worker`.

## Documents

- `Idea/Foundation.md` — v1.0 spec: requirements, workflows, rollout plan. Original architecture used **n8n + Google Sheets** (low-code, single merged webhook workflow with branching).
- `Idea/UpdateFoundation.md` — 2026-07-19 update proposing a **microservices design**: RabbitMQ (message broker + Dead Letter Queue), Redis (Zalo token cache, rate limiting), PostgreSQL (users, grading history, criteria), plus services: Zalo Bot Gateway, User Management (syncs from Google Sheets), Criteria Management (.docx rubric ingestion), LLM Grading Worker, Web Dashboard.
- `Idea/20260719-KienTrucMicroservices.md` — **current authoritative architecture** (v1.5): systematic evaluation of the two docs above, debate verdicts, and the final detailed design. "Microservices-lite": exactly 4 services (`zalo-gateway` TS/NestJS, `core-api` TS/NestJS, `grading-worker` Python, `dashboard` React) in one monorepo/docker-compose on a single VPS, with PostgreSQL as source of truth, RabbitMQ (+DLQ), Redis, Caddy, and **local-only media storage** on the VPS disk (no cloud storage services — owner's cost constraint; retention lifecycle defined in the doc). No gRPC/K8s. Google Sheets is a one-way input channel synced into Postgres. v1.1 decisions: grading criteria are authored as teacher .docx templates parsed into structured rubric JSON; an LLM provider abstraction covers both Gemini and ChatGPT; pronunciation scoring is a **mandatory** rubric dimension graded by the LLM itself (no local AI models ever — all AI inference goes through Gemini/ChatGPT APIs; the VPS only orchestrates and stores); the dashboard and system messages are vi/en bilingual. v1.2: ALL application configuration (Zalo app credentials/tokens, LLM API keys, operational thresholds) is administered via the dashboard UI — stored in the Postgres `settings` table (owned by core-api), mirrored to Redis `config:*` keys with pub/sub hot reload for gateway/worker; `.env` holds only infrastructure secrets (Postgres/Redis/RabbitMQ/domain), with ZALO_*/API-key env vars serving as dev-only fallbacks. Includes the target Postgres schema, queue topology, and build roadmap. v1.3 (added during M2 implementation): DB layer is Prisma; a `dashboard_users` table was added for real session auth built in M2 (not deferred to M4); a minimal 3-screen dashboard slice (login/settings/onboarding) was pulled forward from M4 for the same reason. v1.4 (added during M3 implementation): grading-worker uses `aio-pika` over `pika`; the Gemini SDK call shape (`google-genai`'s `client.interactions.create`) was re-verified against live docs since it had changed since pre-cutoff training knowledge; `POST /internal/submissions` became an upsert-by-`messageId` instead of a plain create (RabbitMQ redelivery would otherwise hit the unique constraint); two more `/internal/*` endpoints were added for the worker. v1.5 (added during M4 implementation): report export supports both CSV and real `.xlsx` (via `exceljs`) per the project owner's decision; the rubric `.docx` parser uses `mammoth.convertToHtml` plus a hand-written heading-splitter with a small fixed mini-format per section, verified against a real generated sample file; `classes_config` (present in the schema since M2) got its first API; the dashboard was containerized for the first time.

Architecture precedence: `20260719-KienTrucMicroservices.md` > `UpdateFoundation.md` > `Foundation.md`. `Foundation.md` remains authoritative for product scope, business rules, and data semantics.

## Product boundaries (hard rules from the spec)

- The bot does **not converse** with students (scope narrowed 2026-07-19, architecture doc v1.1): it only receives submissions, verifies student identity, and returns grading feedback via fixed system templates. Any other student text (questions, fees, complaints) is flagged to human advisors ("tư vấn") — the bot must NOT reply.
- Bot never messages parents and never nags students to submit; advisors handle both via the end-of-day missing-submission report.
- Daily AI feedback is practice, not official teacher grading (the update doc adds a manual-override review step before results are sent).

## Key design constraints

- Zalo webhooks only expose an anonymous `user_id`; students are matched to records via phone number entered by an advisor during onboarding (ChoGan flow). One Zalo account may map to multiple students (siblings) — the bot must ask whose submission it is.
- Zalo OA access tokens expire in ~1 hour; a background refresh job (refresh_token, OAuth v4) is mandatory.
- Deduplicate incoming messages by `message_id` (Zalo can redeliver).
- Webhook receiver must ACK Zalo with HTTP 200 within milliseconds; all real work happens async via the queue.
- Course keys must match exactly between the student list and the grading-criteria store (whitespace/case differences break lookups).
- Replies within Zalo's 48-hour window are free — stay inside it.
- Gemini API cost scales with audio length; clip length limits are the cost control.
