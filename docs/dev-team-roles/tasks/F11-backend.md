# F11 · Back-end — Zalo interactive buttons (closed `#ilm:` action set)

- **Owner role:** backend
- **Feature:** F11 — `OutboundMessage.buttons` in all 3 contracts; `sendText` attachment-template builder; unchanged 48h guard pass-through; `#ilm:` closed-action inbound branch in `pipeline.py` before the text→flag branch; 2 new `/internal/*` endpoints; 1 setting key.
- **Status:** DONE
- **Last updated:** 2026-08-23
- **Depends on:** `F11-ba.md` (spec, 15 FR / 116 AC / 16 BR), `F11-pm.md`, `F9-backend.md` (`Grading.studentAckAt`), `Idea/20260819-ChamDiemRubricV2.md` Phần 6

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F11-ba.md` — authoritative spec. §1 contract block (byte-identical ×3), §2 payload grammar, FR-01…FR-15, NFR-01…NFR-08, BR-01…BR-16, §9 deviations A-04/A-05/A-06 (all three implemented as specified).
- Preservation constraints: `outbound.consumer.ts` changes by exactly one line; `-216` path verbatim; 3 contracts files identical; `#ilm:` branch before the text→flag branch.
- Owner-blocked: `zalo.buttons_template_type` (OQ-1) — shipped behind the setting, NOT verified.
- Baselines: core-api 39 suites / 723 tests · grading-worker 261 · zalo-gateway 5 suites / 26 tests.

## Checklist (the concrete work items for this task)

- [x] Read protocol + F11-ba.md + design Phần 6 + F9-backend.md + relevant code
- [x] FR-01: contracts ×3 (TS gateway, TS core-api, Python worker) byte-identical F11 block
- [x] FR-01: contract-constant tests in all three languages
- [x] FR-02/03/04: `ZaloApiService.sendText(zaloUserId, text, buttons?)` + limit rules + `template_type` flag
- [x] FR-05: `outbound.consumer.ts` one-line pass-through (`git diff --numstat` = `1 1`)
- [x] FR-06: `-216` preservation tests (buttons variant)
- [x] FR-09/13: `parse_ilm_payload` pure fn + `_handle_button_payload` + pipeline wiring + studentId precedence
- [x] FR-10: `PATCH /internal/gradings/:id/student-ack` (404/403/idempotent)
- [x] FR-11: `request_advisor` → existing `POST /internal/flags`
- [x] FR-12: `PATCH /internal/submissions/:id/select-student` (404/403/409) + worker republish
- [x] FR-07: worker auto-send producer buttons
- [x] FR-08: core-api `GradingsService.send()` producer buttons + clarification buttons
- [x] FR-14: `zalo.buttons_template_type` setting-def + 2 i18n lines
- [x] Tests: gateway suite green (7 suites / 61 tests)
- [x] Tests: grading-worker suite green (377 tests)
- [x] Tests: core-api suite green (41 suites / 774 tests) + `tsc --noEmit`
- [x] Dashboard `tsc -b && vite build` green
- [x] Fill Outputs + Status DONE

---

# Outputs

## 1. API contract (new surface only — everything else is unchanged)

Both endpoints live on the existing `@Controller('internal')` behind `InternalTokenGuard`
(static shared token, header `x-internal-token`, from `settings['internal.worker_api_token']`
with `INTERNAL_API_TOKEN` env fallback). **Service-to-service only — never a user session, never
reachable from the dashboard.** Global `ValidationPipe({whitelist:true, transform:true})` applies,
so unknown body fields are stripped and a bad shape is a 400 before any handler code runs.

### `PATCH /internal/gradings/:id/student-ack`
Purpose: stamp `gradings.student_ack_at` when the student taps "Em đã xem". **This is the only
writer of that column** (F9 created it and never writes it — BR-11).

| | |
| :-- | :-- |
| Path param | `id` — int, `ParseIntPipe` (non-numeric ⇒ 400) |
| Body | `{ "zaloUserId": string }` — non-empty (`@IsString @IsNotEmpty`) |
| 200 | `{ id: number, studentAckAt: string(ISO), alreadyAcked: boolean }` |
| 400 | body fails validation / `:id` not an int |
| 403 | `grading.submission.zaloUserId !== body.zaloUserId` — **no write** |
| 404 | grading does not exist |

