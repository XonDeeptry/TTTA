<!--
  Per-feature-per-role task file, OWNED by the Frontend agent.
  docs/dev-team-roles/tasks/F5-frontend.md
-->

# F5 · Frontend — Dashboard user management UI + change-password entry point

- **Owner role:** frontend
- **Feature:** F5 — `/users` admin screen (list/create/reset), sidebar "Change password" entry, conditional Cancel on `/change-password`.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F5-ux.md`, `F5-ba.md`, `F5-backend.md`, `F4-frontend.md`, `F4-ux.md`

## Inputs (what this role received)

- F5-ux.md: full `/users` wireframe (create Card + list Card, own-row note reusing `nav.changePassword`, no new i18n key), sidebar footer "Change password" control spec (state.from), Cancel-only-when-not-forced spec on `/change-password`, single-slot Alert feedback (`role="status"` success / `role="alert"` error).
- F5-ba.md §1/§8.2/§11: exact API contract, exact per-file inventory (5 files), exact i18n key list (27 keys incl. `nav.users`, `nav.changePassword`, `users.*`, `changePassword.cancel`, `common.yes/no`).
- F5-backend.md: live contract — `GET/POST /users`, `POST /users/:id/reset-password`; email stored verbatim (not lowercased); errors mapped by status only (409/400/403/404/other).
- F4-frontend.md / F4-ux.md: `ChangePassword.tsx` as shipped — only two edits permitted (post-success/Cancel target via `location.state.from`, conditional Cancel button).

## Checklist

- [x] Read protocol + all upstream task files
- [x] Read live source: Students.tsx, App.tsx, ChangePassword.tsx, icons.tsx, AuthContext.tsx, api/client.ts, select-native.tsx, alert.tsx, i18n/index.ts
- [x] Add `IconUsers`, `IconKey` to `components/icons.tsx`
- [x] Add 27 i18n keys (vi+en) to `i18n/index.ts`, zero dead keys
- [x] New `pages/Users.tsx` (create form + list + inline reset, own-row note, status/alert feedback)
- [x] `App.tsx`: register `/users` route (adminOnly, before catch-all), admin-only nav item, sidebar footer "Change password" button above Logout
- [x] `ChangePassword.tsx`: use `location.state.from` for success/Cancel target; conditional Cancel button when `!user.mustChangePassword`
- [x] Docker build (tsc+vite) clean, 0 errors
- [x] i18n vi/en parity + zero dead/undefined keys re-check
- [x] Clean up node_modules/dist/tsbuildinfo
- [x] Fill Outputs, set Status DONE

## Outputs (what this role produced)

### Files changed (absolute paths)

- `D:/TTTA/services/dashboard/src/pages/Users.tsx` — **A** — admin-only screen: create-user `Card` (email/role-`SelectNative`/password fields, disabled-while-submitting submit), list `Card` (`Table` email/role/mustChangePassword/createdAt/action columns, empty-state row), inline per-row reset editor (`resettingId`/`resetPassword` draft, own `<form>`, focus moved into the password input on open via `useEffect`, and back to the trigger button via a `Map<id, HTMLButtonElement>` ref on cancel), own-row action cell replaced by a `nav.changePassword`-labelled `<span>` (matched by `email === user.email`), single page-level `Alert` feedback slot (`role="status"`/variant `default` on success, `role="alert"`/variant `destructive` on failure — status-only error mapping via `mapErrorToKey`, mirroring `api/client.ts`'s frozen no-body-parsing contract).
- `D:/TTTA/services/dashboard/src/App.tsx` — **M** — imports `Users`, `IconUsers`, `IconKey`; admin-only `nav.users` item added to `SidebarNav.items[]` (same conditional-spread as `/settings`); new sidebar-footer "Change password" `Button` (ghost variant, icon+label, `aria-label`) inserted between the existing `Separator` and Logout, navigating to `/change-password` with `state:{from: location.pathname}`; `/users` route registered (`ProtectedShell adminOnly`) immediately before the catch-all `<Route path="*">`. `ProtectedShell`'s gate body (lines ~129-136) untouched.
- `D:/TTTA/services/dashboard/src/pages/ChangePassword.tsx` — **M** — two edits only, per F5-ba §8.2: (a) `useLocation()` + `const from = (location.state as {from?:string}|null)?.from`, used for the post-success `navigate(from ?? '/students', {replace:true})`; (b) a `variant="outline" className="w-full"` Cancel `Button` rendered only when `!user.mustChangePassword`, navigating to the same `from ?? '/students'` target with no API call. Everything else on the page (3 fields, mismatch/same-as-current checks, error mapping, `disabled={submitting}`, `loading`/`!user` guards, chrome-less layout) is untouched.
- `D:/TTTA/services/dashboard/src/components/icons.tsx` — **M** — added `IconUsers` (two-head glyph) and `IconKey` (padlock/key outline), both following the existing `IconBase` 20x20/1.5px-stroke convention.
- `D:/TTTA/services/dashboard/src/i18n/index.ts` — **M** — added all 27 keys from F5-ba §11 to both `vi` and `en` blocks (`nav.users`, `nav.changePassword`, `users.*` ×22, `changePassword.cancel`, `common.yes`, `common.no`). No key added beyond that list; own-row note reuses the already-existing `nav.changePassword` key per F5-ux §1.3 default (zero new key there).

**Not modified** (per F5-ba §8.2/§9): `AuthContext.tsx`, `api/client.ts`, `Login.tsx`, `ProtectedShell`'s gate body, `App.tsx`'s catch-all route (still last).

### i18n keys added (27, both vi+en — verbatim from F5-ba §11)

`nav.users`, `nav.changePassword`, `users.title`, `users.create`, `users.email`, `users.role`, `users.roleAdmin`, `users.roleStaff`, `users.password`, `users.submit`, `users.created`, `users.mustChangePassword`, `users.createdAt`, `users.reset`, `users.newPassword`, `users.resetConfirm`, `users.resetCancel`, `users.resetDone`, `users.emailExists`, `users.invalid`, `users.notFound`, `users.forbidden`, `users.error`, `users.empty`, `changePassword.cancel`, `common.yes`, `common.no`.

### Build / verification results

- `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/TTTA/services/dashboard:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"` → `tsc -b && vite build` clean, **0 errors**, 82 modules, `dist/` produced (294.57 kB JS, gzip 90.25 kB).
- Scripted vi/en key-parity check over `src/i18n/index.ts`: **151/151 keys each side, 0 diff** (124 pre-F5 + 27 new).
- Scripted dead-key check: every one of the 27 new keys is referenced at least once outside `i18n/index.ts` (grep count ≥ 1 per key) — zero dead keys shipped.
- Post-verification cleanup: removed `node_modules/`, `dist/`, `*.tsbuildinfo`; `git status --short` shows only the 5 files above (`Users.tsx` new; `App.tsx`, `ChangePassword.tsx`, `icons.tsx`, `i18n/index.ts` modified) plus F4's still-uncommitted `AuthContext.tsx` diff (not touched by this task).

## Blockers / open questions

None. F5-ba.md's contract and i18n key list were exact and sufficient.

## Notes for the next role

**QA**: browser-level ACs (AC-24..AC-34) are reachable with the F4-round-2 jsdom+MemoryRouter harness technique — exercise: staff redirected off `/users` to `/students` (AC-24); `nav.users` present/absent by role in both `lg`/`md` sidebar renderings (AC-25); create success clears all 3 fields + shows `users.created` + refetches (AC-26); 409 shows `users.emailExists` with form values retained (AC-27); own row (matched by email) has no reset control (AC-28); reset confirm/cancel behavior incl. zero-API-calls on cancel (AC-29); sidebar "Change password" control present for any non-forced user, accessible name, navigates to `/change-password` (AC-30); Cancel shown only when `!mustChangePassword` (AC-31); Cancel/success navigate to `state.from` or default `/students` (AC-32); F4 harness cases G1/G2/G3 still green (AC-33); i18n audit already scripted above satisfies AC-34's key-parity/dead-key claims but QA should independently re-verify. AC-35 needs a live stack (not reproducible in this environment).
