# F11 · QA/QC — Zalo interactive buttons (closed `#ilm:` action set)

- **Owner role:** qa
- **Feature:** F11 — `OutboundMessage.buttons` in 3 contracts; gateway attachment builder; `#ilm:` closed-action inbound branch; 2 new `/internal/*` endpoints; 1 setting key.
- **Status:** DONE
- **Verdict:** **PASS** (with one owner-acceptance-pending item, OQ-1 — see §6)
- **Last updated:** 2026-08-23
- **Depends on:** `F11-ba.md` (15 FR / 116 AC / 16 BR), `F11-backend.md`, `Idea/20260819-ChamDiemRubricV2.md` Phần 6

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F11-ba.md` — authoritative ACs.
- `docs/dev-team-roles/tasks/F11-backend.md` — implementation claims, deviations A-04/A-05/A-06, OQ-1 owner-blocked.

## Checklist

- [x] Read protocol, F11-ba.md, F11-backend.md, design Phần 6
- [x] Run zalo-gateway suite (Docker) — CONFIRMED 7 suites / 61 tests, `tsc --noEmit` clean
- [x] Run core-api suite (Docker) — CONFIRMED 41 suites / 774 tests, `tsc --noEmit` clean
- [x] Run grading-worker suite (pytest) — CONFIRMED 377 passed
- [x] Run dashboard build (Docker) — `tsc -b && vite build` exit 0
- [x] FR-09 crux: 21 spec strings + ~150 adversarial extensions — no fail-open found
- [x] NFR-01: cross-student injection at both endpoints (27 independent tests)
- [x] Preservation: `outbound.consumer.ts` diff `1 1`; 48h guard; `blocked_48h`
- [x] Preservation: `-216` refresh-and-retry-once; attachment built once (byte-identical retry)
- [x] Preservation: 3 contracts byte-identical; Python `to_dict()` omits `buttons` for `None` and `[]`
- [x] `#ilm:` branch ordering before text→flag; falls into the *same* lines, not a copy
- [x] Idempotency: double-tap, redelivery, racing taps (both endpoints)
- [x] A-04 (>2000 chars warn + send unchanged); all-or-nothing limit rule
- [x] Review the one changed pre-existing assertion — strengthened, not weakened
- [x] Cross-language producer parity (TS `buildReplyButtons` vs Python `build_reply_buttons`)
- [x] Write results + verdict

---

# Outputs — test design and results

Technique mix: equivalence partitioning (payload shape classes), boundary values (1/12/13 digits,
5/6 buttons, 100/101 title, 1000/1001 payload, 2000/2001 text), decision tables (the 404/403/403/409
ladder), state transitions (clarify → tap → republish → re-drive), and error guessing (homoglyphs,
zero-width characters, dict-method names as actions, JSON break-out).

All QA probes were written **independently** of the developer's test files (own fakes, own re-typed
case lists) so a silently shortened dev list could not hide a hole. Probe files were run from the
service trees and **deleted afterwards** — the repo contains no QA artefacts (verified via
`git status`).

## 1. Existing suites — claims confirmed, all four green

| Suite | Command | Baseline | Backend claimed | **QA measured** |
| :-- | :-- | :-- | :-- | :-- |
| zalo-gateway | Docker `npm ci && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2` | 5 / 26 | 7 suites / 61 | **7 suites / 61 pass**, exit 0 |
| core-api | same (+ `npx prisma generate`) | 39 / 723 | 41 suites / 774 | **41 suites / 774 pass**, exit 0 |
| grading-worker | `.venv/Scripts/python -m pytest -q` | 261 | 377 | **377 passed in 9.45 s** |
| dashboard | Docker `npm ci && npm run build` | — | green | **`tsc -b && vite build` exit 0, 10.72 s** |

Note on the core-api number: the raw run reported 42 suites / 801 because my own probe file was in
the tree at the time. Running that probe alone gives exactly 1 suite / 27 tests, so the delivered
baseline is 42−1 = **41 suites** and 801−27 = **774 tests** — the backend's figure, exactly.

## 2. FR-09 — the safety control (the crux). PASS

**Parser level** (`grading_worker/buttons.py::parse_ilm_payload`), ~150 independent cases, all
returned `None` (fall-through) or the correct tuple:

| Partition | Representative cases | Result |
| :-- | :-- | :-- |
| Unicode/homoglyph prefix | `＃ilm:ack:1`, `#ilm：ack:1`, `#іlm:ack:1` (Cyrillic і), `#ιlm:` (Greek), ZWSP inside prefix, NBSP/BOM/RTL-mark before it | all fall through |
| Case variants | `#ilm:ACK:1`, `#ilm:Ack:1`, `#ilm:aCk:1`, `#ilm:REQUEST_ADVISOR:1`, `#ilm:Select_student:1:2` (7 cases) | all fall through — **no case folding** |
| Whitespace | leading/trailing space, `\t`, `\n`, `\r\n`, `\r`, NBSP, space around the action, space before the digit (12 cases) | all fall through — **no trim** |
| Trailing newline specifically | `#ilm:ack:12\n` | falls through — confirms `re.fullmatch` not `^…$` |
| Unknown / near-miss actions | `ack2`, `acks`, `ac`, `a`, `""`, `unknown_action`, `drop_table`, `admin`, `__init__` (16 cases) | all fall through |
| Dict-method names as action | `keys`, `get`, `pop`, `items`, `update`, `clear`, `copy`, `setdefault`, `values` | all fall through (`_ARITY.get` is a plain dict lookup, no attribute leak) |
| Malformed arg on a valid action | `-1`, `+1`, `1.0`, `1e3`, `0x1`, `1_0`, `1,2`, `null`, `None`, `NaN`, `Infinity`, `../../etc/passwd`, `${7*7}`, `{{7*7}}`, `%s`, `<script>`, `1'; DROP TABLE gradings;--` (24 cases) | all fall through |
| Non-ASCII digits | `٣` `١٢` (Arabic-Indic), `１２` (fullwidth), `०` (Devanagari), `۱`, `₁`, `¹`, `Ⅰ`, `①` | all fall through — confirms `[0-9]` not `\d` |
| Arity | missing/extra/empty segments across all 3 actions (11 cases) | all fall through |
| Prefix position | `prefix #ilm:ack:1`, `a#ilm:…`, `##ilm:…`, two payloads concatenated, payload embedded in a sentence | all fall through |
| Non-`str` types | `int`, `float`, `bool`, `bytes`, `bytearray`, `list`, `dict`, `tuple`, `set`, bare `object` | all return `None`, **none raised** |
| DoS shapes | 1 M-digit arg (0.000 s), 500 k colons (0.017 s), 1 MB junk after prefix, NUL bytes | fall through, no hang |
| **Must be handled** (fail-closed check) | `#ilm:ack:1`, 12 digits, `0`, leading zeros, `request_advisor:42`, `select_student:9:50`, 12+12 digits, `str` subclass | all parsed correctly |

**Pipeline level** (`SubmissionPipeline.handle`), 36 strings (the spec's 21 re-typed + 15 QA
extensions), each asserting all four things:
- call sequence is exactly `upsert_submission → ensure_binding → create_flag` (unchanged from pre-F11);
- exactly **one** flag, reason byte-identical: `"tin text ngoài luồng nộp bài — bot không hội thoại (mục 3.6)"`;
- **zero** `Q_OUTBOUND` publishes;
- **zero** calls to `student_ack` / `select_student`.

All 36 pass. **AC-09.1/09.2 verified structurally**: the branch is the first statement inside
`if msg.kind == "text":` at `pipeline.py:93-101`, after `upsert_submission` and `ensure_binding`,
and the `False` return falls into the *original* flag lines (not a duplicate) — the whole
pre-F11 body is now simply indented one level under `if not await self._handle_button_payload(...)`.

**AC-09.8**: for `kind` in `audio/video/image/sticker/file` with `text="#ilm:ack:1"`, the button
branch is never entered and the text-flag reason is never written.

**AC-09.10/BR-03**: zero outbound asserted per action across 9 outcomes (`ack` ok / already /
403 / 404; `select_student` ok / 403 not_owner / 403 invalid_binding / 404 / 409). The bot never
confirms a tap on any path.

## 3. NFR-01 — injection safety. PASS

