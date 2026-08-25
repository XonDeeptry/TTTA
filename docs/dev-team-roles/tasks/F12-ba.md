# F12 · BA — Two dashboard drawers (template-structure editor + scoring-content editor + live prompt preview)

- **Owner role:** ba
- **Feature:** F12 — hand-authored `components/ui/drawer.tsx` + Drawer 1 "Cấu trúc chấm điểm" (`rubric_template`, full CRUD over F10's 8 template routes) + Drawer 2 "Soạn nội dung chấm điểm" (`criteria_author`, band-grid content authoring) + a live LLM-prompt preview, all **additive** to `pages/Criteria.tsx`. Carries a small core-api slice: `POST /criteria/json` (the content-save route the design doc assigns to this branch) and `POST /criteria/prompt-preview`.
- **Status:** DONE
- **Last updated:** 2026-08-23
- **Depends on:** `F12-pm.md`, `F10-backend.md`, `F10-qa.md`, `F9-backend.md`, `F8-backend.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 7 (+ 4.1, 4.2, 8, 10)

## Inputs (what this role received)

- `F12-pm.md` — US1…US4 (MoSCoW), in/out of scope, 2 assumptions.
- Design doc **Phần 7** (authoritative UI design, Vietnamese) + Phần 4.1 (CRUD table) + Phần 4.2 (privileges) + Phần 8 (file-level scope, which assigns `POST /criteria/json` to this branch) + Phần 10 item 5 (prompt snapshot acceptance).
- `F10-backend.md` — the 8-route template API with exact status codes/messages, the three 409s, the 400 bodies, `assertAuthorableRubric(input: unknown): RubricV2` (owns normalization), `GET /auth/me` → `privileges` with admins pre-expanded, `Criteria.templateKey` "F12 is its only writer".
- `F10-qa.md` — **OBS-3** (reads normalized vs stored raw; do not byte-compare), **OBS-2** (a `step` that doesn't divide the scale yields genuine `level_gap`s — right place for a hint is F12's drawer), OBS-4 (stale comment).
- `F9-backend.md` — `computeTotal` / `maxTotal` / `findLevel` / `validateLevels` semantics + the explicit note "`dashboard/src/lib/rubric.ts` … must not re-derive the math".
- `F8-backend.md` — v2 shape, `normalizeRubric` never throws, the shared TS↔Python fixture mechanism (`__fixtures__/rubric-normalize.fixtures.json` read by `grading-worker/tests/test_rubric_schema.py`).
- Code read directly: `services/dashboard/src/pages/Criteria.tsx`, `api/client.ts`, `auth/AuthContext.tsx`, `components/ui/tooltip.tsx` (the "no Radix" precedent), `i18n/index.ts`; `core-api/src/criteria/{criteria.controller,criteria.service,rubric-validation,rubric-schema,lockable-fields}.ts`; `grading-worker/src/grading_worker/grading/prompt.py`; `prisma/schema.prisma` (`model Criteria`).

## Checklist (the concrete work items for this task)

- [x] Create this task file, Status IN_PROGRESS
- [x] Read design doc Phần 7 + PM stories
- [x] Read F10-backend / F10-qa / F9-backend / F8-backend
- [x] Read existing dashboard surface (`Criteria.tsx`, `components/ui/*`, `i18n`, `AuthContext`, `api/client.ts`)
- [x] Read the real server surface I am specifying against (`criteria.controller.ts`, `rubric-validation.ts`, `prompt.py`, `schema.prisma`)
- [x] Decide the prompt-preview source (endpoint vs client port) and justify it against the duplication cost
- [x] Write FR-01…FR-23 with numbered, individually-testable ACs
- [x] Write NFRs, use cases UC-1…UC-7, business rules, data dictionary
- [x] Write the i18n key inventory (vi+en) and the type-level parity guard
- [x] State what is / is not machine-verifiable
- [x] Assumptions, dependencies, open questions, traceability
- [x] Fill Outputs, set Status DONE

---

## Outputs (what this role produced)

# 1. Scope

**In scope**

| Service | Files |
| :-- | :-- |
| dashboard (new) | `components/ui/drawer.tsx` · `components/ui/confirm-dialog.tsx` · `lib/rubric.ts` · `pages/criteria/TemplateDrawer.tsx` · `pages/criteria/RubricDrawer.tsx` · `pages/criteria/PromptPreview.tsx` · `pages/criteria/api-errors.ts` |
| dashboard (changed) | `pages/Criteria.tsx` (additive) · `api/client.ts` (additive: parsed error body) · `i18n/index.ts` (**both** blocks + a type-level parity guard) |
| core-api (new) | `criteria/prompt-render.ts` · `criteria/prompt-render.spec.ts` · `criteria/__fixtures__/prompt-render.fixtures.json` · `criteria/dto/create-criteria-json.dto.ts` · `criteria/dto/prompt-preview.dto.ts` |
| core-api (changed) | `criteria/criteria.controller.ts` (2 routes) · `criteria/criteria.service.ts` (1 method) · the criteria spec files |
| grading-worker (new) | `tests/test_prompt_render_fixtures.py` (drift guard only — **no production Python file changes**) |

**Out of scope:** any new npm/pip dependency (incl. Radix, a portal lib, an icon pack); changes to F10's 8 template routes or to `assertAuthorableRubric`; changes to `criteria.service.ts`'s versioning *mechanism* (reused); the `.docx` upload path (kept, unchanged); the classes-config table (kept, unchanged); `SubmissionDetail.tsx`, `Users.tsx`; any Prisma migration (`Criteria.templateKey` and `sourceFilename String?` both already exist — **no DBA needed**); F11's button *behaviour* (F12 only authors `student_reply.buttons` values).

---

# 2. Decision: where the live prompt preview comes from

**Decision: a new stateless core-api endpoint `POST /criteria/prompt-preview`, backed by a TypeScript port of `build_system_instruction` in `services/core-api/src/criteria/prompt-render.ts`, pinned to the Python original by a shared JSON fixture asserted by BOTH jest and pytest.** The dashboard renders whatever string the endpoint returns and contains **zero** prompt-building logic.

Options weighed:

| # | Option | Verdict |
| :-- | :-- | :-- |
| A | Dashboard re-implements the renderer in TS | **Rejected.** The dashboard has **no test suite at all** (build-only). A renderer there is unverifiable by machine and cannot participate in a cross-language fixture test — it is precisely the "duplicate that drifts silently" shape that cost F8 two fix rounds. |
| B | Give grading-worker an HTTP endpoint so the Python original serves the preview | **Rejected.** The worker is a queue consumer with no HTTP server; this means a new dependency (FastAPI/aiohttp), a new port, a compose change, a new auth surface, and it contradicts the architecture doc's "gateway/worker never expose an API; core-api is the only HTTP surface". Disproportionate to a preview pane, and drags DevOps in. |
| C | Move the renderer out of Python into core-api and have the worker fetch the rendered prompt over `/internal/*` | **Rejected.** Zero-copy, but it puts a network hop inside the 30–90 s grading hot path, rewrites `pipeline.py` + `prompt.py` + their tests in a service F12 must not touch, and contradicts design Phần 8, which explicitly keeps `grading/prompt.py` (listed as *modified*, not removed). |
| D | **core-api endpoint + TS port + shared fixture** | **Chosen.** |

Why the cost is acceptable, stated plainly rather than hidden:

- **It is a real cost.** This becomes the repo's **third** cross-language duplicated concern (after `contracts.{ts,ts,py}` ×3 and `rubric-schema.ts` ↔ `rubric_schema.py`). I am not pretending otherwise, and FR-03 makes the drift guard a *mandatory, machine-enforced* deliverable, not a code comment.
- **A preview must render an unsaved draft**, so it cannot be derived from anything stored — some renderer has to run on a payload that exists only in the browser. Given that, the only question is *which* service renders it.
- **Placing the duplicate in core-api instead of the dashboard is the whole point:** core-api has jest (39 suites / 723 tests), so the copy is testable; the dashboard has nothing. The difference between F8's painful duplication and an acceptable one is whether a shared fixture makes drift *fail a suite* — that mechanism already exists in this repo and F10 QA re-verified it works.
- **Phần 7 forbids the cheap way out** ("hiện đúng đoạn text mà `build_system_instruction` sẽ gửi cho LLM … đây là tính năng tạo niềm tin, đừng cắt"), so showing the rubric JSON instead is not an option.
- **Blast radius is small**: `prompt.py` is 155 lines of pure string assembly with no I/O, no SDK, no DB.

Consequence recorded for the architecture changelog: **v1.6 must state that the prompt renderer now exists twice (Python original + TS preview port) and that `criteria/__fixtures__/prompt-render.fixtures.json` is the contract between them — editing either renderer requires editing both in the same commit.**

---

# 3. Functional requirements

## 3.1 Core-api slice

### FR-01 — `POST /criteria/json`: save authored rubric content as a new criteria version

Creates a new `criteria` row for a course from a JSON rubric, using the **existing** versioning mechanism. This is the design doc's `POST /criteria/json` (Phần 8) and the only writer of `Criteria.templateKey`.

Request: `{ courseId: number, rubric: unknown, title?: string, templateKey?: string | null }`.
Guards: `SessionAuthGuard` + `PrivilegeGuard` + `@RequiresPrivilege('criteria_author')`.

- **AC-01.1** Route is declared in `criteria.controller.ts` **before** `@Get(':id')`, inside/adjacent to the existing `templates*` block, per the file's ordering comment; a real-HTTP test asserts `POST /criteria/json` reaches this handler and never `ParseIntPipe`.
- **AC-01.2** The handler's rubric gate is exactly one call: `const rubric = assertAuthorableRubric(body.rubric)` **on the raw body value**. `normalizeRubric` is **not** called before it anywhere on this path. (This is F10 DEF-1's root cause; the signature makes the mistake unexpressible, and this AC makes it checkable.)
- **AC-01.3** A test proves AC-01.2 behaviourally, not by reading code: `POST /criteria/json` with `rubric.scale = {min:0,max:5,step:0}` ⇒ **400** `scale.step must be greater than 0`, and **no row is created** (`criteria` count for that course unchanged). Same for `step: -1`, `null`, `"x"` (⇒ `scale.step must be a finite number`) and `scale: 42` (⇒ `scale must be an object with numeric min, max and step`).
- **AC-01.4** On success ⇒ **201** with the created row, `rubric` being the value `assertAuthorableRubric` returned (normalized). `version = (max(version) for that courseId) + 1`, `1` when the course has none.
- **AC-01.5** Concurrent/repeat saves never collide: two sequential saves for the same course produce versions `n` and `n+1`; the client never sends `version` and a `version` present in the body is rejected by `whitelist` (ignored) — it is **not** honoured.
- **AC-01.6** `title` defaults to `` `${rubric.course_key} — ${rubric.task_type}` `` (byte-identical to `ingestDocx`'s expression) when absent/blank; when present it is trimmed and limited to 200 chars (longer ⇒ 400).
- **AC-01.7** `sourceFilename` is written as `null` (the column is already nullable — no migration).
- **AC-01.8** `templateKey`: absent/`null` ⇒ stored `null`. Present ⇒ must match `MACHINE_KEY_PATTERN` (exported from `rubric-validation.ts`), otherwise **400** `invalid template key`. Its **existence is never checked** — a key whose template was deleted is stored as-is (this is BR-08's orphan-is-normal rule; a test posts a `templateKey` that matches no row and expects 201).
- **AC-01.9** `courseId` must be a positive integer (400 otherwise) and must exist ⇒ **404** `course not found` when it does not. It must never surface as a Prisma FK 500.
- **AC-01.10** Missing `rubric` key entirely ⇒ 400 (from `assertAuthorableRubric`, which treats `undefined` as an empty rubric ⇒ `rubric must declare at least one dimension`). Never 500.
- **AC-01.11** A caller with `rubric_template` but **not** `criteria_author` (and not admin) ⇒ **403** `insufficient privilege`. Anonymous ⇒ 401. Admin ⇒ allowed.
- **AC-01.12** `POST /criteria` (.docx) behaviour, response shape and its two parser 400 messages are unchanged; `GET /internal/criteria/:courseId` still returns the stored row **verbatim** (unchanged by this FR).
- **AC-01.13** Rubric-authored strings are stored as data only: nothing from `rubric` is interpolated into SQL, a shell, a file path or a log format string.

### FR-02 — `POST /criteria/prompt-preview`: render the exact LLM system instruction for a draft

Request: `{ rubric: unknown, variant?: 'audio' | 'text' }` → **200** `{ variant: 'audio'|'text', prompt: string }`.
Guards: `SessionAuthGuard` + `@RequiresPrivilege('criteria_author', 'rubric_template')` (OR semantics — either drawer may preview).

- **AC-02.1** Stateless: the handler performs **no** database, Redis or RabbitMQ access and returns text derived solely from the posted body. A test asserts the injected Prisma mock receives zero calls.
- **AC-02.2** `variant` absent or `'audio'` ⇒ output of the TS port of `build_system_instruction`. `'text'` ⇒ output of the port of `build_system_instruction_text`. Any other value ⇒ **400**.
- **AC-02.3** **The preview is lenient, never a validation gate.** `assertAuthorableRubric` is *not* called here. A rubric that would be rejected on save (missing `pronunciation`, level gaps, `step: 0`) still returns 200 with a rendered prompt, because the author is mid-edit. Only a malformed *envelope* (bad `variant`, body not an object) 400s.
- **AC-02.4** Garbage rubrics never 500: `null`, `[]`, `"str"`, `42`, `{}`, deeply nested junk, `1e308` all ⇒ 200 with a string (this follows from `normalizeRubric`'s never-throw contract, which the renderer calls internally exactly as Python does).
- **AC-02.5** The response `prompt` contains **no** total, average or level/`levels` text — the BR-09 hard boundary the Python module's docstring states. A test asserts the rendered output of a rubric with a populated `levels` ladder contains none of its `code`/`label` strings.
- **AC-02.6** Response is `application/json`; the prompt is returned as a JSON string with real `\n` separators (never pre-escaped HTML).

### FR-03 — Drift guard between the two prompt renderers (mandatory, machine-enforced)

- **AC-03.1** `services/core-api/src/criteria/__fixtures__/prompt-render.fixtures.json` exists with the shape `{ "cases": [ { "name": string, "rubric": object, "expected_audio": string, "expected_text": string } ] }`.
- **AC-03.2** `criteria/prompt-render.spec.ts` asserts, for every case, `buildSystemInstruction(case.rubric) === case.expected_audio` and `buildSystemInstructionText(case.rubric) === case.expected_text` (strict `===`, not a substring or snapshot-auto-update).
- **AC-03.3** `services/grading-worker/tests/test_prompt_render_fixtures.py` reads **the same file** by relative path traversal (mirroring `tests/test_rubric_schema.py`'s `FIXTURE_PATH` + its "fixture missing" hard-fail message, in Vietnamese) and asserts `build_system_instruction(case["rubric"]) == case["expected_audio"]` and `build_system_instruction_text(...) == case["expected_text"]`.
- **AC-03.4** Fixture coverage — at minimum one case for each of: a **v1** rubric (no `schema_version`, `band_scale`, string `bands`, `few_shot_examples`); a v2 rubric with `sub_factors` on ≥2 dimensions; a v2 rubric with a `comment_bank` mixing `dimension: null`, a known dimension key and an **unknown** dimension key (pins the Python grouping order: rubric order → unknown → shared last); a rubric with **non-numeric** band keys (pins `_band_order`'s fallback to insertion order); `output_fields` **with** and **without** `fix`; an empty `comment_bank`; a dimension with `sub_factors: []` (pins "no empty heading").
- **AC-03.5** Fixture rubrics must **not** duplicate either seed's `dimensions`/`levels`/`scale`/`aggregation` literals (F10 AC-06.3's rule). Seed coverage is separate: **AC-03.6**.
- **AC-03.6** `prompt-render.spec.ts` additionally renders `CAMBRIDGE_YL_SEED.rubric` and `IELTS_SPEAKING_SEED.rubric` **by import** (never by paste) and asserts stable, human-readable output (design Phần 10 item 5: bullets, sub-factor grid, grouped comment bank all present).
- **AC-03.7** Both source files carry a mutual "⚠ BẢN SONG SINH" header naming the other file and the fixture, in the same style as `rubric-schema.ts`'s existing header.
- **AC-03.8** Reverse-patch proof (QA-checkable): mutating one character of `prompt-render.ts` (e.g. `•` → `-`) makes **both** the jest and the pytest suites fail. If only one fails, the guard is not wired.

### FR-04 — No other core-api behaviour changes

- **AC-04.1** F10's 8 template routes, their status codes and their message strings are untouched.
- **AC-04.2** `assertAuthorableRubric`, `rubric-schema.ts`, `lib/rubric-scoring.ts`, `docx-parser.ts`, all three `contracts` files and both `package.json`s are unchanged (`git diff HEAD -- package.json` empty in every service).
- **AC-04.3** The pre-F12 core-api suite passes with **unchanged assertions**; any edit to an existing spec file is additive and justified in `F12-backend.md`.
- **AC-04.4** OBS-4 clean-up (cosmetic, allowed): the stale ordering comment at `criteria/dto/create-rubric-template.dto.ts:26` may be corrected. No behaviour depends on it.

## 3.2 Dashboard — shared plumbing

### FR-05 — `components/ui/drawer.tsx`, hand-authored

- **AC-05.1** No new dependency. Implemented with React + Tailwind + `class-variance-authority` + `cn` (tailwind-merge), matching `components/ui/*`. `react-dom`'s `createPortal` is permitted (already a dependency); Radix and any headless-UI package are **forbidden**.
- **AC-05.2** API: `<Drawer open, onRequestClose(reason: 'esc' | 'backdrop' | 'close-button'), title, side?: 'right', size?: 'md' | 'lg', children, footer? />`. When `open` is false it renders `null` (no hidden DOM, no retained focus trap).
- **AC-05.3** Renders `role="dialog"` `aria-modal="true"` with `aria-labelledby` pointing at the rendered title element.
- **AC-05.4** Backdrop covers the viewport, dims the page, and a click on it calls `onRequestClose('backdrop')` — it does **not** unmount the drawer itself; the owner decides (this is what makes the dirty-guard of FR-21 possible).
- **AC-05.5** `Escape` calls `onRequestClose('esc')`. The listener is registered only while open and removed on unmount. With a nested confirm dialog open, `Escape` closes the **confirm**, not the drawer (topmost-wins).
- **AC-05.6** Focus trap: on open, focus moves into the panel (first focusable element, else the panel via `tabIndex={-1}`); `Tab` from the last focusable wraps to the first and `Shift+Tab` from the first wraps to the last; focus can never reach page content behind the backdrop.
- **AC-05.7** On close, focus returns to the element that was focused when the drawer opened.
- **AC-05.8** Body scroll is locked while open and the **previous** `document.body.style.overflow` value is restored on close (not hard-set to `''`). Two open/close cycles leave the body exactly as found.
- **AC-05.9** Responsive: full-width below the `md` breakpoint; a fixed panel width at `md`+ (`md` ≈ 36rem, `lg` ≈ 56rem for the Drawer-2 two-pane layout). Content scrolls inside the panel; the header and footer stay visible.
- **AC-05.10** Only one drawer may be open at a time; `Criteria.tsx` enforces this (opening one closes the other via the same dirty-guard path).
- **AC-05.11** Transition is CSS-only (`transition-transform`/`opacity`); no animation library, and the component is fully functional with animations disabled (`prefers-reduced-motion` respected).

### FR-06 — `components/ui/confirm-dialog.tsx`

- **AC-06.1** A small hand-authored modal: title, body text, confirm button (variant `destructive` when `destructive` is set), cancel button. No new dependency.
- **AC-06.2** Same a11y rules as FR-05 (role/dialog, Esc, focus trap, focus restore to the invoking button).
- **AC-06.3** Confirm and cancel are distinguishable by text, not colour alone.
- **AC-06.4** It is the only confirmation mechanism used by this feature — `window.confirm`, `window.alert` and `window.prompt` are **forbidden anywhere in F12's files**.

### FR-07 — `lib/rubric.ts`: shared v2 types + client-side helpers

- **AC-07.1** Declares the v2 types (`RubricV2`, `RubricScale`, `RubricAggregation`, `RubricLevel`, `RubricDimensionV2`, `RubricSubFactor`, `CommentBankEntry`, `StudentReply`, `StudentReplyButton`) with field names byte-identical to `core-api/src/criteria/rubric-schema.ts`, and a header comment naming that file as the source of truth.
- **AC-07.2** `maxTotal(rubric)` is a **line-for-line port** of `core-api/src/lib/rubric-scoring.ts`'s `maxTotal` — not an independent re-derivation. Verified by AC-07.5.
- **AC-07.3** `levelIssues(rubric): { code, index, prev?, next? }[]` is a port of `validateLevels`'s **logic** (same ordering pass, same `granularity()` inputs `aggregation.round` / `scale.step`, same inclusive bounds, same five codes) but returns **codes + numeric context only** — it does **not** copy F9's Vietnamese message strings, because those must be localizable client-side (the server's own strings are shown verbatim when a 400 arrives; see FR-20).
- **AC-07.4** `bandValues(scale): string[]` returns `min, min+step, …` up to and including `max`, formatted the same way JS `String(number)` formats them (so `1` not `1.0`), with a hard cap of **50** entries.
- **AC-07.5** Verification without a jest suite: the ports are checked against three fixed cases documented in the file's header comment and re-checked by QA by hand — Cambridge YL (`sum`, 5 dims × 0–5) ⇒ `maxTotal = 25`; IELTS (`average`, 4 dims × 0–9) ⇒ `maxTotal = 9`; `weighted_average` with uneven weights ⇒ `maxTotal = scale.max`. A mismatch between this port and the server is a **defect**, not an accepted inconsistency (PM US1).
- **AC-07.6** Pure module: no `fetch`, no React import, no i18n import.

### FR-08 — `api/client.ts`: expose the parsed error body (additive)

The drawers must surface `{message:'invalid rubric', issues:[…]}`; today `ApiError` carries only a synthesized string.

- **AC-08.1** `ApiError` gains an optional `body?: unknown` holding the parsed JSON error body (`undefined` when the response body is empty or not JSON) and an optional `serverMessage?: string` holding `body.message` when it is a string.
- **AC-08.2** `ApiError.message` keeps its **existing byte-identical format** (`` `${method} ${path} failed: ${status}` ``) so no existing page's behaviour changes.
- **AC-08.3** Parsing the body never throws and never turns a 4xx into a different status; a non-JSON body leaves `body` undefined.
- **AC-08.4** Success paths (200/201/204) are unchanged, including the `204 ⇒ undefined` branch used by `DELETE`.
- **AC-08.5** No other page is modified as a result of this change.

## 3.3 Dashboard — page integration and privileges

### FR-09 — `pages/Criteria.tsx` additions are additive

- **AC-09.1** The `.docx` upload card (native `<form>`, `name="courseId"`/`name="file"`, raw multipart `fetch`) is unchanged in markup and behaviour.
- **AC-09.2** The per-class config table is unchanged.
- **AC-09.3** The existing version list + raw-JSON `<pre>` preview remains and keeps its `criteria.previewRegion` a11y label.
- **AC-09.4** Two new entry buttons appear above the version list: `templates.open` (Drawer 1) and `authoring.open` (Drawer 2), rendered subject to FR-10.
- **AC-09.5** Each row of the version list additionally shows an **"Sửa"** button (opens Drawer 2 loaded from that version) when the user holds `criteria_author`; not rendered otherwise.
- **AC-09.6** After a successful save from either drawer, the version list for the currently-selected course is refreshed; if no course is selected, the list is left as-is and a success banner still shows.

### FR-10 — Privilege-driven UI

Privileges come from `useAuth().user.privileges` (populated by `GET /auth/me`, and re-fetched after login/change-password by `AuthContext`).

- **AC-10.1** The client uses **only** `privileges.includes(...)`. It must **not** re-implement "admin holds everything" — the server already expands it (F10 AC-11.2). A grep for `role === 'admin'` in F12's files must return nothing.
- **AC-10.2** `privileges` `undefined` (the field is optional) is treated as `[]`: no drawer entry point is rendered, nothing crashes.
- **AC-10.3** Visibility matrix — the single table QA tests against:

| Actor | Drawer 1 entry | Drawer 2 entry | Row "Sửa" | `.docx` upload form | version list / JSON preview / classes table |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `admin` | shown | shown | shown | enabled | shown |
| staff + `rubric_template` | shown | **hidden** | hidden | **disabled + hint** | shown |
| staff + `criteria_author` | **hidden** | shown | shown | enabled | shown |
| staff + both | shown | shown | shown | enabled | shown |
| staff + `[]` | hidden | hidden | hidden | **disabled + hint** | shown |

- **AC-10.4** The disabled `.docx` upload renders the localized hint `criteria.uploadNoPrivilege` next to it, never a raw 403 after the fact.
- **AC-10.5** Hiding is not the security boundary: if a write nevertheless returns **403** (privilege revoked mid-session — F10 verified revocation takes effect on the next request without re-login), the drawer stays open with the draft intact, shows the localized `errors.forbidden`, and does **not** dump `ApiError.message` or a stack.
- **AC-10.6** Granting a privilege takes effect for the UI on the next page load or after a re-login; F12 does not poll `/auth/me`.

## 3.4 Drawer 1 — "Cấu trúc chấm điểm" (`rubric_template`)

### FR-11 — Template list

- **AC-11.1** On open, `GET /criteria/templates?includeInactive=true`; **all** templates are listed, including inactive ones.
- **AC-11.2** The server's order (`isSystem DESC, key ASC`) is preserved verbatim — the client must not re-sort. Consequence: the two seeded defaults appear first (design Phần 7).
- **AC-11.3** Each row shows: `name`, `key` (monospace/muted), badge `templates.badgeSystem` ("Mặc định") when `isSystem`, badge `templates.badgeInactive` ("Đang ẩn") when `!isActive`, and the computed max total for that template's rubric (from `maxTotal`).
- **AC-11.4** Row actions render exactly per design table 4.1:

| | ordinary template | `isSystem` template |
| :-- | :-- | :-- |
| Sửa | ✔ | ✔ |
| Nhân bản | ✔ | ✔ |
| Ẩn / Hiện | ✔ | ✔ |
| Xóa | ✔ (confirm) | **not rendered at all** |
| Khôi phục bản gốc | **not rendered at all** | ✔ (confirm) |

- **AC-11.5** An empty list renders `templates.empty`, not a blank panel.
- **AC-11.6** A failed list load renders a localized error with a retry button; the drawer does not close itself.

### FR-12 — Template editor form

Opened by "+ Tạo cấu trúc mới" (blank), "Sửa" (loaded from the row), or "Nhân bản" (**pre-filled** from the source row).

- **AC-12.1** Fields present, all labelled, covering every item Phần 7 names: `key`, `name`; `rubric.course_key`, `task_type`, `tone`, `feedback_language`; `scale.min/max/step`; `aggregation.method` (`sum|average|weighted_average`) and `aggregation.round` (`none|nearest_int`); a repeatable dimension row (`key`, `label`, `weight`); a repeatable level row (`min`, `max`, `code`, `label`); `output_fields` as two checkboxes (`comment`, `fix`); the `student_reply` block (`show_total`, `show_level`, `template`, and a repeatable button row `title` + `action`); and `locked`.
- **AC-12.2** `locked` is a checkbox group over the **closed set** of `LOCKABLE_FIELD_PATHS` — exactly `scale`, `aggregation`, `levels`, `output_fields`, `dimensions[].key`, `dimensions[].weight`, `student_reply` — each with a localized human label. Free-text entry is not offered (a typo would silently lock nothing / 400).
- **AC-12.3** On **edit**, `key` is rendered read-only with the localized reason `templates.keyImmutable`, and the client never sends a changed `key` on `PUT` (F10 answers a rename with 400 `template key is immutable`).
- **AC-12.4** On **create**, `key` is editable and client-side hinted against `MACHINE_KEY_PATTERN` (`^[a-z0-9][a-z0-9_]{0,63}$`); the hint is advisory, the server is the authority.
- **AC-12.5** **Dimension content is preserved.** Editing a dimension's `key`/`label`/`weight` leaves its `bands` and `sub_factors` byte-identical in the submitted payload; the structure editor never rewrites, reorders or empties them. Removing a dimension removes its content with it, and the confirm text says so.
- **AC-12.6** Adding a dimension creates `bands: {}` and `sub_factors: []` — never invented placeholder text.
- **AC-12.7** Level rows can be added, removed and reordered; reordering changes the submitted array order.
- **AC-12.8** "Nhân bản" collects a new `key` (required) and an optional `name` in the same form, then calls `POST /criteria/templates/:sourceKey/duplicate` — **not** a client-side re-create via `POST /criteria/templates` (PM US1).
- **AC-12.9** Unchecking both `output_fields` checkboxes is blocked client-side with `templates.blocking.noOutputFields` (server would 400 `output_fields must not be empty`).
- **AC-12.10** `student_reply` may be left entirely empty/absent; the client sends `null` rather than a half-populated object when the author never touched it.

### FR-13 — Drawer 1 live validation

- **AC-13.1** A **computed max total** is displayed and recomputed on every keystroke that affects `scale`, `aggregation.method`, the dimension list or weights, using `lib/rubric.ts`'s `maxTotal`. Changing `scale.max` from 5 to 9 on a 5-dimension `sum` rubric changes the display from `25` to `45` without a save or a round trip.
- **AC-13.2** Level ranges are checked live for the five F9 conditions (invalid, overlap, gap, coverage-start, coverage-end) against `0..maxTotal`, and each problem is rendered **inline next to the offending level row** (using `issue.index`) plus summarized at the top of the form.
- **AC-13.3** Level problems are **advisory**: they warn prominently but do **not** disable Save. Rationale: a false positive in the client port must not make a legal rubric unsavable — the server is the authority. (QA: a client-warned rubric that the server accepts is a *port defect* to file, not an accepted inconsistency.)
- **AC-13.4** Blocking problems — which **do** disable Save, each with its own message — are exactly: empty `key`, empty `name`, zero dimensions, no dimension with key `pronunciation`, a numeric field left non-numeric, and empty `output_fields`. Nothing else blocks.
- **AC-13.5** **OBS-2 hint:** when `scale.step` does not divide `scale.max - scale.min` evenly, an advisory hint renders next to the `step` field explaining that intermediate totals become reachable and the level ladder will report gaps. Advisory only; never blocks.
- **AC-13.6** The client **never repairs** what the author typed: a cleared numeric input is submitted as `null` (⇒ an explicit server 400) and is never silently coerced to a default or omitted from the payload. This applies to `scale.min/max/step`, `dimensions[].weight`, `levels[].min/max`.
- **AC-13.7** Validation state is recomputed from the current form model only — never from a server round trip.

### FR-14 — Drawer 1 actions, exact status codes

Every call below is `api.*` with the parsed-body error handling of FR-08/FR-20.

- **AC-14.1** Create ⇒ `POST /criteria/templates` `{key,name,rubric,locked?,isActive?}`; **201** ⇒ list refreshed, form closes, success banner.
- **AC-14.2** Create with an existing key ⇒ **409** `template key already exists` ⇒ localized `errors.conflictDuplicateKey`, form stays open with the draft intact and focus moved to the `key` field.
- **AC-14.3** Duplicate ⇒ `POST /criteria/templates/:key/duplicate` `{key,name?}`; **201**; duplicating an `isSystem` template yields an ordinary one (badge "Mặc định" absent, Xóa now offered) after the refresh. Key clash ⇒ 409 handled as AC-14.2.
- **AC-14.4** Update ⇒ `PUT /criteria/templates/:key` `{name?,rubric?,locked?}`; **200** ⇒ list refreshed. A 400 body is surfaced per FR-20.
- **AC-14.5** Delete ⇒ confirm dialog whose body **explicitly states** that criteria already authored from this template are unaffected (`templates.confirmDeleteBody`), then `DELETE /criteria/templates/:key`; **204** ⇒ row disappears. The response has no body — the client must not try to read one.
- **AC-14.6** Delete is never offered for `isSystem`; if a 409 `system templates cannot be deleted` arrives anyway (stale list), it is surfaced as `errors.conflictSystemDelete` and the list is refreshed.
- **AC-14.7** Hide/Show ⇒ `PATCH /criteria/templates/:key/active` `{isActive: <boolean>}`; **200** ⇒ the "Đang ẩn" badge toggles. The body carries a real boolean (the DTO is strict).
- **AC-14.8** Reset ⇒ confirm dialog stating that all edits will be lost (`templates.confirmResetBody`), then `POST /criteria/templates/:key/reset`; **200** ⇒ row shows seed `name`/`rubric`/`locked` again; `isActive` is **not** changed by reset (F10 deviation D-4) and the UI must not pretend it was.
- **AC-14.9** Reset is never offered for an ordinary template; a 409 `reset is only available for system templates` or `no seed definition for this template` is surfaced as `errors.conflictResetOrdinary` / `errors.conflictNoSeed`.
- **AC-14.10** **404** on any per-key action (row deleted in another tab) ⇒ localized `errors.notFound` + automatic list refresh.
- **AC-14.11** Every mutating button is disabled while its request is in flight; a double-click cannot produce two `POST`s.

## 3.5 Drawer 2 — "Soạn nội dung chấm điểm" (`criteria_author`)

### FR-15 — Source selection

- **AC-15.1** Step 1: course select, sourced from the existing `GET /courses` (same options the upload form uses).
- **AC-15.2** Step 2: template select, sourced from `GET /criteria/templates` **without** `includeInactive` (active only), server order preserved so the two defaults lead the list.
- **AC-15.3** Step 3 alternative: opening from a version row's "Sửa" loads that version via `GET /criteria/:id` and skips the template step; the loaded row's `templateKey` is carried forward unchanged into the save payload (including when it is `null`, and including when it names a deleted template).
- **AC-15.4** When started from a template, `templateKey` is set to that template's `key` and `rubric` is initialized from a **deep copy** of `template.rubric`; later edits to the draft never mutate the fetched template object.
- **AC-15.5** `rubric.course_key` is pre-filled from the selected course's `key` when the base rubric's own `course_key` is empty; an existing non-empty value is not overwritten.
- **AC-15.6** Changing the course or template after edits exist triggers the FR-21 unsaved-changes confirm.
- **AC-15.7** A template whose rubric lacks a `pronunciation` dimension shows a blocking banner (`authoring.pronunciationMissing`) directing the author to fix the structure in Drawer 1; Save is disabled (the server would 400).

### FR-16 — Band descriptors as a grid

This is the capability Phần 7 singles out.

- **AC-16.1** For each dimension, band rows are **derived from `scale`**: one row per value in `bandValues(scale)` = `min, min+step, …, max`. A 0–5 step-1 scale renders 6 rows; a 0–9 scale renders 10.
- **AC-16.2** Each row is `Band <value>` + **one `<textarea>`**. There is no single `;`-joined field anywhere in this drawer.
- **AC-16.3** Text ↔ data mapping: each **non-empty line** of the textarea is one entry of `bands[value]: string[]`, in order; lines are trimmed; blank lines are dropped; a band whose textarea is empty is **omitted** from `bands` entirely (never stored as `[""]` or `[]`).
- **AC-16.4** Loading an existing rubric fills each textarea by joining `bands[value]` with `\n` — a round trip with no edits produces an equal `bands` object.
- **AC-16.5** **Widening the scale adds rows and preserves text.** Changing 0–5 → 0–9 (in Drawer 1, then re-opening Drawer 2, or via an unlocked `scale` field) leaves bands 0–5 populated and adds empty rows 6–9. No re-typing.
- **AC-16.6** **Narrowing the scale never silently discards content.** Band keys no longer in `bandValues(scale)` — plus any non-numeric legacy key — render in a separate, clearly-labelled "ngoài thang" section (`authoring.outOfScale`) with a warning and an explicit per-row delete. They remain in the submitted `bands` until the author deletes them.
- **AC-16.7** If `bandValues` would exceed the 50-row cap, the grid renders only the band keys already present in the rubric plus `min` and `max`, and shows `authoring.tooManyBands`. The drawer must not attempt to render 101 textareas for a 0–100 scale.
- **AC-16.8** Band values are rendered as the plain number string (`0`, `5`, `9`), matching the JSON key form used by `bands` and by the prompt renderer's `_band_order`.

### FR-17 — Sub-factors

- **AC-17.1** Per dimension, a repeatable sub-factor row: a `label` field plus one small input per band value (the `by_band` grid), using the same band values as FR-16.
- **AC-17.2** An empty `by_band` cell is **omitted** from the stored object; a sub-factor may legitimately define only some bands (the IELTS source defines 4/6/8/9 only).
- **AC-17.3** A sub-factor with an empty `label` **and** no filled cells is dropped on save rather than stored as noise.
- **AC-17.4** `sub_factors` is always submitted as an array (`[]` when none) — never `undefined`, matching the v2 shape.
- **AC-17.5** Adding/removing sub-factors on one dimension never touches another dimension's data.

### FR-18 — Comment bank

- **AC-18.1** A repeatable row: `dimension` (a select listing the rubric's dimensions by `label`, plus `authoring.cbShared` mapping to `null`), `intent` (free text, with `khen` / `góp ý` offered as datalist suggestions), `text` (textarea, required).
- **AC-18.2** A row with empty `text` is dropped on save; empty `intent` is submitted as `null`, not `""`.
- **AC-18.3** Row order is preserved on save and is the order the prompt renderer groups within a dimension.
- **AC-18.4** Renaming a dimension `key` in Drawer 1 can orphan a comment-bank entry; such an entry still renders (showing the raw key) and is preserved, never dropped — matching the Python renderer, which places unknown dimensions in their own group.
- **AC-18.5** `comment_bank` is always submitted as an array (`[]` when none).

### FR-19 — Locked fields and the pinned `pronunciation` dimension

- **AC-19.1** For each path in the selected template's `locked` array, the corresponding control(s) render **read-only** (`disabled` + `aria-disabled="true"`) with a **visible** reason line — never silently greyed out. The seven paths map as: `scale` ⇒ min/max/step (and the band grid stays derived from them); `aggregation` ⇒ both selects; `levels` ⇒ the whole level table; `output_fields` ⇒ both checkboxes; `dimensions[].key` ⇒ every dimension key input; `dimensions[].weight` ⇒ every weight input; `student_reply` ⇒ the whole block.
- **AC-19.2** The reason text names the template (`authoring.lockedReason` with `{{template}}`) and states where it can be changed (`authoring.lockedWhere` — "trong drawer Cấu trúc chấm điểm").
- **AC-19.3** Locked values are still **submitted unchanged** — the client never omits them from the payload (omission would let `normalizeRubric` substitute defaults server-side).
- **AC-19.4** `locked` is a **UI-only** constraint: F10 enforces no `locked` rule server-side, and F12 does not add one. This is recorded as a deliberate decision, not an oversight.
- **AC-19.5** The lock applies in Drawer 2 **to every user, including admins and `rubric_template` holders**. Rationale: it keeps the two drawers' responsibilities disjoint (structure vs content) and avoids a per-user branch that would need its own test matrix; a privileged user changes the structure in Drawer 1. AC-19.2's "where to change it" text is what makes this discoverable.
- **AC-19.6** The `pronunciation` dimension is rendered **first**, has **no** remove control, and carries a badge (`authoring.pronunciationBadge`) whose tooltip/adjacent text gives the §3.10 reason (`authoring.pronunciationReason`).
- **AC-19.7** The pin is a UI affordance **in addition to** the server's 400 (`rubric must include the "pronunciation" dimension`), not instead of it — F12 does not weaken any server gate.

### FR-20 — Live prompt preview pane

- **AC-20.1** A pane (right column at `lg`+, stacked below the form on narrower viewports) shows the **exact text** returned by `POST /criteria/prompt-preview` for the current draft, in a `<pre>` with `whitespace-pre-wrap`, labelled as a region for screen readers.
- **AC-20.2** It renders once on open and re-renders on every draft change, **debounced at 300–500 ms**. A burst of keystrokes produces at most one request per debounce window.
- **AC-20.3** Stale responses are discarded (request sequence number or `AbortController`): the pane always shows the render of the **latest** submitted draft.
- **AC-20.4** While a request is in flight the pane shows `authoring.previewUpdating` **without clearing** the previous text (no flicker to empty).
- **AC-20.5** A failed preview request shows `authoring.previewError` and keeps the last successful text. It **never** blocks Save, never closes the drawer, and never shows a raw `ApiError` string.
- **AC-20.6** A variant toggle offers `authoring.variantAudio` (default) and `authoring.variantText`; switching triggers an immediate re-render with the same draft.
- **AC-20.7** The pane contains no client-side prompt assembly whatsoever — it renders the server string verbatim. A grep of the dashboard for `Tiêu chí:` / `Band ` prompt literals must return nothing.
- **AC-20.8** The text is rendered by React as text (no `dangerouslySetInnerHTML`).

### FR-21 — Save, versioning and unsaved-changes handling (**OBS-3 lives here**)

- **AC-21.1** Save calls `POST /criteria/json` with `{courseId, templateKey, title?, rubric}` and nothing else; `version` is never sent.
- **AC-21.2** **201** ⇒ success banner naming the new version (`authoring.savedVersion` with `{{version}}` from the response), the version list refreshes, and the drawer's baseline is reset (AC-21.5).
- **AC-21.3** Opening "Sửa" on version *n* and saving produces version *n+1*; version *n* is left untouched in the database (QA: re-fetch version *n* after the save and confirm its `rubric` is unchanged).
- **AC-21.4** **The dirty check compares form-model to form-model, never raw JSON to raw JSON.** The baseline is the form model derived from the response that seeded the form (the `GET /criteria/:id` or the template row); the current state is the form model in the drawer. Both sides pass through the same derivation, so the normalization asymmetry of OBS-3 cannot manufacture a difference.
- **AC-21.5** Explicitly forbidden, each individually checkable by QA/code review: (a) comparing a **re-fetched** `GET` response against local draft state; (b) comparing `JSON.stringify(server)` with `JSON.stringify(draft)` (key order differs — Postgres jsonb reordering, F8 OBS-03); (c) treating `GET /criteria/:id`'s normalized rubric as byte-identical to what was saved; (d) comparing anything against `GET /internal/criteria/:courseId`, which is raw and is not a dashboard route anyway.
- **AC-21.6** Concrete regression case QA must run: open Drawer 2 on an existing **v1-era** criteria row (raw `band_scale`, string `bands`), change nothing, and confirm the drawer reports **no unsaved changes** and closing it asks no confirmation. A naive dirty-check fails exactly here.
- **AC-21.7** Closing a dirty drawer by Esc, backdrop or the close button opens the confirm dialog (`drawer.unsavedTitle` / `drawer.unsavedBody` / discard / stay). Closing a clean drawer closes immediately with no dialog.
- **AC-21.8** A failed save leaves the drawer open with the draft **and** the baseline both intact — nothing is lost and the drawer does not become spuriously clean.
- **AC-21.9** The Save button is disabled while a save is in flight; a double-click cannot create two versions.
- **AC-21.10** A payload rejected as too large (Nest's default JSON body limit) surfaces `errors.payloadTooLarge`, not a generic failure. (Documented limit, not a new one introduced by F12.)

### FR-22 — Error surfacing (both drawers)

- **AC-22.1** **400 `{message:'invalid rubric', issues:[{code,index,message}]}`**: rendered as a heading (`errors.invalidRubric`) plus one list entry per issue showing `issue.message` **verbatim** (F9's Vietnamese strings — not re-translated, not truncated). Where `issue.index` is a valid index into the level table, that row is also visually flagged.
- **AC-22.2** **400 `{statusCode,message,error}`** (the 11 documented rubric messages, plus `invalid template key`, `template key is immutable`): the server `message` is shown **verbatim** under a localized heading. F12 does not invent translations for server strings, and does not swallow them.
- **AC-22.3** **409** is mapped by exact server message string to a localized explanation: `template key already exists` ⇒ `errors.conflictDuplicateKey`; `system templates cannot be deleted` ⇒ `errors.conflictSystemDelete`; `reset is only available for system templates` ⇒ `errors.conflictResetOrdinary`; `no seed definition for this template` ⇒ `errors.conflictNoSeed`; any other 409 ⇒ `errors.conflictGeneric` plus the verbatim server text.
- **AC-22.4** **401** ⇒ `errors.unauthorized` with a link to the login route; the draft is not discarded.
- **AC-22.5** **403** ⇒ `errors.forbidden` (per AC-10.5).
- **AC-22.6** **404** ⇒ `errors.notFound` + refresh of the affected list.
- **AC-22.7** **≥500 or a network failure** ⇒ `errors.server` / `errors.network` with a retry affordance.
- **AC-22.8** In no case is `ApiError.message` (`"POST /criteria/templates failed: 409"`), a stack trace or a raw JSON dump shown to the user; and in no case is `window.alert` used.
- **AC-22.9** Errors render in an `Alert` with `role="alert"`, matching the existing page's upload-error pattern, and are dismissed when the failing action succeeds.

### FR-23 — i18n parity, both blocks

- **AC-23.1** Every new user-visible string is an i18n key present in **both** the `vi` and the `en` block of `services/dashboard/src/i18n/index.ts`. No literal Vietnamese or English text in TSX.
- **AC-23.2** **Zero dead keys**: every key added by F12 is referenced by at least one `t(...)` call. (This is the exact defect class that failed F3/F4 QA rounds.)
- **AC-23.3** **Machine-enforced parity (Should, and cheap):** `i18n/index.ts` is restructured so the `en` translation object is typed against the `vi` one — e.g. `const vi = { … }; const en: Record<keyof typeof vi, string> = { … };` — so a key missing from `en` **and** an extra key in `en` both fail `tsc -b`. This converts a recurring manual-review defect class into a build failure at the cost of two lines. If this fights `initReactI18next`'s typings, the fallback is a documented QA grep, and the deviation must be recorded.
- **AC-23.4** Keys with interpolation declare their placeholders in both locales identically (`{{index}}`, `{{prev}}`, `{{next}}`, `{{template}}`, `{{version}}`, `{{value}}`, `{{count}}`).
- **AC-23.5** Existing keys are reused rather than duplicated: `criteria.save`, `criteria.selectCourse`, `criteria.version`, `criteria.preview`, `criteria.courseId`, `users.privRubricTemplate`, `users.privCriteriaAuthor`.
- **AC-23.6** Switching the language while a drawer is open re-labels it without losing draft state.

### FR-24 — Accessibility and responsiveness (Could, per PM US4)

- **AC-24.1** Both drawers are fully operable by keyboard alone: open, traverse every field, add/remove repeatable rows, save, close.
- **AC-24.2** Every input has an associated `<label>` (or `aria-label`); repeatable rows' add/remove buttons have accessible names that identify the row (e.g. "Xóa cấp độ 2").
- **AC-24.3** At `< md`, the drawer is full-width and the prompt preview stacks beneath the form; no horizontal page scroll appears.
- **AC-24.4** The band grid and level table scroll horizontally inside their own container rather than widening the panel.
- **AC-24.5** Colour is never the sole carrier of meaning (badges and validation states carry text too).

---

# 4. Non-functional requirements

- **NFR-01 — No new dependency.** `git diff HEAD -- package.json` is empty for `services/dashboard` and `services/core-api`; `pyproject.toml` unchanged for `grading-worker`. No Radix, no headless-UI, no icon package, no animation library.
- **NFR-02 — Preview responsiveness.** Debounce 300–500 ms; server render is pure string assembly with no I/O and must complete in < 50 ms for a rubric of ≤ 20 dimensions × ≤ 20 bands × ≤ 10 sub-factors. Perceived preview latency ≤ 1 s on a local stack.
- **NFR-03 — Scale limits.** Drawer 1 lists up to 200 templates without pagination or virtualization. Drawer 2 renders up to 20 dimensions × 50 band rows; beyond the band cap, AC-16.7 applies.
- **NFR-04 — Payload.** Save and preview bodies stay under Nest's existing default JSON body limit; exceeding it is surfaced per AC-21.10. F12 does not raise the limit.
- **NFR-05 — Security.** The preview endpoint reads no stored data and renders only the caller's own payload (no IDOR surface). All rubric-authored text is rendered by React as text. Both new routes sit behind `SessionAuthGuard` + `PrivilegeGuard`; neither introduces an env var, a port, a secret or a compose change.
- **NFR-06 — Availability/robustness.** Neither new route can 500 on hostile input (AC-02.4, AC-01.10). A preview outage degrades the drawer to "no preview", never to "cannot save".
- **NFR-07 — Build/test gates.** core-api: `tsc -p tsconfig.build.json --noEmit` + `tsc -p tsconfig.json --noEmit` clean, jest green with a suite/test count **≥** F10's 39 / 723 baseline. grading-worker: pytest green with a count ≥ 261. dashboard: `tsc -b && vite build` exit 0. All via Docker per `CLAUDE.md`.
- **NFR-08 — Consistency of idiom.** New components use CVA + `cn`, F3's design tokens (`text-h1`/`text-body`/`text-caption`, `bg-muted`, `border-input`, `accent-primary`) and the hand-rolled `components/icons.tsx`; no new visual language.

---

# 5. Use cases

**UC-1 — Create a new scoring structure.** *Actor:* holder of `rubric_template`. *Pre:* logged in, on `/criteria`. *Main:* open Drawer 1 → "+ Tạo cấu trúc mới" → fill key/name/scale/aggregation/dimensions/levels/output_fields → watch the computed max total update → Save ⇒ 201 → row appears at the correct sort position. *Alt:* key already taken ⇒ 409 ⇒ localized message, focus to `key`, draft kept. *Exception:* level gap ⇒ 400 `invalid rubric` ⇒ issues listed inline. *Post:* one new `rubric_templates` row, `isSystem=false`, `isActive=true`.

**UC-2 — Duplicate a system template into a variant.** *Actor:* `rubric_template`. *Main:* row "Nhân bản" on `ielts_speaking` → pre-filled form → new key `ielts_short` → remove 1 dimension → Save ⇒ `POST /criteria/templates/ielts_speaking/duplicate` ⇒ 201 ⇒ the copy shows **no** "Mặc định" badge and **does** offer Xóa. *Post:* seed row untouched.

**UC-3 — Delete an ordinary template.** *Main:* Xóa → confirm stating derived criteria are unaffected → 204 → row gone. *Alt:* stale list, row is `isSystem` ⇒ 409 ⇒ `errors.conflictSystemDelete` + refresh. *Post:* criteria carrying that `templateKey` still list, load and grade (F10 AC-02.4 — the orphan is normal).

**UC-4 — Restore a system template.** *Main:* "Khôi phục bản gốc" → confirm ("mất hết chỉnh sửa") → 200 → name/rubric/locked back to seed, `isActive` **unchanged**. *Alt:* ordinary template ⇒ 409.

**UC-5 — Author content for a course.** *Actor:* `criteria_author`. *Main:* open Drawer 2 → pick course + template → band grid renders one textarea per band → type descriptors → add sub-factors and comment-bank rows → prompt preview updates live → Save ⇒ 201 → "Đã lưu phiên bản 1". *Alt:* a locked field is read-only with a reason. *Exception:* template lacks `pronunciation` ⇒ blocking banner, Save disabled. *Post:* one new `criteria` row, `version` = previous+1, `templateKey` set, `sourceFilename` null.

**UC-6 — Edit an old version.** *Main:* version list → "Sửa" on v2 → drawer loads it → no edits ⇒ **no** unsaved-changes prompt on close (AC-21.6) → edit one band → Save ⇒ v3 created; v2 unchanged. *Post:* both versions exist; `GET /criteria?courseId=` shows v3 first.

**UC-7 — Rejected save, then recovery.** *Main:* author narrows `scale.max` so the level ladder no longer covers `0..max` → client shows advisory gap warnings but Save stays enabled → Save ⇒ 400 `{message:'invalid rubric', issues:[…]}` → each Vietnamese issue message renders next to its level row → author fixes the ranges → Save ⇒ 201. *Post:* nothing was written on the rejected attempt.

---

# 6. Business rules

- **BR-01** The bot/product boundary is untouched: F12 changes authoring only. No new student-facing behaviour.
- **BR-02** Authoring-time is where strictness lives; read-time stays lenient. F12 must not add a client-side rule that rejects input the server accepts (except the six blocking rules of AC-13.4, all of which mirror server rules).
- **BR-03** The server is the sole authority on rubric validity. Client validation is advisory (except AC-13.4) and any client-pass/server-reject or client-reject/server-accept divergence is a defect.
- **BR-04** `assertAuthorableRubric` is called with the **raw** author payload; normalization happens inside it. No F12 code path normalizes first.
- **BR-05** A criteria version is immutable once written. Editing produces v+1; nothing updates a `criteria` row in place.
- **BR-06** `criteria.rubric` is an independent copy taken at authoring time. Editing a template never retro-fits criteria already authored from it; deleting a template never touches them.
- **BR-07** `templateKey` is traceability only — a plain string, no foreign key. An orphaned value is a normal state, not a data error.
- **BR-08** `pronunciation` is a mandatory dimension (§3.10) enforced at three gates: the drawer (pin + blocking banner), `assertAuthorableRubric` (400), and grading time (`grading/schema.py`). F12 adds the first, weakens neither of the others.
- **BR-09** The LLM prompt must never mention totals, averages or level names — the preview renders whatever the renderer produces, and the renderer keeps that boundary (AC-02.5).
- **BR-10** `locked` is policy data for the content drawer, not an authorization mechanism; authorization is `PrivilegeGuard`.
- **BR-11** Two hard-coded system templates exist as **data**, not code constants: they are editable, hideable, resettable, and not deletable.
- **BR-12** Reads are open to any authenticated dashboard user; only writes are privilege-gated (F10's rule, unchanged).

---

# 7. Data dictionary

### 7.1 `POST /criteria/json` request

| Field | Type | Required | Validation |
| :-- | :-- | :-- | :-- |
| `courseId` | int | yes | positive integer; must exist ⇒ else 404 `course not found` |
| `rubric` | object (raw v1 or v2) | yes | `assertAuthorableRubric` on the **raw** value; 400 on failure |
| `title` | string | no | trimmed, ≤ 200 chars; default `` `${rubric.course_key} — ${rubric.task_type}` `` |
| `templateKey` | string \| null | no | if non-null must match `^[a-z0-9][a-z0-9_]{0,63}$`; **existence not checked** |

### 7.2 `POST /criteria/prompt-preview` request / response

| Field | Type | Required | Validation |
| :-- | :-- | :-- | :-- |
| `rubric` | any | yes | none (lenient — normalized internally) |
| `variant` | `'audio'` \| `'text'` | no | default `'audio'`; other values ⇒ 400 |
| → `prompt` | string | — | rendered system instruction, `\n`-separated |
| → `variant` | `'audio'` \| `'text'` | — | echo of the effective variant |

### 7.3 Drawer 1 form model (`RubricTemplate` draft)

| Field | Type | Required | Validation (client) |
| :-- | :-- | :-- | :-- |
| `key` | string | yes | machine-key pattern; **read-only on edit** |
| `name` | string | yes | non-empty, ≤ 200 |
| `isActive` | boolean | no | default true |
| `locked[]` | string[] | no | subset of the 7 `LOCKABLE_FIELD_PATHS`; de-duplicated |
| `rubric.course_key` | string | no | free text |
| `rubric.task_type` | string | no | free text; default `speaking_clip` |
| `rubric.tone` | string | no | free text; default `khích lệ` |
| `rubric.feedback_language` | string | no | free text; default `vi` |
| `rubric.scale.{min,max,step}` | number | yes | finite; blank ⇒ submitted as `null` (never coerced) |
| `rubric.aggregation.method` | enum | yes | `sum` \| `average` \| `weighted_average` |
| `rubric.aggregation.round` | enum | yes | `none` \| `nearest_int` |
| `rubric.dimensions[].key` | string | yes | machine-key pattern; unique; one must be `pronunciation` |
| `rubric.dimensions[].label` | string | yes | non-empty |
| `rubric.dimensions[].weight` | number | yes | ≥ 0; blank ⇒ `null` |
| `rubric.dimensions[].bands` | `Record<string,string[]>` | — | **carried through untouched by Drawer 1** |
| `rubric.dimensions[].sub_factors` | array | — | carried through untouched by Drawer 1 |
| `rubric.levels[].{min,max}` | number | yes (per row) | finite; blank ⇒ `null` |
| `rubric.levels[].{code,label}` | string | yes (per row) | non-empty |
| `rubric.output_fields[]` | enum[] | yes | non-empty subset of `comment`,`fix`, no duplicates |
| `rubric.student_reply` | object \| null | no | `null` when untouched; else `show_total`/`show_level` boolean, `template` string, `buttons[].{title,action}` strings (title ≤ 100 chars — Zalo's limit, advisory hint) |

### 7.4 Drawer 2 form model (criteria content draft)

| Field | Type | Required | Validation (client) |
| :-- | :-- | :-- | :-- |
| `courseId` | int | yes | from the course select |
| `templateKey` | string \| null | no | from the chosen template, or carried from the edited version |
| `title` | string | no | ≤ 200; blank ⇒ server default |
| `bands[dim][value]` (textarea) | string | no | lines → `string[]`; blank band omitted |
| out-of-scale band keys | `Record<string,string[]>` | no | preserved and shown separately until explicitly deleted |
| `sub_factors[].label` | string | no | empty + no cells ⇒ row dropped |
| `sub_factors[].by_band[value]` | string | no | empty cell omitted |
| `comment_bank[].dimension` | string \| null | no | a dimension key or `null` (shared) |
| `comment_bank[].intent` | string \| null | no | empty ⇒ `null` |
| `comment_bank[].text` | string | yes (per row) | empty ⇒ row dropped |
| locked fields | — | — | read-only, **still submitted** with their loaded values |

---

# 8. i18n key inventory (every key required in BOTH `vi` and `en`)

Namespaces: `drawer.*` (primitive), `templates.*` (Drawer 1), `authoring.*` (Drawer 2), `errors.*` (shared surfacing), plus 1 addition to `criteria.*`.

**`drawer.*`** — `close` (Đóng / Close) · `unsavedTitle` (Bỏ thay đổi chưa lưu? / Discard unsaved changes?) · `unsavedBody` · `unsavedDiscard` (Bỏ thay đổi / Discard) · `unsavedStay` (Ở lại / Stay).

**`criteria.*`** — `uploadNoPrivilege` (Bạn không có quyền soạn nội dung chấm điểm / You do not hold the scoring-content privilege).

**`templates.*`** — `open` · `title` · `empty` · `new` · `edit` · `duplicate` · `delete` · `hide` · `show` · `reset` · `badgeSystem` (Mặc định / Default) · `badgeInactive` (Đang ẩn / Hidden) · `key` · `keyImmutable` · `name` · `courseKey` · `taskType` · `tone` · `feedbackLanguage` · `scale` · `scaleMin` · `scaleMax` · `scaleStep` · `stepHint` · `aggregationMethod` · `aggregationRound` · `method.sum` · `method.average` · `method.weighted_average` · `round.none` · `round.nearest_int` · `dimensions` · `dimKey` · `dimLabel` · `dimWeight` · `addDimension` · `removeDimension` · `removeDimensionConfirm` · `levels` · `levelMin` · `levelMax` · `levelCode` · `levelLabel` · `addLevel` · `removeLevel` · `outputFields` · `outputComment` · `outputFix` · `studentReply` · `showTotal` · `showLevel` · `replyTemplate` · `buttons` · `buttonTitle` · `buttonAction` · `addButton` · `removeButton` · `locked` · `lockedHint` · `lockPath.scale` · `lockPath.aggregation` · `lockPath.levels` · `lockPath.output_fields` · `lockPath.dimensions_key` · `lockPath.dimensions_weight` · `lockPath.student_reply` · `maxTotal` · `duplicateKeyLabel` · `duplicateNameLabel` · `confirmDeleteTitle` · `confirmDeleteBody` · `confirmResetTitle` · `confirmResetBody` · `saved` · `issue.level_invalid` · `issue.level_overlap` · `issue.level_gap` · `issue.level_coverage_start` · `issue.level_coverage_end` · `blocking.keyRequired` · `blocking.nameRequired` · `blocking.noDimensions` · `blocking.missingPronunciation` · `blocking.numberRequired` · `blocking.noOutputFields`.

**`authoring.*`** — `open` · `title` · `selectTemplate` · `templateStep` · `courseStep` · `titleField` · `dimensions` · `bands` · `band` (`Band {{value}}`) · `bandHint` (Mỗi dòng là một gạch đầu dòng / One bullet per line) · `outOfScale` · `outOfScaleHint` · `removeBand` · `tooManyBands` · `subFactors` · `subFactorLabel` · `addSubFactor` · `removeSubFactor` · `commentBank` · `cbDimension` · `cbShared` (Dùng chung / Shared) · `cbIntent` · `cbText` · `addComment` · `removeComment` · `intentPraise` (khen / praise) · `intentSuggest` (góp ý / suggestion) · `lockedReason` (`{{template}}`) · `lockedWhere` · `pronunciationBadge` · `pronunciationReason` · `pronunciationMissing` · `preview` · `previewVariant` · `variantAudio` · `variantText` · `previewUpdating` · `previewError` · `previewEmpty` · `savedVersion` (`{{version}}`).

**`errors.*`** — `invalidRubric` · `unauthorized` · `forbidden` · `notFound` · `conflictDuplicateKey` · `conflictSystemDelete` · `conflictResetOrdinary` · `conflictNoSeed` · `conflictGeneric` · `server` · `network` · `payloadTooLarge` · `retry`.

Total ≈ 135 new keys × 2 locales. AC-23.2 (zero dead keys) applies to every one of them: if a key in this inventory ends up unused, delete it rather than shipping it.

---

# 9. What is and is not machine-verifiable

**Machine-verifiable (must be automated):**

| Item | Gate |
| :-- | :-- |
| FR-01 versioning, `templateKey`, 404/403/400 paths | core-api jest (service + real-HTTP e2e, following `criteria-routes.e2e.spec.ts`) |
| FR-01 AC-01.3 raw-before-normalize ordering | core-api jest — a behavioural test, not a code comment (the F10 DEF-1 lesson) |
| FR-01 route ordering | the existing real-HTTP route-order suite, extended |
| FR-02 preview leniency, no-I/O, no-levels boundary | core-api jest |
| **FR-03 renderer drift** | core-api jest **and** grading-worker pytest over the shared fixture; AC-03.8 reverse-patch proof |
| FR-04 no dependency / no assertion weakening | `git diff HEAD -- package.json`; suite counts ≥ 39/723 and ≥ 261 |
| Dashboard type-correctness, unresolved imports | `tsc -b && vite build` in Docker |
| **FR-23 i18n key parity** | `tsc -b` **if AC-23.3 is implemented** — otherwise not verifiable at all |

**Not machine-verifiable in this repo (QA manual/probe matrix — the dashboard has no jest suite and F12 does not add one):**

1. Drawer primitive: focus trap wrap-around, focus restore, Esc, backdrop click, body-scroll restore, single-drawer-at-a-time, reduced-motion.
2. Privilege visibility matrix AC-10.3 — five actors × five surfaces, via five real logged-in sessions (F10 QA's method).
3. Band-grid behaviour: 0–5 ⇒ 6 rows, 0–9 ⇒ 10 rows, widening preserves text, narrowing parks bands in the out-of-scale section, the 50-row cap.
4. Live max-total and level-issue recomputation; the OBS-2 step hint.
5. **AC-21.6** — open a v1-era criteria row, touch nothing, expect no dirty state. The single highest-value manual check in F12.
6. Prompt-preview liveness: debounce, stale-response discard, no flicker, failure degrades gracefully.
7. Error surfacing: all four 409 strings, the `invalid rubric` issues list, 401/403/404/5xx, and the absence of any raw `ApiError` text.
8. i18n: dead-key grep, and a full pass of both drawers in `en` with no Vietnamese leakage (and vice versa).
9. Responsive/keyboard-only passes.

QA should also re-run the F10 probe assertions that F12 could plausibly break: `GET /internal/criteria/:courseId` still verbatim, and a criteria row authored via `POST /criteria/json` grades correctly through `POST /internal/gradings`.

---

# 10. Assumptions

1. **A1 — `POST /criteria/json` belongs to F12.** F10 built the template CRUD but deliberately left this route (its notes say "F12 is its only writer" of `templateKey`); design Phần 8 lists it in the same bullet as the template routes. Without it Drawer 2 cannot save, so F12 carries a core-api slice. If the orchestrator prefers a separate backend feature, this section is liftable verbatim.
2. **A2 — No migration is needed.** `Criteria.templateKey` (nullable, no FK) and `Criteria.sourceFilename` (nullable) both already exist. **No DBA involvement.**
3. **A3 — No infra change.** Both new routes ride the existing core-api HTTP surface; no port, env var, secret, volume or compose change. **No DevOps involvement.**
4. **A4 — `locked` applies to everyone in Drawer 2** (AC-19.5), including admins, with a pointer to Drawer 1. A deliberate simplification; reversible if the centre objects.
5. **A5 — The preview shows the *audio* variant by default**; the transcript-only (pilot) variant is offered behind a toggle because `build_system_instruction_text` shares all four rendering helpers, making the second port nearly free.
6. **A6 — Client-side level validation warns but does not block** (AC-13.3), so a port bug can never make a legal rubric unsavable.
7. **A7 — The band-row cap is 50** and the template-list cap is 200 without pagination; both are stated so QA can test the boundary rather than discover it.
8. **A8 — The `en` locale is a genuine translation**, not a copy of the `vi` strings; QA checks for Vietnamese leakage in `en`.

# 11. Dependencies

- **Upstream, all DONE:** F8 (v2 shape + `normalizeRubric`), F9 (`maxTotal`/`validateLevels` semantics + `lib/rubric-scoring.ts`), F10 (templates, privileges, `assertAuthorableRubric`, `GET /auth/me` privileges, `Criteria.templateKey`).
- **Sideways:** F11 authors `student_reply.buttons` *values* through Drawer 1; F11 owns their *behaviour*. If F11 later closes the button action set, that rule goes into `assertAuthorableRubric` (one function, both authoring gates) — not into F12's UI.
- **Roles needed:** UX (largest visual surface in the doc — two drawer flows + a new primitive; must reuse F3 tokens), frontend, backend (the core-api slice), QA. **DBA: not needed. DevOps: not needed.**

# 12. Traceability

| PM story | FRs |
| :-- | :-- |
| US1 Drawer 1 | FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-22 |
| US2 Drawer 2 + prompt preview | FR-01, FR-02, FR-03, FR-05, FR-07, FR-08, FR-09, FR-10, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22 |
| US3 i18n parity | FR-23 |
| US4 responsive + keyboard | FR-05 (AC-05.5…05.9), FR-24 |
| (PM out-of-scope guard) | FR-04, NFR-01 |

## Blockers / open questions

None blocking. Three decisions taken here that the project owner may want to revisit — recorded so they are decisions, not accidents:

- **OQ-1** AC-19.5 — `locked` applies to admins too inside Drawer 2. Alternative: an "unlock" affordance for `rubric_template` holders. I chose the simpler rule; changing it is a one-flag change plus a test-matrix row.
- **OQ-2** F10 QA's carried-forward note: "step must divide the scale" is deliberately **not** a rejection (it would newly reject legal input). F12 answers it with the advisory hint of AC-13.5. If the centre wants a hard rejection, that is a new AC on `assertAuthorableRubric`, not an F12 change.
- **OQ-3** F10 QA also asked BA to reword FR-19's "runs on the normalized rubric" phrasing. Recorded here for the record: `assertAuthorableRubric` **owns** normalization and applies the three numeric `scale` rules to the **authored** values. AC-01.2/01.3 are written against that (correct) behaviour.

## Notes for the next role

- **UX:** two drawer flows plus `drawer.tsx`/`confirm-dialog.tsx`. Reuse F3's tokens and `components/icons.tsx`; no icon package. The two layouts that need real design attention are Drawer 2's **two-pane** form + prompt preview at `lg`+ (stacking below `lg`) and the **band grid** (FR-16), which is the feature's headline interaction.
- **Backend:** your slice is FR-01…FR-04. Two things decide whether QA passes you: (a) `assertAuthorableRubric(body.rubric)` on the **raw** body, proven by AC-01.3's behavioural test — do not reintroduce F10's DEF-1; (b) the FR-03 drift guard wired in **both** languages, provable by AC-03.8's reverse patch. Declare both new routes **before** `@Get(':id')`.
- **Frontend:** `lib/rubric.ts` must be a **port** of F9's `maxTotal`/`validateLevels`, not a re-derivation (F9 said so explicitly); the client returns issue *codes* and localizes them, while a server 400's Vietnamese `issue.message` is shown verbatim. The single subtlest requirement is **AC-21.4/21.5/21.6** — dirty-check form-model against form-model, never GET-response against draft, because reads are normalized and stored rows are raw (F10 QA OBS-3). And the prompt pane renders a server string: no prompt text may exist in the dashboard at all.
- **QA:** §9 is your split. The highest-value manual checks are AC-21.6 (v1-era row ⇒ not dirty), AC-10.3 (five-actor visibility matrix), AC-16.5/16.6 (band grid widen/narrow), AC-22.3 (all four 409 strings) and AC-23.2 (dead-key grep). The highest-value automated check is AC-03.8.