Authorisation: `body.zaloUserId` is the webhook-derived, HMAC-verified sender that the gateway put
on the queue message. It is never taken from, and never influenced by, the `#ilm:` payload string
(NFR-01). A student who types another student's grading id gets 403 + a flag, never a write.

Idempotency: conditional write `updateMany({ where: { id, studentAckAt: null }, data: { studentAckAt } })`.
First tap wins; a second tap and a RabbitMQ redelivery both return `alreadyAcked: true` with the
original timestamp. Only `studentAckAt` is ever in the `data` object (asserted by test).

### `PATCH /internal/submissions/:id/select-student`
Purpose: sibling disambiguation — bind a pending submission to the chosen student so the worker can
re-drive it.

| | |
| :-- | :-- |
| Path param | `id` — int, `ParseIntPipe` |
| Body | `{ "zaloUserId": string, "bindingId": number }` (`@IsString @IsNotEmpty`, `@IsInt`) |
| 200 | `{ id, messageId, zaloUserId, kind, mediaUrlZalo, receivedAt, studentId, status }` — everything the worker needs to rebuild a `SubmissionMessage` with no second round-trip |
| 400 | body/param validation |
| 403 `{code:'not_owner'}` | submission belongs to another Zalo user |
| 403 `{code:'invalid_binding'}` | binding missing / other user's / not `active` / `studentId` null |
| 404 `{code:'not_found'}` | submission does not exist |
| 409 `{code:'already_selected'}` | `studentId` already set or `status !== 'received'` — row untouched |

The `code` field is the one deliberate addition beyond the BA's response spec: the status codes are
exactly as specified, and `code` lets the worker write the four distinct flag reasons AC-12.8 asks
for without inventing extra status codes.

Integrity: the write is a conditional `updateMany({ where: { id, studentId: null, status: 'received' }, ... })`,
so two racing taps cannot both win ⇒ a submission is bound to exactly one student and graded once
(BR-13). No status change, no `events.publishStatus`, no queue publish from this endpoint.

### Queue contract (additive, all three copies identical)
`OutboundMessage.buttons?: { title, action, payload }[]` — absent/empty ⇒ byte-identical to a
pre-F11 message (asserted in Python by `to_dict()` tests, in TS by the `send()` tests). Constants:
`ILM_PAYLOAD_PREFIX='#ilm:'`, `BUTTON_ACTIONS=['ack','request_advisor','select_student']`,
`MAX_BUTTONS=5`, `MAX_BUTTON_TITLE_LEN=100`, `MAX_BUTTON_PAYLOAD_LEN=1000`, `MAX_OUTBOUND_TEXT_LEN=2000`.

### Zalo wire payload (`POST https://openapi.zalo.me/v3.0/oa/message/cs`, unchanged endpoint)
```jsonc
{ "recipient": { "user_id": "…" },
  "message": { "text": "…",
    "attachment": { "type": "template",
      "payload": { "buttons": [ { "title": "…", "type": "oa.query.show", "payload": "#ilm:ack:123" } ] } } } }
```
`template_type` is emitted inside `message.attachment.payload` **only** when the
`zalo.buttons_template_type` setting is non-empty (default: omitted). The contract's `action` field
is internal metadata and is never sent to Zalo.

### Payload grammar (closed set)
`#ilm:` + action + `:` + args, `arg = ^[0-9]{1,12}$`. `ack`/`request_advisor` take 1 arg
(`gradingId`); `select_student` takes 2 (`bindingId:submissionId`). No trimming, no case folding,
no partial matching — anything else falls through to the pre-F11 advisor-flag path.

## 2. Files changed

