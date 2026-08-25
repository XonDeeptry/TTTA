# F12 · PM — Dashboard: two drawers (template structure editor + scoring-content editor)

- **Owner role:** pm
- **Feature:** F12 — Two hand-authored slide-in drawers on `pages/Criteria.tsx`: Drawer 1 "Cấu trúc chấm điểm" (`rubric_template` privilege — full template CRUD UI over F10's API) and Drawer 2 "Soạn nội dung chấm điểm" (`criteria_author` privilege — band-by-band content authoring with a live LLM-prompt preview). New `components/ui/drawer.tsx` primitive (no new dependency, per repo convention). `lib/rubric.ts` (shared v2 types + client-side max/level-validation helpers).
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** `F8-pm.md` (v2 rubric shape), `F9-pm.md` (`computeTotal`/level-range semantics, mirrored client-side for live validation), `F10-pm.md` (template CRUD API + the two privileges these drawers are gated behind)

## Inputs (what this role received)

- Design doc Part 7 (full UI spec for both drawers: field lists, live validation behavior, prompt-preview requirement, `isSystem` vs ordinary row treatment, "no new dependency — hand-author `drawer.tsx`" instruction), Part 2 (the stated CURRENT gap this feature closes: "Giáo viên không soạn được tiêu chí trên giao diện. Đường duy nhất là upload .docx... Màn `pages/Criteria.tsx` chỉ có form upload + khung `<pre>` xem JSON thô").
- `docs/dev-team-roles/PROGRESS.md` F3 architecture decisions — confirms the project's established UI conventions this feature must follow: Tailwind + hand-authored shadcn-style primitives in `components/ui/` (NOT `npx shadcn add`, NOT Radix), F3's design-system tokens (LMS palette, Inter font, Phosphor-style outline icons — though F3's frontend actually shipped a hand-rolled `icons.tsx` instead of a Phosphor dependency, a precedent this feature should follow rather than adding an icon package), F7's precedent of hand-authoring SVG rather than adding a chart library when the project's "no new dependency" discipline applies. F5/F6/F7's i18n-parity discipline (every new key in BOTH vi and en, zero dead keys — this exact defect class was caught in QA fix-rounds for F3 (D1) and F4 (D2), so it is a known recurring risk to watch for).
- `services/dashboard/src/pages/Criteria.tsx` (current state: `.docx` upload form + raw `<pre>` JSON viewer, kept UNCHANGED as the import channel per Part 7's opening line) — read to confirm this is additive, not a redesign of the existing page.

## Checklist

- [x] Read design doc Part 7 fully (both drawers' field lists and behaviors)
- [x] Confirm the "no new dependency" constraint against F3/F7 precedent in PROGRESS.md
- [x] Read current `Criteria.tsx` to confirm this is additive to, not a replacement of, the existing upload flow
- [x] Write user stories + acceptance criteria (MoSCoW), including the privilege-gating and i18n-parity ACs
- [x] Define in/out of scope, assumptions

## Outputs

### User stories (MoSCoW)

**US1 (Must) — Drawer 1: template structure editor.**
As a person with the `rubric_template` privilege, I want a UI over F10's template CRUD API (list/create/duplicate/edit/delete/hide-show/reset), so I don't have to call the API directly to maintain scoring structures.
- Given the drawer opens, when it loads, then it lists ALL templates via `GET /criteria/templates?includeInactive=true`, with the two seeded defaults shown first, each with a "Mặc định"/"Đang ẩn" badge as applicable.
- Each row exposes exactly the actions its `isSystem` state permits per F10's Part 4.1 table: `isSystem` rows get a "Khôi phục bản gốc" button with a confirm dialog ("mất hết chỉnh sửa") and NO delete button (hide/show toggle only); ordinary rows get a Delete button with a confirm dialog explicitly stating "các tiêu chí đã soạn từ nó không bị ảnh hưởng."
- "+ Tạo cấu trúc mới" opens a blank form; "Nhân bản" on any row (including `isSystem` ones) opens a PRE-FILLED form, still saves via `POST /templates/:key/duplicate` (not a client-side manual re-create).
- The editor covers every field named in Part 7: dimension `key`+`label`, `scale` (min/max/step), aggregation method, per-dimension `weight`, `levels` ranges, `output_fields`, the `student_reply` block (including its `buttons` array — this is where F11's button titles get authored), and the `locked` field list itself.
- **Live client-side validation**: as `scale`/`levels` are edited, the UI recomputes and shows the theoretical max total (client-side port of F9's max-calc logic, `dashboard/src/lib/rubric.ts`) and flags gaps/overlaps in `levels` BEFORE save — this is a UX convenience layer; F10's server-side check remains the authority, and a client-pass/server-reject mismatch is a bug to catch in QA, not an accepted inconsistency.
- Given the current user lacks `rubric_template` (and isn't admin), Drawer 1's entry point is not shown, and direct navigation/API calls 403 gracefully (no raw error dump in the UI).

**US2 (Must) — Drawer 2: scoring-content editor with live prompt preview.**
As a person with the `criteria_author` privilege, I want to pick a course + template and fill in the actual scoring content (band descriptions, sub-factors, comment bank) with a live preview of the exact LLM prompt, so I can author content without touching raw JSON.
- Given a course and template are selected, band inputs render as ONE TEXTAREA PER BAND VALUE, derived from the template's `scale` (0–5 → 6 rows; 0–9 → 10 rows) — not a single `;`-joined field. This is the specific capability Part 7 calls out as making the IELTS 0–9 shape usable by a non-technical teacher.
- Given a field is in the selected template's `locked` list, it renders READ-ONLY with a visible reason/tooltip — never silently disabled with no explanation.
- `pronunciation` is always pinned/non-removable in this editor with an explanatory badge (§3.10's mandatory-dimension rule) — enforced in the UI in ADDITION to the existing server-side 400, not instead of it.
- **Prompt preview pane**: given any content edit, before save, a preview pane shows the exact text `build_system_instruction` (grading-worker) would send to the LLM — bulleted bands, sub-factor grid, grouped comment bank — matching the REAL worker output for the same input, verified by a snapshot/contract test (not visual review alone). Part 7 explicitly calls this a trust-building feature: "đừng cắt."
- Save calls `POST /criteria/json`, producing a new `criteria` version via the EXISTING versioning mechanism in `criteria.service.ts` (unchanged). Editing an old version loads it into the drawer and saves as v+1 — never mutates the old version in place.
- Given the user lacks `criteria_author`, Drawer 2 is inaccessible; write attempts 403 gracefully.

**US3 (Should) — i18n parity for both drawers.**
As a bilingual dashboard user, I want every new label/button/validation message translated in both vi and en, matching the parity discipline already enforced in prior features (and the exact defect class caught in F3's/F4's QA fix rounds).
- Every new i18n key exists in BOTH `vi` and `en` blocks of `i18n/index.ts`; zero dead/unused keys.

**US4 (Could) — responsive drawer + keyboard accessibility.**
As a dashboard user on a smaller screen, I want the drawer usable at tablet widths, consistent with F3's responsive sidebar work, and operable via keyboard.
- Drawer collapses to a full-width slide-over below a reasonable breakpoint.
- Focus trap and Esc-to-close both work (Part 7 explicitly names "phím Esc" as a requirement for the hand-authored `drawer.tsx` primitive).

### In scope
- `components/ui/drawer.tsx` — hand-authored (panel, backdrop, focus trap, Esc), no new dependency, matching F3's precedent.
- `pages/criteria/TemplateDrawer.tsx` (Drawer 1), `pages/criteria/RubricDrawer.tsx` (Drawer 2).
- `lib/rubric.ts` — shared v2 types + client-side max-total/level-validation helpers.
- `pages/Criteria.tsx` additions (existing `.docx` upload + class-config table stay UNCHANGED, per Part 7's opening line).
- i18n additions, both locales.

### Out of scope
- Any new UI component library or icon package (Radix, a real chart lib, Phosphor-as-a-dependency) — everything hand-authored per the established convention.
- Changes to `criteria.service.ts`'s versioning mechanism itself — reused as-is.
- Any new backend endpoint beyond what F10 already provides, UNLESS the prompt-preview pane needs a dedicated preview endpoint (an implementation choice left to BA/backend — a client-side port of the rendering logic is equally acceptable per this story's AC, as long as it's verified to match real worker output).

### Assumptions
1. Prompt-preview implementation (server endpoint vs. client-side port of the rendering logic) is a BA/backend/frontend implementation decision — PM only requires the OUTPUT to match the real worker's `build_system_instruction` for the same input, verified by a contract/snapshot test.
2. Drawer 1 and Drawer 2 are built together as one feature (matching the design doc's own Part 11 grouping, "branch 5 — hai drawer," a single dependency-table row) rather than split into two features, since they share the same dependencies (F8/F9/F10) and the same new `drawer.tsx` primitive — splitting them would mostly duplicate scaffolding work without adding independent shippable value (Drawer 2 without Drawer 1 still needs SOME way for templates to exist, which F10's seeds already provide, but a center wanting a THIRD custom template structure needs Drawer 1 too for that to be self-service).

## Blockers / open questions

None new — both of the design doc's genuinely open questions (`template_type`, `locked` list) belong to F11/F10 respectively and are already recorded there, not here.

## Notes for the next role

UX: this is the largest visual-design surface in the whole doc — two full drawer flows plus a new primitive. Reuse F3's design tokens (LMS palette, Inter, Tailwind + hand-authored `components/ui/`) rather than inventing a new visual language for just these two screens. BA: the prompt-preview matching-real-output requirement (US2) is the trickiest cross-service contract in this feature — nail down early whether it's a preview endpoint or a client port, since that decision changes which role (backend vs. frontend) owns the rendering logic. Frontend: `lib/rubric.ts`'s max/level-validation logic must be a genuine PORT of F9's `computeTotal`-adjacent validation, not an independent reimplementation that could silently drift — same cross-language-drift discipline as F8's `normalizeRubric`, just TS-to-TS this time instead of TS-to-Python.
