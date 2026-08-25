# F11 · PM — Zalo interactive buttons (closed `#ilm:` action set)

- **Owner role:** pm
- **Feature:** F11 — Add `buttons?` to `OutboundMessage` in all 3 `contracts` copies (gateway/core-api/worker); `ZaloApiService.sendText` gains an attachment-template payload builder; `outbound.consumer.ts` passes buttons through unchanged guard logic; grading-worker's `pipeline.py` gains an `#ilm:` payload branch (closed 3-action set: `ack`, `request_advisor`, `select_student`) inserted BEFORE the existing text→flag branch.
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** `F9-pm.md` (needs `Grading.studentAckAt`, added in F9's migration — see deviation note below). Otherwise independent of F8/F10/F12.

## Inputs (what this role received)

- Design doc Part 6 (full spec: payload shape verified against live docs 2026-08-19, `oa.query.show` mechanism — a button click returns as an ordinary `user_send_text` event whose `message.text` IS the payload string, so no new webhook type or token scope is needed), Part 9 decision 5 (explicit boundary-relaxation callout — the project owner was told this touches the "bot does not converse" rule and chose to proceed anyway), Part 11 (doc's own dependency table says "— chỉ cần contracts" for this branch).
- `CLAUDE.md` — outbound architecture: `zalo-gateway`'s `outbound/outbound.consumer.ts` (single egress point, 48h-window guard via `canSendWithin48h`, `blocked_48h` fallback — NOT retried), `zalo/zalo-api.service.ts` (`-216` token-expiry retry-once logic), `zalo/token.service.ts`. `grading-worker`'s `pipeline.py` flow (text→flag branch is today's ONLY text handling; "bot never replies to free text" is a hard product boundary).
- Product boundary (repeated for emphasis, per orchestrator's brief): the bot must NOT converse with students. This feature is the one place in the whole doc that deliberately relaxes that boundary, and does so via a CLOSED action set gated by a fixed `#ilm:` prefix — every other text, including malformed/unknown `#ilm:`-prefixed strings, must still hit the unmodified flag path.

## Checklist

- [x] Read design doc Part 6 fully (payload shape, action table, boundary callout)
- [x] Read `CLAUDE.md`'s outbound/inbound architecture summaries to ground the wiring points
- [x] Write user stories + acceptance criteria (MoSCoW), with the fallback-to-flag-path behavior as the single most emphasized AC
- [x] Note the studentAckAt dependency on F9 as an explicit deviation from the doc's stated "no dependency"
- [x] Define in/out of scope; flag the `template_type` open question as owner-blocked, not silently resolved

## Outputs

### User stories (MoSCoW)

**US1 (Must) — outbound messages can carry buttons.**
As a student receiving graded feedback, I want a small set of tappable buttons instead of having to type free text, so the bot can react to a closed set of intents safely.
- Given `OutboundMessage` gains an optional `buttons?: {title, action, payload}[]` field in ALL THREE `contracts` copies (gateway `contracts.ts`, core-api `contracts.ts`, worker `contracts.py` — kept identical per the repo's existing triplication convention), when `ZaloApiService.sendText` is called with buttons, then it builds the exact `attachment.type:"template"` payload from Part 6 (`text` ≤2000 chars, button `title` ≤100, button `payload` ≤1000 — these limits are validated, not just documented).
- Given the existing `-216` token-expiry retry-once logic in `sendText`, when invoked with a buttons payload, then that logic runs UNMODIFIED (no special-casing for the attachment variant).
- Given `outbound.consumer.ts`'s existing 48h-window guard and `blocked_48h`-not-retried fallback, when an outbound message carries buttons, then the guard behaves EXACTLY as today — buttons are extra payload on an already-guarded send, not a new send path or a bypass.

**US2 (Must) — inbound `#ilm:` payloads route to a closed action handler, everything else is unaffected.**
As the grading pipeline, when an inbound text starts with `#ilm:`, I want it routed to a small, closed handler BEFORE the existing text→flag branch, so button clicks never fall through to the human-advisor-flag path — and so every other message still does, unchanged.
- Given `kind=text`, `text="#ilm:ack:123"`: stamps `Grading.studentAckAt` for grading id 123 via a new small core-api PATCH; does NOT create a `flags` row; does NOT send any reply.
- Given `kind=text`, `text="#ilm:request_advisor:123"`: creates a `flags` row — reusing the EXISTING advisor-flag mechanism, no new one invented.
- Given `kind=text`, `text="#ilm:select_student:<bindingId>"`: resolves the existing multi-binding "which student is this?" ambiguity via the EXISTING selection mechanism.
- **Most-important AC:** given `text` does not start with `#ilm:` — ANY other text, including malformed or unrecognized `#ilm:`-prefixed strings (e.g. `#ilm:unknown_action:1`) — when processed, it falls through to the existing, byte-for-byte UNMODIFIED text→flag branch. A test must assert this fallback path is unchanged from today's behavior, not merely "still works."
- None of the three closed actions ever triggers an outbound reply to the student (Part 6's table: "Bot có trả lời? Không" for all three, no exceptions) — explicit AC, since any reply here would itself be a boundary violation.

**US3 (Should, owner-acceptance for full sign-off) — payload shape confirmed against real Zalo OA.**
As the project owner, I want confirmation the buttons-only payload doesn't need a `template_type` field, so sends are correct against the real OA.
- This feature ships the payload exactly as documented in Part 6 (no `template_type`). Unit/contract tests verify the JSON SHAPE produced by `sendText`. Verifying the real Zalo OA ACCEPTS it is explicitly owner-blocked — same deferred-credentials treatment as Zalo M1.8/Sheets M2.4/LLM keys — and is out of this feature's automated-test scope. It must be flagged as owner-acceptance-pending in QA's report, not silently marked passing.

### In scope
- `buttons?` field in all 3 `contracts` files.
- `zalo/zalo-api.service.ts` attachment-payload builder in `sendText`.
- `outbound/outbound.consumer.ts` pass-through (no guard logic changes).
- `pipeline.py` `#ilm:` branch, inserted before the text→flag branch; new small core-api PATCH for `ack`.
- Length-limit validation on text/title/payload.

### Out of scope
- Any action beyond the closed 3 (`ack`, `request_advisor`, `select_student`).
- Any free-text bot reply of any kind.
- Resolving the `template_type` question for real (owner-blocked, see US3).
- Button TITLES/labels authoring UI — those come from a rubric's `student_reply.buttons` config, authored via F12's Drawer 2; this feature only renders whatever config is provided (or sends no buttons if absent).

### Assumptions / deviations
1. **Dependency deviation from the design doc.** Part 11's table lists this branch's dependency as "— chỉ cần contracts," but the `ack` action writes to `Grading.studentAckAt`, a column PM scoped into F9's migration (per the doc's own Part 8 file-scope grouping, which lists `studentAckAt` alongside the other new `Grading` columns). PM is therefore making F11 depend on F9 for that one column. If build sequencing genuinely needs F11 before F9, the alternative is F11 carrying its own tiny single-column migration — flagged as an open implementation choice for whoever sequences the branches, not a hard blocker either way.
2. Button config (titles/actions) always comes from `rubric.student_reply.buttons` (schema v2, F8) — if absent/null, the outbound message is sent with NO buttons (today's plain-text behavior), never a hardcoded default button set.

## Blockers / open questions

1. `template_type` field — owner-blocked, cannot be resolved without a real Zalo OA (see US3). Proceeding per the doc's documented payload shape; flagged, not silently resolved.

## Notes for the next role

BA: the fallback-to-flag-path AC in US2 is the one to write the most rigorous test spec for — it's the actual safety mechanism protecting the "bot doesn't converse" boundary, everything else in this feature is comparatively low-risk plumbing. Backend (gateway): reuse the existing `-216` retry path unmodified — do not fork `sendText` into two functions. Backend (worker): insert the `#ilm:` check as the FIRST branch in the text-handling `if/elif` chain, with the unrecognized-action case falling through to the SAME code path as no-prefix-at-all (not a separate near-duplicate flag call) to keep the "unchanged" guarantee structurally obvious in the diff.
