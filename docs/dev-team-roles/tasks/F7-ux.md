<!--
  Per-feature-per-role task file, OWNED by the UX agent for F7.
  Only the UX agent writes this file. Frontend/QA READ it.
-->

# F7 · UX — Analytics dashboard: KPI cards, trends, education-fit widgets

- **Owner role:** ux
- **Feature:** F7 — Design spec for the new `/analytics` page (admin+staff): 6 KPI stat tiles, 3 trend charts, 2 breakdown widgets, pending-review backlog strip. Two hand-authored SVG chart primitives, no new dependency.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F7-ba.md`, `docs/dev-team-roles/tasks/F7-pm.md`, `docs/dev-team-roles/tasks/F3-ux.md`

## Inputs (what this role received)

- **F7-ba.md**: 5 endpoints (`/analytics/kpis`, `/trends`, `/class-performance`, `/dimension-breakdown`, `/pending-review`), exact response shapes, the 6 KPI fields, 3 trend series (submissions/score/cost, day|week bucket, 60-day server-forced threshold), 2 breakdown arrays (class-performance sorted worst-first, dimension-breakdown sorted weakest-first), pending-review snapshot (not range-filtered), the full i18n key list (vi/en), and NFR-01 (no NaN/throw on zero data — every tile/chart needs a defined empty rendering).
- **F7-pm.md**: layout recommendation (KPI row → trend row → breakdown row → backlog strip), hand-authored-SVG-only chart decision (no npm chart lib), `/analytics` as a new page not merged into Reports.
- **F3-ux.md** (design system, reused verbatim): palette (teal `#0D9488` primary / amber `#D97706` warning / green `#16A34A` success / slate neutrals), typography (Inter, `text-h1/h2/h3/body/table-head/caption` scale, `tabular-nums` for numeric cells), spacing/density (`p-6` page padding, `space-y-6` section rhythm, `h-10` table rows), shell/nav pattern (sidebar, admin+staff items unconditional, no `adminOnly`), component inventory (`Card`, `Table`, `Badge`, `Alert`, `SelectNative`), accessibility conventions (focus-visible ring, `role="group"` date-range wrapper, `scope="col"` headers).
- **Code read**: `services/dashboard/src/pages/Reports.tsx` (date-range pattern: two native `<input type="date">` in a `role="group"` div, `daysAgo()` helper, per-widget `Card`), `services/dashboard/src/components/ui/*` (confirmed `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Table` family, `Badge`, `Alert`, no chart primitive exists yet), `App.tsx` (nav item array pattern, `ProtectedShell` without `adminOnly` for admin+staff routes).

## Checklist

- [x] Read F7-ba.md, F7-pm.md, F3-ux.md, Reports.tsx, ui/ primitives, App.tsx
- [x] Design page layout + grid (KPI row, trend row, breakdown row, backlog strip)
- [x] Design `LineChart` SVG primitive spec (props, axes, marks, empty state, hover)
- [x] Design `BarChart` SVG primitive spec (props, axes, marks, empty state, hover)
- [x] Map every tile/chart to its BA endpoint field
- [x] Specify every state (empty/loading/error/success) per widget
- [x] Confirm i18n key reuse from F7-ba.md (no new keys needed)
- [x] Accessibility notes (contrast, chart titles, live-region policy, keyboard)
- [x] Write full spec into Outputs
- [x] Set Status DONE

## Outputs

Full design spec below. One-line summary: new `/analytics` page reusing F3's `Card`/`Table`/`Badge`/`SelectNative` tokens verbatim; 6 KPI `Card` tiles → one `role="group"` date-range bar (Reports.tsx pattern, reused) → 2-up trend row (submissions line, cost bar) → full-width avg-score line → 2-up breakdown row (dimension horizontal bar, class-performance bar/table) → pending-review backlog strip (live snapshot `Card`, not range-filtered). Two new hand-authored SVG primitives: `components/charts/LineChart.tsx` and `components/charts/BarChart.tsx`, single-hue teal series, no legend, reserved height (no layout shift), explicit empty state per chart. All i18n keys reused from `F7-ba.md`'s table verbatim — no additions.

---

### 1. Page layout + grid

