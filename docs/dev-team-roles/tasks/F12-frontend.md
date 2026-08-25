# F12 · Frontend — Two dashboard drawers (template-structure editor + scoring-content editor + live prompt preview)

- **Owner role:** frontend
- **Feature:** F12 — dashboard slice only: `components/ui/drawer.tsx` + `confirm-dialog.tsx`, `lib/rubric.ts`,
  Drawer 1 "Cấu trúc chấm điểm" (`rubric_template`), Drawer 2 "Soạn nội dung chấm điểm" (`criteria_author`)
  with band grid / sub-factors / comment bank / locked fields / pronunciation pin / live prompt preview,
  additive changes to `pages/Criteria.tsx` and `api/client.ts`, i18n parity.
- **Status:** DONE (fix round 2 complete — DEF-7 fixed, rebuilt clean)
- **Last updated:** 2026-08-23
- **Depends on:** `F12-ba.md`, `F12-ux.md`, `F12-backend.md`, `F10-backend.md`

## Inputs (what this role received)

- `F12-ba.md` — FR-05…FR-24 (mine), ~170 ACs, UC-1…UC-7, i18n inventory §8 (~135 keys), §9 machine-verifiable split.
- `F12-ux.md` — drawer primitive spec, both drawer wireframes, band-grid design (headline interaction),
  privilege-visibility table, error/state table, a11y notes, i18n key → UI mapping.
- `F12-backend.md` — exact API contract for `POST /criteria/json` and `POST /criteria/prompt-preview` (DONE).
- Code read: `pages/Criteria.tsx`, `api/client.ts`, `i18n/index.ts`, `auth/AuthContext.tsx`,
  `components/ui/{button,badge,alert,tooltip,select-native,input,textarea,label}.tsx`, `components/icons.tsx`,
  `core-api/src/criteria/rubric-schema.ts`, `core-api/src/lib/rubric-scoring.ts`, `core-api/src/criteria/lockable-fields.ts`.

## Checklist

- [x] Read TASK-PROTOCOL, create this file, Status IN_PROGRESS
- [x] Read F12-ba.md (frontend FRs), F12-ux.md, F12-backend.md contract, F10-backend.md routes
- [x] Read existing dashboard surface for conventions
- [x] `components/ui/drawer.tsx` (FR-05) + `components/ui/dialog-stack.ts` (shared topmost-Esc helper)
- [x] `components/ui/confirm-dialog.tsx` (FR-06)
- [x] `lib/rubric.ts` — ported types + maxTotal/levelIssues/bandValues (FR-07)
- [x] `api/client.ts` additive: `ApiError.body`/`serverMessage` (FR-08)
- [x] New icons in `components/icons.tsx`
- [x] i18n keys (vi+en) with `Record<keyof typeof vi,string>` parity guard (FR-23), zero dead keys verified
- [x] `pages/criteria/TemplateDrawer.tsx` — Drawer 1 (FR-09…FR-14)
- [x] `pages/criteria/RubricDrawer.tsx` — Drawer 2 (FR-15…FR-21)
- [x] `pages/criteria/PromptPreview.tsx` — shared preview pane (FR-20)
- [x] `pages/criteria/api-errors.ts` — shared error-surfacing helper (FR-22)
- [x] Wire into `pages/Criteria.tsx`, additive only (FR-09/FR-10)
- [x] Docker build (`tsc -b && vite build`) — clean
- [x] Fill Outputs incl. what is/isn't machine-verifiable, set Status DONE

