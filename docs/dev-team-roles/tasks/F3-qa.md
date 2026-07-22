# F3 · QA — Dashboard UI redesign verification

- **Owner role:** qa
- **Feature:** F3 — Reskin all 9 dashboard pages + shell with Tailwind + shadcn/ui. UI-only, no backend changes.
- **Status:** DONE   <!-- round 2: all round-1 defects (D1–D4) + AC-51 verified fixed; all Tier-1..4 gates + full existing suites PASS -->
- **Last updated:** 2026-07-22 (round 2)
- **Depends on:** `docs/dev-team-roles/tasks/F3-ba.md`, `docs/dev-team-roles/tasks/F3-frontend.md`, `docs/dev-team-roles/tasks/F3-ux.md`, `docs/dev-team-roles/tasks/F3-pm.md`

## Inputs (what this role received)

- F3-ba.md: AC-01…AC-52 + per-page frozen-behavior inventory (§1) + verification classification (§4).
- F3-frontend.md: implementation report (re-verified independently; one claim found inaccurate — see D3).
- F3-ux.md: design spec. F3-pm.md: S1–S11 + DoD.

No browser automation in this environment ⇒ browser-only ACs are reported unverified; verdict is
based on Tiers 1–4 (static analysis + container build + existing suite).

## Checklist

- [x] Tier 1.1 — F2 pilot-panel read-only subtree audit (AC-39 static half) — **PASS**
- [x] Tier 1.2 — no backend changes (AC-50) — **PASS**
- [x] Tier 1.3 — /api contract diff vs HEAD (AC-09) — **PASS** (26 call sites, 0 added / 0 removed)
- [x] Tier 1.4 — transport patterns: multipart / anchors / native audio (AC-11/12/13) — **PASS**
- [x] Tier 1.5 — role gating + ProtectedShell guard order (AC-24…AC-31 static) — **PASS**
- [x] Tier 2 — per-page behavior vs §1 inventory (9 pages + shell) — **PASS**
- [x] Tier 3 — i18n vi/en parity 119/119, all pre-existing keys still used (AC-19/20/22/23) — **PASS**
- [x] Tier 3 — build gate `npm ci && npm run build` + `docker compose build dashboard` (AC-07) — **PASS**
- [x] Tier 3 — network-free build, no CDN, dependency footprint (AC-01/03/08) — **PASS**
- [x] Tier 4 — design actually applied (Tailwind + shadcn + sidebar + tokens; 0 inline styles left) — **PASS**
- [x] Existing suite regression: core-api jest 99/99 pass; dashboard has no test script
- [x] Defects recorded (D1–D4) + browser-only ACs listed as unverified
- [x] Verdict recorded: **FAIL** (2 fixable defects: D1, D2)

## Outputs

### Evidence

| Check | Command / method | Result |
|---|---|---|
| Backend untouched | `git status --porcelain` | Only `services/dashboard/**`, `docs/dev-team-roles/**`, `.claude/settings.json` (permission allow-list). Zero files under `services/core-api`, `services/zalo-gateway`, `services/grading-worker`, `infra/`, `prisma/`. |
| API surface | script diffing every `api.{get,post,put,patch,delete}(…)` + `fetch(…)` literal in `App.tsx`/`main.tsx`/`api/client.ts`/`AuthContext.tsx`/9 pages, HEAD vs worktree | 26 call sites, **0 added, 0 removed**. `URLSearchParams` construction byte-identical in Students/Submissions. |
| Forbidden transports | `grep -rE "createObjectURL\|download=\|\.blob\(\)\|setInterval\|setTimeout\|target=\"_blank\"\|contentEditable\|role=\"button\"" src/` | no matches |
| Multipart | `Criteria.tsx:51` still `fetch('/api/criteria', {method:'POST', credentials:'include', body: form})`, no `Content-Type`; `name="courseId"` (:82) + `name="file"` (:84) direct children of the `<form onSubmit={upload}>` (:81); `accept=".docx"` + `required` intact | PASS |
| Exports / media | Reports 6× plain `<a href={exportUrl(...)}>`; `SubmissionDetail.tsx:100` native `<audio controls src={\`/api/media/${data.id}\`}>` | PASS |
| Pilot panel (AC-39) | read `SubmissionDetail.tsx:164–222` subtree line by line + read every primitive it uses (`card.tsx`, `alert.tsx`, `table.tsx`) | zero interactive descendants; `Alert` is a bare `<div>` with **no** dismiss button (documented in `alert.tsx`); notice still rendered via `t('submissions.pilotNotSentNotice')` |
| i18n | script: per-locale key extraction + `t('…')` call-site extraction | vi 119 / en 119, set-equal, no duplicates; all 107 pre-existing keys still referenced; 12 new keys added to both locales; **3 new keys unreferenced** → D1 |
| Build | `MSYS_NO_PATHCONV=1 docker run --rm -v "…/services/dashboard:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"` | `npm ci` clean (lockfile in sync), `tsc -b && vite build` 0 errors/warnings, `dist/assets/index-*.css 17.43 kB` (Tailwind emitted) |
| Container build | `docker compose build dashboard` (from `infra/`, clean context) | image `ilm-bot-dashboard:latest` built; Dockerfile/compose/Caddyfile unchanged |
| Network-free build | `grep -inE "shadcn\|degit\|curl\|wget" package.json Dockerfile docker-compose.yml`; `index.html` unchanged | no matches; only `<script src="/src/main.tsx">` in index.html, no CDN |
| Deps added | runtime: `clsx`, `tailwind-merge`, `class-variance-authority`; dev: `tailwindcss`, `postcss`, `autoprefixer`. Icons hand-authored SVG (`src/components/icons.tsx`), fonts = system stack | within UX authorization, leaner than spec'd |
| Existing suite | `docker run … services/core-api … npm test -- --maxWorkers=2` | **19 suites / 99 tests passed** |