Route: `/analytics`, `ProtectedShell` **without** `adminOnly` (admin+staff, matches `/reports`). Nav item added to `App.tsx`'s unconditional block (same tier as `students`/`submissions`/`reports`/`criteria`), using key `nav.analytics` (already in BA's i18n table) and a Phosphor `ChartBar` icon (consistent with the existing icon-per-nav-item convention; F3 uses hand-authored Phosphor-style SVGs — reuse that icon file convention, add `IconAnalytics`).

```
<main id="main-content" className="space-y-6 p-6">
  <h1 className="text-h1">{t('analytics.title')}</h1>

  <!-- date-range bar: identical pattern to Reports.tsx, reused verbatim -->
  <div role="group" aria-label={t('reports.dateRange')} className="flex flex-wrap items-center gap-4">
    <label>...from... <input type="date"/></label>
    <label>...to...   <input type="date"/></label>
    <!-- bucket toggle, day|week, SelectNative — see §5 -->
  </div>

  <!-- 1. KPI row: 6 stat tiles -->
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
    <StatTile ... x6 />
  </div>

  <!-- 2. Two-up trend row -->
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card>submissions/day — LineChart</Card>
    <Card>cost/day — BarChart</Card>
  </div>

  <!-- 3. Full-width avg-score trend -->
  <Card>avg score over time — LineChart, full width</Card>

  <!-- 4. Two-up breakdown row -->
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card>dimension breakdown — BarChart (horizontal)</Card>
    <Card>class performance — BarChart (horizontal) + Table fallback</Card>
  </div>

  <!-- 5. Pending-review backlog strip: full width, live snapshot -->
  <Card>count + oldest-waiting + link</Card>
</main>
```

Grid notes:
- KPI row: `grid-cols-2` mobile (3 rows of 2), `sm:grid-cols-3` (2 rows of 3), `lg:grid-cols-6` (single row) — matches F3's responsive breakpoint philosophy (no new breakpoints introduced).
- Trend/breakdown rows: `grid-cols-1` stacked mobile, `lg:grid-cols-2` desktop — same pattern F3 already uses for SubmissionDetail's two-panel grading cards.
- All charts reserve their pixel height via a fixed-height wrapper (`h-64` desktop / `h-48` mobile) **before** data arrives, so first paint and post-fetch paint are the same box size — no layout shift (explicit accessibility/perf requirement from the brief).

---

### 2. StatTile spec (KPI row — 6 tiles, reuses F3 `Card`, not a new component)

Each tile: `<Card className="p-4">` containing:
- `<p className="text-caption text-muted-foreground">{label}</p>` — the BA i18n key (`analytics.kpiSubmissions` etc.)
- `<p className="text-h1 tabular-nums">{value}{unit}</p>` — big number
- Optional secondary line: `<p className="text-caption text-muted-foreground">{secondary}</p>` (e.g. graded count, or a trend arrow — see semantic color use below)

