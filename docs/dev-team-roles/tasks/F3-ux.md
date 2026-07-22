# F3 · UX — Dashboard UI redesign design spec

- **Owner role:** ux
- **Feature:** F3 — Reskin all 9 dashboard pages + shell with Tailwind + shadcn/ui. UI-only, no backend changes.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F3-pm.md`, `docs/dev-team-roles/tasks/F3-ba.md`

## Inputs (what this role received)

- `F3-pm.md`: 11 stories (S1 build foundation, S2 shell, S3-S11 pages), DoD (behavior-identical reskin), out-of-scope list (no backend/API/schema change, no new pages, no dark mode). Nav may move to sidebar. shadcn hand-authored (no CLI).
- `F3-ba.md`: exhaustive per-page behavior inventory (§1), 52 numbered ACs, and the BA's own note-to-UX (§7): the 9 pages collapse to 4 reusable patterns (auth form, data-table+filter+pagination, detail/review page, config/form page) plus the shell — design those, not 9 bespoke screens. Hard constraints carried forward: F2 pilot panel must stay zero-interactive-controls; Reports exports/`<audio>` must stay plain `<a>`/native `<audio>`, never JS-driven; Criteria upload form `name` attrs must stay inside the native `<form>`; Students/Criteria patch-payload shapes must not change (native inputs only, no Radix Select/Checkbox that don't participate in `FormData`/`defaultValue` semantics the same way).
- Read directly: `App.tsx`, `i18n/index.ts`, and all 9 page files in `services/dashboard/src/pages/`.
- `ui-ux-pro-max` skill database (queried live, see §1 for exact query strings and matched entries).

## Checklist

- [x] Read F3-pm.md, F3-ba.md, App.tsx, i18n/index.ts, all 9 pages
- [x] Query `ui-ux-pro-max` skill for education/school-management admin dashboard: palette, font pairing, style, UX guidelines, icons (React/Tailwind/shadcn stack)
- [x] Design tokens (CSS variables + tailwind.config values, light mode only)
- [x] Typography scale + font loading strategy (no runtime CDN dependency)
- [x] App shell spec (sidebar decision, responsive behavior, nav treatment, logout, language switcher placement, role-gated items)
- [x] Component inventory (shadcn primitives -> pages)
- [x] Per-pattern layout specs (5 patterns: auth, data-table+filters, detail/review, config/form, status/monitoring) incl. states
- [x] Per-page notes (9 pages) incl. F2 pilot panel read-only constraint, native `<audio>`/`<a>`/multipart-form preservation
- [x] New i18n keys (vi + en) for any new copy introduced by the design
- [x] Accessibility notes (focus rings, contrast, th/labels, keyboard)
- [x] Write full spec into this file's Outputs section
- [x] Set Status DONE

## Outputs

Full design spec (§1–§9 below). One-line summary: palette = **LMS (Learning Management System)** entry from the ui-ux-pro-max color database (teal `#0D9488` / amber `#D97706` / grade-green `#16A34A`), adapted with **Data-Dense Dashboard** style's neutral-chrome density guidance; font pairing = **Minimal Swiss** (Inter, single family) self-hosted via `@fontsource/inter`; icons = **Phosphor** (Outline, regular weight); shell = collapsible left sidebar (240px → 64px rail → off-canvas drawer); 11 hand-authored shadcn primitives; 5 shared patterns power all 9 pages + shell; 12 new i18n keys × 2 locales = 24 new entries, zero existing keys touched.

---

### 0. How the `ui-ux-pro-max` skill was queried (traceability)

Ran (full transcript in this session, not reproduced here):
1. `"education school management admin dashboard back-office internal tool" --design-system --density 8 --variance 3 --motion 2` → returned a landing-page-shaped pattern ("Real-Time / Operations Landing" + "Exaggerated Minimalism") that doesn't fit a dense internal CRUD tool, but its **Colors** block was the **LMS (Learning Management System)** palette and its **Typography** block was the **Dashboard Data** pairing (Fira Code/Fira Sans) — both re-evaluated below against more targeted queries rather than accepted verbatim.
2. `--domain product "admin dashboard internal tool back office CRUD"` and `--domain product "education school learning center"` → the second surfaced **LMS (Learning Management System)** as product type #6, keywords `lms, course-management, learning-management, ..., gradebook, assignment-submit` — a strong semantic match to "homework-grading back-office."
3. `--domain color "education calm blue trustworthy grade green LMS admin"` → **LMS** was result #1 again (independent confirmation), with the same hex values as query 1. This palette is used as-is for the semantic/brand layer (§1).
4. `--domain style "clean minimal SaaS admin dashboard data table"` → result #1, **Data-Dense Dashboard** (BI/Analytics category): neutral chrome, KPI/table-first, 8–12px padding, 12–14px type, 240px sidebar, 56px header, sticky headers. Used for shell/table density parameters (§1, §3, §5).
5. `--domain typography "clean readable dashboard admin professional UI text"` → 8 pairings returned; picked **Minimal Swiss** (Inter/Inter) — "Best For: Dashboards, admin panels, documentation, enterprise apps, design systems," explicitly naming this product category (§2).
6. `--domain icons "admin dashboard sidebar navigation icons outline"` → **Phosphor**, Outline style, `weight="regular"`, repeatedly recommended for `sidebar`, `house`, `list` (hamburger), `grid-four`, `arrow-left` (§3, §4).
7. `--domain ux "data table pagination status badge empty state loading skeleton"` and `--domain ux "form validation inline error accessible focus"` → general UX guideline rows cited inline in §5/§8 where they apply, and explicitly **overridden** where they conflict with BA's frozen-behavior constraints (§0.1 below).
8. `--stack shadcn "shadcn table card badge form"` → generic shadcn stack guidance (React Hook Form + Zod for forms, TanStack Table for DataTable) — **not adopted**, see §0.1.

