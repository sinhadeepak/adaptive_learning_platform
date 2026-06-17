# Sprint 30 Closure — P4-S30 Closed-loop study plan + pacing

**Sprint window:** 2026-04-28
**Plan:** [`docs/02_planning/70_Sprint30_Plan.md`](70_Sprint30_Plan.md)

## Scope delivered

### S30-A — Identity profile migration 010 — DONE

`profile_schema.profiles` rev **010** adds three NULL-able goal columns:

```sql
ALTER TABLE profile_schema.profiles
  ADD COLUMN target_exam_id   UUID NULL,
  ADD COLUMN target_exam_date DATE NULL,
  ADD COLUMN target_rank      INTEGER NULL;
```

Existing profiles keep working. No FK on `target_exam_id` because the catalog lives in alp-learning's database.

### S30-B — `PATCH /profile/me/goals` — DONE

In `alp-identity.profile.routes`:
- `GoalsPatch` Pydantic body: `targetExamId` + `targetExamDate` + `targetRank` (all optional; `targetRank` constrained to [1, 10M]).
- `ProfileRepo.patch_goals(...)` uses COALESCE so any field passed as NULL is preserved (partial update pattern).
- Route returns `{userId, targetExamId, targetExamDate, targetRank}`.

### S30-C — Pure-function pacing — DONE

New `learning/adaptive/pacing.py`:
- `days_to_exam(exam_date, today)` / `weeks_to_exam(...)` — clamps past dates to 0; None-safe.
- `mocks_per_week_target(weeks)` — S-curve scaling: 0/wk far (>20w), 1/wk (10-20w), 2/wk (5-10w), 3/wk (1-5w), 4/wk peaking week.
- `weekly_volume_minutes(weeks)` — companion S-curve in minutes.
- `readiness_target_for_rank(rank)` — linear interpolation across a rank → readiness band table (mirrors rank.py until S31 calibrates against cohort data).
- `trajectory_status(current_readiness, target_rank, exam_date, today)` → `on_track | behind | ahead | no_target` with a symmetric ±0.05 readiness band.

All pure-function, no DB / HTTP coupling.

### S30-D — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/learning/tests/adaptive/test_pacing.py` | 13 | Python unit | 13/13 ✅ |

Plan estimated 12; trajectory status interpolation picked up 1 extra boundary test.

### S30-E — Smoke — DONE

1 new step (62): `PATCH /profile/me/goals` returns persisted `targetRank` + `targetExamDate`.

Smoke target: **62 steps**.

## Carry-overs to Sprint 31

| Item | Why deferred | Owner |
|---|---|---|
| `study_plan.py` v2 (fetch_user_goals + apply pacing in heuristic + LLM prompts) | Cross-service HTTP fan-out + complex prompt-engineering touch; pacing helpers ship now so the integration is isolated | P4-S33 polish |
| `web-student/src/pages/StudyPlan.tsx` v2 (trajectory pill + goals panel + weekly digest) | UI integration depends on study_plan.py v2 endpoint shape | P4-S33 |
| Pre-mock revision sprint mode (revision queue tightening near exam_date) | Depends on goals being readable from engagement (cross-service); listed as S30 carry-over in S27 closure | P4-S33 |
| Daily `revision.due` notification cron firing | Scheduler infra | post-cutover |
| Mobile parity (StudyPlan + Goals editor) | Phase 4 plan | P4-S35 |

## Sprint 30 status

**P4-S30 closed.** Goal storage + pacing helpers are live. The closed-loop study-plan integration is intentionally deferred to S33 polish so this sprint stays tight; the foundation (goals row + pure pacing functions + trajectory math) is what unlocks the integration.