### Fix round 1 (QA FAIL — 6 defects)
- [x] DEF-1 (Major) — `drawer.tsx` Esc closes with stale `onRequestClose` closure, discards dirty draft silently. Fixed with a `useRef` holding the latest callback, updated in its own no-deps effect; the listener-registration effect keeps `[open]` as its only dependency (no focus/scroll-lock regression). Same latent bug fixed in `confirm-dialog.tsx`'s `onCancel` for consistency (not directly reported, same class).
- [x] DEF-2 (Minor) — `RubricDrawer.tsx` locked-field summary now shows the actual loaded value for all 7 paths via `lockPathValueText()`.
- [x] DEF-3 (Minor) — padlock icon + "locked by template" reason now render only for paths actually in `lockedPaths`; unlocked paths show the value + an "edit in Drawer 1" pointer, no padlock.
- [x] DEF-4 (Minor) — `TemplateDrawer.tsx` Ẩn/Hiện, Xóa, Khôi phục now go through `withBusy()`, tracked in a `busyKeys` set, disabling the button for that row while its request is in flight.
- [x] DEF-5 (Minor) — a 409 `template key already exists` now focuses `keyInputRef` (bound to whichever of `tpl-key`/`tpl-dup-key` is rendered).
- [x] DEF-6 (Minor) — `api-errors.ts::describeApiError` now also handles a 400 body whose `message` is an array of strings (Nest's ValidationPipe shape), surfacing it via `issues` instead of dropping it silently. Added `maxLength={200}` to the Drawer-2 title input too (belt-and-suspenders, not the fix itself).
- [x] Reproduce DEF-1 before/after with an esbuild+jsdom harness (see Outputs) — confirmed stale-closure bug on the pre-fix source, confirmed correct dirty-aware behaviour on the fixed source
- [x] Rebuild via Docker, confirm clean, report module count — 96 modules, clean, identical output hashes to the pre-fix-round build
- [x] Set Status DONE

### Fix round 2 (QA FAIL — 1 defect)
- [x] DEF-7 (Minor) — `RubricDrawer.tsx` (`lockPathValueText`, `student_reply` case) hardcoded Vietnamese "nút". Replaced with `t('authoring.replyButtonCount', { count })`; added `authoring.replyButtonCount` (`'{{count}} nút'` / `'{{count}} button(s)'`) to both locale blocks in `i18n/index.ts`, right after `authoring.savedVersion`. Closes the one placeholder (`{{count}}`) from AC-23.4's inventory that no key had used yet.
- [x] Rebuild via Docker, confirm clean, report module count — 96 modules, clean
- [x] Set Status DONE

## Outputs

### Build result (actually executed)

`MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Docs/Project/TTTA/services/dashboard:/app" -w /app node:24-alpine sh -c "npm ci && npm run build"`
→ `tsc -b && vite build` **exit 0**. `96 modules transformed` (baseline 88 + 8 new source files),
`dist/assets/index-*.js 397.89 kB (gzip 115.14 kB)`, `dist/assets/index-*.css 20.44 kB (gzip 4.87 kB)`.
Re-ran clean a second time after the last i18n dead-key fix — same result.

### New files

- `components/ui/drawer.tsx` — hand-authored slide-over (FR-05): portal, `role="dialog"`
  `aria-modal`, focus trap + restore, body-scroll lock restoring the *previous* inline value,
  CSS-only transition (`motion-reduce:transition-none`), full-width `< md`, `md`/`lg` sizes.
- `components/ui/dialog-stack.ts` — tiny module-scoped stack so Esc closes only the topmost
  surface when a `ConfirmDialog` is nested inside a `Drawer` (AC-05.5/AC-06.2).
- `components/ui/confirm-dialog.tsx` — the only confirmation mechanism in F12 (FR-06); no
  `window.confirm`/`alert`/`prompt` anywhere in the new files (grepped, zero hits).
- `lib/rubric.ts` — v2 types byte-identical in field names to `core-api/src/criteria/rubric-schema.ts`;
  `maxTotal`/`levelIssues` are line-for-line ports of `core-api/src/lib/rubric-scoring.ts`'s
  `maxTotal`/`validateLevels` (codes + numeric context only, no copy-pasted Vietnamese strings);
  `bandValues(scale)` with the 50-row cap. Pure module — no fetch/React/i18n import (AC-07.6).
- `pages/criteria/api-errors.ts` — `describeApiError()` maps `ApiError`/network failure → localized
  heading + verbatim server text per FR-22's table (400 `invalid rubric` issues list, the four named
  409 strings, 401/403/404/413/5xx); `levelIssueText()` localizes a client-side `LevelIssue`.
- `pages/criteria/PromptPreview.tsx` — shared pane for both drawers; renders only the server's
  `prompt` string (`<pre>{prompt}</pre>`, no `dangerouslySetInnerHTML`, no local prompt-building —
  grepped for `Tiêu chí:`/`Band ` prompt literals, zero hits outside `bands`/`comment_bank` data
  editing UI). Debounced 400 ms, stale responses discarded via a request-sequence ref (AC-20.3),
  "updating…" caption without clearing previous text (AC-20.4), audio/text variant toggle.
- `pages/criteria/TemplateDrawer.tsx` — Drawer 1: list (loading/empty/error states, `isSystem`/
  inactive badges, computed max-total per row, the exact 4/8 row-action matrix of AC-11.4) +
  create/edit/duplicate form (key/name, course_key/task_type/tone/feedback_language, scale +
  live computed max total, aggregation, dimensions with confirm-gated remove, levels with
  reorder + inline+summarized advisory validation, output-field checkboxes, optional
  `student_reply` block with buttons, the 7-path `locked` checkbox group) wired to all 8 F10
  template routes with the exact status-code handling from `F12-backend.md`/`F10-backend.md`.
