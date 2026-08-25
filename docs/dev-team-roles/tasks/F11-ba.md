# F11 · BA — Zalo interactive buttons (closed `#ilm:` action set)

- **Owner role:** ba
- **Feature:** F11 — `OutboundMessage.buttons` in all 3 contracts copies; `sendText` attachment-template builder; unchanged 48h guard pass-through; `#ilm:` closed-action inbound branch in `pipeline.py` inserted before the text→flag branch.
- **Status:** DONE
- **Last updated:** 2026-08-23
- **Depends on:** `F11-pm.md` (US1–US3), `F9-backend.md` (`Grading.studentAckAt` shipped, never written), `F8-backend.md` (`student_reply` on RubricV2, both languages)

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F11-pm.md` — US1/US2/US3, MoSCoW, in/out of scope, the `template_type` open question, two assumptions.
- `Idea/20260819-ChamDiemRubricV2.md` **Phần 6** — authoritative: payload shape re-verified against live docs 2026-08-19, the `oa.query.show` mechanism, the 3-action table with "Bot có trả lời? Không" on every row, and the `template_type` unknown. Also Phần 3 (`student_reply` block incl. `buttons: [{title, action}]`), Phần 10 §6 (fixture-message E2E plan), Phần 11 (branch 4, "chỉ cần contracts").
- `docs/dev-team-roles/tasks/F9-backend.md` — `Grading.studentAckAt` exists, `NULL` on every row, F9 writes it never (BR-11 there); `totalScore/levelCode/levelLabel` are what `student_reply.show_total/show_level` read.
- Code read in full: `zalo-gateway/src/zalo/zalo-api.service.ts`, `zalo-gateway/src/outbound/outbound.consumer.ts`, `zalo-gateway/src/webhook/webhook.service.ts`, `zalo-gateway/src/redis.service.ts` (config getters), all three `contracts` files, `grading-worker/src/grading_worker/pipeline.py`, `core_api_client.py`, `main.py`, `core-api/src/worker-api/worker-api.controller.ts`, `core-api/src/gradings/gradings.service.ts`, `core-api/src/onboarding/onboarding.service.ts`, `core-api/src/settings/setting-defs.ts`, `prisma/schema.prisma`, `dashboard/src/pages/Settings.tsx`.

## Checklist (the concrete work items for this task)

- [x] Read protocol + PM stories + F9 backend file
- [x] Read design doc Phần 6 (payload shape, action table, boundary callout) + Phần 3 `student_reply` + Phần 10 §6
- [x] Read gateway outbound path (`sendText` / `-216` / 48h guard / `blocked_48h`) and inbound mapping
- [x] Read 3 contracts files + `pipeline.py` text branch + `core_api_client.py` + `main.py`
- [x] Read core-api producer/consumer surfaces (`worker-api.controller.ts`, `gradings.service.ts`, `setting-defs.ts`, schema)
- [x] Write FRs with numbered, individually testable ACs (FR-01…FR-15, 116 ACs)
- [x] Write NFRs (security/injection, perf, availability, compatibility)
- [x] Write use cases UC-1…UC-7 (happy / alternative / exception / postconditions)
- [x] Write business rules BR-01…BR-16 + data dictionary
- [x] Write offline-testable vs owner-blocked matrix, assumptions, dependencies, open questions
- [x] Set Status DONE

---

# Outputs — F11 functional specification

## 0. Scope and the one control that matters

F11 deliberately relaxes the hard product boundary in `Foundation.md` / architecture changelog v1.1
("bot KHÔNG hội thoại với học sinh"). The project owner was told this explicitly during planning
(design doc Phần 6 blockquote) and chose to proceed. **The relaxation is safe only because of the
control described in FR-09**, so that FR is the centre of this spec:

> Inbound text is routed to a closed handler **only** when it matches the `#ilm:` prefix **and** a
> known action **and** the argument grammar. Anything else — including a malformed or unknown
> `#ilm:` string — reaches the existing text→flag lines **byte-for-byte unchanged**. The bot never
> composes a free-form reply, and none of the three actions publishes anything outbound at all.

In scope: the `buttons` contract addition (×3), the gateway send-path builder, gateway
pass-through, three producer call sites, the inbound `#ilm:` branch, two new `/internal/*`
endpoints, one new setting key, two i18n label lines.

Out of scope: any fourth action; any bot reply to a tap; the Drawer-2 authoring UI for
`student_reply.buttons` (F12); resolving `template_type` against a real OA (owner-blocked, §9);
F8's rubric shim, F9's scoring, F10's templates — **not one line of those may change**.

---

## 1. The contract addition (must be byte-identical in all three copies)

**TypeScript** — appended to `services/zalo-gateway/src/contracts.ts` **and**
`services/core-api/src/contracts.ts`. Same text in both files; the two files' existing leading
doc-comments differ today and stay as they are.

```ts
/** F11: tập hành động nút bấm — TẬP ĐÓNG. Thêm giá trị mới phải sửa cả BA bản contracts
 * và nhánh xử lý trong grading-worker/pipeline.py, nếu không tin nhắn sẽ rơi xuống flag. */
export type ButtonAction = 'ack' | 'request_advisor' | 'select_student';

export interface OutboundButton {
  /** Nhãn học viên nhìn thấy — Zalo giới hạn 100 ký tự. */
  title: string;
  action: ButtonAction;
  /** Chuỗi quay lại NGUYÊN VĂN qua sự kiện `user_send_text` — Zalo giới hạn 1.000 ký tự.
   * Luôn có dạng `#ilm:<action>:<arg>[:<arg>]`, mọi arg chỉ gồm chữ số. */
  payload: string;
}

export interface OutboundMessage {
  v: 1;
  zaloUserId: string;
  templateKey?: string;
  text: string;
  submissionId?: string;
  /** F11: vắng mặt hoặc rỗng = tin text thuần đúng như trước F11. */
  buttons?: OutboundButton[];
}

export const ILM_PAYLOAD_PREFIX = '#ilm:';
export const BUTTON_ACTIONS: readonly ButtonAction[] = ['ack', 'request_advisor', 'select_student'];
export const MAX_BUTTONS = 5;
export const MAX_BUTTON_TITLE_LEN = 100;
export const MAX_BUTTON_PAYLOAD_LEN = 1000;
export const MAX_OUTBOUND_TEXT_LEN = 2000;
```

**Python** — `services/grading-worker/src/grading_worker/contracts.py`:

```python
ButtonAction = Literal["ack", "request_advisor", "select_student"]

@dataclass
class OutboundButton:
    title: str
    action: ButtonAction
    payload: str

    def to_dict(self) -> dict:
        return {"title": self.title, "action": self.action, "payload": self.payload}

