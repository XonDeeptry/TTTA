# F12 · QA — Two dashboard drawers + live prompt preview (and full F8–F12 regression)

- **Owner role:** qa
- **Feature:** F12 — final quality gate for the template-structure drawer, the scoring-content
  drawer, the live prompt preview, `POST /criteria/json` + `POST /criteria/prompt-preview`, and the
  TS↔Python prompt-renderer drift guard. Also the run's **full regression** across F8–F12.
- **Status:** DONE — **final verdict PASS** (fix round 2). Round 1: FAIL (1 Major + 5 Minor).
  Fix-round-1 re-gate: FAIL (DEF-1…DEF-6 closed, but the DEF-2 fix introduced DEF-7).
  **Fix-round-2 re-gate: PASS** — all 7 defects closed and independently verified. See §11–§12.
- **Last updated:** 2026-08-23 (fix round 2 re-gate — final)
- **Depends on:** `F12-ba.md`, `F12-ux.md`, `F12-backend.md`, `F12-frontend.md`

## Inputs (what this role received)

- `F12-ba.md` — 24 FRs / ~170 ACs, §7 data dictionary, §8 i18n inventory, §9 machine-verifiable split.
- `F12-ux.md` — drawer primitive spec, both wireframes, §3.4.4 locked-field treatment, §7 a11y notes.
- `F12-backend.md` — claims + AC-03.8 three-step proof + 5 recorded deviations.
- `F12-frontend.md` — claims + 4 recorded deviations, one flagged for QA/BA arbitration.

## Checklist (the concrete work items for this task)

- [x] Read TASK-PROTOCOL + template, create this file, Status IN_PROGRESS
- [x] Read `F12-ba.md` (FR-01…FR-24 + §7/§8/§9/§10), `F12-ux.md`, backend + frontend claims
- [x] Run grading-worker pytest
- [x] Run core-api build (both tsc) + full jest
- [x] Run dashboard Docker build
- [x] Run zalo-gateway build + jest
- [x] Reproduce the AC-03.8 three-step reverse-patch proof (+ 2 adversarial extensions)
- [x] Verify `prompt.py` change is docstring-only
- [x] Arbitrate the frontend's Drawer-2 structural-fields deviation
- [x] Verify carried warning 1 — raw rubric to server (AC-01.2/01.3)
- [x] Verify carried warning 2 — dirty-check form-model vs form-model (AC-21.4/21.5/21.6)
- [x] Verify carried warning 3 — i18n parity + zero dead keys (independent re-verification)
- [x] Verify no new dependency, no migration
- [x] Verify `pages/Criteria.tsx` additive-only; `api/client.ts` `message` byte-identical
- [x] Verify accessible names on all new controls
- [x] Verify prompt-preview is never a save-gate; `variant` omitted not null
- [x] Build a runtime repro harness for the one Major defect (jsdom, isolated in scratchpad)
- [x] Full F8–F12 regression statement
- [x] Fill Outputs, verdict (round 1: FAIL on DEF-1)

### Fix round 1 re-gate
- [x] Verify the transient-`jsdom` cleanup independently (package.json, lockfile, node_modules, build log)
- [x] Re-run my own harness against the **fixed** `drawer.tsx` (DEF-1)
- [x] Negative control — revert the ref, confirm the harness still catches the bug
- [x] Confirm focus-restore + focus-trap wrap + scroll-lock did NOT regress
- [x] Verify DEF-2 (values shown), DEF-3 (padlock only when locked), DEF-4, DEF-5, DEF-6
- [x] Re-run all four suites on the final tree
- [x] Re-verify i18n parity / dead keys / leakage / placeholders
- [x] Sweep F12 TSX for hardcoded Vietnamese ⇒ **found DEF-7**
- [x] Confirm drift-guard files untouched; no forbidden patterns; accessible names intact
- [x] Final full-regression statement + verdict (fix round 1: FAIL on DEF-7)

### Fix round 2 re-gate (final)
- [x] Verify DEF-7 fix shape (key in both locale blocks, `t()` call, `{{count}}` consumed)
- [x] Re-run i18n sweep — 409 = 409, zero dead keys, zero `en` leakage, zero placeholder mismatches
- [x] **Widened** Vietnamese-in-TSX sweep across all dashboard source, not just the changed line
- [x] Confirm `drawer.tsx` MD5-unchanged since the 10/10 harness run (so §10.2 carries over)
- [x] Confirm drift-guard trio MD5-unchanged; `Criteria.tsx` additive; `client.ts` `message` intact
- [x] Confirm no dependency change, no migration, no non-dashboard source touched
- [x] Re-run dashboard build + grading-worker; carry core-api/gateway from the untouched tree
- [x] Write §11 + §12, final verdict PASS, set Status DONE

---

# 1. Suite / build results — all four actually executed

| Suite | Command | Claimed | **Measured** |
| :-- | :-- | :-- | :-- |
| core-api | `docker … node:24-alpine "npm ci && npx tsc -p tsconfig.build.json --noEmit && npx tsc -p tsconfig.json --noEmit && npm test -- --maxWorkers=2"` | 43 / 1004 | **43 suites / 1004 tests passed, 0 failed**, both `tsc --noEmit` clean, 217.7 s ✅ |
| grading-worker | `.venv/Scripts/pytest -q` | 448 | **448 passed, 0 failed**, 32.3 s ✅ |
| dashboard | `docker … "npm ci && npm run build"` (`tsc -b && vite build`) | 96 modules | **exit 0, 96 modules transformed**, `index-*.js 397.89 kB` / `index-*.css 20.44 kB` ✅ |
| zalo-gateway | `docker … "npm ci && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2"` | 7 / 61 | **7 suites / 61 tests passed, 0 failed**, 26.0 s ✅ |

All four claims confirmed exactly. `apk add --no-cache openssl` was applied to the core-api
container per the brief; no Prisma schema-engine error occurred.

NFR-07 baselines all grown, none weakened: core-api 39/723 (F10) → **43/1004**;
grading-worker ≥261 → **448**.

---

# 2. The AC-03.8 reverse-patch proof — reproduced, plus two adversarial extensions

Backups taken and MD5-verified before and after every step. **Working tree restored byte-for-byte**
(`prompt-render.ts` `f74aa732…`, `prompt-render.fixtures.json` `31277168…`, `prompt.py` `68781408…`
— identical pre- and post-experiment).

| Step | Mutation | jest | pytest | Backend claimed |
| :-- | :-- | :-- | :-- | :-- |
| **A** | `prompt-render.ts` only: `` `    • ${bullet}` `` → `` `    - ${bullet}` `` (1 char) | **21 failed / 594 passed** | **448 passed** (green) | 21 / green ✅ exact |
| **B** | …then "fix" the fixture to match the mutated TS (60 replacements) | **1 failed** — `cambridge_yl_a0_a2 render ra prompt đọc được` (the AC-03.6 seed test, which does not read the fixture) | **20 failed / 428 passed** | 1 / 20 ✅ exact |
| **C** | restore both; mutate `prompt.py` only (same 1 char) | — | **21 failed / 427 passed** (20 fixture + 1 pre-existing `test_prompt.py`) | 21 ✅ exact |

Every number matches the backend's report. **Step B is the load-bearing one** and it holds: the
cheap escape ("just regenerate the golden file") turns the *other* language red, and jest *still*
catches it via the seed test that renders by import.

**Extension D (mine, not run by backend) — delete the shared fixture.** Neither suite silently
skips: pytest `AssertionError: Thiếu fixture dùng chung…` at collection (`1 error`, suite
interrupted); jest `1 failed / 0 tests` (module resolution failure). This closes the
"guard quietly disabled" failure mode.

**Extension E (mine) — mutate the fixture ALONE, both renderers pristine.** **Both** suites go red
(jest 20 failed / 113 passed; pytest 20 failed / 428 passed). This proves the fixture is
load-bearing on *both* sides and that neither suite is self-referential.

Restored state re-verified green: jest `src/criteria` **11 suites / 615 tests passed**; pytest
**448 passed**.

AC-03.1 ✅ (14 cases, correct shape) · AC-03.3 ✅ (same file by `parents[2]` traversal, Vietnamese
hard-fail, never skip) · AC-03.4 ✅ (v1 legacy, sub-factors ×2 dims, mixed comment-bank grouping,
non-numeric band keys, `output_fields` with/without `fix`, empty bank, empty `sub_factors`, plus
5 extra numeric-grammar cases) · AC-03.7 ✅ (mutual "⚠ BẢN SONG SINH" header on both files, each
naming the other and the fixture).

