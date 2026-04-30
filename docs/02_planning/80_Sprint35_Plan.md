# Sprint 35 — P4-S35: Achievements rebalance (exam-prep tied)

**Sprint window:** 2026-04-28
**Theme:** The 17 generic engagement achievements get joined by 8 exam-prep-tied kinds so the catalogue measures exam-progress, not just daily-app-return. Closes [GAP-P4-15](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-15--achievements-catalogue-is-generic-engagement-only).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md): the existing achievement catalogue (S7) is 17 streak/session/question-count milestones — pure engagement loop signals. S35 introduces 8 exam-prep-tied kinds so the catalogue rewards exam-progress behaviour: full-length mocks, syllabus coverage, PYQ chapter mastery, weak-topic recovery, revision streaks.

**Mobile parity** for the Phase-4 surfaces (S22–S34) is named in the original Phase 4 plan as part of S35 but is being **deferred** to a standalone Phase-4-Mobile sprint. The Flutter port of MockExam + Mocks + PYQDrill + Revision + SyllabusCoverage + Goals + topic-detail pills is a meaningful effort that would dilute S35's achievement-rebalance focus if absorbed. Tracked as the largest remaining carry-over.

## Backlog

### S35-A — Pure-function exam-prep-achievement eligibility

New `engagement/analytics/exam_prep_achievements.py` — pure functions, one per kind, taking the relevant signals and returning a kind name when the milestone is crossed (else None):

- `check_mock_completed(prev_count, new_count)` → `"mock_completed_5" | "mock_completed_25" | None` — fires when crossing 5 or 25.
- `check_mock_under_time(remaining_seconds, total_seconds, *, threshold_remaining_min=10)` → `"mock_under_time" | None` — fires when finished a real-pattern mock (≥ threshold) with > 10 min remaining.
- `check_syllabus_milestone(prev_pct, new_pct)` → `"syllabus_25_pct" | "syllabus_50_pct" | "syllabus_75_pct" | "syllabus_100_pct" | None` — fires on threshold-crossing.
- `check_pyq_chapter_clean(accuracy, n_attempted)` → `"pyq_chapter_clean" | None` — fires when ≥80% on a PYQ chapter with ≥5 questions attempted.
- `check_weak_topic_recovered(prev_ewa, new_ewa, *, weak=0.4, recovered=0.7)` → `"weak_topic_recovered" | None` — fires when crossing from below `weak` to above `recovered` on the same topic.
- `check_revision_streak(consecutive_days)` → `"revision_streak_30" | None` — fires at 30 consecutive days of clearing revision queue.

Pure functions only. The integration into `process_session` (live wiring against new mock_attempts / syllabus / revision_queue rows) is the staging-cutover sprint's deliverable.

### S35-B — Achievements catalogue documentation

New `docs/03_qa_testing/Phase4_S35_Achievements_Catalogue.md` enumerating all 25 (17 existing + 8 new) achievement kinds with descriptions, trigger conditions, and the existing kind family they extend.

### S35-C — Tests

| File | Tests | Type |
|---|---|---|
| `services/engagement/tests/analytics/test_exam_prep_achievements.py` | 14 | Python unit (each kind happy + boundary + non-trigger) |

### S35-D — Mobile parity scope doc

Standalone doc `docs/02_planning/Phase4_Mobile_Parity_Scope.md` enumerating the Flutter screens needed (MockExam, Mocks, PYQDrill, Revision, SyllabusCoverage, Goals + TopicDetail pill upgrades). Not implemented in this sprint; delivers the scope catalog so the standalone mobile-parity sprint can run after staging cutover.

### S35-E — Smoke + closure

No new HTTP endpoint in S35 (achievement triggers fire via the existing `_grant_achievement` HTTP path when wired). Smoke unchanged at 66.

Closure 81. Master phase index updated.

## Out of scope

- Live wiring of the eligibility checks into `process_session` — staging cutover (needs cross-service signal aggregation: mock-attempts from quiz, syllabus % from S28, revision-streak from S27).
- Flutter port of Phase 4 web surfaces — Phase-4-Mobile standalone sprint.
- `WeaknessDiagnosis.tsx` Pattern panel UI integration (S29 carry-over) — same.
- TopicDetail.tsx consolidated pill pass (S26 + S32 + S34) — same.
- `Goals.tsx` page UI (S33 carry-over) — same.
- Trajectory HTTP endpoint (S33 carry-over) — staging cutover.
- Daily revision.due cron firing (S27 carry-over) — staging cutover.
- Cohort-percentile aggregation cron firing (S31 carry-over) — staging cutover.