### Defects

| # | Sev | Title | AC | Owner |
|---|---|---|---|---|
| D1 | Low | 3 dead i18n keys shipped (`nav.languageSwitcher`, `nav.switchToVietnamese`, `nav.switchToEnglish`) — defined in both locales, referenced nowhere | AC-49 | frontend |
| D2 | Medium | Sidebar rail (768–1023px): 7 nav links + logout button are icon-only with **no accessible name** — icons are `aria-hidden`, labels `display:none`, Tooltip not associated via `aria-labelledby`/`aria-describedby`; logout has no tooltip at all | AC-46 / F3-ba §5 assumption 6 / F3-ux §3, §8 | frontend |
| D3 | Low (doc) | `F3-frontend.md` Outputs claims `tailwindcss-animate` + `phosphor-react` were added; neither is in `package.json` or `package-lock.json` | — | frontend |
| D4 | Low (pre-existing) | No `.dockerignore` in `services/dashboard` ⇒ `docker compose build dashboard` fails with `invalid file request node_modules/.bin/autoprefixer` whenever host `node_modules/` exists (reproduced). Pre-existing gap, made likely by F3's containerized `npm ci` loop | — | devops |

### Observations (not defects)

- `.claude/settings.json` modified (tool permission allow-list) — harness artifact, not product code.
- New hardcoded literal `"ILM"` in `App.tsx:60,157` (brand mark, untranslated by convention).
- `<nav aria-label={t('nav.toggleMenu')}>` (`App.tsx:62`) reuses the toggle key as the landmark name — semantically off.
- UX §3's rail pin-toggle + `localStorage` preference was not implemented (CSS breakpoints only); no AC depends on it.
- AC-51 (`TASKS.md` updated for F3) still outstanding — a post-QA close-out step.
- Additive changes are exactly those the UX spec authorized: Settings `<TableHeader>` (+`settings.key`/`settings.value`), pagination `aria-label`s, skip link, status Badges, `id="main-content"`.

### Requires live-stack browser verification (not covered by this pass)

AC-14, AC-15, AC-24…AC-29, AC-31…AC-38, AC-40…AC-47, AC-52 (runtime halves). Static equivalents
for AC-14/15/16/17/30/31/36/37/38/39 were verified by source comparison against `HEAD`.

## Round 2 (2026-07-22) — re-verification of fixes

Verdict: **PASS**. Every round-1 defect independently re-verified as fixed; all Tier-1..4 gates
re-confirmed after the edits; full existing suites now run green across all three test-bearing services.

### Fix verification

