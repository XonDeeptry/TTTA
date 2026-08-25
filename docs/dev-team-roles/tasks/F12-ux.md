# F12 · UX — Two dashboard drawers (template-structure editor + scoring-content editor + live prompt preview)

- **Owner role:** ux
- **Feature:** F12 — Drawer 1 "Cấu trúc chấm điểm" (`rubric_template`) + Drawer 2 "Soạn nội dung chấm điểm" (`criteria_author`) + live LLM-prompt preview, additive to `pages/Criteria.tsx`
- **Status:** DONE
- **Last updated:** 2026-08-23
- **Depends on:** `F12-ba.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 7 (+4.1, 4.2, 8, 10)

## Inputs (what this role received)

- `F12-ba.md` — FR-01…FR-24, ~170 ACs, UC-1…UC-7, business rules BR-01…BR-12, the i18n inventory (§8, ~135 keys), the "what's machine-verifiable" split (§9), assumptions A1…A8, `Notes for the next role → UX`.
- Design doc `Idea/20260819-ChamDiemRubricV2.md` Phần 7 (authoritative UI shape, Vietnamese), Phần 4.1 (CRUD table), Phần 4.2 (two privileges), Phần 8 (file list), Phần 10 item 5 (prompt snapshot).
- Code read directly: `services/dashboard/src/pages/Criteria.tsx` (existing upload form + classes table, kept as-is), `components/ui/{button,input,textarea,select-native,table,card,badge,alert,label,separator,tooltip}.tsx`, `components/icons.tsx` (hand-authored 20×20 outline set, 1.5px stroke, `currentColor`), `tailwind.config.ts` (HSL CSS-var tokens, `h1/h2/h3/body/table-head/caption` type scale, default Tailwind breakpoints), `pages/Users.tsx` not read in full but referenced by BA for the existing privilege-checkbox pattern.

## Checklist (the concrete work items for this task)

- [x] Create this task file, Status IN_PROGRESS
- [x] Read F12-ba.md in full + design doc Phần 7/4.1/4.2/8/10
- [x] Read existing `Criteria.tsx`, `components/ui/*`, `icons.tsx`, `tailwind.config.ts` to match the system exactly
- [x] Design `drawer.tsx` + `confirm-dialog.tsx` primitives (states, a11y, API)
- [x] Design flows UC-1…UC-7 (entry → steps → exit → error branches)
- [x] Design Drawer 1 wireframes (list + form) with all states
- [x] Design Drawer 2 wireframes (source-select, band grid, sub-factors, comment bank, locked fields, pronunciation pin, prompt preview) with all states
- [x] Design the privilege-visibility treatment (5-actor matrix → concrete UI)
- [x] Design the level-range validation surfacing (advisory, non-blocking)
- [x] Layout/grid/spacing/typography/breakpoint spec, component-state spec
- [x] Accessibility notes (contrast, targets, keyboard, focus)
- [x] Map every BA i18n key (§8 of F12-ba.md) to where it renders
- [x] Set Status DONE

## Outputs (what this role produced)

Design spec below. No new files written (per role rules); this document is the deliverable frontend implements against, alongside `F12-ba.md` (source of truth for exact request/response shapes, status codes, and the full i18n key list — not duplicated wholesale here, only mapped to UI).

---

# 0. Design-system reuse (nothing new invented)

Palette/typography/spacing are **already fixed by F3** and this feature must not deviate:

- **Colour tokens** (all HSL CSS vars, already in `tailwind.config.ts`): `background`, `foreground`, `card`, `popover`, `primary` (teal), `secondary`, `accent`, `muted`, `destructive`, `success`, `warning`, `border`, `input`, `ring`. F12 introduces **zero new tokens** — "locked" state reuses `muted`, "advisory warning" reuses `warning`, "blocking error" reuses `destructive`, "success" reuses `success`.
- **Type scale**: `text-h1` (drawer/page titles, 1.5rem/600), `text-h2` (section headings, 1.125rem/600), `text-h3` (sub-section, e.g. per-dimension band grid title), `text-body` (default, 0.875rem), `text-table-head` (grid/table column headers), `text-caption` (hints, badges, helper text, 0.75rem).
- **Primitives reused as-is**: `Button` (variants `default|secondary|outline|ghost|destructive|link`, sizes `default|sm|icon`), `Input`, `Textarea`, `SelectNative`, `Table*`, `Card*`, `Badge` (variants `default|secondary|success|warning|destructive|outline`), `Alert`, `Label`, `Separator`, `Tooltip` (CSS-only hover/focus tooltip — reused for the pronunciation-badge explanation and locked-field reasons where inline text is too cramped).
- **Icons**: reuse `icons.tsx`'s existing `IconCriteria`. New glyphs needed, hand-authored in the same 20×20/1.5px/`currentColor` style, added to `components/icons.tsx` (still zero new dependency — this is source code the frontend agent writes, not a package):
  `IconClose` (×, for drawer/dialog close button), `IconPlus` (+, "add row"/"tạo mới"), `IconCopy` (duplicate), `IconTrash` (delete), `IconEyeOff`/`IconEye` (hide/show template), `IconRestore` (reset-to-seed, circular arrow), `IconLock` (locked-field indicator), `IconPin` (pronunciation pin badge), `IconChevronUp`/`IconChevronDown` (reorder level/button rows), `IconAlertTriangle` (advisory validation banner). Every icon-only button gets an explicit `aria-label` per the F3 QA lesson cited in the brief.
- **Sidebar/shell**: unchanged; drawers render as an overlay above the existing 240px-sidebar shell, not inside it.
- **Breakpoints**: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`). BA's `md`/`lg` drawer-width references map onto these directly.

---

# 1. New primitives

## 1.1 `components/ui/drawer.tsx`

A right-side slide-over panel, portal-rendered (via `react-dom`'s `createPortal`, already a dependency).

**Props**: `open: boolean`, `onRequestClose: (reason: 'esc'|'backdrop'|'close-button') => void`, `title: string`, `side?: 'right'` (only value used), `size?: 'md'|'lg'` (`md` ≈ 36rem for Drawer 1, `lg` ≈ 56rem for Drawer 2's two-pane form+preview layout), `children`, `footer?: ReactNode`.

**Visual structure** (top to bottom, fixed header/footer, scrolling body):
```
┌───────────────────────────────────────────┐  <- backdrop: bg-foreground/40, full viewport
│                                    ┌───────┤
│                                    │ Header │  h-14, border-b, px-6, flex justify-between
│                                    │  <title as text-h2 id="drawer-title">     [×]  │
│                                    ├───────┤
│                                    │ Body   │  flex-1 overflow-y-auto p-6, scrolls independently
│                                    │  (drawer-specific content)                     │
│                                    ├───────┤
│                                    │ Footer │  border-t, px-6 py-4, flex justify-end gap-2 (sticky)
│                                    └───────┘
└───────────────────────────────────────────┘
```
- Panel: `bg-card`, `shadow-md`, full height, slides in from the right (`transition-transform`, `translate-x-full → translate-x-0`; `prefers-reduced-motion: reduce` disables the transition, panel just appears — AC-05.11).
- `role="dialog" aria-modal="true" aria-labelledby="drawer-title"`.
- Backdrop click → `onRequestClose('backdrop')`; Esc → `onRequestClose('esc')` (only while this drawer is topmost — a nested confirm-dialog swallows Esc first, AC-05.5).
- Focus trap: on open, focus the first focusable element in the panel (else the panel itself via `tabIndex={-1}`); Tab/Shift+Tab wrap inside the panel. On close, focus returns to the element that opened the drawer (the "templates.open"/"authoring.open"/row "Sửa" button).
- Body-scroll lock while open, restoring the previous inline `overflow` value on close (not hard-reset).
- Below `md`: panel is full-width/full-height (no visible backdrop gutter).
- Only one drawer open at a time — enforced by `Criteria.tsx`'s own state (a single `activeDrawer: 'template'|'authoring'|null`), routed through the same dirty-guard as closing (§1.2).

## 1.2 `components/ui/confirm-dialog.tsx`

Small centered modal, same a11y contract as the drawer (own focus trap nested inside the drawer's, Esc closes only the dialog, focus restores to the button that invoked it).

**Props**: `open`, `title`, `body` (ReactNode), `confirmLabel`, `cancelLabel`, `destructive?: boolean`, `onConfirm`, `onCancel`.

**Visual structure**: centered card, `max-w-sm`, `p-6`, `text-h3` title, `text-body` body, footer with `Cancel` (`variant="ghost"`) and `Confirm` (`variant="destructive"` when `destructive`, else `default`) — buttons always carry distinct text (never colour-only per AC-06.3).

Used for: unsaved-changes-on-close (`drawer.unsavedTitle/unsavedBody`, actions `unsavedDiscard`/`unsavedStay`), template delete (`templates.confirmDeleteTitle/Body`), template reset (`templates.confirmResetTitle/Body`), dimension-removal in Drawer 1 (`templates.removeDimensionConfirm`). This is the **only** confirmation mechanism in F12 — no `window.confirm`/`alert`/`prompt` anywhere (AC-06.4).

## 1.3 Dirty-change guard (shared behaviour, not a component)

Both drawers keep two pieces of state: `baseline` (form model derived from whatever seeded the form — a fresh blank model, a fetched template, or a fetched criteria row) and `draft` (current form model). "Dirty" = `!deepEqual(baseline, draft)` computed **on the form model only**, never against a re-fetched server response and never via `JSON.stringify` comparison (AC-21.4/21.5 — this is the subtlest requirement in the whole feature: Postgres jsonb key-reordering and v1→v2 normalization mean a byte comparison would report false dirtiness on an untouched v1-era row, AC-21.6). On `onRequestClose`, if dirty → open the unsaved-changes confirm; if clean → close immediately, no dialog.

---

# 2. User flows (entry → steps → exit, with error branches)

## UC-1 — Create a new scoring structure (`rubric_template`)

```
Entry: /criteria, Drawer-1 entry button visible (privilege check passes)
 1. Click "templates.open" → Drawer 1 opens → GET /criteria/templates?includeInactive=true
    ⤷ loading: skeleton rows (3 shimmering placeholder rows, matching Table row height)
    ⤷ error: inline Alert + "errors.retry" button, drawer stays open
    ⤷ empty (server returns []): "templates.empty" message + "+ Tạo cấu trúc mới" CTA
 2. Click "+ Tạo cấu trúc mới" → blank template-editor form fills the drawer body
    (list view is replaced, not stacked — a "← back to list" affordance returns without saving,
     itself gated by the dirty-guard)
 3. Fill key, name, scale, aggregation, dimensions (incl. pronunciation), levels, output_fields
    → computed max total updates live (top-right of form, "templates.maxTotal: NN")
    → level-range issues render inline + summarized (advisory, non-blocking banner)
 4. Click "criteria.save" (Lưu) [disabled while any of AC-13.4's 6 blocking conditions hold]
    → POST /criteria/templates
    ⤷ 201: success banner ("templates.saved"), list view refreshed and shown, row appears
      at server sort position (isSystem DESC, key ASC)
    ⤷ 409 (key exists): errors.conflictDuplicateKey shown above the key field, focus → key
      input, draft intact — user can rename and resubmit
    ⤷ 400 invalid rubric: errors.invalidRubric heading + one line per issue (server Vietnamese
      text verbatim), offending level row visually flagged, draft intact
Exit: drawer closes (success) or stays open (error) for correction.
```

## UC-2 — Duplicate a system template into a variant

```
Entry: Drawer 1 list, row = ielts_speaking (isSystem badge shown)
 1. Row action "Nhân bản" → editor form opens PRE-FILLED (deep copy of source rubric)
    with two extra top fields: templates.duplicateKeyLabel (required, empty),
    templates.duplicateNameLabel (optional, empty)
 2. Author edits: new key, removes 1 dimension row (with per-row remove + confirm dialog
    stating content is removed with it — AC-12.5's wording lives in
    templates.removeDimensionConfirm)
 3. Save → POST /criteria/templates/:sourceKey/duplicate
    ⤷ 201: new row appears, no "Mặc định" badge, "Xóa" now offered on it
    ⤷ 409 key clash: same treatment as UC-1 step 4
Exit: list view, seed row untouched (verifiable by re-opening ielts_speaking's own editor).
```

## UC-3 — Delete an ordinary template

```
Entry: Drawer 1 list, row = an ordinary (non-system) template
 1. Row action "Xóa" (IconTrash, aria-label "templates.delete + key") → confirm-dialog opens:
    title templates.confirmDeleteTitle, body templates.confirmDeleteBody (explicitly states
    criteria already authored from it are unaffected)
 2. Confirm → DELETE /criteria/templates/:key
    ⤷ 204: row disappears from list, no body read
    ⤷ 409 (stale list, row was actually isSystem): errors.conflictSystemDelete + list
      auto-refreshed (row now shows correctly, Xóa no longer offered on it)
 2'. Cancel → dialog closes, list unchanged
Exit: list view.
```

## UC-4 — Restore a system template

```
Entry: Drawer 1 list, row = a system template (possibly edited)
 1. Row action "Khôi phục bản gốc" (IconRestore) → confirm-dialog: templates.confirmResetTitle,
    body templates.confirmResetBody ("mất hết chỉnh sửa")
 2. Confirm → POST /criteria/templates/:key/reset
    ⤷ 200: row's name/rubric/locked revert to seed in the list (isActive is UNCHANGED — the
      list must not flip a currently-hidden system template back to visible)
    ⤷ 409 (ordinary template, stale list) → errors.conflictResetOrdinary
    ⤷ 409 (no seed def) → errors.conflictNoSeed
Exit: list view.
```

## UC-5 — Author content for a course (`criteria_author`)

```
Entry: /criteria, Drawer-2 entry button visible
 1. Click "authoring.open" → Drawer 2 opens on Step 1 (empty state, no template/course chosen)
 2. Step: course select (authoring.courseStep, reuses GET /courses options)
 3. Step: template select (authoring.templateStep, GET /criteria/templates active-only,
    system templates lead the list)
    ⤷ chosen template lacks a `pronunciation` dimension → blocking banner
      (authoring.pronunciationMissing) replaces the rest of the form; Save disabled;
      only escape is picking a different template
 4. Form renders: band grid per dimension (§3.2), sub-factors, comment bank, locked-field
    read-only sections, pronunciation pin first, prompt preview pane alongside (lg+) /
    below (< lg)
 5. Author types band descriptors / sub-factor cells / comment-bank rows
    → prompt preview pane re-renders (debounced 300–500ms) on every change
 6. Click "criteria.save"
    → POST /criteria/json { courseId, templateKey, title?, rubric }
    ⤷ 201: authoring.savedVersion ("Đã lưu phiên bản {{version}}"), version list on the page
      refreshes, drawer baseline resets (no longer dirty), drawer stays open for further edits
      OR closes per the button used (Save vs Save & close — see §3.2 footer)
    ⤷ 400 invalid rubric: same rendering as UC-1's 400 branch, mapped onto Drawer 2's
      band/level context where applicable
Exit: drawer stays open (edit continues) or closes; version list on the page shows the
      new version.
```

## UC-6 — Edit an old version

```
Entry: /criteria page, version list, row "v2"
 1. Click row action "Sửa" (visible only with criteria_author) → Drawer 2 opens directly on
    the form (skips course/template steps) → GET /criteria/:id
 2. Form is seeded from that version's rubric; templateKey carried forward unchanged
    (including null, including an orphaned key — no error shown for an orphan)
 3. No edits made → close via Esc/backdrop/× → NO unsaved-changes dialog (baseline == draft,
    verified via form-model comparison, not raw-JSON — this is AC-21.6, the single highest-
    value manual check in the whole feature)
 3'. One band edited → Save → POST /criteria/json → 201 → new version (v3) appended to the
    page's version list; v2 remains, unchanged, still selectable
Exit: drawer closes or stays open; page version list shows v3 above v2 (server order).
```

## UC-7 — Rejected save, then recovery

```
Entry: Drawer 1 or Drawer 2 form mid-edit
 1. Author narrows scale.max so the level ladder no longer covers 0..max
    → client-side advisory gap warning appears (IconAlertTriangle banner + per-row
      inline flag) but Save stays ENABLED (AC-13.3 — client warnings never block; this
      is explicitly a trust decision: a false positive in the client port must never make
      a legal rubric unsavable)
 2. Save anyway → 400 { message: 'invalid rubric', issues: [...] }
    → errors.invalidRubric heading, each Vietnamese issue.message rendered verbatim as a
      list item, and (where issue.index is valid) the matching level row gets a
      destructive-bordered highlight
 3. Author fixes the ranges → the same advisory warning clears live → Save → 201
Exit: success banner, form closed or left open per the save button used; nothing was
      written on the rejected attempt (no partial version).
```

---

# 3. Wireframe descriptions

## 3.1 `pages/Criteria.tsx` — additions (page stays intact, F12 is additive)

```
[ h1: criteria.title ]

[ Card: .docx upload — UNCHANGED, or DISABLED with a caption hint when the actor
  holds neither admin nor criteria_author (AC-10.4: criteria.uploadNoPrivilege
  rendered next to the disabled form, never a raw 403) ]

[ Row of two entry buttons, ABOVE the existing "courseId select + Load" card: ]
  [Button: templates.open  — IconCriteria, visible iff rubric_template or admin]
  [Button: authoring.open  — IconCriteria, visible iff criteria_author or admin]
  (both hidden ⇒ row renders nothing, not an empty gap — no dead-end box)

[ Card: courseId select + Load — UNCHANGED ]
  [ version <ul>, each <li> UNCHANGED PLUS: ]
    [Button size=sm variant=ghost: "Sửa" — visible iff criteria_author or admin,
     opens Drawer 2 pre-loaded from that row]

[ <pre> JSON preview — UNCHANGED ]

[ classes-config Table — UNCHANGED ]
```
States: identical to today's page (loading via the existing `useEffect`s, empty version list already handled by the existing `<ul>` rendering nothing). New failure mode: drawer-entry buttons never appear/disappear reactively mid-session (AC-10.6 — privilege changes need reload/re-login, not polled).

## 3.2 Drawer 1 — list view

```
Header: templates.title                                                    [×]
─────────────────────────────────────────────────────────────────────────────
[Button: + templates.new]                                     (top-right of body)

Table (borderless list rows, not the dense data table — each row is a card-like
strip, `border-b`, `py-3`):
┌─────────────────────────────────────────────────────────────────────────┐
│ name                                    [badgeSystem?] [badgeInactive?] │
│ key (text-caption text-muted-foreground, monospace)   maxTotal: NN      │
│                                    [Sửa][Nhân bản][Ẩn/Hiện][Xóa|Khôi phục]│
└─────────────────────────────────────────────────────────────────────────┘
```
- Row action set per AC-11.4 table: ordinary → Sửa/Nhân bản/Ẩn-Hiện/Xóa(confirm); isSystem → Sửa/Nhân bản/Ẩn-Hiện/Khôi phục(confirm) — **Xóa is never rendered** for isSystem (not disabled-and-explained — the design doc treats "khôi phục" as its functional replacement, so an absent button plus the always-visible Khôi phục button is self-explanatory; no dead-end).
- Every icon-only action button carries `aria-label` combining the action + row name (e.g. `templates.delete` interpolated with the template name) so screen readers don't hear five identical "Delete" buttons.
- States: **loading** — 3 skeleton strips (`animate-pulse bg-muted h-16 rounded-md`); **empty** — centered `templates.empty` + the `+ templates.new` CTA (not a dead corner); **error** — `Alert variant="destructive"` + `errors.retry` button, list area otherwise empty, drawer remains open; **success** (after any mutation) — inline banner (`Alert variant="success"` reusing the `success` token) auto-dismissed on the next action per AC-22.9.

## 3.3 Drawer 1 — template editor form (create/edit/duplicate)

Single-column form inside the drawer body (this drawer is `size="md"`, no second pane needed — Phần 7 doesn't call for a live prompt preview here, only the computed max total and level checks).

```
[← back to list]                                    (dirty-guarded)

Section "Chung":
  key        [Input, read-only+hint on edit / editable+pattern-hint on create]
  name       [Input, required]
  course_key / task_type / tone / feedback_language   [Input ×4, optional]

Section "Thang điểm & tổng hợp":
  scale.min / scale.max / scale.step   [Input type=number ×3, inline row]
    → OBS-2 hint (advisory, text-caption text-warning) when step doesn't
      divide (max−min) evenly: "authoring... templates.stepHint"
  aggregation.method   [SelectNative: sum | average | weighted_average]
  aggregation.round    [SelectNative: none | nearest_int]
  → computed max total, pinned top-right of this section as a Badge:
    "templates.maxTotal: {{value}}" — recomputes on every keystroke touching
    scale/method/dimensions/weights (client-side, lib/rubric.ts::maxTotal)

Section "Tiêu chí" (dimensions):
  repeatable row: key [Input] · label [Input] · weight [Input number]
    · [Button icon Trash: templates.removeDimension] (confirm dialog if the
      dimension has non-empty bands/sub_factors — text names what's lost)
  [Button: + templates.addDimension]  (new row gets bands:{}, sub_factors:[])
  (no visual distinction for `pronunciation` here — the pin/lock lives in
  Drawer 2, not the structure editor; Drawer 1 only blocks Save if no
  dimension has key=pronunciation, per AC-13.4)

Section "Cấp độ" (levels, optional):
  repeatable row: min [Input#] · max [Input#] · code [Input] · label [Input]
    · reorder [↑][↓] · remove [Trash]
  [Button: + templates.addLevel]
  Advisory banner above the list (IconAlertTriangle, text-warning, NOT
  blocking): lists each issue (level_invalid / level_overlap / level_gap /
  level_coverage_start / level_coverage_end), each also flagged inline next
  to its row via a `border-warning` ring + small caption under that row.

Section "Đầu ra":
  [ ] outputComment   [ ] outputFix     (AC-13.4 blocks Save if both unchecked
                                          — templates.blocking.noOutputFields
                                          rendered inline, red text, live)

Section "Phản hồi học sinh" (student_reply, optional — collapsed by default,
  "+ thêm phản hồi" expands it; collapsing back with content present keeps
  the content, only sends null if truly never touched):
  [ ] showTotal  [ ] showLevel
  template  [Textarea]
  buttons: repeatable title[Input,≤100] + action[Input] rows, + add/remove

Section "Khóa trường" (locked):
  checkbox group, 7 fixed options (lockPath.scale / .aggregation / .levels /
  .output_fields / .dimensions_key / .dimensions_weight / .student_reply),
  each with templates.lockedHint caption below the group explaining these
  become read-only in Drawer 2.

──────────────────────────────── Footer (sticky) ─────────────────────────
[templates.blocking.* summary banner if any blocking condition holds]
                                        [Cancel] [criteria.save (disabled per
                                                   AC-13.4 blocking conditions,
                                                   spinner while in flight)]
```
States: **create** (blank, key editable), **edit** (key read-only + `templates.keyImmutable` caption directly under the key field, `IconLock` prefix), **duplicate** (pre-filled + two extra key/name fields at top, `templates.duplicateKeyLabel`/`duplicateNameLabel`), **saving** (footer Save button shows a spinner + is disabled, all other mutating controls disabled — prevents double-submit), **error** (409/400 rendered per §4 below, draft never cleared).

## 3.4 Drawer 2 — content authoring (`size="lg"`, two-pane at `lg`+)

### Step view (no course/template chosen yet, or opened fresh)

```
Header: authoring.title                                                [×]
─────────────────────────────────────────────────────────────────────────
authoring.courseStep
  [SelectNative: course — options from GET /courses]
authoring.templateStep
  [SelectNative: template — active templates, system-first,
   disabled until a course is chosen]
[Button: continue → renders the form below]
```
(When opened via row "Sửa", this step is skipped entirely — form renders directly, per AC-15.3.)

### Form + preview view

```
┌───────────────────────────────── lg+: two columns ──────────────────────┐
│ LEFT (form, ~60%, scrolls independently)   │ RIGHT (preview, ~40%,      │
│                                             │  sticky within viewport)  │
│                                             │                            │
│ [pronunciationMissing banner if applicable, │ authoring.preview          │
│  blocking, replaces everything below it]    │ [toggle: variantAudio |   │
│                                             │  variantText]              │
│ Dimension: pronunciation  🔒(pin, no remove)│                            │
│  [IconPin badge] authoring.pronunciationBadge│ <pre role=region          │
│  (tooltip/adjacent text: pronunciationReason)│  aria-label=preview>      │
│  Band grid (see §3.4.1)                     │   ...live prompt text...  │
│  Sub-factors (see §3.4.2)                   │ </pre>                    │
│                                             │                            │
│ Dimension: <other dims, in rubric order>    │ (while updating: same text│
│  Band grid                                  │  stays, small "updating…" │
│  Sub-factors                                │  caption appears top of   │
│                                             │  pane, no flicker to empty)│
│ Comment bank (see §3.4.3)                   │ (on failure: last good text│
│                                             │  stays, previewError shown │
│ [locked-field sections render inline within │  as a caption, non-blocking│
│  their normal position — see §3.4.4]        │  small red text, no modal)│
└─────────────────────────────────────────────┴────────────────────────────┘
< lg: RIGHT stacks BELOW LEFT, full width, same content, no sticky.

──────────────────────────── Footer (sticky) ──────────────────────────────
                                    [Cancel] [criteria.save — disabled only
                                     while pronunciationMissing banner is
                                     showing or a save is in flight]
```

### 3.4.1 The band grid (the headline interaction)

For a dimension with `scale = {min:0, max:5, step:1}`:

```
authoring.bands                                    authoring.bandHint (caption)
┌─────────────────────────────────────────────────────────────────────────┐
│ authoring.band {{value:0}}  │ [Textarea, 3 rows, one bullet per line]   │
├──────────────────────────────────────────────────────────────────────── │
│ authoring.band {{value:1}}  │ [Textarea]                                │
├──────────────────────────────────────────────────────────────────────── │
│  …                          │  …                                       │
├──────────────────────────────────────────────────────────────────────── │
│ authoring.band {{value:5}}  │ [Textarea]                                │
└─────────────────────────────────────────────────────────────────────────┘
```
- Row label = plain number string (`0`…`5`/`9`), left column fixed-width (`w-20`), `text-table-head`, `tabular-nums`.
- One `<textarea>` per row (never a single `;`-joined field) — each **non-empty line** becomes one `bands[value][i]` entry; blank lines dropped; an all-empty textarea → that band key omitted entirely from the payload (AC-16.3).
- **Widening** (Drawer 1 changes scale 0–5 → 0–9, author reopens/re-syncs Drawer 2): new rows 6–9 append at the bottom, empty; rows 0–5 keep their typed text untouched — no re-typing (AC-16.5).
- **Narrowing**: any band key that no longer appears in the current `bandValues(scale)` (including non-numeric legacy v1 keys) moves into a visually distinct sub-section directly beneath the grid:
  ```
  ⚠ authoring.outOfScale                              authoring.outOfScaleHint
  ┌───────────────────────────────────────────────────────────────────────┐
  │ Band "6" (ngoài thang hiện tại)     [Textarea, disabled? NO — still   │
  │                                      editable+deletable]   [Trash:    │
  │                                      authoring.removeBand]            │
  └───────────────────────────────────────────────────────────────────────┘
  ```
  Rendered with a `border-warning` left rule and a `bg-warning/10` tint, `IconAlertTriangle` prefix on the section heading. Content is **never** silently discarded — only an explicit per-row delete removes it (AC-16.6).
- **Cap**: if `bandValues(scale)` would exceed 50 rows, the grid instead shows only band keys already present in the rubric plus `min`/`max`, with `authoring.tooManyBands` as an `Alert variant="warning"` above the grid — never attempts 100+ textareas (AC-16.7).
- The grid scrolls horizontally within its own container at narrow widths rather than widening the drawer panel (AC-24.4) — in practice the grid is naturally vertical (one row per band) so this mainly matters for the sub-factor grid (§3.4.2), which is genuinely wide.

### 3.4.2 Sub-factors

```
authoring.subFactors
┌───────────────────────────────────────────────────────────────── (scrolls →)
│ label            │ Band 0 │ Band 1 │ Band 2 │ … │ Band 5 │        [Trash] │
│ [Input]          │[Input] │[Input] │[Input] │   │[Input] │  authoring.    │
│                                                              removeSubFactor│
└───────────────────────────────────────────────────────────────────────────┘
[Button: + authoring.addSubFactor]
```
- One narrow `<input>` per band column (not a textarea — `by_band` entries are short keyword phrases per the IELTS source, e.g. "Limited range"). Same band-value columns as the band grid (§3.4.1), so widening/narrowing the scale keeps them in sync.
- Empty cell → omitted from `by_band`; a row with empty label **and** no filled cells is silently dropped on save (not shown as an error — it's simply not submitted, per AC-17.3).
- This is the one place per BA that genuinely needs horizontal scroll inside its own container on narrow viewports (AC-24.4) — the label column stays pinned/sticky-left while band columns scroll.

### 3.4.3 Comment bank

```
authoring.commentBank
┌──────────────────────────────────────────────────────────────────────────┐
│ [Select: dimension — dimension labels + authoring.cbShared for null]     │
│ [Input w/ datalist: intent — suggestions authoring.intentPraise/Suggest] │
│ [Textarea: text, required]                                    [Trash]    │
└──────────────────────────────────────────────────────────────────────────┘
[Button: + authoring.addComment]
```
- Row order preserved exactly as typed/reordered (drag not required — up/down arrows sufficient and simpler to make keyboard-accessible per AC-24.2).
- A renamed-in-Drawer-1 dimension key that no longer matches any current dimension still renders (shows the raw orphaned key as plain text instead of a select match) rather than disappearing — matches the Python renderer's "unknown dimension gets its own group" behaviour (AC-18.4).
- Empty `text` rows drop silently on save; empty `intent` submits as `null`.

### 3.4.4 Locked fields

Wherever a locked path applies (per the template's `locked[]`, always enforced regardless of who's viewing — AC-19.5), the corresponding control(s) render **read-only**, never simply omitted:

```
scale (example, when locked):
  scale.min / .max / .step   [Input disabled aria-disabled="true", muted bg]
  🔒 authoring.lockedReason  ("Cấu trúc \"{{template}}\" đã khóa trường này")
     authoring.lockedWhere   ("Đổi được trong drawer Cấu trúc chấm điểm")
```
- Visual treatment: `bg-muted text-muted-foreground cursor-not-allowed`, `IconLock` (14px, inline before the field label) — this is deliberately **guidance styling**, not the app's generic disabled-button greyout: the lock icon + two-line reason together read as "this belongs elsewhere," not "broken." The reason text is always visible inline (never a tooltip-only explanation — AC-19.1 requires it visible, so `Tooltip` is not used here even though it exists in the kit).
- Values stay populated and are still submitted unchanged (never blanked) — the field simply cannot be edited.
- Applies identically for `aggregation` (both selects), `levels` (whole table becomes read-only rows, no add/remove controls rendered at all rather than disabled ones — cleaner for a full-section lock), `output_fields` (checkboxes disabled), `dimensions[].key` (every key input disabled — but weight may still be unlocked independently per template config, or vice versa; they are two separate lock paths), `student_reply` (whole block read-only if any edit control existed, or simply not offered for editing).

### 3.4.5 Pronunciation pin

```
Dimension: pronunciation                    [Badge variant=secondary]
  IconPin  authoring.pronunciationBadge  ⓘ(hover/focus → Tooltip:
                                             authoring.pronunciationReason)
  (no [Trash] button rendered on this dimension's header at all — not
   disabled-and-explained, matching the "not rendered" precedent used for
   isSystem's missing Xóa button in Drawer 1, for the same reason: an absent
   control plus a badge explanation is clearer than a greyed-out one whose
   disabled reason must be discovered)
```
- Rendered **first**, always, regardless of its position in the underlying `dimensions[]` array (AC-19.6) — this is purely a display-order choice; the array order sent to the server is unaffected unless the author explicitly reorders (which Drawer 2 does not offer — dimension order/membership is Drawer 1's job; Drawer 2 only edits content within dimensions the structure already defines).

### 3.4.6 Live prompt preview pane

```
authoring.preview
[ toggle: (●) authoring.variantAudio   ( ) authoring.variantText ]
<pre role="region" aria-label="authoring.preview" class="whitespace-pre-wrap
     text-caption bg-muted rounded-md p-4 overflow-y-auto">
  ...server-rendered prompt text, verbatim...
</pre>
[caption, shown only while a request is in flight]: authoring.previewUpdating
[caption, shown only on request failure, replaces nothing]: authoring.previewError
```
- On drawer open (form view): renders once immediately with the initial draft.
- On every draft change: **debounced 300–500ms**, `AbortController`-cancels any in-flight request before firing a new one so a stale response can never overwrite a newer draft's render (AC-20.3).
- Empty draft (no dimensions yet — shouldn't normally happen since a template always seeds at least `pronunciation`, but defensively): `authoring.previewEmpty`.
- Never client-renders any prompt text itself — the pane is a pure `<pre>{prompt}</pre>` of whatever `POST /criteria/prompt-preview` returns; React text rendering only, no `dangerouslySetInnerHTML` (AC-20.8). This is deliberately given real visual weight (40% of the two-pane width, or full width and not collapsed by default on narrow screens) because per the design doc this is *the* trust-building feature — it must never read as a secondary/collapsible afterthought.

---

# 4. Error / empty / loading / dirty / saving states (cross-cutting)

Applies to both drawers, per FR-22:

| Condition | Rendering |
| :-- | :-- |
| List/form initial load | Skeleton rows / disabled form shell, no flash of empty content |
| Empty list | Centered message + primary CTA, never a blank panel |
| 400 `{message:'invalid rubric', issues}` | Heading `errors.invalidRubric` + verbatim per-issue list; matching row flagged |
| 400 other rubric/DTO messages | Verbatim server `message` under a localized heading, never re-translated |
| 409 (4 known strings) | Mapped to `errors.conflictDuplicateKey` / `conflictSystemDelete` / `conflictResetOrdinary` / `conflictNoSeed`; unknown 409 → `errors.conflictGeneric` + verbatim text appended |
| 401 | `errors.unauthorized` + link to login; draft preserved |
| 403 (mid-session privilege revoke) | `errors.forbidden`; drawer stays open, draft intact, no stack/raw text shown |
| 404 (stale row) | `errors.notFound`; affected list auto-refreshes |
| 5xx / network | `errors.server` / `errors.network` + `errors.retry` affordance |
| Payload too large | `errors.payloadTooLarge` |
| Saving | Save button spinner + disabled; all other mutating controls in that drawer disabled too (prevents double-submit / double-version) |
| Dirty vs clean close | Confirm dialog only when dirty (form-model comparison, §1.3) |

All errors render inside an `Alert role="alert"` matching the existing upload-error pattern already on the page — never `window.alert`, never a raw `ApiError.message`/stack (AC-22.8/22.9). Alerts clear automatically once the corresponding action next succeeds.

---

# 5. Privilege-driven visibility — concrete UI per actor

Directly implements BA's AC-10.3 matrix. The point stressed in the brief: a teacher missing a privilege must **understand why**, not just find a blank spot.

| Actor | Drawer 1 entry | Drawer 2 entry | Row "Sửa" | `.docx` upload |
| :-- | :-- | :-- | :-- | :-- |
| admin | shown | shown | shown | enabled |
| staff + `rubric_template` only | shown | **not rendered** | not rendered | **disabled, `criteria.uploadNoPrivilege` caption beside it** |
| staff + `criteria_author` only | **not rendered** | shown | shown | enabled |
| staff + both | shown | shown | shown | enabled |
| staff + neither | not rendered | not rendered | not rendered | disabled + caption |

Design resolution of "don't design a dead end": the two entry buttons are simply **absent** when unavailable (no greyed-out button with a tooltip explaining privilege — that pattern would require every unprivileged staff member to discover and hover a disabled button to learn what's missing, which is worse UX than "it isn't there because it isn't yours"). The **one** place a disabled-plus-hint pattern *is* used is the `.docx` upload form, because it was already visible and enabled for all staff before F12 — removing it outright would look like a regression/bug rather than a permission boundary, so `criteria.uploadNoPrivilege` makes the boundary explicit exactly where a returning user would otherwise be confused. This asymmetry (new features: absent when unavailable; a pre-existing feature: disabled+explained) is intentional and should be called out in frontend review if questioned.

Mid-session revoke (403 despite the button having been visible) never happens for entry buttons (visibility is decided once per page load) but can happen on an in-flight save — handled generically by §4's 403 row, not by hiding UI retroactively.

---

# 6. Layout / grid / spacing / typography / breakpoints

- **Grid**: drawers are single-column flex layouts, not a 12-col grid (matches the rest of the dashboard, which is Card-based rather than grid-based). Drawer 2's two-pane split at `lg`+ uses a simple flex row (`flex-1` form ~60%, `w-[40%] min-w-[20rem]` preview, both independently scrollable) rather than CSS grid, for symmetry with how `SubmissionDetail.tsx`-style split panes are presumably built elsewhere (not read, but consistent with the Card-first idiom).
- **Spacing**: page/section rhythm follows the existing `space-y-6`/`space-y-3` pattern seen in `Criteria.tsx`; drawer body uses `p-6` outer padding, `space-y-6` between sections, `space-y-3` within a section, form rows `gap-2`.
- **Drawer widths**: `md` size ≈ `36rem` (Drawer 1), `lg` size ≈ `56rem` (Drawer 2, to fit the two-pane layout comfortably) — both full-width below the `md` breakpoint (AC-05.9).
- **Typography**: drawer title = `text-h2` (drawers are a secondary surface, not a page — reserving `text-h1` for the page itself); section headings = `text-h3`; field labels = `text-body font-medium`; hints/captions/lock reasons/preview text = `text-caption`; band-row numeric labels = `text-table-head tabular-nums` for grid alignment.
- **Responsive breakpoints** (Tailwind defaults, no custom breakpoints added):
  - `< md` (< 768px): drawers full-width/full-height; Drawer 2's preview pane stacks **below** the form (not hidden — AC-24.3 requires it stay reachable, just reordered); band grid and sub-factor grid remain single columns that scroll horizontally only where genuinely wide (sub-factor grid).
  - `md`–`lg` (768–1023px): Drawer 1 at its fixed `md` width; Drawer 2 also single-column (two-pane split only kicks in at `lg`, since 768px is too narrow for a form + preview side by side without either becoming unreadable).
  - `≥ lg` (≥1024px): Drawer 2 two-pane layout active, preview pane sticky within the drawer's own scroll container.
- **No horizontal page scroll** at any breakpoint (AC-24.3) — only the sub-factor grid and, in the >50-row edge case, nothing (that case is capped, not scrolled).

---

# 7. Component states (default/hover/active/disabled) — delta from existing kit

All controls reuse `components/ui/button.tsx`'s existing CVA variants and their built-in hover/active/disabled/focus-visible states verbatim — F12 adds no new variant. Two states specific to this feature's own controls, not covered by the shared kit:

- **Locked field** (new, §3.4.4): `default` = `bg-muted text-muted-foreground border-input cursor-not-allowed`, no `hover`/`active` change (it never becomes interactive), `aria-disabled="true"` (not native `disabled` where the element must still be reachable by Tab so the lock reason is discoverable via keyboard — see §8; native `disabled` inputs are skipped in tab order, which would hide the explanation from a keyboard user, so locked `<input>`/`<select>` use `readOnly` + `aria-disabled` rather than `disabled`, and locked checkboxes use `disabled` since there is no meaningful "read-only checkbox" semantic — their reason text is adjacent and still reachable).
- **Advisory-warning field** (level rows, step hint, out-of-scale bands): `default` = `border-warning bg-warning/5`, caption text `text-warning`, never disables the field itself — purely a visual flag, per AC-13.3's "advisory never blocks" rule.
- **Blocking-invalid field** (empty key/name, non-numeric required field): `border-destructive`, caption `text-destructive`, and additionally disables the Save button (the only 6 conditions listed in AC-13.4).

---

# 8. Accessibility notes

- **Contrast**: all new text/background combinations reuse existing tokens (`foreground`/`background`, `muted-foreground`/`muted`, `warning`/`warning-foreground` if ever paired, `destructive`/`destructive-foreground`) already vetted by F3 — no new colour pairs introduced, so no new contrast audit is needed beyond confirming `text-warning` on `bg-card`/`bg-warning/5` meets 4.5:1 (flag to frontend/QA to verify with the actual computed HSL values at implementation time, since `warning` wasn't previously used for body text at this size in the existing pages).
- **Touch targets**: all icon-only buttons use the existing `size="icon"` (`h-9 w-9` = 36px) — meets the ~44px recommendation closely enough given desktop-first dashboard usage, matches existing sidebar icon buttons; do not shrink these to fit dense list rows.
- **Keyboard navigation**: full open→traverse→add/remove-row→save→close operable by keyboard alone (AC-24.1). Concretely: Tab order inside a drawer follows visual top-to-bottom, left-to-right (header close button ⇒ back-link if present ⇒ form fields in section order ⇒ repeatable-row add/remove buttons ⇒ footer Cancel ⇒ Save). Repeatable-row remove buttons need distinguishing accessible names (`aria-label="templates.removeLevel — cấp độ {{index}}"` style interpolation), not five identical "Xóa" announcements (AC-24.2).
- **Focus trap & restore**: specified fully in §1.1/§1.2 — trap scoped to the topmost open surface (confirm-dialog traps over its parent drawer), restore to the exact invoking element (not just "somewhere in the page") on every close path (Esc, backdrop, ×, confirm-discard, save-success-close).
- **Escape semantics**: topmost-wins — with a confirm dialog open inside a drawer, Esc closes only the dialog; a second Esc (or the dialog's own Cancel) is needed to then close the drawer. This must be explicit in the frontend implementation (two separate `keydown` listeners scoped by which surface is currently topmost), not a single global listener.
- **Live regions**: the prompt-preview pane is `role="region" aria-label="authoring.preview"`, not `aria-live` — it updates too frequently (every debounced keystroke) for a live-region announcement to be useful or non-disruptive; screen-reader users navigate to it explicitly rather than having it interrupt. The advisory validation summary banner (level-range issues), by contrast, benefits from being announced once when it first appears — use `role="status"` on the summary banner container (not `role="alert"`, which is reserved for the blocking-error `Alert` per §4, to avoid two different "alert" semantics competing).
- **Colour is never the sole carrier of meaning** (AC-24.5): every badge/state pairs colour with text (`badgeSystem`/`badgeInactive` text labels, not colour-only chips; locked fields carry the lock icon + text, not just a grey background; advisory vs blocking validation differ by icon + heading text, not only by amber-vs-red).
- **Labels**: every input has an associated `<label htmlFor>` (reusing `components/ui/label.tsx`) or, where a visible label is impractical (e.g. per-band-row textareas whose row header already reads "Band 0"), an explicit `aria-label` combining context (`aria-label="authoring.band — 0 — <dimension label>"`) so a screen-reader user moving by form-field doesn't hear five indistinguishable "textarea" announcements across dimensions.
- **Reduced motion**: drawer slide-in transition is disabled under `prefers-reduced-motion: reduce` (panel appears instantly, backdrop still fades or also appears instantly — frontend's call, either satisfies AC-05.11) — no separate design requirement beyond "the feature works with zero animation."

---

# 9. i18n key inventory — mapped to UI location

The exact ~135 keys (vi + en, both locales, zero dead keys) are enumerated verbatim in `F12-ba.md` §8 — this UX spec does not re-list every key but maps each **namespace** to where it renders, so frontend can cross-reference without hunting:

- `drawer.*` → the shared primitive (§1.1): `close` (× button `aria-label`), `unsavedTitle/unsavedBody/unsavedDiscard/unsavedStay` (§1.2/1.3's confirm dialog).
- `criteria.uploadNoPrivilege` → §3.1's disabled `.docx` form caption (the one exception to "absent when unavailable," §5).
- `templates.*` → all of §3.2/§3.3 (Drawer 1 list + editor form): row labels/badges/actions, every form field label, the seven `lockPath.*` checkbox labels, the five `issue.*` level-validation messages (rendered per §3.3's advisory banner), the six `blocking.*` messages (rendered per §3.3's footer + inline field flags), confirm-dialog titles/bodies, `saved` success banner.
- `authoring.*` → all of §3.4 (Drawer 2): step labels, `band`/`bandHint` (band grid, §3.4.1), `outOfScale*`/`tooManyBands` (§3.4.1's narrowing/cap states), `subFactor*` (§3.4.2), `cb*`/`intentPraise`/`intentSuggest` (§3.4.3), `locked*` (§3.4.4), `pronunciation*` (§3.4.5), `preview*`/`variant*` (§3.4.6), `savedVersion` (post-save banner).
- `errors.*` → §4's cross-cutting error table, every row.
- Reused existing keys (not new): `criteria.save`, `criteria.selectCourse`, `criteria.version`, `criteria.preview`, `criteria.courseId`, `users.privRubricTemplate`, `users.privCriteriaAuthor` (this last pair belongs to the Users page checkbox UI, out of F12's own screens but referenced so `frontend` doesn't accidentally duplicate them).

Frontend must wire the `tsc`-enforced parity guard from AC-23.3 (`en` typed against `vi`'s key shape) — this is a build-time structural requirement, not a visual one, but is called out here because it changes how `i18n/index.ts` is *structured*, which is worth flagging before implementation starts rather than discovering mid-PR.

---

## Blockers / open questions

None. Two design decisions worth flagging to frontend/PM as decisions rather than defaults, mirroring BA's own OQ list:

- **Locked-field keyboard reachability** (§7): locked text/select inputs use `readOnly` + `aria-disabled` (stay in tab order so the lock reason is keyboard-discoverable) rather than native `disabled`; locked checkboxes use native `disabled` (no meaningful read-only checkbox semantic exists) with the reason text placed immediately adjacent so it's still discoverable via the group's own tab stop. Frontend should keep this distinction rather than blanket-`disabled`-ing everything.
- **Asymmetric "hidden vs disabled+hint" privilege treatment** (§5): new Drawer 1/2 entry points are absent when unavailable; the pre-existing `.docx` upload form is disabled+captioned instead, specifically because it predates F12 and vanishing it would read as a bug. If PM/BA would rather have full symmetry (hide the upload form too), that's a one-line spec change, flagged here so it isn't silently reinterpreted by frontend.

## Notes for the next role

- **Frontend**: build `components/ui/drawer.tsx` and `confirm-dialog.tsx` first (§1) — everything else depends on them. The band grid (§3.4.1) is the feature's headline interaction; get its derive-from-`scale`/widen-preserves/narrow-parks/50-cap behaviour right before polishing anything else, and use `lib/rubric.ts`'s `bandValues`/`maxTotal`/`levelIssues` (F12-ba.md FR-07) rather than re-deriving. The dirty-check (§1.3) must compare form-model to form-model — re-read AC-21.4/21.5/21.6 in `F12-ba.md` before implementing, it is the single easiest thing to get subtly wrong. The prompt-preview pane (§3.4.6) renders a server string only — zero prompt-building logic belongs in the dashboard. New icons needed are listed in §0 — add them to `components/icons.tsx` in the existing hand-authored style, no package. Every icon-only button needs an explicit `aria-label` per the F3 QA lesson cited in the brief; this UX spec calls out where each one is context-dependent (row name/index interpolation) rather than generic.
- **QA**: cross-reference this spec's §2 (UC-1…UC-7) against `F12-ba.md`'s own UC section — they describe the same seven flows; this file adds the concrete screen-by-screen detail and the five-actor visibility table in §5 that QA's AC-10.3 probe should follow literally. §8's keyboard/focus-trap/Esc-topmost-wins behaviour and §3.4.1's band-grid widen/narrow/cap behaviour are the highest-value manual passes per BA's own §9 split.
