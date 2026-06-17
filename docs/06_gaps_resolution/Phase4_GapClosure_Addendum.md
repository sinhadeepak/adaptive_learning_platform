# Phase 4 Gap-Closure Addendum

**Applies to**: Gap Resolution Register v1.2
**Date**: 2026-04-28
**Status**: Informational addendum — not a v1.3. Documents the 16 gaps surfaced by the [Strategic Gap Audit](../02_planning/52_ExamPrep_Strategic_Gap_Audit.md) and the Phase 4 sprints that close each.
**Parent doc**: extends [`GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx`](GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) and [`Appendix_OpenItems_GapRegister_v1.2.md`](Appendix_OpenItems_GapRegister_v1.2.md).

---

## Context

The Phase 3 retrospective closed cleanly on platform mechanics (marketplace, predictive heuristic v1, engagement loop). A subsequent strategic audit (driven by user observation 2026-04-28) surfaced a structural gap between the platform's marketed positioning ("AI-powered competitive exam preparation") and the product's actual depth on exam-prep dimensions.

These gaps are exam-domain-specific, not pre-existing register items, and warrant a Phase 4 addendum rather than re-numbering into the v1.2 register. The Phase 4 sprint plan ([`53_Phase4_ExamPrepDepth_SprintPlan.md`](../02_planning/53_Phase4_ExamPrepDepth_SprintPlan.md)) closes each.

---

## Gap closures

### GAP-P4-01 — No time-per-question tracking
**Symptom**: Quiz session items have `served_at` + `answered_at` but no persisted duration; no aggregation.
**Impact**: Time-pressure pattern detection impossible; strategy coaching has no foundation; exam-prep claim un-earned.
**Closure**: P4-S22 — `time_spent_ms` column + per-section analytics + ADR-0013.

### GAP-P4-02 — No PYQ catalogue
**Symptom**: Questions carry `topic_id` only; no `exam_year`, `paper_session`, `pyq_flag`. Hand-authored seed only.
**Impact**: Aspirants cannot drill PYQs by chapter/year; frequency analysis impossible.
**Closure**: P4-S22 (schema) + P4-S24 (ingest pipeline) + content workstream (10 years JEE PYQ).

### GAP-P4-03 — Stub exam blueprints
**Symptom**: `MOCK_BLUEPRINTS` hardcodes 20-Q / 25-min stubs; real NEET = 180 Q / 180 min.
**Impact**: Mocks misrepresent exam pattern; stamina training broken by construction.
**Closure**: P4-S23 — real JEE Main + Advanced blueprints + ADR-0012.

### GAP-P4-04 — Concept prerequisite graph declared but unused
**Symptom**: `topics.prerequisites` JSONB column exists since Sprint 1; no code reads it.
**Impact**: Adaptive engine cannot enforce prereq ordering; recommendations weaker than possible.
**Closure**: P4-S26 — populate JSONB + activate in adaptive + study plan + recommendation.

### GAP-P4-05 — Mock orchestrator shallow
**Symptom**: Mock returns flat question list; no per-section budgets, no OMR, no marked-for-review queue, no section locks.
**Impact**: Mock UX is "quiz play with sections", not exam simulator.
**Closure**: P4-S23 + P4-S25 — exam-mode UI + OMR + section locks + state recovery.

### GAP-P4-06 — No spaced-repetition revision queue
**Symptom**: No SRS scheduling; bookmarks exist but no due-at concept.
**Impact**: Aspirants must self-discipline revision; weak topics decay silently.
**Closure**: P4-S27 — SM-2 + EWA tie-in + daily revision view + ADR-0014.

### GAP-P4-07 — No syllabus coverage audit
**Symptom**: Mastery is per-topic; no chapter-level aggregation.
**Impact**: Aspirants cannot see "you've covered N% of JEE Physics syllabus".
**Closure**: P4-S28 — syllabus_chapters + chapter mapping + coverage view.

### GAP-P4-08 — Heuristic rank prediction dressed as calibration
**Symptom**: `EXAM_CALIBRATION` is a hardcoded lookup table; no cohort data.
**Impact**: Predicted-AIR signal is not data-grounded; "AI-powered" claim un-earned on this dimension.
**Closure**: P4-S31 — cohort-driven distribution + confidence intervals + honest labelling + ADR-0015.

### GAP-P4-09 — No error-pattern classification
**Symptom**: Wrong answers are `is_correct = false` only; no taxonomy.
**Impact**: Weakness diagnosis stays generic ("you're weak in Mechanics") instead of actionable ("you make sign errors in inclined-plane problems").
**Closure**: P4-S29 — 6-axis heuristic taxonomy + surface endpoint + ADR-0016.

### GAP-P4-10 — Section-wise analytics only on mocks
**Symptom**: Practice sessions emit aggregate `correct_count` / `served_count` only.
**Impact**: Mixed-topic practice has no per-section diagnostic.
**Closure**: P4-S22 — section_id propagation in payload + per-section aggregation in engagement.

