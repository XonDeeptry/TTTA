# F3 · PM — Dashboard UI redesign (English Center Management look)

- **Owner role:** pm
- **Feature:** F3 — Reskin all 9 dashboard pages + shell with Tailwind + shadcn/ui. UI-only, no backend changes.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** — (feature request direct from project owner)

> Written by the orchestrator from the pm agent's output: the `pm` role agent is read-only
> (Read/Grep/Glob only) and cannot Write its own task file.

## Inputs (what this role received)

Owner request: "Redesign the UI for this app matching English Center Management system. Treat this as a UI-only feature: UX produces a new design spec via ui-ux-pro-max, frontend re-implements, QA verifies existing functionality still passes. No backend changes."

Owner decisions locked before PM ran:
- Styling stack = **Tailwind CSS + shadcn/ui**.
- Visual direction chosen by UX via the `ui-ux-pro-max` skill (no owner-supplied brand colors).
- UI-only; no API/schema/contract changes.

## Checklist

- [x] Read all 9 pages + `App.tsx` + `i18n/index.ts` to size the work
- [x] Produce prioritized story list with testable acceptance criteria
- [x] Define a reusable "Definition of Done" for a reskinned page
- [x] Flag risks and out-of-scope items

## Outputs

**11 stories (MoSCoW):**

| # | Story | Priority |
|---|---|---|
| S1 | Tailwind + shadcn/ui build foundation | Must |
| S2 | App shell reskin (nav + `ProtectedShell`) | Must |
| S3 | Login reskin | Must |
| S4 | Settings reskin | Must |
| S5 | Onboarding reskin | Must |
| S6 | Students reskin (search + inline per-row edit) | Must |
| S7 | Submissions list reskin (status filter) | Must |
| S8 | Submission Detail reskin (**incl. F2 pilot read-only constraint**) | Must |
| S9 | Reports reskin (export links) | Should |
| S10 | Criteria reskin (raw multipart upload) | Should |
| S11 | Monitoring reskin | Should |

**Definition of Done (per reskinned page):** redesign applied via Tailwind + shadcn; every pre-existing interaction identical (same API method/URL/payload, same conditional rendering, role checks, empty/loading states); every pre-existing i18n key still used and resolving in vi + en, no hardcoded user-facing strings; `tsc -b && vite build` clean via the containerized build; no new console errors.

**Out of scope:** any backend/API/schema change; new pages/routes/features; dark mode; new test framework or visual-regression tooling; changing the post-login/default redirect (`/students`); making the F2 pilot panel interactive.

## Blockers / open questions

— (none; assumptions stated below)

## Assumptions

1. "English Center Management system" is directional (education/school-admin conventions: sidebar nav, data tables, status badges, card summaries), not a supplied mockup. UX picks the concrete system; nav may move from top bar to sidebar provided routes and role-based visibility are preserved.
2. Default/post-login redirect stays `/students`; no new home/overview page (scope creep).
3. shadcn components are **hand-authored** into `src/components/ui/` — `npx shadcn add` needs network + interactive Node, conflicting with the "no Node on the dev machine" constraint and the one-shot container build. Only the primitives the 9 pages need (Button, Input, Textarea, Table, Badge, Select, Card, Alert).
4. No dark mode, no visual-regression tooling, no new test framework.
5. "UI-only" read literally: zero change to any `/api/*` URL, method, payload, header, or cookie behavior.

## Risks flagged for downstream roles

1. **Dependency footprint on the RAM-limited Docker build** — smoke-test the container build as S1's own exit criterion, not at the end.
2. **shadcn CLI incompatible with this environment** — hand-author component source.
3. **F2 pilot-panel read-only is a product-safety rule**, not just a regression risk — QA must explicitly assert absence of interactive controls there.
4. **Two easily-broken subtle patterns:** Criteria's raw multipart `fetch` (deliberately bypasses `api/client.ts` so the browser sets the boundary) and the plain `<a href>` / native `<audio src>` cookie-auth pattern (Reports exports, media player). Neither may be "improved" into a JS fetch+blob.
5. **No automated UI test suite exists** — QA regression is manual/scripted against the live stack; expect this to dominate verification time.

## Notes for the next role

BA: consolidate a precise per-page **behavior inventory** (every API call, conditional render, role gate, i18n key) — that inventory is what QA will regression-test against, since there is no automated dashboard suite. UX: the 9 pages reduce to ~4 reusable patterns (auth form, data table + filters, detail/review page, config/form page) — design those, not 9 bespoke screens.