#### 0.1 Deliberate deviations from generic `ui-ux-pro-max` guidance (and why)

The skill's generic recommendations assume a greenfield build. F3 is a **behavior-frozen reskin** (F3-pm DoD, F3-ba §5 assumptions). Where the two conflict, the frozen-behavior constraint wins. Documented here so Frontend doesn't "fix" these back in:

| Generic DB/stack guidance | Why it's not used here |
|---|---|
| shadcn stack: use React Hook Form + Zod (`<FormField>`) for all forms | Would convert Students'/Onboarding's/Settings' uncontrolled `defaultValue` inputs and Criteria's native `FormData` upload into controlled RHF state — changes the exact PATCH/PUT/multipart payloads BA's AC-11/14/15/16 freeze. **Not used.** Forms stay native `<form>`/`<input>` elements, shadcn-styled only. |
| shadcn stack: use TanStack Table (`useReactTable`) for DataTable | No sorting/filtering/column-visibility exists today and PM lists "sorting, column visibility toggles" as explicitly out of scope. **Not used.** Plain shadcn `Table` primitives over the existing `.map()` rendering. |
| UX guideline: show skeleton/spinner for loads > 300ms | BA global fact: no loading state exists anywhere; `ProtectedShell`/`SubmissionDetail` render `null` while loading, and AC-27 explicitly says "no spinner introduced that changes redirect timing." **Not used.** Loading stays a blank/`null` render; **no `Skeleton` component** in the inventory (§4). |
| UX guideline: show helpful empty-state message + action | BA: Students/Submissions/Reports/Criteria-classes/Monitoring-sheets-log tables render "header + empty body, no empty-state copy" today; PM assumption 3 explicitly forbids new empty-state illustrations/copy. **Not used**, except Onboarding's `onboarding.empty`, which already exists — it is restyled, not reworded or duplicated elsewhere. |
| UX guideline: bulk actions (checkbox column + action bar) | New feature, out of scope. **Not used.** |
| First design-system pass's landing pattern / "Exaggerated Minimalism" oversized-type style | Wrong shape for a dense internal CRUD tool (it's a marketing-landing pattern). **Not used** — superseded by the **Data-Dense Dashboard** style match in query 4. |
| Dark mode support (several matched style/palette entries support it) | PM: "no dark mode... light mode is out of scope" for F3. **Not used** — tokens below are light-mode only. |

---

### 1. Design tokens

Base palette = **LMS (Learning Management System)** from the `ui-ux-pro-max` color database, hex values as returned. Two adaptations, both explained (this is a dense, all-day internal tool, not a marketing surface):

- **Background/foreground/border/muted** are pulled toward neutral slate (per the **Data-Dense Dashboard** style's own guidance: "Neutral primary... dark text") instead of the DB's tinted `#F0FDFA`/`#134E4A`/`#5EEAD4`, so 14px table text stays maximally legible over long sessions and doesn't fight with status-badge colors for attention. The teal stays the *brand/interactive* color (primary buttons, links, focus ring, active nav) rather than a background wash.
- Two semantic aliases (**success**, **warning**) are added on top of the raw shadcn set, needed for status badges (§5); **warning** = the DB's own Accent amber, **success** = a standard grade-green (matches the DB's own "grade green" note on the LMS entry).

All values below are ready to drop into a shadcn-convention `src/index.css` (`:root { ... }`, space-separated HSL triplets so `hsl(var(--x))` works) and a Tailwind theme extension. Hex given alongside each for traceability back to the DB match.

```css
/* src/index.css — :root, light mode only */
:root {
  --radius: 0.5rem; /* 8px base; buttons/inputs use calc(var(--radius) - 2px) = 6px */

  --background:          210 40% 98%;   /* #F8FAFC — neutral (adapted from DB's #F0FDFA) */
  --foreground:          222 47% 11%;   /* #0F172A — neutral slate-900 (adapted from DB's #134E4A) */

  --card:                0 0% 100%;     /* #FFFFFF */
  --card-foreground:     222 47% 11%;   /* #0F172A */

  --popover:             0 0% 100%;
  --popover-foreground:  222 47% 11%;

  --primary:             175 84% 32%;   /* #0D9488 — LMS DB primary (teal-600), unchanged */
  --primary-foreground:  0 0% 100%;     /* #FFFFFF */

  --secondary:           172 66% 50%;   /* #2DD4BF — LMS DB secondary (teal-400), unchanged */
  --secondary-foreground: 222 47% 11%;  /* #0F172A — LMS DB "on-secondary", adjusted to match neutral fg */

  --accent:              32 95% 44%;    /* #D97706 — LMS DB accent (amber-600), unchanged */
  --accent-foreground:   0 0% 100%;

  --muted:               195 35% 93%;   /* #E8F1F4 — LMS DB muted, unchanged (already near-neutral) */
  --muted-foreground:    215 16% 47%;   /* #64748B — LMS DB muted-foreground, unchanged */

  --border:              214 32% 91%;   /* #E2E8F0 — neutral slate-200 (adapted from DB's bright #5EEAD4) */
  --input:               214 32% 91%;   /* same as border */
  --ring:                175 84% 32%;   /* #0D9488 — same as primary (shadcn convention) */

  --destructive:         0 72% 51%;     /* #DC2626 — LMS DB destructive, unchanged */
  --destructive-foreground: 0 0% 100%;

  /* Extended semantic layer, not in base shadcn set, needed for status badges/alerts */
  --success:             142 76% 36%;   /* #16A34A — grade green, matches DB's "grade green" note */
  --success-foreground:  0 0% 100%;
  --warning:             32 95% 44%;    /* #D97706 — alias of --accent, named for clarity in badge code */
  --warning-foreground:  0 0% 100%;

  --shadow-sm: 0 1px 2px 0 rgb(15 23 42 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06);
}
```

