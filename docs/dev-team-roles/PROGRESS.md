<!--
  Maintained by the dev-team-roles orchestrator (/dev-team-roles:build-feature).
  Resume anchor + architecture record. Safe to read anytime; edit only between runs.
-->

# dev-team-roles — Progress & Architecture

**Status:** COMPLETE
**Last updated:** 2026-07-22
**Last checkpoint:** F3 QA round 2 = PASS; all 3 features DONE; regression green (core-api 99, gateway 26, worker 60, dashboard build)

> Tracking model note: F1/F2 predate the per-role task-file protocol and are recorded inline
> below. F3 onward uses `docs/dev-team-roles/tasks/<FEATURE_ID>-<role>.md` per TASK-PROTOCOL.md;
> this file is the index only.

## Run scope

Input: "continue building all features required in 20260719-KienTrucMicroservices.md > current complete task in TASKS.md".

M1–M4 are complete. Every remaining unchecked TASKS.md item is blocked on the project
owner (M1.8 real Zalo app, M3.7 real LLM keys, M4.9 real Zalo acceptance, M5.x pilot) —
**except M3.6**, the media-lifecycle cron in core-api (§3.8). That is the one feature
buildable now without owner-supplied credentials/hardware, so it is this run's sole scope.

## Feature list (set once at Phase 0, do not silently change)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F3 | Dashboard UI redesign (English Center Management look) | P1 | Added 2026-07-22 by user. **UI-only — no backend changes.** All 9 pages + `App.tsx` shell. **Stack decided: Tailwind + shadcn/ui** (user choice); visual direction chosen by UX via the `ui-ux-pro-max` skill. QA must verify existing functionality still passes. |
| F1 | M3.6 — Media lifecycle cron (core-api) | P0 | Nightly cron: delete source video 7d after audio extraction; delete audio 90d (configurable) after receipt, set `media_deleted_at`; disk-usage >80% alert surfaced in Monitoring (§3.8) |
| F2 | Dual-modal pilot scoring (transcript + audio) | P1 | User-added mid-run. **Decided:** A/B dual grading — grade each submission twice (audio-only [current] + text-only from transcript), store BOTH for pilot comparison. Transcript produced by the **same LLM provider** (Gemini/ChatGPT transcribes audio, then grades the text). No new STT dependency. |

## State Board

| Feature | PM | BA | UX | Impl | DBA | DevOps | QA  | Status  |
|---------|----|----|----|------|-----|--------|-----|---------|
| F1 M3.6 Media lifecycle cron | ✅ | ✅ | – | ✅ | ✅ | – | ✅ | ✅ DONE |
| F2 Dual-modal pilot scoring | ✅ | ✅ | ✅ | ✅ | ✅ | – | ✅ | ✅ DONE |
| F3 Dashboard UI redesign | [✅](tasks/F3-pm.md) | [✅](tasks/F3-ba.md) | [✅](tasks/F3-ux.md) | [✅](tasks/F3-frontend.md) | – | [✅](tasks/F3-devops.md) | [✅](tasks/F3-qa.md) | ✅ DONE |

Legend: ✅ done · 🔄 in progress · ⬜ waiting · ❌ fail (fixing, round N/3) · – n/a

## Architecture decisions

- Only M3.6 is in scope; all other remaining TASKS.md items are owner-blocked (credentials/hardware/pilot).
- Video-reap needs a real anchor for "7 days after audio extracted": add `Submission.audioExtractedAt` (set by grading-worker after ffmpeg produces audio.mp3). Reusing `receivedAt` would risk deleting a video whose audio extraction failed → data loss. (PM)
- Separate `Submission.videoDeletedAt` from existing `mediaDeletedAt`: the former marks day-7 video-only reap, the latter the day-90 full deletion (also set by the existing manual-delete feature). One column can't represent both states. (PM)
- New configurable setting `limits.media_retention_days` (number, default 90) in `setting-defs.ts`; 7-day video grace and 80% threshold are fixed constants (§3.8 only calls the 90-day audio retention configurable). (PM)

