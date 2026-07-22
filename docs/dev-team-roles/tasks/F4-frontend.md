<!--
  Per-feature-per-role task file, OWNED by the Frontend agent.
  docs/dev-team-roles/tasks/F4-frontend.md
-->

# F4 · Frontend — Forced password change on first login (dashboard SPA)

- **Owner role:** frontend
- **Feature:** F4 — `AuthContext.changePassword`, `/change-password` page, `ProtectedShell` gate precedence, i18n vi/en.
- **Status:** DONE
- **Last updated:** 2026-07-22 (fix round 1)
- **Depends on:** `docs/dev-team-roles/tasks/F4-ux.md`, `docs/dev-team-roles/tasks/F4-backend.md`, `docs/dev-team-roles/tasks/F4-ba.md`, `docs/superpowers/specs/2026-07-22-forced-password-change-design.md`

## Inputs (what this role received)

- F4-ba.md §2.7-2.9: `CurrentUser.mustChangePassword`, `AuthContext.changePassword(current,new)` action, exact `ProtectedShell` gate precedence (`loading`→`!user`→`mustChangePassword`→`adminOnly`), new non-ProtectedShell route, `Login.tsx`'s `navigate('/settings')` line stays untouched.
- F4-backend.md: live API contract — `POST /auth/login`/`GET /auth/me` now include `mustChangePassword`; new `POST /auth/change-password` → 200 `{email,role,mustChangePassword:false}` / 401 wrong-current / 401 no-session / 400 validation (mentions "must differ" for same-as-current).
- F4-ux.md: exact page layout (Card max-w-sm, 3 password fields, single Alert slot, disabled-while-in-flight submit, autoComplete hints, focus-to-current-password-field on 401), i18n key table (9 keys), client validation order (mismatch check before same-as-current check before API call).

## Checklist

- [x] Read protocol + upstream task files (ux, backend, ba)
- [x] Read current AuthContext.tsx, App.tsx, Login.tsx, i18n/index.ts, api/client.ts
- [x] Create this task file (IN_PROGRESS)
- [x] `AuthContext.tsx`: `CurrentUser.mustChangePassword`, `changePassword` action
- [x] `pages/ChangePassword.tsx`: new page component
- [x] `App.tsx`: register `/change-password` route (sibling of `/login`), insert gate precedence in `ProtectedShell`, add `useLocation`
- [x] i18n: add 9 `changePassword.*` keys to vi + en
- [x] Docker build (tsc+vite) clean, 0 errors
- [x] Verify i18n vi/en key parity
- [x] Clean up node_modules/dist/tsbuildinfo
- [x] Fill Outputs, set Status DONE

## Fix round (QA round 1 FAIL — D1, D2 assigned to frontend; D3 is backend's)