Tailwind theme extension (mapping into `tailwind.config`'s `theme.extend`):

```js
colors: {
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
  popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
  primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
  secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
  accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
  muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
  destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
  success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
  warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
},
borderRadius: {
  lg: 'var(--radius)',            // 8px — Card
  md: 'calc(var(--radius) - 2px)', // 6px — Button/Input/Select
  sm: 'calc(var(--radius) - 4px)', // 4px
},
fontFamily: {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
},
boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)' },
```

Spacing/density (from the **Data-Dense Dashboard** style match): page content padding `p-6` (24px) desktop / `p-4` (16px) mobile; vertical rhythm between sections `space-y-6`; card padding `p-4`–`p-6`; table cell padding `px-3 py-2`; table row height `h-10` (40px, a touch taller than the DB's 36px minimum since this is desktop-mouse-driven, not touch); sidebar width `240px` expanded / `64px` collapsed rail; header bar (mobile only) `48px`.

---

### 2. Typography

**Minimal Swiss** pairing (Inter, single family, weights 400/500/600/700) — chosen over "Dashboard Data" (Fira Code headings read as a dev/analytics tool, wrong tone for center-office staff) and "Corporate Trust" (Lexend+Source Sans 3, two font families = larger self-hosted payload for no real benefit at this density). Inter has first-class Vietnamese/Latin-Extended diacritic coverage and strong tabular-figure support, both directly relevant here (bilingual UI + numeric score/cost columns).

**Loading strategy — no CDN, no runtime network dependency (NFR N3 / AC-08 forbid a Google Fonts `<link>`):**
- Primary recommendation: `npm install @fontsource/inter` (an ordinary npm dependency, resolved during the existing `npm ci` step — no extra network access at Docker build time, consistent with AC-03's "only network access during `docker compose build dashboard` is `npm ci`"). Import the four weights needed once in `src/main.tsx`, before `./index.css`:
  ```ts
  import '@fontsource/inter/400.css';
  import '@fontsource/inter/500.css';
  import '@fontsource/inter/600.css';
  import '@fontsource/inter/700.css';
  ```
  This bundles woff2 files through Vite's normal asset pipeline; zero runtime fetch to any external host.
- Zero-dependency fallback (if Frontend wants to avoid adding any new package at all): drop `@fontsource/inter` and use a pure system-font stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` as `fontFamily.sans` directly. Visually close to Inter (Segoe UI/San Francisco/Roboto are all similar-era grotesques), renders Vietnamese diacritics correctly on every target OS, literally zero added risk. Either choice satisfies N3; the `@fontsource` route just looks slightly more consistent across the admin's and the OA's/browser's own OS.

**Scale** (14px base for dense UI, per Data-Dense Dashboard's 12–14px guidance; never below 12px per the general "Text < 12px body" anti-pattern):

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `text-h1` | 24px / 1.5rem | 600 | 1.3 | Page title (`<h1>` per page) |
| `text-h2` | 18px / 1.125rem | 600 | 1.4 | Section heading (`<h2>` within a page) |
| `text-h3` | 16px / 1rem | 600 | 1.4 | Card title / subsection |
| `text-body` | 14px / 0.875rem | 400 | 1.5 | Default UI text, form labels, buttons, table cells |
| `text-table-head` | 13px / 0.8125rem | 600 | 1.3 | `<th>` text — uppercase, `tracking-wide`, `text-muted-foreground` |
| `text-caption` | 12px / 0.75rem | 400 | 1.4 | Timestamps, masked-value placeholder text, pilot provider/model line, badge text |

Numeric table columns (scores, costs, counts, dates rendered as numbers) get `font-variant-numeric: tabular-nums` so digits align vertically — a Tailwind utility class (`tabular-nums`) applied per cell, no new dependency.

---

### 3. App shell

**Decision: collapsible left sidebar**, not a top bar. Rationale: the **Data-Dense Dashboard** style match treats `--sidebar-width` as a first-class variable, and the **Phosphor** icon results independently surfaced sidebar-specific icons (`Sidebar`, `House`, `List`) reinforcing this as the idiomatic pattern for the product type. A sidebar also scales to 7 nav destinations + logout + language switcher without the current top bar's `flexWrap` wrapping, and matches PM's own directional brief ("English Center Management system" admin conventions). PM assumption 4 permits the move provided all destinations + role-gating survive — they do (§3 below), unchanged from `App.tsx`'s current logic.

**Structural decision to satisfy AC-32 ("exactly one `<main>` landmark per page")**: the shell renders `<aside>` (sidebar) + a plain content wrapper `<div className="flex-1 ...">{children}</div>` — **not** a `<main>`. Each of the 9 pages keeps owning its own `<main>` exactly as today. This touches only `App.tsx`'s `ProtectedShell`, not any page file, minimizing blast radius on the highest-risk files (Students, Criteria, SubmissionDetail).

**Responsive behavior:**
- **≥1024px (`lg`)**: sidebar fixed, 240px, expanded — icon (20px Phosphor Outline, `weight="regular"`) + i18n label per nav item, horizontal layout.
- **768–1023px (`md`)**: sidebar auto-collapses to a 64px icon-only rail. A toggle button (Phosphor `Sidebar` icon, `aria-label={t('nav.toggleMenu')}`, `aria-expanded`) at the top of the rail lets staff pin it open; state persisted in `localStorage` (a pure client-side UI preference — no new `/api` call, doesn't touch the `settings` allow-list). Rail-mode items show a `Tooltip` with the label on hover/focus.
- **<768px**: sidebar becomes an off-canvas drawer (`shadow-md`, slides from left, `w-64`), hidden by default. A slim sticky top bar (48px) appears with a hamburger (Phosphor `List`, same `nav.toggleMenu` key, `aria-expanded`) and the current page title. Content area is full width; every table gets an `overflow-x-auto` wrapper div (per the UX-DB "Table Handling" guideline: horizontal scroll inside its own container, never page-level overflow) — satisfies AC-45 ("horizontal scroll acceptable, content loss is not").
- A visually-hidden skip link (`nav.skipToContent`, first focusable element, jumps to each page's own `<main>` via `href="#main-content"` — pages get `id="main-content"` on their existing `<main>`, a purely additive attribute) precedes the sidebar for keyboard users.

**Nav item treatment:**
- Icon (Phosphor Outline, `weight="regular"`, 20px) + label, `gap-3`, `px-3 py-2`, `rounded-md`.
- **Active state** (current route): `bg-primary/10 text-primary` + a 3px left border in `--primary` (`border-l-2 border-primary`) — adapted for a vertical rail from the UX-DB's own "Active State" guideline (`text-primary border-b-2` is the horizontal-nav version of the same idea).
- **Inactive**: `text-foreground/70`, hover `bg-muted`.
- **Focus-visible** (keyboard): `ring-2 ring-ring ring-offset-2 ring-offset-background` on every item — no page introduces a focus trap.
- 7 destinations in this exact order (unchanged from `App.tsx`): Monitoring*, Settings*, Onboarding, Students, Submissions, Reports, Criteria (`*` = admin-only, see below).

**Role-gated items:** `nav.monitoring`/`nav.settings` render only when `user.role === 'admin'`, identical to today's `user.role === 'admin' && <Link>`. **Do not** render a visible-but-disabled/locked stub for staff — current behavior fully omits these two links for staff (AC-24 requires "staff sees neither"), and a disabled entry would leak that admin-only features exist, which is a behavior change.

**Logout control:** bottom of the sidebar, below a `Separator`, distinct from the nav list — icon (Phosphor `SignOut`) + `nav.logout` label, `variant="ghost"` Button (not primary-colored — it's a normal action, not a warning). Same `logout().then(() => navigate('/login'))` call, unchanged.

**Language switcher (placement, with an explicit scope caveat):** F3-ba's own open question #2 records that no switcher exists today and rules it out-of-scope for F3's behavior-freeze pass; this UX task was nonetheless explicitly asked to place one. Resolution: **designed here, optional to implement.** If Frontend/PM decide to include it in F3, it lives in the sidebar footer, just above the Logout row — a compact two-segment toggle group ("VI" | "EN"), active segment `bg-primary text-primary-foreground`, calling `i18n.changeLanguage('vi'|'en')` client-side only (zero network calls, zero `/api` surface, doesn't touch the `settings` table/Redis `config:*` — a pure `i18next`/`localStorage` client preference). `aria-label={t('nav.languageSwitcher')}` on the group; each segment gets `aria-label={t('nav.switchToVietnamese')}` / `t('nav.switchToEnglish')` respectively; current language additionally exposed via `aria-pressed`. **If Frontend skips it** (stricter reading of "no new features"), that is equally valid — no AC in F3-ba's 52 depends on it, so QA does not gate on its presence either way.

---

### 4. Component inventory (hand-authored shadcn primitives, `src/components/ui/`)

Kept minimal — only what the 9 pages actually need. **No `Skeleton`** (§0.1: no loading UI exists to skeleton-ize). **No Radix-based `Select`/`Checkbox`** for the two places that need native form semantics (§0.1/§6) — see "SelectNative" below. **No `ScrollArea`** for the pilot transcript — kept as a plain `overflow-y-auto` div to avoid any Radix-internal button/thumb near the F2 zero-interactive-controls boundary.

| Primitive | Variants/parts needed | Pages that use it |
|---|---|---|
| `Button` | `default` (primary teal), `secondary`, `outline`, `ghost`, `destructive`, `link`; sizes `sm`/`default`/`icon` | All 9 pages + shell (logout, sidebar toggle) |
| `Input` | native `<input>`, shadcn border/focus styling only — `type`, `required`, `defaultValue`/`value`, `name`, `placeholder`, `onChange` all pass through unchanged | Login, Settings, Onboarding, Students, Reports, Criteria |
| `Textarea` | native `<textarea>`, same pass-through discipline | SubmissionDetail (reviewedFeedback) |
| `SelectNative` | a **native `<select>`** element styled to look like shadcn's `Select` (border, chevron via Phosphor `CaretDown` as a decorative `::after`/absolute icon, focus ring) — explicitly **not** Radix `Select`, to keep `defaultValue`/`value`+`onChange` byte-identical to today (§0.1) | Settings (boolean true/false), Submissions (status filter) |
| `Table` (+`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`) | semantic `<table>`/`<thead>`/`<tbody>`/`<th scope="col">`/`<td>` | Students, Submissions, Reports (×3), Criteria (classes config), Monitoring (queues), SubmissionDetail (pilot comparison table) |
| `Card` (+`CardHeader`/`CardTitle`/`CardContent`) | visual grouping only — never wraps a `<form>` in a way that changes its DOM position relative to its inputs | Login, SubmissionDetail (2 panels), Monitoring (4 sections), Reports (3 sections), Criteria (upload + lookup + classes sections) |
| `Badge` | `default` (teal/primary), `secondary` (neutral/slate), `success` (green), `warning` (amber), `destructive` (red), `outline` | Submission/queue/token/disk status everywhere (§5) |
| `Alert` | `default`, `warning`, `destructive` — **plain informational variant only, no built-in dismiss button on any instance used in this app** | Login error, Criteria upload error, SubmissionDetail pilot notice, Monitoring token/disk alerts |
| `Label` | native `<label htmlFor>` / visually-hidden (`sr-only`) variant | All forms |
| `Separator` | horizontal rule | Sidebar (nav/logout split), Card sections |
| `Tooltip` | hover/focus-triggered label | Sidebar rail-mode icons |

---

### 5. Per-pattern layout specs

#### Pattern A — Auth screen (Login)
- Centered `Card`, `max-w-sm` (384px), vertically centered in viewport (`min-h-screen flex items-center justify-center`, `bg-background`).
- `CardHeader`: `text-h1` title (`login.title`). `CardContent`: form, `space-y-4`.
- Each field: existing `<label>{text}<input/></label>` wrapping pattern **preserved as-is** (already a valid implicit label) — just shadcn-`Input`-styled, `type="email"`/`type="password"`, `required` untouched.
- Error: `Alert variant="destructive"`, `role="alert"` preserved, rendered between fields and submit button; cleared at the start of each submit (unchanged logic).
- Submit: `Button` full-width, `type="submit"`, never disabled (unchanged — no in-flight lock is being added).
- States: no loading state (unchanged — Login has none today), no separate empty state (n/a for a form).

#### Pattern B — Data table + filters + pagination
Used by: Students, Submissions, Reports (×3 instances), Criteria's classes-config table, Monitoring's queues table.
- Page: `<main id="main-content">`, `p-6`, `space-y-6`.
- `<h1 className="text-h1">` page title, full existing text.
- Optional filter bar directly under the title: search `Input` (Students) or `SelectNative` (Submissions) — `flex items-center gap-3`, `max-w-sm` for the control itself, page stays full-width otherwise (a deliberate change from today's narrow `maxWidth:900,margin:auto` centering — full-width better fits a dense dashboard and gives tables room).
- Table wrapped in `overflow-x-auto` (mobile-safe, §3) inside a `Card` with no extra padding around the table itself (`CardContent className="p-0"`) so header/rows run edge-to-edge inside the card border.
- `<TableHead>` uses `text-table-head` styling (13px, 600, uppercase, `tracking-wide`, `text-muted-foreground`), `scope="col"` implicit via the `TableHead` component.
- Row height `h-10`, `px-3 py-2` cells, zebra optional (`odd:bg-transparent even:bg-muted/30` — subtle, doesn't fight status badges for attention).
- **States**: no loading spinner (unchanged), no empty-state copy beyond what exists today (§0.1) — an empty table shows header + zero `<TableRow>`s, same as now, just restyled.
- **Pagination** (Students, Submissions): `flex items-center gap-2 mt-4`. Prev/Next stay `←`/`→` glyph `Button variant="outline" size="icon"`, `disabled` logic unchanged (`page<=1`/`page>=totalPages`), **new** `aria-label={t('pagination.previous')}`/`t('pagination.next')` (glyphs are decorative, not accessible names today — a gap; fixed here, additively, no new key needed beyond the two listed in §7). Page status text `{page} / {totalPages}` unchanged, plain text between the two buttons.
- **Status rendering** (submission `status`, queue `dlqDepth`, monitoring alerts) — Badge variant mapping, used consistently everywhere a status renders:

  | Value | Badge variant | Notes |
  |---|---|---|
  | `received` | `secondary` (neutral slate) | just arrived, no action yet |
  | `processing` | `default` (teal/primary) | actively being worked |
  | `graded` | `success` (green) | LLM finished, pipeline step complete |
  | `awaiting_review` | `warning` (amber) | needs a human — matches DB's "course amber" |
  | `sent` | `success` (green, solid) | delivered — final positive state |
  | `failed` | `destructive` (red) | matches DB's destructive red |
  | queue `dlqDepth > 0` | `destructive` badge showing the count | draws the eye to the one row Retry is enabled on |
  | queue `dlqDepth === 0` | `secondary` badge showing `0` | quiet/neutral |

  **Status text itself stays the raw untranslated API value** inside the badge (AC-21 — `received`/`processing`/etc. are not translation keys); only the badge *color* is derived from it, never the label text.

#### Pattern C — Detail/review page (SubmissionDetail)
- `<main id="main-content" className="p-6 max-w-5xl">` (this one page keeps a max-width — a long-form review screen benefits from a readable measure, unlike the table pages).
- Back link: `Link` styled as a `Button variant="ghost" size="sm"` with a Phosphor `ArrowLeft` icon — the `←` glyph already baked into the `submissions.back` key's translated string is kept as the button's text (do not strip it out or double up on arrows — use the icon **or** keep the glyph, not both; recommend using the icon and letting the key's leading `←` render redundantly small, since editing the key text is out of scope for a UI-only pass — simplest safe choice: keep the Link as plain text like today, just shadcn-Button-styled, no separate icon added, so nothing about the key's content matters).
- `<h1 className="text-h1">{student name}</h1>` directly under the back link.
- Audio: **unchanged** `<audio controls src={'/api/media/' + data.id} className="w-full mt-4">` (native element, not a JS player) or the `submissions.noMedia` message inside a `<p className="text-muted-foreground">` — logic untouched.
- Grading block (`data.grading &&`): two-column `flex flex-wrap gap-6` layout (already exists inline today) becomes two `Card`s side by side (`flex-1 min-w-[320px]` each), unchanged breakpoint behavior (wraps to stacked on narrow viewports, same as the current inline flex-wrap).
  - Left `Card` ("official/audio grading"): headings stay `text-h2`; scores `<ul>` → keep as a `<ul>` (a `Table` would be a bigger structural change for no behavior gain) styled with `space-y-2`, each item `dimension` in `font-medium`, `score` as a `Badge variant="outline"`, `comment` as body text. `llmFeedback` paragraph unchanged. `reviewedFeedback` `Textarea rows={5}` — controlled, `value`/`onChange` unchanged. Action row `flex gap-2 mt-4`: Save (`Button variant="outline"`), Send (`Button`, `disabled={!!data.grading.sentAt}` unchanged), Delete media (`Button variant="destructive"`, same `role==='admin' && mediaPath && !mediaDeletedAt` nesting **exactly preserved** — still nested inside `data.grading &&`, per BA's explicit warning). Message slot: single `<p className="text-sm text-muted-foreground mt-2">{message}</p>`, unchanged single-slot/never-cleared behavior.
  - Right `Card` ("pilot/text grading", `data.pilotTextGrading &&`) — **see the hard constraint immediately below.**
- Flags (`data.flags.length > 0 &&`): `<h2 className="text-h2">` + `<ul className="space-y-1">` of `f.reason`, each optionally prefixed with a small `Badge variant="warning"` icon-free "flag" marker — purely decorative, text unchanged.
- **States**: `if (!data) return null` **preserved verbatim** — the whole page (including the back link) stays absent until the GET resolves, no skeleton, no spinner (§0.1, AC-38).

**F2 pilot panel — hard safety constraint, restated because it is a product-safety gate (F3-ba §1.7, AC-39), not a styling preference:**
- Structure: `Card` → `CardHeader` (`text-h2` `pilotTextTitle`) → `CardContent`:
  1. `Alert variant="warning"` for `pilotNotSentNotice` — **use only the plain informational `Alert` (no `AlertDialog`, no close/dismiss button rendered by this instance)**.
  2. Comparison `Table` (`TableHeader`/`TableBody`) over `Object.keys(data.grading.scores)` exactly as today (audio dimensions, not pilot dimensions — preserve this exact derivation), 4 columns (`pilotScoreDimension`/`Audio`/`Text`/`Delta`), delta rendered `+n`/`n`/`—` unchanged.
  3. `pilotLlmFeedback` heading + paragraph.
  4. `pilotTranscript` heading + a **plain** `<div className="max-h-[200px] overflow-y-auto border border-border rounded-md p-3"><pre className="whitespace-pre-wrap text-sm">{transcript}</pre></div>` — explicitly **not** a `ScrollArea` component (§4 rationale).
  5. `pilotProviderModel` line, `text-caption text-muted-foreground`, interpolation unchanged (`{{provider}}`, `{{model}}`, `{{createdAt}}`).
- **Zero interactive elements anywhere in this Card**: no `Button`, `Input`, `Textarea`, `SelectNative`, `<a>`, `onClick`, `role="button"`, `contentEditable`, and — specific to component choice — **no dismiss/close affordance on the `Alert` instance used here** (shadcn's `Alert` primitive itself renders no button by default; do not add one, do not wrap it in `AlertDialog`). This must hold after the reskin exactly as it holds today (AC-39 grep + runtime check in F3-ba §4).

#### Pattern D — Config/form page
Used by: Settings, Onboarding, Criteria (upload sub-form + classes-config table, which is itself Pattern B for its table half).
- Page: `<main id="main-content" className="p-6 space-y-6">`. Form-shaped sections cap at `max-w-xl` (576px) even though the page itself is full-width (e.g., Criteria's upload form); table-shaped sections (classes config) use full width per Pattern B.
- **Settings**: table gets a **new** `<TableHeader>` with `<TableHead>{t('settings.key')}</TableHead>` / `<TableHead>{t('settings.value')}</TableHead>` / empty `<TableHead />` for the action column — today's table has **zero** header cells, a real accessibility gap (§7/§8). Boolean rows: `SelectNative` with the two literal (untranslated, per §0.1) `true`/`false` options — do not translate these two option labels. Masked rows: `Input type="password"`, `placeholder` = last-4 mask, `defaultValue=""` — unchanged. Save `Button size="sm"` per row; `settings.saved` marker as an inline `Badge variant="success"` next to the button, single-slot persistence unchanged.
- **Onboarding**: `<ul>` list stays a list (not a table — one row = one binding + inline activation form, doesn't fit tabular semantics any better as a table). Each `<li>` becomes a `Card` (`p-4 flex items-center justify-between gap-4 flex-wrap`). Empty state: `onboarding.empty` text, `text-muted-foreground`, **the only page in this pass allowed pre-existing empty-state copy** (§0.1). Phone `Input type="tel"` gets a new `sr-only` `<Label htmlFor>` reusing the existing `onboarding.phone` string (no new key — see §7). `onboarding.activated` marker: inline `Badge variant="success"`.
- **Criteria upload sub-form**: `<form onSubmit={upload}>` **structure untouched** — `name="courseId"` and `name="file"` inputs stay direct children of the same `<form>` element `new FormData(e.currentTarget)` reads (§0.1, AC-11). Shadcn-style the `Input` (courseId) and leave the file `<input type="file" accept=".docx" required>` essentially bare (native file inputs are hard to restyle without breaking `name`/`required` semantics — acceptable to leave it with only border/spacing utility classes, no custom "choose file" button overlay, which would risk detaching it from form semantics). Upload error: `Alert variant="destructive"`, `role="alert"` preserved. courseId lookup input (currently label-less, no placeholder either — a real gap) gets `aria-labelledby` pointing at the existing `<h2>{t('criteria.courseId')}</h2>` directly above it (give that `h2` an `id`, reference it — no new i18n key, §7). Preview `<pre>` gets a new `role="region" aria-label={t('criteria.previewRegion')}` wrapper — still no close control (preserved).

#### Pattern E — Status/monitoring dashboard (Monitoring)
- Four `Card`s stacked `space-y-6` (queues, token, sheets-sync, disk) — each with a `CardHeader`/`CardTitle` using the existing `monitoring.*` heading keys.
- Queues: Pattern B table inside the card; Retry `Button size="sm" variant="outline"`, `disabled={q.dlqDepth === 0}` unchanged; `monitoring.retried` marker as inline `Badge variant="success"`, single-slot unchanged.
- Token: plain text row when `hasAccessToken` and no alert (`text-body`, no `Alert` box — avoids visual noise on the common/happy path, matching today's plain-text treatment); when `token.alert` is set, render an `Alert variant="destructive"` (token failure blocks the whole send pipeline — treated as the more severe case) containing `monitoring.alert` + the raw alert string, appended after the ok/missing line exactly as today (`" — "` + `<strong>`). `token.expiresAt` **stays unrendered** (unchanged).
- Sheets sync: `<ul>` unchanged structure, `text-body`, each item's OK/error counts get subtle inline `Badge variant="secondary"`/`Badge variant="warning"` treatment around the numbers if `rowsError > 0`, else plain text — purely decorative, no logic change.
- Disk: `disk.alert === null` → plain text `diskOk`; non-null → `Alert variant="warning"` (a capacity heads-up, less urgent than the token failure) wrapping the `formatDiskAlert` output, `try/catch` JSON-parse fallback to the raw string **preserved exactly**.

---

### 6. Per-page notes

- **App.tsx / shell** — see §3 in full. Only file touched for the sidebar restructure; no page files need a `<main>`-tag change.
- **Login.tsx** — Pattern A. No behavior change; only the `<input>`/`<button>`/error paragraph get shadcn styling classes. `role="alert"` stays.
- **Settings.tsx** — Pattern D. **New `<TableHeader>`** (real accessibility gap fix, §5/§8) is the only structural addition; value-coercion logic (`Settings.tsx:26`), the boolean/masked/text branching, and the untouched-row-sends-empty quirk are all preserved verbatim — do not switch any input from uncontrolled (`defaultValue`) to controlled.
- **Onboarding.tsx** — Pattern D (list-of-cards variant). `displayName ?? zaloUserId` + `(zaloUserId)` rendering preserved exactly, including the `u1 (u1)` look when `displayName` is null. No Cancel/close control added anywhere (none exists today).
- **Students.tsx** — Pattern B. **Highest care point**: inline-edit `<input defaultValue={...} onChange={...}>` must stay **uncontrolled native inputs**, not shadcn `Input` wired through any controlled-state helper that would seed all fields — the partial-PATCH-only-edited-fields behavior (AC-14) depends on `draft` only gaining a key on `onChange`. `code` stays read-only text in edit mode; no Cancel control added.
- **Submissions.tsx** — Pattern B. Status filter = `SelectNative` (native `<select>`, not Radix) with the same hardcoded 6-value list + `submissions.all`, values/labels untranslated exactly as today. `View` action stays a real `<Link>` (react-router anchor, not a button+`useNavigate`) — style it as a `Button variant="outline" size="sm"` **rendered via `asChild`-style wrapping of the `Link`**, i.e. the underlying DOM node stays an `<a href>` for ctrl-click/open-in-new-tab (AC per BA §1.6).
- **SubmissionDetail.tsx** — Pattern C, full spec in §5 including the F2 hard constraint. Second-highest care point after Students.
- **Reports.tsx** — Pattern B ×3 (one Card per report), with a Pattern-D-style filter bar at the top: the two native `<input type="date">`s wrapped in a `fieldset`/`legend`-equivalent — a `<div role="group" aria-label={t('reports.dateRange')}>` (new key, §7) around both, each input keeps its existing implicit `<label>{text}<input/></label>` wrapper unchanged. All 6 export `<a href>` links **stay plain anchors**, styled as `Button variant="link"` or `variant="outline" size="sm"` **applied directly to the `<a>` tag** (no `download`/`target`/`onClick`/fetch+blob — AC-12). Table 3's dimension-derivation-from-`audio_*`-keys logic untouched.
- **Criteria.tsx** — Pattern D (upload form) + Pattern B (classes-config table). Full multipart-form-preservation detail in §5. `criteria.courseId` key's existing double-duty (placeholder **and** `<h2>` text) is preserved, not consolidated into one — that's existing behavior, not a defect to fix here.
- **Monitoring.tsx** — Pattern E, full spec in §5.

---

### 7. New i18n keys (vi + en)

12 new keys, added to **both** locale blocks in `src/i18n/index.ts`, following the existing flat dotted convention. Zero existing keys renamed, removed, or repurposed. Every existing `t('...')` call site keeps resolving unchanged (AC-19/20).

| Key | vi | en | Used for |
|---|---|---|---|
| `nav.skipToContent` | Bỏ qua để đến nội dung chính | Skip to main content | Skip link, shell |
| `nav.toggleMenu` | Đóng/mở menu điều hướng | Toggle navigation menu | Sidebar collapse toggle (desktop) + hamburger (mobile), shared `aria-label` |
| `nav.languageSwitcher` | Ngôn ngữ | Language | Language-switcher group `aria-label` (optional, §3) |
| `nav.switchToVietnamese` | Chuyển sang tiếng Việt | Switch to Vietnamese | VI segment `aria-label` (optional, §3) |
| `nav.switchToEnglish` | Chuyển sang tiếng Anh | Switch to English | EN segment `aria-label` (optional, §3) |
| `pagination.previous` | Trang trước | Previous page | Prev button `aria-label`, Students/Submissions |
| `pagination.next` | Trang sau | Next page | Next button `aria-label`, Students/Submissions |
| `submissions.audioPlayer` | Trình phát âm thanh bài nộp | Submission audio player | `aria-label` on the existing `<audio controls>` element (tag/src/controls untouched) |
| `criteria.previewRegion` | Vùng xem trước JSON tiêu chí | Rubric JSON preview | `aria-label` on the rubric-preview `<pre>` wrapper |
| `reports.dateRange` | Khoảng thời gian | Date range | `aria-label` grouping the two date `<input>`s |
| `settings.key` | Khóa cấu hình | Configuration key | New `<TableHead>` — Settings table currently has zero header cells |
| `settings.value` | Giá trị | Value | New `<TableHead>`, same table |

No new key for: Students search label, Onboarding phone label, Criteria courseId-lookup label (all reuse an **existing** key as an `sr-only` `<label>` or `aria-labelledby` target — see §5/§6, zero new i18n surface). No key for Settings/Submissions action-column header (both follow the existing empty-`<th/>` convention already used by Students/Criteria/Monitoring). No key for Settings' boolean `true`/`false` option text (must stay literal/untranslated, §0.1).

---

### 8. Accessibility

- **Focus-visible**: every interactive element (`Button`, `Input`, `Textarea`, `SelectNative`, nav items, pagination controls, table row links) gets `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` — never `outline-none` without this replacement (matches the UX-DB "Focus States" guideline retrieved in §0).
- **Contrast**: `--foreground` (`#0F172A`) on `--background` (`#F8FAFC`) and `--card` (`#FFFFFF`) both exceed 12:1. `--primary` (`#0D9488`) on white is ~4.6:1 (passes AA for normal text at 14px+ and large text; primary-colored *small* body text should still prefer `--foreground` for anything below 18px — use primary color for interactive elements/icons/badges, not small paragraph copy). All Badge/Alert variant foreground/background pairs use the shadcn convention (`*-foreground` always white or `--foreground`, tuned per variant) — verify each new variant (`success`, `warning`) at implementation time with a contrast checker; `#16A34A`/white and `#D97706`/white both clear 4.5:1 (standard Tailwind green-600/amber-600 on white, well-established AA pairs).
- **Real `<th>`/labels**: every `Table` uses semantic `TableHead`/`scope="col"` (already true for Students/Submissions/Criteria-classes/Monitoring-queues; **newly added** for Settings, §5/§7). Every text input gets an associated accessible name — either the existing implicit `<label>` wrapper (Login, Reports, Onboarding's activate button is already inside a labeled context), a new `sr-only` `<Label htmlFor>` reusing an existing key (Students search, Onboarding phone), or `aria-labelledby` pointing at an adjacent heading (Criteria courseId lookup) — no input ships without one after this pass.
- **Keyboard reachability**: Tab order follows visual order (sidebar → page content → forms/tables → pagination), matching current DOM order since no `tabIndex` overrides are introduced. Disabled buttons (Send when `sentAt` set, Retry at `dlqDepth===0`, pagination at range ends) use the native `disabled` attribute (already true today) — not focus-activatable, per AC-46. **No new keyboard traps**: the mobile off-canvas drawer must not trap focus when closed (it's simply not rendered/`display:none` when collapsed, no `inert` needed since there's nothing to trap into); no modal/`Dialog` component is introduced anywhere in this spec (confirmation dialogs are explicitly out of scope, §0.1).
- **`role="alert"` preserved** on Login's and Criteria's error nodes (now `Alert` components — shadcn's `Alert` doesn't set `role="alert"` by default, so it must be added explicitly on these two instances specifically, since AC-47 requires it).
- **No table captions added**: each table is directly preceded by an `<h1>`/`<h2>` that already supplies context; adding a redundant `<caption>` was considered and skipped to keep the new-i18n-key list lean (§7) — acceptable per standard heading-precedes-table practice.
- **`prefers-reduced-motion`**: the only motion in this spec is the sidebar drawer slide/collapse transition and standard 150–200ms hover/focus color transitions — both should respect `prefers-reduced-motion: reduce` (drop the slide transition to an instant show/hide; color transitions are exempt as non-vestibular).

---

### 9. Cross-reference back to F3-ba's 52 ACs

This spec does not introduce anything that conflicts with F3-ba's acceptance criteria; where a design choice touches one directly, it's called out above (AC-08/N3 in §2, AC-11 in §5/§6, AC-12 in §6, AC-14 in §6, AC-21/§5, AC-27/§0.1, AC-32/§3, AC-38/§5, AC-39/§5, AC-45/§3, AC-46/§8, AC-47/§8). Frontend should treat this file plus `F3-ba.md` §1–§4 as the complete input — no further design decisions should need to be re-derived during implementation.

## Blockers / open questions

— none. (The language-switcher scope tension with F3-ba's "out of scope" ruling is resolved explicitly in §3 — designed but optional, not gating.)

## Notes for the next role

**Frontend**, build directly from §1–§9 above; do not re-derive tokens or patterns. The three highest-risk implementation spots (carried forward from BA, restated with the exact component choice that avoids each risk):
1. **Criteria.tsx upload form** — keep `name="courseId"`/`name="file"` as direct children of the native `<form>` (§5/§6); style with plain utility classes, no `Select`/no form-library wrapper.
2. **Students.tsx inline edit** — use native `<input defaultValue>` styled as shadcn `Input`, not a controlled/RHF-bound field (§6) — this is what keeps the PATCH body to only-edited-fields.
3. **SubmissionDetail.tsx pilot panel** — build it from `Card`/`Alert`/`Table`/plain-`<pre>`-div only, verify zero interactive descendants after building (§5) — this is a QA hard-gate (AC-39), not just a style note.

Also: `SelectNative` (§4) is a new, small hand-authored primitive (native `<select>` + shadcn visual treatment) — not one of shadcn's stock components, needed specifically because Settings' boolean toggle and Submissions' status filter must keep native-`<select>` `defaultValue`/`value` semantics. Build it once, reuse in both places.