**zalo-gateway**
- `services/zalo-gateway/src/contracts.ts` — F11 block (types + `buttons?` + 5 constants).
- `services/zalo-gateway/src/zalo/zalo-api.service.ts` — `sendText(zaloUserId, text, buttons?)`; all-or-nothing button validation; attachment builder; `template_type` behind `RedisService.getConfig('zalo.buttons_template_type')` (wrapped so a Redis failure degrades to "omit", never fails the send); attachment built **once** before the first `trySend` so the `-216` retry re-sends the same variant. `-216` refresh-and-retry-once logic and the error string formats are untouched.
- `services/zalo-gateway/src/outbound/outbound.consumer.ts` — **exactly one changed line** (`git diff --numstat` ⇒ `1 1`).
- `services/zalo-gateway/src/contracts.spec.ts` *(new)*, `src/zalo/zalo-api.service.spec.ts` *(new, 22 tests)*, `src/outbound/outbound.consumer.spec.ts` *(+5 F11 tests)*.

**core-api**
- `services/core-api/src/contracts.ts` — same F11 block; verified byte-identical to the gateway's (`git diff -U0` of the two additions diffs clean).
- `services/core-api/src/lib/outbound-buttons.ts` *(new)* — `buildReplyButtons(rubricRaw, gradingId)`; the TS twin of the worker's `build_reply_buttons`.
- `services/core-api/src/gradings/gradings.service.ts` — `send()` now includes `criteria` and attaches buttons (A-05: this is the *primary* send path since `autoSend` defaults false). Every pre-F11 behaviour and its ordering is preserved and asserted.
- `services/core-api/src/worker-api/worker-api.controller.ts` — the two endpoints above + `StudentAckResult`/`SelectStudentResult` types.
- `services/core-api/src/worker-api/dto/student-ack.dto.ts`, `dto/select-student.dto.ts` *(new)*.
- `services/core-api/src/settings/setting-defs.ts` — `zalo.buttons_template_type` (string, unmasked). No `.env` var, no `ENV_FALLBACKS` entry.
- `services/core-api/src/contracts.spec.ts` *(new)*, `src/lib/outbound-buttons.spec.ts` *(new)*, `src/gradings/gradings.service.spec.ts` *(+F11 block)*, `src/worker-api/worker-api.controller.spec.ts` *(+2 describe blocks)*.

**grading-worker**
- `services/grading-worker/src/grading_worker/contracts.py` — F11 block; `to_dict()` omits `buttons` for both `None` and `[]`.
- `services/grading-worker/src/grading_worker/buttons.py` *(new)* — `parse_ilm_payload` (pure), `build_reply_buttons`, `build_select_student_buttons`. Uses `[0-9]` + `re.fullmatch` deliberately (`\d` would accept Unicode digits; `^…$` would accept a trailing newline).
- `services/grading-worker/src/grading_worker/pipeline.py` — the AC-09.2 four-line shape inside the `kind == "text"` branch; `_handle_button_payload` / `_handle_ack` / `_handle_select_student`; `studentId` precedence (FR-13); clarification buttons; auto-send buttons; `_publish_outbound(..., buttons=None)`; new optional `publish_submission` ctor arg (defaults `None`).
- `services/grading-worker/src/grading_worker/core_api_client.py` — `student_ack`, `select_student` returning `(status, body)` for 403/404/409 (terminal business outcomes) and raising for 5xx (existing retry→DLQ loop unchanged).
- `services/grading-worker/src/grading_worker/main.py` — wires `publish_submission=lambda msg: rabbit.publish(Q_SUBMISSIONS, msg)`.
- `services/grading-worker/tests/test_buttons.py` *(new)*, `tests/test_contracts.py` *(new)*, `tests/test_pipeline_buttons.py` *(new)*.

**dashboard**
- `services/dashboard/src/i18n/index.ts` — `settings.field.zalo.buttons_template_type` in the `vi` and `en` blocks. Nothing else; `Settings.tsx` renders the key automatically under the `zalo.` group.

**No migration. No new npm/pip dependency. No new queue, exchange, binding, consumer or Redis key.**

## 3. Test results (real numbers)

| Suite | Command | Baseline | Now |
| :-- | :-- | :-- | :-- |
| zalo-gateway | `npm ci && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2` (Docker node:24-alpine) | 5 suites / 26 tests | **7 suites / 61 tests, all pass** |
| core-api | same command | 39 suites / 723 tests | **41 suites / 774 tests, all pass** |
| grading-worker | `.venv/Scripts/python -m pytest -q` | 261 tests | **377 tests, all pass (42.8 s)** |
| dashboard | `npm ci && npm run build` (`tsc -b && vite build`) | — | **built in 19.1 s, exit 0** |

