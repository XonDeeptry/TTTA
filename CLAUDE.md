# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Planning/design repository (no code yet) for a **Zalo OA homework-grading bot** for the ILM English Center. Students submit homework (mainly ~5-minute speaking clips) via Zalo Official Account; an LLM (Gemini Flash, chosen for direct audio input) grades against course-level criteria and replies. All documents are written in Vietnamese.

## Documents

- `Idea/Foundation.md` — v1.0 spec: requirements, workflows, rollout plan. Original architecture used **n8n + Google Sheets** (low-code, single merged webhook workflow with branching).
- `Idea/UpdateFoundation.md` — 2026-07-19 update proposing a **microservices design**: RabbitMQ (message broker + Dead Letter Queue), Redis (Zalo token cache, rate limiting), PostgreSQL (users, grading history, criteria), plus services: Zalo Bot Gateway, User Management (syncs from Google Sheets), Criteria Management (.docx rubric ingestion), LLM Grading Worker, Web Dashboard.
- `Idea/20260719-KienTrucMicroservices.md` — **current authoritative architecture**: systematic evaluation of the two docs above, debate verdicts, and the final detailed design. "Microservices-lite": exactly 4 services (`zalo-gateway` TS/NestJS, `core-api` TS/NestJS, `grading-worker` Python, `dashboard` React) in one monorepo/docker-compose on a single VPS, with PostgreSQL as source of truth, RabbitMQ (+DLQ), Redis, MinIO, Caddy. No gRPC/K8s. Google Sheets is a one-way input channel synced into Postgres. Includes the target Postgres schema, queue topology, and a 5-milestone build roadmap.

Architecture precedence: `20260719-KienTrucMicroservices.md` > `UpdateFoundation.md` > `Foundation.md`. `Foundation.md` remains authoritative for product scope, business rules, and data semantics.

## Product boundaries (hard rules from the spec)

- Bot discusses **academics only** with students. Non-academic messages (fees, schedules, complaints) are flagged to human advisors ("tư vấn") — the bot must NOT reply to the student.
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
