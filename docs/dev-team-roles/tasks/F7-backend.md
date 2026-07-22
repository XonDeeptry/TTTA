<!--
  Per-feature-per-role task file, OWNED by the Backend agent for F7.
  Only the backend agent writes this file. Frontend/QA READ it.
-->

# F7 · Backend — Analytics dashboard endpoints (core-api)

- **Owner role:** backend
- **Feature:** F7 — 5 additive, read-only `/analytics/*` endpoints in the existing `reports/` module (KPIs, trends, class-performance, dimension-breakdown, pending-review). Band-normalized score metrics, all divisions guarded, no schema change.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F7-ba.md, F7-pm.md

## Inputs (what this role received)
- **F7-ba.md** — authoritative contract: FR-01..FR-05 (5 endpoints), exact computations, band-normalization rule (BR-02), division guards (NFR-01), homework=audio/video only (BR-01), pending-review is a live snapshot (BR-03), `UNASSIGNED_CLASS` reuse (BR-04), all ACs.
- **Code read:** `reports.service.ts` (reuse `submissionRate()`, `cost()`, `dimensionScore()`, `UNASSIGNED_CLASS`), `reports.controller.ts` (`parseRange`, `SessionAuthGuard`), `prisma/schema.prisma` (Submission/Grading/CostLog/Student/Criteria), `criteria/docx-parser.ts` + `grading/schema.py` (confirmed `Grading.scores.<dim>.score` int + rubric `band_scale=[min,max]` default `[0,3]`, band_max = `band_scale[1]`).

## Checklist
- [x] Read BA/PM contracts + real code (schema, reports service/controller, band_scale source)
- [x] Confirm band-scale JSON path (`Criteria.rubric.band_scale[1]`, fallback 3) — done
- [x] Extract `parseRange` to shared `reports/date-range.ts` (behavior-identical refactor)
- [x] Add band-normalized helpers + 5 methods to `ReportsService`
- [x] Add `AnalyticsController` (`@Controller('analytics')`, SessionAuthGuard) in reports module
- [x] Register controller in `reports.module.ts`
- [x] Write unit tests seeding rows + asserting exact numbers (zero-data, cross-band, robustness)
- [x] Docker: prisma generate (n/a — no schema change) → tsc build → jest --maxWorkers=2 green
- [x] Set Status DONE + fill Outputs with 5 endpoint contracts

## Outputs (what this role produced)

### Files changed
- `services/core-api/src/reports/reports.service.ts` — added band-normalization helpers (`scorePctForGrading`, `bandMaxFromRubric`), UTC bucketing helpers, response interfaces, and 5 methods: `kpis`, `trends`, `classPerformance`, `dimensionBreakdown`, `pendingReview`. Reuses existing `submissionRate()`, `cost()`, `dimensionScore()`, `UNASSIGNED_CLASS`. Existing methods untouched.
- `services/core-api/src/reports/analytics.controller.ts` — NEW `@Controller('analytics')` + `SessionAuthGuard` (admin+staff, NOT admin-only). 5 routes.
- `services/core-api/src/reports/date-range.ts` — NEW shared `parseRange()` + `DEFAULT_RANGE_DAYS` (extracted from reports.controller; behavior byte-identical).
- `services/core-api/src/reports/reports.controller.ts` — imports `parseRange` from `date-range.ts` (was a local fn). No route/response change.
- `services/core-api/src/reports/reports.module.ts` — registers `AnalyticsController`.
- `services/core-api/src/reports/analytics.spec.ts` — NEW, 20 unit tests (seed rows, assert exact numbers incl. zero-data, cross-band, malformed-blob).

### API contract (all `GET`, `SessionAuthGuard` admin+staff, 401 if unauthenticated; `from`/`to` ISO dates, default last 30 days)

`GET /analytics/kpis?from&to` →
```
{ "submissions":{"count":number},
  "submissionRate":{"ratePercent":number},                    // 0..100, 1dp, 0 if no active students
  "avgScore":{"scorePct":number|null,"gradedCount":number},   // null if gradedCount==0
  "avgPronunciation":{"scorePct":number|null,"gradedCount":number},
  "pendingReview":{"count":number},                           // SNAPSHOT — not range-filtered
  "cost":{"totalUsd":number} }                                // sum estUsd, 6dp
```
`GET /analytics/trends?from&to&bucket=day|week` (default day; range >60d forces week) →
```
{ "bucket":"day"|"week",
  "submissions":[{"label":"YYYY-MM-DD","value":number}],      // dense, missing=0
  "score":[{"label":"YYYY-MM-DD","value":number|null}],       // null for empty buckets
  "cost":[{"label":"YYYY-MM-DD","value":number}] }            // label = bucket start; week = Monday(UTC)
```
`GET /analytics/class-performance?from&to` → sorted ratePercent ASC (worst first)
```
[{ "className":string,"totalStudents":number,"submittedStudents":number,
   "ratePercent":number,"avgScorePct":number|null,"gradedCount":number }]
```
`GET /analytics/dimension-breakdown?from&to` → sorted avgScorePct ASC (weakest first), `[]` if no gradings
```
[{ "dimension":string,"avgScorePct":number,"gradedCount":number }]
```
`GET /analytics/pending-review` → no params (live snapshot)
```
{ "count":number,"oldestWaitingHours":number|null,"oldestSubmissionId":number|null }
```

### Verification
- Docker (node:24-alpine, `npm ci` → `prisma generate` → `tsc build` → `jest --maxWorkers=2`): **29 suites / 196 tests passed** (baseline 28/176 → +1 suite, +20 tests). Build clean.
- BR-01 homework=audio/video enforced (`kind:{in:['audio','video']}`); BR-02 band-normalization to % of `Criteria.rubric.band_scale[1]` (fallback 3, never 0 → no div0); BR-03 pending-review snapshot ignores range; BR-04 `UNASSIGNED_CLASS` reused. No schema migration. `/reports/*` + `Reports.tsx` untouched. No new npm dependency.

## Blockers / open questions
—

## Notes for the next role
- **Frontend:** consume the 5 shapes above. `avgScorePct`/`score.value` can be `null` (render a dash, never `NaN`). Trend series are dense (one point per day/week) so charts have no gaps; check `res.bucket` (server may have forced `week`). `/analytics/pending-review` takes NO range params — deep-link `oldestSubmissionId` into `/submissions?status=awaiting_review`. Sort order is server-provided (class-perf worst-first, dimension weakest-first) — render as-is.
- **QA:** unit ACs are covered in `analytics.spec.ts` (zero-data AC-01.4/02.3/04.3/05.2, cross-band AC-01.7, malformed-blob AC-01.8). Browser ACs (AC-02.5, 05.3, 06.*) are frontend's.
- **DBA:** no schema/index change requested — all metrics read existing indexed columns (`receivedAt`, `status`); single `grading.findMany` with `criteria`+`submission` include avoids N+1.
