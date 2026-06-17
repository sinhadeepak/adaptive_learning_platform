# Sprint 30 — P4-S30: Closed-loop study plan + exam-date pacing

**Sprint window:** 2026-04-28
**Theme:** Static 7-day study card → living plan that paces to the user's exam date and recalibrates as their mastery moves.

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md): the existing `study_plan.py` produces a one-shot 7-day card and never updates. Real exam-prep apps recalibrate weekly as mastery moves and tighten cadence as the exam date approaches. This sprint introduces user goals (target exam + date + rank) and rebuilds the heuristic to honour them.

## Backlog

### S30-A — Identity profile migration 010

`profile_schema` rev **010** adds goal columns:

```sql
ALTER TABLE profile_schema.profiles
    ADD COLUMN target_exam_id   UUID NULL,
    ADD COLUMN target_exam_date DATE NULL,
    ADD COLUMN target_rank      INTEGER NULL;
```

NULL-able (existing profiles keep working). No FK on `target_exam_id` because the catalog lives in alp-learning's database.

### S30-B — `PATCH /profile/me/goals` endpoint

In `alp-identity.profile.routes`. Accepts any subset of `{target_exam_id, target_exam_date, target_rank}`; persists the partial update.

### S30-C — Pure-function pacing helpers

New `learning/adaptive/pacing.py`:

- `days_to_exam(exam_date, today)` → int (clamped at 0).
- `weeks_to_exam(exam_date, today)` → float.
- `mocks_per_week_target(weeks_to_exam)` — S-curve scaling: 0.5/week when far (>20w), 1/week (10-20w), 2/week (5-10w), 3/week (1-5w), 4/week (last week).
- `trajectory_status(current_readiness, target_rank, exam_date, today)` → `on_track | behind | ahead | no_target`. Compares the user's current readiness to a per-rank readiness target derived from the existing `_READINESS_TO_PERCENTILE` table.

Pure functions only. No DB / HTTP coupling.

### S30-D — `study_plan.py` v2

`build_study_plan(user_id, exam_code?)` extended to:

1. Fetch the user's goals via a new `fetch_user_goals(user_id)` HTTP client call into `alp-identity`. Empty/missing goal field → no-op (legacy behaviour preserved).
2. Compute `weeks_to_exam` if a target date exists.
3. Pass `mocks_per_week_target` + `trajectory_status` into the heuristic + LLM prompt.
4. Sort weak topics by `(ewa, prereq_depth)` (S26) AND prefer due-revision topics from S27 when those exist.

### S30-E — Pre-mock revision sprint mode (cross-sprint hook)

Within 7 days of `target_exam_date`, the revision-queue endpoint already (S27) honours weak-EWA clamping; S30 adds the user-goal hook so the clamp activates *before* a mock without depending on mocks.

In `engagement.analytics.revision_queue_repo.list_due` — accept an optional `exam_date` param; when set AND `now + 7 days >= exam_date`, lower the due-at filter to today + 0 (return all rows for the user, not just past-due ones).

### S30-F — Web-student `StudyPlan.tsx` v2

The existing study-plan page (assumed to surface the heuristic / LLM card today) gains:
- Trajectory pill (`on_track / behind / ahead / no_target`) sourced from a new `/adaptive/study-plan/{user_id}/trajectory` endpoint (lightweight derivation from goals + readiness).
- "Goals" panel with target rank + exam date inputs (calls `PATCH /profile/me/goals`).
- "What to do this week" digest (~3 bulleted actions from the heuristic plan).

### S30-G — Tests

| File | Tests | Type |
|---|---|---|
| `services/learning/tests/adaptive/test_pacing.py` | 12 | Python unit (pure pacing helpers) |
| `apps/web-student/src/lib/study_plan_goals.test.ts` | 4 | Vitest |

### S30-H — Smoke + closure

1 new smoke step (62). Closure 71. Master phase index updated.

## Out of scope

- Daily revision.due cron firing — already deferred to S30 in plan; landed in this sprint via the pre-mock-clamp signal but the actual scheduler still defers to a separate ops-side sprint.
- Engagement-side recommendation engine prereq integration — defers to S31+.
- Mobile parity — S35.