@dataclass
class OutboundMessage:
    zaloUserId: str
    text: str
    templateKey: Optional[str] = None
    submissionId: Optional[str] = None
    buttons: Optional[list[OutboundButton]] = None
    v: int = 1

    def to_dict(self) -> dict:
        payload = {"v": self.v, "zaloUserId": self.zaloUserId, "text": self.text}
        if self.templateKey is not None:
            payload["templateKey"] = self.templateKey
        if self.submissionId is not None:
            payload["submissionId"] = self.submissionId
        if self.buttons:                      # rỗng/None => KHÔNG có khóa `buttons` trên wire
            payload["buttons"] = [b.to_dict() for b in self.buttons]
        return payload

ILM_PAYLOAD_PREFIX = "#ilm:"
BUTTON_ACTIONS = ("ack", "request_advisor", "select_student")
MAX_BUTTONS = 5
MAX_BUTTON_TITLE_LEN = 100
MAX_BUTTON_PAYLOAD_LEN = 1000
MAX_OUTBOUND_TEXT_LEN = 2000
```

`buttons` is **additive and optional everywhere**: every existing producer that does not set it
keeps producing byte-identical queue messages.

---

## 2. Payload grammar (the closed set)

```
payload := "#ilm:" action ":" arg { ":" arg }
action  := "ack" | "request_advisor" | "select_student"        (exact, lowercase)
arg     := /^[0-9]{1,12}$/                                     (chữ số, không dấu, không rỗng)
```

| Action | Arity | Arguments | Meaning |
| :-- | :-- | :-- | :-- |
| `ack` | 1 | `<gradingId>` | "Em đã xem" → stamp `Grading.studentAckAt` |
| `request_advisor` | 1 | `<gradingId>` | "Nhờ cô giải thích thêm" → one `flags` row |
| `select_student` | 2 | `<bindingId>:<submissionId>` | sibling disambiguation → bind + re-drive |

Longest legal payload: `#ilm:select_student:` (20) + 12 + 1 + 12 = **45 chars**, far under Zalo's
1000. Any other shape (extra segments, wrong arity, non-digit arg, different case, leading/trailing
whitespace, empty arg) is **not** in the closed set and is handled by FR-09 fall-through.

---

## 3. Functional requirements

### FR-01 — `buttons` added identically to all three contracts copies
*(traces US1)*

- **AC-01.1** `services/zalo-gateway/src/contracts.ts` contains the TypeScript block of §1 verbatim (types, interface field, five constants).
- **AC-01.2** `services/core-api/src/contracts.ts` contains the same TypeScript block; a diff of the two files' F11 additions is empty.
- **AC-01.3** `services/grading-worker/src/grading_worker/contracts.py` contains the Python block of §1; `BUTTON_ACTIONS`, `ILM_PAYLOAD_PREFIX`, `MAX_BUTTONS`, `MAX_BUTTON_TITLE_LEN`, `MAX_BUTTON_PAYLOAD_LEN`, `MAX_OUTBOUND_TEXT_LEN` have the same values as the TS copies.
- **AC-01.4** A test asserts the three action strings and the prefix constant value in each language (`'#ilm:'`, `['ack','request_advisor','select_student']`) — so a typo in one copy fails a suite rather than silently dead-ending a button.
- **AC-01.5** `OutboundMessage.to_dict()` omits the `buttons` key entirely when `buttons` is `None`; the produced dict is `==` to the pre-F11 dict for every existing call site.
- **AC-01.6** `OutboundMessage.to_dict()` omits the `buttons` key when `buttons == []` (empty list ⇒ plain text, never `"buttons": []`).
- **AC-01.7** No other field of `SubmissionMessage`/`OutboundMessage` and none of `EXCHANGE`/`DLX`/`RETRY_EXCHANGE`/`Q_*`/`MAX_RETRIES`/`RETRY_TTL_MS` changes value in any copy.
- **AC-01.8** No new npm/pip dependency is introduced by this FR or any other F11 FR (`package.json` ×3 and `pyproject.toml` unchanged).

### FR-02 — `ZaloApiService.sendText` builds the attachment-template payload
*(traces US1)*

- **AC-02.1** `sendText(zaloUserId, text)` keeps working with exactly two arguments and produces a request body byte-identical to today's: `{"recipient":{"user_id":…},"message":{"text":…}}` — no `attachment` key at all.
- **AC-02.2** A third optional parameter `buttons?: OutboundButton[]` is added to the **same** method (`sendText(zaloUserId, text, buttons?)`). No second public send method is created (PM handoff: "do not fork `sendText` into two functions").
- **AC-02.3** With a non-empty, valid `buttons` array, the POST body is exactly:
  ```jsonc
  { "recipient": { "user_id": "<zaloUserId>" },
    "message": { "text": "<text>",
      "attachment": { "type": "template",
        "payload": { "buttons": [ { "title": "…", "type": "oa.query.show", "payload": "#ilm:…" } ] } } } }
  ```
  Key order is irrelevant; key *set* is asserted exactly (no extra keys anywhere).
- **AC-02.4** Every button object emitted carries literally `"type": "oa.query.show"`. The contract's `action` field is **not** emitted to Zalo — it is internal metadata for the producer; the wire only carries `title`/`type`/`payload`.
- **AC-02.5** `buttons` = `undefined`, `null` or `[]` ⇒ AC-02.1's body (no `attachment` key). Three separate cases.
- **AC-02.6** Endpoint stays `https://openapi.zalo.me/v3.0/oa/message/cs`, method POST, headers `{'Content-Type':'application/json', access_token}` — unchanged.
- **AC-02.7** `trySend` still reads the token via `redis.getAccessToken()` and still throws `'No Zalo access token available'` when it is null, for both the plain and the buttons variant.

