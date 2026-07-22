<!--
  Per-feature-per-role task file, OWNED by the BA agent for F7.
  Only the BA writes this file. Backend/UX/QA READ it.
-->

# F7 · BA — Analytics dashboard: KPI cards, trends, education-fit widgets

- **Owner role:** ba
- **Feature:** F7 — New aggregate KPI/trend endpoints + hand-authored SVG visualizations on a new `/analytics` page (admin+staff, phân hệ 4), additive on top of the existing `reports/` subsystem.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F7-pm.md

## Inputs (what this role received)

- **F7-pm.md** — user stories US1–US6 (MoSCoW), the "on-time %" scope-drop (no per-student due date in schema), the "new separate `/analytics` page" recommendation, and the "no new npm chart lib — hand-author SVG" decision.
- **Code read (so every metric below is computable from real columns):**
  - `services/core-api/prisma/schema.prisma` — `Submission` (`status` enum `received|processing|graded|awaiting_review|sent|failed`, `kind` enum, `receivedAt`, `studentId`), `Grading` (`scores` Json, `criteriaId`→`Criteria.rubric`), `Student` (`className` nullable, `status`, `courseId`), `CostLog` (`estUsd` Decimal, `provider`, `createdAt`, nullable `callType`), `AssignmentCalendar`, `ClassConfig`, `Criteria.rubric` (Json, holds `band_scale`).
  - `services/core-api/src/reports/reports.service.ts` — `submissionRate(from,to,className?)`, `cost(from,to)`, `pilotComparison(...)`, the `UNASSIGNED_CLASS = '(chưa gán lớp)'` constant, and the `dimensionScore(scores, dim)` helper (reads `scores[dim].score` or a bare number). **F7 extends this service, does not duplicate it.**
  - `services/core-api/src/reports/reports.controller.ts` — `@Controller('reports')` + `SessionAuthGuard`, `parseRange(from,to)` (default 30d window), the export helper.
  - `services/dashboard/src/pages/Reports.tsx` + `App.tsx` (`ProtectedShell`, nav `items[]`, `adminOnly` flag) + `i18n/index.ts` (flat dotted keys, vi default + en).
  - `services/grading-worker/src/grading_worker/grading/schema.py` — confirms `Grading.scores` shape: **`{ "<dim>": { "score": <int in band_min..band_max>, "comment": "...", ... }, ... }`**; `pronunciation` is mandatory on every graded submission; `band_scale` (default `[0,3]`) lives in the rubric.

## Confirmed data facts (the ground truth every metric is built on)

- **`Grading.scores` JSON path** for a dimension score is `scores.<dim>.score` (integer). Use the existing `dimensionScore()` helper — do not re-derive the path.
- **Band scale is per-course, not global.** `band_max` = `Criteria.rubric.band_scale[1]` (fallback `3` if absent/invalid). A raw average of `.score` across classes on different band scales is meaningless to a manager, so **all "score" metrics are normalized to a 0–100 percentage of band max**: `scorePct = score / band_max * 100`. This makes scores comparable across courses/classes and is what QA asserts. (Raw-average alternative is explicitly rejected — noted for QA.)
- **"Homework submission"** = `Submission.kind IN (audio, video)`. Text/image/file/follow are NOT homework and are excluded from submission counts/trends (the bot only grades audio/video; text is flagged, never graded). This is a deliberate filter, stated as FR/AC so QA seeds mixed-kind rows and asserts the exclusion.
- **`pronunciation` is guaranteed present** on every graded submission (worker rejects rubrics lacking it), so the pronunciation KPI never has a "dimension missing" hole — but a graded row with a malformed `scores` blob must still be skipped, not crash.

---

## Functional requirements

Everything below traces to F7-pm US1–US5. All endpoints are **additive**, live in the existing `reports/` module, use `SessionAuthGuard` only (admin+staff — phân hệ 4, NOT admin-only), and reuse `parseRange()`, `UNASSIGNED_CLASS`, and `dimensionScore()`.

