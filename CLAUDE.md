# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

> ### ⛔ DO NOT start Docker on the dev machine — build and test on the VPS (`10.0.6.250`)
>
> Node/npm are not run directly on the dev box (owner's constraint), and **Docker Desktop there is
> not reliable for this project**: it stopped mid-session twice on 2026-09-06, and a jest worker has
> been OOM-killed at full parallelism. The VPS is the build machine — 8 cores / 15GB, always up, and
> it is the same Linux the images actually run on. Do not `docker compose up` locally either: the
> local stack and the VPS stack would both refresh the *same* Zalo OA token and invalidate each
> other (see the token trap below).
>
> Exception: **grading-worker's pytest runs locally** in the venv. It is pure Python with everything
> mocked, needs no Docker, and finishes in ~3s.

```bash
# ── Run TS/JS builds and tests ON THE VPS ────────────────────────────────────────────────
# 1. Copy only the files you changed (tar over ssh — no rsync on the box, and this preserves
#    new files, which `git diff` patches do not).
cd /d/Docs/Project/TTTA
tar czf - services/core-api/src/onboarding services/core-api/src/contracts.ts \
  | ssh -i "$HOME/.ssh/ttta_vps" -o BatchMode=yes sonbui@10.0.6.250 'cd ~/TTTA && tar xzf -'

# 2. Typecheck + test. `npm ci` only needed the first time (node_modules persists in the mount).
ssh -i "$HOME/.ssh/ttta_vps" -o BatchMode=yes sonbui@10.0.6.250 \
  'docker run --rm -v "$HOME/TTTA/services/core-api:/app" -w /app node:24-alpine sh -c \
   "npx tsc --noEmit 2>&1 | tail -8; echo TSC-DONE; npm test -- --maxWorkers=2 2>&1 | tail -6" < /dev/null'

# `npx tsc --noEmit` FAILS with "This is not the tsc command you are looking for" when node_modules
# is absent — run `npm ci --silent` first. That message is not a type error; do not read an empty
# tsc section as "clean" (a `&& echo CLEAN` after it will lie to you).

# 3. Deploy: rebuild only the affected services. core-api runs `prisma migrate deploy` at startup
#    (Dockerfile CMD), so migrations apply automatically.
ssh -i "$HOME/.ssh/ttta_vps" sonbui@10.0.6.250 \
  'cd ~/TTTA/infra && docker compose up -d --build core-api dashboard < /dev/null'

# The `dashboard` service is a one-shot build container: it compiles the SPA into the shared
# `dashboarddist` volume and EXITS (`restart: "no"`). "exited (0)" is success, not a failure.

# ── grading-worker: runs locally, no Docker ──────────────────────────────────────────────
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"  # Windows; Scripts→bin on Linux/Mac
.venv/Scripts/python.exe -m pytest -q          # all mocked — no Rabbit/Redis/core-api/LLM needed
.venv/Scripts/python.exe -m pytest tests/test_pipeline.py -v

# ── Prisma (services/core-api) ───────────────────────────────────────────────────────────
npm run prisma:migrate   # `prisma migrate dev` — authoring a new migration; needs Postgres
npm run prisma:generate  # regenerate the client after schema.prisma changes

# ── Inspecting the running stack — ALL of this runs on the VPS, over SSH ─────────────────
# Every `docker compose exec` needs `< /dev/null`; see the SSH scripting trap below.
ssh -i "$HOME/.ssh/ttta_vps" sonbui@10.0.6.250 'bash -s' <<'EOF'
cd ~/TTTA/infra
docker compose ps --format '{{.Service}} {{.State}}' < /dev/null
docker compose logs core-api --tail 20 < /dev/null
docker compose logs grading-worker --tail 20 < /dev/null
docker compose exec -T rabbitmq rabbitmqctl list_queues name messages < /dev/null
docker compose exec -T postgres psql -U ilm -d ilm -c '\dt' < /dev/null
docker compose exec -T redis redis-cli --raw KEYS 'config:*' < /dev/null
EOF

# Publish a fixture message straight onto a queue (no real Zalo message needed). RabbitMQ's
# management API is loopback-only, so this must run ON the VPS; credentials come from infra/.env.
ssh -i "$HOME/.ssh/ttta_vps" sonbui@10.0.6.250 'bash -s' <<'EOF'
cd ~/TTTA/infra
RU=$(grep '^RABBITMQ_DEFAULT_USER=' .env | cut -d= -f2)
RP=$(grep '^RABBITMQ_DEFAULT_PASS=' .env | cut -d= -f2)
curl -s -u "$RU:$RP" -X POST "http://localhost:15672/api/exchanges/%2f/ilm.direct/publish" \
  -H "Content-Type: application/json" \
  -d '{"routing_key":"submissions","properties":{},"payload_encoding":"string","payload":"{\"v\":1,\"messageId\":\"m1\",\"eventName\":\"user_send_text\",\"kind\":\"text\",\"zaloUserId\":\"u1\",\"receivedAt\":\"2026-01-01T00:00:00Z\"}"}'
EOF

# Dashboard/API over HTTPS (session cookie auth — log in first, reuse the cookie jar):
#   curl -s -c cj.txt -X POST https://ilm-ttta.duckdns.org/api/auth/login \
#     -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
#   curl -s -b cj.txt https://ilm-ttta.duckdns.org/api/submissions
```

### Verifying against the live Zalo OA

The most reliable way to check a Zalo integration is to **call the real API from the VPS** — the
access token lives in Redis, not in `.env`:

```bash
TOK=$(docker compose exec -T redis redis-cli --raw GET zalo:access_token < /dev/null | tr -d '\r\n')
curl -s -H "access_token: $TOK" https://openapi.zalo.me/v2.0/oa/getoa            # OA profile + avatar
curl -s -H "access_token: $TOK" --get --data-urlencode 'data={"user_id":"<id>"}' \
  https://openapi.zalo.me/v3.0/oa/user/detail   # display_name, avatar, shared_info.phone
```

`oa/user/detail` is what makes onboarding workable: the webhook only carries an anonymous
`user_id`, but this endpoint returns the follower's `display_name`, `avatar`, and — once they tap
the `request_user_info` template — `shared_info.phone`. **Zalo exposes no pricing anywhere** (12
fields on `models.list`, none about cost), which is why `llm.pricing_json` is a manual setting.

## Task tracking

`TASKS.md` (repo root) is the persistent progress tracker, organized by the 5 build milestones. **Update it whenever a task or phase completes** — the session todo list is not enough.

- When going with plan mode > do not develop just create plan and save it to \Idea\YYYYMMDD-<name>.md format

## Branching (ILM platform expansion — planned, not yet started)

The repo has historically been committed straight to `main`. That stops for the platform expansion
designed in `Idea/20260903-NenTangILM.md` (SuiteCRM 8 + Moodle + the existing grading stack). Two
branches off `main`, never one long-lived branch:

- **`feature/ilm-platform`** — all new services (MariaDB, SuiteCRM, Moodle, `moodle-sync`, the Zalo
  Login auth plugin, the two new Caddy site blocks). Purely additive; touches no existing service.
- **`feature/crm-student-sync`** — **only** the CRM→core-api student sync: `SuiteCrmStudentClient`,
  the one-line provider swap at `sheets-sync/sheets-sync.module.ts:10`, `crm.*` in `setting-defs.ts`,
  and making the dashboard Students screen read-only. Kept separate because it is the **only** change
  that can break the running bot — if it has to be reverted, it should be one small commit, not
  something to unpick from months of platform work.

**A git branch protects the source, not the running system.** `infra/docker-compose.yml` declares
`name: ilm-bot`, so `docker compose up -d` against it recreates the live containers regardless of
which branch is checked out. During development use a separate compose file and project name; note
Caddy holds ports 80/443, so two stacks cannot both bind them on one machine. Deploying a phase to
the VPS is a deliberate act with a known rollback (new services: `docker compose stop <service>`;
the sync change: revert one commit and rebuild core-api).

Never commit `.env`, MariaDB passwords, Moodle web-service tokens, `crm.client_secret`, Zalo App
Secret / OA Secret, or any access/refresh token. Update `.env.example` with variable names only.

## Dev/test environment (VPS)

A dedicated **test** VPS exercises the real Zalo OA path end to end. Not production.

| | |
|---|---|
| Test domain | `ilm-ttta.duckdns.org` (DuckDNS) |
| Public IP | `45.120.228.67` — **only ports 80/443 face the internet** |
| VPN address | `10.0.6.250` — SSH and all admin access go through here |
| SSH user | `sonbui` |
| Webhook to register | `https://ilm-ttta.duckdns.org/webhook` |

**Network shape.** Only 80 and 443 are published to the internet (Caddy). Port 22 is **not** exposed —
the owner reaches the box over VPN at `10.0.6.250`. Three things follow:

1. Internet-facing SSH hardening is not a concern here, and the internet-facing attack surface is
   Caddy alone.
2. `docker-compose.yml` binds Postgres (`127.0.0.1:5432`) and the RabbitMQ management UI
   (`127.0.0.1:15672`) **loopback-only**. On this VPS that means reaching them needs an SSH tunnel
   over the VPN — e.g. `ssh -L 15672:localhost:15672 sonbui@10.0.6.250`.
3. **This is a disposable test box — experiment freely.** Restarting containers, wiping volumes,
   re-seeding data and re-running migrations are all fair game without production-grade caution. Only
   the *Zalo OA behind it is real*, so the one thing to stay careful about is sending messages to real
   followers (see the 48h-guard trap below).

**An SSH key is already installed**: `~/.ssh/ttta_vps` on the owner's dev box, authorized for
`sonbui@10.0.6.250`. Every command in this file uses it — no password needed:

```bash
ssh -i "$HOME/.ssh/ttta_vps" -o BatchMode=yes sonbui@10.0.6.250 '<command>'
```

`sudo` on the box still prompts for a password, which is **not** recorded here since this file is
tracked and pushed to GitHub. Ask the owner when a command needs root (installing packages, etc.).

**This VPS is also the build machine** — see the ⛔ note at the top of Commands. Do not start
Docker on the dev box.

Set `DOMAIN=ilm-ttta.duckdns.org` in `infra/.env`. Caddy requests the Let's Encrypt certificate at
boot, so the A record must have propagated **before** `docker compose up`, and ports 80/443 must be
open for the HTTP-01 challenge. `infra/.env` is gitignored — create it by hand on the VPS, never
through git. Nothing hardcodes the domain (`Caddyfile` uses `{$DOMAIN:localhost}`), so moving to the
production domain later is a `.env` change plus re-registering the webhook with Zalo.

### Zalo OA (test) — state as of 2026-09-06

OA `ILM-QC`, `oa_id` 439081102177382393, verified, package "Tăng trưởng" valid through 02/09/2027,
App ID `4255256627133570208`.

**Proven working against the live OA on 2026-09-06 — the VPS deployment closed TASKS.md M1.8 / M4.9,
blocked since M1 for want of a real OA:**

- OAuth refresh (`TokenService` logs `Zalo token refreshed`), `oa/getoa`, `oa/user/getlist`
- **Outbound**: RabbitMQ `outbound` → `OutboundConsumer` → `ZaloApiService.sendText` → user's phone
- **Inbound**: Zalo → Caddy → `WebhookController` → **HMAC signature verified** → Redis dedup →
  `submissions` queue → `grading-worker` → core-api `/internal/*`, with `zalo:lastin:{userId}` now
  populated by real traffic so the 48h guard has genuine data (`OUTBOUND_48H_GUARD=true`)
- Worker's text branch behaves per spec: `text ngoài luồng -> flag, không trả lời` — a flag row for
  advisors and **no reply**, which is the "bot does not converse" product boundary holding in production
- DuckDNS + Let's Encrypt via `tls-alpn-01`, issued automatically by Caddy

**Still unverified**: a real audio/video submission through Zalo into the grading path. Reaching it
needs a student row plus an active `zalo_bindings` entry, otherwise the pipeline stops at onboarding.

### Operational traps found while doing it

- **Zalo refresh tokens are single-use, and the gateway spends one on every boot** —
  `TokenService.onApplicationBootstrap` calls `refreshNow()` immediately. So the *live* pair lives in
  **Redis**, not `.env`; the `.env` values are a one-shot seed consumed at first successful start
  (`seedTokensIfEmpty` only writes when `zalo:refresh_token` is absent). Re-seeding from a stale
  `.env` fails with `Zalo OAuth error` and, after 2 consecutive failures, sets `alert:zalo_token_failed`.
- **Never run two gateways against one OA.** Both refresh every 50 minutes and each refresh
  invalidates the other's token. Stop the local gateway before the VPS one starts.
- **`OUTBOUND_48H_GUARD=false` is test-only.** Without a webhook, `zalo:lastin:{userId}` is never
  written, so `canSendWithin48h` returns false for everyone and every outbound lands unsent on the
  Redis `blocked_48h` list. Once the webhook works, set it back to `true`.
- Zalo's 48h free window and the app-side guard are **different mechanisms**: Zalo tracks the user's
  last inbound message on their own servers whether or not our webhook ever received it. That is why
  a send can succeed with the app-side guard disabled and no `zalo:lastin` entry present.
- **`zalo.app_secret` and `zalo.webhook_secret` are two DIFFERENT strings.** The *App Secret Key*
  authenticates OAuth token refresh (sent as the `secret_key` header to `oauth.zaloapp.com`); the
  *OA Secret Key* signs webhooks (`sha256(appId + rawBody + timestamp + oaSecret)`,
  `lib/zalo-signature.ts`). Putting the App Secret into `webhook_secret` makes **every real event 401**
  while token refresh keeps working perfectly — so the symptom reads as "webhook broken" when the real
  cause is "wrong key". Both were confirmed distinct against the live OA on 2026-09-06.
- **Zalo's webhook-registration POST carries no signature; real events do.** Registering the URL
  therefore fails with 401 whenever `webhook_secret` is set — even when it is set *correctly*. Blank
  `ZALO_WEBHOOK_SECRET`, register the URL, then restore the OA Secret Key. `webhook.controller.ts`
  skips verification entirely when the secret is empty (`if (secret && appId)`), which is what makes
  this two-step possible — and also means an empty secret leaves the endpoint open to forged events,
  so never leave it blank longer than the registration itself.
- **Scripting the VPS over SSH: `docker compose exec -T` reads stdin.** When the script is piped in
  via `ssh ... 'bash -s' <<'EOF'`, an `exec -T` swallows the remaining script lines and everything
  after it silently vanishes. Always append `< /dev/null` to `docker compose exec` in such scripts.

## Monorepo layout

`services/zalo-gateway` (TS/NestJS — implemented, M1) · `services/core-api` (TS/NestJS — implemented, M2-M4) · `services/grading-worker` (Python — implemented, M3; **the full audio grading path was accepted against a real Gemini key on 2026-08-25** — see the v1.6 changelog) · `services/dashboard` (React — implemented, M2 + M4; all 5 subsystems, containerized) · `infra/` (docker-compose, Caddyfile, .env). Message contracts and RabbitMQ topology constants are duplicated three times now — no shared package mechanism exists across services, let alone across languages — in `services/zalo-gateway/src/contracts.ts`, `services/core-api/src/contracts.ts`, and `services/grading-worker/src/grading_worker/contracts.py`. Keep all three identical when the topology changes.

There are now **three cross-language duplicates**, all deliberate (no shared package mechanism spans TS and Python) and all guarded by a shared fixture asserted from BOTH languages — never edit one side alone:
1. **Message contracts / queue topology** — the three `contracts.*` files above.
2. **`normalizeRubric`** — `core-api/src/criteria/rubric-schema.ts` ↔ `grading-worker/.../grading/rubric_schema.py`, fixture `core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json`. Two rounds of QA went on divergences here (JS `String()` semantics, then `.trim()` vs `.strip()` differing on 6 code points) — both found only by differential fuzzing.
3. **Prompt renderer** — `core-api/src/criteria/prompt-render.ts` ↔ `grading-worker/.../grading/prompt.py`, fixture `core-api/src/criteria/__fixtures__/prompt-render.fixtures.json`. Exists because the criteria editor needs a live prompt preview and the dashboard has no test suite of its own.

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

**Media** (`media/`): `GET /media/:submissionId` streams the file at `submissions.media_path` (session-auth, path-traversal-checked against `MEDIA_ROOT`, factored into `lib/media-path.ts`'s `resolveMediaPath()` — reused by the M4 `submissions/` module's delete endpoint too). The retention/deletion cron (§3.8: video deleted 7 days after audio extraction, audio kept 90 days) is still `TASKS.md` M3.6, deliberately deferred until there's been at least one real graded submission to confirm the write path — grading-worker has now graded real clips (2026-08-25), so this cron is unblocked.

**M4 dashboard-facing modules** (`students/`, `submissions/`, `gradings/`, `classes-config/`, `criteria/`, `reports/`, `monitoring/` — all session-auth, phân hệ 1 admin-only per §3.7, phân hệ 2-5 admin+staff):
- `submissions/` + `gradings/`: list/detail/status-filter submissions; `PATCH /gradings/:id` edits `reviewedFeedback`; `POST /gradings/:id/send` publishes `reviewedFeedback ?? llmFeedback` onto `outbound` and flips `submission.status` to `sent` — same outbound path the gateway's `OutboundConsumer` already handles, no new consumer needed.
- `criteria/docx-parser.ts`: `mammoth.convertToHtml()` (not `extractRawText` — that would lose the heading structure) + a hand-written heading-splitter recognizing the four §3.9 sections. A small fixed mini-format per section (`key: value` lines for "Thông tin chung"/"Giọng điệu & ngôn ngữ nhận xét"; `name (trọng số W): band=text; ...` per line for "Tiêu chí") makes automatic parsing unambiguous. Rejects (400) a rubric missing the mandatory `pronunciation` dimension — the same rule grading-worker enforces at grading time (`grading_worker/grading/schema.py`), just caught earlier at upload. `scripts/generate-rubric-template.ts` (using the `docx` package) produces `templates/rubric-template.docx`, the sample file for teachers *and* the fixture this parser was actually smoke-tested against.
- `reports/report-export.ts`: `toCsv()` (manual string-join) and `toXlsxBuffer()` (via `exceljs`) both consume the same row data from `reports.service.ts` — the project owner asked for both formats, not one or the other.
- `monitoring/`: `GET /monitoring/queues` extends `RabbitService.queueDepth()` to report main-queue depth alongside the `.dlq` depth already used by `dlq/`; `GET /monitoring/token` reads `zalo:access_token`/`zalo:token_expires_at`/`alert:zalo_token_failed` straight off `RedisService.client` (already public) rather than proxying through the gateway.

Global `@Global()`-marked infrastructure modules (`prisma.module.ts`, `redis.module.ts`, `rabbit.module.ts`, `settings.module.ts`) exist so guards used via `@UseGuards()` in any feature module (e.g. `InternalTokenGuard`, which depends on `SettingsService`) resolve correctly — Nest instantiates a guard class in the DI scope of whichever module's controller uses it, not the module where the guard was originally declared, so its dependencies must be globally reachable.

## grading-worker architecture (implemented; real LLM path accepted 2026-08-25)

The only service that calls Gemini/OpenAI. Consumes `submissions`, writes everything back through core-api's `/internal/*` API — never touches Postgres directly. Uses `aio-pika` (not `pika`) specifically because grading calls take 30–90 seconds and an async event loop keeps servicing AMQP heartbeats during that wait.

**`pipeline.py`** (`SubmissionPipeline.handle`) is the whole flow, in order: upsert the `submissions` row → `POST /internal/bindings/ensure` → if `kind == 'text'`, create a `flags` row and stop (bot never replies to free text, per the product boundary) → if no active binding, publish an onboarding message and stop; if multiple active bindings, publish a "which student is this?" clarification and stop → if `kind` isn't `audio`/`video`, flag and stop → download the media (`media/downloader.py`, path convention `/data/media/{yyyy}/{mm}/{submissionId}/original.{ext}`) → `ffprobe` the duration and reject (outbound message + `status='failed'`) if it exceeds `limits.max_clip_duration_sec` **before** calling any LLM (the cost valve) → `ffmpeg` always normalizes to `audio.mp3` regardless of whether the input was audio or video, so exactly one mime type (`audio/mp3`) ever reaches a provider → fetch the rubric via `/internal/criteria/:courseId`, build a JSON Schema from it dynamically (`grading/schema.py` — `pronunciation` is a mandatory dimension; a rubric missing it is rejected outright, not silently graded) → grade via `grading/providers/factory.py`, which picks Gemini or OpenAI per `course.llmConfig.provider` and falls back to the other on failure → validate the output against the same schema (a validation failure is an uncaught exception, which is what lets `rabbit_consumer.py` retry it) → write `gradings`/`cost_log` → branch on `classes_config.autoSend`: publish the feedback onto `outbound` immediately, or leave `status='awaiting_review'` for the M4 review screen.

**Config** (`config.py`): reads `config:*` directly from Redis (same as the gateway), not by round-tripping every value through core-api — this matches the architecture doc's v1.2 changelog, which explicitly mirrors settings "for gateway/worker" to read.

**LLM provider SDKs** (`grading/providers/gemini.py`, `openai_provider.py`): Gemini uses the `google-genai` SDK's `client.interactions.create(...)`. **Accepted against a real key on 2026-08-25** — the endpoint shape is correct, but three things broke on first contact and none were visible to the 448 mocked tests:
1. `pipeline.py` called `grade_with_fallback()` **without `schema=`**, which every `Provider.grade()` requires — so the audio path could never have worked. (The since-removed transcript path passed it correctly, which is why the defect survived review.) Hidden because every test patches `grade_with_fallback` with a bare `AsyncMock` (swallows any argument) and its signature is `**grade_kwargs: Any`.
2. The hardcoded model `gemini-2.5-flash` is **retired for new users** (404 naming `gemini-3.6-flash` as the replacement).
3. `interaction.usage` exposes `total_input_tokens`/`total_output_tokens`/`total_thought_tokens`, **not** `input_tokens`/`output_tokens` — so every `cost_log` recorded 0 tokens and `est_usd = 0`, silently disabling the §3.12 cost alert. `_usage_tokens()` now reads the real names and folds thought tokens into output (they are billed, and under-reporting is the dangerous direction for a cost alarm).

The lesson worth carrying: **mocking the outer boundary (`grade_with_fallback`) cannot test the inner contract.** Regression tests now bind the call to the real `Provider.grade` signature and to the SDK's actual `Usage` shape.

Model, temperature and pricing are **no longer hardcoded** — see `llm.*` in `setting-defs.ts`. Resolution order is `courses.llm_config` → settings → a fallback constant. The Settings screen suggests models from a **live provider query** (`GET /settings/llm-models/:provider`) while still accepting free text, precisely because a hardcoded list goes stale the way `gemini-2.5-flash` just did. OpenAI uses the standard Chat Completions `input_audio` content part and is still unexercised (no OpenAI key configured), so the fallback provider is effectively unavailable. The rest of the pipeline stays provider-agnostic via `grading/providers/base.py`'s `Provider` protocol.

**Audio is the only grading input** (owner's decision 2026-08-25). A transcript-based A/B branch existed briefly (F2, "pilot dual grading"): the LLM transcribed `audio.mp3`, graded the text, and stored the result alongside the audio grading for comparison. It was **removed entirely** — code, tests, i18n, API routes, report, dashboard panel, and the `pilot_text_grading` table (migration `20260825120000_drop_pilot_text_grading`, destructive; the table was empty because the `limits.pilot_dual_grading` flag shipped off and was never turned on). The business reason: a transcript cannot carry pronunciation evidence (`heard_as`, second-offsets), and `pronunciation` is a **mandatory** rubric dimension (§3.10) — grading it from text is guesswork. `cost_log.call_type` was deliberately left in place as an open string column; the `transcription`/`text_grade` values simply stop being written. Don't reintroduce a text path without revisiting §3.10.

**Retry/DLQ** (`rabbit_consumer.py`): a line-for-line Python port of the gateway's `RabbitService.consume()` retry logic — same header-based `x-retry` counter, same `MAX_RETRIES`/`RETRY_TTL_MS` constants from `contracts.py`.

**What's been verified end-to-end**: publishing fixture messages directly onto `ilm.direct` via RabbitMQ's management API (see Commands above) confirmed the text→flag branch, the pending-binding→onboarding-message branch (correctly blocked by the gateway's existing 48h guard, since the fixture user had no prior inbound message), and the multi-binding clarification branch — all through the real queue and a real core-api, not mocks. Since 2026-08-25 the **grading happy path is confirmed against a real Gemini key** using the `/test-upload` tool on the `sample/` clips: real audio in, schema-valid JSON out, `cost_log` tokens recorded, `status='awaiting_review'`. Still unexercised for real: the OpenAI provider (no key configured, so the fallback provider is effectively unavailable) and the auto-send branch (`classes_config.autoSend` is off everywhere, deliberately — see the reproducibility caveat below).

**Grading is not reproducible, and that gates auto-send.** The same clip re-graded can land ±1 band even at `llm.temperature = 0`, because Gemini 3.x varies its internal reasoning trace regardless of temperature. Measure repeatability against a well-matched rubric before letting any class turn `autoSend` on. Relatedly, prefer `gemini-3.6-flash` over `gemini-3.1-pro-preview`: on 2026-08-25 the preview model took **88 seconds to answer a one-word text prompt** and returned intermittent 401/500 on real audio payloads with a key that Flash accepted in 4.5s — preview-tier instability, not a credentials problem. Verify the key against Flash before believing a 401.

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

- `Idea/20260903-NenTangILM.md` — **platform expansion design (v0.3, DRAFT — approved by nobody yet, nothing built)**. Turns this repo from one bot into a platform: SuiteCRM 8 (staff, teachers, students, classes, course contracts — becomes the **system of record**), Moodle (student-facing study materials + quizzes; students log in with Zalo Login), and the existing grading stack unchanged as a subsystem. Key resolution: "student data lives in the CRM" and "don't change the running app" conflict, because students/courses are read in 8 places in core-api — so the CRM **owns** the record while core-api keeps a **read replica**, fed by swapping the client behind the existing `SHEETS_CLIENT_FACTORY` seam. That makes the entire change to running software one line. The current "CRM" is spreadsheets, so there is no migration — SuiteCRM is built fresh and imported once. Speaking clips **stay on Zalo**; Moodle never touches the grading path. Phases P0–P5, branch strategy in §14 (see Branching above).

Architecture precedence: `20260719-KienTrucMicroservices.md` > `UpdateFoundation.md` > `Foundation.md`. `Foundation.md` remains authoritative for product scope, business rules, and data semantics. `20260903-NenTangILM.md` is a **forward-looking draft** and does not yet override anything.

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
