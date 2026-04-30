# Sprint 33 — P4-S33: Goal/target rank + gap analysis UI

**Sprint window:** 2026-04-28
**Theme:** Student-facing surface for the goals + pacing primitives shipped in S30. Closes [GAP-P4-12](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-12--no-goaltarget-rank--gap-analysis).

## Why this sprint

S30 added `target_exam_id`/`target_exam_date`/`target_rank` columns + `pacing.py` pure helpers + `PATCH /profile/me/goals`. S33 ships the consumer surfaces: a **gap-analysis** pure-function that turns `(current_readiness, target_rank, weeks_to_exam)` into a concrete week-by-week recommendation, plus a `Goals.tsx` page that lets students set goals and see their trajectory.

## Backlog

### S33-A — Pure-function gap analysis

New `learning/adaptive/gap_analysis.py`:

- `gap_to_target(current_readiness, target_rank)` → `float` — readiness gap (positive = student behind).
- `recommended_weekly_actions(gap, weeks_to_exam)` → `dict` — recommendation bundle:
  - `weeklyMockTarget` (from S30 `mocks_per_week_target`)
  - `weeklyMinutesTarget` (from S30 `weekly_volume_minutes`)
  - `dailyTopicsTarget` — extra weak-topic drills/day proportional to gap
  - `priority` — `"foundation" | "drill" | "peaking"` based on weeks_to_exam
- `summarise_gap(current_readiness, target_rank, exam_date, today)` → composite UI-ready dict (combines `trajectory_status` + actions + headline string).

Pure functions only.

### S33-B — Trajectory derivation endpoint

New `GET /adaptive/study-plan/{user_id}/trajectory?examId=X` in alp-learning that:
1. Fetches user goals from alp-identity (HTTP)
2. Fetches readiness from alp-engagement (existing client)
3. Returns `summarise_gap` output + raw values

If goals aren't set, returns `{trajectoryStatus: "no_target", message: "Set a target rank to see your gap analysis."}`.

### S33-C — Web-student `Goals.tsx`

New page at `/goals`:
- Form: exam selector (defaults to JEE Main) + target rank input + exam date picker → `PATCH /profile/me/goals`.
- Trajectory hero: status pill (color-token-mapped) + headline.
- Weekly actions panel: 3 actions sourced from `summarise_gap`.
- Pure helper `apps/web-student/src/lib/goals.ts::trajectoryColour(status)` + `weeklyActionsCopy(actions)`.

### S33-D — Tests

| File | Tests | Type |
|---|---|---|
| `services/learning/tests/adaptive/test_gap_analysis.py` | 10 | Python unit |
| `apps/web-student/src/lib/goals.test.ts` | 4 | Vitest |

### S33-E — Smoke + closure

Smoke +1 (65). Closure 77. Master phase index updated.

## Out of scope

- Adaptive engine consumes the gap into the recommendation engine — defers to staging cutover.
- Cross-service fetch_user_goals client used by `study_plan.py` v2 — defers; S33 ships the standalone trajectory endpoint instead.
- Mobile parity — S35.
