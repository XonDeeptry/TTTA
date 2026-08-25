# F9 · PM — Server-side `computeTotal` scoring + Prisma migration + weight-bug fix

- **Owner role:** pm
- **Feature:** F9 — Single server-side `computeTotal(rubric, scores)` in core-api (`services/core-api/src/lib/rubric-scoring.ts`); Prisma migration adding `Grading.totalScore/levelCode/levelLabel/studentAckAt` and `Student.currentLevelCode/currentLevelAt`; fixes the existing bug where `reports.service.ts` silently ignores `weight`; small `SubmissionDetail.tsx` display of total/level/`fix`.
- **Status:** DONE
- **Last updated:** 2026-08-21
- **Depends on:** `F8-pm.md` (assumes rubric is already normalized to v2 shape before `computeTotal` is called)

## Inputs (what this role received)

- Design doc `Idea/20260819-ChamDiemRubricV2.md` Part 2 (the standing bug: `scorePctForGrading` averages unweighted then divides by `band_max`, `weight` is never read), Part 5 (computeTotal spec, single server-side call site, DB columns), Part 8 (file scope), Part 10 item 1 (mandatory test fixtures: KID sum 18/25→"Mover (A1)", IELTS average rounded integer; reject gapped/overlapping `levels`).
- Code read: `services/core-api/src/reports/reports.service.ts` — confirmed `scorePctForGrading` (3 call sites: submission-rate view, dimension-score trend, pilot-comparison) computes `mean(scores)/bandMax` with no weight term; `bandMax = rubric.band_scale[1]` fallback 3.
- `services/core-api/prisma/schema.prisma` — current `Grading` model (`scores Json`, `llmFeedback`, `reviewedFeedback`, no total/level columns today) and `Student` model (no level columns today).
- `docs/dev-team-roles/PROGRESS.md` Feature-2 entry — precedent for additive-only Prisma migrations validated via a disposable Postgres container (same discipline expected here).

## Checklist

- [x] Read Part 2 (bug), Part 5 (spec), Part 10 item 1 (test fixtures) of the design doc
- [x] Confirm the bug by reading `reports.service.ts`'s `scorePctForGrading` and its 3 call sites
- [x] Read current `Grading`/`Student` Prisma models to scope the migration precisely
- [x] Write user stories + acceptance criteria (MoSCoW), including explicit regression-safety ACs for the weight-bug fix
- [x] Define in/out of scope, assumptions (no retroactive backfill)

## Outputs

### User stories (MoSCoW)