## `prompt.py` — confirmed docstring-only

The only F12-attributable hunk is an 9-line block **inside the module `"""` docstring**
(`⚠ BẢN SONG SINH (F12): …`). Everything else in `git diff HEAD -- prompt.py` is F8's rewrite
(HEAD predates F8). A module docstring is `__doc__` only and cannot reach `build_system_instruction`
/ `build_system_instruction_text`; empirically confirmed by Step C, where mutating one *code*
character produced 21 failures while the pristine file with the docstring produces 448 passes.
**Verdict: docstring-only, zero rendering impact.** Backend deviation #1 accepted.

---

# 3. Arbitration — the frontend's flagged Drawer-2 deviation

**Question:** Drawer 2 renders the structural fields (`scale`, `aggregation`, `levels`,
`output_fields`, `dimensions[].key/weight`, `student_reply`) as non-editable **always**, rather
than editable when the template did not lock them. Scope gap or acceptable?

## Ruling: **(a) ACCEPTABLE** for the "not editable" question — recorded as a known limitation.

Evidence, in order of authority:

1. **`F12-ba.md` §7.4 — "Drawer 2 form model (criteria content draft)"** is the BA's own exhaustive
   enumeration of what Drawer 2 edits. It lists `courseId`, `templateKey`, `title`, `bands`,
   out-of-scale band keys, `sub_factors`, `comment_bank`, and one final row: *"locked fields — —
   — read-only, **still submitted** with their loaded values."* **No structural field appears as an
   editable Drawer-2 field anywhere in that table.**
2. **`F12-ux.md` §3.4** — the design actually being implemented — wireframes Drawer 2's form as:
   pronunciation banner → per-dimension band grid → sub-factors → comment bank → *"locked-field
   sections render inline within their normal position"* → preview pane. **There is no
   scale/aggregation/levels/output_fields control in the wireframe at all.**
3. **`F12-ux.md` §3.4.4 line 467** explicitly permits the non-editable treatment for `student_reply`:
   *"whole block read-only if any edit control existed, **or simply not offered for editing**."*
4. **`F12-ux.md` §3.4.5** states the division of labour outright: *"dimension order/membership is
   Drawer 1's job; **Drawer 2 only edits content within dimensions the structure already defines**."*
5. **AC-19.5's own rationale** for applying `locked` to everyone is *"it keeps the two drawers'
   responsibilities disjoint (structure vs content)"*. Making unlocked structural fields editable in
   Drawer 2 would contradict the rationale the BA gives for the rule.
6. **AC-19.3 is satisfied in fact**: values round-trip byte-identically. `loadFromCriteria` takes
   `cloneRubric(row.rubric)` (full deep copy) and `submit()` spreads `...draft.rubric`, so `scale`,
   `aggregation`, `levels`, `output_fields`, weights and `student_reply` are all submitted unchanged.
   Nothing is omitted, so `normalizeRubric` never gets a chance to substitute a default server-side.

Counter-evidence considered and rejected as insufficient: AC-19.1's phrase "the corresponding
**control(s)**" presupposes controls exist, and AC-16.5's parenthetical *"(in Drawer 1, then
re-opening Drawer 2, **or via an unlocked `scale` field**)"* shows the BA at least contemplated an
editable scale in Drawer 2. But both are incidental phrasings inside ACs whose subject is something
else (locking; band-grid widening), and AC-16.5's **primary** path — edit the scale in Drawer 1,
reopen Drawer 2 — is fully implemented. A passing parenthetical does not outweigh §7.4, the UX
wireframe, and AC-19.5's stated rationale, all three of which point the same way.

**Recorded as a known limitation:** unlocked structural fields are edited in Drawer 1, not Drawer 2.
If the centre later wants per-field editable-when-unlocked controls in Drawer 2, that is an additive
follow-up to `RubricDrawer.tsx` and a new AC — not an F12 defect.

## However — two Minor defects **inside** that read-only treatment (DEF-2, DEF-3)

The frontend's task file describes what it built as *"a read-only structural-fields **summary**"*.
It is not. `RubricDrawer.tsx:540–553` renders a list of the seven lock-path **names** with a generic
caption and **no values at all** — see DEF-2 — and applies the lock icon and the "Khóa trường"
heading to **all seven paths including the unlocked ones** — see DEF-3. Both are filed below. Neither
changes the ruling above; they are defects in *how* the non-editable state is presented, not in the
decision to make it non-editable.

---

# 4. The three carried warnings — each independently verified

## 4.1 Raw rubric to the server (AC-01.2 / AC-01.3) — **PASS**

`criteria.service.ts:70–99` `createFromJson()`: the first statement is
`const rubric = assertAuthorableRubric(dto.rubric)` on the **raw** DTO value; there is no
`normalizeRubric` call anywhere on this path (the only two in the file are in `toV2()`, the *read*
path). Proven behaviourally, not by reading code, in `criteria-routes.e2e.spec.ts:591–625` over real
HTTP: `scale.step` ∈ `{0, -1}` ⇒ 400 `scale.step must be greater than 0`; `{null, "x"}` ⇒ 400
`scale.step must be a finite number`; `scale: 42` ⇒ 400 `scale must be an object with numeric min,
max and step` — and **`expect(prismaMock.criteria.create).not.toHaveBeenCalled()` in every case**.
F10's DEF-1 does not recur on the new write path.

## 4.2 Dirty-check compares form-model to form-model (AC-21.4/21.5/21.6) — **PASS**

`RubricDrawer.tsx:85` `dirty = JSON.stringify(draft) !== JSON.stringify(baseline)`, where **both
sides are derived from one shared object**: `loadFromCriteria` builds `model` once, then
`setBaseline(JSON.parse(JSON.stringify(model)))` + `setDraft(model)` (lines 130–132). A
`JSON.parse(JSON.stringify(x))` deep clone preserves `x`'s key order exactly, so the two
`JSON.stringify` outputs are byte-identical at t=0 regardless of jsonb key ordering. AC-21.5's four
forbidden constructions are each absent: (a) no re-fetch — the only `GET /criteria/:id` is the one
that seeds the form; (b) not server-JSON vs draft-JSON — both operands are the *same* form model;
(c) nothing assumes the read is byte-identical to what was saved; (d) `/internal/criteria/:courseId`
is never called from the dashboard.

**The named AC-21.6 regression case holds by construction.** A v1-era row is normalized *on read* by
`criteria.service.ts:23 toV2() → normalizeRubric(row.rubric)`, so the drawer receives a well-formed
v2 object (`bands` already `string[]`, `scale` already present) — the raw/normalized asymmetry is
resolved **before** either side of the comparison is built, not between them. I audited every write
to `draft`: exactly one `useEffect` (line 87, deps `[open, initialCriteria?.id]`) which only assigns
the seeded model, and 12 user-event handlers. **Nothing mutates the draft on mount**, so a v1-era row
opened and untouched yields `dirty === false` and closes with no prompt. Controlled `<textarea
value=…>` does not fire `onChange` on mount, so the band grid cannot dirty itself either.

⚠ **But see DEF-1**: the dirty *check* is correct; the Esc *close path* does not read it.

## 4.3 i18n parity + zero dead keys — **PASS** (re-verified independently, not taken on trust)

- **Parity:** parsed both object literals directly. `vi` **408 keys**, `en` **408 keys**, 0 duplicates
  on either side, `vi − en = ∅`, `en − vi = ∅`.
- **AC-23.3 guard present and compiling:** `const vi = {…} as const;` +
  `const en: Record<keyof typeof vi, string> = {…}` — and `tsc -b` passed, so the guard is live.
- **New-key count:** 153 keys added versus `HEAD`, but `HEAD` predates F8, so that span covers the
  whole run. Split by namespace: `templates.*` 85 + `authoring.*` 40 + `errors.*` 13 + `drawer.*` 5 +
  `criteria.uploadNoPrivilege` 1 = **144 — exactly the frontend's claim**. The other 9
  (`users.priv*` ×5, `submissions.*` ×3, `settings.field.zalo.buttons_template_type`) belong to
  F9/F10/F11.
- **Dead keys: ZERO.** My first scan flagged 6 (`errors.conflict*` ×4, `users.priv*` ×2); all six are
  reached through indirection my `t('literal')` regex could not follow — `api-errors.ts:23–26`'s
  `CONFLICT_KEYS` map and `Users.tsx:26–27`'s `labelKey`, both fed into `t(...)`. Confirmed live.
  Dynamic prefixes `templates.lockPath.*` and `templates.issue.*` are reached via template-literal
  keys and are also live.
