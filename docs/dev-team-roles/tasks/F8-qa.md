# F8 · QA — Rubric schema v2 + `normalizeRubric` v1→v2 shim (TS + Python)

- **Owner role:** qa
- **Feature:** F8 — v2 rubric types + pure `normalizeRubric` duplicated in core-api (TS) and grading-worker (Python), docx-parser emits v2, worker schema/prompt builders consume v2. Zero DB migration.
- **Status:** DONE — **QA PASS** after fix round 2 (DEF-01 and DEF-02 both closed; see §5, §6)
- **Last updated:** 2026-08-21 (re-gate 2)
- **Depends on:** F8-ba.md, F8-backend.md, F8-pm.md

## Inputs (what this role received)

- `docs/dev-team-roles/tasks/F8-ba.md` — 16 FRs / 96 numbered ACs, 10 BRs, 8 NFRs. The gate.
- `docs/dev-team-roles/tasks/F8-backend.md` — implementation claims + self-reported test counts.
- `Idea/20260819-ChamDiemRubricV2.md` Part 3 — authoritative v2 schema (verified unmodified; the
  doc's working-tree diff touches Part 4 onward only = F10 scope).

## Checklist (the concrete work items for this task)

- [x] Working-tree integrity check (no stray stash/backup from backend's `git stash -u`)
- [x] Read all new/changed source + test files, and `git diff` every pre-existing test file
- [x] Run core-api jest suite in Docker (CONFIRMED 31 suites / 298 tests, `tsc --noEmit` clean)
- [x] Run grading-worker pytest (CONFIRMED 149 passed, 0 skipped)
- [x] Run zalo-gateway suite (CONFIRMED 5 suites / 26 tests, service untouched)
- [x] Verify pre-existing assertions were not weakened
- [x] Reproduce the drift-guard experiment (fixture removed ⇒ 6 hard FAILURES, 0 skips)
- [x] Additionally verify the drift guard catches a *behaviour* divergence, not just a missing file
- [x] Verify `GET /internal/criteria/:courseId` returns the stored rubric verbatim (AC-08.2)
- [x] Verify `pronunciation` gate at both layers (FR-07, FR-10) incl. case sensitivity
- [x] Verify BOTH prompt builders render v2 (FR-11, FR-12)
- [x] Verify the `weight` bug is untouched (AC-14.3 — F9 scope, no scope violation)
- [x] Independent adversarial probes: 56 hand-designed + 3 000 fuzz cross-language differential
- [x] 20 000-input Python fuzz for never-raises / 12-keys / idempotency
- [x] Perf check (NFR-01)
- [x] Write verdict — **FAIL**, 1 defect (DEF-01), 2 non-blocking observations
- [x] **Fix round 1 re-gate (§5)** — DEF-01 verified closed; new **DEF-02** (Minor) found; verdict **FAIL**
- [x] **Fix round 2 re-gate (§6)** — DEF-02 verified closed; 0 open defects; verdict **PASS**

---

## 1. Suite results (all executed by QA, not taken on trust)

| Suite | Command | Result |
| :-- | :-- | :-- |
| core-api (TS) | `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Docs/Project/TTTA/services/core-api:/app" -w /app node:24-alpine sh -c "npm ci && npx tsc -p tsconfig.build.json --noEmit && npm test -- --maxWorkers=2"` | **31 suites / 298 passed**, 0 failed, tsc clean, 194 s. Matches backend claim. |
| grading-worker (Py) | `.venv/Scripts/python.exe -m pytest -q` | **149 passed**, 0 failed, 0 skipped, 8.3 s. Matches backend claim. |
| zalo-gateway (TS) | same Docker recipe against `services/zalo-gateway` | **5 suites / 26 passed**. `git status` shows the service is byte-untouched. |

**Working tree:** `git stash list` empty; no `*.orig`/`*.rej`/`*.bak`/stray artifacts anywhere;
14 modified + 5 new F8 files exactly as F8-backend.md lists. No work lost by the backend's aborted
`git stash -u`. All QA scratch files were written outside the repo or removed.

**Pre-existing assertions were NOT weakened.** `git diff` on every pre-existing test file:
`test_schema.py`, `test_prompt.py` are purely **append-only** (v1 `RUBRIC` fixtures and every
assertion on them untouched); `test_pipeline.py` and `reports.service.spec.ts` not modified at all;
`analytics.spec.ts` is +2 additive cases; `criteria.service.spec.ts` is +3 additive cases;
`docx-parser.spec.ts` assertions were adapted to the new shape but got strictly **stronger**, and
the two 400-rejection tests are verbatim. NFR-02 evidence stands.

---

## 2. Derived test cases and results

Technique key: EP = equivalence partition · BVA = boundary value · DT = decision table ·
ST = state transition · EG = error guessing · DIFF = cross-language differential.

### 2.1 Traced test cases — PASS

| # | AC / FR | Technique | Test | Result |
| :-- | :-- | :-- | :-- | :-- |
| T01 | AC-01.1 / AC-02.1 | inspection | `rubric-schema.ts` has **zero** imports; `rubric_schema.py` imports only `copy`,`math`,`typing` | PASS |
| T02 | AC-01.2 / AC-02.2 | EG + fuzz | 20 000 random JSON-shaped inputs through `normalize_rubric` | 0 raises |
| T03 | AC-01.4 / AC-02.4 | fuzz | same 20 000 inputs, top-level key set | always exactly the 12 |
| T04 | AC-04.6 | fuzz | `normalize(normalize(x)) == normalize(x)` | 20 000 Py + 3 000 TS: 0 failures |
| T05 | AC-01.3 / AC-02.3 | property | deep-frozen v1 input; JSON before/after | no mutation (suite + own run) |
| T06 | AC-05.1 | EP | `None/null, undefined, 42, "x", [], true, 0.5` | all → the documented all-defaults object, both languages |
| T07 | AC-03.1/03.2 | EP+BVA | `band_scale [0,5]` → `{0,5,1}`; absent / `["a",null]` / `[]` / `5` / `{...}` / `[0]` → `{0,3,1}`; `[0,5,9]` → `{0,5,1}` | PASS both languages |
| T08 | AC-03.3 / BR-07 | EG | v1 `name:"Pronunciation"` → `key==label=="Pronunciation"`, **no case change** | PASS |
| T09 | AC-03.5 | EP | band string → `[trimmed]`; `"  "` → `[]`; array → per-element trim, empties dropped; array already an array is **not** re-wrapped | PASS (string/array inputs) |
| T10 | AC-03.7 / AC-11.6 | EP | `few_shot_examples` → `comment_bank[{null,null,text}]`, order preserved, blanks dropped | PASS |
| T11 | AC-03.8 / BR-03 | DT | v1 (no `aggregation`) → `{average,none}`; unknown method `"median"`/round `"floor"` → `{average,none}` | PASS |
| T12 | AC-04.1/04.2 | EP | complete v2 returned deep-equal; **present-but-empty** `output_fields: []` and `levels: []` survive as `[]` | PASS (`v2_bands_already_arrays`) |
| T13 | AC-04.3/04.4 | DT | `schema_version:2` carrying `band_scale` + `few_shot_examples` + `name`-only and `label`-only dimensions | PASS (`v2_mixed_legacy_keys`) |
| T14 | AC-04.5 / BR-02 | BVA | `schema_version` = `-1, 0, 1.9, 2, 2.0, 2.5, 3, 1000, "2", true` | `<2`/non-number ⇒ v1 branch & output 2; `>=2` preserved verbatim (2.5→2.5, 3→3). `true` correctly NOT a number. PASS |
| T15 | AC-05.4 | EG | non-object `levels` entries dropped; overlapping/inverted ranges copied verbatim (no F9 validation) | PASS |
| T16 | AC-06.1..06.8 | EP | `parseRubricFromHtml(VALID_HTML)` → v2, no `band_scale`/`name`/`few_shot_examples`; `Pronunciation` → `key:"pronunciation"`, `label:"Pronunciation"`; parser output is a normalize fixed point; title still resolves | PASS |
| T17 | FR-07 (AC-07.1..07.3) | negative | rubric without `pronunciation` ⇒ 400 with the **same message string** as pre-F8; missing-headings 400 unchanged; no new rejection reason (bad "Thang điểm" falls back to `{0,3,1}` instead of rejecting) | PASS |
| T18 | AC-08.1 | integration (mocked) | `get()`/`list()` return normalized rubric; no write-back | PASS |
| T19 | AC-08.2 / A4 | inspection + diff | `worker-api.controller.ts` diff is a **comment block only**; `GET /internal/criteria/:courseId` still returns the raw stored row. The Python shim remains the sole production normalizer for the worker. | PASS |
| T20 | AC-09.2/09.3/09.4 | EP+BVA | property names from `key` in rubric order; bounds from `scale`; `step==1` ⇒ `integer`, `step=0.5` ⇒ `number`+`multipleOf` | PASS |
| T21 | AC-09.5/09.6/09.7 | DT | `["comment","fix"]` ⇒ `required ["score","comment","fix"]`; `[]` ⇒ falls back to comment; `["comment","sticker"]` ⇒ sticker ignored | PASS |
| T22 | AC-09.8/09.9/09.10 | EP | only `pronunciation` gets `mispronounced_words`; top level unchanged; duplicate keys ⇒ `RubricError` | PASS |
| T23 | FR-10 / BR-10 / AC-10.2 | negative+EG | gate accepted/rejected set compared with pre-F8 `git show HEAD:...schema.py`: identical (exact, case-sensitive, message string identical). `Pronunciation` (capital) rejected before AND after; `{}` and `None` rejected without crashing | PASS |
| T24 | AC-16.3 / NFR-02 / UC-02 | end-to-end (offline) | a genuine v1 rubric → schema (`integer 0..3`, keys `fluency`,`pronunciation`) → prompt → `validate_output` accepts a valid result and rejects score `4`, `-1`, `2.5`, and a missing dimension | PASS, zero operator action |
| T25 | AC-11.1..11.8, 11.10 | snapshot-by-eye | audio prompt rendered for a v2 KID rubric: 6 header lines in order, `label [key=…] (trọng số w)`, one bullet per array element, bands ascending (`Band 0` before `Band 5`), sub-factor grid only on the dimension that has one, comment bank grouped Pronunciation→Fluency→orphan→`Dùng chung` last, `fix` instruction present, `mispronounced_words` + closing line last | PASS |
| T26 | AC-11.9 / AC-12.3 / BR-09 | negative | **both** prompts contain no level label (`Tiny Rabbit`, `Great Big Dino`), no `A0`/`A2`, no `25`, no "tổng điểm", no "trung bình", no `student_reply` content | PASS |
| T27 | FR-12 (AC-12.1..12.4) | DIFF | the text/pilot builder's dimension + comment-bank + output-fields body is **byte-identical** to the audio builder's (shared helpers), and the transcript-only warnings keep their position before the dimension block | PASS |
| T28 | AC-13.1/13.2/13.3 | inspection + suite | `pipeline.py` diff is one import + one line; `test_pipeline.py` untouched and green; nothing sent back to core-api | PASS |
| T29 | AC-14.1/14.2 | EP+BVA | `scale.max` preferred; `scale.max=0`/absent falls through to `band_scale[1]`, then `3`; existing v1 report numbers unchanged | PASS |
| T30 | **AC-14.3** | scope check | `dimensionScore` / `scorePctForGrading` are **not in the diff**; the unweighted `sum/n/bandMax` average (the `weight` bug) is still present verbatim at `reports.service.ts:254-267` | PASS — no scope violation, F9's fix left for F9 |
| T31 | AC-15.1 | inspection | exactly one `rubric-normalize.fixtures.json` in the repo | PASS |
| T32 | AC-15.2/15.3 | inspection | TS loads with `fs.readFileSync(path.join(__dirname,…))`; Python resolves via `parents[2]` | PASS |
| T33 | **AC-15.3 drift guard (reproduced)** | ST | removed the fixture, ran the full pytest suite, restored it | **6 hard FAILURES, 0 skips**; the other 103 tests still ran (no collection abort). Backend's claim reproduced exactly. |
| T34 | UC-04 drift guard (behaviour) | ST | temporarily changed one Python default (`_DEFAULT_TASK_TYPE`) and re-ran | **13 failures** naming the diverging cases; restored, 149 passed again, tree clean. The guard bites on behaviour, not just on a missing file. |
| T35 | AC-15.6 | inspection | both suites assert `>= 10` cases and the exact 11-name set | PASS |
| T36 | AC-15.7 | inspection | fixture numerics are only `0,1,0.25,0.5,3,5,9,10,21,25` — all exactly representable | PASS |
| T37 | AC-15.8 | inspection | all 11 required case names present; `expected` values spot-checked against the AC text (not just against the implementation) for `v1_docx_parser_output`, `v1_malformed_band_scale`, `v1_unknown_extra_keys`, `v2_mixed_legacy_keys`, `v2_bands_already_arrays` — all match the spec | PASS |
| T38 | AC-15.9 | inspection | fixture contains no F10 seed template data | PASS |
| T39 | AC-15.10 | inspection | each test file names its twin in a Vietnamese comment | PASS |
| T40 | AC-16.1/16.2 | grep | no prisma migration, no schema.prisma change; `grep -rn "prisma\.criteria\.(update\|create\|upsert\|delete)"` returns **only** the `create` in `ingestDocx` | PASS |
| T41 | NFR-01 | perf | 10 dims × 10 bands × 5 bullets + 200 bank entries: **0.29 ms** (budget 5 ms) | PASS |
| T42 | NFR-03 | git | `package.json`, `pyproject.toml` unmodified | PASS |
| T43 | NFR-04 | inspection | Vietnamese comments in all 5 touched/new source files | PASS |
| T44 | NFR-08 | inspection | no change to queue/retry/DLQ/48h paths; malformed rubric still raises `RubricError` on the existing retry path, never an unhandled `TypeError` (T02) | PASS |
| T45 | dashboard regression | inspection | `Criteria.tsx` types `rubric` as `unknown` and only JSON-previews it; service unmodified, no test suite to run | PASS |

### 2.2 Derived test cases — **FAIL** (see DEF-01)

| # | AC | Technique | Test | Result |
| :-- | :-- | :-- | :-- | :-- |
| T46 | AC-05.3 | EG | `{"comment_bank":[{"text":null}]}` | **FAIL** — TS drops the entry (`comment_bank: []`); Python keeps `{"dimension":null,"intent":null,"text":"null"}` |
| T47 | AC-03.5 / AC-05.2 | EG | band / `by_band` / `comment_bank.text` / `few_shot_examples` value that is an **array** | **FAIL** — TS `"a,b"` vs Python `"['a', 'b']"` |
| T48 | AC-03.5 / AC-05.2 | EG | same slots with an **object** value | **FAIL** — TS `"[object Object]"` vs Python `"{'a': 1}"` |
| T49 | AC-03.5 | BVA | band value `1e21` / `1e-7` | **FAIL** — TS `"1e+21"` / `"1e-7"` vs Python `"1000000000000000000000"` / `"1e-07"` |
| T50 | AC-02.5 / FR-15 | **DIFF at scale** | 3 000 pseudo-random rubric-shaped inputs through **both** implementations, structural comparison | **FAIL — 32 / 3 000 (1.1 %) divergent.** Paths: `/output_fields[]` (29), `/comment_bank[]/text` (19), `/comment_bank[len]` (3). Plus 9 / 56 of the hand-designed probes. |

---

## 3. Defects

### DEF-01 — `normalize_rubric` (Python) and `normalizeRubric` (TS) diverge on non-string values; the shared fixture does not cover the case

- **Severity:** **Major** (functional divergence in the one function pair whose entire purpose is
  byte-equivalence, and it is *silent*). **Production impact today: low** — every rubric currently
  stored is v1 produced by `docx-parser`, whose band/comment values are always strings, so no live
  rubric hits the divergent branch. It becomes reachable as soon as any v2 rubric is authored via
  JSON, i.e. F10 seeds and F12's editor. Fixing it now costs a few lines; fixing it after F10 seeds
  ship means re-validating seed data across two languages.
- **ACs violated:** **AC-03.5** ("any other type ⇒ `[String(value).trim()]`" — the AC names JS
  `String()` semantics normatively), **AC-05.2** ("`by_band` values are stringified"),
  **AC-05.3** ("entries whose `text` is missing/blank after trim are dropped"),
  **AC-02.5** ("behaviour is identical … in every AC"), and the intent of **FR-15 / BR-05**.
  It also contradicts the implementation's own documented contract — `rubric_schema.py`'s module
  docstring and `_to_text`'s docstring both state that it "mimics `String()` of JavaScript".
- **Responsible role:** **backend** (Python side of F8 — `rubric_schema.py`; plus the shared
  fixture under core-api).
- **File / line:**
  - `services/grading-worker/src/grading_worker/grading/rubric_schema.py:124-140` (`_to_text`) —
    handles `None`, `bool`, integral `float` only; falls through to `str(value)` for `list`/`dict`
    and for floats needing exponent notation.
  - `services/grading-worker/src/grading_worker/grading/rubric_schema.py:281`
    (`_normalize_comment_bank`) — `_to_text(item.get("text", ""))` defaults only when the **key is
    absent**, whereas the TS twin at `services/core-api/src/criteria/rubric-schema.ts:252` uses
    `toText(item.text ?? '')`, which also catches an explicit `null`.
  - `services/core-api/src/criteria/__fixtures__/rubric-normalize.fixtures.json` — none of the 11
    cases contains a non-string band value, a non-string `comment_bank[].text`, or a `null` `text`,
    which is why the drift guard stayed green.

- **Repro steps (both run by QA, both reproducible offline):**

  1. Python:
     ```
     cd services/grading-worker
     .venv/Scripts/python.exe -c "import sys;sys.path.insert(0,'src');
     from grading_worker.grading.rubric_schema import normalize_rubric;
     print(normalize_rubric({'comment_bank':[{'text':None}]})['comment_bank']);
     print(normalize_rubric({'dimensions':[{'name':'p','bands':{'0':['a','b'],'1':{'x':1}}}]})['dimensions'][0]['bands'])"
     ```
  2. TypeScript (Node 24 runs the file directly — the module is import-free):
     ```
     MSYS_NO_PATHCONV=1 docker run --rm -v "<repo>/services/core-api:/app:ro" -w /app node:24-alpine \
       sh -c 'mkdir -p /p && cp src/criteria/rubric-schema.ts /p/ &&
       printf "%s" "import{normalizeRubric as n}from\"./rubric-schema.ts\";console.log(JSON.stringify(n({comment_bank:[{text:null}]}).comment_bank));console.log(JSON.stringify(n({dimensions:[{name:\"p\",bands:{\"0\":[\"a\",\"b\"],\"1\":{x:1}}}]}).dimensions[0].bands));" > /p/p.ts && cd /p && node p.ts'
     ```

- **Actual vs expected:**

  | Input | Expected (AC-03.5 / AC-05.3 — JS `String()` semantics, identical in both) | Actual TS | Actual Python |
  | :-- | :-- | :-- | :-- |
  | `{comment_bank:[{text:null}]}` | `comment_bank: []` (blank after trim ⇒ dropped) | `[]` ✔ | `[{dimension:null,intent:null,text:"null"}]` ✘ |
  | `bands:{"0":["a","b"]}` nested inside another array, or `text:["a","b"]` | `"a,b"` | `"a,b"` ✔ | `"['a', 'b']"` ✘ |
  | `bands:{"0":{"x":1}}` / `text:{"a":1}` / `few_shot_examples:[{...}]` | `"[object Object]"` | `"[object Object]"` ✔ | `"{'x': 1}"` ✘ |
  | `bands:{"0":1e21,"2":1e-7}` | `"1e+21"`, `"1e-7"` | as expected ✔ | `"1000000000000000000000"`, `"1e-07"` ✘ |
  | `output_fields:[["","fix"]]` | `",fix"` | `",fix"` ✔ | `"['', 'fix']"` ✘ |

- **Evidence:** 3 000-input cross-language differential fuzz → **32 divergent (1.1 %)**, grouped
  by path: `/output_fields[]` ×29, `/comment_bank[]/text` ×19, `/comment_bank[len]` ×3. A separate
  56-case hand-designed probe set → **9 divergent**, listed in §2.2. TS was idempotent on all 3 000;
  Python was idempotent on all 20 000 of its own fuzz corpus — the defect is *equivalence*, not
  stability.

- **Suggested fix (backend's call, but small):**
  1. In `_to_text`, add JS-`String()` handling for `list` (comma-join of recursively stringified
     elements, `None`/empty → `""`), `dict` (`"[object Object]"`), and floats requiring exponent
     form (JS switches to exponent at `>= 1e21` and `< 1e-6`, and formats the exponent without a
     leading zero).
  2. In `_normalize_comment_bank`, change `item.get("text", "")` to treat an explicit `None` as
     absent, matching the TS `??`.
  3. **Add fixture cases covering all of the above** — otherwise the guard will not hold the fix.
     Suggested new names: `v2_non_string_band_values`, `v1_null_comment_text`. Note this changes the
     AC-15.6/15.8 required-name lists in *both* test files, which must move in the same commit.

---

## 4. Non-blocking observations (no fix required for F8 to pass; recorded for F9/F10)

- **OBS-01 (test quality, minor).** `services/core-api/src/criteria/criteria.service.spec.ts` —
  `expect(prisma.criteria).not.toHaveProperty('update')` asserts a property of the hand-built mock
  object, not of production code, so it can never fail regardless of what `CriteriaService` does.
  It is near-tautological. AC-16.2 is nevertheless satisfied: QA verified independently by grep that
  the only `prisma.criteria.*` write in the whole service is the `create` in `ingestDocx`.
  Everything else in both new spec files asserts real behaviour against literal expected values, not
  against the implementation — no other tautologies found.
- **OBS-02 (F10 hand-off).** `Idea/20260819-ChamDiemRubricV2.md` has uncommitted edits to Part 4
  onward (RubricTemplate CRUD / seeds). **Part 3 — the schema F8 implements — is untouched**, so F8
  was gated against the approved text. Whoever owns F10 should know Part 4 moved under them.

---

---

## 5. Fix round 1 re-gate (2026-08-21)

### 5.1 Checklist

- [x] Re-run core-api suite in Docker (**31 suites / 335 tests**, `tsc -p tsconfig.build.json --noEmit` clean, 196 s) — matches backend's claim
- [x] Re-run grading-worker pytest (**187 passed**, 0 failed, 0 skipped, 59 s) — matches
- [x] Re-run zalo-gateway (**5 suites / 26 tests**), service still byte-untouched
- [x] Re-run own cross-language differential fuzz, **21 098 inputs / 7 seeds** ⇒ 0 divergences in the double domain
- [x] Judge backend's "compare numbers in the double domain" caveat (**legitimate — proven, not accepted on trust**)
- [x] Confirm `rubric-schema.ts` (TS reference) was not weakened
- [x] Confirm the deliberate `false`/`0`-kept vs `null`-dropped asymmetry is locked by a test in **both** languages
- [x] Independently confirm the self-reported `OverflowError` (AC-02.2) defect existed and is fixed
- [x] Confirm the 3 new fixture cases are load-bearing, not cosmetic (mutation test)
- [x] Re-confirm round-1 findings: drift guard FAILs-not-skips · `GET /internal/criteria/:courseId` verbatim · both `pronunciation` gates · `weight` bug untouched · v1 assertions unweakened
- [x] OBS-01 re-check
- [x] New adversarial probe: whitespace/trim semantics ⇒ **DEF-02 found**
- [x] Restore every temporarily patched file (md5 verified) — working tree identical to the pre-QA state

### 5.2 Re-gate test cases

| # | AC / claim | Technique | Test | Result |
| :-- | :-- | :-- | :-- | :-- |
| T47–T50 (retest) | AC-03.5 / AC-05.2 / AC-05.3 | EG | the exact 5-row DEF-01 repro table + 23 hand-built probes (arrays, nested arrays, objects, `1e21`, `1e-7`, `5e-324`, `-0`, `1e-6`, `1e20`, `1e16`, `2^53±`, `10^400`) run through **both** implementations | **PASS** — 0/23 divergent. DEF-01 closed. |
| T51 | AC-02.5 / FR-15 | **DIFF at scale** | 7 seeds × 3 014 rubric-shaped inputs (**21 098**) through real `rubric-schema.ts` under `node:24-alpine` and real `normalize_rubric` | **PASS** — 0 divergences (double domain), 0 raises, 0 wrong key-sets, 0 non-idempotent on either side |
| T52 | harness validity | mutation | same corpus replayed against a **reverse-patched pre-fix** `rubric_schema.py` (3 root causes undone) | **PASS** — 2 056 / 3 014 (68 %) divergent + **399 hard `OverflowError` raises**. The corpus bites. |
| T53 | backend's double-domain caveat | methodological | ran every comparison in **three** modes: strict (raw repr), double-domain, key-order | **Caveat legitimate.** All 1 805–1 842 strict-only differences are `t=num` slots whose IEEE-754 bit patterns are *identical* (`9007199254740992.0` vs `9007199254740992`, `1.1920928955078125e-07` vs `…e-7`). String-valued slots are compared byte-exactly in every mode, so the relaxation **cannot** mask a `String()` divergence — proven by T52, where the same comparator still reported 2 056 failures. |
| T54 | AC-02.2 (backend self-report) | EG | `10**400`, `-10**400`, `2^53+1` in `schema_version` / `weight` / `scale.*` / band / `output_fields` | **Confirmed both ways**: pre-fix code raises `OverflowError` on 399/3 014 corpus inputs; current code raises 0/21 098 and returns `Infinity`/`-Infinity`/defaults exactly as JS does. Locked by `test_an_int_too_large_to_be_a_double_is_treated_as_non_finite_and_never_raises` + `test_an_int_beyond_2_pow_53_is_lowered_to_the_double_javascript_would_hold`. |
| T55 | fix direction (AC-03.5 normative `String()`) | inspection + behaviour | `rubric-schema.ts` re-read line by line against the round-1 record: `toText` still `String(value)` (l.123-127), `toText(item.text ?? '')` still at **l.252**, `normalizeBandValue`/`normalizeOutputFields` unchanged; mtime `10:29:58` predates every fix-round artifact (`rubric_schema.py` 10:56, fixtures/specs 13:43-13:45). Behaviourally, TS was independently re-validated against **real V8** on all 21 098 + 23 + 14 inputs. **TS was not weakened to meet Python.** | PASS |
| T56 | `false`/`0` vs `null` asymmetry | DT | `comment_bank[].text` ∈ {`null`, absent, `""`, `"  "`, `false`, `0`, array} and `few_shot_examples` ∈ {`null`, …} | PASS — `null`/absent/blank dropped, `false`→`"false"`, `0`→`"0"` kept, `few_shot_examples` `null`→`"null"` kept. **Locked in both languages** (`test_treats_an_explicit_null_comment_text_as_absent_but_keeps_false_and_zero` + its TS twin) and in fixture `v1_null_comment_text`. |
| T57 | AC-15.6/15.8 — new cases are load-bearing | mutation | reverse-patched `_to_text`/`_normalize_comment_bank`, ran `pytest tests/test_rubric_schema.py` | PASS — **11 failures**, including all 3 new golden cases (`v1_null_comment_text`, `v2_non_string_band_values`, `v1_non_string_few_shot_examples`). Not cosmetic. File restored (md5 `de0a7525…`). |
| T33 (retest) | AC-15.3 drift guard | ST | fixture moved aside ⇒ full pytest | PASS — **6 hard FAILURES, 0 skips**, other 129 tests still run. Fixture restored (md5 `a3e236f9…`). TS side reads the fixture at module load ⇒ a missing file throws and fails the suite too. |
| T19 (retest) | AC-08.2 | diff | `git diff worker-api.controller.ts` = **+6 lines, all comment** | PASS — endpoint still returns the stored rubric verbatim |
| T23 (retest) | FR-10 / BR-10 | negative | `build_output_schema` with `pronunciation` / `Pronunciation` / `" pronunciation"` / `{}` / `None` / `[]` / `"x"` / `42` | PASS — only exact lowercase accepted; everything else `RubricError`, no crash |
| T30 (retest) | **AC-14.3** | scope check | `reports.service.ts` diff touches only `bandMaxFromRubric` (+15/−5); `scorePctForGrading` still `round1((sum / n / bandMax) * 100)` | PASS — the `weight` bug is untouched, F9 still owns it |
| NFR-02 (retest) | unweakened v1 assertions | `git diff --numstat` | `test_schema.py` **+120/−0**, `test_prompt.py` **+114/−0** (append-only); `test_pipeline.py`, `reports.service.spec.ts` unmodified; `analytics.spec.ts` +27/−0 | PASS |
| OBS-01 (retest) | test quality | inspection | mock now carries `create/update/updateMany/upsert/delete/deleteMany`, test loops `expect(...).not.toHaveBeenCalled()` | **Closed** — asserts production behaviour now |
| **T58** | **AC-03.5 / AC-05.3 / AC-02.5** | **EG (whitespace equivalence classes)** | band / `by_band` / `comment_bank[].text` / `few_shot_examples` values padded with each of 23 whitespace-ish code points | **FAIL — see DEF-02.** 6 code points trim differently in the two languages. |

### 5.3 Defects

#### DEF-01 — CLOSED

Verified fixed, in the correct direction (Python moved to the TS reference; TS untouched), locked by
3 new shared-fixture cases + 8 named tests per language, and re-validated by 21 098-input
differential fuzz plus a mutation test proving the guard bites.

#### DEF-02 — `.strip()` (Python) and `.trim()` (JS) are not the same character set ⇒ the twins still diverge on 6 code points

- **Severity:** **Minor** (silent and structural — it changes array/entry *counts*, not just text —
  but reachability in real data is very low: XML 1.0 forbids C0 controls in a `.docx`, so only
  `U+FEFF` can realistically enter a rubric today, via paste into the F12 editor or an F10 seed
  JSON authored by hand).
- **ACs violated:** **AC-03.5** ("a string ⇒ `[trimmed]`… any other type ⇒ `[String(value).trim()]`"
  — `.trim()` is JS's, named normatively alongside `String()`), **AC-05.3** ("`text` missing/blank
  **after trim** … dropped"), and therefore **AC-02.5** ("behaviour is identical … in every AC").
  Same class as DEF-01: it is exactly the `/comment_bank[len]` + `/bands[len]` divergence pattern.
- **Responsible role:** **backend** (Python side + the shared fixture).
- **File / line:** `services/grading-worker/src/grading_worker/grading/rubric_schema.py:283`,
  `:284` (`_normalize_band_value`), `:363` (`_normalize_comment_bank`), `:379`
  (`few_shot_examples` branch) — every `.strip()`. TS twin uses `.trim()` at
  `services/core-api/src/criteria/rubric-schema.ts:193`, `:195`, `:252`, `:261`.
- **Root cause:** ECMAScript `TrimString` strips `WhiteSpace ∪ LineTerminator` =
  `U+0009 U+000B U+000C U+0020 U+00A0 U+FEFF`, all `Zs`, `U+000A U+000D U+2028 U+2029`.
  Python `str.strip()` strips everything with `str.isspace()`, which **adds**
  `U+001C U+001D U+001E U+001F U+0085` and **omits** `U+FEFF`.
- **Repro (both run by QA, offline):** feed a rubric whose band / `comment_bank[].text` values are
  padded with U+FEFF or U+0085 to both implementations (`<BOM>` = U+FEFF, `<NEL>` = U+0085):

  | Input band/text value | Expected (JS `.trim()`, AC-03.5) | Actual TS | Actual Python |
  | :-- | :-- | :-- | :-- |
  | `"<BOM>x<BOM>"` | `["x"]` | `["x"]` OK | `["<BOM>x<BOM>"]` WRONG |
  | `"<BOM>"` (whole band value) | `[]` (blank after trim) | `[]` OK | `["<BOM>"]` WRONG - **length 1 vs 0** |
  | `{"text": "<BOM>"}` | entry dropped | dropped OK | kept WRONG - **comment_bank length differs** |
  | `"<NEL>x<NEL>"` | `["<NEL>x<NEL>"]` (JS does NOT trim it) | as expected OK | `["x"]` WRONG |
  | `"<NEL>"` (whole band value) | `["<NEL>"]` | `["<NEL>"]` OK | `[]` WRONG - **length 0 vs 1** |

  Not divergent (checked, both languages agree): `U+0009 000A 000B 000C 000D 0020 00A0 1680 2000
  2028 2029 202F 205F 3000` trimmed by both; `U+200B U+180E U+0000` trimmed by neither.
- **Evidence:** 23-code-point differential probe ⇒ **6 divergent** (`U+001C U+001D U+001E U+001F
  U+0085` Python-only, `U+FEFF` JS-only); a second probe shows the divergence changes `bands[k]`
  and `comment_bank` **lengths**, not merely their text. Neither the 14-case fixture nor either
  suite contains a single non-ASCII whitespace character, so the drift guard is blind to this whole
  category — which is why backend's own 56 000-input fuzz and its V8 cross-check of `_to_text`
  (the trim happens *outside* `_to_text`) both missed it.
- **Suggested fix (~10 lines, Python only — TS stays the reference):**
  1. Add the exact ECMAScript set (WhiteSpace + LineTerminator) and trim with it explicitly
     (escapes on purpose - these characters are invisible in an editor):
     ```python
     _JS_WHITESPACE = (
         "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005"
         "\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
     )

     def _js_trim(text: str) -> str:
         return text.strip(_JS_WHITESPACE)
     ```
     (NB: Python must NOT strip U+001C-U+001F / U+0085, and MUST strip U+FEFF.)
  2. Replace all four `.strip()` calls in `rubric_schema.py` with `_js_trim(...)`.
  3. Add one fixture case (e.g. `v2_javascript_trim_semantics`) covering `U+FEFF` (kept-vs-dropped
     **and** entry-count) and `U+0085`, and the matching name in **both** required-name lists.
  4. Extend the differential corpus's string pool with these 6 code points so the harness would
     have caught it.

### 5.4 Non-blocking observations

- **OBS-03 (new, informational).** Object **key order** differs between the two outputs for
  `bands` / `by_band` / verbatim-copied `levels` / `student_reply`: JS enumerates integer-like keys
  in ascending numeric order first (spec-mandated), Python keeps insertion order — 1 128 / 3 014
  inputs in the fuzz corpus. **Not a defect:** JSON objects are unordered, `==`/`toEqual` ignore it,
  and the only order-sensitive consumer (`prompt.py::_band_order`) sorts numerically when all band
  keys are numeric, which is the case for every real rubric. Recorded so F10/F12 do not treat a
  reordered dashboard preview as a bug.
- **OBS-01** — closed by backend in this round.
- **OBS-02** — unchanged (F10 hand-off, `Idea/20260819-ChamDiemRubricV2.md` Part 4+).

---

## 6. Fix round 2 re-gate (2026-08-21) — **PASS**

### 6.1 Checklist

- [x] Re-run all three suites and confirm the claimed numbers
- [x] Re-run the differential fuzz with a **trim-seeded** corpus (my own probes, not backend's)
- [x] Prove `rubric-schema.ts` is untouched — by **md5 against the copy I archived in round 1**, not by claim
- [x] Independently redo the exhaustive V8 `String.prototype.trim()` sweep (all 1 112 064 code points)
- [x] Check backend's pre-emptive "`by_band` is never trimmed" assertion against the TS source
- [x] Mutation test: does the new fixture case / `TRIM_PROBES` actually bite?
- [x] Re-confirm every standing invariant; restore every temporarily patched file (md5 verified)

### 6.2 Suites (all re-run by QA)

| Suite | Result | Claim |
| :-- | :-- | :-- |
| core-api (Docker `node:24-alpine`) | **31 suites / 409 tests passed**, 0 failed, 407 s; `npx tsc -p tsconfig.build.json --noEmit` exited 0 (it gates `npm test` in the `&&` chain, and no `error TS` in the log) | 31 / 409 — **matches** |
| grading-worker (`pytest -q`) | **261 passed**, 0 failed, **0 skipped**, 43 s | 261 — **matches** |
| zalo-gateway | **5 suites / 26 tests passed** | untouched — **matches** |

### 6.3 Re-gate test cases

| # | AC / claim | Technique | Test | Result |
| :-- | :-- | :-- | :-- | :-- |
| T59 | fix direction — TS untouched | **hash** | `md5(rubric-schema.ts)` = `907a4c26f98d413f96a21b093e364127`, **byte-identical** to the copy QA archived during the round-1 re-gate (after reading it line by line). Hard proof this time, not inference. | PASS |
| T60 | DEF-02 fix, scope | diff vs QA's archived copy | `rubric_schema.py` gained exactly `_JS_WHITESPACE` (25 code points) + `_js_trim()` and swapped the **4** `.strip()` call sites (`_normalize_band_value` ×2, `_normalize_comment_bank`, `few_shot_examples`). `grep` confirms **no bare `.strip()` remains** in the module. The 4 sites are 1:1 with the TS `.trim()` sites (`rubric-schema.ts:193,195,252,261`). | PASS |
| T61 | **exhaustive V8 sweep (backend's strongest claim)** | independent re-run | QA swept **all 1 112 064 non-surrogate code points** through real V8 `String.prototype.trim()` in `node:24-alpine`: V8 trims **exactly 25**, and that set is **character-for-character equal** to `_JS_WHITESPACE` (0 missing, 0 extra). QA then ran `_js_trim(c+"x"+c)` for every code point: **0 mismatches vs V8**. Delta vs Python `str.isspace()` = exactly `U+001C U+001D U+001E U+001F U+0085` (Python-only) + `U+FEFF` (V8-only) — precisely the 6 filed as DEF-02. Boundary spot-checks (`U+0008/0009`, `U+000D/000E`, `U+001B/001C/001F/0020`, `U+0084/0085/0086`, `U+00A0/00A1`, `U+167F/1680/1681`, `U+180D/180E/180F`, `U+2000/200A/200B`, `U+2027/2028/2029/202A`, `U+202E/202F/2030`, `U+205E/205F/2060`, `U+2FFF/3000/3001`, `U+FEFE/FEFF/FF00`) all agree. **Claim confirmed, not sampled — fully re-derived.** |
| T62 | AC-02.5 / FR-15 | **DIFF at scale, trim-seeded** | 5 seeds × 3 015 inputs (**15 075**) from a corpus whose string pool is padded with 25 whitespace-ish code points incl. all 6 divergent ones | **0 divergences** (double domain), 0 raises, 0 wrong key-sets, 0 non-idempotent on either side |
| T63 | trim of **runs**, not single chars | exhaustive combinatorial | all 9³ ordered runs of `{TAB, SP, NBSP, U+FEFF, U+0085, U+001C, U+200B, U+3000, U+2028}` × 2 shapes (`abXc`, `abc`) = **1 458 inputs**, in band / `comment_bank.text` / `few_shot_examples` | **0 divergences in every mode**, including STRICT — order-dependent stop-at-first-non-whitespace behaviour is identical |
| T64 | DEF-02 original repro | negative retest | the exact 23-code-point probe and the BOM/NEL structural probe that produced DEF-02 (`bands[len]` and `comment_bank[len]` changes) | **0 / 23 and 0 / 1 divergent** — was 6 / 23 and 1 / 1 with 4 length divergences. **DEF-02 CLOSED.** |
| T65 | "`by_band` is never trimmed" (backend pre-empted QA here — checked) | source + behaviour | `grep "trim()" rubric-schema.ts` returns **exactly 4** hits, lines 193/195/252/261; line 211 (`byBand[band] = toText(desc)`) has **no** trim. Python `_normalize_sub_factors` likewise `_to_text` with no `_js_trim`. Both suites assert it (`does not trim by_band values at all` / `test_does_not_trim_by_band_values_at_all`), and the shared fixture locks `by_band: {"0": "<BOM>giữ nguyên<BOM>"}` unchanged. **Claim is true — not a missed site.** | PASS |
| T66 | AC-15.6/15.8 — new case is load-bearing | mutation | reverted `_js_trim` to `text.strip()`, ran `pytest tests/test_rubric_schema.py` | **19 failures**, incl. golden case `v2_javascript_trim_semantics` and all 6 divergent code points × 3 shapes (`…trims_a_padded_band_value…`, `…whitespace_only_band_value_collapses…`, `…comment_text_decides_whether_the_entry_survives`). Module restored, md5 `ee8505343b7939f2989575684605576d` verified, 261 green again. |
| T67 | AC-15.8 golden values | hand-check vs AC | new case's `expected`: BOM-padded ⇒ `["x"]`; BOM-only ⇒ `[]`; **NEL-padded ⇒ kept whole**; **NEL-only (U+0085) ⇒ `["<NEL>"]` (survives - the opposite direction)**; `U+001C`-padded ⇒ kept; `NBSP+IDEOGRAPHIC` ⇒ `["x"]` / `[]`; `ZWSP` ⇒ kept; array ⇒ `["a","<NEL>","b"]`; `by_band` untrimmed; `comment_bank` 3 ⇒ 2 entries. Correct in **both** directions, and it locks the count-changing shapes. | PASS |
| T68 | AC-15.6 lockstep | inspection | both required-name lists are at **15** with exact-set equality asserted (`REQUIRED_CASE_NAMES`), so a case cannot be dropped in one language only. Fixture has 15 cases; the pre-existing 14 spot-checked unchanged (`v1_malformed_band_scale` ⇒ `{0,3,1}`, `v2_bands_already_arrays` still keeps `output_fields: []`, `v1_docx_parser_output`, `v1_empty_object`). A third `_readme_trim_semantics` explains the rule. | PASS |
| T33 (3rd run) | AC-15.3 drift guard | ST | fixture moved aside ⇒ full pytest | **6 hard FAILURES, 0 skips**; the other **199** tests still ran. Fixture restored, md5 `c80f395523c3a7a46b1fff15838d7c97` verified. |
| T19 / T23 / T30 / NFR-02 (3rd run) | AC-08.2, FR-10, AC-14.3, NFR-02 | diff + negative | `git diff --numstat` for **every tracked file is identical to round 1** (`worker-api.controller.ts` +6/−0 comment-only; `test_prompt.py` +114/−0; `test_schema.py` +120/−0; `reports.service.ts` +15/−5) ⇒ round 2 touched only the untracked twin/fixture/spec files. `weight` bug still at `reports.service.ts:266` (`round1((sum / n / bandMax) * 100)`). `pronunciation` gate rejects `Pronunciation`, `PRONUNCIATION`, `" pronunciation"`, `{}`, `None`, `[]`, `"x"`, `42`, `{dimensions: []}`; accepts only exact lowercase. | PASS |
| T69 | working tree hygiene | git | `git status --porcelain` identical to the pre-QA snapshot; no `*.orig/.rej/.bak`; every QA scratch file lives outside the repo; both temporarily patched files restored with matching md5 | PASS |

### 6.4 Defects

**None.** DEF-01 and DEF-02 are both closed and both are locked by shared-fixture cases that a
mutation test proves are load-bearing. OBS-03 (object key order) stands as a recorded
non-defect; OBS-01/OBS-02 unchanged.

**Verdict: PASS.** F8 meets its acceptance criteria, including the one that mattered most — the TS
and Python copies of `normalizeRubric` are now demonstrably equivalent over 36 000+ differential
inputs, the full Unicode code-point space for trimming, and every hand-designed adversarial probe
that previously broke them.

## Blockers / open questions

None. F8 is complete and gated.

## Notes for the next role

- **Orchestrator:** **F8 is gated PASS and done.** Final numbers: core-api **31 suites / 409 tests**
  + `tsc --noEmit` clean, grading-worker **261 passed / 0 skipped**, zalo-gateway **5 / 26**. Both
  defects QA raised (DEF-01 non-string `String()` semantics, DEF-02 `.strip()` ≠ `.trim()`) were
  fixed Python-only with `rubric-schema.ts` **byte-identical throughout** (md5-verified against QA's
  own archived copy), and both are locked by shared-fixture cases that mutation testing proves are
  load-bearing. Nothing outside F8's file scope moved: the `git diff --numstat` of every tracked
  file is unchanged from round 1.
- **Backend (both rounds, closed):** the fixes went in the correct direction each time (TS is the
  normative reference per AC-03.5). Two things worth carrying into F10/F12: the `_to_text` /
  `_js_trim` pair is the single point where the two languages can silently drift, and the shared
  fixture is the only thing that will catch it — every new value shape must get a fixture case, in
  both required-name lists, in the same commit.
- **F9:** `reports.service.ts:266` still averages dimensions unweighted (`round1((sum / n / bandMax)
  * 100)`) — confirmed present and deliberate for a third time. `aggregation` / `levels` are carried
  through and unused, as specified. If you make `GET /internal/criteria/:courseId` normalize
  server-side you kill the Python shim's only production caller and the drift guard becomes theatre
  — the BA required that decision be stated explicitly.
- **F10 / F12:** OBS-03 (object key order differs between the two languages for `bands` / `by_band`
  / verbatim `levels`) is expected and harmless — do not file it as a bug. Seed templates must be
  normalize fixed points, and any seed containing a non-string band value, a `null` comment text, or
  an invisible code point is already covered by fixture cases `v2_non_string_band_values`,
  `v1_null_comment_text`, `v1_non_string_few_shot_examples`, `v2_javascript_trim_semantics`.