### FR-03 — Zalo limit enforcement is all-or-nothing on the buttons block
*(traces US1; deviation from PM's "text ≤2000 validated" — see §9 A-04)*

- **AC-03.1** If `buttons.length > MAX_BUTTONS` (5), the **whole** `attachment` block is dropped and the message is sent as plain text (AC-02.1 body), with one `logger.warn` naming the reason and the `zaloUserId`. No truncation of the list.
- **AC-03.2** If **any** button has `title.length > 100`, the whole block is dropped, plain text is sent, one warn. No truncation of the title.
- **AC-03.3** If **any** button has `payload.length > 1000`, same: whole block dropped, plain text, one warn. A payload is **never** truncated (truncation would change its meaning — BR-06).
- **AC-03.4** If any button has a non-string / empty-after-trim `title`, or a `payload` not starting with `#ilm:`, or an `action` outside `BUTTON_ACTIONS`, the whole block is dropped, plain text, one warn.
- **AC-03.5** A dropped block never raises and never changes the return value: `sendText` still resolves iff Zalo answers `error === 0`.
- **AC-03.6** `text.length > MAX_OUTBOUND_TEXT_LEN` (2000) produces **one `logger.warn` and nothing else** — the text is sent unmodified, exactly as before F11. Rationale in §9 A-04; asserted as its own test so the preserved behaviour is explicit.
- **AC-03.7** Validation is pure and local: no Redis read, no HTTP call, no queue write is added to the send path by FR-03.
- **AC-03.8** Boundary cases pass unmodified: exactly 5 buttons, a 100-char title, a 1000-char payload, a 2000-char text — all send **with** the attachment block (limits are inclusive maxima).

### FR-04 — `template_type` behind a config flag
*(traces US3; the one genuinely open question)*

- **AC-04.1** The gateway reads `zalo.buttons_template_type` via the existing `RedisService.getConfig()` (so the existing `config:changed` cache-flush hot-reload applies with no new mechanism).
- **AC-04.2** Value `null` or `''` (the **default**, i.e. the key never set) ⇒ the payload of AC-02.3 is emitted with **no** `template_type` key — the shape verified in design Phần 6.
- **AC-04.3** A non-empty value `X` ⇒ `message.attachment.payload` additionally carries `"template_type": "X"` alongside `buttons`. Nothing else in the body changes.
- **AC-04.4** The flag is read **only** when a buttons block is actually being emitted; a plain-text send performs no extra Redis read (protects the hot path — NFR-02).
- **AC-04.5** A Redis failure while reading the flag must not fail the send: the read is wrapped so that an error degrades to "omit `template_type`" plus one warn.
- **AC-04.6** The value is used verbatim as a JSON string value; it is never concatenated into a URL or header (no injection surface).

### FR-05 — `outbound.consumer.ts` passes buttons through; guard behaviour preserved exactly
*(traces US1 — the QA-visible preservation ACs)*

- **AC-05.1** The only change permitted in `handle()` is the final call becoming `await this.zaloApi.sendText(msg.zaloUserId, msg.text, msg.buttons)`. Every other line is byte-identical (`git diff` on this file shows exactly one changed line).
- **AC-05.2** The malformed guard (`!msg?.zaloUserId || !msg?.text` ⇒ log error, `return`, no retry) is unchanged — including for a message that carries `buttons` but no `text`, which is still dropped, not sent.
- **AC-05.3** `limits.outbound_48h_guard` is still read via `getConfigBool(..., true)` and still defaults to `true`.
- **AC-05.4** When the guard blocks, the message is still `LPUSH`ed to the Redis list `blocked_48h` as `JSON.stringify({...msg, blockedAt})` — and because it spreads `...msg`, the stored record now simply **also** contains `buttons` when present. No separate serialization path, no field stripped.
- **AC-05.5** A blocked message is still **not retried** and **not** sent (`return` before `sendText`) — asserted with a buttons-carrying message.
- **AC-05.6** When the guard is disabled or the window is open, `sendText` is called exactly once, with `msg.buttons` forwarded by reference/value unchanged (not re-ordered, not filtered — filtering is FR-03's job inside `sendText`).
- **AC-05.7** A `sendText` rejection still propagates out of `handle()` so `RabbitService.consume()` performs the existing retry→DLQ loop — same for buttons and non-buttons messages.
- **AC-05.8** No new consumer, queue, exchange, binding or Redis key is introduced by F11 anywhere.

### FR-06 — `-216` refresh-and-retry-once is preserved verbatim
*(traces US1)*

- **AC-06.1** `sendText` still calls `trySend`; on `error === -216` it still logs the existing warn, calls `tokenService.refreshNow()`, throws `'Token expired and refresh failed'` when that returns falsy, else calls `trySend` **once** more.
- **AC-06.2** The retry re-sends the **same** payload variant it first sent (buttons message retries with the buttons block; plain retries plain). No downgrade-on-retry.
- **AC-06.3** A second `-216` on the retry is **not** retried again — it falls into the generic `error !== 0` throw, exactly as today.
- **AC-06.4** Any non-zero, non-`-216` error still throws `Zalo send failed: <error> <message>` with the same string format.
- **AC-06.5** The `-216` path is exercised by a test for the buttons variant, proving the branch was not special-cased or duplicated.

### FR-07 — Producer A: grading feedback buttons on the worker auto-send path
*(traces US1/US2; needed for `ack` to exist at all)*

- **AC-07.1** On the `auto_send` branch, `pipeline.py` publishes the feedback outbound message with `buttons` built from `rubric["student_reply"]["buttons"]` and the grading id returned by `create_grading`.
- **AC-07.2** Mapping: config entry `{title, action}` ⇒ `OutboundButton(title=<title>, action=<action>, payload=f"#ilm:{action}:{grading_id}")` for `action in ("ack","request_advisor")`.
- **AC-07.3** `action == "select_student"` appearing in `student_reply.buttons` is **skipped** (system-generated only — BR-14); an unknown action string is skipped too. If skipping empties the list ⇒ no `buttons` key at all.
- **AC-07.4** `student_reply` is `None`, or has no `buttons` key, or `buttons` is not a list, or is `[]` ⇒ the outbound message is byte-identical to today's plain-text feedback message (PM assumption 2: never a hardcoded default button set).
- **AC-07.5** Defensive parsing: `student_reply` is copied verbatim by `normalize_rubric` and is therefore untrusted. Entries that are not dicts, or whose `title`/`action` is missing/non-string/empty-after-trim, are skipped without raising. A malformed `student_reply` can never make the send path throw (NFR-06).
- **AC-07.6** The grading id used in the payload is the one from `create_grading`'s response (`grading["id"]`); if that is missing/non-integer, no buttons are attached (never `#ilm:ack:None`).
- **AC-07.7** At most `MAX_BUTTONS` entries are produced; a longer config list is truncated **at the producer** to the first 5 so the gateway's all-or-nothing rule (AC-03.1) is not tripped by teacher config.
- **AC-07.8** The message `text` is unchanged by F11 (`result.data["feedback"]`, or whatever F10 renders) — F11 adds buttons only.
- **AC-07.9** The `awaiting_review` branch publishes **nothing** (unchanged): buttons never leak onto the non-send path.
- **AC-07.10** No other outbound message published by the worker gains buttons: the onboarding-pending message, the sibling-clarification message (that one is FR-08's), and the clip-too-long message keep today's exact plain-text form except where FR-08 says otherwise (BR-12).

### FR-08 — Producer B: core-api reviewed-send buttons + sibling-clarification buttons
*(traces US1; `GradingsService.send` is the **default** path because `autoSend` defaults false)*

- **AC-08.1** `GradingsService.send(id)` attaches the same buttons as FR-07, derived from the grading's own criteria rubric (`grading.criteriaId` → `criteria.rubric` → `normalizeRubric` → `student_reply.buttons`) with payloads `#ilm:<action>:<gradingId>`.
- **AC-08.2** Same skip/degrade rules as AC-07.3–AC-07.7 apply here (shared helper or mirrored logic, each with its own tests).
- **AC-08.3** `send()`'s existing behaviour is otherwise unchanged: `text = reviewedFeedback ?? llmFeedback`, `submissionId: String(...)`, publish to `Q_OUTBOUND`, submission → `sent`, `events.publishStatus`, `grading.sentAt = now()`. Assert every one of these still happens in the same order.
- **AC-08.4** A grading whose criteria row is missing or whose rubric is unparseable ⇒ the message is sent **without** buttons; `send()` must not 500 (NFR-06).
- **AC-08.5** In `pipeline.py`, the multi-active-binding clarification message gains one button per active binding: `title` = the binding's `displayName` (fallback: `zaloUserId`), `action='select_student'`, `payload = f"#ilm:select_student:{binding_id}:{submission_id}"`.
- **AC-08.6** The clarification `text` stays exactly today's string (`f"Bài này của bạn nào vậy ạ? ({names})"`) so the message is still self-explanatory if buttons are dropped or unsupported by the client.
- **AC-08.7** More than `MAX_BUTTONS` active bindings ⇒ **no buttons at all** on the clarification message (today's exact behaviour), plus one warn. Truncating would silently hide a sibling — forbidden.
- **AC-08.8** A binding with `studentId is None` (still `pending`) is never offered as a `select_student` option, even if it somehow appears among the actives.
- **AC-08.9** The clarification branch still `return`s immediately after publishing — no grading, no status change (unchanged).

### FR-09 — Inbound routing: the `#ilm:` branch and the untouched fall-through **(the safety control)**
*(traces US2 — PM's "most-important AC")*

- **AC-09.1** The new branch lives **inside** `if msg.kind == "text":`, as its first statement, and **after** the existing `upsert_submission` and `ensure_binding` calls. No existing statement in `handle()` is reordered, deleted or reworded.
- **AC-09.2** Structure is exactly:
  ```python
  if msg.kind == "text":
      # F11: nhánh nút bấm — TẬP ĐÓNG, chạy TRƯỚC nhánh flag. Trả False => rơi xuống
      # đúng những dòng flag cũ, không sao chép lại.
      if not await self._handle_button_payload(submission_id, msg):
          <the four existing lines, byte-identical>
      return
  ```
  i.e. the unrecognized case reaches **the same code**, not a near-duplicate (PM handoff).
- **AC-09.3** The existing flag reason string `"tin text ngoài luồng nộp bài — bot không hội thoại (mục 3.6)"` and the existing `logger.info("submission %s: text ngoài luồng -> flag, không trả lời", …)` are unchanged character-for-character.
- **AC-09.4** `_handle_button_payload` returns `False` — and therefore the existing flag path runs — for **every** one of these, each its own test case: `None`; `""`; `"xin chào cô"`; `"#ilm"`; `"#ilm:"`; `"#ilm:ack"` (no arg); `"#ilm:ack:"` (empty arg); `"#ilm:ack:abc"` (non-digit); `"#ilm:ack:12 "` / `" #ilm:ack:12"` (whitespace — **no trimming**); `"#ILM:ack:12"` / `"#Ilm:ack:12"` (case — **no folding**); `"#ilm:unknown_action:1"`; `"#ilm:ack:1:2"` (wrong arity); `"#ilm:select_student:1"` (wrong arity); `"#ilm:select_student:1:2:3"`; `"#ilm:ack:1234567890123"` (13 digits, over `arg` max); `"prefix #ilm:ack:1"` (prefix not at position 0); `"#ilm:ack:-1"`; `"#ilm:ack:1.0"`; `"#ilm:ack:٣"` (non-ASCII digit).
- **AC-09.5** For every case in AC-09.4 the assertion is threefold: exactly one `create_flag` with the original reason; **zero** publishes to `Q_OUTBOUND`; zero calls to any of the new endpoints.
- **AC-09.6** A regression test locks the pre-F11 behaviour: a plain text message produces the identical sequence of core-api calls and the identical flag reason as the pre-F11 suite asserted. The pre-existing `pipeline` tests must pass with **unchanged assertions** (NFR-05).
- **AC-09.7** `_handle_button_payload` returns `True` only when prefix + known action + exact arity + all-digit args all hold. It returns `True` (branch handled, stop) even when the action then fails an ownership/state check — those write their own distinct flag (FR-10/11/12) so an advisor can tell a spoof/stale tap from ordinary chatter.
- **AC-09.8** For a non-`text` `kind`, the branch is never entered even if `msg.text` happens to start with `#ilm:` (a caption on an audio submission must still be graded, not treated as a tap).
- **AC-09.9** Parsing is a pure function (`parse_ilm_payload(text) -> (action, args) | None`) with no I/O, unit-tested independently of the pipeline.
- **AC-09.10** The bot sends **no outbound message** on any successful action. Asserted per-action: `publish` mock call count is 0 for `ack`, `request_advisor` and `select_student` alike (design Phần 6 table: "Bot có trả lời? Không" ×3).
- **AC-09.11** The gateway is **not** modified on the inbound side: `webhook.service.ts` still maps `user_send_text → kind:'text'` and carries `message.text` through untouched; no new event name, no new `SubmissionKind`, no new webhook route, no new token scope (BR-09).
- **AC-09.12** Dedup is unchanged: the tap is an ordinary inbound event, so `recordInbound` (48h window) and `claimMessage` (`dedup:{messageId}`) run exactly as before, in the same order.

### FR-10 — Action `ack` → stamp `Grading.studentAckAt`
*(traces US2)*

- **AC-10.1** New endpoint `PATCH /internal/gradings/:id/student-ack`, `InternalTokenGuard`, body `{ zaloUserId: string }` (validated non-empty string).
- **AC-10.2** Grading not found ⇒ **404**. Grading found but `grading.submission.zaloUserId !== body.zaloUserId` ⇒ **403** and **no write** (BR-05 — this is the injection defence).
- **AC-10.3** Owner match and `studentAckAt IS NULL` ⇒ set it to `now()`; response `{ id, studentAckAt, alreadyAcked: false }`.
- **AC-10.4** Owner match and `studentAckAt` already set ⇒ **no write**, timestamp unchanged, response `{ …, alreadyAcked: true }`, HTTP 200. First tap wins (BR-11, idempotency).
- **AC-10.5** The endpoint writes **only** `studentAckAt`. `totalScore`, `levelCode`, `levelLabel`, `scores`, `llmFeedback`, `reviewedFeedback`, `sentAt`, `autoSent` and the submission row are untouched (asserted by fingerprinting the row before/after).
- **AC-10.6** No `events.publishStatus`, no queue publish, no outbound message from this endpoint.
- **AC-10.7** Worker side: `CoreApiClient.student_ack(grading_id, zalo_user_id)`; `zalo_user_id` is taken **only** from `msg.zaloUserId` (the gateway-derived, signature-verified sender), never from the payload string.
- **AC-10.8** 403 or 404 ⇒ terminal: the worker writes a flag with reason `"nút #ilm:ack không hợp lệ (grading {id}) — không thuộc người gửi"` (403) / `"…không tồn tại"` (404), logs a warn, returns `True`, sends nothing, and does **not** raise (a retry could never succeed).
- **AC-10.9** 5xx / network error ⇒ the exception propagates so `rabbit_consumer`'s existing retry→DLQ loop applies (unchanged mechanism).
- **AC-10.10** A redelivery of the same tap `messageId` produces the same end state: `studentAckAt` unchanged (AC-10.4), no duplicate side effect other than the flags caveat in BR-15.
- **AC-10.11** F9's invariant still holds for every other path: nothing except this endpoint ever writes `studentAckAt`.

### FR-11 — Action `request_advisor` → one `flags` row, no reply
*(traces US2)*

- **AC-11.1** Handled by calling the **existing** `POST /internal/flags` with the **tap's own** `submission_id` (the row the pipeline already upserted for this text message). No new endpoint, no new table, no new advisor mechanism (design Phần 6: "đúng cơ chế tư vấn đang theo dõi").
- **AC-11.2** Because the flag targets the tap's own submission — which by construction has `zaloUserId == msg.zaloUserId` — there is no cross-student write surface at all for this action.
- **AC-11.3** Reason string is fixed and contains the referenced grading id: `f"học viên bấm nút nhờ tư vấn (grading {grading_id})"`. The id is guaranteed all-digit by AC-09.7, so no student-authored text can ever reach this string (BR-06).
- **AC-11.4** The referenced grading is **not** required to exist and is **not** validated — the flag is advisory text for a human, and a lookup would add a failure mode for zero benefit. Documented, tested with a non-existent id.
- **AC-11.5** Zero outbound publishes; the bot never confirms the request to the student.
- **AC-11.6** The submission row for the tap keeps `status='received'` — `request_advisor` changes no status (a tap is not a submission).
- **AC-11.7** Distinguishable from ordinary chatter: the reason string differs from AC-09.3's, so the dashboard flag list shows which flags came from a button.

### FR-12 — Action `select_student` → bind the pending submission and re-drive it
*(traces US2)*

- **AC-12.1** New endpoint `PATCH /internal/submissions/:id/select-student`, `InternalTokenGuard`, body `{ zaloUserId: string, bindingId: number }`.
- **AC-12.2** Server-side checks, in order, each with its own test: submission exists (else **404**); `submission.zaloUserId === body.zaloUserId` (else **403**); binding exists **and** `binding.zaloUserId === body.zaloUserId` **and** `binding.status === 'active'` **and** `binding.studentId != null` (else **403**); `submission.studentId IS NULL` **and** `submission.status === 'received'` (else **409** with code `already_selected`).
- **AC-12.3** All checks pass ⇒ set `submission.studentId = binding.studentId` and return the row including `id, messageId, zaloUserId, kind, mediaUrlZalo, receivedAt, studentId, status` — everything the worker needs to rebuild a `SubmissionMessage` without a second round-trip.
- **AC-12.4** On 409 the row is **not** modified (a second, different tap can never re-point an already-bound submission ⇒ no double grading).
- **AC-12.5** The endpoint publishes nothing and changes no status; `events.publishStatus` may be called for consistency with the sibling `PATCH /internal/submissions/:id` **only if** the status actually changes — since it does not, it is not called.
- **AC-12.6** Worker: on 200 it republishes a `SubmissionMessage` onto `Q_SUBMISSIONS` rebuilt from the returned row: `{v:1, messageId: <row.messageId>, eventName:'user_send_audio'|'user_send_video' derived from kind or the stored original, kind: row.kind, zaloUserId: row.zaloUserId, mediaUrl: row.mediaUrlZalo, receivedAt: row.receivedAt}`. Idempotent because `POST /internal/submissions` upserts by `messageId`.
- **AC-12.7** The republish uses a **second** publisher injected into `SubmissionPipeline` (`publish_submission`, wired in `main.py` as `lambda msg: rabbit.publish(Q_SUBMISSIONS, msg)`), defaulting to `None`. When it is `None`, the worker instead writes a flag (`"học viên đã chọn học viên X — cần chấm lại thủ công"`) and stops. Existing constructor call sites and tests keep working unchanged.
- **AC-12.8** 403/404/409 ⇒ terminal, exactly like AC-10.8: distinct flag reason per case (`không thuộc người gửi` / `binding không hợp lệ` / `bài đã được gán trước đó`), one warn, `True` returned, **no** outbound, **no** republish, no exception.
- **AC-12.9** Zero outbound publishes on the success path too — the student gets no "đã ghi nhận" reply. The next message they receive is the grading feedback produced by the re-driven pass.
- **AC-12.10** Tapping a second, different sibling button after a successful first tap yields 409 ⇒ flag + stop; the submission is graded exactly once.
- **AC-12.11** The re-driven pass must not re-ask: see FR-13. A test drives the full loop (clarify → tap → republish → second pass) with mocks and asserts the clarification message is published **exactly once** across both passes.

### FR-13 — `submission.studentId` takes precedence over binding resolution
*(traces US2; the mechanism that makes FR-12's re-drive terminate)*

- **AC-13.1** After `upsert_submission`, `pipeline.handle` reads `submission.get("studentId")`. When it is a non-null integer, **both** the "no active binding" branch and the "multiple active bindings" branch are skipped and that `studentId` is used.
- **AC-13.2** When it is null, behaviour is byte-identical to today (pending ⇒ onboarding message + stop; >1 active ⇒ clarification + stop; exactly 1 ⇒ use it).
- **AC-13.3** The subsequent `update_submission(..., {"studentId": …, "status": "processing"})` call is unchanged in both cases (harmless re-write of the same id).
- **AC-13.4** This changes observable behaviour in exactly one pre-existing scenario — a RabbitMQ retry of a submission whose `studentId` was already stored — where it is strictly more correct (it reuses the resolved student instead of re-resolving). Called out here so QA does not file it as a regression.
- **AC-13.5** `ensure_binding` is still called on every submission, in the same position, even when `studentId` is already set (onboarding rows must keep being created for new Zalo users).

### FR-14 — Settings key and dashboard label
*(traces US3)*

- **AC-14.1** `setting-defs.ts` gains `{ key: 'zalo.buttons_template_type', kind: 'string', masked: false }`. No other entry is modified or reordered.
- **AC-14.2** Writing it via `PUT /settings/zalo.buttons_template_type` mirrors the **raw string** to Redis `config:zalo.buttons_template_type` and publishes `config:changed` — the existing `SettingsService` path, no new code.
- **AC-14.3** Setting it to `''` (empty) is accepted and means "omit the field" (AC-04.2) — the documented way to revert.
- **AC-14.4** `dashboard/src/i18n/index.ts` gains `'settings.field.zalo.buttons_template_type'` in **both** the `vi` and `en` blocks. No other dashboard change: `Settings.tsx` renders the key automatically under the existing `zalo.` group.
- **AC-14.5** No `.env` variable and no `ENV_FALLBACKS` entry is added (v1.2: application config lives in settings, not `.env`).

### FR-15 — Observability
*(traces US2/US3 — how the owner verifies the first real send)*

- **AC-15.1** One `logger.info` per handled action, format `"submission %s: nút #ilm:%s -> %s"` (submission id, action, outcome) — enough to satisfy design Phần 10 §6's `docker compose logs grading-worker --tail 20` check.
- **AC-15.2** One `logger.warn` per dropped buttons block in the gateway, naming which rule fired (count / title / payload / shape) — so the first real send can be diagnosed without a debugger.
- **AC-15.3** Log lines never contain the raw student text beyond the already-parsed action and numeric args (no new PII surface).
- **AC-15.4** No log line is added to the plain-text send path when no buttons are present (log volume unchanged for today's traffic).

---

## 4. Non-functional requirements

- **NFR-01 (Security — the payload is bound to the sender).** The `zaloUserId` used in every ownership check comes **only** from `SubmissionMessage.zaloUserId`, which the gateway derived from a HMAC-verified webhook's `sender.id`. It is never taken from, and never influenced by, the payload string. Every cross-row action (`ack`, `select_student`) is authorised **server-side in core-api**, not in the worker; the worker's checks are convenience only. A student who types `#ilm:ack:<someone else's grading id>` by hand gets a 403 and a flag — never a write. Test: two students, student B taps A's grading id ⇒ 403, A's `studentAckAt` unchanged, B gets no reply.
- **NFR-02 (Performance).** F11 adds **zero** network round-trips to the plain-text send path and at most one Redis `getConfig` (in-process cached) to the buttons path. Payload construction and parsing are pure and O(number of buttons ≤ 5). No new queue hop except FR-12's deliberate single republish.
- **NFR-03 (Availability / no new failure mode).** A malformed `student_reply`, an unreadable rubric, an unreachable Redis config read, or an over-limit button set must all degrade to **today's plain-text message**, never to an exception, never to a blocked send. Failure of the buttons feature must not be able to stop feedback from reaching a student.
- **NFR-04 (Boundary preservation).** Across the whole feature there is exactly **one** producer of outbound text per existing call site and **zero** new outbound messages. A test greps the F11 diff for new `publish(Q_OUTBOUND` / `_publish_outbound(` call sites: the count must be 0.
- **NFR-05 (Regression).** Every pre-existing test in `core-api`, `zalo-gateway`, `grading-worker` and the `dashboard` build passes with **unchanged assertions**. Editing an existing assertion to accommodate F11 is a spec violation, not a fix (F9/F10 precedent).
- **NFR-06 (Compatibility).** Old queue messages without `buttons` and old `blocked_48h` records remain valid; a gateway deployed before the worker (or vice versa) behaves correctly because `buttons` is optional in both directions.
- **NFR-07 (Idempotency).** Every action is safe under (a) the student tapping twice and (b) RabbitMQ redelivering the same `messageId`: `ack` first-tap-wins, `select_student` 409-guarded, `request_advisor` documented-duplicate (BR-15).
- **NFR-08 (Localisation).** Every user-visible string added (button titles come from rubric config; the two settings labels) exists in **vi** and **en** where the dashboard renders it; system messages to students remain vi-only as today.

---

## 5. Use cases

### UC-1 — Student acknowledges feedback (happy path)
- **Actor:** student (Zalo user). **Secondary:** grading-worker, core-api, zalo-gateway.
- **Preconditions:** submission graded; `student_reply.buttons` contains `{title:"Em đã xem", action:"ack"}`; the message was sent (48h window open); `Grading.studentAckAt IS NULL`.
- **Main flow:** (1) student taps "Em đã xem"; (2) Zalo delivers `user_send_text` whose `message.text` is `#ilm:ack:123`; (3) gateway records inbound (48h refresh), dedups, publishes `kind:'text'`; (4) worker upserts the submission row, ensures binding, parses the payload; (5) `PATCH /internal/gradings/123/student-ack {zaloUserId}` → owner OK, `studentAckAt = now()`; (6) worker logs and returns.
- **Alternative A1:** already acked ⇒ `alreadyAcked:true`, timestamp preserved, same silent outcome.
- **Exception E1:** grading belongs to another Zalo user ⇒ 403 ⇒ flag "không thuộc người gửi", no write, no reply.
- **Exception E2:** core-api 5xx ⇒ exception ⇒ retry→DLQ (existing loop).
- **Postconditions:** `studentAckAt` set exactly once; **no** message sent to the student; no `flags` row on the happy path.

### UC-2 — Student asks for a human explanation
- **Actor:** student. **Preconditions:** as UC-1 with a `request_advisor` button.
- **Main flow:** tap → `#ilm:request_advisor:123` → worker creates one `flags` row on the tap's own submission with the fixed reason → advisor sees it on the dashboard flag list.
- **Alternative A1:** grading 123 no longer exists ⇒ flag is still created (AC-11.4).
- **Exception E1:** `POST /internal/flags` 5xx ⇒ retry→DLQ.
- **Postconditions:** one flag row; **no** reply; submission status untouched.

### UC-3 — Sibling disambiguation
- **Actor:** student (one Zalo account, two active bindings). **Preconditions:** an audio submission arrived; ≥2 active bindings, ≤5.
- **Main flow:** (1) worker publishes today's clarification text **plus** one `select_student` button per binding and stops; (2) student taps a sibling; (3) `#ilm:select_student:<bindingId>:<submissionId>` arrives; (4) `PATCH /internal/submissions/<id>/select-student` validates ownership + binding + state and sets `studentId`; (5) worker republishes the original `SubmissionMessage` onto `submissions`; (6) second pass sees `submission.studentId` set (FR-13), skips the ambiguity branch, and grades normally.
- **Alternative A1:** >5 active bindings ⇒ no buttons, plain-text question exactly as today; advisor resolves manually.
- **Alternative A2:** student replies with free text ("của em Minh") instead of tapping ⇒ ordinary flag path, unchanged (this is today's behaviour and stays available).
- **Exception E1:** second tap after a successful one ⇒ 409 ⇒ flag, no second grading.
- **Exception E2:** `publish_submission` not wired ⇒ flag "cần chấm lại thủ công", no silent loss.
- **Exception E3:** binding belongs to a different Zalo user ⇒ 403 ⇒ flag, no write.
- **Postconditions:** the submission is graded exactly once, against exactly one student; at most one clarification message was ever sent.

### UC-4 — Ordinary student text (the boundary regression case)
- **Actor:** student. **Main flow:** any text that is not a valid `#ilm:` payload → flag with the pre-F11 reason, **no reply**, identical call sequence to pre-F11.
- **Alternative A1:** text is `#ilm:unknown_action:1` or any AC-09.4 string ⇒ identical to the main flow (this is the safety mechanism).
- **Postconditions:** exactly one flag; zero outbound; system state indistinguishable from pre-F11.

### UC-5 — Buttons outside the 48h window
- **Actor:** system. **Preconditions:** last inbound > 48h ago; guard enabled.
- **Main flow:** consumer blocks the send, `LPUSH blocked_48h` with the buttons included in the JSON, warns, returns without retry — exactly today's behaviour plus one extra field in the stored record.
- **Postconditions:** nothing sent; advisor handles manually; no retry, no DLQ.

### UC-6 — Token expires mid-send with buttons
- **Actor:** system. **Main flow:** first `trySend` returns `-216` → `refreshNow()` → one retry **with the same buttons payload** → success.
- **Exception E1:** refresh fails ⇒ throw `'Token expired and refresh failed'` ⇒ retry→DLQ (unchanged).
- **Exception E2:** second `-216` ⇒ generic throw (unchanged).

### UC-7 — Admin configures `template_type` after the first real OA send
- **Actor:** admin (dashboard, admin-only Settings screen).
- **Preconditions:** real Zalo credentials exist; a first real send has been attempted.
- **Main flow:** send fails with a Zalo template error → admin sets `zalo.buttons_template_type` → `config:changed` flushes the gateway cache → next send includes the field → success.
- **Alternative A1:** the first send succeeds without it ⇒ key stays empty; §9 OQ-1 is closed as "not needed" and the assumption is recorded in the architecture changelog.
- **Postconditions:** the open question is resolved by observation, with no redeploy.

---

## 6. Business rules

| # | Rule |
| :-- | :-- |
| BR-01 | The action set is **closed**: `ack`, `request_advisor`, `select_student`. A fourth action requires editing all three contracts copies **and** `pipeline.py`, and re-approving the boundary relaxation. |
| BR-02 | Anything that is not an exact prefix + known action + exact arity + all-digit args falls through to the pre-F11 text→flag path, unchanged. This is the boundary control; it is tested as a first-class requirement, not as an edge case. |
| BR-03 | **No action ever produces a reply.** The bot never composes free-form text. All three actions are silent by design (design Phần 6 table). |
| BR-04 | The bot still never messages parents, never nags, and still does not converse — buttons are a fixed, pre-authored affordance, not a conversation. |
| BR-05 | Authorisation is always server-side in core-api and always keyed on the webhook-derived sender. The payload string is data, never authority. |
| BR-06 | Payload arguments are `^[0-9]{1,12}$`. No student-authored text can enter a payload, a flag reason, a log line, a query or a path. Payloads are never truncated. |
| BR-07 | The buttons block is all-or-nothing: any limit or shape violation drops the entire block and sends plain text. A partially rendered button set is never sent. |
| BR-08 | The 48h guard, the `blocked_48h` list and the not-retried semantics are untouched by F11. Buttons are extra payload on an already-guarded send, never a new send path. |
| BR-09 | `-216` refresh-and-retry-once stays a single shared code path for both send variants. |
| BR-10 | No new webhook event type, no new `SubmissionKind`, no new Zalo token scope, no new queue/exchange/consumer, no new dependency. |
| BR-11 | `Grading.studentAckAt` is written **only** by `PATCH /internal/gradings/:id/student-ack`, only on the first tap, and never cleared. |
| BR-12 | Buttons are attached only to (a) grading-feedback messages, which carry a grading id, and (b) the sibling-clarification message. Onboarding, clip-too-long and any operational message stay plain text. |
| BR-13 | A submission is graded at most once: `select_student` is 409-guarded and the re-driven pass is made terminal by `submission.studentId` precedence. |
| BR-14 | `select_student` is system-generated only; it is ignored if a teacher puts it in `student_reply.buttons`. |
| BR-15 | Duplicate `flags` rows are tolerated (a redelivered or repeated `request_advisor` tap may produce two) — this matches today's un-deduped text→flag behaviour; inventing a dedupe mechanism here is out of scope. |
| BR-16 | The three `contracts` copies must stay identical (existing repo rule, `CLAUDE.md`). |

---

## 7. Data dictionary

### 7.1 `OutboundButton` (queue message, all three languages)

| Field | Type | Required | Validation |
| :-- | :-- | :-- | :-- |
| `title` | string | yes | non-empty after trim; ≤ 100 chars; free text (teacher/system authored) |
| `action` | enum | yes | `ack` \| `request_advisor` \| `select_student` |
| `payload` | string | yes | starts with `#ilm:`; ≤ 1000 chars; matches §2 grammar |

`OutboundMessage.buttons`: optional array, 1…5 entries; absent/empty ⇒ plain-text message.

### 7.2 Payload arguments

| Action | Arg 1 | Arg 2 | Source of truth |
| :-- | :-- | :-- | :-- |
| `ack` | `gradingId` — int, 1…12 digits | — | `Grading.id` from `POST /internal/gradings` response |
| `request_advisor` | `gradingId` — int, 1…12 digits | — | same; not validated against the DB (AC-11.4) |
| `select_student` | `bindingId` — int | `submissionId` — int | `ZaloBinding.id`, `Submission.id` known at clarification time |

### 7.3 `PATCH /internal/gradings/:id/student-ack`

| Field | Type | Required | Validation |
| :-- | :-- | :-- | :-- |
| `id` (path) | int | yes | `ParseIntPipe`; 404 if absent |
| `zaloUserId` (body) | string | yes | non-empty; must equal `grading.submission.zaloUserId` else 403 |

Response `{ id: number, studentAckAt: string(ISO), alreadyAcked: boolean }`.

### 7.4 `PATCH /internal/submissions/:id/select-student`

| Field | Type | Required | Validation |
| :-- | :-- | :-- | :-- |
| `id` (path) | int | yes | `ParseIntPipe`; 404 if absent |
| `zaloUserId` (body) | string | yes | must equal `submission.zaloUserId` else 403 |
| `bindingId` (body) | int | yes | binding must exist, be `active`, have `studentId != null`, and have the same `zaloUserId` else 403 |

Preconditions: `submission.studentId IS NULL` and `submission.status = 'received'`, else **409 `already_selected`**.
Response: the submission row (`id, messageId, zaloUserId, kind, mediaUrlZalo, receivedAt, studentId, status`).

### 7.5 Setting

| Key | Kind | Masked | Default | Meaning |
| :-- | :-- | :-- | :-- | :-- |
| `zalo.buttons_template_type` | string | no | `''` (unset) | Empty ⇒ omit `template_type` (design Phần 6 shape). Non-empty ⇒ emit `"template_type": "<value>"` inside `message.attachment.payload`. |

### 7.6 Columns read/written

| Column | F11 role |
| :-- | :-- |
| `gradings.student_ack_at` | **written** (first tap only) — the column F9 created and never writes |
| `submissions.student_id` | written by `select-student` only when currently NULL |
| `flags.submission_id` / `flags.reason` | written via the existing endpoint; four new fixed reason strings |
| `gradings.total_score` / `level_code` / `level_label` | read-only, by F10 templates — F11 must not recompute them (F9 note) |
| `zalo_bindings.*` | read-only |

---

## 8. What is testable offline vs owner-blocked

**Testable now, no credentials (must all be automated):** the contract shape in all three languages ·
the exact JSON body produced by `sendText` for both variants (fetch mocked) · every FR-03 limit and
degrade rule · `template_type` on/off · the one-line consumer diff and every guard/`blocked_48h`/
`-216` preservation AC · the pure payload parser against all AC-09.4 strings · branch routing and the
byte-identical fall-through · all three action handlers with core-api mocked · the two new endpoints
against the existing test harness (403/404/409/idempotency) · the FR-12 → FR-13 re-drive loop ·
duplicate-tap and redelivery idempotency · dashboard build + i18n key presence.

**Testable with the stack up, still no credentials (design Phần 10 §6):** publish
`{"kind":"text","text":"#ilm:ack:1"}` onto `submissions` via the RabbitMQ management API and confirm
in `docker compose logs grading-worker` that the button branch ran; publish an ordinary text and
confirm the flag branch is unchanged; confirm `gradings.student_ack_at` moved from NULL via `psql`.

**Owner-blocked (must be reported as "owner-acceptance pending", never as passing):** whether the
real Zalo OA accepts a buttons-only payload without `template_type`; whether `oa.query.show` renders
and returns exactly as documented; the real 5-button maximum; whether tapping a button refreshes the
48h window in practice. Same deferred-credentials treatment as Zalo M1.8 / Sheets M2.4 / LLM keys M3.

---

## 9. Assumptions, dependencies, open questions

**Assumptions**
- **A-01** `oa.query.show` taps return as an ordinary `user_send_text` whose `message.text` **is** the payload string (design Phần 6, verified 2026-08-19). If false, the whole inbound half is inert — but nothing regresses, because unmatched text simply flags.
- **A-02** Zalo allows at most **5** buttons per consulting-template message. Sources are not authoritative; `MAX_BUTTONS` is a named constant so one edit changes it, and the over-limit rule degrades to today's plain text rather than to an error.
- **A-03** `student_reply.buttons` entries are `{title, action}` (design Phần 3); the payload is derived, never authored, so a teacher can never author a payload string.
- **A-04 (deviation from PM US1).** PM asked for `text ≤ 2000` to be "validated, not just documented". Enforcing it by truncating or rejecting would change what happens to today's long feedback messages — a regression risk unrelated to buttons. Specified instead as **warn-and-send-unchanged** (AC-03.6); keeping feedback text inside 2000 chars is F10's template concern.
- **A-05 (scope addition beyond PM's file list).** `GradingsService.send()` (core-api) is included as a producer (FR-08). `classes_config.autoSend` defaults **false**, so the reviewed-send path is the *primary* way feedback reaches students; omitting it would mean the `ack` button almost never appears.
- **A-06 (scope addition).** `select_student` is specified to actually resolve the ambiguity (bind + re-drive, FR-12/FR-13) rather than merely record a choice. Recording alone would still require an advisor, which is what the design says this action removes. This is the largest single piece of F11 — if the coordinator wants a smaller first cut, drop FR-12's re-drive (AC-12.7's `publish_submission=None` fallback is exactly that reduced behaviour, already specified and testable).
- **A-07** F9's migration is deployed, so `Grading.studentAckAt` exists. F11 adds **no** migration.

**Dependencies**
- F9 (`studentAckAt` column) — satisfied, `F9-backend.md` is DONE.
- F8 (`student_reply` carried by `normalizeRubric` in both languages) — satisfied; note it is copied **verbatim and unvalidated**, hence AC-07.5's defensive parsing.
- F10 (feedback text/templates) — no code dependency; F11 must not touch it.
- Owner: real Zalo OA credentials for final acceptance (§8).

**Open questions**
- **OQ-1 (owner-blocked, do not block the build).** Does a buttons-only payload need `template_type`? Shipped per the design's verified shape (omitted) behind `zalo.buttons_template_type` (FR-04) so it can be fixed from the dashboard without a redeploy. Verified on the first real send; QA reports it as owner-acceptance pending.
- **OQ-2 (decided, recorded).** `request_advisor` flags the tap's **own** submission row rather than the referenced grading's — it removes an ownership check and an endpoint, and the advisor sees the grading id in the reason. Reverse only if the flag list must join to the graded submission.
- **OQ-3 (accepted).** Duplicate `request_advisor` flags are possible (BR-15). Deduping would need a new conditional endpoint; today's text→flag path has the same property.
- **OQ-4 (for the coordinator).** If a `select_student` button set and a `student_reply` button set ever needed to coexist on one message, the 5-button budget would have to be split. Not possible today (the two messages are different messages); flagged in case F12 adds more button types.

---

## 10. Traceability

| PM story | FRs | ACs |
| :-- | :-- | :-- |
| US1 — outbound messages can carry buttons | FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-08 | 8 + 7 + 8 + 8 + 5 + 10 + 9 = 55 |
| US2 — closed inbound action set, everything else unaffected | FR-09, FR-10, FR-11, FR-12, FR-13 | 12 + 11 + 7 + 11 + 5 = 46 |
| US3 — payload shape confirmed against a real OA | FR-04, FR-14, FR-15 | 6 + 5 + 4 = 15 |
| Cross-cutting | NFR-01…NFR-08, BR-01…BR-16 | — |

**Total: 15 FRs, 116 ACs, 8 NFRs, 16 business rules, 7 use cases.**

## Blockers / open questions

None blocking. One owner-blocked item (OQ-1, `template_type`) is specified behind a config flag and
must be reported by QA as owner-acceptance pending, not as passing.

## Notes for the next role

- **Backend (gateway):** FR-05's AC-05.1 is literal — `git diff services/zalo-gateway/src/outbound/outbound.consumer.ts` must show **one** changed line. All button logic belongs inside `sendText`; do not fork it (FR-02/FR-06).
- **Backend (worker):** write `parse_ilm_payload` as a standalone pure function first and test it against all of AC-09.4 before touching `pipeline.py`; then the pipeline change is the four-line shape in AC-09.2. `_handle_button_payload` returning `False` must fall into the **existing** flag lines, not a copy.
- **Backend (core-api):** two new endpoints only (FR-10, FR-12) plus the FR-08 producer and the FR-14 setting. `GET /internal/criteria/:courseId` must stay verbatim (F8 AC-08.2). No migration.
- **Frontend:** two i18n lines (AC-14.4). Nothing else — `Settings.tsx` renders new keys automatically. **No UX work is needed** (no new component, layout or flow).
- **QA:** FR-09 is the feature. Treat every string in AC-09.4 as an individual test case, and assert the fall-through by comparing the call sequence and flag reason to the pre-F11 baseline, not merely "it still flags". Second priority: NFR-01's cross-student spoof test and FR-05/FR-06's preservation ACs. Report OQ-1 as owner-acceptance pending.