- **AC-23.4 placeholders:** compared `{{…}}` sets per key across both locales — **0 mismatches**
  across all 408 keys.
- **AC-23.1 / A8 leakage:** swept every `en` value for Vietnamese diacritics — **0 hits**. The `en`
  block is a genuine translation, not a copy.

---

# 5. Test cases — derived from the ACs, with results

Technique key: EP = equivalence partition, BV = boundary value, DT = decision table, ST = state
transition, EG = error guessing.

## 5.1 Core-api — FR-01 `POST /criteria/json`

| # | Tech | Case | AC | Result |
| :-- | :-- | :-- | :-- | :-- |
| B01 | ST | route reaches the handler, never `ParseIntPipe` of `@Get(':id')`; declared before it | 01.1 | PASS (controller line order verified + e2e:519) |
| B02 | EP | happy path ⇒ 201, `rubric` normalized in the response | 01.4 | PASS (e2e:519, :526) |
| B03 | EG | `scale.step` = 0 / −1 ⇒ 400, **no row created** | 01.2/01.3 | PASS (e2e:595) |
| B04 | EG | `scale.step` = `null` / `"x"` ⇒ 400 finite-number, no row | 01.3 | PASS (e2e:604) |
| B05 | EG | `scale` = 42 ⇒ 400 object-shape | 01.3 | PASS (e2e:615) |
| B06 | ST | sequential saves ⇒ n, n+1; `version` in body stripped by `whitelist` | 01.5 | PASS (e2e:532) |
| B07 | BV | `title` 201 chars ⇒ 400; blank ⇒ `` `${course_key} — ${task_type}` `` | 01.6 | PASS (e2e:582; `defaultTitle` shared with `ingestDocx` by extraction, not by copy) |
| B08 | EP | `sourceFilename` written `null` | 01.7 | PASS (service:94, e2e:543) |
| B09 | EP | `templateKey` orphan (no such template) ⇒ 201 | 01.8 | PASS (e2e:543) |
| B10 | EG | `templateKey` bad format ⇒ 400 `invalid template key`; existence never queried | 01.8 | PASS (service:106–112) |
| B11 | EG | `courseId` nonexistent ⇒ 404 `course not found`, never a Prisma FK 500 | 01.9 | PASS (e2e:575) |
| B12 | EG | `rubric` key absent ⇒ 400 from the domain gate (not the DTO), never 500 | 01.10 | PASS (e2e:626) |
| B13 | DT | `criteria_author` ⇒ 201 · `rubric_template` only ⇒ 403 · `[]` ⇒ 403 · anon ⇒ 401 | 01.11 | PASS (e2e:665, :679) |
| B14 | EP | `.docx` path + `GET /internal/criteria/:courseId` unchanged | 01.12 | PASS (no diff on those handlers; 1004 tests green) |

## 5.2 Core-api — FR-02 `POST /criteria/prompt-preview`

| # | Tech | Case | AC | Result |
| :-- | :-- | :-- | :-- | :-- |
| B15 | EP | zero Prisma calls, asserted per model+method | 02.1 | PASS (e2e:746) |
| B16 | DT | `variant` absent ⇒ audio · `'text'` ⇒ transcript branch · `'bogus'`/`''`/`'AUDIO'`/`1`/**`null`**/`[]` ⇒ 400 | 02.2 | PASS (e2e:696; DTO uses `@ValidateIf`, not `@IsOptional`, so `null` cannot become `audio`) |
| B17 | EP | a rubric that `POST /criteria/json` **rejects** still previews 200 | 02.3 | PASS (e2e:711 — each lenient rubric is first asserted rejected by `assertAuthorableRubric`, then previewed) |
| B18 | EG | `null` / `[]` / `"str"` / `42` / `{}` / deep junk / `1e308` ⇒ 200 with a string | 02.4 | PASS (e2e:729 + 12 garbage cases in `prompt-render.spec.ts`) |
| B19 | EP | BR-09 — no total / average / level code or label in the output | 02.5 | PASS (e2e:733) |
| B20 | EP | 200 (not 201), `application/json`, real `\n` | 02.6 | PASS (e2e:686) |

## 5.3 Dashboard