### Module & routing decision (resolves PM open item #2 on the API side)
- **New `AnalyticsController` (`@Controller('analytics')`) inside the existing `reports/` module**, injecting the **same `ReportsService`** (extended with new methods). This gives clean `/analytics/*` URLs matching the new `/analytics` page while reusing all query helpers — no new module, no duplicated `UNASSIGNED_CLASS`/`dimensionScore` logic. (This is the concrete form of the PM's "extend reports.service rather than duplicate" note.)
- **Frozen behavior:** existing `/reports/*` routes and `Reports.tsx` are unchanged. No schema migration — every metric is computed from existing columns (proven above). Bot messaging is untouched (read-only analytics).

### Shared helper: normalized score (new private method on `ReportsService`)
`scorePctForGrading(scores, bandMax)` → for a grading, average `.score` across all present dimensions, divide by `bandMax`, ×100, round to 1 decimal. Returns `null` if `scores` is not an object or has zero valid dimensions. `bandMax` resolved as `Criteria.rubric.band_scale[1]`, coerced to a positive number, fallback `3`.

---

### FR-01 — KPI summary endpoint  *(US1)*
`GET /analytics/kpis?from&to` → single JSON object. Range defaults to last 30 days via existing `parseRange()`.

**Response shape:**
```
{
  "submissions":        { "count": number },                 // homework only (kind in audio,video), receivedAt in range
  "submissionRate":     { "ratePercent": number },           // 0..100, 1 dp
  "avgScore":           { "scorePct": number | null, "gradedCount": number },
  "avgPronunciation":   { "scorePct": number | null, "gradedCount": number },
  "pendingReview":      { "count": number },                 // SNAPSHOT — NOT range-filtered
  "cost":               { "totalUsd": number }               // sum estUsd in range, 6 dp like cost()
}
```

**Exact computation (named columns):**
- `submissions.count` = `COUNT(Submission WHERE kind IN (audio,video) AND receivedAt BETWEEN from AND to)`.
- `submissionRate.ratePercent` = `sum(submittedStudents) / sum(totalStudents) * 100` over `submissionRate(from,to)` rows (center-wide roll-up of the existing per-class query). `0` if `sum(totalStudents) == 0`.
- `avgScore.scorePct` = mean of `scorePctForGrading()` over gradings whose `Submission.receivedAt` ∈ range; `gradedCount` = number of such gradings with a non-null pct. `scorePct = null` when `gradedCount == 0`.
- `avgPronunciation.scorePct` = mean over the same gradings of `dimensionScore(scores,'pronunciation') / bandMax * 100`; skip gradings where that is null.
- `pendingReview.count` = `COUNT(Submission WHERE status = 'awaiting_review')` — **current backlog, ignores the date range** (a backlog snapshot; documented so QA does not expect range filtering here).
- `cost.totalUsd` = `sum(CostLog.estUsd WHERE createdAt BETWEEN from AND to)` (may reuse/sum `cost()` rows).

**Why (English-center ops):** these six are the headline "is the program healthy this period" numbers — are students submitting (count + rate), is quality holding (overall + the mandatory pronunciation skill), is the review team keeping up (backlog), and is spend under control (cost). One request → one card row, minimal round-trips.

**Acceptance criteria (Given/When/Then):**
- **AC-01.1** *(unit)* Given 4 submissions in range with kinds `audio, video, text, image`, When `GET /analytics/kpis`, Then `submissions.count == 2` (text+image excluded).
- **AC-01.2** *(unit)* Given 10 active students in `submissionRate()` and 4 distinct submitters in range, Then `submissionRate.ratePercent == 40`.
- **AC-01.3** *(unit)* Given two graded submissions on band scale `[0,3]` with dimension scores `{pronunciation:3, fluency:3}` and `{pronunciation:0, fluency:0}`, Then `avgScore.scorePct == 50` and `avgPronunciation.scorePct == 50` and `avgScore.gradedCount == 2`.
- **AC-01.4** *(unit, zero-data)* Given zero graded submissions in range, Then `avgScore.scorePct == null`, `avgPronunciation.scorePct == null`, `gradedCount == 0` — **no NaN, no throw** (division-by-zero guarded).
- **AC-01.5** *(unit)* Given 3 submissions with `status='awaiting_review'` (one outside the date range), Then `pendingReview.count == 3` (range ignored for this field).
- **AC-01.6** *(unit)* Given `CostLog` rows summing to `1.2345` USD in range and rows outside range, Then `cost.totalUsd` reflects only in-range rows.
- **AC-01.7** *(unit, cross-band)* Given one grading on band `[0,3]` scoring `3` on every dim and one on band `[0,9]` scoring `9` on every dim, Then both contribute `100%` and `avgScore.scorePct == 100` (proves band normalization, not raw averaging which would give a wrong mixed number).
- **AC-01.8** *(unit, robustness)* Given one grading whose `scores` is `null`/`{}`/`"garbage"`, When computing averages, Then that grading is skipped (not counted in `gradedCount`) and no exception is thrown.

### FR-02 — Trends endpoint  *(US2)*
`GET /analytics/trends?from&to&bucket=day|week` → three chart-ready series in one payload (fewer round-trips than per-metric calls). `bucket` defaults to `day`; if the range spans **> 60 days**, the server MUST force `week` regardless of the param (legibility; the 60-day threshold is fixed here so QA can assert it).

**Response shape:**
```
{
  "bucket": "day" | "week",
  "submissions": [ { "label": "2026-07-01", "value": number }, ... ],  // homework count per bucket
  "score":       [ { "label": "2026-07-01", "value": number | null }, ... ], // avg scorePct per bucket
  "cost":        [ { "label": "2026-07-01", "value": number }, ... ]   // sum estUsd per bucket
}
```
- `label` = ISO date of the bucket start (`YYYY-MM-DD`). Buckets are generated for **every** period in the range (dense series — missing periods appear with `value: 0`, or `null` for score, so the line/bar has no gaps). Week buckets are keyed by their Monday (ISO week start).
- `submissions[].value` = homework count (kind audio/video) with `receivedAt` in that bucket.
- `score[].value` = mean `scorePctForGrading()` over gradings whose submission `receivedAt` is in that bucket; `null` for buckets with zero gradings.
- `cost[].value` = `sum(CostLog.estUsd)` in that bucket (reuses `cost()` daily grain, re-bucketed to week when needed).

**Why:** direction over time (improving/declining submission volume and quality, cost drift) is what a snapshot can't show; three series cover volume, quality, and spend.

**Acceptance criteria:**
- **AC-02.1** *(unit)* Given homework submissions on 3 distinct days in a 7-day range with `bucket=day`, Then `submissions` has 7 dense points and the 3 active days carry the right counts, the other 4 are `0`.
- **AC-02.2** *(unit)* Given a range of 90 days with `bucket=day` requested, Then response `bucket == "week"` (server-forced) and points are week-keyed by Monday.
- **AC-02.3** *(unit, zero-data)* Given no gradings in a bucket, Then that bucket's `score.value == null` (not `0`, not NaN) and its `submissions`/`cost` values are `0`.
- **AC-02.4** *(unit)* Given cost logs across two weeks with `bucket=week`, Then costs aggregate into 2 week buckets summing correctly.
- **AC-02.5** *(browser)* Trend charts render a line (score, submissions) / bar (cost) with the returned points and show the empty state when every point is `0`/`null`.

### FR-03 — Class/course performance breakdown  *(US3)*
`GET /analytics/class-performance?from&to` → array, one row per class (grouped by `Student.className`, unassigned bucketed under `UNASSIGNED_CLASS` exactly as `submissionRate()` does).

**Response shape:**
```
[ { "className": string,
    "totalStudents": number, "submittedStudents": number, "ratePercent": number, // reuse submissionRate()
    "avgScorePct": number | null, "gradedCount": number }, ... ]
```
- `totalStudents/submittedStudents/ratePercent` come straight from `submissionRate(from,to)`.
- `avgScorePct` = mean `scorePctForGrading()` over gradings whose submission's student is in that class and `receivedAt` ∈ range; `null` if `gradedCount == 0`.
- Sorted by `ratePercent` ascending (worst-performing class first — the one that needs attention surfaces at the top). QA asserts ordering.

**Why:** lets ops see which class is lagging on both participation and quality, side by side — the single most actionable education-ops view.

**Acceptance criteria:**
- **AC-03.1** *(unit)* Given students in classes `A`, `B`, and one with `className=null`, Then rows exist for `A`, `B`, and `(chưa gán lớp)`.
- **AC-03.2** *(unit)* Given class `A` rate 20% and class `B` rate 80%, Then `A` sorts before `B`.
- **AC-03.3** *(unit, zero-data)* Given a class with students but no gradings in range, Then its `avgScorePct == null`, `gradedCount == 0`, `ratePercent == 0` — row still present, no crash.

### FR-04 — Score distribution by dimension  *(US3, the "education-fit" widget)*
`GET /analytics/dimension-breakdown?from&to` → per-dimension average across all graded submissions in range.

**Response shape:**
```
[ { "dimension": string, "avgScorePct": number, "gradedCount": number }, ... ]
```
- Union of all dimension keys present across in-range gradings' `scores`. For each dimension: `avgScorePct` = mean of `dimensionScore(scores,dim)/bandMax*100` over gradings that have that dim; `gradedCount` = how many contributed.
- `pronunciation` always appears (mandatory). Sorted by `avgScorePct` ascending (weakest skill first). Empty array when no gradings in range.

**Why:** shows the center which *skill* is weakest across all students (e.g. pronunciation vs fluency vs grammar) — directly drives curriculum/teaching focus. This is the strongest "education-fit" widget and is fully computable from existing `Grading.scores`.

**Acceptance criteria:**
- **AC-04.1** *(unit)* Given gradings with dims `pronunciation, fluency, grammar`, Then three rows returned, weakest `avgScorePct` first.
- **AC-04.2** *(unit)* Given a dimension present in some gradings but absent in others, Then its `gradedCount` counts only the gradings that had it, and its average excludes the rest.
- **AC-04.3** *(unit, zero-data)* Given no gradings in range, Then `[]` (empty array), not an error.

### FR-05 — Pending-review backlog detail  *(US4)*
`GET /analytics/pending-review` → snapshot (no range params).

**Response shape:**
```
{ "count": number, "oldestWaitingHours": number | null, "oldestSubmissionId": number | null }
```
- `count` = `COUNT(Submission WHERE status='awaiting_review')`.
- `oldestWaitingHours` = `now - min(receivedAt)` over those rows, in whole hours; `null` when `count == 0`.
- `oldestSubmissionId` = id of that oldest waiting submission (for the deep-link into `/submissions?status=awaiting_review`); `null` when empty.

**Why:** a raw count hides staleness; surfacing "oldest waiting N hours" makes an SLA breach visible and links straight into the existing filtered Submissions list (M4 already supports `?status=`).

**Acceptance criteria:**
- **AC-05.1** *(unit)* Given 3 `awaiting_review` submissions, oldest received 50h ago, Then `count==3`, `oldestWaitingHours==50`, `oldestSubmissionId` = that row's id.
- **AC-05.2** *(unit, zero-data)* Given zero `awaiting_review`, Then `count==0`, `oldestWaitingHours==null`, `oldestSubmissionId==null`.
- **AC-05.3** *(browser)* The widget links to `/submissions?status=awaiting_review`.

### FR-06 — Analytics page (dashboard)  *(US1–US5 visual)*
A new `/analytics` route in `App.tsx` (inside `ProtectedShell`, **no `adminOnly`** → admin+staff) plus a nav entry. Reuses the F3 `Card`/`Table`/`Badge` primitives and the `Reports.tsx` date-range picker pattern (reuse `reports.from`/`reports.to`/`reports.dateRange` keys). All numbers/charts come from FR-01..FR-05.

**Recommended layout (top→bottom):**
1. **KPI card row** — 6 stat tiles (FR-01), each a `Card` with a big number + label + unit. Order: Submissions · Submission rate % · Avg score % · Pronunciation % · Pending review · LLM cost.
2. **Two-up trend row** — Submissions/day (line or bar) + LLM cost/day (bar), from FR-02, with a `day|week` bucket toggle.
3. **Avg-score-over-time** — full-width line (FR-02 `score` series).
4. **Two-up breakdown row** — Dimension breakdown (horizontal bar, FR-04) + Class performance (bar or `Table`, FR-03).
5. **Pending-review backlog strip** — count + "oldest N hours" + link (FR-05).

**Chart vocabulary (small, per PM's hand-authored-SVG decision — NO new npm chart lib):**
- **StatTile** — reuse F3 `Card`; not a chart.
- **`components/charts/LineChart.tsx`** — one generic hand-authored `<svg>` line/area over `{label,value}[]`, native `<title>` tooltips, renders empty state when all `value` null/0. Used for submissions/day and avg-score-over-time.
- **`components/charts/BarChart.tsx`** — one generic hand-authored `<svg>` bar (vertical or horizontal) over `{label,value}[]`. Used for cost/day, dimension breakdown, class performance.
- No third chart type. Interactivity beyond `<title>` tooltips is out of scope (PM).

**Acceptance criteria:**
- **AC-06.1** *(browser)* Given a range with data, When `/analytics` loads, Then the 6 KPI tiles, the trend charts, both breakdown widgets, and the backlog strip render.
- **AC-06.2** *(browser)* `/analytics` is reachable by a `staff` user (not admin-only) and appears in the nav for both roles.
- **AC-06.3** *(browser)* Changing the date range refetches FR-01..FR-04 (FR-05 is a snapshot and need not depend on the range).
- **AC-06.4** *(browser, empty state)* Given a brand-new center with zero students/submissions/gradings/cost, Then every tile shows `0` (or a dash for null score), every chart shows a clean empty state, and nothing renders `NaN`, `null`, `undefined`, or throws.

---

## Non-functional requirements
- **NFR-01 (correctness/robustness):** no endpoint may return `NaN`/`Infinity` or throw on empty/zero data. Every division (rate, score averages, band normalization) is guarded (`denominator == 0` → `0` for rates/counts, `null` for score averages). Prime QA target (AC-01.4, AC-02.3, AC-03.3, AC-04.3, AC-05.2, AC-06.4).
- **NFR-02 (auth):** all `/analytics/*` endpoints behind `SessionAuthGuard`; an unauthenticated request gets 401. Not admin-restricted (admin+staff), matching `/reports`.
- **NFR-03 (performance):** each endpoint is a bounded read over existing indexed columns (`receivedAt`, `status`); reuse `submissionRate()`/`cost()` query patterns — no per-submission N+1 (fetch gradings + their criteria band scale in a single `include`/join or a pre-fetched band-scale map). Target < 1s for a 90-day range on the single-VPS Postgres.
- **NFR-04 (additive/frozen):** no change to existing `/reports/*` responses, `Reports.tsx`, or the DB schema. No new npm dependency (hand-authored SVG per PM).
- **NFR-05 (i18n):** every new label/title/axis/empty-state has a vi (default) + en key.

## Business rules
- **BR-01:** "Homework submission" for all counts/trends = `kind IN (audio, video)` only.
- **BR-02:** All score metrics are normalized to 0–100% of the grading's rubric `band_scale` max; never mix raw band scores across courses.
- **BR-03:** Pending-review backlog and `/analytics/pending-review` are always current-state snapshots, never range-filtered.
- **BR-04:** Unassigned students bucket under `(chưa gán lớp)` (`UNASSIGNED_CLASS`), reused, never reinvented.
- **BR-05:** Analytics is read-only. It never triggers any outbound message; the bot-never-messages-students boundary is unaffected.

## Data dictionary (fields consumed — all existing, no new columns)
| Field | Source | Type | Used for |
|---|---|---|---|
| `Submission.kind` | submissions | enum | homework filter (BR-01) |
| `Submission.receivedAt` | submissions | DateTime | range + bucketing |
| `Submission.status` | submissions | enum | pending-review backlog (FR-05) |
| `Submission.studentId` | submissions | int? | class join / submitter set |
| `Grading.scores` | gradings | Json `{dim:{score,...}}` | all score metrics |
| `Grading.criteriaId` → `Criteria.rubric.band_scale` | criteria | Json `[min,max]` | band normalization (BR-02) |
| `Student.className` | students | string? | class grouping (FR-03) |
| `Student.status` | students | string | active-student denominator (via `submissionRate()`) |
| `CostLog.estUsd` | cost_log | Decimal | cost KPI + trend |
| `CostLog.createdAt` | cost_log | DateTime | cost range/bucket |

## i18n keys (add to `services/dashboard/src/i18n/index.ts`, both `vi` and `en`)
| Key | vi | en |
|---|---|---|
| `nav.analytics` | Phân tích | Analytics |
| `analytics.title` | Phân tích & chỉ số | Analytics & KPIs |
| `analytics.kpiSubmissions` | Bài nộp | Submissions |
| `analytics.kpiSubmissionRate` | Tỷ lệ nộp | Submission rate |
| `analytics.kpiAvgScore` | Điểm trung bình | Average score |
| `analytics.kpiPronunciation` | Phát âm trung bình | Avg pronunciation |
| `analytics.kpiPendingReview` | Chờ duyệt | Pending review |
| `analytics.kpiCost` | Chi phí LLM | LLM cost |
| `analytics.unitPercent` | % | % |
| `analytics.unitUsd` | USD | USD |
| `analytics.trendSubmissions` | Bài nộp theo thời gian | Submissions over time |
| `analytics.trendScore` | Điểm trung bình theo thời gian | Average score over time |
| `analytics.trendCost` | Chi phí theo thời gian | Cost over time |
| `analytics.classPerformance` | Hiệu suất theo lớp | Performance by class |
| `analytics.dimensionBreakdown` | Điểm theo từng tiêu chí | Score by dimension |
| `analytics.pendingBacklog` | Tồn đọng chờ duyệt | Review backlog |
| `analytics.pendingOldest` | Chờ lâu nhất: {{hours}} giờ | Oldest waiting: {{hours}}h |
| `analytics.pendingLink` | Xem danh sách chờ duyệt | View pending list |
| `analytics.bucketDay` | Theo ngày | By day |
| `analytics.bucketWeek` | Theo tuần | By week |
| `analytics.avgScore` | Điểm TB (%) | Avg score (%) |
| `analytics.gradedCount` | Số bài đã chấm | Graded count |
| `analytics.axisDate` | Ngày | Date |
| `analytics.axisCount` | Số bài | Count |
| `analytics.axisScorePct` | Điểm (%) | Score (%) |
| `analytics.axisCostUsd` | Chi phí (USD) | Cost (USD) |
| `analytics.empty` | Không có dữ liệu trong khoảng thời gian này | No data for this period |
| `analytics.scoreEmpty` | — chưa có bài chấm | — no gradings yet |
(Reuse existing `reports.from`, `reports.to`, `reports.dateRange`, `reports.class`, `reports.rate`, `reports.dimension` — do not duplicate.)

## Assumptions
1. Access tier admin+staff (no `adminOnly`), matching `/reports` (phân hệ 4). [PM assumption 1]
2. New separate `/analytics` page + nav entry (not merged into `Reports.tsx`). [PM recommendation]
3. "On-time %" is **out of scope** — no per-student due date exists; only `AssignmentCalendar` (global expected-days). Submission rate covers "did they submit". [PM open question #1 — proceeding without on-time]
4. Bucket day↔week threshold fixed at 60 days (server-forced) so QA can assert it; the exact number is a product-set value here, not left to frontend.
5. Score metrics normalized to % of band max (BR-02) — chosen over raw averages because raw is meaningless across mixed band scales.

## Open questions (non-blocking)
1. **On-time %** remains undefined (needs an owner-supplied "on time" rule before it can be built). Not blocking F7 — shipping submission-rate only, per PM. Escalate only if the owner insists on-time specifically is required.
2. Whether the owner wants the analytics view exportable (US5, Could) — deferred; reuses `toCsv`/`toXlsxBuffer` trivially if requested later. Not built in the baseline.

Neither blocks Dev/QA starting on FR-01..FR-06.

## Outputs (what this role produced)
- This spec: FR-01..FR-06, NFR-01..NFR-05, BR-01..BR-05, data dictionary, i18n keys, ACs (tagged unit vs browser).
- API contract (5 endpoints under `/analytics/*` in the `reports/` module): `GET /analytics/kpis`, `/analytics/trends`, `/analytics/class-performance`, `/analytics/dimension-breakdown`, `/analytics/pending-review` — shapes above.

## Blockers / open questions
See "Open questions" above — both non-blocking.

## Notes for the next role
- **Backend:** add an `AnalyticsController` + new methods on the existing `ReportsService` (reuse `submissionRate()`, `cost()`, `dimensionScore()`, `UNASSIGNED_CLASS`, `parseRange()`). Fetch each grading's `band_scale` via `Criteria.rubric` — prefetch a `criteriaId→bandMax` map to avoid N+1. Guard EVERY division (NFR-01). Jest-seed the AC scenarios, especially the zero-data / cross-band ones (AC-01.4, AC-01.7, AC-01.8, AC-02.3).
- **UX/Frontend:** build exactly two hand-authored SVG chart primitives (`LineChart`, `BarChart`) + stat tiles from F3 `Card`; new `/analytics` page (not `adminOnly`) + nav item; empty states everywhere (AC-06.4). No new npm chart dependency.
- **QA:** ACs are pre-tagged `(unit)` = core-api jest on the service (assert exact numbers incl. zero/boundary/cross-band) vs `(browser)` = render/empty-state. The whole NFR-01 no-NaN/no-crash surface is the priority test target.

## Handoff to Design + Dev + QA
F7 analytics is 5 additive read-only endpoints under `/analytics/*` in the existing `reports/` module (`kpis`, `trends`, `class-performance`, `dimension-breakdown`, `pending-review`; SessionAuthGuard admin+staff) feeding a new `/analytics` page with 6 KPI stat tiles + two hand-authored SVG chart primitives (LineChart, BarChart). All metrics computed from existing columns (`Submission.kind/receivedAt/status`, `Grading.scores.<dim>.score` normalized to % of `Criteria.rubric.band_scale` max, `CostLog.estUsd`); homework = audio/video only; scores band-normalized; backlog is a live snapshot. No schema change, no new npm dependency, `/reports/*` frozen. Zero-data/division-by-zero must render clean zeros/dashes — never NaN. On-time % dropped (no due-date data).