## Architecture decisions (F3 — dashboard UI redesign)

- **Styling stack: Tailwind CSS + shadcn/ui** (owner decision over plain-CSS-tokens and Tailwind-only options). Adds tailwind/postcss/autoprefixer + Radix-based shadcn primitives to the dashboard.
- **shadcn components hand-authored** into `src/components/ui/`, NOT via `npx shadcn add` — the CLI needs network + interactive Node, which conflicts with the "no Node on the dev machine" constraint and the one-shot container build.
- **Visual direction from the `ui-ux-pro-max` skill** (owner decision), education/school-management admin patterns.
- **Role-agent tooling deviation:** the `pm`, `ba`, and `ux` role agents are read-only (Read/Grep/Glob) and cannot Write their task files or invoke Skills. So: the orchestrator writes `F3-pm.md`/`F3-ba.md` from those agents' output, and the **UX role is run via a full-tool agent** so it can actually invoke `ui-ux-pro-max` and own `F3-ux.md`.
- **F3 design system (UX, via `ui-ux-pro-max`):** palette = **LMS** (teal `#0D9488` primary, `#2DD4BF` secondary, amber `#D97706` accent, red `#DC2626` destructive) neutralized toward slate surfaces for an all-day dense CRUD tool, plus a success/warning semantic layer for status badges; font = **Minimal Swiss / Inter** (self-hosted, no CDN); density = **Data-Dense Dashboard** (240px sidebar, 12–14px type); icons = **Phosphor** outline. Shell changes from top nav to a **collapsible left sidebar** (240px → 64px rail → off-canvas on mobile). 11 hand-authored shadcn primitives; Radix Select/Checkbox, Skeleton, RHF and TanStack Table deliberately excluded to keep the dependency footprint small on the RAM-limited container build.
- **DBA/backend/DevOps = n/a** for F3 (UI-only; no schema, no API, no infra change — the dashboard Dockerfile already runs `npm ci && npm run build`, so only `package.json`/lockfile change).

## Architecture decisions (Feature 2 — dual-modal scoring)

- **A/B dual grading** (user decision): each audio/video submission is graded twice — (A) audio-based (current pipeline, unchanged) and (B) text-based from an LLM transcript — and both are stored for pilot comparison. Only the audio-based grading remains the primary result that gets reviewed/sent to students (assumption to confirm with PM; keeps the "bot never double-messages" boundary safe).
- **Transcript via same LLM provider** (user decision): reuse Gemini/ChatGPT to transcribe `audio.mp3` → transcript, then grade the transcript text. No new STT service/credential; stays within the doc's "all AI inference via Gemini/ChatGPT, no local models" rule.
- **Schema (PM recommendation, to confirm by DBA/BA): new additive `PilotTextGrading` table** — `id, submissionId (@unique), criteriaId, criteriaVersion, transcript, scores Json, llmFeedback, createdAt`. Leaves `Grading`'s one-to-one relation and all M4 consumers (review UI, gradings/, submissions/ detail, reports/) untouched; trivially droppable post-pilot. Option (a) — a `source` discriminator + composite unique on `Grading` — rejected as too ripply for a pilot.
- **cost_log gap:** add nullable `callType`/`purpose` column so the 3 rows/submission (transcription, audio grade, text grade) are distinguishable (existing rows implicitly = audio grade). (PM)
- **Safety encoded:** text-based grading is comparison-only, NEVER published to outbound / sent to a student under any autoSend config (guards the never-double-message rule). Text-grading/transcription failures are best-effort: logged, never raised into rabbit retry/DLQ, never alter the already-committed audio grading's status/send. Whole path gated by `limits.pilot_dual_grading` (default false).

## Handoff artifacts

