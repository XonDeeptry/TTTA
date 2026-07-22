# F7 · PM — Analytics dashboard: KPI cards, trends, and education widgets

- **Owner role:** pm
- **Feature:** F7 — New aggregate KPI/trend endpoints + dashboard visualizations fit for an English-center management system (submission rate, on-time %, per-criterion/pronunciation score trends, per-class/course performance, cost trend, pending-review backlog). Combines owner's items 2 (KPI score cards + trends) and 5 (new widget visualizations).
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** — (extends the existing `reports/` subsystem; independent of F4/F5/F6, though it can optionally consume F6's live events as a later enhancement — not required for this feature's baseline)

## Inputs (what this role received)

- Owner's raw request items 2 + 5 + orchestrator's suggested KPI/widget list and the "no new heavy chart dependency unless justified" constraint (RAM-limited container, no-CDN policy already established by F3's redesign).
- Code read for context:
  - `services/core-api/src/reports/{reports.service.ts,reports.controller.ts,report-export.ts}` — existing `submissionRate()`, `cost()`, `pilotComparison()` aggregate query patterns to extend, plus the existing CSV/`.xlsx` export dual-format precedent (`toCsv`/`toXlsxBuffer`).
  - `services/core-api/prisma/schema.prisma` — `Grading.scores` (JSON, per-dimension), `CostLog`, `Submission.status`/`receivedAt`, `Student.className`/`courseId`, `AssignmentCalendar` (global calendar of expected-submission days, not per-student due dates).
  - `services/core-api/src/monitoring/monitoring.service.ts` — precedent for a small read-only aggregate service.
  - `services/dashboard/src/pages/Reports.tsx` and the F3 design system (`components/ui/*` — Card, Table, Badge, hand-authored, Tailwind, no external UI kit) — the visual/component vocabulary to reuse for KPI cards and any chart primitives.
  - `TASKS.md`'s MP.1 entry — the pilot A/B comparison feature already added `dimensionScore()`-style helpers in `reports.service.ts`, directly reusable for per-dimension trend aggregation here.

## Checklist

- [x] Read existing `reports/` module to find reusable aggregate patterns
- [x] Enumerate concrete KPIs/widgets fit for an English-center context (grounded in existing schema fields, not invented data)
- [x] Write user stories + acceptance criteria (MoSCoW)
- [x] Make and justify the chart-dependency recommendation given the stated RAM/no-CDN constraint
- [x] Define in-scope/out-of-scope and flag genuinely open questions (e.g. "on-time %" definition, whether this becomes the new default landing page)

## Outputs

### User stories (MoSCoW)

**US1 (Must) — KPI summary cards.**
As an admin or staff member opening the analytics view, I want a row of at-a-glance KPI cards for a selected date range, so I can assess program health without reading a full table.
- Cards (grounded in existing schema, no invented data source): **Submissions today/this range** (`Submission.receivedAt` count), **Submission rate %** (reuse `ReportsService.submissionRate()` aggregated across all classes for the range), **Average overall score** (mean across `Grading.scores` dimensions, range-filtered by `Submission.receivedAt`), **Average pronunciation score** (the mandatory dimension — isolate it specifically since it's the one guaranteed to exist on every graded submission, per the schema's mandatory-dimension rule), **Pending review count** (`Submission.status = 'awaiting_review'`, current count not range-filtered — it's a backlog snapshot), **LLM cost this range** (sum of `CostLog.estUsd` for the range, reusing `ReportsService.cost()`).
- Given a date range is selected (reusing the existing Reports page's date-range picker pattern), when the analytics view loads, then all cards reflect that range (except Pending review count, which is always "right now").
- Given no data exists for a card in the selected range (e.g. a brand-new class with zero submissions), then the card shows a clear zero/empty state, not an error.

**US2 (Must) — Trend charts.**
As an admin or staff member, I want to see a few key metrics plotted over time, so I can spot direction (improving/declining) rather than just a snapshot.
- **Submission rate per week/day** (line/bar, reusing `submissionRate()` bucketed by period instead of one aggregate for the whole range — a new bucketing capability, not present in today's `reports.service.ts`).
- **Average pronunciation score trend** (line, bucketed by day/week, reusing/extending the `dimensionScore()` helper already proven in `pilotComparison()`).
- **LLM cost trend** (bar, already has daily granularity in `ReportsService.cost()` — direct reuse, just needs a chart instead of/alongside the existing table).
- Given the selected range spans more than ~60 days, when trends are bucketed, then the backend buckets by week instead of day to keep the chart legible (exact threshold is a UX call, not a hard product requirement — flagged as an implementation detail).

**US3 (Should) — Per-class / per-course performance comparison.**
As an admin or staff member, I want to compare classes or courses side by side (average score, submission rate), so I can see which classes need attention.
- A bar/table widget grouping by `Student.className` (matching `submissionRate()`'s existing grouping key) showing average overall score and submission rate per class for the selected range.
- Given a student has no `className` (unassigned), then they group under the same `(chưa gán lớp)` bucket `reports.service.ts` already uses (`UNASSIGNED_CLASS` constant) — reuse, don't reinvent.

**US4 (Should) — Pending-review backlog detail.**
As an admin or staff member, I want to see not just the count but how long submissions have been waiting in `awaiting_review`, so stale reviews are visible.
- Given at least one submission has `status = 'awaiting_review'`, when the widget loads, then it shows count plus the oldest waiting submission's age (e.g. "3 pending, oldest 2 days") with a link into the existing filtered Submissions list (`/submissions?status=awaiting_review`, which already supports status filtering per M4).

**US5 (Could) — Export the analytics view.**
As an admin or staff member, I want to export the KPI/trend data (CSV/xlsx), matching every other Reports export, so I can share it outside the dashboard.
- Reuses the existing `toCsv()`/`toXlsxBuffer()` dual-format precedent in `report-export.ts` — lowest priority because it's pure repetition of an established pattern, not new discovery, and the owner's request didn't explicitly ask for export on this specific view.

**US6 (Won't, this iteration) — Live-updating analytics via F6's SSE.**
Not requested for this feature; F6 covers per-submission lifecycle status, not aggregate KPI recomputation (which is a heavier query, not something to recompute on every event). A scheduled/periodic refresh (e.g. refetch on page focus, or every N minutes) is sufficient and is what's actually in scope if any auto-refresh is wanted — full SSE-driven KPI recomputation is deferred as an explicit non-goal to avoid conflating F6 and F7.

### Chart-dependency recommendation (addressing the orchestrator's explicit constraint)

**Recommendation: no new npm dependency.** Hand-author minimal SVG chart primitives (`dashboard/src/components/charts/LineChart.tsx`, `BarChart.tsx` — simple, data-driven `<svg>` output, no interactivity beyond native `<title>` tooltips) rather than adding `recharts`/`chart.js`/similar. Justification:
1. **Matches the established project convention.** F3's redesign explicitly hand-authored every shadcn/ui primitive rather than pulling a component library or running `npx shadcn add` (blocked by the "no Node on dev machine" / one-shot-container-build constraint) — the same reasoning applies to charts: no CDN, no extra `npm ci` weight in the RAM-constrained containerized build.
2. **The actual visual need is modest.** Every chart in scope (US2/US3) is a simple line or bar over time/category — well within what a ~100-150 line hand-rolled SVG component covers competently. This is unlike `mammoth`/`exceljs`/`docx`, which were justified additions because they solve a *unique format problem* (real `.docx` parsing/generation, real `.xlsx` binary format) that hand-rolling would be irresponsible for. Charts have no such unique-format requirement — an SVG line is not the same category of problem as binary spreadsheet generation.
3. **Escalate only if UX/owner wants interactivity** this codebase's plain data cannot cheaply provide by hand (zoom, brush-select, animated transitions, complex tooltips) — that would be a legitimate reason to reconsider a real charting library, but nothing in the owner's request (items 2/5) asks for that; "KPI score cards + trends" and "widget visualizations" read as informational, not interactive-analytics-tool requirements.

### New API surface (additive, extends `services/core-api/src/reports/` — new methods on `ReportsService` + new `reports.controller.ts` routes, OR a sibling `analytics/` module if BA prefers separation; PM has no strong opinion, flagging as an open item below)
- `GET /reports/kpis?from&to` — the US1 card values in one payload.
- `GET /reports/trends?from&to&metric=submissionRate|pronunciationScore|cost&bucket=day|week` — US2.
- `GET /reports/class-performance?from&to` — US3 (extends `submissionRate()`'s grouping with an added average-score column).
- `GET /reports/pending-review-backlog` — US4 (not range-filtered, current-state only).

### In scope
- New/extended core-api `reports/` (or `analytics/`) endpoints per above, built on existing Prisma queries and the established `UNASSIGNED_CLASS`/`dimensionScore()` helper conventions.
- New dashboard view: either a new `/analytics` page+nav item (admin+staff, same access tier as `/reports` — not admin-only, matching phân hệ 4's existing role) or a new top section within the existing `Reports.tsx` page. **Recommendation: new `/analytics` page, separate nav entry**, since `Reports.tsx` today is already a distinct "submission-rate + cost tables + export" tool and conflating it with a dashboard-style overview would make both harder to scan — but this is a UX call, not a hard product requirement.
- Hand-authored SVG chart components (no new dependency), per the recommendation above.
- i18n vi/en for all new labels/cards/chart legends.

### Out of scope
- Any interactive/heavy charting library (see recommendation — revisit only on explicit owner/UX escalation).
- SSE/live-updating KPIs (US6, explicitly deferred; F6 is a separate, narrower feature).
- Changing the post-login default route/redirect (stays as established by F3 — this is a new page, not a new home).
- "On-time %" as originally suggested by the orchestrator's brainstorm: **deferred, see open question below** — the schema has no per-student due-date concept, only a global `AssignmentCalendar` (expected-submission days, used today only by the 20:30 missing-submissions cron). Computing "on-time" would require defining what "on time" means (same-day as calendar entry? within N hours of a fixed cutoff?) which isn't specified anywhere in the architecture docs — building it now risks guessing a business rule. Submission rate (already well-defined and reused from `reports.service.ts`) covers the "did they submit" half of this KPI; "on time" is dropped from this feature's scope pending a real definition.

### Assumptions
1. Access tier: admin+staff (phân hệ 4, same as today's `/reports`), not admin-only — nothing in the request suggests restricting analytics to admins only, and Reports today is already staff-visible.
2. New `/analytics` page + nav entry, separate from `/reports` (see recommendation above) — open to being merged into `Reports.tsx` instead if BA/UX prefers, not a hard requirement.
3. "On-time %" is dropped from scope per the reasoning above; only submission rate (existing, well-defined) ships. If the owner specifically wants on-time tracking, that needs its own small design decision (a due-time rule) before it can be built — flagged as an open question, not silently substituted.
4. Bucketing threshold for day-vs-week trend charts (~60 days) is an implementation detail, not a product requirement — frontend/backend can pick a sensible default.

## Blockers / open questions

1. **"On-time %" definition is undefined in any existing doc** (open, needs owner/BA input if this KPI is actually wanted as specified, vs. the PM's proposed scope-drop to submission-rate-only). Not blocking — proceeding without it per the stated assumption; escalate only if the owner insists on-time specifically (not just submission rate) is required.
2. **New `/analytics` page vs. extending `/reports`** — a UX preference, not escalated, flagged for whoever picks up UX/BA to confirm quickly with the owner if there's time, otherwise the PM's recommendation (separate page) stands.

## Notes for the next role

BA: firm up the exact KPI/trend endpoint contracts (response shapes, bucketing rules) before backend starts, and get a fast owner read on the two open questions above if possible — neither blocks starting, but both are cheap to resolve early. UX: reuse F3's Card/Table/Badge primitives verbatim for KPI cards; design the two small chart primitives (line, bar) once, generically, rather than bespoke per-metric. Backend: extend `reports.service.ts` rather than duplicating its `UNASSIGNED_CLASS`/`dimensionScore()` logic in a new module unless BA has a strong reason to split into a separate `analytics/` module.
