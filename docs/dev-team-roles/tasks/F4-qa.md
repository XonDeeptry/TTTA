<!--
  Per-feature-per-role task file, OWNED by the QA agent.
  docs/dev-team-roles/tasks/F4-qa.md
-->

# F4 · QA — Forced password change on first login

- **Owner role:** qa
- **Feature:** F4 — `mustChangePassword` on `DashboardUser`, `POST /auth/change-password`, `/change-password` route + `ProtectedShell` gate, i18n vi/en.
- **Status:** DONE  <!-- Round 1 FAILED (3 defects). Round 2: all 3 re-verified fixed independently, all gates re-run green. See "## Round 2". -->
- **Last updated:** 2026-07-22 (round 2)
- **Depends on:** `F4-ba.md` (AC basis), `F4-pm.md`, `F4-ux.md`, `F4-backend.md`, `F4-frontend.md`, `F4-dba.md`, `F4-devops.md`, `docs/superpowers/specs/2026-07-22-forced-password-change-design.md`

## Inputs

- 17 numbered ACs in F4-ba.md §4 (AC-1..AC-9 `[U]` unit-testable; AC-10..AC-17 `[B]` browser-only).
- Implementer claims re-verified from source, not taken on trust:
  - backend: 22 suites / 117 tests, baseline 99 → **CONFIRMED**
  - backend: `npm ci` on node:24-alpine silently skips lifecycle scripts, CLAUDE.md needs updating → **REFUTED** (see Defect D3)
  - frontend: i18n 125/125 parity → **CONFIRMED** (but one dead key, Defect D2)
  - dba: additive migration validated → **CONFIRMED by inspection** (schema + SQL + ordering)
  - devops: `infra/.env` untouched → **CONFIRMED** (mtime 2026-07-19 23:24, git-ignored, absent from `git status`)

## Checklist

- [x] Read protocol + all upstream task files + design doc
- [x] Create this task file (IN_PROGRESS)
- [x] Line-by-line audit of core-api auth changes (security-sensitive)
- [x] Line-by-line audit of dashboard changes (gate precedence, page, i18n)
- [x] Independently confirm/refute the `npm ci --dangerously-allow-all-scripts` finding
- [x] Run core-api suite (prisma:generate + build + jest)
- [x] Run dashboard build (tsc+vite)
- [x] Regression: zalo-gateway suite, grading-worker suite
- [x] i18n parity / dead-key / undefined-key / hardcoded-string audit
- [x] Write + run 21 QA-derived boundary/negative/security tests (temp spec, removed after run)
- [x] Scope-discipline audit (no F5 leakage, no contract/queue changes, infra/.env untouched)
- [x] Trace every AC to evidence
- [x] Verdict + Status

---

## Outputs

### 1. Suite results (all run in Docker per CLAUDE.md — no Node on the dev host)

| Suite | Command | Result | Baseline | Verdict |
|---|---|---|---|---|
| core-api jest | `npm ci --dangerously-allow-all-scripts && npm run prisma:generate && npm run build && npm test -- --maxWorkers=2` | **22 suites / 117 tests passed**, 50.7 s | 99 tests pre-F4 (19 suites) | PASS, +18 tests, 0 regressions |
| core-api tsc | `npm run build` (`tsc -p tsconfig.build.json`) | clean, 0 errors | — | PASS |
| core-api prisma | `npm run prisma:generate` | `✔ Generated Prisma Client (v5.22.0)` | — | PASS |
| dashboard build | `npm ci && npm run build` (`tsc -b && vite build`) | clean, 0 errors, 81 modules, 287.46 kB JS / 88.40 kB gzip | — | PASS |
| zalo-gateway jest | `npm ci && npm test -- --maxWorkers=2` | **5 suites / 26 tests passed** | 26 | PASS, no regression |
| grading-worker pytest | `pip install -e '.[dev]' && pytest -q` (python:3.12-slim) | **60 passed** in 2.01 s | 60 | PASS, no regression |

Arithmetic check on the 99 baseline: new/changed specs contribute `auth.controller.spec.ts` 7 + `bootstrap-admin.service.spec.ts` 3 + `dto/change-password.dto.spec.ts` 4 + `auth.service.spec.ts` +4 = 18; 117 − 18 = 99, and 22 − 3 new suite files = 19. Backend's numbers are internally consistent and reproduce exactly.

### 2. QA-derived tests (written by QA, executed, then removed)

Wrote a temporary `services/core-api/src/auth/__qa_f4_tmp.spec.ts` (21 cases, equivalence partitioning / BVA / decision table / error guessing), ran it in Docker, **21/21 passed**, then deleted it. `git status` confirmed the tree returned to source-only afterwards. Coverage added beyond the implementers' own specs:

- **BVA on `MinLength(8)`**: `newPassword` of exactly 8 chars ACCEPTED; 7 chars REJECTED; `currentPassword` of 7 chars REJECTED; empty string REJECTED; `null` REJECTED.
- **Cross-field rule is case-sensitive**: `Password-1x` → `password-1x` accepted (correct — they are different strings).
- **Guard decision table via Nest `__guards__` metadata**: `changePassword` has `SessionAuthGuard`; does **not** have `RolesGuard`; no `roles` metadata; `login`/`logout` remain unguarded; `me` remains `SessionAuthGuard`; no class-level guard on `AuthController`.
- **Write-surface**: `dashboardUser.update({data})` keys are exactly `['mustChangePassword','passwordHash']` — no `role`/`email`/`id` tampering possible.
- **Hash cost**: stored hash matches `/^\$2[aby]\$12\$/` — cost 12, identical to `BootstrapAdminService`'s `SALT_ROUNDS`.
- **No user enumeration**: "user not found" and "wrong current password" throw the identical 401 message `invalid current password`.
- **No hash leak**: neither the login nor the change-password response body contains `passwordHash`; body keys are exactly `['email','mustChangePassword','role']`.
- **IDOR**: `AuthService.changePassword` is always called with the **session** user id, never a body-supplied `id`/`userId` (extra props are also stripped by the global `ValidationPipe({whitelist:true})`).
- **Staff role** may change their own password (role neutrality, per design).