- **PM (M3.6):** 3 user stories, all Must-Have — (1) reap source video 7d after `audioExtractedAt`, `audioExtractedAt`-gated + `videoDeletedAt`-idempotent + missing-file tolerant + per-row error isolation; (2) delete remaining media + stamp `mediaDeletedAt` after `limits.media_retention_days` (default 90); (3) `alert:media_disk_high` self-healing Redis alert surfaced on existing admin Monitoring page. Full Given/When/Then ACs, safety constraints (never touch Postgres grading rows, idempotent/best-effort deletes, batch continues on per-row error, deletes go through `resolveMediaPath()` guard).

- **BA (M3.6):** Full functional spec. New `core-api/src/media-lifecycle/` module, one `@Cron('0 15 3 * * *')` (03:15, no collision) `runNightly()` with 3 independently try/caught phases: `reapSourceVideos()` (kind=video, `audioExtractedAt<=now-7d`, `videoDeletedAt IS NULL` → unlink `original.{ext}`, keep `audio.mp3`, stamp `videoDeletedAt`), `deleteExpiredMedia()` (`receivedAt<=now-retention`, `mediaDeletedAt IS NULL` → unlink both files, stamp `mediaDeletedAt`; retention from Redis `config:limits.media_retention_days`, fallback const 90), `checkDiskUsage()` (`fs.promises.statfs(MEDIA_ROOT)`, `(blocks-bfree)/blocks>80%` → set/clear self-healing `alert:media_disk_high` JSON `{pct,at}`; unavailable/throws → log+return). All deletes via `resolveMediaPath()`, idempotent, missing-file tolerant, per-row isolated, submissions-only. Monitoring: `diskStatus()`+`GET /monitoring/disk` (admin) + `Monitoring.tsx` disk section (vi/en). Worker: `updateSubmission` DTO gains `@IsDateString audioExtractedAt?`; grading-worker `pipeline.py` sends it in the post-`extract_audio` PATCH. 25 numbered ACs (unit-testable, mocked fs/prisma/redis).
- **Non-blocking open question (Q-1):** after video reap (days 7–90) the dashboard audio player 404s on `original.{ext}` though `audio.mp3` still exists. Pre-existing behavior, out of M3.6 scope → logged to Emergent backlog.

- **DBA (M3.6):** Added `Submission.audioExtractedAt` (`audio_extracted_at TIMESTAMP(3)`, nullable) + `Submission.videoDeletedAt` (`video_deleted_at TIMESTAMP(3)`, nullable) to `schema.prisma`; existing `mediaDeletedAt` untouched. Hand-authored migration `prisma/migrations/20260722090000_add_media_lifecycle_columns/migration.sql` (pure additive `ALTER TABLE ADD COLUMN`, no default, no backfill, matches init-migration style). No index (trivial volume). Rollback = drop the two columns. Backend must run `prisma:generate` after pulling.

- **Backend (M3.6):** Created `core-api/src/media-lifecycle/{service,module,spec}.ts` (cron `@Cron('0 15 3 * * *')` → `runNightly()` with 3 isolated phases per spec), wired into `app.module.ts`. Added setting `limits.media_retention_days` (number). Monitoring: `diskStatus()` + `GET /monitoring/disk` (admin-only, returns `{alert: string|null}`, JSON `{pct,at}` from Redis `alert:media_disk_high`). Worker-API DTO + controller now accept/persist `audioExtractedAt`. grading-worker `pipeline.py` stamps `audioExtractedAt` (ISO UTC) on the post-`extract_audio` PATCH; `test_pipeline.py` updated. **Prisma client regenerated via Docker; tsc build clean; core-api 96/96 (19 suites), grading-worker 33/33 tests pass.** (Also pre-marked TASKS.md M3.6 done — orchestrator will confirm after QA.)
- **API contract for FE:** `GET /monitoring/disk` → `200 {alert: string|null}`; `alert` is JSON string `{"pct":<1dp>,"at":<ISO>}` when disk >80%, else `null`. 401 no session / 403 non-admin.

