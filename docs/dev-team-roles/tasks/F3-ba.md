# F3 · BA — Dashboard UI redesign: behavior inventory & acceptance criteria

- **Owner role:** ba
- **Feature:** F3 — Reskin all 9 dashboard pages + shell with Tailwind + shadcn/ui. UI-only, no backend changes.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F3-pm.md`

> Written by the orchestrator from the ba agent's output: the `ba` role agent is read-only and cannot Write its own task file.

## Checklist

- [x] Read `F3-pm.md` (11 stories S1–S11, DoD, assumptions, risks)
- [x] Read `src/App.tsx`, `src/main.tsx`, `src/api/client.ts`, `src/auth/AuthContext.tsx`, `src/i18n/index.ts`
- [x] Read all 9 pages and record every API call, control, conditional render, role gate, i18n key, local-state rule
- [x] Cross-check each dashboard call against the core-api controller that serves it (auth/role behavior)
- [x] Produce numbered acceptance criteria (AC-01…AC-52) executable by QA
- [x] Classify every AC as code-review / build / browser verification
- [x] Record assumptions, quirks-to-preserve, open questions

---

## 0. Scope note & global facts

**Files in scope (13):** `index.html`, `src/main.tsx`, `src/App.tsx`, `src/api/client.ts`, `src/auth/AuthContext.tsx`, `src/i18n/index.ts`, `src/pages/{Login,Settings,Onboarding,Students,Submissions,SubmissionDetail,Reports,Criteria,Monitoring}.tsx`. Plus new build config (`tailwind.config.*`, `postcss.config.*` or `@tailwindcss/vite`, `src/index.css`, `src/components/ui/*`, `src/lib/utils.ts`) and `package.json`. `Dockerfile`, `infra/docker-compose.yml`, `infra/Caddyfile`, `vite.config.ts` proxy: unchanged unless a path alias is added.

**Transport layers — three distinct ones, all must survive:**

| Layer | Where | Rule |
|---|---|---|
| `api/client.ts` (`fetch('/api'+path, {credentials:'include', headers:{'Content-Type':'application/json'}})`, throws `ApiError(status)` on `!res.ok`, returns `undefined` on 204) | every JSON call | unchanged; do not add interceptors, retries, toasts, or abort logic |
| raw `fetch('/api/criteria', {method:'POST', credentials:'include', body: FormData})` — **no** `Content-Type` header | `Criteria.tsx:44` | must stay raw; browser must set the multipart boundary |
| plain `<a href=\"/api/...\">` and `<audio controls src=\"/api/media/:id\">` — same-origin cookie auth | `Reports.tsx:66,67,90,91,112,113`; `SubmissionDetail.tsx:92` | must stay declarative; no JS fetch+blob, no custom player |

**Global behavioral facts (true of every page today — preserve unless an AC says otherwise):**
- No polling, no auto-refresh, no websockets anywhere. Every list refetches only on mount or on its own dependency change.
- No error state is rendered for any GET except Criteria upload and Login. A failed GET leaves the page in its initial (empty/blank) state; the `ApiError` rejects an unhandled promise (`void api.get(...)`) and lands in the console. **Do not add error UI** — that is new behavior; log it as a follow-up instead.
- No loading spinner exists on any page. `ProtectedShell` renders `null` while `AuthContext.loading` is true (`App.tsx:19`); `SubmissionDetail` renders `null` until data arrives (`SubmissionDetail.tsx:84`).
- No confirmation dialog exists for any destructive action (including delete-media and DLQ retry). Do not add one.
- i18n: `lng: 'vi'`, `fallbackLng: 'vi'`, `escapeValue: false`. **There is no language switcher in the UI** — `en` is reachable only by editing `lng` or calling `i18n.changeLanguage('en')` from the console. Adding a switcher is out of scope (PM: no new features).
- ~107 translation keys per locale. Two use interpolation: `monitoring.diskAlert` (`{{pct}}`, `{{at}}`) and `submissions.pilotProviderModel` (`{{provider}}`, `{{model}}`, `{{createdAt}}`).
- One **cross-page key reuse**: `SubmissionDetail.tsx:116` labels its review Save button with `t('students.save')`. Looks like a bug; it is current behavior. Keep the same key (or if changed, add the new key to both locales — but prefer keeping it, so QA's key inventory stays stable).

**Server-side role gating (context for QA, not changeable):** `/settings/*` and `/monitoring/*` and `/dlq/*` are `@Roles('admin')`; `DELETE /submissions/:id/media` is `@Roles('admin')`; everything else dashboard-facing is `SessionAuthGuard` only (admin+staff).

---

## 1. Per-page behavior inventory

### 1.1 `src/App.tsx` — `ProtectedShell` + routes (S2)

| Aspect | Detail |
|---|---|
| API | none directly. `useAuth()` consumes `AuthContext`, which fires `GET /api/auth/me` once on app mount (`AuthContext.tsx:23`) and `POST /api/auth/logout` (no body) on logout (`AuthContext.tsx:36`). |
| Guard order (`App.tsx:19-22`) | 1) `loading` → render `null` (blank, **no** spinner, **no** redirect). 2) `!user` → `<Navigate to=\"/login\" replace />`. 3) `adminOnly && role !== 'admin'` → `<Navigate to=\"/students\" replace />`. Order matters: an unauthenticated hit on `/settings` goes to `/login`, not `/students`. |
| Routes | `/login` (unwrapped) · `/monitoring` **adminOnly** · `/settings` **adminOnly** · `/onboarding` · `/students` · `/submissions` · `/submissions/:id` · `/reports` · `/criteria` · `*` → `<Navigate to=\"/students\" replace />`. |
| Nav (order is current, may be re-laid-out but all 7 links + logout must remain) | `nav.monitoring` (admin only), `nav.settings` (admin only), `nav.onboarding`, `nav.students`, `nav.submissions`, `nav.reports`, `nav.criteria`, then a `<button>` `nav.logout`. |
| Logout control | `logout().then(() => navigate('/login'))` — `POST /api/auth/logout`, clears context user, then client-side navigate to `/login`. Not `replace`. |
| Conditional render | `user.role === 'admin'` gates exactly the two nav links (`App.tsx:27-28`). Nothing else in the shell is role-gated. |
| i18n keys (8) | `nav.monitoring`, `nav.settings`, `nav.onboarding`, `nav.students`, `nav.submissions`, `nav.reports`, `nav.criteria`, `nav.logout` |
| Preserve | Shell renders `<nav>` + `{children}`; each page supplies its own `<main>`. If the reskin moves `<main>` into the shell, no page may end up with two `<main>` landmarks. |

### 1.2 `Login.tsx` (S3)

| Aspect | Detail |
|---|---|
| API | `POST /api/auth/login` body `{ email, password }` via `AuthContext.login` → `api.post` (`AuthContext.tsx:31`). Response `{email, role}` stored in context. |
| Controls | `<input type=\"email\" required>` (controlled), `<input type=\"password\" required>` (controlled), `<button type=\"submit\">`. Native HTML5 `required` validation is the only client-side validation — no length/format checks. Submit is never disabled; no in-flight lock (double-submit is possible today). |
| Success | `navigate('/settings')` (`Login.tsx:19`) — **not** `/students`. For a staff user this immediately bounces to `/students` via `ProtectedShell`. Net effect: **admin lands on `/settings`, staff lands on `/students`.** This contradicts PM assumption 2; per \"behavior identical\", **keep `navigate('/settings')` as-is** (see Open questions). |
| Error | `catch` → `setError(t('login.error'))`, rendered as `<p role=\"alert\">`. Error is cleared at the start of each submit. Any thrown error (network, 500) shows the same \"invalid credentials\" text. |
| Conditional render | error paragraph only. No loading state. |
| i18n keys (5) | `login.title`, `login.email`, `login.password`, `login.submit`, `login.error` |
| Preserve | `role=\"alert\"` on the error node; `type=\"email\"`/`type=\"password\"`; `required` on both inputs. |

### 1.3 `Settings.tsx` (S4) — admin-only route

| Aspect | Detail |
|---|---|
| API | `GET /api/settings` → `SettingView[] = {key, kind:'string'|'boolean'|'number', masked, value}` (`Settings.tsx:19`). `PUT /api/settings/:key` body `{ value }` (`Settings.tsx:27`), then `load()` refetch. One PUT per row-Save click; no bulk save. |
| Value coercion (`Settings.tsx:26`) | `raw = drafts[key] ?? ''`; `boolean` → `raw === 'true'`; `number` → `Number(raw)`; else the raw string. **This exact coercion must survive** (core-api mirrors the raw string to Redis `config:*`). |
| Controls per row | `kind==='boolean'` → `<select>` with exactly two options `true`/`false`, `defaultValue={String(value ?? '')}` (uncontrolled). Otherwise `<input>` with `type = masked ? 'password' : kind==='number' ? 'number' : 'text'`, `placeholder = masked && value ? String(value) : ''` (the last-4 mask), `defaultValue = masked ? '' : String(value ?? '')` (uncontrolled). Plus a per-row Save `<button>` (never disabled). |
| Conditional render | Empty settings array → an empty `<table>` (no empty-state copy). `savedKey === s.key` → inline `settings.saved` badge; only **one** row can show it at a time and it persists after the refetch until another row is saved. |
| Known quirks — preserve, do not \"fix\" | (a) Saving a row the user never typed in sends `''` for string/masked and `false` for boolean (draft is absent). (b) For a masked key this blanks the stored secret. (c) `defaultValue` on uncontrolled inputs means a refetch does **not** visually reset a field the user edited (React keeps DOM value; keys are stable so no remount). Any of these changing is a behavior regression, even though (a)/(b) look like bugs. |
| i18n keys (3) | `settings.title`, `settings.save`, `settings.saved`. Setting **keys themselves are raw strings from the API** and are not translated — keep displaying `s.key` verbatim. |

### 1.4 `Onboarding.tsx` (S5)

| Aspect | Detail |
|---|---|
| API | `GET /api/onboarding/pending` → `ZaloBinding[] = {id, zaloUserId, displayName, status}` (`Onboarding.tsx:19`). `PATCH /api/onboarding/:id/activate` body `{ phone }` (`Onboarding.tsx:28`), then `load()` refetch. |
| Controls | One `<form>` per binding row containing `<input type=\"tel\" required placeholder={t('onboarding.phone')}>` (uncontrolled, tracked into `phoneDrafts[id]` on change) and a submit `<button>`. Submit is guarded by `if (!phone) return;` after `preventDefault()` — i.e. an empty draft silently no-ops even though `required` should have blocked it. |
| Conditional render | `pending.length === 0` → `<p>{t('onboarding.empty')}</p>` (the empty state; the `<ul>` still renders, empty). Row label = `displayName ?? zaloUserId` in `<strong>`, followed by `(zaloUserId)` in parens — **both** shown even when displayName is null (yields `u1 (u1)`); preserve. `activatedId === b.id` → inline `onboarding.activated`; single-slot, persists after refetch. |
| Error | none. A failed PATCH (phone not matching any student → 4xx) rejects unhandled; the row simply stays. Do not add an error toast. |
| i18n keys (5) | `onboarding.title`, `onboarding.empty`, `onboarding.phone` (used as a **placeholder**), `onboarding.activate`, `onboarding.activated` |

### 1.5 `Students.tsx` (S6)

| Aspect | Detail |
|---|---|
| API | `GET /api/students?page={page}[&search={search}]` — built with `URLSearchParams`, `search` omitted entirely when empty (`Students.tsx:31-33`). Response `{items, page, pageSize, total}`. `PATCH /api/students/:id` body = `draft` (`Students.tsx:39`), then clear editing + draft + `load()`. |
| **Partial-patch semantics (critical)** | `draft` starts `{}` and only gains a key when that specific input fires `onChange`. So the PATCH body contains **only the fields the user actually edited**. Editing only the phone sends `{phone}`. Editing nothing sends `{}`. Any reskin that switches to controlled inputs seeded from the row would send all five fields — **that is a payload change and fails F3**. |
| Search | Controlled `<input type=\"search\">`; every keystroke sets `page=1` and `search`, and `useEffect(load,[page,search])` fires a request **per keystroke — no debounce**. Adding a debounce changes the request pattern; out of scope, keep as-is. |
| Row modes | Read mode: `code`, `fullName`, `phone`, `className`, `status` as text + `students.edit` button (sets `editingId`, resets `draft` to `{}`). Edit mode: `code` stays **read-only text**; `fullName`, `phone`, `className` (`defaultValue={s.className ?? ''}`), `status` become uncontrolled `<input>`s; the action cell shows `students.save`. Only one row can be in edit mode. There is **no Cancel control** — the only exits are Save or navigating away. Do not add Cancel. |
| Not rendered | `campus` exists on the `Student` type but is never displayed or edited. |
| Pagination | `totalPages = data ? max(1, ceil(total/pageSize)) : 1`. Prev `disabled={page<=1}`, label `←`; `{page} / {totalPages}` text; Next `disabled={page>=totalPages}`, label `→`. When `data` is null both are disabled and it reads `1 / 1`. Arrow glyphs are decorative, not i18n keys — if replaced with icons, add `aria-label`s (new copy → both locales). |
| Conditional render | No loading state, no empty state — `data?.items.map` on null/empty yields an empty `<tbody>`. |
| i18n keys (9) | `students.title`, `students.search` (placeholder), `students.code`, `students.fullName`, `students.phone`, `students.className`, `students.status`, `students.edit`, `students.save` |

### 1.6 `Submissions.tsx` (S7)

| Aspect | Detail |
|---|---|
| API | `GET /api/submissions?page={page}[&status={status}]` (`Submissions.tsx:31-33`); `status` omitted when `''`. Response `{items, page, pageSize, total}` where each item is `{id, kind, status, receivedAt, student:{id,fullName,className}|null, grading:{id,autoSent,sentAt}|null}`. |
| Filter | `<select>` (controlled) inside a `<label>`. Options: `submissions.all` (value `''`) plus the **hardcoded** list `['received','processing','graded','awaiting_review','sent','failed']` (`Submissions.tsx:22`) rendered with **raw untranslated values** as their labels. Changing the filter resets `page` to 1. Keep the list, the values, and the untranslated labels (no new status i18n keys unless added to both locales). |
| Row rendering | Student cell: `` `${student?.fullName ?? '—'} ${student?.className ? `(${className})` : ''}` `` — em-dash for a null student. `kind` and `status` raw. `receivedAt` via `new Date(x).toLocaleString()` (browser-locale, not i18n-formatted). Action cell: react-router `<Link to={'/submissions/'+id}>` labelled `submissions.view` — must stay a `<Link>` (real anchor, ctrl-click/open-in-new-tab works), not a `useNavigate` button. |
| Unused data | `item.grading` is fetched but never rendered. Don't \"helpfully\" surface it — new UI is scope creep, though a status badge styling of `status` is fine. |
| Pagination | Identical to Students (§1.5). |
| Conditional render | None besides the row map. No loading/empty/error states. |
| i18n keys (8) | `submissions.title`, `submissions.filterStatus`, `submissions.all`, `submissions.student`, `submissions.kind`, `submissions.status`, `submissions.receivedAt`, `submissions.view` |

### 1.7 `SubmissionDetail.tsx` (S8) — highest-risk page

| Aspect | Detail |
|---|---|
| API — read | `GET /api/submissions/:id` (route param) → `{id, kind, status, mediaPath, mediaDeletedAt, student:{id,fullName}|null, grading:Grading|null, flags:Flag[], pilotTextGrading:PilotTextGrading|null}`. On load, `draft` is seeded to `grading.reviewedFeedback ?? grading.llmFeedback ?? ''` (`SubmissionDetail.tsx:58`). Refetched via `load()` after every mutation. |
| API — write | `PATCH /api/gradings/{grading.id}` body `{ reviewedFeedback: draft }` (guarded by `if (!data?.grading) return`) · `POST /api/gradings/{grading.id}/send` **no body** · `DELETE /api/submissions/{id}/media` (uses the **route param `id`**, not `data.id`). Each sets `message` then `load()`. |
| Media player | `data.mediaPath && !data.mediaDeletedAt` → `<audio controls src={'/api/media/' + data.id} style={{width:'100%'}} />` (uses **`data.id`**, not the route param). Else → `<p>{t('submissions.noMedia')}</p>`. **Must remain a native `<audio controls src>`** with a same-origin `/api/...` URL. |
| Blank-until-loaded | `if (!data) return null` (`:84`) — the entire page, including the back link, is absent until the GET resolves, and stays absent forever if it fails. Preserve. |
| Back link | `<Link to=\"/submissions\">{t('submissions.back')}</Link>`; the key's value already contains the `←` glyph. |
| Title | `<h1>{data.student?.fullName ?? '—'}</h1>`. |
| **Audio/official panel — only when `data.grading` is truthy** (`:97`) | Headings `submissions.pilotAudioTitle` then `submissions.scores`; `<ul>` of `Object.entries(grading.scores)` as `**dimension**: score — comment`; `submissions.llmFeedback` + `<p>{grading.llmFeedback}</p>`; `submissions.reviewedFeedback` + **controlled** `<textarea rows={5}>` bound to `draft`. |
| Action buttons (inside the grading block) | Save → `saveReview()`, label `t('students.save')`, never disabled. Send → `send()`, label `submissions.send`, **`disabled={!!data.grading.sentAt}`**. Delete media → rendered only when `user?.role === 'admin' && data.mediaPath && !data.mediaDeletedAt` (`:120`), label `submissions.deleteMedia`, **no confirmation**. Note the nesting: because these live inside `data.grading && …`, an ungraded submission shows **no** delete-media button even for an admin. Preserve that nesting exactly. |
| Status message | `message && <p>{message}</p>` — a single slot set to `t('students.save')` / `t('submissions.sent')` / `t('submissions.mediaDeleted')`. Never cleared. |
| **Pilot panel (F2) — only when `data.grading && data.pilotTextGrading`** (`:127`) | Heading `submissions.pilotTextTitle`; a highlighted notice box `submissions.pilotNotSentNotice`; a comparison `<table>` whose rows iterate **`Object.keys(data.grading.scores)`** (audio dimensions, *not* pilot dimensions) with columns `pilotScoreDimension`/`pilotScoreAudio`/`pilotScoreText`/`pilotScoreDelta`; delta = `audio - text` when both are numbers, rendered `+n` / `n`, else `—`; missing score → `—`. Then `pilotLlmFeedback` + `<p>`; `pilotTranscript` + a scrollable (`maxHeight:200, overflowY:auto`) `<pre style={{whiteSpace:'pre-wrap'}}>`; then a de-emphasized `pilotProviderModel` line interpolating `provider`, `model`, `createdAt` (`toLocaleString()`). |
| **F2 hard rule** | This entire `<section>` contains **zero** interactive controls today: no `<button>`, `<input>`, `<textarea>`, `<select>`, `<a>`, `onClick`, `contentEditable`. It must contain zero after the reskin. The notice box may be restyled (e.g. shadcn `Alert`) **only if that component renders no dismiss button**. The transcript stays a read-only scroll region — no copy button, no \"expand\" toggle, no edit affordance. |
| Flags | `data.flags.length > 0` → heading `submissions.flags` + `<ul>` of `f.reason`. `resolvedAt` is in the type but never rendered. Empty flags → nothing at all (no empty-state copy). |
| i18n keys (17 own + 1 borrowed) | `submissions.back`, `submissions.noMedia`, `submissions.pilotAudioTitle`, `submissions.scores`, `submissions.llmFeedback`, `submissions.reviewedFeedback`, `submissions.send`, `submissions.sent`, `submissions.deleteMedia`, `submissions.mediaDeleted`, `submissions.flags`, `submissions.pilotTextTitle`, `submissions.pilotNotSentNotice`, `submissions.pilotScoreDimension`, `submissions.pilotScoreAudio`, `submissions.pilotScoreText`, `submissions.pilotScoreDelta`, `submissions.pilotLlmFeedback`, `submissions.pilotTranscript`, `submissions.pilotProviderModel`, **plus `students.save`** |

### 1.8 `Reports.tsx` (S9)

| Aspect | Detail |
|---|---|
| API (3 GETs, fired together on mount and on **every** `from`/`to` change) | `GET /api/reports/submission-rate?from={from}&to={to}` · `GET /api/reports/cost?from&to` · `GET /api/reports/pilot-comparison?from&to`. Query string is hand-built (`Reports.tsx:43`), not `URLSearchParams` — keep the exact `?from=…&to=…` shape and ordering. |
| Default range | `from = daysAgo(30)`, `to = daysAgo(0)`, both `YYYY-MM-DD` from `toISOString().slice(0,10)` (UTC-based). |
| Date controls | Two `<input type=\"date\">`, controlled. No validation that `from <= to`; no clamping. Must remain native date inputs producing `YYYY-MM-DD` (a JS datepicker that emits a different format is a payload change). |
| Export links (6) | `<a href={`/api/reports/${kind}/export?format=${format}&from=${from}&to=${to}`}>` for kind ∈ {`submission-rate`,`cost`,`pilot-comparison`} × format ∈ {`csv`,`xlsx`}, labelled `reports.exportCsv` / `reports.exportXlsx`. **No `download` attr, no `target`, no `rel`.** Must stay plain anchors (cookie auth + `Content-Disposition` from core-api). Adding `download` or converting to fetch+blob fails F3. The `{' | '}` separator between the pair is decorative and may change. |
| Table 1 — submission rate | Columns `reports.class`/`total`/`submitted`/`rate`; cells `className`, `totalStudents`, `submittedStudents`, `` `${ratePercent}%` ``; `key={r.className}`. |
| Table 2 — cost | Columns `reports.date`/`provider`/`totalUsd`; cells `date`, `provider`, `` `$${r.totalUsd.toFixed(4)}` `` (**4 decimals, literal `$` prefix**); `key={date}-{provider}`. |
| Table 3 — pilot comparison | Columns `reports.class`/`student`/`dimension`/`scoreAudio`/`scoreText`/`scoreDelta`. Row expansion logic (`Reports.tsx:126-140`): for each API row, dimensions are derived from the row's own keys starting with `audio_`, and each dimension emits one `<tr>` reading `r['audio_'+dim]`, `r['text_'+dim]`, `r['delta_'+dim]`; `key={submissionId}-{dim}`. Cell for student uses `studentName` (not `studentCode`, which is fetched but unused). Preserve this derivation exactly. |
| Conditional render | None. All three tables render headers with empty bodies when there's no data. No loading/empty/error state. |
| i18n keys (20) | `reports.title`, `submissionRate`, `cost`, `from`, `to`, `exportCsv`, `exportXlsx`, `class`, `total`, `submitted`, `rate`, `date`, `provider`, `totalUsd`, `pilotComparison`, `student`, `dimension`, `scoreAudio`, `scoreText`, `scoreDelta` |

### 1.9 `Criteria.tsx` (S10)

| Aspect | Detail |
|---|---|
| API — list | `GET /api/criteria?courseId={courseId}` (`Criteria.tsx:31`), **guarded by `if (!courseId) return;`** — never fired with an empty id (core-api's `ParseIntPipe` would 400). Triggered only by the `criteria.load` button and after a successful upload. |
| API — classes | `GET /api/classes-config` on mount → `{className, advisorZaloId, autoSend}[]`. |
| **API — upload (highest-risk)** | `Criteria.tsx:40-51`: `e.preventDefault()`; `new FormData(e.currentTarget)`; `fetch('/api/criteria', {method:'POST', credentials:'include', body: form})` — **no `Content-Type` header, not routed through `api/client.ts`**. The payload depends entirely on the two `name` attributes inside the form: `name=\"courseId\"` (`<input type=\"number\" required placeholder={t('criteria.courseId')}>`) and `name=\"file\"` (`<input type=\"file\" accept=\".docx\" required>`). core-api reads `FileInterceptor('file')` + `body.courseId` — **if the reskin drops either `name`, or replaces the file input with a hidden-input/label pattern that isn't inside the `<form>`, upload silently breaks with a 400.** |
| Upload result | Non-OK → `body.message` from the JSON error (fallback `` `Upload failed: ${res.status}` ``) into `<p role=\"alert\">`; error cleared at the start of each submit. OK → `loadCriteria()`, which **does nothing unless the separate `courseId` *state* (the second, non-form input) is set** — a real quirk: uploading does not refresh the list unless you'd already loaded one. Preserve. |
| API — class config save | `PUT /api/classes-config/{className}` body `{ advisorZaloId: draft.advisorZaloId ?? existing?.advisorZaloId ?? '', autoSend: draft.autoSend ?? existing?.autoSend ?? false }` — **always sends both fields** (unlike Students' partial patch), merging the draft over the current row. Then `loadClasses()`. |
| Controls | Upload form (2 inputs + submit `criteria.uploadButton`) · courseId lookup `<input type=\"number\">` (controlled) + `criteria.load` button · per-criteria-item `criteria.preview` button (sets `preview` to that item's `rubric`) · per-class row: uncontrolled `<input defaultValue={advisorZaloId}>`, uncontrolled `<input type=\"checkbox\" defaultChecked={autoSend}>`, and a `criteria.save` button. No button is ever disabled; no in-flight lock. |
| Conditional render | `uploadError && <p role=\"alert\">` · criteria `<ul>` rows read `` `${t('criteria.version')} ${c.version} — ${c.title}` `` · `preview !== null` → `<pre>{JSON.stringify(preview,null,2)}</pre>` with **no way to close it** (preserve; adding a close button is new behavior) · classes table renders header + empty body when empty. No loading/empty states. |
| i18n keys (12) | `criteria.title`, `courseId` (used **twice**: as the upload input's placeholder and as an `<h2>`), `load`, `upload`, `uploadButton`, `version`, `preview`, `classesConfig`, `className`, `autoSend`, `advisorZaloId`, `save` |

### 1.10 `Monitoring.tsx` (S11) — admin-only route

| Aspect | Detail |
|---|---|
| API (4 GETs on mount, all refired after a retry) | `GET /api/monitoring/queues` → `{queue, mainDepth, dlqDepth}[]` · `GET /api/monitoring/token` → `{hasAccessToken, expiresAt, alert}` · `GET /api/sheets-sync/log` → `{id, runAt, rowsOk, rowsError}[]` · `GET /api/monitoring/disk` → `{alert: string|null}`. |
| API — action | `POST /api/dlq/{queue}/retry`, **no body**, then `setRetried(queue)` + `load()`. **No confirmation dialog.** |
| Queues table | Columns `monitoring.queue`/`mainDepth`/`dlqDepth` + action. Retry button **`disabled={q.dlqDepth === 0}`** (`:72`) — the single most important disabled-state on the page. `retried === q.queue` → inline `monitoring.retried`; single-slot, survives the refetch. |
| Token block | Renders only when `token` is non-null. Text = `hasAccessToken ? monitoring.tokenOk : monitoring.tokenMissing`; if `token.alert` is set, append `\" — \"` + `<strong>{t('monitoring.alert')}: {alert}</strong>`. **`token.expiresAt` is fetched but never rendered** — do not start rendering it. |
| Sheets sync | `<ul>` of `` `${new Date(runAt).toLocaleString()} — ${rowsOk} ${t('monitoring.sheetsSyncOk')}, ${rowsError} ${t('monitoring.sheetsSyncError')}` ``. Empty log → empty list, no empty-state copy. |
| Disk block | Renders only when `disk` is non-null. `alert === null` → plain `monitoring.diskOk`. Otherwise `<strong>{formatDiskAlert(alert, t)}</strong>` where `formatDiskAlert` (`:121-128`) `JSON.parse`s `{pct, at}` and interpolates `monitoring.diskAlert` with `pct` and `at.toLocaleString()`, **falling back to the raw string if parsing throws**. Keep the try/catch fallback. |
| i18n keys (17) | `monitoring.title`, `queues`, `queue`, `mainDepth`, `dlqDepth`, `retry`, `retried`, `token`, `tokenOk`, `tokenMissing`, `alert`, `sheetsSync`, `sheetsSyncOk`, `sheetsSyncError`, `disk`, `diskOk`, `diskAlert` |

---

## 2. Functional requirements (traceability)

| FR | Requirement | Story |
|---|---|---|
| FR-01 | Tailwind + hand-authored shadcn primitives are wired into the Vite/TS build and produce a working stylesheet at `/` without any network fetch beyond `npm ci`. | S1 |
| FR-02 | The shell (nav + guards) is reskinned; routes, guard order, role-gated links, and logout flow are byte-identical in behavior. | S2 |
| FR-03…FR-11 | Each of Login, Settings, Onboarding, Students, Submissions, SubmissionDetail, Reports, Criteria, Monitoring is reskinned with the behavior in §1.2–§1.10 preserved exactly. | S3–S11 |
| FR-12 (cross-cutting) | Zero change to any `/api/*` URL, method, query string, body shape, header, or cookie behavior. | all |
| FR-13 (cross-cutting) | i18n key parity vi/en; no hardcoded user-facing strings; interpolation variables unchanged. | all |
| FR-14 (product safety) | The SubmissionDetail pilot panel remains strictly non-interactive. | S8 / F2 |

**NFRs:** (N1) `docker compose build dashboard` completes on the RAM-limited host — no build step may require more than the current single `npm ci` + `vite build`. (N2) Production bundle stays a static SPA served by Caddy from the `dashboarddist` volume; no runtime Node/nginx introduced. (N3) No new runtime network dependency (no CDN fonts/CSS at page load — self-host or use system font stacks, since the VPS serves the SPA offline-of-CDN). (N4) Zero new browser-console errors or React warnings versus the pre-reskin baseline.

**Data dictionary (fields the UI writes):**

| Field | Page | Type | Required | Validation / coercion |
|---|---|---|---|---|
| `email`, `password` | Login | string | yes | HTML5 `type=email` + `required` only |
| `value` (per setting) | Settings | string \| number \| boolean | sent always | `boolean`: `raw==='true'`; `number`: `Number(raw)`; else raw string |
| `phone` | Onboarding | string | yes | `type=tel` + `required`, plus a JS `if (!phone) return` guard; no format check client-side |
| `fullName`,`phone`,`className`,`status` | Students | string | **only if edited** | none; partial patch |
| `reviewedFeedback` | SubmissionDetail | string | sent always | none; may be empty string |
| `courseId` (form field) | Criteria upload | numeric string | yes | `type=number` + `required`; server `ParseIntPipe` |
| `file` | Criteria upload | File (.docx) | yes | `accept=\".docx\"` + `required`; server rejects rubric without `pronunciation` |
| `advisorZaloId`, `autoSend` | Criteria classes | string / boolean | both sent always | none |
| `from`, `to` | Reports | `YYYY-MM-DD` | yes (defaulted) | native date input; no from≤to check |

---

## 3. Consolidated acceptance criteria (QA-executable)

Legend for the verification column in §4: **[CR]** code review / grep · **[B]** build · **[BR]** browser against a running stack.

**S1 — build foundation**
1. `services/dashboard/package.json` declares Tailwind and the shadcn support deps (`clsx`, `tailwind-merge`, `class-variance-authority`, and `tailwindcss-animate` if animations are used); `package-lock.json` is regenerated and committed.
2. Tailwind config files exist and are referenced by the build (`tailwind.config.*` + `postcss.config.*`, or the `@tailwindcss/vite` plugin in `vite.config.ts`); a single global stylesheet (e.g. `src/index.css`) is imported exactly once from `src/main.tsx`.
3. shadcn primitives are **hand-authored source files** under `src/components/ui/`. No `npx shadcn`, `shadcn-ui add`, `degit`, or `curl` appears in `package.json` scripts or the `Dockerfile` — the only network access during `docker compose build dashboard` is `npm ci` against the registry.
4. If a `@/` path alias is introduced, it is declared in **both** `tsconfig.json` `compilerOptions.paths` and `vite.config.ts` `resolve.alias`.
5. `vite.config.ts`'s `/api` dev proxy (target `http://localhost:3001`, `rewrite` stripping `/api`) is unchanged.
6. `services/dashboard/Dockerfile` still uses the two-stage build ending in the `cp -r dist/* /srv/dashboard/` one-shot; `infra/docker-compose.yml` (`restart: \"no\"`, `dashboarddist` volume) and `infra/Caddyfile` are unchanged.
7. `docker compose build dashboard` succeeds; `tsc -b && vite build` produce no errors and no new warnings. `tsconfig.json` keeps `strict`, `noUnusedLocals`, `noUnusedParameters` at `true`.
8. No CDN `<link>`/`<script>`/`@import url(https://…)` is introduced (index.html or CSS) — fonts/assets are bundled or system stacks.

**Cross-cutting — API immutability**
9. Every request URL, method, and body listed in §1 is unchanged. Specifically the 24 distinct calls: `GET /auth/me`, `POST /auth/login`, `POST /auth/logout`, `GET /settings`, `PUT /settings/:key`, `GET /onboarding/pending`, `PATCH /onboarding/:id/activate`, `GET /students?page[&search]`, `PATCH /students/:id`, `GET /submissions?page[&status]`, `GET /submissions/:id`, `DELETE /submissions/:id/media`, `PATCH /gradings/:id`, `POST /gradings/:id/send`, `GET /media/:id` (audio element), `GET /reports/submission-rate|cost|pilot-comparison?from&to`, `GET /reports/{kind}/export?format&from&to` (anchors), `GET /criteria?courseId`, `POST /criteria` (multipart), `GET /classes-config`, `PUT /classes-config/:className`, `GET /monitoring/queues|token|disk`, `GET /sheets-sync/log`, `POST /dlq/:queue/retry`.
10. `src/api/client.ts` is unchanged (or changed only cosmetically): `credentials:'include'`, the JSON `Content-Type` default, the `ApiError(status,…)` throw on `!res.ok`, and the 204→`undefined` branch all remain.
11. `Criteria.tsx` still uploads via raw `fetch('/api/criteria', {method:'POST', credentials:'include', body: FormData})` with **no** `Content-Type` header, and the form still contains inputs named exactly `courseId` and `file` **inside the same `<form>` element** that `new FormData(e.currentTarget)` reads, with `accept=\".docx\"` preserved.
12. Reports' six export links are still plain `<a href=\"/api/reports/…\">` — no `download`/`target` attributes, no `onClick` handler, no fetch+blob/`URL.createObjectURL`.
13. SubmissionDetail's player is still `<audio controls src=\"/api/media/{id}\">` — no JS player library, no blob URL, no `fetch` for the media.
14. Students' PATCH still sends **only edited fields** (empty `{}` when nothing was edited) — verified by observing the request body after editing exactly one cell.
15. Criteria's `PUT /classes-config/:className` still sends **both** `advisorZaloId` and `autoSend` on every save.
16. Settings' PUT body is still `{ value }` with the boolean/number/string coercion of `Settings.tsx:26` intact.
17. Reports' query strings are still `?from=YYYY-MM-DD&to=YYYY-MM-DD` (and exports `?format=…&from=…&to=…`), produced by native `<input type=\"date\">`.
18. No new request is introduced anywhere (no polling/`setInterval`, no prefetch, no retry-on-error), and no existing request is removed or debounced — Students still fires one `GET /students` per search keystroke.

**Cross-cutting — i18n**
19. Every `t('…')` key listed in §1 is still present in the source and still resolves; no key is orphaned by the reskin.
20. The vi and en resource blocks in `src/i18n/index.ts` contain the **same key set** (currently ~107 each); any new copy (aria-labels, tooltips, icon-button labels, empty states) is added to **both**.
21. No hardcoded user-facing string is introduced in any page/component. (Non-translated data echoed from the API — setting keys, submission `status`/`kind` values, queue names, class names, dimension names — stays untranslated, as today.)
22. Interpolation is preserved: `monitoring.diskAlert` still receives `{pct, at}`; `submissions.pilotProviderModel` still receives `{provider, model, createdAt}`.
23. `i18n.init` still uses `lng:'vi'`, `fallbackLng:'vi'`, `escapeValue:false`. No language switcher is added (out of scope).

**Cross-cutting — role gating & routing**
24. Admin sees the `nav.monitoring` and `nav.settings` links; staff sees neither, and sees the other five links plus logout.
25. Staff navigating directly to `/monitoring` or `/settings` is redirected to `/students` (replace); admin is not.
26. An unauthenticated user hitting **any** protected route (including `/settings`) is redirected to `/login`, not `/students` — the `!user` check still precedes the `adminOnly` check.
27. While `AuthContext.loading` is true, `ProtectedShell` renders nothing (no flash of the login page, no spinner introduced that changes redirect timing).
28. An unknown path (e.g. `/nope`) still redirects to `/students`.
29. Logout calls `POST /auth/logout`, clears the user, and navigates to `/login`.
30. Post-login navigation still targets `/settings` (`Login.tsx:19`) — net effect admin→`/settings`, staff→bounced to `/students`.
31. The SubmissionDetail delete-media button appears **only** for `role==='admin'` **and** `mediaPath` set **and** `mediaDeletedAt` null **and** `grading` non-null; staff never sees it.

**Per-page behavior (each = \"reskin applied AND behavior per §1 identical\")**
32. **Shell:** all 7 nav destinations reachable; nav present on every protected page and absent on `/login`; exactly one `<main>` landmark per page.
33. **Login:** both inputs `required` with `type=email`/`type=password`; wrong credentials render the `login.error` text in a `role=\"alert\"` node; the message clears on the next submit attempt.
34. **Settings:** one PUT per row Save; boolean rows render a two-option true/false control; masked rows render a password-type field whose placeholder is the masked value and whose value starts empty; the `settings.saved` marker appears on the saved row only and persists after the refetch; the untouched-row-sends-empty quirk is unchanged.
35. **Onboarding:** empty list shows `onboarding.empty`; each row shows `displayName ?? zaloUserId` followed by `(zaloUserId)`; activation posts `{phone}` to the correct binding id; the `onboarding.activated` marker shows on that row; an empty phone no-ops.
36. **Students:** search box filters (one request per keystroke, `page` reset to 1); Edit switches exactly one row into edit mode with `code` read-only and no Cancel control; Save patches only edited fields and exits edit mode; pagination shows `{page} / {totalPages}` with Prev disabled at page 1 and Next disabled on the last page (both disabled and `1 / 1` before data loads).
37. **Submissions:** status `<select>` contains `submissions.all` plus the six raw status values; changing it resets to page 1 and adds/removes `&status=`; the student cell renders `—` for a null student and appends `(className)` when present; `receivedAt` uses `toLocaleString()`; the View action is a real `<Link>` to `/submissions/:id`; pagination as in AC-36.
38. **SubmissionDetail:** blank until loaded; back link present; audio player vs `submissions.noMedia` switches on `mediaPath && !mediaDeletedAt`; the whole grading block is absent when `grading` is null; scores list renders every dimension with score and comment; the review textarea is seeded `reviewedFeedback ?? llmFeedback ?? ''`; Save patches `{reviewedFeedback}`; **Send is disabled when `sentAt` is set** and enabled otherwise; the single status-message slot shows after each action; flags section appears only when `flags.length > 0`.
39. **SubmissionDetail / F2 (hard safety assertion):** when `pilotTextGrading` is present the pilot section renders (notice box, comparison table over the **audio** grading's dimension keys with `+n`/`n`/`—` deltas, pilot feedback, scrollable read-only transcript `<pre>`, provider/model line) **and contains zero interactive elements** — no `<button>`, `<input>`, `<textarea>`, `<select>`, `<a>`, `role=\"button\"`, `onClick`, `contentEditable`, or dismissible alert. When `pilotTextGrading` is null the section is absent; when `grading` is null the pilot section is absent even if `pilotTextGrading` exists.
40. **Reports:** default range is the last 30 days in `YYYY-MM-DD`; changing either date refires all three GETs; three tables render with the exact columns and formatting of §1.8 (rate as `n%`, cost as `$0.0000` with 4 decimals, pilot rows expanded one-per-`audio_*`-dimension); all six export anchors carry the correct `kind`/`format`/`from`/`to`.
41. **Reports downloads:** clicking each of the 6 links downloads a non-empty file with the server's filename (`.csv` / `.xlsx`) using the session cookie — no auth prompt, no 401, no blob-generated filename.
42. **Criteria:** upload of a valid `.docx` succeeds and a rejected rubric (e.g. missing `pronunciation`) renders the server's `message` in a `role=\"alert\"` node; the error clears on the next submit; the courseId lookup + `criteria.load` populates the version list; `criteria.preview` renders the rubric JSON in a `<pre>` that has no close control; the classes table saves both fields per row.
43. **Monitoring:** all four sections render; the Retry button is **disabled when `dlqDepth === 0`** and enabled otherwise; retrying posts to `/dlq/{queue}/retry`, shows `monitoring.retried` on that row, and refreshes all four datasets; the token line shows ok/missing plus the alert suffix when present (and never renders `expiresAt`); the disk line shows `diskOk` for a null alert, the interpolated `diskAlert` for a `{pct,at}` JSON alert, and the raw string when the alert isn't valid JSON.

**Cross-cutting — quality**
44. No new browser-console error or React warning on any of the 9 pages (compare against a pre-reskin baseline capture).
45. No page introduces a second scrollbar / clipped content at 1280×800 and 1440×900; tables remain readable (horizontal scroll is acceptable, content loss is not).
46. Keyboard: every control reachable by Tab with a visible focus ring; the Login form still submits on Enter; disabled buttons (Send when sent, Retry at depth 0, pagination ends) are not focus-activatable.
47. Form semantics preserved: labels associated with their inputs, `role=\"alert\"` retained on Login and Criteria error nodes.
48. No page component performs data mutation on mount; the only effects are the reads listed in §1.
49. No dead i18n keys and no dead page files left behind; nothing in `src/` is unreferenced (`noUnusedLocals` will catch locals, not files — check by grep).
50. `git diff` touches only `services/dashboard/**` (plus this task file family). No file under `services/core-api/`, `services/zalo-gateway/`, `services/grading-worker/`, `prisma/`, or `infra/` is modified.
51. `TASKS.md` is updated when F3 completes (repo convention).
52. Full stack sanity: `docker compose up -d --build` brings the stack up, `dashboard` exits 0, and the SPA loads at `/` through Caddy with deep links (`/submissions/1`) resolving via the `try_files … /index.html` fallback.

---

## 4. Verification approach for QA (no automated dashboard suite)

**A. Baseline capture first (do this before Dev starts, on the current `main`).** Bring the stack up (`cd infra; docker compose up -d`), log in as admin and as staff, and capture for each of the 9 pages: (i) a screenshot, (ii) the DevTools Network log filtered to `/api` (method + full URL + request payload), (iii) the console log. This baseline is the ground truth for AC-09…AC-18 and AC-44; without it, "identical" is unfalsifiable. Playwright can script the walkthrough and dump `page.on('request')` entries to a JSON file per page.

**B. [CR] Verifiable by code review / grep — no stack needed.** AC-01…AC-06, AC-08, AC-10…AC-13, AC-16…AC-23, AC-30 (grep `navigate('/settings')`), AC-39 (static half), AC-48…AC-50.
Concrete greps:
- Pilot-panel safety: extract the `data.pilotTextGrading && (…)` subtree from `SubmissionDetail.tsx` and assert **zero** matches for `<button|<input|<textarea|<select|<a |onClick|role=\"button\"|contentEditable` inside it. Also assert whichever shadcn component wraps the notice renders no dismiss button (read `src/components/ui/alert.tsx`).
- Multipart: `rg \"fetch\\('/api/criteria'\" -A3 services/dashboard/src/pages/Criteria.tsx` must still show `body: form` / `credentials: 'include'` and **no** `Content-Type`; `rg 'name=\"courseId\"|name=\"file\"' Criteria.tsx` must return both, inside the `<form onSubmit={upload}>`.
- Downloads/player: `rg \"createObjectURL|download=|blob\\(\\)\" services/dashboard/src` must return nothing; `rg \"<audio\" SubmissionDetail.tsx` must still show `controls src={\\`/api/media/`.
- API surface diff: `rg \"api\\.(get|post|put|patch|delete)<?[^(]*\\(\\`?[^)]*\" services/dashboard/src -o` before vs after — the sorted set of path templates must be identical.
- i18n parity: extract the vi and en key sets from `src/i18n/index.ts` and assert set-equality; extract every `t('…')` literal from `src/` and assert each is in both sets (this is how AC-19/20/21 are checked, since there is no in-app language switcher).
- Network-free build: `rg -n \"shadcn|degit|curl|wget\" services/dashboard/package.json services/dashboard/Dockerfile` returns nothing.

**C. [B] Build verification.** `docker compose build dashboard` from `infra/` (covers AC-07, N1) and `docker run --rm -v \"<abs>/services/dashboard:/app\" -w /app node:24-alpine sh -c \"npm ci && npm run build\"` for a faster loop. Node is never run directly on the host. Watch for a jest/esbuild OOM if the stack is up — this box has been OOM-killed before; stop the stack or build alone.

**D. [BR] Must be verified in a browser against the running stack.** Everything behavioral: AC-14, AC-15, AC-24…AC-29, AC-31…AC-38, AC-40…AC-47, AC-52.
- **Two sessions required**: one admin, one staff (create the staff user via the DB or an existing account). AC-24/25/26/31 cannot be checked from code alone.
- **Network-log assertions (AC-14, AC-15, AC-17)**: edit exactly one Students cell → confirm the PATCH body has exactly one key. Save a class config → confirm both keys present. Change a Reports date → confirm three GETs with `?from=&to=` in `YYYY-MM-DD`.
- **Disabled-state assertions (AC-38, AC-43, AC-36/37)**: need real data. Seed by publishing fixture messages onto the `submissions` queue via the RabbitMQ management API (recipe in `CLAUDE.md` Commands) to create submissions/flags; a DLQ item can be forced by publishing a malformed payload and letting it exhaust the 3 retries, which is what makes the `dlqDepth > 0` Retry-enabled case observable.
- **F2 pilot panel (AC-39) browser half**: on a submission that has a `pilot_text_gradings` row, run in the console `document.querySelectorAll('section:has(pre) button, section:has(pre) input, section:has(pre) textarea, section:has(pre) select, section:has(pre) a')` scoped to the pilot section and assert length 0; also Tab through the panel and confirm no focusable element inside it. Do both the grep and the runtime check — the grep can miss a shadcn primitive that renders a button internally.
- **Downloads (AC-41)**: click all six links in a real browser (Playwright `page.waitForEvent('download')`) and assert a non-empty file with the server-supplied name; a fetch+blob regression typically still "works" but changes the filename and/or fails when the session cookie isn't attached — check the Network tab shows a top-level document/navigation request, not an XHR.
- **Media (AC-13/38)**: only meaningful on a submission whose `media_path` exists on disk; if none exists yet (no real graded clip has been produced), verify the element's `src` attribute and the 200 from `/api/media/:id`, and note the limitation rather than skipping the criterion silently.
- **Language check**: since there's no switcher, run `i18n.changeLanguage('en')` from the console (or temporarily flip `lng` in a dev build) and re-walk two representative pages; the primary en check remains the static key-parity assertion in B.

**E. What cannot be verified and must be recorded as a limitation.** Anything requiring real Zalo/LLM/Sheets credentials (Monitoring's token-valid state, sheets-sync rows, a genuinely graded submission with scores and a pilot text grading) may have to be simulated by inserting fixture rows via `docker compose exec postgres psql`. QA should state explicitly which ACs were exercised against fixtures versus real data.

---

## 5. Assumptions

1. **The `<a href>`/`<audio src>`/raw-multipart patterns are load-bearing, not accidental.** Any "improvement" to them is a defect, even if the UI still appears to work.
2. **Existing quirks are frozen** (Settings' blank-overwrite on untouched rows, Criteria's post-upload list not refreshing, Students' undebounced per-keystroke search, `SubmissionDetail` using `t('students.save')`, the pilot panel keying off the *audio* grading's dimensions, `token.expiresAt`/`campus`/`studentCode`/`flag.resolvedAt`/`item.grading` fetched-but-unrendered). They are logged here as follow-up candidates but must not be fixed inside F3 — a fix is indistinguishable from a reskin regression during QA.
3. **No new UI affordances**: no loading spinners, empty-state illustrations, error toasts, confirmation dialogs, Cancel buttons, close buttons, sorting, or column visibility toggles. Restyling `status`/`kind` values as badges is acceptable; adding filters is not.
4. **Nav may move to a sidebar** (PM assumption 1) provided all 7 destinations + logout remain and the two admin-only links stay conditional.
5. The reskin is judged against the current `main` behavior, not against the architecture docs — where they disagree, current code wins for F3.
6. Icons introduced by the reskin (e.g. `lucide-react`) count as a dependency addition subject to AC-01/AC-07, and any icon-only button needs an `aria-label` sourced from an i18n key present in both locales.

## 6. Open questions (non-blocking)

1. **Post-login redirect.** `Login.tsx:19` navigates to `/settings`, which contradicts PM assumption 2 (`/students`). BA ruling for F3: **keep `/settings`** — changing it is a behavior change and PM listed the redirect as out of scope. Flagged to the owner as a separate one-line fix if the intent was `/students`.
2. **Language switcher.** `en` translations exist but are unreachable in the UI. Out of scope for F3; recommended as the next small feature, otherwise the en half of the i18n work stays unverifiable in-browser forever.
3. **Error handling.** Every GET failure is currently silent. Out of scope for F3; recommended as a follow-up (a single shared error boundary + inline error slot), since adding it now would make the "behavior identical" test unrunnable.

## 7. Notes for the next roles

- **UX:** the 9 pages collapse to 4 patterns — auth form (Login), data table + filter + pagination (Students, Submissions, Monitoring queues, Criteria classes, Reports ×3), detail/review page (SubmissionDetail), config/form page (Settings, Onboarding, Criteria upload). Design those 4 plus the shell. Two constraints that shape the design: the pilot panel must be a *purely presentational* alert/table/scroll-region (no dismiss), and the Reports exports must remain text links or link-styled anchors, never `<Button onClick>`.
- **Dev:** the three highest-risk edits are `Criteria.tsx`'s form (keep `name` attrs inside the `<form>`), `Students.tsx`'s uncontrolled `defaultValue` inputs (switching to controlled changes the PATCH payload), and `SubmissionDetail.tsx`'s conditional nesting (`grading &&` wraps both the action buttons *and* the pilot panel). shadcn's `Input`/`Textarea` forward `name`/`defaultValue` fine, but `Select`/`Checkbox` (Radix-based) do **not** natively participate in `FormData` — do not use them for the Criteria upload form or the classes-config checkbox without a native fallback.
- **QA:** capture the pre-reskin baseline (§4.A) before Dev merges. AC-39 is a product-safety gate, not a nice-to-have: fail the feature on it.

---

**Handoff to Design + Dev + QA:** F3 spec is a per-page behavior inventory of `App.tsx` + 9 pages covering all 24 `/api` interactions across three transport layers (`api/client.ts` JSON, raw multipart `fetch`, cookie-auth `<a>`/`<audio>` — the latter two must not be converted), every control and disabled condition, every conditional/role-gated render, ~107 i18n keys with vi/en parity, and the local-state rules that determine payload shape (Students' edited-fields-only PATCH, Settings' value coercion, Criteria's always-both-fields PUT); plus 52 numbered acceptance criteria classified as code-review / container-build / browser-with-running-stack, with the F2 pilot panel's zero-interactive-controls rule as a hard safety gate verified both by grep and at runtime.