### 3. Security review (read line by line — this is an auth change)

All five points from the review brief verified in source:

| Requirement | Evidence | Verdict |
|---|---|---|
| `currentPassword` always re-verified with `bcrypt.compare` even though the session is authenticated | `auth.service.ts:33` `const ok = await bcrypt.compare(currentPassword, user.passwordHash);` runs unconditionally, before any write | PASS |
| Wrong current password writes nothing | `auth.service.ts:34` throws before line 41's `bcrypt.hash` / line 42's `update`; asserted by `auth.service.spec.ts:55-60` and by QA test "wrong current password …" | PASS |
| New hash persisted **and** flag cleared in the DB row | `auth.service.ts:42-45` single `update({ where:{id}, data:{ passwordHash, mustChangePassword:false } })` | PASS |
| Flag cleared in the **live** `req.session.user` (no re-login) | `auth.controller.ts:65` `req.session.user = { ...sessionUser, mustChangePassword: false };`; `main.ts:30-31` `resave:false, saveUninitialized:false` — reassigning the object marks the session dirty so connect-redis persists it | PASS |
| Endpoint is `SessionAuthGuard`-protected and NOT role-restricted | `auth.controller.ts:54` `@UseGuards(SessionAuthGuard)`; QA metadata test confirms `RolesGuard` absent; `auth.module.ts` unchanged | PASS |
| No password or hash logged anywhere | Grepped every `console.*`/`logger.*`/`new Logger(` in `services/core-api/src`: the only auth-adjacent log is the pre-existing `bootstrap-admin.service.ts:30` `Bootstrap admin created: ${email}` (email only). No request/body logging middleware or interceptor in `main.ts`. | PASS |

Additional security observations (not defects, recorded for the record):
- Session ID is not regenerated after a password change, and other live sessions for the same user are not invalidated. Neither is required by the design doc or any AC; noted as a hardening candidate for F5, out of scope here.
- `@MinLength(8)` on `currentPassword` means an account whose current password is <8 chars could not rotate it — unreachable today because `LoginDto.password` already enforces `MinLength(8)`, so such an account cannot log in either. Consistent, not a defect.
- The gate is UI-only by design (F4-ba §0 / design doc §Error handling). **QA did not assert server-side blocking of non-auth routes** — correctly out of scope.

### 4. Frontend gate precedence & frozen behavior

| Check | Evidence | Verdict |
|---|---|---|
| Precedence is exactly `loading → !user → mustChangePassword → adminOnly` | `App.tsx:129-136` in that literal order | PASS |
| Gate blocks admin-only routes too | Gate at line 132 returns before the `adminOnly` check at line 136; `/monitoring` and `/settings` are both `<ProtectedShell adminOnly>` | PASS |
| `/change-password` renders outside nav chrome | `App.tsx:178` `<Route path="/change-password" element={<ChangePassword />} />` — sibling of `/login`, NOT wrapped in `ProtectedShell`; `ChangePassword.tsx:52` renders its own `<main class="flex min-h-screen items-center justify-center …">` centered `Card max-w-sm`, no `SidebarNav` | PASS |
| `Login.tsx`'s `navigate('/settings')` NOT deleted | `Login.tsx:24` still `navigate('/settings');`; `git diff` shows `Login.tsx` untouched in this feature | PASS |
| Catch-all `<Route path="*">` still last and unchanged | `App.tsx:243` | PASS |
| `useLocation()` added to `ProtectedShell` | `App.tsx:126` | PASS |

### 5. i18n audit (scripted, not eyeballed)

Ran a set-diff/reference-graph script over `services/dashboard/src` in Docker:

```
vi keys: 125   en keys: 125
vi duplicates: []            en duplicates: []
missing in en: []            missing in vi: []
distinct t() keys referenced: 124
UNDEFINED keys referenced in code: []
UNUSED (dead) keys defined but never referenced: ["changePassword.success"]
dynamic t() call sites needing manual review: []
```

- vi/en parity: **125/125, zero diff** — frontend's claim confirmed.
- Zero undefined keys referenced; zero duplicate keys; zero dynamic/interpolated `t()` call sites that could hide a miss.
- **One dead key**: `changePassword.success` shipped in both locales, referenced nowhere → Defect **D2**.
- Hardcoded strings in the new page: none. Every user-facing string in `ChangePassword.tsx` goes through `t(...)` (`title`, `currentPassword`, `newPassword`, `confirmPassword`, `submit`, `mismatch`, `sameAsCurrent`, `error`). AC-17's "no hardcoded literals" half is satisfied.
- Accessibility of the new page (checked because a prior round regressed icon-only controls): all three `Input`s are wrapped in `<Label className="block space-y-1">` (implicit association); `type="password"` on all three; `autoComplete` `current-password`/`new-password`/`new-password`; error uses `Alert variant="destructive" role="alert"` (live region); submit is a text `Button`, no icon-only control added anywhere. `Input` is a `forwardRef` (`input.tsx:4`) so `currentPasswordRef.current?.focus()` genuinely works; `Alert` spreads `...props` (`alert.tsx:24`) so `role="alert"` genuinely lands on the DOM node. No a11y regression.