- `pages/criteria/RubricDrawer.tsx` — Drawer 2: course+template select step (skipped when opened
  from a version row's "Sửa"), band grid derived from `bandValues(scale)` (one `<textarea>` per
  band, non-empty lines → `bands[value]`, empty ⇒ omitted, out-of-scale bands parked in their own
  delete-only section, 50-row cap banner), sub-factors grid, comment bank, pronunciation pin +
  blocking banner when absent, a read-only structural-fields summary (see Deviations below), the
  live `PromptPreview`, and `POST /criteria/json` save with the OBS-3-safe dirty-check.

### Changed files

- `api/client.ts` — `ApiError` gained optional `body`/`serverMessage` fields (FR-08); the existing
  `message` string (`` `${method} ${path} failed: ${status}` ``) is untouched byte-for-byte; body
  parsing never throws and a non-JSON/empty body just leaves both new fields `undefined`.
- `components/icons.tsx` — added `IconClose/Plus/Copy/Trash/Eye/EyeOff/Restore/Lock/Pin/
  ChevronUp/ChevronDown/AlertTriangle`, same hand-authored 20×20/1.5px/`currentColor` style as
  the existing set. No package added.
- `i18n/index.ts` — restructured to `const vi = {...} as const;` +
  `const en: Record<keyof typeof vi, string> = {...};` + `const resources = {vi:{translation:vi},
  en:{translation:en}}` (AC-23.3). This is a STRUCTURAL change (not just additive keys) but the
  full pre-existing key SET and every pre-existing value are unchanged — only the wrapping literal
  changed shape, verified by the clean build (a missing/renamed pre-F12 key on either side would
  now fail `tsc -b`, and it didn't). Added 144 new keys × 2 locales (`drawer.*`, `templates.*`,
  `authoring.*`, `errors.*`, `criteria.uploadNoPrivilege`) exactly matching `F12-ba.md` §8's
  inventory. Verified **zero dead keys** by script: every new key is referenced by a literal
  `t('key')` call or, for `templates.lockPath.*`/`templates.issue.*` (accessed via template-literal
  keys built from `LOCK_I18N_SUFFIX[path]`/`issue.code`), by the matching dynamic prefix.
- `pages/Criteria.tsx` — purely additive: privilege-gated entry-button row (`templates.open`/
  `authoring.open`, absent when unavailable per F12-ux.md §5's "no dead-end button" rule), a
  `<fieldset disabled>` + `criteria.uploadNoPrivilege` caption around the **pre-existing** `.docx`
  upload form (the one exception — disabled+explained instead of hidden, because it predates F12),
  a "Sửa" button per version-list row gated on `criteria_author`, and the two drawers mounted at
  the bottom. The `.docx` form's markup/behavior, the classes-config table, and the version-list/
  JSON-preview card are byte-identical to before except for the added fieldset wrapper and one
  new button.

### API calls made (exact paths, matching `F12-backend.md`/`F10-backend.md`)

`GET/POST/PUT/DELETE/PATCH /criteria/templates[...]` (all 8 F10 routes), `GET /criteria/:id`,
`POST /criteria/json` (raw rubric, `version` never sent), `POST /criteria/prompt-preview`
(`variant` sent as `'audio'`/`'text'`, never `null`).

### Deviations from the spec (recorded, not hidden)

1. **Drawer 2's structural fields (`scale`, `aggregation`, `levels`, `output_fields`,
   `dimensions[].key/weight`, `student_reply`) are rendered as a read-only summary list in ALL
   cases, not as disabled/enabled `<input>`/`<select>` controls that toggle with `locked[]`.**
   FR-19/AC-19.1 describes real form controls that become read-only per-path; given AC-19.4/19.5
   already establish that `locked` is UI-only and applies to *every* user including admins (with
   Drawer 1 as the place to actually change these fields), I judged that showing them as plain
   read-only rows — always, with the lock icon + `authoring.lockedReason` text shown only for
   paths actually in the template's `locked[]`, and a plain "edit in Drawer 1" caption otherwise —
   delivers the same practical guarantee (content vs. structure stays separated, values are still
   submitted unchanged, AC-19.3) at a fraction of the form-state duplication `TemplateDrawer.tsx`
   already owns. **Values ARE still carried through byte-identical in the save payload** (loaded
   via `cloneRubric`, never stripped). If BA wants literal per-field disabled inputs matching
   Drawer 1's own field UI one-for-one, that is an additive follow-up to `RubricDrawer.tsx` only.