Root of the defence verified: `webhook.service.ts:47` derives
`zaloUserId = event.sender?.id ?? event.follower?.id` from the HMAC-verified webhook envelope —
**never** from `event.message.text`. The gateway's inbound half is unmodified (`git status` on
`src/webhook/`, `rabbit.service.ts`, `redis.service.ts` is empty), so a student-typed `#ilm:` string
travels only as `SubmissionMessage.text` and is never a source of identity.

Direct cross-student test (student A owns grading 100 / submission 500; student B is the attacker):

| Case | Expected | Result |
| :-- | :-- | :-- |
| B taps A's grading id | 403, no write, A's row byte-identical (fingerprinted before/after) | PASS |
| 9 near-miss senders: `""`, `" "`, `zalo-a`, `ZALO-A`, `zalo-A `, ` zalo-A`, `zalo-A\n`, `zalo-%`, `zalo-A' OR '1'='1` | all 403, `updateMany` never called | PASS |
| B tries to clear an ack A already made | 403, timestamp frozen | PASS |
| B taps A's submission (select-student) | 403 `not_owner`, row untouched | PASS |
| B taps A's submission using B's **own** binding | 403 `not_owner`, row untouched | PASS |
| A taps own submission pointing at **B's** binding | 403 `invalid_binding`, no write | PASS |
| pending binding / binding with `studentId=null` / non-existent binding | 403 `invalid_binding`, no write | PASS |
| check order 404 → 403 owner → 403 binding → 409 | on a non-owner, the binding is **never even read** (no row-state leak) | PASS |

Worker side: `student_ack` is always called as `(parsed_grading_id, msg.zaloUserId)` — the id comes
from the payload, the identity always from the message. Same for `select_student`.
`%`, `'`, `\n` in a sender string are compared as exact strings (Prisma parameterised, no LIKE).

## 4. Preservation ACs. PASS

- **AC-05.1** `git diff --numstat services/zalo-gateway/src/outbound/outbound.consumer.ts` ⇒ **`1 1`**. The single line is `sendText(msg.zaloUserId, msg.text)` → `sendText(msg.zaloUserId, msg.text, msg.buttons)`.
- **AC-05.2–05.7** re-verified with buttons-carrying messages: malformed drop, `getConfigBool('limits.outbound_48h_guard', true)`, `LPUSH blocked_48h` containing `buttons`, no retry, error propagation.
- **AC-02.1 / NFR-06 wire compat** — asserted at the **raw string** level, not the parsed level: a plain send produces exactly `{"recipient":{"user_id":"u1"},"message":{"text":"hi"}}`. Identical for `buttons` = `undefined` / `null` / `[]` / a non-array. Python `to_dict()` likewise omits the key for `None` **and** `[]` — pre-F11 producers emit byte-identical wire bytes.
- **AC-06.2 (the one I was asked to scrutinise)** — the attachment is built **once** at `zalo-api.service.ts:56` before the first `trySend` and the same object is passed to both calls. Proven behaviourally, not just by reading: after a `-216`, `rawBodyOf(fetch,1) === rawBodyOf(fetch,0)` byte for byte, including `template_type`. Also `redis.getConfig` is called **once**, so a config change mid-retry cannot alter the retried payload. Plain retries stay plain.
- **AC-06.1/06.3/06.4** — `'Token expired and refresh failed'`, second `-216` not retried again (2 fetches, 1 refresh), `Zalo send failed: -32 bad thing` and `Zalo send failed: -9 ` string formats unchanged for both variants.
- **AC-01.2 contracts identical** — extracted the F11 additions from both TS files with `git diff -U0`; **SHA-256 identical** (`6cbb3400…`), 22 lines each, `diff` empty. The one whole-file difference is a pre-existing gateway-only doc comment on `templateKey` (present at HEAD, absent in core-api at HEAD), which §1 of the spec explicitly permits. Python constants asserted equal to the TS values.
- **AC-01.7/01.8/BR-10** — no `EXCHANGE`/`Q_*`/`MAX_RETRIES`/`RETRY_TTL_MS` value changed; no `package.json`/`package-lock.json`/`pyproject.toml` change; no new queue, exchange, binding, consumer or Redis key in the diff.
- **NFR-04** — outbound producer count unchanged: worker `_publish_outbound` call sites 4 → 4; core-api `Q_OUTBOUND` references 2 → 2. **Zero new outbound producers.**
- **NFR-05 / the one changed assertion** — `outbound.consumer.spec.ts:27`, `toHaveBeenCalledWith('user-1', msg.text)` → `(..., undefined)`. **Not a weakening.** Jest compares the argument *array*, so `[a,b]` cannot match a `[a,b,undefined]` call; the edit is mechanically forced. It is also strictly *stronger*: it now asserts the third argument **is** `undefined`, i.e. no buttons leak onto a plain message. The other two F11-touched spec files are additions-only (`gradings.service.spec.ts` `81 0`, `worker-api.controller.spec.ts` `343 0`).