| # | Tech | Case | AC | Result |
| :-- | :-- | :-- | :-- | :-- |
| F01 | ST | `open=false` ⇒ renders `null`; no retained trap | 05.2 | PASS (`drawer.tsx:91`) |
| F02 | EP | `role="dialog"` + `aria-modal` + `aria-labelledby` → the title `<h2>` | 05.3 | PASS |
| F03 | ST | backdrop click ⇒ `onRequestClose('backdrop')`, no self-unmount | 05.4 | **PASS — runtime-proven** (harness: confirm dialog shown, drawer stays open) |
| F04 | ST | **Esc on a DIRTY drawer ⇒ unsaved-changes confirm** | 21.7 / 05.5 | **FAIL — DEF-1**, runtime-proven |
| F05 | ST | body-scroll lock restores the **previous** inline value | 05.8 | PASS (`previousOverflow` captured and restored, not `''`) |
| F06 | ST | focus restore to the invoking element on close | 05.7 | PASS (`previouslyFocused.current?.focus()` in cleanup) |
| F07 | ST | Esc topmost-wins with a nested `ConfirmDialog` | 05.5/06.2 | PASS (`dialog-stack.ts`; `ConfirmDialog`'s own captured `onCancel` is behaviourally stable) |
| F08 | ST | one drawer at a time | 05.10 | PASS (`Criteria.tsx` `activeDrawer`) |
| F09 | EP | reduced motion | 05.11 | PASS (`motion-reduce:transition-none`, CSS-only) |
| F10 | EG | `window.confirm/alert/prompt` anywhere in F12 files | 06.4 | PASS (grep: only comments) |
| F11 | EP | `maxTotal` is a line-for-line port | 07.2 | PASS — **byte-identical** to `core-api/src/lib/rubric-scoring.ts` |
| F12 | BV | YL sum 5×0–5 ⇒ 25 · IELTS average 4×0–9 ⇒ 9 · weighted uneven ⇒ `scale.max` | 07.5 | PASS by inspection of the identical code |
| F13 | EP | `levelIssues` ports `validateLevels`'s logic, codes+numbers only | 07.3 | PASS — same ordering pass, `granularity()`/`minPossibleTotal()` **byte-identical**, 5 codes, zero copied Vietnamese strings |
| F14 | EP | `lib/rubric.ts` pure — no fetch/React/i18n | 07.6 | PASS |
| F15 | EP | `ApiError.message` byte-identical | 08.2 | PASS — `` `${options.method ?? 'GET'} ${path} failed: ${res.status}` `` unchanged |
| F16 | EG | body parse never throws; non-JSON ⇒ `body` undefined; 204 branch intact | 08.3/08.4 | PASS |
| F17 | EP | `.docx` form markup/behaviour, classes table, version list + `<pre>` preserved | 09.1–09.3 | PASS — diff is additive; `name="courseId"`/`name="file"` intact, only a `<fieldset>` wrapper added |
| F18 | EP | no `role === 'admin'` client-side | 10.1 | PASS (grep: zero) |
| F19 | EG | `privileges` undefined ⇒ `[]`, nothing rendered, no crash | 10.2 | PASS (`user?.privileges ?? []`) |
| F20 | DT | AC-10.3 five-actor visibility matrix | 10.3 | PASS by construction (`canTemplates`/`canAuthor` gate all four surfaces exactly per the table; `.docx` form disabled+hinted, never hidden) — **not exercised with five live sessions**, see §7 |
| F21 | DT | AC-11.4 row-action matrix (Xóa iff `!isSystem`, Khôi phục iff `isSystem`) | 11.4 | PASS (`TemplateDrawer.tsx:501,519`) |
| F22 | EP | list uses `?includeInactive=true`, server order preserved, badges + maxTotal per row | 11.1–11.3 | PASS |
| F23 | EP | empty / error+retry states | 11.5/11.6 | PASS |
| F24 | ST | `key` read-only on edit (`readOnly` + `aria-disabled`, not `disabled`) | 12.3 | PASS — matches UX §7's keyboard-reachability rule |
| F25 | DT | exactly the six blocking rules, nothing else disables Save | 13.4 | PASS (`blockingIssues()`) |
| F26 | EP | level issues advisory only | 13.3 | PASS (not in `blocking`) |
| F27 | EP | live `maxTotal`; OBS-2 `stepHint` | 13.1/13.5 | PASS |
| F28 | ST | 409 ⇒ localized message + draft kept + **focus to `key`** | 14.2 | **PARTIAL — DEF-5** (message and draft correct; focus never moved — zero `.focus()` calls) |
| F29 | ST | mutating buttons disabled in flight | 14.11 | **PARTIAL — DEF-4** (form Save yes; the 3 row actions no) |
| F30 | ST | AC-21.6 v1-era row, untouched ⇒ not dirty | 21.6 | PASS — see §4.2 |
| F31 | EP | save payload is exactly `{courseId, templateKey, title?, rubric}`; `version` never sent | 21.1 | PASS (`RubricDrawer.tsx:254`) |
| F32 | ST | 201 ⇒ `authoring.savedVersion` banner + baseline reset; failure ⇒ draft **and** baseline intact | 21.2/21.8 | PASS |
| F33 | ST | Save disabled while in flight | 21.9 | PASS |
| F34 | EP | band grid: one `<textarea>` per band, lines → `string[]`, empty band omitted | 16.2/16.3 | PASS (`setBandLine`: trims, drops blanks, `delete bands[value]` when empty) |
| F35 | EP | out-of-scale bands parked in their own section, editable, explicit per-row delete | 16.6 | PASS (`outOfScale` computed as `keys(bands) − bandValues(scale)`) |
| F36 | BV | 50-row cap | 16.7 | PASS (`bandValues` cap + `BAND_ROW_CAP` slice + `tooManyBands` banner) |
| F37 | EP | sub-factor empty cell omitted; empty-label+no-cells row dropped on save | 17.2/17.3 | PASS (`submit()` filter) |
| F38 | EP | comment bank: empty `text` dropped, empty `intent` ⇒ `null`, order preserved, orphan key still rendered | 18.2–18.5 | PASS (orphan handled by the extra `<option>` at line 506) |
| F39 | EP | pronunciation rendered first, no remove control, badge + reason tooltip | 19.6 | PASS (`orderedDimensions`) |
| F40 | EP | template lacking `pronunciation` ⇒ blocking banner + Save disabled | 15.7/19.7 | PASS |
| F41 | EP | locked values still submitted unchanged | 19.3 | PASS (`cloneRubric` + spread; nothing stripped) |
| F42 | EP | locked paths render read-only **with their values visible** | 19.1 | **FAIL — DEF-2** (values never displayed) |
| F43 | EP | lock affordance scoped to the template's `locked[]` | 19.1/19.2 | **FAIL — DEF-3** (lock icon + "Khóa trường" applied to all 7 paths) |
| F44 | EP | preview renders the server string verbatim; no client prompt assembly | 20.7/20.8 | PASS (grep for `Tiêu chí:` across the whole dashboard: zero outside a comment; no `dangerouslySetInnerHTML`) |
| F45 | ST | debounce 300–500 ms; stale responses discarded | 20.2/20.3 | PASS (400 ms + `requestSeq` ref) |
| F46 | ST | "updating…" without clearing previous text; failure keeps last good text | 20.4/20.5 | PASS |
| F47 | EP | **preview is never a save-gate** | 20.5 | PASS — `PromptPreview` holds `prompt`/`failed` in its own state and exposes nothing upward; `submit()` never reads it. A preview outage cannot block Save. |
| F48 | EP | `variant` sent only as `'audio'`/`'text'`, never `null` | 02.2 | PASS (union-typed local state; `null` unreachable) |
| F49 | DT | error surfacing: `invalid rubric` issue list, 4×409 strings, 401/403/404/413/5xx/network | 22.1–22.7 | PASS (`api-errors.ts`) |
| F50 | EG | 400 whose `message` is an **array** (DTO failures) ⇒ user gets a heading with no explanation | 22.2 | **FAIL — DEF-6** |
| F51 | EG | raw `ApiError.message` / stack ever reaching the UI | 22.8 | PASS (grep: zero `err.message` renders) |
| F52 | EP | errors in an `Alert role="alert"` | 22.9 | PASS |
| F53 | EP | accessible names on every new control | 24.2 | PASS — every icon-only button carries `aria-label`; every input has `<Label htmlFor>` or `aria-label`; the preview radio group has a `<fieldset aria-label>` + `sr-only <legend>`; band textareas carry both. (F3's failure class does not recur.) |
| F54 | EP | no new dependency, no migration | NFR-01 / A2 | PASS — `git status` shows **no** `package.json` or `pyproject.toml` modified in any service; `schema.prisma`'s +47 lines are F9/F10/F11 with their own migrations; **no F12 migration** |

---

# 6. Defects

## DEF-1 — Esc on a dirty drawer discards unsaved work with no confirmation
- **Severity: MAJOR** · **Owning role: frontend**
- **AC:** AC-21.7 (and the AC-05.5 ↔ FR-21 interaction). Also breaks UC-5/UC-6/UC-7 recovery.
- **File:** `services/dashboard/src/components/ui/drawer.tsx:58–89` — the `keydown` listener is
  created inside `useEffect(..., [open])` and closes over that render's `onRequestClose`. The
  suppressed `// eslint-disable-next-line react-hooks/exhaustive-deps` at line 88 is exactly the
  omitted dependency. Both drawers are affected:
  `RubricDrawer.tsx:154` and `TemplateDrawer.tsx:270` both define
  `function requestClose() { if (dirty) setPendingClose(…); else onClose(); }`, where `dirty` is a
  render-scoped value.
- **Repro (runtime-proven, not code-reading):** isolated jsdom harness built from the **real,
  unmodified** `drawer.tsx` + `dialog-stack.ts`, wired with the identical
  `dirty`/`requestClose`/`onRequestClose` shape:
  1. open the drawer (dirty = false at open time)
  2. type into a field ⇒ current render has `dirty = true`
  3. press `Escape`
- **Actual:** `{"open":false,"dirty":true,"confirmShown":false}` — handler log
  `"requestClose called with dirty=false"`. The drawer closes; the authored draft is discarded
  (re-opening re-runs the seeding effect and resets `draft`).
- **Expected:** the unsaved-changes `ConfirmDialog` appears and the drawer stays open.
- **Scope proven by differential:** the **backdrop** path is correct
  (`{"open":true,"confirmShown":true}`, log `dirty=true`) because it reads the prop through an inline
  arrow on each render — so this is Esc-specific, which is the most natural modal-dismiss gesture.
- **Cause confirmed:** re-running the same harness against a copy of `drawer.tsx` with
  `onRequestClose` added to the effect deps flips it to
  `{"open":true,"confirmShown":true}` / `dirty=true`.
- **Recommended fix — do NOT just add the dep.** Adding `onRequestClose` to `[open]` makes the
  effect re-run on every render, and its cleanup calls `previouslyFocused.current?.focus()` and
  restores body overflow — i.e. it would steal focus back to the invoking button on every keystroke,
  breaking AC-05.6/05.7/05.8. Use a ref instead:
  `const cbRef = useRef(onRequestClose); cbRef.current = onRequestClose;` and call
  `cbRef.current('esc')` from the handler, leaving the deps as `[open]`.

## DEF-2 — Drawer 2 never displays the values of the locked structural fields
- **Severity: MINOR** · **Owning role: frontend**
- **AC:** AC-19.1 (`the corresponding control(s) render read-only`), and `F12-ux.md` §3.4.4 line 466
  verbatim: *"**Values stay populated** and are still submitted unchanged (never blanked) — the field
  simply cannot be edited."*
- **File:** `services/dashboard/src/pages/criteria/RubricDrawer.tsx:540–553`
- **Actual:** the section renders one row per lock **path name** (`t('templates.lockPath.*')`) plus a
  caption. No value from `scale`, `aggregation`, `levels`, `output_fields`, `dimensions[].weight` or
  `student_reply` is shown anywhere in Drawer 2. An author is told "the scale is locked by template
  X" but is never shown what the scale is.
- **Expected:** the loaded value rendered read-only next to each path (`readOnly` + `aria-disabled`
  inputs per UX §7, or at minimum a value column).
- **Note:** `scale` is *indirectly* visible via the number of band-grid rows; the other six are not.
  Data is never lost — see F41/AC-19.3 — so this is presentation only.

## DEF-3 — Unlocked paths are rendered as if locked
- **Severity: MINOR** · **Owning role: frontend**
- **AC:** AC-19.1 / AC-19.2 — the lock affordance is scoped to *"each path in the selected
  template's `locked` array"*.
- **File:** `services/dashboard/src/pages/criteria/RubricDrawer.tsx:540–552`
- **Actual:** the section heading is `t('templates.locked')` ("Khóa trường") and **every** one of the
  seven paths renders with an `IconLock`, whether or not the template locked it. Only the trailing
  sentence differs (`lockedReason` + `lockedWhere` when locked, `lockedWhere` alone when not). A
  template with `locked: []` still shows seven padlocks under a "Locked fields" heading.
- **Expected:** the lock icon and the "locked" framing appear only for paths actually in `locked[]`;
  unlocked paths, if shown at all, need neutral framing (e.g. "edit in Drawer 1").
- **Note:** this is the presentation half of the deviation arbitrated in §3; the arbitration ruling
  (structural fields non-editable in Drawer 2) stands regardless.

## DEF-4 — Row-level mutating actions are not disabled while in flight
- **Severity: MINOR** · **Owning role: frontend**
- **AC:** AC-14.11 (*"Every mutating button is disabled while its request is in flight"*).
- **File:** `services/dashboard/src/pages/criteria/TemplateDrawer.tsx:486–531` — the Ẩn/Hiện, Xóa and
  Khôi phục buttons have no `disabled` prop; `toggleActive`/`deleteRow`/`resetRow` (lines 343–372)
  keep no in-flight state. Only the form's Save is guarded by `saving`.
- **Actual:** double-clicking "Khôi phục bản gốc" issues two `POST …/reset`.
- **Expected:** disabled for the duration of the request.
- **Mitigation (why Minor, not Major):** all three are idempotent or self-correcting — `PATCH
  …/active` sends the same boolean both times (computed from the same stale row), a second `DELETE`
  returns 404 which is surfaced and refreshes the list, and reset-to-seed is idempotent. No duplicate
  data can be created.

## DEF-5 — 409 does not move focus to the `key` field
- **Severity: MINOR** · **Owning role: frontend**
- **AC:** AC-14.2 (*"…form stays open with the draft intact **and focus moved to the `key` field**"*).
- **File:** `services/dashboard/src/pages/criteria/TemplateDrawer.tsx` — zero `.focus()` calls and no
  `useRef` on the key input in the whole file.
- **Actual:** on a duplicate-key 409 the localized `errors.conflictDuplicateKey` renders and the
  draft is preserved (both correct), but focus stays where it was — after the drawer's focus trap
  that is typically the Save button, so a keyboard user must hunt for the offending field.
- **Expected:** focus moved to the `key` input.

## DEF-6 — A 400 with an array-form `message` renders as a bare heading with no explanation
- **Severity: MINOR** · **Owning role: frontend**
- **AC:** AC-22.2 (*"the server `message` is shown verbatim under a localized heading … does not
  swallow them"*).
- **Files:** `services/dashboard/src/api/client.ts:32–35` captures `serverMessage` only when
  `typeof body.message === 'string'`; `services/dashboard/src/pages/criteria/api-errors.ts:51`
  then returns `{ heading: t('errors.invalidRubric'), issues: [], detail: undefined }`.
- **Repro:** Drawer 2 → title field (no `maxLength` on `RubricDrawer.tsx:359`) → paste 201
  characters → Save. Nest's `ValidationPipe` returns
  `{"statusCode":400,"message":["title must be shorter than or equal to 200 characters"],"error":"Bad Request"}`.
- **Actual:** the user sees only "Rubric không hợp lệ" with no indication that the *title* is the
  problem — and the title is not part of the rubric, so the heading actively misleads.
- **Expected:** the server's message shown verbatim under the heading (join the array).
- **Also reachable via** `courseId` DTO failures. Backend's contract explicitly documents this
  array-form shape (`F12-backend.md`, "400 array-form `message` for `courseId`/`title` DTO
  failures"), so the front-end had the information.

## Not defects — recorded so they are not re-litigated

- **Backend deviations #1–#5** (docstring-only `prompt.py` header; AC-03.6 relocation; AC-02.3
  scalar-only; `@Allow()` over real DTO validators; version-numbering race inherited from
  `ingestDocx`) — all reviewed and **accepted**. The version race needs a
  `@@unique([courseId, version])` migration to close and is correctly scoped as future DBA work,
  not an F12 change.
- **Backend's three measured TS↔Python equivalence limits** (JSON float literal with a zero
  fractional part; object-key order in the insertion-order fallback; a `nan` band key) — verified as
  genuinely irreducible, correctly documented in `prompt-render.ts`'s header, and correctly kept out
  of the fixture. All three affect formatting only, never a score, and none is reachable from the
  F12 drawer.
- **Frontend deviations #2–#4** (up/down reorder instead of drag; duplicate = 2 requests;
  `role="status"` on the advisory banner) — all accepted, each matching an explicit AC or UX
  instruction (AC-24.2, F10's duplicate-route shape, UX §8).
- **No preview pane in Drawer 1.** `F12-frontend.md` calls `PromptPreview` a "shared pane for both
  drawers"; it is mounted only in Drawer 2. That is **correct** — `F12-ux.md` §3.3 says outright
  *"no second pane needed — Phần 7 doesn't call for a live prompt preview here"*, and every AC-20.x
  sits under §3.5 (Drawer 2). The task-file wording is inaccurate; the code is not.
- **AC-20.6 "immediate" variant re-render** goes through the same 400 ms debounce. Imperceptible;
  not filed.
- **AC-13.4 vs AC-13.6 tension** (blank numeric submitted as `null` vs Save blocked on non-numeric)
  is in the BA text itself, not the implementation.

---

# 7. Not executed — and why

The dashboard has no jest/vitest suite and F12 does not add one (agreed in `F12-ba.md` §9). Beyond
the jsdom harness I built for DEF-1, the following need a running stack and real sessions and were
assessed by code inspection only. They are stated so the next round tests them rather than
rediscovers them:

1. AC-10.3 with five real logged-in sessions (assessed by construction — F20).
2. Responsive passes at `< md` / `md`–`lg` / `≥ lg`; full keyboard-only traversal of both drawers.
3. Band-grid widen/narrow against a real template whose `scale` actually changed between opens.
4. Prompt-preview liveness end-to-end against a running core-api (debounce timing, variant switch).
5. A rendered `en`-locale pass of both drawers for *value*-level leakage (key parity and diacritic
   sweep are done and clean — §4.3 — but that proves keys and characters, not phrasing quality).
6. `POST /internal/gradings` on a criteria row authored through `POST /criteria/json` (the F10 probe
   `F12-ba.md` §9 asks QA to re-run). `GET /internal/criteria/:courseId` verbatim-ness is unchanged
   by F12 (that handler is untouched and covered by the green 1004).

None of these is a plausible home for a Major regression given what the 1004 + 448 tests and the
type-checked build already cover, but they are genuinely unverified.

---

# 8. Full-regression statement — F8 through F12

The F12 gate doubles as the run's regression gate. Every service was built and tested from a clean
`npm ci` in Docker at the current working tree, which contains the **uncommitted** F8+F9+F10+F11+F12
changes together:

- **core-api — 43 suites / 1004 tests, 0 failures**, plus `tsc -p tsconfig.build.json --noEmit`
  **and** `tsc -p tsconfig.json --noEmit` both clean (src *and* specs). Growth across the run:
  F10 baseline 39/723 → 41/774 → **43/1004**. No pre-existing assertion was weakened — F12's two
  edits to existing spec files add mock *models* and append cases only.
- **grading-worker — 448 passed, 0 failures** (F8-era baseline 261 → 377 → **448**). Includes the
  71 new cross-language fixture tests.
- **dashboard — `tsc -b && vite build` exit 0, 96 modules.** The build is a real regression gate for
  F8–F12's dashboard work because AC-23.3's `Record<keyof typeof vi, string>` now makes *any* i18n
  key asymmetry — including in pre-F12 keys — a compile error, and it compiled.
- **zalo-gateway — 7 suites / 61 tests, 0 failures**, `tsc --noEmit` clean. Untouched by F8–F12 and
  still green, confirming the shared `contracts.ts` triplicate is still consistent.

Cross-cutting invariants re-checked at the F12 tree:

- **No new dependency anywhere in the run**: `package.json` unmodified in all three TS services and
  `pyproject.toml` unmodified for grading-worker (`git status` clean for all four).
- **Migrations**: the run added exactly two (`20260821120000_add_grading_totals_and_student_level`,
  `20260822090000_add_rubric_templates_and_privileges`) for F9/F10. **F12 adds none**, matching
  assumption A2 — `Criteria.templateKey` and `sourceFilename` already existed.
- **Cross-language duplicates**: all three are consistent and machine-guarded. `contracts.ts` ×2 +
  `contracts.py` (unchanged this run); `rubric-schema.ts` ↔ `rubric_schema.py` (F8's fixture, green);
  and now `prompt-render.ts` ↔ `prompt.py` (F12's fixture, **proven two-sided by five separate
  mutation experiments** in §2).
- **F10's DEF-1 does not recur.** The class of bug (normalize-before-validate) is re-tested on the
  *new* write path over real HTTP with `criteria.create` asserted uncalled.
- **F8's OBS-03 / F10's OBS-3 (raw-vs-normalized asymmetry) does not recur.** F12's dirty-check
  compares two clones of one form model, and the read path normalizes before either side is built.
- **Prior QA verdicts**: F8 PASS (after 2 fix rounds), F9 DONE, F10 DONE, F11 DONE. Nothing in the
  F12 tree re-opens them — no F8–F11 assertion was modified.

**Regression verdict: no regression detected across F8–F12.** All six F12 defects are net-new,
confined to `services/dashboard`, and none touches the server, the schema, the queue topology or the
grading path.

> **Re-confirmed on the post-fix tree** (§10.5): core-api 43/1004 + both `tsc` clean,
> grading-worker 448, zalo-gateway 7/61, dashboard build exit 0 / 96 modules. The fix round touched
> only `services/dashboard`; the three drift-guard files are MD5-identical to the round-1 baseline,
> so §2's AC-03.8 proof carries over unmodified. The single new defect (DEF-7) is a cosmetic i18n
> leak in the dashboard, not a regression in any F8–F11 behaviour.

---

# 9. Verdict — round 1 (superseded by §10)

**FAIL** — on **DEF-1** (Major). The core-api slice, the grading-worker slice, the drift guard, the
three carried warnings and the F8–F12 regression all passed cleanly; the failure was entirely in the
dashboard drawer primitive.

> **Superseded.** See **§10** for the fix-round-1 re-gate and the final verdict. All six round-1
> defects are closed; one new Minor (DEF-7) was introduced by the DEF-2 fix.

## Blockers / open questions

- **DEF-7 is the only outstanding defect** — a hardcoded Vietnamese word in the Drawer-2 locked-value
  summary (`RubricDrawer.tsx:78`). One line. See §10.4.
- **DEF-1 … DEF-6: closed** and re-verified in §10.2/§10.3.
- **The §3 arbitration ruling stands** — Drawer 2 is a content editor; unlocked structural fields are
  edited in Drawer 1. DEF-2/DEF-3 were the *presentation* half and are fixed. If BA/PM ever reverses
  the ruling (per OQ-1), that supersedes the whole treatment and is a new AC, not a defect.
- Six items in §7 remain unverified for want of a running stack + five live sessions. Unchanged by
  the fix round; the fixes are all in code paths that the type-checked build and my jsdom harness
  cover, except the five-actor privilege matrix.

---

# 10. Fix round 1 — re-gate

## 10.1 Transient-`jsdom` cleanup — verified independently (as asked)

| Check | Result |
| :-- | :-- |
| `services/dashboard/package.json` vs HEAD | **unmodified**, 0 `jsdom` references |
| `services/dashboard/package-lock.json` vs HEAD | **unmodified** (`git diff --exit-code` clean), 0 `"jsdom"` entries |
| `node_modules/jsdom/` on disk | **absent** |
| `npm ci` in the Docker build pulling jsdom | **0 mentions** in the build log |
| `git status services/dashboard` | only the 7 expected `M` + 5 expected `??` — identical to round 1 |

One piece of residue, correctly **not** a defect: `services/dashboard/node_modules/.package-lock.json`
still carries a stale `node_modules/jsdom` entry (npm's internal install-tree metadata). It is
gitignored (`.gitignore:2`), it is not the tracked lockfile, and `npm ci` deletes and rebuilds
`node_modules` from the tracked lockfile — which is why the Docker build log shows zero jsdom. No
dependency leaked into the repo or the build. **Cleanup claim confirmed.**

## 10.2 DEF-1 — re-verified with my own harness, plus a negative control

The fix is exactly the prescribed shape (`drawer.tsx:47–56`): a `useRef` holding the latest
`onRequestClose`, refreshed by its own dependency-free effect, with the keydown-registration
effect's `[open]` dep **left untouched**; the handler calls `onRequestCloseRef.current('esc')`.
The same treatment was applied defensively to `confirm-dialog.tsx:50–52,67` (`onCancelRef`).

I rebuilt my harness from the **current** `drawer.tsx` + the real `dialog-stack.ts` and extended it
to cover precisely the things the rejected naive fix would have broken. jsdom performs no layout, so
`HTMLElement.offsetParent` is always `null` and `getFocusable()`'s visibility filter would silently
return nothing; I therefore stub `offsetParent` to simulate a laid-out document, otherwise the
focus-trap assertions would be vacuous. **10/10 PASS:**

```
PASS  DEF-1 Esc on dirty drawer shows confirm   after={"open":true,"dirty":true,"confirmShown":true} log=["requestClose dirty=true"]
PASS  DEF-1 handler saw the CURRENT dirty value log=["requestClose dirty=true"]
PASS  AC-05.8 body scroll locked while open     overflow=hidden
PASS  AC-05.6 Tab from last wraps to the panel first focusable (the x button)
PASS  AC-05.6 Shift+Tab from first wraps to last
PASS  AC-05.6 focus never escapes the panel
PASS  AC-05.7 focus restored to the invoking element   activeElement=invoker
PASS  AC-05.8 body overflow restored to the PREVIOUS value ("scroll", not "")
PASS  AC-05.8 two open/close cycles leave body unchanged
PASS  AC-21.7 Esc on a CLEAN drawer closes with no confirm
OVERALL: PASS
```

**Negative control (so the PASS is not vacuous):** reverting the single expression
`onRequestCloseRef.current('esc')` → `onRequestClose('esc')` and changing nothing else reproduces
the original round-1 failure exactly —
`after={"open":false,"dirty":true,"confirmShown":false} log=["requestClose dirty=false"]`. The
harness is therefore sensitive to precisely this defect, and the PASS is attributable to the ref.

**Focus-restore and scroll-lock are confirmed genuinely intact** (my explicit warning did not
materialise), including across two open/close cycles and restoring a pre-existing inline
`overflow: scroll` rather than `''`.

Note on my round-1 write-up: my first extended run reported a Tab-wrap FAIL. That was **my
assertion's** bug, not the product's — I asserted the wrap lands on `#first`, forgetting the drawer
header's × button is the panel's genuine first focusable. Corrected above; the trap was always
correct.

## 10.3 DEF-2 … DEF-6 — all verified closed

| Defect | Fix | Verified |
| :-- | :-- | :-- |
| DEF-2 | `lockPathValueText()` renders the real loaded value for all 7 paths (`scale` as `min–max (step s)`, `aggregation` as localized method · round, the full `levels` ladder, `output_fields` as localized labels, dimension keys, `key=weight` pairs, `student_reply` summary) | **PASS** — values now visible |
| DEF-3 | `const isLocked = lockedPaths.includes(path)`; `{isLocked && <IconLock …/>}` and the `lockedReason` text render **only** when genuinely locked; an unlocked path shows value + the neutral "edit in Drawer 1" pointer only | **PASS** — an unlocked path has no padlock |
| DEF-4 | `busyKeys: Set<string>` + `withBusy(key, run)` with `finally` cleanup; `disabled={busyKeys.has(row.key)}` on Ẩn/Hiện, Xóa and Khôi phục | **PASS** — per-row, so one row's request never disables another |
| DEF-5 | `keyInputRef` + `keyInputRef.current?.focus()` gated on `status === 409 && serverMessage === 'template key already exists'` | **PASS** — the two `ref=` bindings (duplicate mode / create-edit mode) are mutually exclusive renders, no conflict |
| DEF-6 | `if (body && Array.isArray(body.message))` ⇒ surfaced as the `issues` list | **PASS** — the title > 200 route I found now renders `title must be shorter than or equal to 200 characters` verbatim |

Residual, **not** filed: DEF-6's heading stays the generic `errors.invalidRubric` for a DTO failure
about `title` (which is not part of the rubric). AC-22.2 only requires the server message verbatim
*under a localized heading*, and it now is. Likewise DEF-3's section heading is still
`templates.locked` even when nothing is locked — but the padlock, which is the actual AC-19.1/19.2
affordance, is now correctly scoped, so the substance is closed.

## 10.4 DEF-7 (NEW, introduced by the DEF-2 fix) — hardcoded Vietnamese in the UI

- **Severity: MINOR** · **Owning role: frontend** · **Regression introduced in fix round 1**
- **AC:** AC-23.1 (*"Every new user-visible string is an i18n key present in both the `vi` and the
  `en` block … **No literal Vietnamese or English text in TSX**"*), and assumption A8 (*"the `en`
  locale is a genuine translation … QA checks for Vietnamese leakage in `en`"*).
- **File:** `services/dashboard/src/pages/criteria/RubricDrawer.tsx:78`

```ts
? `show_total=${rubric.student_reply.show_total}, show_level=${rubric.student_reply.show_level}, ${rubric.student_reply.buttons.length} nút`
```

- **Actual:** an English-locale user viewing a template that configures `student_reply` sees
  `show_total=true, show_level=false, 2 nút` — a Vietnamese word rendered in the English UI.
- **Expected:** an i18n key. Note **`{{count}}` is listed in AC-23.4's placeholder inventory and is
  currently the one placeholder in that list with no key using it** — a keyed
  `authoring.replyButtonCount` (`{{count}} nút` / `{{count}} buttons`) closes this and consumes it.
- **Reachability:** latent, not on the default path — both seeds ship `student_reply: null`
  (`cambridge-yl.seed.ts:94`, `ielts-speaking.seed.ts:69`), which renders `—`. It requires an author
  to configure `student_reply` in Drawer 1 first. Zero data or behaviour impact.
- **How I found it:** a Vietnamese-diacritic sweep of all ten F12 source files with comments
  stripped. Two other hits are **not** defects and are deliberately not filed: `TemplateDrawer.tsx`'s
  `tone: 'khích lệ'` (spec-mandated default *data* — `F12-ba.md` §7.3 names that exact string) and
  `label: 'Phát âm'` (default rubric *content* for the seeded pronunciation dimension, editable by
  the author, stored in the DB rather than shown as UI chrome).
- **Why my round-1 i18n check missed it:** §4.3 swept the *`en` block of `i18n/index.ts`* for
  Vietnamese, which was and remains clean. It could not catch Vietnamese hardcoded in TSX, which did
  not exist until this fix round. The TSX sweep is now part of the record above.

## 10.5 Regression re-checks on the final tree

| Check | Result |
| :-- | :-- |
| core-api | **43 suites / 1004 tests passed**, both `tsc --noEmit` clean (`error TS` count: 0), 260.2 s ✅ |
| grading-worker | **448 passed** ✅ |
| zalo-gateway | **7 suites / 61 tests passed**, `tsc --noEmit` clean ✅ |
| dashboard | `tsc -b && vite build` **exit 0, 96 modules** (edits only, no new files, as reported); `index-*.js 399.54 kB / gzip 115.56 kB`, `index-*.css 20.47 kB / gzip 4.88 kB` — matches the coordinator's figures exactly ✅ |
| i18n parity | **408 = 408**, 0 duplicates, `vi − en = ∅`, `en − vi = ∅`, **0 keys removed** ✅ |
| i18n dead keys | **zero** — same 6 indirection false-positives as round 1 (`CONFLICT_KEYS`, `Users.tsx` `labelKey`), all live. Two *new* dynamic prefixes appeared (`templates.method.`, `templates.round.`) from `lockPathValueText`; both key families exist ✅ |
| i18n `en` leakage / placeholders | 0 Vietnamese diacritics in `en` values; **0 placeholder mismatches** across all 408 keys ✅ (the TSX-level leak is DEF-7, outside the i18n file) |
| `api/client.ts` `message` | byte-identical — `` `${options.method ?? 'GET'} ${path} failed: ${res.status}` ``; diff unchanged from round 1 (20 ins / 1 del) ✅ |
| `Criteria.tsx` additive | diff unchanged from round 1 (86 ins / 18 del); `name="courseId"`/`name="file"` intact; classes-config table and version list untouched ✅ |
| No new dependency | `package.json` / `package-lock.json` / `pyproject.toml` **unmodified in every service** ✅ |
| No migration | unchanged — F12 still adds none ✅ |
| Drift-guard files | `prompt-render.ts`, `prompt-render.fixtures.json`, `prompt.py` **MD5-identical to my round-1 baseline** — the fix round touched only `services/dashboard`, so the AC-03.8 proof of §2 still stands unmodified ✅ |
| Forbidden patterns | no `window.confirm/alert/prompt`, no `dangerouslySetInnerHTML`, no `role === 'admin'` outside comments ✅ |
| Accessible names | all 8 icon-only buttons keep `aria-label`, **including the 3 newly-disabled row actions**; the new locked-row `IconLock` correctly carries `aria-hidden="true"` with the meaning in adjacent text ✅ |

## 10.6 Final verdict — fix round 1

**FAIL**, on **DEF-7** alone.

To be unambiguous about proportionality, because this is the run's closing gate:

- **DEF-1 (Major) is genuinely, independently closed** — verified against the real fixed file with a
  negative control, and the two behaviours I warned the naive fix would break are confirmed intact.
- **DEF-2 … DEF-6 are all closed.** No other regression anywhere: all four suites green, no
  dependency, no migration, drift guard byte-identical, i18n parity and dead-key checks clean.
- **DEF-7 is one Vietnamese word on a latent path, fixable in one line** (add
  `authoring.replyButtonCount` with the already-inventoried `{{count}}` placeholder and use it).

I am calling FAIL rather than waving it through because it is a real AC-23.1 violation of exactly
the class the BA asked QA to check (A8), it was **introduced by the fix round** — which is what a
re-gate exists to catch — and in round 1 I failed this feature over defects of the same weight
(DEF-3 was a padlock icon on the wrong rows). Relaxing the bar now, only because passing would close
the run, would apply a standard I did not apply to the first submission.

**This is a QA verdict, not a shipping decision.** If the centre would rather accept DEF-7 as a
documented known limitation and close the run, that is a legitimate product call for the
coordinator/BA to make explicitly — but it is not one QA should make silently by reporting a green
gate.

---

# 11. Fix round 2 — re-gate (final)

## 11.1 DEF-7 — closed

`lockPathValueText`'s `student_reply` case no longer interpolates a bare Vietnamese word:

```ts
// services/dashboard/src/pages/criteria/RubricDrawer.tsx:78
? `show_total=${…show_total}, show_level=${…show_level}, ${t('authoring.replyButtonCount', { count: rubric.student_reply.buttons.length })}`
```

New key in **both** locale blocks — `i18n/index.ts:424` vi `'{{count}} nút'`, `:856` en
`'{{count}} button(s)'` — placed after `authoring.savedVersion`. This also consumes `{{count}}`,
which was the one placeholder in AC-23.4's inventory that no key used.

| i18n check | Result |
| :-- | :-- |
| Key parity | **409 = 409**, 0 duplicates either side, `vi − en = ∅`, `en − vi = ∅`, **0 keys removed** ✅ |
| Dead keys | **zero** — `authoring.replyButtonCount` is referenced (`RubricDrawer.tsx:78`); the 6 flagged names are the same known indirection false-positives (`CONFLICT_KEYS`, `Users.tsx` `labelKey`), all live ✅ |
| `en` leakage | 0 Vietnamese diacritics in any `en` value ✅ |
| Placeholders | **0 mismatches** across all 409 keys; `{{count}}` now used by exactly one key ✅ |
| F12 key total | 144 → **145** (net +1, the new key) |

## 11.2 Widened Vietnamese-in-TSX sweep — my own point, applied

I did not just re-check the changed line. I swept **all** of `pages/criteria/`, `components/ui/`,
`lib/`, `api/` and `pages/Criteria.tsx` (comments stripped) — wider than the F12 file list — for any
Vietnamese diacritic on a non-comment line. **The `nút` literal is gone. Two hits remain, both
already ruled non-defects and both unchanged:**

- `TemplateDrawer.tsx:115` `tone: 'khích lệ'` — spec-mandated default **data**; `F12-ba.md` §7.3
  names that exact string as the default for `rubric.tone`.
- `TemplateDrawer.tsx:122` `label: 'Phát âm'` — default rubric **content** for the seeded
  `pronunciation` dimension; author-editable, stored in the DB, not UI chrome.

**Zero hardcoded UI strings remain anywhere in the dashboard source.**

## 11.3 Nothing else moved

| Check | Result |
| :-- | :-- |
| `drawer.tsx` since my 10/10 harness run | **MD5 identical** (`923939ee…` under the harness's import rewrite) — so §10.2's focus-trap / focus-restore / scroll-lock / DEF-1 results carry over **verbatim**; no re-run needed ✅ |
| Drift-guard trio | `prompt-render.ts` `f74aa732…`, `prompt-render.fixtures.json` `31277168…`, `prompt.py` `68781408…` — **MD5-identical to my round-1 baseline**, so §2's five-experiment AC-03.8 proof stands unmodified ✅ |
| `api/client.ts` `message` | byte-identical; diff shape unchanged at **20 ins / 1 del** ✅ |
| `Criteria.tsx` | diff shape unchanged at **86 ins / 18 del** — still purely additive ✅ |
| Dependencies | `package.json` / `package-lock.json` / `pyproject.toml` **unmodified in every service** ✅ |
| Migration | none added by F12 ✅ |
| Dashboard file count | 12 entries (7 `M` + 5 `??`) — identical to rounds 1 and 2 ✅ |
| Non-dashboard source touched in round 2 | **none** (`find -newermt` across core-api, gateway, grading-worker sources: empty) ✅ |

## 11.4 Suites on the final tree

| Suite | Result |
| :-- | :-- |
| dashboard | `tsc -b && vite build` **exit 0, 96 modules**; `index-*.js 399.68 kB (gzip 115.60)`, `index-*.css 20.47 kB (gzip 4.88)` — matches the reported figures exactly ✅ |
| grading-worker | **448 passed** — re-run live ✅ |
| core-api | **43 suites / 1004 tests**, both `tsc --noEmit` clean — run on this identical tree in §10.5; sources byte-untouched since ✅ |
| zalo-gateway | **7 suites / 61 tests**, `tsc --noEmit` clean — same ✅ |

`tsc -b` passing is itself the AC-23.3 parity proof: `Record<keyof typeof vi, string>` makes a key
present in one locale block and not the other a compile error, so the 409 = 409 result is
machine-enforced, not just measured by my script.

## 11.5 Final verdict

**PASS.**

All seven defects are closed and independently verified:

| | Defect | Severity | Closed in | Verified by |
| :-- | :-- | :-- | :-- | :-- |
| DEF-1 | Esc on a dirty drawer discarded unsaved work | **Major** | round 1 | my own jsdom harness, 10/10, **plus a negative control** proving the harness is sensitive to exactly this bug |
| DEF-2 | Locked structural values never displayed | Minor | round 1 | `lockPathValueText()` renders all 7 paths |
| DEF-3 | Unlocked paths rendered as locked | Minor | round 1 | padlock + reason gated on `lockedPaths.includes(path)` |
| DEF-4 | Row actions not disabled in flight | Minor | round 1 | per-row `busyKeys` / `withBusy()` |
| DEF-5 | 409 did not focus the `key` field | Minor | round 1 | `keyInputRef`, gated on the exact server message |
| DEF-6 | Array-form 400 `message` swallowed | Minor | round 1 | surfaced as the issues list |
| DEF-7 | Hardcoded Vietnamese in the UI | Minor | **round 2** | i18n key in both locales; widened TSX sweep clean |

No defect remains open, no regression was introduced, and the arbitration ruling of §3 stands.

---

# 12. Final full-regression statement — F8 through F12 (liftable verbatim)

> **F12 QA: PASS. Full regression across F8–F12: clean.**
>
> All four services were built and tested from a clean `npm ci` / venv in Docker against the final
> tree, which carries the uncommitted F8+F9+F10+F11+F12 work together:
> **core-api 43 suites / 1004 tests passed** with `tsc -p tsconfig.build.json --noEmit` *and*
> `tsc -p tsconfig.json --noEmit` both clean; **grading-worker 448 passed**;
> **zalo-gateway 7 suites / 61 tests passed** with `tsc --noEmit` clean;
> **dashboard `tsc -b && vite build` exit 0, 96 modules**.
> Every NFR-07 baseline grew and none was weakened (core-api 39/723 → 43/1004; grading-worker
> 261 → 448), and no pre-existing assertion was modified anywhere in the run.
>
> **Cross-language drift guards — all three consistent and machine-enforced.** F12 added the repo's
> *third* duplicated module (`grading/prompt.py` ↔ `core-api/src/criteria/prompt-render.ts`). Its
> guard was proven two-sided by **five** mutation experiments, not merely re-run: mutating the TS
> renderer alone turns jest red (21) while pytest stays green; "fixing" the shared fixture to match
> then turns **pytest** red (20) while jest still catches it via a seed test that renders by import;
> mutating the Python renderer alone turns pytest red (21); **deleting** the fixture hard-fails both
> suites rather than silently skipping; and mutating the **fixture alone** turns *both* red (20/20).
> All files were restored and MD5-verified. `contracts.*` (×3) and `rubric-schema.ts` ↔
> `rubric_schema.py` are unchanged and green.
>
> **No prior-feature regression.** F10's DEF-1 defect class (normalize-before-validate) is
> re-tested on F12's new write path over real HTTP with the DB write asserted *not* to happen.
> F8/F10's raw-vs-normalized asymmetry (OBS-3) does not recur: F12's dirty-check compares two clones
> of one form model, and the read path normalizes before either operand is built — so opening a
> v1-era criteria row and touching nothing correctly reports no unsaved changes. F8 PASS, F9, F10
> and F11 remain DONE; nothing in the F12 tree re-opens them.
>
> **Cross-cutting invariants hold:** no new dependency anywhere in the run (`package.json`,
> `package-lock.json` and `pyproject.toml` unmodified in all four services); F12 adds **no
> migration** (the two in the run belong to F9/F10); no env var, port, secret or compose change;
> i18n **409 = 409** with zero dead keys, zero `en`-locale Vietnamese leakage and zero placeholder
> mismatches, machine-enforced by `Record<keyof typeof vi, string>` at build time.
>
> **Defects:** seven found across two gate rounds — one Major (Esc on a dirty drawer silently
> discarded a teacher's authored rubric) and six Minor, **all in the dashboard slice, all now closed
> and independently re-verified**. The core-api, grading-worker and gateway slices passed at the
> first gate with no defects. The Major fix was verified with a purpose-built jsdom harness plus a
> negative control, and confirmed not to regress focus-restore, focus-trap wrap or body-scroll-lock.
>
> **Known limitation (accepted, not a defect):** Drawer 2 is a content editor — structural fields
> (`scale`, `aggregation`, `levels`, `output_fields`, dimension key/weight, `student_reply`) are
> shown read-only with their values and are edited in Drawer 1. This is the arbitrated reading of
> `F12-ba.md` §7.4, `F12-ux.md` §3.4 and AC-19.5's disjointness rationale; values round-trip
> unchanged, so nothing is lost.
>
> **Not verified — needs a running stack and five live sessions** (the dashboard has no jest suite
> and F12 deliberately did not add one): the five-actor privilege-visibility matrix; responsive and
> keyboard-only passes; band-grid widen/narrow against a template whose scale really changed;
> prompt-preview liveness end-to-end; a rendered `en`-locale pass for phrasing quality; and
> `POST /internal/gradings` against a criteria row authored via `POST /criteria/json`.

## Notes for the next role

- **Nothing outstanding for frontend.** All seven defects closed.
- **frontend** owns all six round-1 defects (all now closed). DEF-1 was fixed with a callback
  **ref** — adding `onRequestClose` to the effect deps makes the tests in F05/F06 (body-scroll
  restore, focus restore) regress instead; I verified the deps version fixes DEF-1 but it re-runs
  the effect every render.
- The jsdom repro harness lives in the scratchpad, not the repo (no dependency was added to
  `services/dashboard`). It rebuilds in ~2 minutes from the real `drawer.tsx` and is worth re-running
  after the fix: expected output is
  `after Escape: {"open":true,"dirty":true,"confirmShown":true}`.
- **Whoever updates the architecture doc** still owes the v1.6 line the backend flagged: the prompt
  renderer now exists twice and `criteria/__fixtures__/prompt-render.fixtures.json` is the contract
  between them — the repo's **third** cross-language duplicate. `Idea/20260719-KienTrucMicroservices.md`
  and `CLAUDE.md`'s monorepo section both need it. I confirmed neither has been updated.