- **Frontend (M3.6):** `Monitoring.tsx` gains a Disk-usage section fetching `GET /monitoring/disk`; healthy → OK line, alert → parses JSON `{pct,at}` warning (raw-string fallback on parse fail). i18n keys `monitoring.disk`/`diskOk`/`diskAlert` (vi+en, `{{pct}}`/`{{at}}`) in `src/i18n/index.ts`. Vite/tsc build clean via Docker. Dashboard has no jest suite (verified by build only — consistent with M4).
- **DevOps: n/a** — `core-api` and `grading-worker` already mount `media:/data/media` in `infra/docker-compose.yml` (lines 71, 87); `MEDIA_ROOT` defaults to `/data/media`. No infra change needed.
- **PM (Feature 2):** 5 stories — US1 transcribe audio via existing provider (best-effort, non-blocking, tagged cost_log); US2 produce+store text grading in new additive table, never overwrite `gradings`, never sent to student, distinct pronunciation-limitation prompt; US3 read-only side-by-side panels in SubmissionDetail ("Audio (primary)" vs "Text/Transcript (pilot)") + visible transcript; US4 (Should) aggregate audio-vs-text delta CSV/xlsx export reusing reports/ pattern; US5 `limits.pilot_dual_grading` flag (default false, admin-only, hot-reload). Recommends additive `PilotTextGrading` table + nullable cost_log `callType`. Noted `ConfigStore` lacks `get_bool` today (dev note).

