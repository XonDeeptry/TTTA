# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# zalo-gateway (services/zalo-gateway)
npm install          # install deps
npm test             # jest unit tests
npx jest src/webhook # run a single test file/pattern
npm run build        # tsc → dist/

# Full stack (from infra/; needs infra/.env — copy from .env.example)
docker compose up -d --build
docker compose logs zalo-gateway --tail 20
docker compose exec rabbitmq rabbitmqctl list_queues name messages
docker compose down
```

## Task tracking

`TASKS.md` (repo root) is the persistent progress tracker, organized by the 5 build milestones. **Update it whenever a task or phase completes** — the session todo list is not enough.

## Monorepo layout

`services/zalo-gateway` (TS/NestJS — done M1) · `services/core-api` (TS/NestJS — M2) · `services/grading-worker` (Python — M3) · `services/dashboard` (React — M4) · `infra/` (docker-compose, Caddyfile, .env). Message contracts and RabbitMQ topology constants live in `services/zalo-gateway/src/contracts.ts` — the Python worker must mirror them.

## What this repository is

Planning/design repository (no code yet) for a **Zalo OA homework-grading bot** for the ILM English Center. Students submit homework (mainly ~5-minute speaking clips) via Zalo Official Account; an LLM (Gemini Flash, chosen for direct audio input) grades against course-level criteria and replies. All documents are written in Vietnamese.

## Documents

- `Idea/Foundation.md` — v1.0 spec: requirements, workflows, rollout plan. Original architecture used **n8n + Google Sheets** (low-code, single merged webhook workflow with branching).
- `Idea/UpdateFoundation.md` — 2026-07-19 update proposing a **microservices design**: RabbitMQ (message broker + Dead Letter Queue), Redis (Zalo token cache, rate limiting), PostgreSQL (users, grading history, criteria), plus services: Zalo Bot Gateway, User Management (syncs from Google Sheets), Criteria Management (.docx rubric ingestion), LLM Grading Worker, Web Dashboard.
- `Idea/20260719-KienTrucMicroservices.md` — **current authoritative architecture** (v1.1): systematic evaluation of the two docs above, debate verdicts, and the final detailed design. "Microservices-lite": exactly 4 services (`zalo-gateway` TS/NestJS, `core-api` TS/NestJS, `grading-worker` Python, `dashboard` React) in one monorepo/docker-compose on a single VPS, with PostgreSQL as source of truth, RabbitMQ (+DLQ), Redis, Caddy, and **local-only media storage** on the VPS disk (no cloud storage services — owner's cost constraint; retention lifecycle defined in the doc). No gRPC/K8s. Google Sheets is a one-way input channel synced into Postgres. v1.1 decisions: grading criteria are authored as teacher .docx templates parsed into structured rubric JSON; an LLM provider abstraction covers both Gemini and ChatGPT; pronunciation scoring is a **mandatory** rubric dimension graded by the LLM itself (no local AI models ever — all AI inference goes through Gemini/ChatGPT APIs; the VPS only orchestrates and stores); the dashboard and system messages are vi/en bilingual. v1.2: ALL application configuration (Zalo app credentials/tokens, LLM API keys, operational thresholds) is administered via the dashboard UI — stored in the Postgres `settings` table (owned by core-api), mirrored to Redis `config:*` keys with pub/sub hot reload for gateway/worker; `.env` holds only infrastructure secrets (Postgres/Redis/RabbitMQ/domain), with ZALO_*/API-key env vars serving as dev-only fallbacks. Includes the target Postgres schema, queue topology, and build roadmap.

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