**One pre-existing assertion changed, justified:** `outbound.consumer.spec.ts:27`
`toHaveBeenCalledWith('user-1', msg.text)` → `toHaveBeenCalledWith('user-1', msg.text, undefined)`.
Jest compares argument *arity*, and AC-05.1 mandates the three-argument call, so this edit is
mechanically forced by the spec rather than an accommodation — the assertion still checks exactly
the same behaviour. No other pre-existing assertion in any of the three services was touched.

## 4. Notes for QA

- **FR-09 is the feature.** `tests/test_buttons.py::AC_09_4_FALL_THROUGH` is the enumerated list: 21 discrete strings (AC-09.4 has 19 bullets, two of which list two strings each). `test_pipeline_buttons.py` parametrises the *pipeline* over that same list and asserts all three things per string: exactly one `create_flag` with the byte-identical pre-F11 reason `"tin text ngoài luồng nộp bài — bot không hội thoại (mục 3.6)"`, zero `Q_OUTBOUND` publishes, zero calls to either new endpoint. The list is imported, not re-typed, so the parser test and the routing test can never drift.
- **Zero outbound on every action** is asserted per action (`ack`, `request_advisor`, `select_student`, success *and* rejection paths). The bot never confirms a tap.
- **Cross-student spoof (NFR-01):** covered at the endpoint layer (403 + no write, for both `ack` and `select-student`, including a binding that belongs to another Zalo user) and at the worker layer (`student_ack` is always called with `msg.zaloUserId`, never a parsed arg).
- **Preservation ACs:** `outbound.consumer.ts` diff is literally `1 1`; the 48h/`blocked_48h`/no-retry path is re-asserted with a buttons-carrying message (the stored JSON now simply also contains `buttons`); the `-216` path is exercised for the buttons variant and proven not to downgrade on retry.
- **Behaviour change to expect, not to file as a regression (AC-13.4):** a RabbitMQ retry of a submission whose `studentId` was already stored now reuses that student instead of re-resolving from bindings. Strictly more correct; it is also the mechanism that makes FR-12's re-drive terminal.
- **Two producer-side hardening rules beyond the letter of the ACs**, both chosen so teacher config can never silently kill the whole button block at the gateway: a `student_reply` entry whose `title` exceeds 100 chars is skipped (`buildReplyButtons` / `build_reply_buttons`), and a `select_student` label over 100 chars drops *all* clarification buttons (never a truncated sibling list — same reasoning as AC-08.7).
- **OWNER-ACCEPTANCE PENDING, do not report as passing (OQ-1):** whether a real Zalo OA accepts a buttons-only payload without `template_type`; whether `oa.query.show` renders and returns exactly as documented; the real 5-button maximum; whether a tap refreshes the 48h window. All four need real OA credentials. The `template_type` unknown is fixable from the dashboard with no redeploy via `zalo.buttons_template_type` (empty ⇒ field omitted).
- **Stack-up smoke test available without credentials** (design Phần 10 §6): publish `{"kind":"text","text":"#ilm:ack:1"}` onto `submissions` via the RabbitMQ management API, then check `docker compose logs grading-worker` for `nút #ilm:ack ->` and `psql` for `gradings.student_ack_at`.

## Blockers / open questions

- OQ-1 `template_type` — owner-blocked (real OA credentials). Shipped behind `zalo.buttons_template_type`, default empty ⇒ omitted, matching the shape verified in the design doc on 2026-08-19. **Not verified against a real OA.**

## Notes for the next role

- **Front-end:** nothing to build. The two i18n lines are already in; `Settings.tsx` renders `zalo.buttons_template_type` automatically under the existing `zalo.` group. Authoring `student_reply.buttons` is F12's Drawer 2, not F11.
- **QA:** start at FR-09 (the 21-string fall-through), then NFR-01 (cross-student spoof), then the FR-05/FR-06 preservation ACs. Report OQ-1 as owner-acceptance pending.