## 5. Remaining FRs

- **FR-02/03 (42 gateway tests):** exact key set asserted at every level (`recipient`/`message`/`attachment`/`payload`/each button); every button carries `"type":"oa.query.show"`; the contract's `action` field **never** reaches the wire (asserted both structurally and by substring-searching the raw body). All-or-nothing verified over 15 violation classes (6 buttons, 101-char title, 1001-char payload, empty/whitespace/non-string/`null` title, non-`#ilm:` payload, unknown/`undefined` action, `null`/`undefined` array entries, **one good + one bad**): every one drops the *whole* block, sends plain text, warns exactly once, and still resolves. Nothing is ever truncated.
- **AC-03.8 boundaries:** exactly 5 buttons + exactly 100-char titles + exactly 1000-char payloads send **with** the block and **no** warn. Inclusive maxima confirmed.
- **A-04 (AC-03.6):** 2000 chars ⇒ no warn; 5000 chars ⇒ exactly one warn and the text is sent **unchanged** (asserted on both content and `.length`) — not truncated, not rejected.
- **FR-04:** `null` / `''` / `undefined` ⇒ field omitted (`Object.keys(payload) === ['buttons']`); a value ⇒ `template_type` present alongside `buttons` and nothing else changes. **AC-04.4** verified negatively: the plain path, the empty-array path **and** the dropped-block path all perform **zero** `getConfig` calls. **AC-04.5**: a rejecting Redis degrades to omitting the field, the block is still sent, one warn. **AC-04.6**: value used only as a JSON value — URL and headers unchanged even with `a"b\c\n<script>`; a hostile title `"},"x":{"` is JSON-escaped, no break-out.
- **FR-07/08 + cross-language parity:** a 17-case table was asserted **twice** — once against TS `buildReplyButtons`, once against Python `build_reply_buttons` — and both produce identical output (both actions, BR-14 `select_student` skipped, unknown action skipped, missing/`null`/non-list/empty `student_reply`, non-dict entries, blank and 101-char titles skipped, 100-char kept, truncate-to-5 at producer, **teacher-authored `payload` ignored and re-derived**, bad `grading_id` ⇒ no button so `#ilm:ack:None` is impossible). Neither raises on a hostile rubric. `send()` sets `message.buttons` only when non-empty, so an empty result is byte-identical on the wire.
- **FR-12/13 state transition:** drove the full loop — pass 1 (2 active bindings, `studentId` NULL) publishes the clarification with text **unchanged** (`"Bài này của bạn nào vậy ạ? (An, Binh)"`) plus 2 correct buttons; tap → 200 → republish; pass 2 sees `studentId` set, skips the ambiguity branch, proceeds with `{"studentId":10,"status":"processing"}`. **Total clarifications across both passes = 1** ⇒ the loop terminates. Republished message shape asserted exactly for `audio`→`user_send_audio` and `video`→`user_send_video`. `publish_submission=None` degrades to the `"cần chấm lại thủ công"` flag, and the 4-arg constructor still works.
- **FR-13 hardening (beyond the AC):** probed `submission.studentId` = `0`, `-1`, `"10"`, `True`, `10.0`, `{...}` — none short-circuits binding resolution, so a malformed core-api response cannot skip the sibling question.
- **AC-08.7/08.8:** 6 active bindings ⇒ **no buttons at all** and all 6 names still in the text (a sibling can never be silently hidden); a binding with `studentId=None` is never offered.
- **BR-12:** the onboarding message is still plain (no `buttons` key).
- **NFR-07:** `ack` first-tap-wins across 3 repeat taps with `updateMany` called exactly **once**; the racing-tap loser returns the winner's timestamp (never a moved stamp); `select_student` second/different tap ⇒ 409 with the row **not** re-pointed; the conditional `WHERE` is `{id, studentId: null, status: 'received'}` as claimed.
- **AC-10.5/10.6:** the ack `data` object contains **only** `studentAckAt`; `totalScore`/`levelCode`/`levelLabel`/`scores`/`llmFeedback`/`reviewedFeedback`/`sentAt`/`autoSent` unchanged; no `events.publishStatus`, no publish.
- **AC-10.9:** a 5xx from `student_ack` **propagates** out of `handle()`, so the existing retry→DLQ loop still applies (not swallowed).
- **FR-11:** flag on the tap's **own** submission id, reason `"học viên bấm nút nhờ tư vấn (grading 777)"`, distinct from the chatter reason (AC-11.7), no status change, zero outbound; a non-existent grading id is not validated (AC-11.4, as designed).
- **FR-14/15:** `setting-defs.ts` gains exactly one entry, no others reordered; no `.env`/`ENV_FALLBACKS` entry; i18n key present in **both** `vi` (line 58) and `en` (line 339). Log format `"submission %s: nút #ilm:%s -> %s"` confirmed on all three success paths (matches the design Phần 10 §6 smoke grep `nút #ilm:ack ->`); gateway warns name the rule that fired and carry **lengths, never the title text** (no new PII surface); no log line added to the plain-text path.

