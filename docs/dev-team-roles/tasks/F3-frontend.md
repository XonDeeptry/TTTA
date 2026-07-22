# F3 · Frontend — Dashboard UI redesign

- **Owner role:** frontend
- **Feature:** F3 — Reskin all 9 dashboard pages + shell with Tailwind + shadcn/ui. UI-only, no backend changes.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F3-ux.md`, `docs/dev-team-roles/tasks/F3-ba.md`, `docs/dev-team-roles/tasks/F3-pm.md`

## Inputs (what this role received)

- F3-ux.md: full design spec — LMS teal palette (tokens in §1), Inter/system-font typography (§2), collapsible sidebar shell (§3), 11 hand-authored shadcn primitives (§4: Button, Input, Textarea, SelectNative, Table, Card, Badge, Alert, Label, Separator, Tooltip), 5 patterns (§5 A-E), per-page notes (§6), 12 new i18n keys (§7), a11y rules (§8).
- F3-ba.md: exhaustive per-page behavior inventory + 52 ACs. Highest-risk items: Criteria upload form `name` attrs inside native `<form>`, Students uncontrolled `defaultValue` inputs (partial-patch), SubmissionDetail pilot panel zero-interactive-controls (F2 safety gate).
- F3-pm.md: 11 stories S1-S11, DoD (behavior-identical reskin), out-of-scope (no backend/API changes, no dark mode, no new pages).

## Checklist

- [x] S1: Tailwind + PostCSS config, CSS vars/tokens, `lib/utils.ts` cn(), hand-authored shadcn primitives, font strategy, path alias — build verified
- [x] S2: App shell reskin (sidebar, nav, role gating, logout)
- [x] S3: Login reskin
- [x] S4: Settings reskin
- [x] S5: Onboarding reskin
- [x] S6: Students reskin (uncontrolled inline edit preserved)
- [x] S7: Submissions reskin (status filter, pagination)
- [x] S8: SubmissionDetail reskin (F2 pilot panel zero-interactive verified)
- [x] S9: Reports reskin (plain `<a>` exports preserved)
- [x] S10: Criteria reskin (raw multipart form preserved)
- [x] S11: Monitoring reskin
- [x] Final build verification: `npm ci && npm run build` clean

## Outputs

Files created: `tailwind.config.ts`, `postcss.config.js`, `src/index.css`, `src/lib/utils.ts`, `src/components/ui/{button,input,textarea,select-native,table,card,badge,alert,label,separator,tooltip}.tsx`. Modified: `package.json`/`package-lock.json` (runtime deps added: `clsx`, `tailwind-merge`, `class-variance-authority`; dev deps added: `tailwindcss`, `postcss`, `autoprefixer`; icons are hand-authored SVG in `src/components/icons.tsx` — no icon package, no `tailwindcss-animate`, no Radix, no shadcn CLI was installed), `vite.config.ts` (path alias), `tsconfig.json` (path alias), `index.html`, `src/main.tsx`, `src/App.tsx`, all 9 page files, `src/i18n/index.ts` (+12 keys ×2 locales).

Build result: `npm install && npm run build` clean (0 errors); `npm ci && npm run build` clean (lockfile valid). CR checks passed: F2 pilot-panel subtree grep = 0 interactive-control matches; Criteria multipart fetch/`name` attrs preserved; no blob/createObjectURL/download= anywhere; `<audio controls src>` preserved; no shadcn-CLI/degit/curl in package.json/Dockerfile; Login still `navigate('/settings')`; i18n vi/en key parity 119/119, no orphaned `t()` calls (later corrected to 116/116 after QA round 1 D1 fix — see below). `git status` confirms all dashboard changes scoped to `services/dashboard/**` (+ this task-file family).

## QA round 1 fixes

QA round 1 (`docs/dev-team-roles/tasks/F3-qa.md`) returned FAIL with 3 defects. All fixed:

- [x] D2 (medium, a11y regression): icon-rail nav `<Link>`s (App.tsx `md:flex … lg:hidden` block) and the logout `<Button>` had no accessible name at the `md` breakpoint — `Tooltip`'s label is a sibling `<span role="tooltip">`, not wired via `aria-labelledby`/`aria-describedby`, and `IconBase` sets `aria-hidden="true"`. Fixed by adding `aria-label={item.label}` to each rail `<Link>` and `aria-label={t('nav.logout')}` to the logout `<Button>`, both sourced from existing i18n keys — no new hardcoded strings, no visual change.
- [x] D1 (low, dead i18n keys): removed `nav.languageSwitcher`, `nav.switchToVietnamese`, `nav.switchToEnglish` from both vi and en blocks in `src/i18n/index.ts` (unused — the optional language switcher was never implemented, per F3-ba §6.2 out-of-scope). vi/en key-set parity preserved (116/116 each after removal).
- [x] D3 (low, documentation accuracy): corrected the Outputs section above — `tailwindcss-animate` and `phosphor-react` were never actually added; the real dependency set is `clsx`/`tailwind-merge`/`class-variance-authority` (runtime) + `tailwindcss`/`postcss`/`autoprefixer` (dev), with hand-authored SVG icons in `src/components/icons.tsx`.
- [x] AC-51 close-out: added one concise Vietnamese-style entry to root `TASKS.md` recording the F3 dashboard reskin (UI-only, zero backend changes, build/verification status, no live-browser verification done).
- [x] Final re-verification: `npm ci && npm run build` clean via Docker; leftover `node_modules/`, `dist/`, `tsconfig.tsbuildinfo` deleted from `services/dashboard/` afterward.

## Blockers / open questions

—

## Notes for the next role

QA: F2 pilot panel zero-interactive-controls verified by grep of the pilot `<section>` subtree in SubmissionDetail.tsx — see final report for the exact command run.
