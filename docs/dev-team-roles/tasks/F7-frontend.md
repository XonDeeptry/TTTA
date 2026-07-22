<!--
  Per-feature-per-role task file, OWNED by the Frontend agent for F7.
  Only the frontend agent writes this file. QA READS it.
-->

# F7 · Frontend — Analytics dashboard page (dashboard SPA)

- **Owner role:** frontend
- **Feature:** F7 — New `/analytics` page (admin+staff) consuming 5 read-only `/analytics/*` endpoints: 6 KPI stat tiles, two hand-authored SVG chart primitives (LineChart, BarChart), breakdown widgets, pending-review backlog strip. No new npm dependency.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F7-ux.md`, `docs/dev-team-roles/tasks/F7-ba.md`, `docs/dev-team-roles/tasks/F7-backend.md`

## Inputs (what this role received)
- F7-ux.md: full layout spec (§1), StatTile spec (§2), LineChart primitive spec (§3), BarChart primitive spec (§4), widget-to-endpoint mapping (§5), pending-review strip spec (§6), date-range/bucket control (§7), states table (§8), a11y notes (§9), i18n key confirmation (§10, no new keys).
- F7-ba.md: exact i18n key list/table (source of truth for copy), ACs (browser ones: AC-02.5, AC-05.3, AC-06.1..06.4).
- F7-backend.md: live endpoint response shapes for all 5 `/analytics/*` routes (matches BA contract, confirmed implemented + tested).
- Code read: `Reports.tsx` (date-range JSX pattern), `App.tsx` (route/nav pattern), `components/ui/{card,table,badge,alert,select-native,button}.tsx`, `api/client.ts`, `components/icons.tsx`, `i18n/index.ts`, `index.css` (HSL CSS vars: --primary teal, --warning amber, --border, --muted-foreground, --popover).

## Checklist
- [x] Read upstream task files + supporting code
- [x] Add analytics.* + nav.analytics i18n keys (vi+en) from F7-ba.md's table
- [x] Add `IconAnalytics` to `components/icons.tsx`
- [x] Build `components/charts/LineChart.tsx` (hand-authored SVG, per F7-ux §3)
- [x] Build `components/charts/BarChart.tsx` (hand-authored SVG, vertical+horizontal, per F7-ux §4)
- [x] Build `pages/Analytics.tsx` (KPI row, trend row, full-width score chart, breakdown row, pending-review strip)
- [x] Wire `App.tsx` route (`/analytics`, no adminOnly) + nav item
- [x] Verify every numeric render guarded (no NaN/null/undefined literal)
- [x] Docker build (tsc+vite) clean
- [x] i18n vi/en parity audit (equal key sets, no dead keys, no undefined keys, no hardcoded strings)
- [x] Set Status DONE, fill Outputs

## Outputs

### Files changed
- `services/dashboard/src/i18n/index.ts` — added `nav.analytics` + 24 `analytics.*` keys (vi+en), verbatim from F7-ba.md's table.
- `services/dashboard/src/components/icons.tsx` — added `IconAnalytics` (bar-chart glyph, same IconBase convention).
- `services/dashboard/src/components/charts/LineChart.tsx` — new hand-authored SVG line chart primitive (figure/figcaption/title a11y layers, null-gap handling, sparse x-labels, hover+focus tooltip, reserved-height empty state).
- `services/dashboard/src/components/charts/BarChart.tsx` — new hand-authored SVG bar chart primitive (vertical + horizontal orientations, `highlightWorst` amber flag on lowest bar, hover+focus tooltip, reserved-height empty state).
- `services/dashboard/src/pages/Analytics.tsx` — new page: date-range+bucket control row, 6 KPI `Card` tiles, submissions LineChart + cost BarChart row, full-width avg-score LineChart, dimension-breakdown BarChart + class-performance BarChart/Table row, pending-review backlog strip (separate unfiltered fetch). Loading/error/empty states per widget, all numeric renders null/NaN-guarded.
- `services/dashboard/src/App.tsx` — added `/analytics` route (`ProtectedShell` without `adminOnly`) + `nav.analytics` nav item (unconditional block, alongside students/submissions/reports/criteria).

### Verification
- Docker build (`node:24-alpine`, `npm ci && npm run build`): tsc + vite clean, 0 errors, twice (before/after wiring axis-label + unit keys). `node_modules`/`dist`/tsbuildinfo removed after each run.
- i18n parity audit (scripted, not eyeballed): vi/en have identical key sets — **179 keys each, 0 only-in-vi, 0 only-in-en**. Of the 27 `analytics.*` keys (incl. `nav.analytics`), all 27 are referenced via `t()` in `Analytics.tsx`/`App.tsx` — **0 unused, 0 referenced-but-undefined**. Wired `axisDate`/`axisCount`/`axisScorePct`/`axisCostUsd` into the new `LineChart.axisYLabel`/`BarChart.axisValueLabel` props (accessible label, sr-only + `<title>`) and `unitPercent`/`unitUsd` into the KPI/chart value formatters, so no key went dead (this is the exact class of issue F4 lost a QA round on).

## Blockers / open questions
—

## Notes for the next role
**QA**: exercise `/analytics` as a staff (non-admin) user to confirm AC-06.2; verify date-range changes refetch KPI/trends/breakdown but NOT the pending-review strip (AC-06.3); test a brand-new/empty-data account for AC-06.4 (every tile/chart shows a clean empty render, never NaN/null/undefined text); confirm the pending-review "view list" link goes to `/submissions?status=awaiting_review` (AC-05.3).
