<!--
  Per-feature-per-role task file, OWNED by the UX agent for F6.
-->

# F6 · UX — Real-time submission status via SSE

- **Owner role:** ux
- **Feature:** F6 — Light, behavioral UX spec for how live SSE-driven status updates read on `Submissions.tsx` (list) and `SubmissionDetail.tsx` (detail); connection-state indicator decision; fallback UX; i18n.
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** `docs/dev-team-roles/tasks/F6-ba.md`, `docs/dev-team-roles/tasks/F6-pm.md`, `docs/dev-team-roles/tasks/F3-ux.md` (design system)

## Inputs (what this role received)

- `F6-ba.md` — frozen event model (`submission:events` Redis channel, SSE frame `event: submission.status` / `data:{submissionId,status,at}`), endpoint contract (`GET /events/submissions`, session-auth, 25s heartbeat, no replay, one-time refetch on reconnect), frontend hook spec (`useSubmissionEvents`), US3 connection indicator left "optional pending UX" with candidate i18n keys `events.live`/`events.reconnecting`/`events.offline`.
- `F6-pm.md` — US1-US4 (US3 = Should, connection indicator; US4 = Won't, toasts deferred), ~2s usability guideline (not SLA), fallback requirement (manual refresh baseline unchanged).
- `F3-ux.md` — design tokens, `Badge` variants (`STATUS_BADGE_VARIANT` mapping already defined per status in Pattern B §5), Pattern B (data table) and Pattern C (detail/review) layout specs, accessibility conventions (focus-visible ring, `prefers-reduced-motion`), i18n key convention (flat dotted keys, vi default).
- Code read: `services/dashboard/src/pages/Submissions.tsx` (status filter, `STATUS_BADGE_VARIANT`, table row structure, pagination), `services/dashboard/src/pages/SubmissionDetail.tsx` (single `if (!data) return null`, single-slot `message` paragraph, grading/pilot cards), `services/dashboard/src/components/ui/badge.tsx` (variant classes, no built-in transition).

## Checklist

- [x] Read F6-ba.md, F6-pm.md, F3-ux.md, Submissions.tsx, SubmissionDetail.tsx, badge.tsx
- [x] Decide + spec list-row live-update treatment (transition vs instant swap)
- [x] Decide + spec detail-page live-update treatment
- [x] Decide connection-state indicator (build vs skip) with rationale
- [x] Spec fallback UX (SSE unreachable/unsupported)
- [x] Specify exact i18n keys (reuse F6-ba §7, no parallel set) or state none needed
- [x] Accessibility: live-region policy for status changes
- [x] Set Status DONE

## Outputs

### 1. List live-update treatment (`Submissions.tsx`)

**Recommendation: instant badge swap, no transition/highlight animation.**

When a `submission.status` event matches a row currently in `data.items`, the row's `status` field updates in place and the existing `Badge` re-renders with its new `STATUS_BADGE_VARIANT` color — same DOM node, same cell, same row position. No fade, no flash, no background-color pulse, no row re-ordering, no scroll adjustment.

Rationale:
- This is a dense ops table (Pattern B, F3) that staff scan repeatedly through a shift. A recurring flash/highlight on every transition (`received→processing→graded→sent` = up to 4 events per row) becomes visual noise at any real submission volume, not a helpful cue — it competes with the badge color itself, which already *is* the signal.
- Sorting/order is stable (server-paginated by `receivedAt`, unaffected by status), so an update never needs to move a row — no layout shift is possible from a status write alone.
- Zero risk of stealing focus/scroll: the update only ever mutates `data.items[i].status` via `setData`, never triggers `load()` for a change to an already-loaded row (per F6-ba §3, `load()` is only called (a) for a not-currently-loaded id, and (b) once on reconnect) — no full table teardown/rebuild, no scroll-position reset, no button/link losing focus mid-interaction.
- If a designer-taste micro-transition is wanted later, the cheapest safe option is `transition-colors duration-200` already implicit in the shadcn `Badge`'s color change (no explicit animation authored) — not recommending it now because it adds a dependency-free but still non-zero cognitive-load cost for a table this dense, and F3's own accessibility notes flag `prefers-reduced-motion` as something every added transition must handle; simplest to add none.

New-row-arrival case (submission not yet in the loaded page, per F6-ba §3): the existing `load()` reconciliation call re-renders the table exactly as a manual refresh does today — no special "new item" treatment (no slide-in, no top-of-list flash). This keeps behavior identical to what a user already sees after clicking refresh; SSE only removes the need to click.

**No layout-shift guarantee:** badge width already varies today by status string length (`awaiting_review` vs `sent`) under manual refresh — this is pre-existing behavior, not something F6 introduces or must fix. The table column has no fixed width, so a badge width change reflows only its own cell, not the row height (row height is fixed by Pattern B's `h-10`) — no visible jump.

### 2. Detail-page live-update treatment (`SubmissionDetail.tsx`)

When an event matches the open submission's id, call the existing `load()` (per F6-ba §3) — this re-fetches the full detail payload and re-renders through the page's normal render path, identical to what happens today after a manual navigation/refresh. No partial/optimistic patch of just the status field; no separate "updating..." transitional state layered on top.

Rationale: `load()` already replaces `data` (and re-seeds `draft` from the new `reviewedFeedback`/`llmFeedback`) in one `setData`/`setDraft` pair — React batches this into a single re-render, so the user never sees an inconsistent half-old/half-new frame. Reusing this exact path (rather than a bespoke "just swap the status word" patch) is both the simplest implementation and the only one that correctly surfaces the *new* content that shows up alongside a status change (scores/feedback appearing at `graded`, review controls becoming relevant at `awaiting_review`, `sentAt` populating at `sent`) — a status-only patch would show the new badge but stale/missing scores, which is worse.

**No focus/scroll disruption:** `load()` already runs on mount and is safe to re-run — it does not remount the page or reset scroll position (React reconciles the same tree). If the user is mid-edit in the `reviewedFeedback` `Textarea` when an unrelated event fires (e.g., an event for a *different* submission — ignored per F6-ba §3 anyway), nothing happens. If an event for the *same* open submission arrives while the user has unsaved edits in the textarea (e.g., staff A is drafting review text while the worker or another staff member's send flips the status), `load()`'s re-fetch will overwrite `draft` with the server's `reviewedFeedback ?? llmFeedback` — **this is a pre-existing risk already present today** (the same `load()` is called after every `saveReview()`/`send()`/`deleteMedia()` today) and F6 does not change or need to add any "unsaved changes" guard; flagging it here only so Frontend/QA know it is a known, accepted, non-regressed trade-off, not something F6 introduces net-new. No new guard is in scope.

No status-word highlight/animation on the detail header for the same density/noise reasoning as §1 — the whole page simply reflects current truth after `load()`, same as after a manual click today.

### 3. Connection-state indicator — recommend SKIP (silent auto-reconnect only)

**Recommendation: do not build a visible connected/reconnecting/offline indicator.** Ship the hook headless; rely on silent `EventSource` auto-reconnect + the mandatory manual-refresh fallback (§4).

Rationale:
- F6-pm marks US3 as **Should**, not Must, and explicitly says "not a blocking modal... rest of the UI must remain fully usable via the existing poll/refresh behavior" — i.e., the bar for *needing* this is "does its absence break trust," not "would it be nice."
- This is a small internal staff dashboard for one center with modest concurrent users (F6-ba §1 rationale for the single-channel design makes the same scale argument). Reconnect happens automatically within seconds on any network blip, and every page already has a manual, obvious way to check truth (navigate away and back, or any existing action that re-fetches — pagination click, filter change, `View` link). A persistent "Live"/"Reconnecting" chip adds a permanent piece of chrome to every page for a failure mode (proxy/network drop) that is rare in normal operation and self-heals without user action in the overwhelming majority of cases.
- A chip that is present but almost always says "Live" trains staff to stop reading it (habituation) — the worse failure mode is a stale "Live" chip during a bug in the *indicator itself*, which is a bigger trust risk than having no chip and just trusting the table/detail content, which is always internally consistent because it's the last real fetch.
- Concretely, the honest failure mode this feature has (per F6-ba §2: "no `Last-Event-ID`/no replay... best-effort UX accelerator over an authoritative REST baseline") is "you might be looking at slightly stale data until the next event or manual action" — exactly the same failure mode the dashboard already has *today* with zero SSE at all. Nothing about SSE failing makes today's baseline worse; it just forgoes an enhancement. That does not meet the bar for a permanent trust-signal UI element.

**If Frontend/PM later decide the indicator earns its keep** (e.g., real support tickets about staff not noticing stale data), the minimal design to reuse verbatim: a single small `Badge` (existing primitive, no new component) placed inline next to each page's `<h1>` (`Submissions.tsx`, `SubmissionDetail.tsx`), *rendered only in the non-nominal states* — i.e., render nothing while `connecting`/`open` (avoid the habituation problem above by not showing a "Live" badge at all when things are fine), and render `Badge variant="warning"` with `events.reconnecting` while the hook's state is `'error'` (EventSource auto-retrying). No third `offline` state is needed in practice — `EventSource` does not have a terminal "gave up" state the app can distinguish from "still retrying," so collapse `reconnecting`/`offline` into the one `warning` badge using `events.reconnecting`'s copy; drop the separate `events.offline` key as unnecessary (see §5). This is documented for future use but **not part of this iteration's deliverable**.

### 4. Fallback UX (mandatory, both pages)

- If `EventSource` never connects, errors persistently, or is unsupported by the browser: both pages render and behave **exactly as they do today with zero SSE code** — initial `load()` on mount, manual navigation/pagination/filter-change triggers refetch, Save/Send/Delete actions all call their existing `load()` afterward. No error banner, no console-visible-to-user message, no retry button, no degraded/greyed-out UI state. The hook fails silently from the user's point of view (consistent with the "skip the indicator" decision in §3 — if there's no indicator, there's by definition no error surface to manage).
- This is naturally satisfied by construction: per F6-ba §3, the hook only ever *adds* a callback invocation on top of the pages' existing `load()`/`setData` calls; it never replaces the mount-time fetch or gates any existing action behind SSE being connected. QA should verify this by literally blocking `/api/events/submissions` (e.g., dev-tools network block) and confirming both pages are pixel-identical to their pre-F6 behavior for every existing interaction (AC-16 in F6-ba, already covers this).

### 5. i18n

**No new i18n keys are introduced by this spec.** Per §3's decision to skip the connection indicator in this iteration, the three candidate keys F6-ba.md §7 reserved (`events.live`, `events.reconnecting`, `events.offline`) are **not adopted now** — leave them undefined; do not add them to `src/i18n/index.ts` speculatively. If the indicator is built later per the minimal design in §3, only **one** of the three is actually needed (`events.reconnecting`, reused for the collapsed reconnecting/offline non-nominal state) — `events.live` and `events.offline` should be dropped from F6-ba's reserved list at that time rather than added unused, keeping the i18n surface lean per the same discipline F3-ux.md's §7 already established (zero speculative keys). No other user-facing string is introduced anywhere in this spec — status badges continue to render the raw untranslated enum value exactly as `Submissions.tsx`/`SubmissionDetail.tsx` do today (per F3-ux.md §5's existing rule).

### 6. Accessibility

- **Live-region policy: none (`aria-live` not added anywhere for this feature).** Recommend against wrapping the status `Badge` (or the table/row) in `aria-live="polite"` or `"assertive"`.
  - `aria-live="assertive"` is explicitly ruled out per the task brief's own guidance — on a table where several rows can update within seconds of each other (a batch of submissions all progressing through the pipeline around the same time), assertive announcements would interrupt whatever the screen-reader user is currently doing, repeatedly, for a background data refresh they didn't request. This is a worse experience than silence.
  - `aria-live="polite"` is technically the "safe" middle ground, but it is still not recommended here: a polite announcement queue on a busy list (up to 6 statuses × N visible rows, potentially several per minute under normal load) would still produce a steady trickle of unrequested announcements queued behind whatever the user is doing, for a table whose current row/values a screen-reader user can already query on demand (arrowing through the table reads the current badge text same as sighted users see it). Since neither page depends on the user *noticing the exact moment* something changed (§3/§4 — SSE is a convenience over a still-fully-functional manual-refresh baseline), there is no accessibility parity requirement for it to be announced live; screen-reader users get identical information via the same manual-refresh/re-navigate path sighted users fall back to.
  - Net effect: the status `<Badge>` cell keeps its default (non-live-region) DOM semantics, identical to today. A screen-reader user reading the table hears the current status whenever they navigate to that cell, live or not — no regression versus today's poll-free static table, since today's table already requires exactly that same manual re-navigation to see any status at all.
- **Focus/touch targets:** unaffected — this feature adds no new interactive elements (§3 recommends skipping the only candidate one). Existing `Badge`, table row, and pagination focus/contrast treatment from F3-ux.md §8 is unchanged.
- **Keyboard nav:** unaffected — no new focusable element, no focus is programmatically moved when an SSE event arrives (§1/§2 explicitly rule out scroll/focus side-effects).

## Blockers / open questions

None blocking. One deliberate deviation from F6-ba's "coordinate with UX" open item: recommending **skip** the US3 connection indicator this iteration (§3), with the exact minimal design specified for later adoption if real usage shows it's needed. No new i18n keys added as a consequence (§5).

## Notes for the next role

**Frontend:** build `useSubmissionEvents` per F6-ba §3 exactly; wire into `Submissions.tsx` as an in-place `data.items[i].status` mutation (no animation, no `load()` for already-loaded rows) and into `SubmissionDetail.tsx` as a plain `load()` call gated on `evt.submissionId === Number(id)`. Do not add any connection-indicator UI, `aria-live` region, or new i18n key for this iteration — all three are deliberately deferred (§3, §5, §6). If product feedback later asks for the indicator, build exactly the minimal `Badge`-based design in §3 (nominal state renders nothing; only the reconnecting/error state renders a `warning` badge) and add only the single `events.reconnecting` key at that time.

**QA:** verify AC-13/14/15 (F6-ba §6) against the *no-animation, no-scroll-shift* requirement specifically — a badge color/text change should be the only DOM diff in the row, no reflow of other rows, no scroll-position change, no focus loss from an in-progress interaction (e.g., typing in the detail page's review textarea for a *different* submission's event must be a complete no-op, per F6-ba's own AC-14 first clause).
</content>