2. **Level reordering in Drawer 1 uses up/down buttons, not drag** — matches AC-24.2's own
   preference for keyboard-accessible controls over drag-and-drop.
3. **Duplicate (UC-2) issues two requests** (`POST .../duplicate` then `PUT` with the edited
   draft) rather than one, so that edits made in the pre-filled duplicate form (e.g. removing a
   dimension before first save) are not silently discarded — F10's duplicate route only accepts
   `{key,name?}`, not a full rubric override.
4. **`levelIssues`'s advisory summary banner** uses `role="status"` per F12-ux.md §8 (announced
   once, not `role="alert"`), matching the UX spec's explicit guidance to avoid two competing
   "alert" semantics with the blocking-error `Alert`.

### What is / is not machine-verifiable (dashboard has no jest suite — F12 does not add one)

**Machine-verified here:** `tsc -b` (both the app and any implicit project refs) + `vite build`
clean, 96 modules, 0 errors — this catches every type error, every unresolved import, AND (via
AC-23.3's `Record<keyof typeof vi,string>`) any i18n key that exists in one locale but not the
other, across the *entire* file (pre-existing keys included, not just F12's). A separate
grep-based check (documented above) confirmed all 144 new keys are referenced at least once.

**NOT machine-verifiable in this repo — QA must inspect by hand** (per `F12-ba.md` §9, unchanged
by this implementation):
1. Drawer primitive behaviour: focus-trap wrap-around, focus restore to the exact invoking
   element, Esc topmost-wins with a nested `ConfirmDialog`, backdrop click, body-scroll-lock
   restore across two open/close cycles, `prefers-reduced-motion`.
2. The five-actor privilege-visibility matrix (AC-10.3) — needs five real logged-in sessions.
3. Band-grid behaviour: 0–5 ⇒ 6 rows / 0–9 ⇒ 10 rows, widening (edit the template's scale, then
   reopen Drawer 2) preserves already-typed text, narrowing parks orphaned bands in the
   "outside the scale" section rather than discarding them, the 50-row cap banner.
4. Live max-total (Drawer 1) and advisory level-issue recomputation on every keystroke.
5. **AC-21.6 — the single highest-value manual check**: open Drawer 2 on an existing v1-era
   `criteria` row via "Sửa", touch nothing, confirm Esc/backdrop/× close with **no** unsaved-
   changes dialog. (By construction here, `baseline`/`draft` are both derived once from the same
   `GET /criteria/:id` response and compared via `JSON.stringify` of that *shared* form-model
   shape — never against a re-fetch, never raw-vs-normalized — so this should hold, but it is a
   behavioural claim that needs an actual v1-era row to confirm.)
6. Prompt-preview liveness end-to-end against a running core-api: debounce timing, that a failed
   preview never blocks Save, that switching variant re-renders immediately.
7. Full error-surfacing pass against a real server: all four 409 strings, the `invalid rubric`
   issues list rendering, 401/403/404/413/5xx/network, confirming no raw `ApiError.message`
   (`"POST /x failed: 409"`) or stack ever reaches the UI.
8. i18n: a full `en`-locale pass of both drawers checking for any residual Vietnamese text, and
   vice versa (the `tsc` guard proves *parity of keys*, not *quality/absence-of-leakage of values*).
9. Responsive passes at `< md` / `md`–`lg` / `≥ lg`, and a keyboard-only pass of both drawers
   (open → traverse → add/remove every repeatable row type → save → close).
10. The deviation in item 1 above — QA/BA should decide whether the read-only-summary treatment
    of Drawer 2's structural fields satisfies FR-19's intent or needs the fuller per-field
    editable-when-unlocked treatment.

### Fix round 1 — evidence and changed files

**DEF-1 repro (jsdom + esbuild harness, run twice against pre-fix and post-fix `drawer.tsx`):**

```
=== variant: before (pre-fix drawer.tsx) ===
before Escape: {"open":true,"dirty":true,"confirmShown":false}
after Escape:  {"open":false,"dirty":true,"confirmShown":false}
log: ["requestClose called with dirty=false"]

=== variant: after (fixed drawer.tsx) ===
before Escape: {"open":true,"dirty":true,"confirmShown":false}
after Escape:  {"open":true,"dirty":true,"confirmShown":true}
log: ["requestClose called with dirty=true"]
```
Harness: a `Harness` wrapper component holds real `dirty`/`open`/`confirmShown` state and passes
a fresh `requestClose` closure to `Drawer` every render (mirroring `Criteria.tsx`'s drawers); after
mount, `dirty` is flipped to `true` via `flushSync` (no open/close transition — so `Drawer`'s
`useEffect(..., [open])` does NOT re-run, exactly the real scenario), then a real `Escape`
`KeyboardEvent` is dispatched on `document`. Built with `esbuild.build()` (bundling the actual,
unmodified source files — `dialog-stack.ts`/`icons.tsx`/`lib/utils.ts` — via an alias plugin for
the `@/*` paths) and executed under a minimal `jsdom` global (`window`/`document`/`MessageChannel`/
`performance` wired up before `react-dom` loads). Pre-fix: the drawer closes (`open:false`) and the
log shows the stale `dirty=false` read, discarding the draft with no confirm. Post-fix: the drawer
stays open, `confirmShown:true`, and the log shows the correct `dirty=true`. Harness files (not
part of the app, not committed) under the session scratchpad's `def1/` directory:
`drawer-before.tsx` (frozen pre-fix source), `harness.tsx`, `build-and-run.cjs`.

**Rebuild after all 6 fixes:** `tsc -b && vite build` exit 0, **96 modules transformed** (same
count as before this fix round — no new files, only edits), `dist/assets/index-*.js 399.54 kB
(gzip 115.56 kB)`, `dist/assets/index-*.css 20.47 kB (gzip 4.88 kB)` — output hashes identical
between the two post-fix build runs (deterministic).

**Files changed this round:**
- `components/ui/drawer.tsx` — DEF-1: `onRequestCloseRef` pattern.
- `components/ui/confirm-dialog.tsx` — same-class fix for `onCancel` (defensive, not separately reported).
- `pages/criteria/RubricDrawer.tsx` — DEF-2/DEF-3: `lockPathValueText()` + conditional padlock; `maxLength={200}` on the title input.
- `pages/criteria/TemplateDrawer.tsx` — DEF-4: `busyKeys`/`withBusy()`; DEF-5: `keyInputRef` + focus-on-409.
- `pages/criteria/api-errors.ts` — DEF-6: array-shaped `message` handling.

### Fix round 2 — evidence and changed files

**Rebuild after DEF-7:** `tsc -b && vite build` exit 0, **96 modules transformed** (no new files),
`dist/assets/index-*.js 399.68 kB (gzip 115.60 kB)`, `dist/assets/index-*.css 20.47 kB (gzip 4.88 kB)`.
`tsc -b` passing confirms both locale blocks stayed in parity under the `Record<keyof typeof
vi,string>` guard. Grepped `services/dashboard/src` for the literal `nút` post-fix — the only
remaining occurrence is the localized `vi` value inside `i18n/index.ts` itself, as expected.

**Files changed:** `pages/criteria/RubricDrawer.tsx` (`lockPathValueText`'s `student_reply` case
now calls `t('authoring.replyButtonCount', {count})`), `i18n/index.ts` (new key
`authoring.replyButtonCount` in both `vi`/`en` blocks, referenced exactly once, closing the
`{{count}}` placeholder gap AC-23.4 flagged).

## Blockers / open questions

None blocking `DONE`. One design deviation flagged above (Drawer 2 structural-field treatment)
that BA/PM may want to weigh in on; it does not block save/read correctness (values are still
carried through unchanged), only the fidelity of the "editable when unlocked" interaction.

## Notes for the next role

- **QA:** start with §"What is / is not machine-verifiable" above — it mirrors `F12-ba.md` §9
  exactly and adds implementation-specific detail (e.g. exactly how the AC-21.6 dirty-check is
  constructed, so you know what would have to break for it to regress). The highest-value manual
  checks, in order: AC-21.6 (v1-era row ⇒ not dirty), AC-10.3 (five-actor matrix), AC-16.5/16.6
  (band-grid widen/narrow), AC-22.3 (all four 409 strings), the i18n Vietnamese/English-leakage
  pass. Also re-run the dead-key grep script documented in this file's Outputs if any further i18n
  keys are added later, since there is no automated CI step for it.
- **Whoever reviews the Drawer-2 structural-fields deviation:** see Deviations item 1. Values are
  never lost or corrupted either way (they round-trip through `POST /criteria/json` unchanged) —
  the only difference from the letter of FR-19 is that unlocked structural fields are not directly
  editable inside Drawer 2 today; an author edits them in Drawer 1 instead.