| Tile | Label key | Value field | Unit | Secondary line | Empty/zero rendering |
|---|---|---|---|---|---|
| Submissions | `analytics.kpiSubmissions` | `kpis.submissions.count` | (none) | — | `0` |
| Submission rate | `analytics.kpiSubmissionRate` | `kpis.submissionRate.ratePercent` | `analytics.unitPercent` | — | `0%` |
| Avg score | `analytics.kpiAvgScore` | `kpis.avgScore.scorePct` | `analytics.unitPercent` | `{{gradedCount}} {analytics.gradedCount}` | value `null` → render `analytics.scoreEmpty` ("— chưa có bài chấm") in place of the number, secondary line omitted |
| Avg pronunciation | `analytics.kpiPronunciation` | `kpis.avgPronunciation.scorePct` | `analytics.unitPercent` | `{{gradedCount}} {analytics.gradedCount}` | same null handling as Avg score |
| Pending review | `analytics.kpiPendingReview` | `kpis.pendingReview.count` | (none) | — (this tile also appears expanded in the backlog strip, §6) | `0`; **not range-filtered** — a small `Badge variant="secondary"` inline reading "live" is NOT in BA's i18n list, so omit any extra label; rely on the strip below for the "not range-filtered" explanation |
| LLM cost | `analytics.kpiCost` | `kpis.cost.totalUsd` | `analytics.unitUsd` | — | `0` (still show `$0.0000`-style formatting consistent with Reports.tsx's cost column, i.e. `.toFixed(4)`) |

States:
- **Loading**: tile renders with the label visible and a blank/em-dash placeholder in the value slot (`—`) rather than `0`, so a genuine zero is never confused with "not yet loaded" — matches F3's "no spinner" convention (plain text swap, no skeleton).
- **Error**: if the KPI fetch fails, the whole KPI row falls back to an `Alert variant="destructive"` above the tiles (reusing F3's `Alert`) with a generic retry-by-reload message; do not show broken/partial tiles.
- **Success/zero-data**: per-field guarding in the table above — every value is guarded against `null`/`NaN` per NFR-01, never rendered raw.

Accessibility: each tile's meaning is carried by **label text + number**, not color — no tile background color coding by value (a low submission rate isn't rendered in red, avoiding an implied threshold BA never specified). The one exception: **pending review** may optionally get a `Badge variant="warning"` around the count only if the backlog strip below flags it stale (see §6) — never on the tile itself, to keep the KPI row visually uniform.

---

### 3. `LineChart` primitive spec — `components/charts/LineChart.tsx`

**Purpose**: trends over time (submissions/day, avg-score-over-time). Single-series only.

**Props:**
```ts
interface LineChartPoint { label: string; value: number | null; }
interface LineChartProps {
  title: string;           // accessible chart title, rendered as <h3 className="text-h3"> above the svg AND as <title> inside the svg
  points: LineChartPoint[]; // dense series, in x order
  axisYLabel: string;      // e.g. t('analytics.axisScorePct') — announced via aria, not painted on tiny mobile widths
  formatValue?: (v: number) => string; // e.g. adds "%" — default identity
  height?: number;          // default 240 (desktop), caller wraps in a fixed-height div regardless
}
```

**Rendering:**
- `<figure>` wrapper (not a bare `<svg>`) so `<figcaption className="sr-only">{title}</figcaption>` gives a text alternative independent of the visual `<h3>` above it (belt-and-suspenders — the visible `<h3>` already names the measure per "no legend needed for single series").
- `viewBox` computed from container width (responsive via a `ResizeObserver`-free approach: percentage-width `<svg width="100%">` with a fixed internal `viewBox="0 0 W H"`, `preserveAspectRatio="none"`) — no new dependency, matches F3's "hand-authored, no lib" mandate.
- Y-scale: linear, domain `[0, max(points.value ignoring null)]` with a small headroom (`*1.1`), floor at `0` — baseline always anchored at `y = height - paddingBottom`.
- X-scale: even spacing across `points.length`, `paddingLeft`/`paddingBottom` reserved for axis labels (~32px each).
- **Gridlines/axis**: 3–4 horizontal gridlines at `0/33/66/100%` of the y-domain, stroke `hsl(var(--border))` at low opacity (`stroke-opacity: 0.6`), `stroke-width: 1` — recessive, never competing with the data line. X-axis: only first/last label plus one midpoint rendered as `<text className="text-caption fill-muted-foreground">` to avoid crowding (BA's dense-bucket series can have up to ~90 points); no per-point tick.
- **The line itself**: single `<path>`, `stroke="hsl(var(--primary))"` (teal, F3 token), `stroke-width="2"`, `fill="none"`, `stroke-linejoin="round"`. Nulls in the series (score bucket with zero gradings) create a **gap** in the path (split into separate subpaths around null runs) rather than interpolating through zero — a null must never visually read as "zero".
- **Direct value labels**: only the **last point** (most recent value) gets a small direct label — `<text>` in `text-caption` teal-adjacent-but-actually-ink color (per rule: text never wears the series color) positioned just above/right of the endpoint marker. No per-point labels.
- **Markers**: no visible dot at rest. On hover/focus (see below) a single circle marker, `r="4"` at rest scaling to `r>=8` (per spec minimum) on hover, `fill="hsl(var(--primary))"`, `stroke="white"`, `stroke-width="2"`.
- **Hover/tooltip** (lightweight, hand-authored): an invisible full-height `<rect>` per point-slot (or one pointer-tracking overlay `<rect>` with `onMouseMove` computing nearest index) that on hover/focus shows (a) the marker at that x, and (b) a small `<g>` tooltip box (`rect` + `text`, `fill="hsl(var(--popover))"`, `stroke="hsl(var(--border))"`) positioned above the point showing `{label}: {formatValue(value)}` or the `analytics.scoreEmpty`/dash text when `value===null`. Keyboard equivalent: the same overlay elements are focusable (`tabIndex=0` per point, or arrow-key stepping across one shared focusable group) so keyboard users get the same tooltip via `:focus` — satisfies "no interactivity beyond native tooltip" from PM while still being keyboard-reachable (a `<title>` on each point is the zero-JS fallback that ships regardless).
- **Empty state**: when every `value` is `null` or the array is empty, render nothing of the axes/line; instead render a centered placeholder inside the same reserved-height box: `<p className="text-body text-muted-foreground">{t('analytics.empty')}</p>` — no broken axis, no zero-height collapse (box keeps its `h-64`).

---

### 4. `BarChart` primitive spec — `components/charts/BarChart.tsx`

**Purpose**: magnitude comparisons — cost/day (vertical bars over time buckets), dimension breakdown and class performance (horizontal bars over categories). Single series only (one hue).

**Props:**
```ts
interface BarChartPoint { label: string; value: number; secondary?: string; } // secondary = optional badge/annotation, e.g. gradedCount
interface BarChartProps {
  title: string;
  points: BarChartPoint[];
  orientation?: 'vertical' | 'horizontal'; // vertical for time-series (cost/day); horizontal for category comparisons (dimension/class)
  axisValueLabel: string;   // e.g. t('analytics.axisCostUsd')
  formatValue?: (v: number) => string;
  highlightWorst?: boolean; // when true (class-performance, dimension-breakdown), the single lowest-value bar gets the warning-amber flag treatment described below
  height?: number;          // default 240 vertical / auto-scales row-height*n horizontal
}
```

**Rendering:**
- Same `<figure>`+`sr-only figcaption` + visible `<h3>` title convention as LineChart (no legend, single series named by the title).
- **Vertical** (cost/day): bars along x = time buckets, y = value. Baseline anchored at `y=0`. Bar fill `hsl(var(--primary))` uniformly (teal) — no per-bar color cycling. Bar width computed from available plot width / bucket count with a small gap (`~30%` of bar-slot as gap, matching typical bar-chart proportion). Same recessive-gridline treatment as LineChart (3–4 horizontal lines). X labels: sparse (first/last/mid), matching LineChart's crowding rule for dense buckets.
- **Horizontal** (dimension-breakdown, class-performance): bars along y = category (one row per dimension/class), x = value, baseline anchored at `x=0` (left edge). Category label (`dimension` or `className`) rendered as a `<text>` at the left of each row in `text-body`/`fill="hsl(var(--foreground))"` (never the series color). Row height fixed (~28-32px) so the chart's total height scales with category count (reserve height = `rows * rowHeight + padding` computed once from the points count so no shift when data loads — the initial reserved height should assume a sane max, e.g. cap visual rows at 8 with internal scroll if BA data returns more classes, matching F3's `overflow-x-auto`-for-tables precedent — here `overflow-y-auto` on the chart's wrapper if row count is large).
- **Value labels**: the notable bar only — for horizontal charts, every bar's value **is** effectively a "notable" data point since there are few categories (≤ ~10), so direct end-of-bar `<text>` labels are acceptable for **all** rows here (this is the one exception to "not every point," justified because dimension/class counts are small, unlike the dense time buckets). For vertical (cost/day, potentially many buckets), follow the sparse rule: label only the single highest-cost bar directly, others rely on hover.
- **`highlightWorst` (semantic color, not decorative)**: when true, the single lowest-`value` bar (already what BA's sort-ascending gives as index 0 for dimension-breakdown and class-performance) gets `fill="hsl(var(--warning))"` instead of teal, plus a small `Badge`-style "needs attention" marker is NOT added as new copy (no BA key for it) — the color shift alone is the signal, reinforced by the row already being sorted first/top. This is the one legitimate use of a semantic (warning) color on a chart mark, per the brief's exception for "worst-first class flagged." All other bars stay the single teal hue.
- **Hover**: same lightweight tooltip pattern as LineChart — invisible per-bar `<rect>` overlay, `<title>` fallback, focusable for keyboard, shows `{label}: {formatValue(value)}` plus `secondary` (e.g. "12 graded") if present.
- **Empty state**: `points.length === 0` or all `value === 0` → same centered `analytics.empty` placeholder inside the reserved-height box, axes/bars suppressed entirely (never a chart with a flat 0-height baseline and no context).

---

### 5. Widget-by-widget mapping to BA endpoint fields

| Widget | Endpoint | Field(s) | Chart/Component | i18n title key | Axis label key(s) |
|---|---|---|---|---|---|
| 6 KPI tiles | `GET /analytics/kpis` | see §2 table | `StatTile` (Card) | per-tile keys (§2) | `analytics.unitPercent`/`unitUsd` |
| Submissions/day | `GET /analytics/trends` | `submissions[]` | `LineChart` (or `BarChart` vertical — recommend **LineChart**, it's a volume-over-time trend per "form follows job") | `analytics.trendSubmissions` | `analytics.axisDate` / `analytics.axisCount` |
| Cost/day | `GET /analytics/trends` | `cost[]` | `BarChart` vertical | `analytics.trendCost` | `analytics.axisDate` / `analytics.axisCostUsd` |
| Avg score over time | `GET /analytics/trends` | `score[]` | `LineChart`, full width | `analytics.trendScore` | `analytics.axisDate` / `analytics.axisScorePct` |
| Dimension breakdown | `GET /analytics/dimension-breakdown` | `[{dimension, avgScorePct, gradedCount}]` | `BarChart` horizontal, `highlightWorst` | `analytics.dimensionBreakdown` | `analytics.axisScorePct` |
| Class performance | `GET /analytics/class-performance` | `[{className, ratePercent, avgScorePct, gradedCount}]` — **two measures per class (rate% and avgScore%) but they are different scales**, so render as **two adjacent horizontal bars per class row is NOT used** (would be a dual-measure chart); instead render **one `BarChart` on `ratePercent`** (submission-rate comparison, matching Reports.tsx's existing table for the raw numbers) plus the existing numeric detail available via hover (`secondary` = `avgScorePct`+`gradedCount`) — keeps "one axis per chart" intact. A `Table` fallback (reusing Pattern B from F3) below/instead-of the chart on narrow viewports shows both columns for anyone who needs the exact numbers. | `analytics.classPerformance` | `analytics.axisCount` (rate is %, reuse `unitPercent` in the value formatter) |
| Pending-review backlog | `GET /analytics/pending-review` | `count`, `oldestWaitingHours`, `oldestSubmissionId` | strip `Card` (§6) | `analytics.pendingBacklog` | — |

Note on class-performance: BA's endpoint returns both `ratePercent` and `avgScorePct` per class — genuinely two different-scale measures. Per the "one axis, never dual-axis" rule, these must not be overlaid on one chart. Resolution: the **bar chart plots `ratePercent`** only (matches the KPI row's own "submission rate" framing and is the more actionable "who isn't submitting" signal for `highlightWorst`); `avgScorePct` is exposed via hover `secondary` text and in the accompanying `Table` (which already has both columns, matching Reports.tsx precedent) — so no data is lost, and no chart improperly dual-encodes.

---

### 6. Pending-review backlog strip (FR-05, live snapshot — not range-filtered)

Full-width `Card`:
- `CardHeader`: `CardTitle` = `analytics.pendingBacklog`.
- `CardContent`, `flex items-center justify-between flex-wrap gap-4`:
  - Left: big number `count` (`text-h1 tabular-nums`) + label `analytics.kpiPendingReview` beneath in `text-caption text-muted-foreground`.
  - Middle: `analytics.pendingOldest` interpolated with `{{hours: oldestWaitingHours}}` — when `count === 0`/`oldestWaitingHours === null`, this line is **omitted entirely** (not rendered as "Oldest waiting: null h") — the empty/zero-data guard.
  - Right: `<Link to={`/submissions?status=awaiting_review`}>` styled `Button variant="outline" size="sm"` with text `analytics.pendingLink` — always rendered (even at `count===0`, since staff may still want to check the filtered list; alternatively can be `disabled`-styled at zero, but BA's AC-05.3 only requires the link exists, so render it unconditionally, unstyled-disabled).
- **Staleness flag (semantic color use)**: if `oldestWaitingHours` exceeds a reasonable ops threshold, the count number gets wrapped in `Badge variant="warning"` instead of plain text — **no BA-specified threshold exists**, so this is flagged as a UX judgment call, not a hard requirement: recommend 48h (matches the domain's own "48h window" concept elsewhere in the system, an easy mnemonic) as a soft visual cue only; if Frontend/PM prefer no threshold at all (since BA didn't specify one), the plain-text rendering (no badge) is equally valid and safer — **do not invent new copy for this**, only a color/Badge wrapper on the existing number.
- Not range-filtered: this Card's content **never changes when the date-range inputs above change** — confirmed by NOT wiring its fetch into the `[from, to]` effect dependency array; it fetches once on mount and can optionally poll every N minutes (out of scope per PM's US6 — a manual reload is sufficient, matching F3's "no live-update" precedent elsewhere in the dashboard).

---

### 7. Interaction: date-range + bucket control row

Reuses `Reports.tsx`'s exact pattern (`role="group" aria-label={t('reports.dateRange')}`, two `<input type="date">`, `daysAgo()` default of 30 days) — no new component. One addition: a `bucket` toggle (`day`/`week`) for the trends endpoint, using the existing `SelectNative` primitive (F3 §4), keys `analytics.bucketDay`/`analytics.bucketWeek`. Behavior:
- Default `day`; if the resulting range from `from`→`to` exceeds 60 days, the toggle should reflect server-forced `week` (BA FR-02) — recommend the frontend disables/greys the `day` option (not hides it) once the range exceeds 60 days, with the `SelectNative`'s `disabled` attribute on that `<option>`, so the control never silently disagrees with what the server actually returned (avoids a UI/data mismatch where the toggle says "day" but the payload's `bucket` field is `"week"`). Simpler alternative if Frontend prefers zero client-side prediction logic: always trust and render the response's own `bucket` field as a read-only `<Badge variant="secondary">` label next to the toggle (e.g. "week" shown after fetch) rather than trying to pre-disable the option — either is acceptable; the hard requirement is **never display a bucket label that contradicts the actual response**.
- Changing `from`/`to`/`bucket` refetches FR-01..FR-04 (KPIs, trends, class-performance, dimension-breakdown); the pending-review strip is excluded from this refetch trigger (§6).

---

### 8. States summary (every widget, all 4 states)

| Widget | Empty | Loading | Error | Success |
|---|---|---|---|---|
| KPI tiles | `0`/`0%`/`$0.0000`/`analytics.scoreEmpty` per field guard (§2) | `—` placeholder, no spinner | Row-level `Alert variant="destructive"` above tiles | Guarded numeric render, `tabular-nums` |
| Trend LineChart/BarChart | Centered `analytics.empty` text inside reserved-height box | Reserved-height box, blank axes suppressed until data resolves (same "no skeleton" convention as F3 — just don't render axes/line until first response, avoid a flash of an empty-looking chart with axes but no line) | Small inline `Alert variant="destructive"` inside that chart's `Card`, chart area collapses to the same empty-state message | Full chart per §3/§4 |
| Dimension/class breakdown | `analytics.empty` | same as above | same as above | Bars per §4, `highlightWorst` applied |
| Pending-review strip | `count=0` renders number only, oldest line omitted (§6) | `—` placeholder | `Alert` inline in the Card | Full content per §6 |

No widget ever renders `NaN`/`null`/`undefined` literally — every numeric render goes through the guards above, mirroring BA's NFR-01 at the presentation layer.

---

### 9. Accessibility notes

- **Color never sole carrier of meaning**: KPI tiles carry meaning via label+number only (§2); the one `highlightWorst` bar and the optional pending-review staleness badge are the only chart/tile elements using semantic color, and both are reinforced by non-color cues (sort order for `highlightWorst`, explicit hour count for staleness) — never color alone.
- **Chart accessible titles**: every `LineChart`/`BarChart` instance has both a visible `<h3>` (serves as the de-facto legend since these are single-series) and an `sr-only` `<figcaption>` plus an inner `<title>` element in the SVG — three redundant but standard text-alternative layers, matching typical accessible-SVG-chart guidance.
- **Live region policy**: none of these widgets need `aria-live` at all under the default (manual date-range refetch, no auto-polling backlog per §6) — if Frontend does add a polling refresh for the pending-review strip later, use `aria-live="polite"` on just the count text, never `"assertive"`, so control isn't wrestled from the user's screen reader mid-task.
- **Contrast**: reuses F3's verified pairs — teal primary line/bar (`#0D9488`) on white background card clears AA for graphical objects (3:1 minimum for non-text UI components, and this exceeds it); warning amber (`#D97706`) on white for the `highlightWorst` bar and staleness badge also already verified in F3-ux.md §8.
- **Touch targets**: hover/focus tooltip trigger areas on chart marks should have an invisible hit-area of at least 24x24px (larger than the visual 2px line/thin bar) even though desktop-mouse is the primary target per F3's density note — cheap to add via a transparent overlay `<rect>`/`<circle>` sized independently of the visual mark, and helps any touch/tablet staff usage.
- **Keyboard nav**: date inputs, bucket `SelectNative`, and the "view pending list" link follow normal tab order after the KPI tiles (tiles are non-interactive, not in tab order); chart hover targets are the only new focusable elements — implement as a single group of tab-stops per chart (one per data point/bar) so keyboard users can step through values via Tab, each exposing its tooltip content via `:focus` (§3/§4) — bounded so a 90-point dense series doesn't add 90 tab stops to the page: acceptable simplification is one shared focusable "chart region" (`tabIndex=0`, `role="img"`, `aria-label` = title + a plain-text data summary) with the visual point-by-point hover reserved for mouse-only interaction, if Frontend judges 90 individual tab-stops impractical. Recommend the simplification for dense day-bucket series; the low-cardinality horizontal bar charts (≤10 rows) can keep per-bar focusable stops without concern.

---

### 10. i18n keys

All keys used above are exactly BA's list in `F7-ba.md` (`analytics.title`, `analytics.kpi*`, `analytics.unitPercent`/`unitUsd`, `analytics.trend*`, `analytics.classPerformance`, `analytics.dimensionBreakdown`, `analytics.pendingBacklog`/`pendingOldest`/`pendingLink`, `analytics.bucketDay`/`bucketWeek`, `analytics.avgScore`, `analytics.gradedCount`, `analytics.axis*`, `analytics.empty`, `analytics.scoreEmpty`, `nav.analytics`) plus the existing reused `reports.dateRange`/`reports.from`/`reports.to`. **No new key needed.**

## Blockers / open questions

- None blocking. Two judgment calls flagged for Frontend/PM to confirm (not gating): (1) the 48h staleness-badge threshold on the pending-review count (§6) has no BA-specified value — safe to ship without the badge if preferred; (2) the bucket-toggle vs. server-forced-week UI reconciliation (§7) — either the disable-on-60-days or the trust-the-response-badge approach is acceptable.

## Notes for the next role

**Frontend**: build exactly two new files, `components/charts/LineChart.tsx` and `components/charts/BarChart.tsx`, per §3/§4 — no charting library, hand-authored SVG only. New page `pages/Analytics.tsx` following the layout in §1, reusing `Card`/`Table`/`Badge`/`SelectNative`/`Button` from `components/ui/`, and the exact date-range JSX pattern already in `Reports.tsx` (do not re-derive it). Wire the KPI row to `GET /analytics/kpis`, trend row + full-width score chart to `GET /analytics/trends`, breakdown row to `GET /analytics/class-performance` + `GET /analytics/dimension-breakdown`, and the backlog strip to `GET /analytics/pending-review` fetched independently of the date-range effect (§6). Add `nav.analytics` to `App.tsx`'s unconditional nav-item array (not the admin-only block) with a new hand-authored `IconAnalytics` following the existing per-nav-item icon convention. Every numeric render must go through the null/zero guards in §8 — this is the QA hard-gate (mirrors BA's NFR-01/AC-06.4).

## Handoff to Design + Dev

F7 UX spec: new `/analytics` page (admin+staff, no `adminOnly`), 6 `Card`-based KPI stat tiles, two hand-authored SVG chart primitives (`LineChart` for submissions/day + avg-score-over-time, `BarChart` for cost/day + dimension-breakdown + class-performance), single teal hue per chart with a solitary warning-amber "worst" bar exception, no legends (single series), reserved chart heights (no layout shift), full empty/loading/error/success states specified per widget with zero-data guards mirroring BA's NFR-01, reused F3 tokens/components/date-range pattern verbatim, all i18n keys reused from F7-ba.md with none added.