| Item | Method (independent, not taking fixer's word) | Result |
|---|---|---|
| **D1** dead i18n keys | script: per-locale key extraction + `t('…')` call-site scan across all `.tsx/.ts` (excl. i18n); `grep languageSwitcher/switchTo*` | 3 keys gone from **both** vi & en; 0 references anywhere; **vi 116 / en 116**, set-equal, 0 dups, 0 unused, 0 undefined. `git diff HEAD` on i18n = **+18/-0** → HEAD 107 + 9 net-new (12 intended − 3 removed) = 116. Exactly the intended set; no other key touched. |
| **D2** icon-rail a11y | read `App.tsx` rail block (`md:flex … lg:hidden`) line-by-line | `aria-label={item.label}` on every rail `<Link>` (:93); `aria-label={t('nav.logout')}` on logout `<Button>` (:110). Both from existing i18n keys; icons `aria-hidden`; visual + role-gated nav construction unchanged; no new hardcoded user-facing string. |
| **D3** frontend doc | compared `F3-frontend.md` Outputs vs `package.json` + `package-lock.json`; `grep tailwindcss-animate\|phosphor\|@radix-ui\|lucide package-lock.json` = **0** | Doc now names the real set (runtime `clsx`/`tailwind-merge`/`class-variance-authority`; dev `tailwindcss`/`postcss`/`autoprefixer`; hand-authored SVG icons; no icon pkg / Radix / shadcn CLI). Matches reality. |
| **D4** `.dockerignore` | read all 4 files; **negative test**: `mv .dockerignore` aside → `docker compose build dashboard` **FAILS** `invalid file request node_modules/.bin/baseline-browser-mapping` (74MB context) → restore → **succeeds**. Built all 4 service images with host `node_modules/` present. | Each excludes the right artifacts; core-api's does **not** exclude `prisma/`/`templates/` its Dockerfile `COPY`s. Original failure reproduced on my side and proven cured by the file. **Fixed.** |
| **AC-51** TASKS.md | read the F3 entry | Present, Vietnamese style consistent with siblings, and explicitly does **not** overstate — states "**Chưa kiểm chứng qua trình duyệt thật**". |

### Regression gates re-confirmed after the edits

- **F2 pilot panel** (`SubmissionDetail.tsx:164–222`): zero interactive descendants (only Card/Alert/Table/`<pre>`/`<p>`/`<h2>` — no button/input/textarea/select/anchor); `Alert` is a bare `<div>`; "never sent" notice still rendered via `t('submissions.pilotNotSentNotice')`. **PASS**
- **Scope**: `git status` — only `services/dashboard/**`, `docs/**`, root `TASKS.md`/`PROGRESS.md`, `.claude/settings.json` (harness), and the **4 new `.dockerignore` files** outside `services/dashboard`. Zero source changes under `services/core-api`, `services/zalo-gateway`, `services/grading-worker`, `infra/`. **PASS**
- **API/transport contract** (node AST-ish diff HEAD vs worktree, 83→84 entries): the single delta is a `"/"` string inside a **comment** in `Criteria.tsx` — no real call. Every `api.*`/`fetch` first-arg, `/api/*` literal, `method`/`credentials`/`Content-Type`/`URLSearchParams`/`append` option identical. Criteria raw multipart `fetch('/api/criteria', {method:'POST', credentials:'include', body: FormData})` with `name="courseId"`/`name="file"` inside native `<form>`; Reports 6× plain `<a href={exportUrl(...)}>`; native `<audio controls src=/api/media/:id>`; Login `navigate('/settings')`; role gating in `ProtectedShell` unchanged. **PASS**
- **Build gate (run, not assumed)**: `MSYS_NO_PATHCONV=1 docker run … node:24-alpine sh -c "npm ci && npm run build"` → `npm ci` clean (lockfile in sync), `tsc -b && vite build` 0 errors, 80 modules, `dist/assets/index-*.css 17.43 kB`. Artifacts (`node_modules/`,`dist/`,`tsbuildinfo`) removed afterward; tree source-only. **PASS**
- **Existing suites**: core-api jest **99/99** (19 suites), zalo-gateway jest **26/26** (5 suites), grading-worker pytest **60/60**. dashboard has no test script. **PASS**
- **Live-stack read-only bonus** (stack already up): Caddy serves the SPA `https://localhost/` → 200 `text/html`; unauth `GET /api/students` and `/api/settings` → 401 (runtime auth gating intact). Not a substitute for the browser-only ACs below.

### Requires live-stack browser verification (still NOT covered — no browser automation)

AC-14, AC-15, AC-24…AC-29, AC-31…AC-38, AC-40…AC-47, AC-52 (runtime/visual halves). Static/source
equivalents verified as in round 1. These remain for owner acceptance.

### Round 2 verdict: **PASS** — no open defects.

## Blockers / open questions

- No browser automation available ⇒ the [BR] class of ACs stays unverified in this environment
  (owner acceptance step, not a defect).

## Notes for the next role

Frontend: two small fixes. (1) Delete the 3 unused `nav.*` language-switcher keys from both locale
blocks in `src/i18n/index.ts` (or implement the switcher — but that is out of F3 scope per F3-ba §6.2).
(2) In `App.tsx`, add `aria-label={item.label}` to the rail-mode `<Link>`s (`:91`) and
`aria-label={t('nav.logout')}` to the logout `<Button>` (`:106`) so icon-only controls keep an
accessible name at the `md` breakpoint. Nothing else needs to change — every Tier-1 contract and
safety gate passed.