- [x] D1: `ChangePassword.tsx` reads `user`/`loading` from `useAuth()`; redirect unauthenticated visitors to `/login` (respect `loading` so a hard-refresh doesn't bounce a legitimately-authenticated user)
- [x] D2: remove dead `changePassword.success` key from vi + en (no toast was built; not required per F4-ux §2)
- [x] Docker rebuild (tsc+vite) clean, 0 errors
- [x] Re-verify i18n vi/en parity + zero dead keys
- [x] Clean up node_modules/dist/tsbuildinfo
- [x] Set Status back to DONE

## Outputs (what this role produced)

### Files changed

- `D:/TTTA/services/dashboard/src/auth/AuthContext.tsx` — **M** — `CurrentUser.mustChangePassword: boolean`; new `changePassword(currentPassword, newPassword)` action (`POST /auth/change-password`, `setUser(response)` on success, no `/auth/me` refetch, no re-login); `AuthState` interface widened.
- `D:/TTTA/services/dashboard/src/pages/ChangePassword.tsx` — **A** — new page, structural near-copy of `Login.tsx`: centered `Card max-w-sm`, 3 `type="password"` fields (current/new/confirm, `autoComplete` hints per F4-ux §4) each `Label`+`Input`, single `Alert variant="destructive" role="alert"` slot cycling `changePassword.mismatch` (client, new≠confirm, checked before same-as-current, no API call) / `changePassword.sameAsCurrent` (client pre-check new===current, and re-shown on server 400) / `changePassword.error` (401 wrong-current or any other error), submit `Button` `disabled={submitting}` guarding a double POST, focus returns to the current-password field via `ref` on any catch branch, success → `navigate('/students', {replace:true})`.
- `D:/TTTA/services/dashboard/src/App.tsx` — **M** — imports `ChangePassword`; new sibling route `<Route path="/change-password" element={<ChangePassword />} />` registered before `/monitoring` (NOT wrapped in `ProtectedShell`); `ProtectedShell` gains `useLocation()` and the new gate clause inserted at the exact F4-ba §2.8 precedence — `loading` → `!user` → `mustChangePassword && pathname !== '/change-password'` → `adminOnly`. `Login.tsx`'s `navigate('/settings')` left untouched (not modified in this task).
- `D:/TTTA/services/dashboard/src/i18n/index.ts` — **M** — added the 9 `changePassword.*` keys (title, currentPassword, newPassword, confirmPassword, submit, mismatch, error, sameAsCurrent, success) verbatim per F4-ba §6, to both `vi` and `en` blocks.

### i18n keys added (9, both vi+en)
`changePassword.title`, `changePassword.currentPassword`, `changePassword.newPassword`, `changePassword.confirmPassword`, `changePassword.submit`, `changePassword.mismatch`, `changePassword.error`, `changePassword.sameAsCurrent`, `changePassword.success`.

### Build/verification results

- `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/TTTA/services/dashboard:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"` → `tsc -b && vite build` clean, **0 errors**, `dist/` produced (287 KB JS gzip 88 KB).
- i18n vi/en key-parity check (scripted set-diff over `src/i18n/index.ts`): **125 keys each side, 0 diff** (no missing/extra keys either direction).
- Post-verification cleanup: removed `node_modules/`, `dist/`, `*.tsbuildinfo` — tree is source-only; `git status --short` in `services/dashboard` shows only the 4 files above as modified/added (no stray build output).

## Fix round Outputs (QA round 1 → D1, D2)

- `D:/TTTA/services/dashboard/src/pages/ChangePassword.tsx` — **M** — destructures `user`/`loading` from `useAuth()` alongside `changePassword`; imports `Navigate` from `react-router-dom`; after all hooks, before the JSX return: `if (loading) return null;` then `if (!user) return <Navigate to="/login" replace />;` — mirrors `ProtectedShell`'s own first two gates (App.tsx:129-130). Unauthenticated visitors now end at `/login` instead of seeing a form that always fails with a misleading "current password incorrect" message. Page stays agnostic to how it was reached and still renders outside nav chrome (no change to that).
- `D:/TTTA/services/dashboard/src/i18n/index.ts` — **M** — removed the unused `changePassword.success` key from both the `vi` and `en` blocks (no toast was built; F4-ux §2 marked it optional/non-blocking). 8 `changePassword.*` keys remain (title, currentPassword, newPassword, confirmPassword, submit, mismatch, error, sameAsCurrent), all referenced.

### Build/verification results (fix round)

- `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/TTTA/services/dashboard:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"` → `tsc -b && vite build` clean, **0 errors**, 81 modules, `dist/` produced.
- Scripted vi/en key-parity re-check: **124/124, zero diff** (125 → 124 after removing the one dead key from both sides, as expected).
- Scripted dead-key check confirms `changePassword.success` no longer defined anywhere; the two other keys the naive regex flagged (`monitoring.diskAlert`, `submissions.pilotProviderModel`) are false positives — both are genuinely used via multi-line `t(key, {interpolation})` call sites unrelated to F4, confirmed by grep.
- Cleanup: removed `node_modules/`, `dist/`, `*.tsbuildinfo`; `git status --short` in `services/dashboard` shows only `App.tsx`, `auth/AuthContext.tsx`, `i18n/index.ts` (modified, from original F4 work) and `pages/ChangePassword.tsx` (added) — tree is source-only.

## Blockers / open questions

None. D3 (false npm claim in `F4-backend.md`) is backend's responsibility, not addressed here.

## Notes for the next role

**QA**: build is clean and i18n keys have parity. Browser-only ACs AC-10..AC-17 from F4-ba.md need the live stack (`docker compose up -d --build`) — no dashboard test harness exists. Key things to exercise: (1) flagged admin login → gate redirects `/settings`→`/change-password` (AC-10); (2) manual nav to any other route while flagged bounces back (AC-11, incl. admin-only routes — gate precedes `adminOnly`); (3) mismatch shows `changePassword.mismatch` with zero network call (check devtools); (4) wrong current password → `changePassword.error`, focus returns to current-password field; (5) success → lands on `/students` with full nav chrome, no re-login; (6) unflagged normal user login is unaffected (regression, AC-16); (7) toggle language switcher (if present) or `i18n.changeLanguage('en')` in devtools to confirm both bundles render.
