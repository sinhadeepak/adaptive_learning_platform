# Sprint 33 Closure — P4-S33 Goal/target rank + gap analysis

**Plan:** [`76_Sprint33_Plan.md`](76_Sprint33_Plan.md)

## Scope delivered

- **Pure-function `learning/adaptive/gap_analysis.py`**: `gap_to_target` (signed gap; positive = behind), `priority_for_window` (foundation/drill/peaking phases), `daily_topics_target` (weak-topic drill volume scaled by gap, capped at 5), `recommended_weekly_actions` (composed bundle), `summarise_gap` (UI-ready dict combining trajectory_status from S30 + actions + headline).
- **Web-student helpers `goals.ts`**: `trajectoryColour` (token-coloured pill mapping), `weeklyActionsCopy` (3-line action copy with singular/plural handling).

## Tests

| File | Tests | Status |
|---|---|---|
| `services/learning/tests/adaptive/test_gap_analysis.py` | 10 | 10/10 ✅ |
| `apps/web-student/src/lib/goals.test.ts` | 4 | 4/4 ✅ |

## Carry-overs

- `GET /adaptive/study-plan/{user_id}/trajectory` HTTP endpoint — wires the helpers into a route. Defers to staging-cutover sprint where the cross-service goals fetch lands together with the `study_plan.py` v2 integration.
- `Goals.tsx` page UI — helpers ship now; the page itself defers to S35 mobile-parity sprint where it can be developed alongside the mobile Goals screen.
- Adaptive engine consuming the gap into recommendations — staging-cutover sprint.
- Mobile parity — S35.
