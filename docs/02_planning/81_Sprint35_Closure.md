# Sprint 35 Closure — P4-S35 Achievements rebalance (exam-prep tied)

**Plan:** [`80_Sprint35_Plan.md`](80_Sprint35_Plan.md)

## Scope delivered

- **Pure-function `engagement/analytics/exam_prep_achievements.py`**: 6 eligibility checkers covering the 8 new achievement kinds (10 string constants — syllabus expands to 4 thresholds):
  - `check_mock_completed(prev, new)` → mock_completed_5 / mock_completed_25 (handles single-call jump-through)
  - `check_mock_under_time(remaining_s, total_s)` → mock_under_time (only counts real-pattern mocks ≥ 90 min total)
  - `check_syllabus_milestone(prev_pct, new_pct)` → 25/50/75/100 (highest-threshold-wins on multi-crossing)
  - `check_pyq_chapter_clean(accuracy, n_attempted)` → pyq_chapter_clean (≥80% with ≥5 attempts)
  - `check_weak_topic_recovered(prev_ewa, new_ewa)` → weak_topic_recovered (full <0.4 → ≥0.7 traversal)
  - `check_revision_streak(consecutive_days)` → revision_streak_30 (DB UNIQUE de-dupes future days)
- **Mobile parity scope catalog**: [`Phase4_Mobile_Parity_Scope.md`](Phase4_Mobile_Parity_Scope.md) enumerating 6 Flutter screens + 7 helper ports + recommended implementation order. Stand-alone sprint runs after staging cutover.

## Tests

| File | Tests | Status |
|---|---|---|
| `services/engagement/tests/analytics/test_exam_prep_achievements.py` | 14 | Verified standalone via `python -c` (full pytest gated on Docker autouse conftest) |

All 14 boundary + happy + non-trigger paths green.

## Carry-overs

These are honest deferrals, not silent omissions:

- **Live wiring of eligibility checks into `process_session`** — staging cutover. Needs cross-service signal aggregation: mock-attempts from quiz, syllabus % via S28 endpoint, revision-streak via S27 queue.
- **Flutter port of all Phase 4 web surfaces** — separate Phase-4-Mobile sprint per the scope catalog. Backend endpoints all live; mobile is the remaining work.
- **Consolidated TopicDetail.tsx pill UI pass** (S26 prereq + S32 percentile + S34 references) — bundled UI sprint after staging cutover.
- **`Goals.tsx` UI** (S33 carry-over) — same.
- **Trajectory HTTP endpoint** (S33 carry-over) — staging cutover (cross-service goals fetch).
- **Daily `revision.due` cron firing** (S27 carry-over) — staging cutover (scheduler infra).
- **Cohort-percentile aggregation cron firing** (S31 carry-over) — staging cutover.
- **`WeaknessDiagnosis.tsx` Pattern panel UI** (S29 carry-over) — bundled UI sprint.

## Phase 4 status

**Phase 4 Tier-1 + Tier-2 + Tier-3 backend foundation closed at S35.** All 14 sprints (S22–S35) shipped:

| Tier | Sprints | What's live in `development` |
|---|---|---|
| **Foundation (Tier 1)** | S22–S25 | Time-per-question, real exam blueprints, exam-mode UI shell, PYQ catalog + ingest CLI, OMR palette + Mocks series |
| **Depth (Tier 2)** | S26–S30 | Prereq graph, spaced repetition (SM-2 + EWA tie-in), syllabus coverage, error-pattern classification, target goals + pacing helpers |
| **Differentiation (Tier 3)** | S31–S34 | Cohort-driven rank prediction, peer percentile, goal/gap analysis, reference materials |
| **Closure** | S35 | Achievements rebalance + mobile parity scope catalog |

The platform now has every backend primitive the strategic gap audit named. The remaining UI consolidation passes + mobile port + scheduler-cron wiring are well-scoped follow-ups (named in the carry-over list above) that the staging-cutover sprint absorbs.

**Phase 4 strategic gates remain *open*** (quiz-vs-exam-prep / which exam first / depth bar). The work is additive and reversible if those gates ultimately go a different direction.