**US1 (Must) — `computeTotal` pure function.**
As a backend engineer, I want one pure `computeTotal(rubric, scores): {total, max, level}` function, so total-score and level math exists in exactly one place and is never delegated to the LLM.
- Given `aggregation.method:"sum"`, when computed, then `total` = unweighted sum of per-dimension scores, `max` = sum of each dimension's scale max (KID: 5×5=25) — `weight` does NOT apply to `sum` (only to `weighted_average`, see below).
- Given `aggregation.method:"average"`, when computed, then `total` = unweighted mean of scores, `max` = the rubric's scale max — this preserves TODAY's report behavior exactly for every rubric normalized by F8 to `average` (regression-safety anchor).
- Given `aggregation.method:"weighted_average"` and per-dimension `weight`, when computed, then `total` = Σ(score×weight)/Σ(weight) — this is the new capability that actually fixes the standing bug (weight now affects the number).
- Given `levels` is non-empty and `total` falls inside a level's `[min,max]`, then `level = {code,label}`; given it falls in no level or `levels` is empty, then `level = null` (never throws for this case).
- Given `levels` has a gap (e.g. `[0-10],[12-20]`) or an overlap (e.g. `[0-10],[10-20]`), when validated, then rejected with a clear error — this pure-function-level check is what F10's template-write endpoint surfaces as an API 400.
- Fixtures per Part 10 item 1 (once F10's seed templates exist, re-point tests at them; a hand-built v2 fixture is acceptable meanwhile): KID rubric, scores summing to 18/25 → level "Mover (A1) ~ Junior Panda"; IELTS rubric, 4×(0–9) averaged, rounded to integer per `aggregation.round`.

**US2 (Must) — one server-side call site, never in grading-worker or the LLM prompt.**
As the system, when a grading is created, I want `computeTotal` invoked exactly once, in `worker-api.controller.ts` (which already loads `criteria` at that point), so there's a single source of truth.
- Given the existing submission-grading-creation path, when a `Grading` row is written, then `totalScore`/`levelCode`/`levelLabel` are populated via `computeTotal`.
- Given grading-worker's pipeline posts per-dimension scores to core-api, then it performs NO summation/averaging itself — the LLM is never asked to add up its own scores (design doc: "LLM không bao giờ được yêu cầu cộng điểm").
- Given a grading is created, when `Student.currentLevelCode`/`currentLevelAt` are stale relative to the new grading's level, then they are updated immediately after — this is the Zalo-user→student→level mapping the project owner explicitly asked for (Part 5).

**US3 (Must) — fix the standing weight bug in Reports.**
As an admin/staff viewing Reports, I want `reports.service.ts`'s score aggregation to route through `computeTotal` (respecting `weight`) instead of the current unweighted-average, so reported averages are no longer silently wrong for any rubric with uneven dimension weights.
- Given all 3 existing call sites of `scorePctForGrading` (submission-rate, dimension-score trend, pilot-comparison), when replaced with a `computeTotal`-based percentage (`total/max`), then all 3 produce weight-respecting numbers.
- **Regression-safety AC (explicit, non-negotiable):** given existing/legacy rubrics normalized by F8 to `aggregation.method:"average"` (i.e., every rubric authored before this feature — weight was already decorative for them), when the new code runs, then the reported percentage is numerically IDENTICAL to today's output. A pinned-value test proves this before/after.
- A second, synthetic fixture with genuinely uneven weights under `weighted_average` proves the fix actually changes the number relative to the old (buggy) unweighted calculation — demonstrating the bug is real and now fixed.

**US4 (Should) — display total/level (and `fix`) on the submission detail page.**
As an admin/staff reviewing a submission, I want to see the computed total/level and the `fix` field (when present) without deriving it myself, so review is faster.
- Given `Grading.totalScore`/`levelLabel` are non-null, when `SubmissionDetail.tsx` renders, then it shows something like "Tổng: {total}/{max} — {level}" (vi/en).
- Given `levelLabel` is null (rubric has no `levels` configured), then only total/max is shown — no broken "— null" string.
- Given a dimension's `scores` entry includes `fix` (from F8's `output_fields` support), when rendered, then it's shown read-only alongside `comment` — no new editing capability introduced here (editing content is F12's job).

### In scope
- `lib/rubric-scoring.ts` (`computeTotal`).
- Prisma migration: `Grading.totalScore Float?`, `Grading.levelCode String?`, `Grading.levelLabel String?`, `Grading.studentAckAt DateTime?`; `Student.currentLevelCode String?`, `Student.currentLevelAt DateTime?`. All additive/nullable.
- `worker-api.controller.ts` wiring (compute + persist + update student level).
- `reports.service.ts` fix (all 3 call sites).
- Small `SubmissionDetail.tsx` read-only display addition.

### Out of scope
- Retroactive recompute/backfill of `totalScore` for historical gradings — existing gradings simply have `totalScore/levelCode/levelLabel = null` until they're re-graded. Not requested by the design doc; flagged as an explicit limitation, not a silent gap.
- The three button actions (`ack`/`request_advisor`/`select_student`) that WRITE to `studentAckAt` — this feature only adds the column; F11 writes to it.
- Any UI for editing rubric content/structure (F10 API, F12 UI).

### Assumptions
1. No backfill of historical gradings — stated above, explicit limitation.
2. `Grading.studentAckAt` is added HERE (bundled with the other new `Grading` columns in one migration, matching the design doc's Part 8 file-scope list) even though it's only WRITTEN by F11 — see the dependency note under F11 for why this ordering was chosen over the doc's stated "branch 4 has no dependency."

## Blockers / open questions

None blocking. Flagging for downstream: F9's migration is the natural home for `studentAckAt` per the doc's own Part 8 grouping, which creates a soft dependency from F11→F9 not explicitly stated in the doc's Part 11 dependency table (see F11-pm.md's note).

## Notes for the next role

BA/DBA: this is a pure-additive, nullable-columns-only migration — no backfill needed, no default-value backfill script, matching the F1/F2 precedent (`schema.prisma` + hand-authored `migration.sql`, validated on a disposable Postgres container before handoff). Backend: `computeTotal` must be called from the SAME transaction/request that writes `Grading` in `worker-api.controller.ts`, not as a background job — the doc is explicit that grading-worker must stay "arithmetic-agnostic." Frontend: the total/level display (US4) is read-only and small — don't scope-creep it into an editor, that's F12.