- **BA (Feature 2):** Full spec, 12 FRs / 24 ACs. Core = FR-07 trailing best-effort `_run_pilot_text_grading` block in `pipeline.py` (runs last, after audio grading + outbound commit, only if `get_bool('limits.pilot_dual_grading')`; whole block try/except-swallowed so no exception ever reaches rabbit retry/DLQ). New provider protocol methods `transcribe()` + `grade_text()` (both Gemini+OpenAI) + `transcribe_with_fallback`/`grade_text_with_fallback`; new text-mode prompt (`build_system_instruction_text` — explicit "cannot hear audio, pronunciation from transcript cues only"); reuses same `build_output_schema`/`validate_output`. Schema: `PilotTextGrading` table (adds `provider`,`model` beyond PM's list) + nullable `cost_log.call_type` (`audio_grade`|`transcription`|`text_grade`, NULL=audio_grade) + setting `limits.pilot_dual_grading`. New `POST /internal/pilot-text-gradings` + DTO; `submissions.service` detail includes `pilotTextGrading`; `SubmissionDetail.tsx` read-only pilot panel (no edit/send) + transcript; US4 `GET /reports/pilot-comparison[/export]` CSV/xlsx delta report. `ConfigStore` needs new `get_bool`. **Flag OFF ⇒ audio path byte-for-byte unchanged (AC-07.1).** OQ-1 (non-blocking): pilot runs even when audio ended in awaiting_review — assumed YES.

- **DBA (Feature 2):** New `PilotTextGrading` model → table `pilot_text_grading` (1:1 with submissions via unique+FK `submission_id`, cols `criteria_id`/`criteria_version`/`transcript`/`scores` JSONB/`llm_feedback`/`provider`/`model`/`created_at`; no FK to criteria — open int like Grading). Added back-relation `pilotTextGrading PilotTextGrading?` on `Submission`. Added nullable `CostLog.callType` (`@map("call_type")`, open string, NULL=legacy audio_grade). Migration `prisma/migrations/20260722100000_add_pilot_text_grading/migration.sql` — additive only, **validated on a disposable Postgres 16 container: migrate deploy clean, migrate diff empty (zero drift vs schema.prisma)**. Backend must run `prisma:generate`.

- **Backend (Feature 2):** grading-worker — `ConfigStore.get_bool` + env fallback; provider protocol `transcribe`/`grade_text` + `TranscriptResult` (Gemini + OpenAI mirror existing SDK shapes); `transcribe_with_fallback`/`grade_text_with_fallback`; `build_system_instruction_text`/`build_user_instruction_text` (transcript-only, low-confidence pronunciation); `core_api_client.create_pilot_text_grading` + cost-log `callType` passthrough; `pipeline._run_pilot_text_grading` as last-step, flag-gated, exception-swallowed block (audio cost_log now `callType='audio_grade'`). core-api — setting `limits.pilot_dual_grading`; new `POST /internal/pilot-text-gradings` DTO+route (InternalTokenGuard); cost-log DTO `callType?`; submissions detail include `pilotTextGrading`; reports `pilotComparison()` + `GET /reports/pilot-comparison[/export]` (csv/xlsx `pilot-so-sanh`). **Prisma regenerated; tsc build clean; core-api 99/99 (19 suites), grading-worker 60/60 (+27). Flag-OFF byte-for-byte invariant asserted by test.**
- **API contract for FE:** `GET /submissions/:id` → nullable `pilotTextGrading {id,submissionId,criteriaId,criteriaVersion,transcript,scores{dim:{score,comment,...}},llmFeedback,provider,model,createdAt}`. `GET /reports/pilot-comparison?from&to` → rows `{submissionId,className,studentCode,studentName, audio_<dim>,text_<dim>,delta_<dim>}`; `.../export?format=csv|xlsx` downloads `pilot-so-sanh.*`. Both session-auth (admin+staff).
- **DevOps: n/a** — no queue topology/contracts change, no infra change (worker + core-api already share config/media; new table via committed migration).

- **Frontend (Feature 2):** `SubmissionDetail.tsx` two-column flex wrapper; left audio panel unchanged (existing controls), right read-only pilot panel only when `pilotTextGrading` non-null (notice box, dim/audio/text/Δ table off `Object.keys(data.grading.scores)`, feedback `<p>`, scrollable `<pre>` transcript, muted provider/model). Null → only audio panel. `Reports.tsx` third "So sánh Pilot" section reusing from/to + `exportUrl` (+`'pilot-comparison'`), one `<tr>` per submission×dimension. i18n keys added vi+en under `submissions.*`/`reports.*` (reused existing `reports.class`/`exportCsv`/`exportXlsx`). **Read-only guarantee verified: no button/textarea/onClick in pilot subtree. Vite/tsc build clean via Docker.**

- **QA (Feature 2): PASS.** Ran all three suites: grading-worker 60/60 (pytest), core-api 99/99 (19 suites, Docker `--maxWorkers=2`, build clean), dashboard vite/tsc build clean. Verified the three critical invariants against source with named non-tautological tests: (1) flag-OFF byte-for-byte (`test_pilot_flag_off_leaves_audio_path_byte_for_byte_unchanged` — zero pilot calls, one `audio_grade` cost_log, one publish); (2) text grading never published (`_run_pilot_text_grading` has no `_publish`; happy-path test asserts the published text equals the AUDIO feedback); (3) all four pilot failure modes swallowed inside `handle()`'s try/except, audio grading/status/publish unaffected, no re-raise → no retry/DLQ. All FR-01…FR-12 ACs traced and satisfied. Migration matches schema. Non-blocking: FR-06 schema-invalid-text and FR-08/09 duplicate-POST/NULL-callType rely on sibling tests + DB constraints rather than dedicated tests (structurally correct, migration container-validated).

- **UX (Feature 2):** Design spec matching existing plain-HTML/inline-style pages. SubmissionDetail: two-column `flexWrap` wrapper (stacks <~660px, no media query needed); audio panel unchanged under "Chấm điểm bằng âm thanh (chính thức)"; read-only pilot panel (rendered only if `pilotTextGrading` non-null) with a top "không gửi cho học viên" notice, a 3-col score table (audio/text/Δ signed), read-only feedback `<p>`, transcript in a `maxHeight:200 overflowY:auto <pre white-space:pre-wrap>`, muted provider/model line. Null → render only audio panel (no empty container). Reports: 3rd "So sánh Pilot" section reusing the shared from/to state + `exportUrl` extended with `'pilot-comparison'`, one row per (submission, dimension). Exact vi/en i18n keys under `submissions.*` and `reports.*` provided. Read-only guarantee: zero button/textarea/onClick in pilot panel subtree.

- **QA (M3.6): PASS.** core-api 96/96 (19 suites, Docker `--maxWorkers=2`), grading-worker 33/33 (pytest), dashboard vite/tsc build clean. All 25 ACs verified against source (query filters, unlink-only-original vs both-files, missing-file tolerance, per-row isolation, retention fallback table, strict >80 self-heal, statfs-unavailable no-op, phase isolation, `@Cron('0 15 3 * * *')`, DTO `@IsDateString`, worker PATCH stamp). Safety holds (deletes via `resolveMediaPath`, submissions-only). Non-blocking note: ACs 23/24 lack a dedicated worker-api controller spec (covered by code review + global ValidationPipe + worker pytest).

## Assumptions made

- Video-reap 7-day window and 80% disk threshold are fixed constants; only 90-day audio retention is configurable (§3.8 wording). (BA)
- UTC everywhere; disk `usedPct` uses `bfree` (root-inclusive, slightly conservative — fine for an ops alert). (BA)
- Empty submission dirs left on disk after retention delete (avoids write races; files are what reclaim space). (BA)
- **F3:** PM assumed post-login redirects to `/students`; BA's source read found it actually navigates to `/settings`. Frontend preserved the real behavior (frozen-behavior rule wins over PM's assumption). Recorded so it isn't "fixed" later by mistake.
- **F3:** UX spec named Phosphor icons; frontend implemented a hand-rolled `src/components/icons.tsx` instead, adding no icon dependency — consistent with the minimal-footprint constraint on the RAM-limited container build.
- Pre-existing submissions with `audioExtractedAt = NULL` never enter the video-reap path (no real graded video exists yet) — acceptable, flagged to owner if a backfill is ever needed. (PM)

