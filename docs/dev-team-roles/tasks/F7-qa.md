<!--
  Per-feature-per-role task file, OWNED by the QA agent for F7.
-->

# F7 · QA — Analytics dashboard (KPIs, trends, education-fit widgets)

- **Owner role:** qa
- **Feature:** F7 — 5 additive read-only `/analytics/*` endpoints + new `/analytics` page (admin+staff) with hand-authored SVG charts.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F7-ba.md, F7-pm.md, F7-ux.md, F7-backend.md, F7-frontend.md

## Inputs
- F7-ba.md — FR-01..FR-06, NFR-01 (no-NaN/no-crash), BR-01..BR-05, ACs (unit vs browser).
- F7-backend.md — 5 endpoint contracts; claims 29 suites / 196 tests.
- F7-frontend.md — `/analytics` page; claims i18n 179/179 parity.

## Checklist
- [x] Read all upstream task files + protocol
- [x] Read backend source line-by-line (reports.service, analytics.controller, date-range, module)
- [x] Re-derive all 5 metric computations vs BA formulas
- [x] Read frontend source (Analytics.tsx, LineChart, BarChart, App.tsx route, i18n)
- [x] Verify deep-link gap (Submissions.tsx status param on mount)
- [x] Write adversarial throwaway jest spec (band_scale missing/zero/null/neg, null scores, from>to, future ts, string estUsd) — 10 cases, all PASS, then deleted
- [x] Run core-api suite via Docker — 30 suites / 206 tests PASS (backend 29/196 + my adversarial suite/10)
- [x] Regression: zalo-gateway 5/26 PASS, grading-worker 60 PASS
- [x] Build dashboard (tsc+vite) — clean, 86 modules, no new chart dep
- [x] Verdict: PASS

## Findings

### Metric correctness (re-derived line-by-line, reports.service.ts) — all correct
- submission rate = distinct submitters ÷ active students, center-wide roll-up of `submissionRate()` (FR-01.2). Per-spec.
- avgScore/avgPronunciation band-normalized: `avg(.score)/bandMax*100`, `bandMax=Criteria.rubric.band_scale[1]` fallback 3. Cross-band (AC-01.7) verified + my adversarial mixed-scale cases.
- homework = `kind IN (audio,video)` (BR-01). Text/image excluded.
- pendingReview = live snapshot, `status='awaiting_review'`, no range filter (BR-03).
- All divisions guarded — verified via backend spec + 10 adversarial cases (band_scale missing/zero/null/negative → fallback 3; malformed/null/garbage scores skipped; from>to → empty dense series no infinite loop; future receivedAt clamped to 0h; string estUsd coerced). No NaN / no throw anywhere.

### Frontend (source-verified; browser ACs not executed in this env)
- `/analytics` route has NO `adminOnly` → admin+staff (App.tsx L271-277); nav item unconditional (L57). AC-06.2.
- Date-range effect deps `[from,to,bucket]` refetch KPI/trends/breakdown; pending-review is a SEPARATE effect with `[]` deps (AC-06.3). Confirmed.
- Charts: empty-state box with reserved height on `[]`/all-null/all-0; `formatValue` only called on non-null; no NaN/null/undefined literal reaches DOM (AC-06.4). Single-series, no legend; accessible via figcaption + inner `<title>` + `role=img`/`aria-label`.
- No new npm chart dep (hand-authored SVG). i18n: all 27 `analytics.*`/`nav.analytics` keys present in vi AND en incl. `pendingOldest` interpolation.

### Frozen scope — respected
- `parseRange` extracted to `date-range.ts` byte-identical (git diff confirms only extraction); reports.controller routes/responses unchanged; reports.module only adds AnalyticsController; `contracts.*` untouched (not in diff); no schema migration. F4/F5/F6 suites green (no regression).

## Non-blocking notes (NOT defects)
1. **Deep-link pre-filter gap:** `Submissions.tsx` initializes `status=''` and never reads the `?status=` query param on mount, so `/submissions?status=awaiting_review` lands unfiltered. Assessed against AC-05.3 which requires only that "the widget links to /submissions?status=awaiting_review" — the link exists and is correct, so the AC is MET. Pre-filtering is NOT a stated acceptance criterion; BA FR-05's rationale ("M4 already supports ?status=") is factually inaccurate but non-binding. If the owner wants pre-filtering, that is a follow-up owned by **frontend**. Not a blocker.
2. **Submission-rate kind nuance:** `submissionRate()` counts a student as "submitted" on ANY-kind submission (not audio/video-only), unlike the homework count (BR-01). This is exactly what BA FR-01.2 specified (reuse the existing per-class query), so per-spec — flagged only for awareness.

## Verdict
QA_RESULT: PASS
