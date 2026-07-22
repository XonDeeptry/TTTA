<!--
  Per-feature-per-role task file, OWNED by the FRONTEND agent for F6.
-->

# F6 · Frontend — Real-time submission status via SSE

- **Owner role:** frontend
- **Feature:** F6 — Wire live `submission.status` SSE events into `Submissions.tsx` (in-place badge swap) and `SubmissionDetail.tsx` (full refetch), via a reusable `useSubmissionEvents` hook. Additive only, no regression to existing manual-refresh baseline.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F6-ux.md`, `docs/dev-team-roles/tasks/F6-ba.md`, `docs/dev-team-roles/tasks/F6-backend.md`

## Inputs (what this role received)

- `F6-backend.md` — live endpoint `GET /api/events/submissions`, session-cookie auth, named event `submission.status`, `data:{submissionId,status,at}`, heartbeat `: ping` 25s, no replay.
- `F6-ux.md` — instant in-place badge swap on list (no animation/reorder/scroll), full `load()` refetch on detail match, NO connection indicator, NO new i18n keys, NO `aria-live`.
- `F6-ba.md` — hook spec (§3), fallback mandatory (§4/AC-16), frontend ACs 13-15 (unit, no test infra present in dashboard package.json — noted as a gap, not blocking build).
- Code read: `src/pages/Submissions.tsx`, `src/pages/SubmissionDetail.tsx`, `src/api/client.ts`, `src/i18n/index.ts` (not yet re-read for parity check).

## Checklist

- [x] Read protocol + template + upstream F6-ux/ba/backend
- [x] Read Submissions.tsx, SubmissionDetail.tsx, api/client.ts
- [x] Create `src/hooks/useSubmissionEvents.ts`
- [x] Wire into `Submissions.tsx` (in-place status mutation, no reload for loaded rows; `load()` for unloaded/new)
- [x] Wire into `SubmissionDetail.tsx` (call `load()` on matching id)
- [x] Confirm zero new i18n keys added; vi/en parity unchanged
- [x] Docker build (tsc+vite) clean, 0 errors
- [x] Clean up node_modules/dist/tsbuildinfo after build
- [x] Set Status DONE, fill Outputs

## Outputs

### Files changed
- NEW `services/dashboard/src/hooks/useSubmissionEvents.ts` — `useSubmissionEvents(onEvent)` hook: opens `new EventSource('/api/events/submissions')`, listens for named event `submission.status`, `JSON.parse`s frame data (parse errors swallowed, never throw), calls `onEvent` via a ref (so callback identity changes don't reopen the connection), `es.close()` on unmount, no-ops if `EventSource` is undefined (feature-detect). No reconnect logic — relies on native browser auto-reconnect per F6-ux/ba.
- EDIT `services/dashboard/src/pages/Submissions.tsx` — subscribes via the hook; on a matching event mutates `data.items[idx].status` in place via `setData` (no reorder, no scroll/focus change, existing `Badge`/`STATUS_BADGE_VARIANT` just re-renders with the new color); if the row isn't in the currently loaded page, falls back to the existing `load()` to reconcile (matches manual-refresh behavior for out-of-view rows).
- EDIT `services/dashboard/src/pages/SubmissionDetail.tsx` — subscribes via the hook filtered to `evt.submissionId === Number(id)`; on match calls the existing `load()` (full refetch — surfaces new scores/feedback/sentAt alongside the status change, per F6-ux §2). Non-matching events are a no-op.
- No changes to `src/i18n/index.ts` (per F6-ux §5, zero new keys — verified via `git diff --stat` that this feature's commits don't touch it; a pre-existing unrelated F4/F5 i18n diff was present in the working tree before this task started and was left untouched).
- No new dependency added (`EventSource` is browser built-in); `package.json`/`package-lock.json` untouched.

### Verification
- `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/TTTA/services/dashboard:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"` → `tsc -b && vite build` clean, 0 TS errors, Vite build succeeded (83 modules, `dist/` produced). `node_modules/`, `dist/` removed afterward; no `.tsbuildinfo` left in the service root.
- Code-level check of both pages against F6-ux §1/§2: no animation/highlight/transition added, no row reordering, no scroll/focus side effects — `Submissions.tsx` mutation is a plain array-index replace inside `setData`; `SubmissionDetail.tsx` reuses the pre-existing `load()` path unchanged.
- Fallback (F6-ux §4 / F6-ba AC-16): the hook is strictly additive — both pages' original mount-time `load()` and all existing action handlers (`saveReview`/`send`/`deleteMedia`, pagination, filter change) are untouched; if `EventSource` never connects, both pages behave exactly as before this feature.
- No connection indicator, no `aria-live`, no `events.*` i18n keys added — matches F6-ux §3/§5/§6 exactly.

## Blockers / open questions

None blocking. Dashboard has no test runner configured (no jest/vitest in package.json) — F6-ba's [unit]-tagged frontend ACs (13-15) cannot be automated here; verified by code inspection + build only. Flagging for QA.

## Notes for the next role

QA: verify AC-13/14/15/16 manually per F6-ba §6 (no automated dashboard test suite exists in this repo to encode them).