### 6. Scope discipline

| Check | Evidence | Verdict |
|---|---|---|
| No user-management endpoints (F5) | Grepped every `@Controller`/`@Post`/`@Put`/`@Patch`/`@Delete` in `core-api/src` matching user/account/password/auth: only `auth` → `login`, `logout`, `change-password`. Nothing else. | PASS |
| No user-management UI (F5) | Only new dashboard file is `pages/ChangePassword.tsx`; no nav item added to `SidebarNav`'s `items[]` | PASS |
| No queue/contract changes | `git status` clean for `services/zalo-gateway/src/contracts.ts`, `services/core-api/src/contracts.ts`, `services/grading-worker/src/grading_worker/contracts.py` | PASS |
| No server-side gate beyond the design | `SessionAuthGuard` used only on `me` + `change-password`, as before; no middleware/interceptor added; no other route reads `mustChangePassword` | PASS |
| `infra/.env` not modified or committed | mtime `2026-07-19 23:24` (pre-M2, predates F4); git-ignored; absent from `git status`; `git status --short infra/` empty | PASS |
| No dependency changes | `git diff --stat` lists no `package.json`/`package-lock.json`/`pyproject.toml` in either service — both backend's and frontend's Outputs correctly claim no new deps | PASS |
| DB change is additive only | `20260722110000_add_must_change_password/migration.sql` is a single `ALTER TABLE "dashboard_users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;`; timestamp sorts after `20260722100000`; `schema.prisma` diff touches only the `DashboardUser` block | PASS |

Task-file Outputs accuracy audit (the third defect class from the brief): backend's 9-item "Files changed" list and frontend's 4-item list both match `git status` exactly — no over- or under-reporting of files or dependencies. The one inaccuracy found is backend's npm claim → Defect **D3**.

### 7. Acceptance-criteria trace

`[U]` = unit-verified in this environment. `[B]` = browser-only; **there is no browser automation and no dashboard test harness in this environment, so every `[B]` AC is UNVERIFIED-IN-THIS-ENVIRONMENT** — code-level review only. That is a stated environment limitation, not a defect.