## 6. Owner-acceptance pending — NOT reported as passing

**OQ-1 · `template_type`.** Whether a real Zalo OA accepts a buttons-only payload without
`template_type`, whether `oa.query.show` renders and returns the payload verbatim as
`user_send_text` (assumption A-01), the real 5-button maximum (A-02), and whether a tap refreshes
the 48h window — **none of these can be verified without real OA credentials**. Same deferred-
credentials situation as Zalo M1.8 / Sheets M2.4 / LLM keys M3.

Mitigation is in place and I verified it works: the field is behind
`zalo.buttons_template_type` (default empty ⇒ omitted), fixable from the dashboard Settings screen
with `config:changed` hot-reload and **no redeploy**. If A-01 turns out to be false, the inbound half
is simply inert — taps arrive as ordinary text and flag, which is exactly today's behaviour, so
nothing regresses.

**This item is pending owner acceptance, not passing.**

## 7. Observations (non-defects, no action required)

1. `services/grading-worker/tests/test_buttons.py` line 3 docstring says "20 chuỗi" while the list holds 21 and `test_ac_09_4_covers_every_string_the_spec_enumerates` correctly asserts 21. Cosmetic comment typo; zero functional impact.
2. `zalo.buttons_template_type` set to a whitespace-only string (`"   "`) is emitted verbatim rather than treated as empty. The spec only defines `''` ⇒ omit (AC-14.3), so this is outside the letter of the AC rather than against it; it is an admin-only setting, instantly reversible from the dashboard, with no security impact.
3. `MAX_BUTTON_PAYLOAD_LEN` is unused in `buttons.py` (producer payloads max ~45 chars; the gateway enforces the limit). Required by AC-01.3 for cross-language constant parity, so its presence is correct.
4. **AC-13.4 behaviour change, correctly pre-declared, not filed as a regression:** a RabbitMQ retry of a submission whose `studentId` was already stored now reuses that student instead of re-resolving from bindings.

## Blockers / open questions

None blocking. One owner-acceptance-pending item (OQ-1, §6) requiring real Zalo OA credentials.

## Notes for the next role

- **Zero defects found.** All four suites green at the claimed numbers; every backend claim I was
  asked to confirm or refute was **confirmed**, including the two most load-bearing ones: the
  `outbound.consumer.ts` `1 1` diff and the attachment being built once so the `-216` retry re-sends
  a byte-identical payload.
- The FR-09 closed set held against ~150 adversarial strings — no fail-open. The deliberate choices
  (`[0-9]` over `\d`, `re.fullmatch` over `^…$`, no trim, no case-fold) are all implemented as
  documented and are each independently observable in test.
- **On the first real OA send**, check `docker compose logs zalo-gateway` for a Zalo template error;
  if one appears, set `zalo.buttons_template_type` from Settings and re-send — that closes OQ-1 with
  no redeploy. Record the outcome in the architecture changelog either way.