### GAP-P4-11 — No peer percentile per topic
**Symptom**: No "you're at 67th percentile vs JEE 2027 aspirants on Mechanics" surface.
**Impact**: Aspirants cannot benchmark themselves against the cohort.
**Closure**: P4-S32 — peer-percentile aggregator + anonymity threshold (cohort < 30 hidden).

### GAP-P4-12 — No goal/target rank + gap analysis
**Symptom**: No `target_rank` field; no gap-to-target plan.
**Impact**: Aspirants cannot tell if they're on track for their target.
**Closure**: P4-S33 — target-rank UI + trajectory + gap-closer recommendations.

### GAP-P4-13 — No reference material integration
**Symptom**: Topics have descriptions; no NCERT / textbook / video links.
**Impact**: Platform doesn't surface canonical learning material when a weakness is identified.
**Closure**: P4-S34 — `topic_references` table + curated content + admin UI.

### GAP-P4-14 — No real exam-mode UI
**Symptom**: Mock player is a quiz with section pills; no per-section timer, no OMR-style answer sheet, no section locks.
**Impact**: UX doesn't match what students see on test day.
**Closure**: P4-S23 + P4-S25 — full exam-mode UI rebuild.

### GAP-P4-15 — Achievements catalogue is generic engagement only
**Symptom**: 17 achievements all tied to streaks, session counts, question counts; zero exam-prep tied.
**Impact**: Achievements optimise for daily app return, not exam preparedness.
**Closure**: P4-S35 — 8 new exam-prep-tied achievements alongside the existing 17.

### GAP-P4-16 — Study plan is a static one-shot
**Symptom**: `study_plan.py` produces a one-time 7-day schedule; no recalibration; no exam-date pacing.
**Impact**: Plan becomes stale; aspirants ignore it.
**Closure**: P4-S30 — closed-loop recalibration + exam-date pacing + mocks-per-week dynamic.

---

## Summary table

| Gap | Severity | Sprint | ADR |
|---|---|---|---|
| GAP-P4-01 Time-per-Q tracking | High | P4-S22 | [0013](../adr/0013-time-per-question-analytics.md) |
| GAP-P4-02 PYQ catalogue | High | P4-S22 + S24 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| GAP-P4-03 Stub exam blueprints | High | P4-S23 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| GAP-P4-04 Prereq graph unused | Medium | P4-S26 | — |
| GAP-P4-05 Mock orchestrator shallow | High | P4-S23 + S25 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| GAP-P4-06 No spaced repetition | High | P4-S27 | [0014](../adr/0014-spaced-repetition-scheduling.md) |
| GAP-P4-07 No syllabus coverage | Medium | P4-S28 | — |
| GAP-P4-08 Heuristic rank prediction | High | P4-S31 | [0015](../adr/0015-calibrated-rank-prediction.md) |
| GAP-P4-09 No error-pattern classification | High | P4-S29 | [0016](../adr/0016-error-pattern-classification.md) |
| GAP-P4-10 Section-wise only on mocks | Medium | P4-S22 | [0013](../adr/0013-time-per-question-analytics.md) |
| GAP-P4-11 No peer percentile | Medium | P4-S32 | [0015](../adr/0015-calibrated-rank-prediction.md) |
| GAP-P4-12 No goal/target gap analysis | Medium | P4-S33 | — |
| GAP-P4-13 No reference materials | Medium | P4-S34 | — |
| GAP-P4-14 No real exam-mode UI | High | P4-S23 + S25 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| GAP-P4-15 Generic achievements only | Low | P4-S35 | — |
| GAP-P4-16 Static study plan | Medium | P4-S30 | — |

**Severity legend**: High = blocks the "exam-prep" claim; Medium = visibly missing to aspirants but workaround exists; Low = polish.

---

## Cross-reference to existing register

The pre-existing v1.2 register tracks GAP-01 through GAP-31. Phase 4 gap numbering (GAP-P4-01..16) is deliberately separate to:

- Avoid renumbering the v1.2 register (signed-off and stable).
- Make Phase 4 gaps individually addressable in sprint commits + closure docs.
- Allow a future v1.3 to optionally absorb these into the canonical register sequence.

For traceability:

- **All 31 v1.2 gaps**: status as documented in v1.2 register + [`ResolutionsLog_GapRegister_v1.2.md`](ResolutionsLog_GapRegister_v1.2.md).
- **5 OI items** from fourth-pass review: status as documented in [`Appendix_OpenItems_GapRegister_v1.2.md`](Appendix_OpenItems_GapRegister_v1.2.md).
- **16 GAP-P4 items**: status documented in this addendum; closure tracked in Phase 4 sprint closure docs (S22-Closure through S36-Closure).