| AC | Tag | How verified | Result |
|---|---|---|---|
| AC-1 bootstrap seeds `mustChangePassword: true` | U | `bootstrap-admin.service.spec.ts:21-36` (asserts `create` arg `mustChangePassword===true`, `role==='admin'`, and `bcrypt.compare(seedPw, hash)` true); source `bootstrap-admin.service.ts:28` | PASS |
| AC-2 non-empty table → early return, creates nothing | U | `bootstrap-admin.service.spec.ts:39-43`; source `:23-24` | PASS |
| AC-3 correct current pw → fresh hash + flag cleared | U | `auth.service.spec.ts:72-86` (asserts new hash ≠ old, `bcrypt.compare(new, hash)` true, `bcrypt.compare(old, hash)` false, `mustChangePassword:false`); + QA tests on write-surface and cost-12 | PASS |
| AC-4 wrong current pw → 401, `update` never called | U | `auth.service.spec.ts:55-60` and `:63-69`; `auth.controller.spec.ts:130-141` (session left at `true`); + QA no-enumeration test | PASS |
| AC-5 `new === current` or `new` <8 → 400, no hash update | U | `dto/change-password.dto.spec.ts:17-26`; `auth.service.spec.ts:89-94` (service backstop, `BadRequestException`, no write); + QA BVA (8 accepted / 7 rejected) | PASS |
| AC-6 200 body `{email,role,mustChangePassword:false}` AND live session flag cleared | U | `auth.controller.spec.ts:100-127`; source `auth.controller.ts:65-66`; + QA "no hash leak" key-set assertion | PASS |
| AC-7 no session → 401 before handler logic | U | `session-auth.guard.spec.ts:17-19` (guard throws `UnauthorizedException`); `auth.controller.spec.ts:144-149` (controller's second belt); + QA metadata test proving the guard is actually attached to `changePassword` | PASS |
| AC-8 login body + session carry the flag | U | `auth.controller.spec.ts:27-49` (flagged) and `:52-68` (normal user, flag `false`); source `auth.controller.ts:21-27` | PASS |
| AC-9 `/auth/me` body carries the flag | U | `auth.controller.spec.ts:82-90`; `session.types.ts:7` widened | PASS |
| AC-10 flagged admin login → gate supersedes `navigate('/settings')` | B | Code-level only: `Login.tsx:24` intact; `/settings` is `<ProtectedShell adminOnly>`; gate at `App.tsx:132` precedes the `adminOnly` check at `:136`. Logic is correct by inspection. | UNVERIFIED-IN-ENV (code review PASS) |
| AC-11 flagged user bounced back from any route, incl. admin-only | B | Code-level only: every non-`/login`, non-`/change-password` route is wrapped in `ProtectedShell`; gate returns `<Navigate to="/change-password" replace />` before `adminOnly`. | UNVERIFIED-IN-ENV (code review PASS) |
| AC-12 mismatch → inline error, NO API call | B | Code-level only: `ChangePassword.tsx:26-29` returns before `changePassword(...)` at `:37` | UNVERIFIED-IN-ENV (code review PASS) |
| AC-13 wrong current pw 401 → destructive `Alert` with translated `changePassword.error` | B | Code-level only: `:40-44` maps non-400 → `t('changePassword.error')`; `:91-95` renders `Alert variant="destructive" role="alert"` | UNVERIFIED-IN-ENV (code review PASS) |
| AC-14 200 → context flag false, lands on `/students`, no re-login | B | Code-level only: `AuthContext.tsx:42-45` `setUser(updated)`; `ChangePassword.tsx:38` `navigate('/students',{replace:true})`; server clears the live session so the cookie stays valid | UNVERIFIED-IN-ENV (code review PASS) |
| AC-15 page renders outside sidebar/nav chrome | B | Code-level only: route registered outside `ProtectedShell` (`App.tsx:178`); page renders its own centered `main`/`Card` | UNVERIFIED-IN-ENV (code review PASS) |
| AC-16 normal user (flag false) unaffected; role gating unchanged | B (+U) | `auth.controller.spec.ts:52-68` covers the server half `[U]`. Frontend half code-level: gate condition `user.mustChangePassword && …` is false, so control falls through to the unchanged `adminOnly` check. | Server PASS; UI UNVERIFIED-IN-ENV (code review PASS) |
| AC-17 all new strings via `t(...)`, both bundles have all §6 keys | B (scripted here) | Scripted audit: all 9 `changePassword.*` keys present in **both** vi and en; zero hardcoded literals in `ChangePassword.tsx`. **However** one of the 9 (`changePassword.success`) is referenced nowhere → Defect D2. | Letter of AC-17: PASS. Dead-key quality bar: see D2 |

**Summary: 9/9 `[U]` ACs PASS. 8 `[B]` ACs are unverified in this environment (no browser); all 8 pass code-level review.**

---

## Defects

### D1 — `/change-password` never sends an unauthenticated visitor to `/login`; shows a misleading "current password is incorrect" instead

- **Severity:** Medium (functional / UX dead-end; no security impact — the server correctly 401s)
- **Violates:** F4-ba.md §2.9 — *"Must guard against a not-logged-in visit: if a user reaches `/change-password` with no session, the page should redirect to `/login` … **Minimal requirement: a direct `/change-password` visit while unauthenticated does not crash and ends at `/login`.**"* Also F4-ux.md §1 user-flow branch *"Not logged in at all (no session) → page redirects to /login"* and its mermaid edge `B -- no --> L[Redirect to /login]`. Not covered by a numbered AC, but it is an explicit MUST in two upstream specs.
- **Responsible role:** **frontend**
- **Repro steps:**
  1. Ensure no session cookie (log out, or use a fresh private window).
  2. Navigate directly to `http://localhost/change-password`.
  3. The form renders normally (the route is a sibling of `/login`, outside `ProtectedShell`, and `ChangePassword.tsx` reads neither `user` nor `loading` from `useAuth()` — it destructures only `changePassword` at `ChangePassword.tsx:13`).
  4. Fill any three values with new === confirm and ≥8 chars, submit.
  5. `POST /api/auth/change-password` returns 401 `login required` (`SessionAuthGuard`).
  6. `ChangePassword.tsx:40-44` sees `status !== 400`, so it renders `t('changePassword.error')`.
- **Actual:** Alert reads "Mật khẩu hiện tại không đúng" / "Current password is incorrect". The user is never redirected to `/login` and has no way to reach it from this screen (the page has no secondary action by design). The loop is unescapable without editing the URL bar.
- **Expected:** an unauthenticated visit ends at `/login` — e.g. `const { user, loading, changePassword } = useAuth(); if (loading) return null; if (!user) return <Navigate to="/login" replace />;` at the top of the component (mirrors `ProtectedShell`'s own first two gates), and/or treat a 401 whose body message is `login required` as a session-expiry redirect rather than a wrong-password error.
- **Evidence:** `D:/TTTA/services/dashboard/src/pages/ChangePassword.tsx` lines 11-20 (no `user`/`loading` read, no `Navigate` import) and lines 39-45 (all non-400 errors collapse to `changePassword.error`); `D:/TTTA/services/dashboard/src/App.tsx:178` (route outside `ProtectedShell`); `D:/TTTA/services/core-api/src/auth/session-auth.guard.ts:9` (`UnauthorizedException('login required')`).

### D2 — Dead i18n key `changePassword.success` shipped in both vi and en, referenced nowhere

- **Severity:** Low (dead code; no user-visible effect)
- **Violates:** no numbered AC by the letter (AC-17 only requires the keys to be *present*), but it is exactly the defect class a prior QA round in this repo rejected — dead i18n keys shipped in both locales. F4-ba.md §6 marked it *"optional if a confirmation toast is shown"* and F4-ux.md §2 said *"not required — do not block on it"*; no toast was built, so the key is unused in both bundles.
- **Responsible role:** **frontend**
- **Repro steps:** run a reference audit over `services/dashboard/src` — collect every `'…': '…'` key in each locale block of `src/i18n/index.ts`, collect every `t('…')` reference in every other `.ts`/`.tsx`, set-subtract.
- **Actual:** `changePassword.success` is defined at `i18n/index.ts` in both the `vi` block (`'changePassword.success': 'Đã đổi mật khẩu'`) and the `en` block (`'changePassword.success': 'Password changed'`) and appears in zero `t()` call sites. It is the **only** dead key in the whole bundle (124 of 125 keys are referenced).
- **Expected:** either remove the key from both locales, or use it (an optional success toast/banner, per F4-ux §2). Do not ship an unused key.
- **Evidence:** scripted audit output in §5 above: `UNUSED (dead) keys defined but never referenced: ["changePassword.success"]`; `changePassword.* defined` has 9 entries, `changePassword.* used` has 8.

### D3 — `F4-backend.md` Outputs state a false npm finding and recommend a wrong repo-wide change to CLAUDE.md

- **Severity:** Low (documentation/process; no runtime impact — but it would misdirect every future build in this repo)
- **Violates:** the task-file accuracy requirement in TASK-PROTOCOL.md ("terse and **factual**"). The claim is `F4-backend.md:89`: *"`npm ci --dangerously-allow-all-scripts` — needed on the current image: npm 11.16 now blocks lifecycle scripts by default, and without them bcrypt's native binding and the Prisma engines are never installed (the plain `npm ci` in CLAUDE.md silently produces an unusable tree). **CLAUDE.md's documented command should be updated.**"*
- **Responsible role:** **backend**
- **Repro steps (controlled experiment, three arms, isolated scratch dir containing only core-api's `package.json`, `package-lock.json` and `prisma/`, fresh `node:24-alpine` container per arm, `node_modules` deleted between arms):**
  1. Arm A — plain `npm ci`
  2. Arm B — `npm ci --ignore-scripts` (control for "scripts didn't run")
  3. Arm C — `npm ci --dangerously-allow-all-scripts`
- **Actual results:**

  | Arm | bcrypt `napi-v3/bcrypt_lib.node` | `.prisma/client/index.js` | `require('bcrypt')` |
  |---|---|---|---|
  | A — plain `npm ci` | **present** | **YES** | **OK** (`hashSync`/`compareSync` round-trip works) |
  | B — `npm ci --ignore-scripts` | MISSING | NO | FAIL |
  | C — `npm ci --dangerously-allow-all-scripts` | present | YES | OK |

  `npm config get ignore-scripts` → `false` on the image. npm 11.16.0 does print a **warn-only** advisory (`npm warn allow-scripts 4 packages have install scripts not yet covered by allowScripts: @prisma/client, @prisma/engines, bcrypt, prisma … Run 'npm approve-scripts …'`) but **still executes them** — Arm B is the only arm that reproduces the broken tree the claim describes. Corroborating: the dashboard build and the zalo-gateway suite in this QA run both used plain `npm ci` and both succeeded.
- **Expected:** the claim in the task file is refuted; **CLAUDE.md must NOT be changed** — its documented `npm ci` still produces a working tree on `node:24-alpine`/npm 11.16.0. Backend should correct `F4-backend.md:89` to note the harmless warn-only advisory (and that `--dangerously-allow-all-scripts` merely silences it) rather than asserting a broken default.
- **Evidence:** three-arm Docker experiment above; npm warning text captured verbatim; core-api's `package.json` has no `postinstall` of its own, so all four scripts come from `bcrypt`/`prisma`/`@prisma/*` transitive install hooks.

### Not defects (explicitly checked and cleared)

- Server-side blocking of non-auth routes while flagged is **absent by design** (F4-ba §0, design doc §Error handling). Not asserted, not raised.
- `[B]` ACs unverified: no browser automation exists in this environment. Environment limitation, stated plainly, not a defect and not routed to any role.
- The `location.pathname !== '/change-password'` clause in the gate can never match (the route lives outside `ProtectedShell`). F4-ba §2.8 explicitly authorizes it as defensive/belt-and-suspenders. Not a defect.
- Existing seeded `dashboard_users` rows are **not** backfilled to `mustChangePassword = true` by the additive migration. Called out correctly in `F4-devops.md` rollout step 4 as an owner decision. Correct per design ("default `false` so existing/normal accounts are unaffected"). Not a defect.
- No session-ID regeneration and no invalidation of the user's other sessions after a password change. Not required by the design doc or any AC; hardening candidate for F5.

## Blockers / open questions

- D1 needs a frontend fix. D2 needs a one-line decision from frontend (delete the key, or ship the optional toast). D3 needs a correction to `F4-backend.md`'s Outputs by backend.
- `[B]` ACs AC-10..AC-17 will remain unverified until someone runs the stack in a browser. Per `F4-devops.md` rollout, that also requires the owner to first add `SESSION_SECRET`/`CORE_API_BOOTSTRAP_ADMIN_*` to the untracked `infra/.env` and apply the migration — none of which QA performed (no real deployments, no secrets written).

## Notes for the next role

Core mechanism is sound: the security-critical path (always re-compare current password with bcrypt, no write on failure, cost-12 hash persisted, flag cleared in both DB and live session, `SessionAuthGuard`-only, no hash/password ever logged, no IDOR, no mass assignment) is correct and now covered by 117 core-api tests plus 21 QA-derived ones. All three regression suites are at baseline. The three defects are peripheral: one frontend behavior gap (D1), one dead i18n key (D2), one false statement in a task file (D3). None require redesign — re-run QA after the fixes; expect a fast second round.

QA_RESULT: FAIL

<!-- ====================== ROUND 1 RECORD ENDS HERE ====================== -->

---

# Round 2 (re-verification after the three reported fixes)

- **Round-2 status:** DONE — **PASS**
- Round-1 record above is preserved verbatim and is not superseded except where this section says so.

## Round-2 checklist

- [x] Reopen task file, determine what actually changed since the round-1 verdict (mtime + `git diff`)
- [x] D1 — re-verify the `/change-password` unauthenticated redirect **behaviourally**, not by reading the diff
- [x] D1 — verify the `loading` guard does not bounce an authenticated user on hard refresh
- [x] D1 — verify hook ordering is legal React (early returns after all hooks), incl. an in-place `loading: true→false` transition
- [x] D1 — verify page still renders outside nav chrome and route is still a sibling of `/login`
- [x] D1 — **mutation / negative control**: prove the new harness fails when the guard is removed
- [x] D2 — re-run the scripted i18n audit (parity / dead / undefined / dynamic / hardcoded)
- [x] D2 — independently check the frontend's "two false positives" claim
- [x] D3 — re-read `F4-backend.md`; confirm the statement is now true; confirm `CLAUDE.md` has **no diff**
- [x] Regression: core-api, dashboard build, zalo-gateway, grading-worker
- [x] Regression: gate precedence, `Login.tsx` untouched, no new deps, `infra/.env` untouched, no F5 leakage, no contract/queue changes
- [x] Re-run security review scope decision (which auth files changed this round)
- [x] Clean up all QA scratch artifacts; confirm tree is source-only
- [x] Verdict + Status

## What actually changed since the round-1 verdict

Round-1 QA file was written at `19:35:26`. Only four files have a later mtime:

| File | mtime | Round-2 change |
|---|---|---|
| `services/dashboard/src/pages/ChangePassword.tsx` | 19:36:42 | D1 fix |
| `services/dashboard/src/i18n/index.ts` | 19:36:51 | D2 fix |
| `docs/dev-team-roles/tasks/F4-frontend.md` | 19:37:58 | fix-round record |
| `docs/dev-team-roles/tasks/F4-backend.md` | 19:39:57 | D3 retraction |

No **core-api** source file changed this round (all auth files ≤ `19:10:46`). `App.tsx` (19:17:51) and `AuthContext.tsx` (19:17:27) also unchanged this round. `Login.tsx` still at the pre-F4 baseline mtime `18:38:05`. Consequence: the round-1 line-by-line **backend security review stands unchanged** — re-read `auth.controller.ts` and `auth.service.ts` to confirm they are byte-identical to what was reviewed, and they are. The only auth-adjacent file that changed is the client page, whose change is a client-side redirect with no security surface (the server still returns 401 regardless).

## D1 — VERIFIED FIXED (behaviourally, not on the fixers' word)

Source (`ChangePassword.tsx`): `const { user, loading, changePassword } = useAuth();` at line 13; `Navigate` imported at line 3; guards at lines 51-56:

```tsx
  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
```

**Hook ordering is legal.** All 9 hook calls (`useTranslation`, `useAuth`, `useNavigate`, 5× `useState`, `useRef`) are unconditional at lines 12-20; the early returns are at 51-56, after every hook. `onSubmit` is a plain function declaration, not a hook. Verified statically *and* dynamically — test G1.6 drives the same mounted component instance through `loading: true → false`; React would have thrown "Rendered more hooks than during the previous render" had a return been interleaved with the hooks. It did not.

**`loading` guard prevents the hard-refresh bounce.** `AuthContext.tsx:22` `useState(true)` and `:29` `.finally(() => setLoading(false))` — `loading` is `true` until `/auth/me` settles, so a hard refresh of `/change-password` with a valid cookie renders `null`, not a redirect. Asserted directly by G1.2 (loading=true **with** a valid user → still no redirect).

### QA-built jsdom harness (new this round)

No dashboard test harness exists and adding one would be a dependency change, so QA built a **throwaway** one: a Vite SSR bundle of a jsdom entry that aliases `../auth/AuthContext` to a QA stub, mounts the **real** `ChangePassword` and the **real** `App` with `react-dom/client` + `act()` inside a `MemoryRouter`, and reads the resulting route off a `useLocation()` spy. Installed with `npm i --no-save --no-package-lock jsdom` so `package.json`/`package-lock.json` were never touched; the whole `__qa/` directory, `node_modules`, `dist` and `*.tsbuildinfo` were deleted afterwards and `git status --untracked-files=all` confirms the tree is source-only.

**29 assertions, 29 passed, 0 failed.**

Group 1 — `ChangePassword` standalone (the D1 fix):

| # | Case | Expected | Result |
|---|---|---|---|
| G1.1 | `loading=true`, no user | renders nothing, no redirect | PASS |
| G1.2 | `loading=true` **with** valid user | renders nothing, **no bounce** | PASS |
| G1.3 | `loading=false`, `user=null` | → `/login` | PASS |
| G1.4 | `loading=false`, flagged admin | form renders (3 pw inputs) | PASS |
| G1.5 | `loading=false`, unflagged staff | form renders (page has no flag gate) | PASS |
| G1.6a/b | in-place `loading: true→false`, no session | no redirect while loading, then `/login` | PASS |

Group 2 — full `App`, `ProtectedShell` precedence (**this converts AC-10/AC-11/AC-15/AC-16-UI from "code review only" to actually executed**):

| # | Case | Expected | Result |
|---|---|---|---|
| G2.1 | flagged admin → `/settings` (admin-only) | `/change-password`, no chrome | PASS |
| G2.2 | flagged admin → `/monitoring` (admin-only) | `/change-password` | PASS |
| G2.3 | flagged **staff** → `/monitoring` | `/change-password`, **not** `/students` — proves gate precedes `adminOnly` | PASS |
| G2.4 | flagged admin → `/students` | `/change-password` | PASS |
| G2.5 | flagged staff → `/submissions` | `/change-password` | PASS |
| G2.6 | flagged admin → unknown route | catch-all then gate → `/change-password` | PASS |
| G2.7 | flagged admin already at `/change-password` | stays — **no redirect loop** | PASS |
| G2.8 | unflagged staff → `/monitoring` | `/students` — `adminOnly` still enforced | PASS |
| G2.9 | unflagged admin → `/settings` | stays, chrome present | PASS |
| G2.10 | unflagged staff → `/students` | stays, chrome present | PASS |
| G2.11 | no user → `/students` | `/login` | PASS |
| G2.12 | unflagged admin → `/change-password` | renders **outside** chrome (`<aside>` absent) | PASS |
| G2.13 | `loading=true` → `/students` | renders nothing, no redirect | PASS |

G2.3 and G2.8 together are a **differential** proof of the precedence `!user → mustChangePassword → adminOnly`: same admin-only route, same staff role, flag flipped, different destination. Had the gate been placed after `adminOnly`, G2.3 would have landed on `/students`.

Group 3 — page behaviour (AC-12/AC-13/AC-14/AC-15 mechanics):

| # | Case | Expected | Result |
|---|---|---|---|
| G3.1 | `new !== confirm` | `changePassword.mismatch` alert, **zero API calls** | PASS |
| G3.2 | `new === current` | `changePassword.sameAsCurrent`, **zero API calls** | PASS |
| G3.3 | valid + matching | API call fires, no alert | PASS |
| G3.4 | BVA: exactly 8-char new password | API call fires | PASS |
| G3.5 | new differs from current only by case | treated as different, API call fires | PASS |
| G3.6 | success | navigates to `/students` | PASS |
| G3.7 | 3 `type="password"` fields, `autoComplete` = current/new/new, all `required` | as specified | PASS |
| G3.8 | submit button present, enabled at rest | as specified | PASS |
| G3.9 | no `<aside>` / no `<nav>` on the page | outside nav chrome | PASS |

### Negative control (mutation test) — the harness is proven sensitive

A mutant copy of `ChangePassword.tsx` with the two guard blocks stripped (`sed`-deleted, AuthContext aliased to the same stub) was built and run through the identical G1.3 assertion:

```
MUTANT (guard removed): path=/change-password pwInputs=3
  GOOD harness IS sensitive — mutant does not redirect (round-1 defect reproduced)
```

The mutant reproduces the exact round-1 symptom (form renders, no redirect) while the shipped code redirects. The pass is therefore real, not a vacuous assertion.

**Residual note (not a defect):** the round-1 report offered two alternatives ("and/or"); frontend implemented the mount-time guard and not the "401 body `login required` ⇒ treat as session expiry" mapping. So a session that expires *while the form is already open* still shows `changePassword.error` rather than redirecting. That is identical to how every other page in this SPA behaves today (app-wide pre-existing behaviour, not introduced by F4), and F4-ba §2.9's stated **minimal requirement** — "a direct `/change-password` visit while unauthenticated does not crash and ends at `/login`" — is met. Not raised as a defect; a candidate for a future session-expiry story.

## D2 — VERIFIED FIXED

Same scripted audit as round 1, re-run against the current tree:

```
vi keys: 124   en keys: 124
vi duplicates: []             en duplicates: []
missing in en: []             missing in vi: []
distinct t() keys referenced: 124
UNDEFINED keys referenced: []
DEAD keys (defined, never referenced): []
dynamic t() call sites: []
changePassword.* defined (vi): 8   defined (en): 8   used: 8
changePassword.success defined vi/en? false false
ChangePassword.tsx literal JSX text nodes: []
ChangePassword.tsx literal user-facing attributes: []
```

- Parity **124/124, zero diff** — frontend's claim confirmed (125 → 124, exactly one key removed from each side).
- **Zero** dead keys (round 1 had one), zero undefined keys, zero duplicates, zero dynamic `t()` call sites that could hide a miss.
- Zero hardcoded user-facing strings on the new page — no literal JSX text nodes and no literal `placeholder`/`aria-label`/`title`/`alt` attributes.
- **False-positive claim independently checked and confirmed**: `monitoring.diskAlert` is genuinely used at `Monitoring.tsx:164` (`t('monitoring.diskAlert', { pct, at })`) and `submissions.pilotProviderModel` at `SubmissionDetail.tsx:214` (multi-line `t(key, {provider, model, createdAt})`). Both are interpolating call sites unrelated to F4; a naive single-line `t\('([^']+)'\)` regex would miss them. QA's audit resolves multi-line/interpolated calls and never flagged either.

## D3 — VERIFIED FIXED

- `F4-backend.md` lines 90-100 now state the **true** result: plain `npm ci` works; only `--ignore-scripts` produces the broken tree; `--dangerously-allow-all-scripts` is byte-for-byte equivalent to plain `npm ci`; and explicitly **"CLAUDE.md needs no change and was not modified."** The retraction is labelled as such and the checklist carries the fix item. Accurate.
- **`CLAUDE.md` has no diff**: `git diff CLAUDE.md` → **0 lines**; `git status --short CLAUDE.md` → empty; last commit touching it is `fd5ec8f` (M4), i.e. pre-F4.
- **Third independent corroboration this round**: QA's own core-api run used **plain `npm ci`** (round 1 used the `--dangerously-allow-all-scripts` form) and `prisma:generate`, `tsc` and all 117 bcrypt-dependent tests passed. The dashboard build also used plain `npm ci`, emitted the same warn-only `npm warn allow-scripts … esbuild@0.21.5` advisory, and esbuild still worked. Warn-only confirmed a third time.

## Round-2 regression gates

| Gate | Command / method | Result |
|---|---|---|
| core-api suite | `npm ci && npm run prisma:generate && npm run build && npm test -- --maxWorkers=2` (node:24-alpine) | **22 suites / 117 tests passed**, 44.7 s — matches expected baseline exactly |
| dashboard build | `npm ci && npm run build` (`tsc -b && vite build`) | clean, **0 errors**, 81 modules, 287.43 kB / 88.42 kB gzip |
| zalo-gateway suite | `npm ci && npm test -- --maxWorkers=2` | **5 suites / 26 tests passed** — expected 26 |
| grading-worker suite | `pip install -e '.[dev]' && pytest -q` (python:3.12-slim) | **60 passed** in 1.64 s — expected 60 |
| QA jsdom harness | temp Vite-SSR + jsdom, deleted after run | **29/29 passed** + mutation control sensitive |
| Gate precedence `loading → !user → mustChangePassword → adminOnly` | `App.tsx:129-136` unchanged this round + executed proof G2.1-G2.13 | PASS |
| Gate blocks admin-only routes | G2.1, G2.2, G2.3 | PASS |
| `Login.tsx`'s `navigate('/settings')` present | `Login.tsx:24`, file at pre-F4 mtime, absent from `git status` | PASS |
| No new dependency | `git status` on every tracked `package.json`/`package-lock.json`/`pyproject.toml` → none modified; jsdom installed `--no-save --no-package-lock` | PASS |
| `infra/.env` untouched | mtime still `2026-07-19 23:24:27`, git-ignored, `git status --short infra/` empty | PASS |
| No F5 scope leakage | only 4 routes in `services/core-api/src/auth`: `login`, `logout`, `me`, `change-password`; `dashboardUser` referenced only by `auth.service.ts` + `bootstrap-admin.service.ts`; no new dashboard page/nav item | PASS |
| No queue/contract changes | all three `contracts.*` files absent from `git status` | PASS |
| Backend security review | no core-api auth file changed this round; `auth.controller.ts`/`auth.service.ts` re-read and byte-identical to the round-1 review — all 6 review points still hold | PASS (carried forward) |
| Tree source-only after QA | `git status --untracked-files=all` = the same 27 entries as before QA ran; `__qa/`, `node_modules/`, `dist/`, `__pycache__` all removed | PASS |

## Round-2 AC trace delta

Round 1: 9/9 `[U]` PASS, 8 `[B]` unverified (code review only). Round 2 upgrades several `[B]` ACs to executed:

| AC | Round 1 | Round 2 |
|---|---|---|
| AC-10 flagged admin login → gate supersedes `navigate('/settings')` | code review | **VERIFIED** (G2.1) |
| AC-11 flagged user bounced from any route incl. admin-only | code review | **VERIFIED** (G2.1-G2.6, incl. staff-on-admin-route G2.3) |
| AC-12 mismatch → inline error, NO API call | code review | **VERIFIED** (G3.1, G3.2 — API stub records zero calls) |
| AC-13 error path renders destructive translated `Alert` | code review | **PARTIAL** — alert element/text/`role="alert"` verified (G3.1/G3.2); the specific 401→`changePassword.error` mapping is still code-review only (needs a live server) |
| AC-14 success → lands on `/students`, no re-login | code review | **PARTIAL** — navigation verified (G3.6); "no re-login" is server-side and covered by `[U]` AC-6 |
| AC-15 page renders outside nav chrome | code review | **VERIFIED** (G2.12, G3.9) |
| AC-16 normal user unaffected, role gating unchanged | server `[U]` + code review | **VERIFIED** (G2.8, G2.9, G2.10) |
| AC-17 all strings via `t()`, both bundles complete | scripted | **VERIFIED + dead key now gone** |

**Browser-only ACs that remain genuinely unverified in this environment — stated plainly, and this is NOT a defect:** there is still no real browser, no live core-api/Postgres/Redis stack and no deployment here. Specifically not exercised end-to-end: the real `POST /auth/change-password` round trip from the SPA (only the context action is stubbed), the actual 401-from-server → `changePassword.error` mapping, real cookie/session persistence across the change, focus-return-to-current-password-field on a real 401, the language switcher rendering both bundles visually, and any CSS/layout/visual correctness. These need `docker compose up -d --build` plus the owner adding `SESSION_SECRET` / `CORE_API_BOOTSTRAP_ADMIN_*` to the untracked `infra/.env` and applying the migration — none of which QA performed.

## Round-2 defects

**None.** D1, D2 and D3 are all independently verified fixed; no regressions found; no new defects.

## Round-2 notes for the next role

F4 is done from a QA standpoint. Two carry-forwards for whoever picks up F5 (recorded, not blocking): (1) a password change neither regenerates the session ID nor invalidates the user's other live sessions; (2) an expiring session on an already-open form still surfaces as "current password is incorrect" rather than a redirect — app-wide pre-existing behaviour, not F4-specific. Deployment steps in `F4-devops.md` (migration + bootstrap env vars + the owner's decision on backfilling existing rows to `mustChangePassword = true`) are still outstanding and are owner actions, not QA ones.

QA_RESULT: PASS