## Emergent backlog

- (Q-1, from BA) Media controller should fall back to `audio.mp3` when `original.{ext}` is reaped (days 7–90) but `mediaDeletedAt IS NULL`, so the dashboard audio player keeps working after video reap. Out of M3.6 scope; candidate follow-up story.

## Open questions / blockers

<!-- Human-answer-needed items -->

## Fix-round log

| Feature | Defect | Round | Role | Outcome |
|---|---|---|---|---|
| F3 | D1 — 3 dead i18n keys (`nav.languageSwitcher`/`switchToVietnamese`/`switchToEnglish`) defined in both locales, referenced nowhere (language switcher not implemented). AC-49. Low. | 1 | frontend | fixed — keys deleted from both locales; parity 116/116 |
| F3 | D2 — Icon-only sidebar nav links + logout expose an empty accessible name at the md (768–1023px) rail breakpoint: `IconBase` is `aria-hidden`, Tooltip label is a sibling with no aria wiring, logout has no `aria-label`. Regression vs the always-labelled old top nav. AC-46. **Medium.** | 1 | frontend | fixed — `aria-label={item.label}` on rail links + `aria-label={t('nav.logout')}` on logout, both from existing i18n values |
| F3 | D3 — `F3-frontend.md` misreports deps (`tailwindcss-animate`, `phosphor-react` claimed but never added). Documentation only. Low. | 1 | frontend | fixed — Outputs corrected to the real dep set |
| F3 | D4 — `docker compose build dashboard` fails when host `services/dashboard/node_modules/` exists (no `.dockerignore` in any service). Pre-existing, but F3's containerized build loop makes it likely to be hit. Low. | 1 | devops | fixed — `.dockerignore` added to all 4 services; no Dockerfile/compose/Caddy change. Devops could not reproduce the exact symlink failure in its sandbox (filesystem difference) but verified builds still succeed and no COPY path is excluded |
