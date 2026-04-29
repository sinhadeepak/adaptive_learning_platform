# Phase 4 Requirements Addendum — Exam-Prep Depth

**Applies to**: BRD v2.0, PRD v1.0, User Stories v2.0
**Date**: 2026-04-28
**Status**: DRAFT — gated on Phase 4 strategic decisions (see [Phase 4 plan](../02_planning/53_Phase4_ExamPrepDepth_SprintPlan.md) "Pre-sprint gates")
**Parent docs**: this addendum extends but does not replace the .docx requirements artifacts.

This addendum captures the new functional + non-functional requirements introduced by Phase 4 (Sprints 22 → 36), driven by the [Strategic Gap Audit](../02_planning/52_ExamPrep_Strategic_Gap_Audit.md). Each requirement maps to one or more sprint deliverables.

---

## 1. New functional requirements

### FR-P4-01 — Time-per-question tracking
**Description**: The platform shall persist per-item duration (`time_spent_ms`) on submitted quiz session items, and surface time-per-question analytics per topic and per section.
**Acceptance**: New session items have non-NULL `time_spent_ms`; the readiness/mastery view shows median time-per-question per topic.
**Sprint**: P4-S22.
**ADR**: [0013](../adr/0013-time-per-question-analytics.md).

### FR-P4-02 — Real exam blueprints
**Description**: The platform shall support full-length exam blueprints (JEE Main: 75 Q / 180 min / 3 sections, JEE Advanced Paper 1 + Paper 2) configurable per-exam, with section composition, time budgets, and negative-marking rules.
**Acceptance**: A student can take a full-length JEE Main mock end-to-end with the real pattern.
**Sprint**: P4-S23.
**ADR**: [0012](../adr/0012-exam-blueprint-pyq-schema.md).

### FR-P4-03 — Exam-mode UI
**Description**: The mock-test player shall provide per-section timers, section locks (configurable), marked-for-review queue with end-of-section review pass, OMR-style answer marking, exam-instruction screen, hardware-clock-on-screen, and dropped-connection recovery preserving exam state.
**Acceptance**: Disconnect during a 75-Q mock; reconnect within 5 minutes; resume from saved state with timer continuing correctly.
**Sprint**: P4-S23 + P4-S25.

### FR-P4-04 — PYQ catalogue
**Description**: Questions shall carry `exam_year`, `paper_session`, `pyq_flag` metadata. The platform shall expose chapter-wise, year-wise PYQ navigation and frequency-by-chapter analysis.
**Acceptance**: A student can browse "JEE Main 2024 Mechanics PYQs"; the frequency view shows topic occurrences across years.
**Sprint**: P4-S24.
**ADR**: [0012](../adr/0012-exam-blueprint-pyq-schema.md).

### FR-P4-05 — Section-wise analytics on practice sessions
**Description**: The `quiz.session.completed` event shall carry `section_id` per item; the engagement service shall persist per-section accuracy + time aggregations on every session, not only mocks.
**Acceptance**: After a mixed-Physics-and-Chem practice session, the student dashboard shows per-section breakdown.
**Sprint**: P4-S22.

### FR-P4-06 — OMR-style answer sheet + mock series
**Description**: The mock-test player shall offer OMR-style answer marking (mark / clear / mark-for-review). The mock-series view shall list taken / scheduled / available mocks with per-mock predicted AIR, time taken, and section accuracy.
**Acceptance**: Student opens "Mocks", sees a list of 5 seeded JEE mocks with a status badge for each.
**Sprint**: P4-S25.

### FR-P4-07 — Concept prerequisite graph (activation)
**Description**: The existing `prerequisites` JSONB column on `catalog_schema.topics` shall be populated for the focus exam (JEE Physics). The adaptive engine, study plan, and recommendation engine shall consume prereq edges.
**Acceptance**: A student attempting Rotational Dynamics with weak Newton's-Laws mastery sees an inline pill recommending Newton's Laws first.
**Sprint**: P4-S26.

### FR-P4-08 — Spaced-repetition revision queue
**Description**: The platform shall maintain a per-(user, topic) revision queue scheduled by SM-2 with EWA tie-in. A daily revision view shall surface up to 10 items due today. A `revision.due` notification shall fire (default-on, per-user mute toggle).
**Acceptance**: Student opens the platform at 6 AM, sees "10 topics due for revision today".
**Sprint**: P4-S27.
**ADR**: [0014](../adr/0014-spaced-repetition-scheduling.md).

### FR-P4-09 — Pre-mock revision sprint mode
**Description**: Within 7 days of a scheduled mock (or the user's `target_exam_date`), the revision queue shall tighten — all weak topics surface daily, the `revision.due` notification fires with elevated priority.
**Acceptance**: User sets `target_exam_date = today + 5 days`; the next morning's revision queue shows all weak topics regardless of SM-2 interval.
**Sprint**: P4-S27 + P4-S30.

### FR-P4-10 — Syllabus coverage audit
**Description**: The platform shall map topics to syllabus chapters per exam, and surface a chapter-level coverage view ("you have covered N% of the JEE Physics syllabus").
**Acceptance**: Student opens "My Syllabus", sees a tree view (Subject → Chapter → Topic) with mastery colour coding.
**Sprint**: P4-S28.

### FR-P4-11 — Error-pattern classification
**Description**: Wrong-answer items shall be classified into one of: `silly_mistake | conceptual_gap | time_pressure | formula_error | sign_or_unit_error | unattempted`, using a heuristic-v1 classifier at submit time. The weakness-diagnosis surface shall present per-pattern counts and recommended drills.
**Acceptance**: Student opens weakness diagnosis, sees "8 silly mistakes this week" with a drill CTA.
**Sprint**: P4-S29.
**ADR**: [0016](../adr/0016-error-pattern-classification.md).

### FR-P4-12 — Closed-loop study plan
**Description**: The study plan shall recalibrate weekly based on actual progress, pace to the user's `target_exam_date`, and dynamically adjust mocks-per-week. Students with a `target_rank` shall see trajectory tracking (current vs target).
**Acceptance**: Student updates `target_rank` from 12K to 5K; the study plan immediately shifts (more daily volume, tighter mock cadence).
**Sprint**: P4-S30.

### FR-P4-13 — Calibrated rank prediction
**Description**: The platform shall replace the hardcoded readiness-to-percentile lookup with a cohort-driven distribution. Predicted AIR shall include a confidence interval and a labelled source (`cohort` vs `fallback`).
**Acceptance**: A student with cohort > 50 in their bucket sees "predicted AIR 7,500 ± 1,200 — based on N=2,400 platform aspirants in your readiness bucket on JEE Main".
**Sprint**: P4-S31.
**ADR**: [0015](../adr/0015-calibrated-rank-prediction.md).

### FR-P4-14 — Peer percentile per topic
**Description**: Per (user, topic, exam), the platform shall compute the user's percentile rank within the cohort and surface it on topic-detail pages. Hidden when cohort < 30 to preserve anonymity.
**Acceptance**: Student opens Mechanics; sees "your mastery is at the 67th percentile vs 2,400 JEE 2027 aspirants".
**Sprint**: P4-S32.

### FR-P4-15 — Goal/target rank + gap analysis
**Description**: Students shall be able to set a `target_rank` for an exam. The platform shall surface trajectory (current vs target) and "gap closer" recommendations (which topics, how much volume).
**Acceptance**: Student sets target AIR 5,000; sees "you're tracking AIR 8,500; close the gap by drilling Modern Physics + 2 mocks/week".
**Sprint**: P4-S33.

### FR-P4-16 — Reference material integration
**Description**: Topics shall optionally carry references (NCERT chapters, textbook references, video URLs, derivation walkthroughs, formula sheets). The student topic-detail page shall surface these.
**Acceptance**: Student opens Trigonometry; sees "NCERT Class 11 Ch 3" + a 12-min explainer video link + a derivation walkthrough.
**Sprint**: P4-S34.

### FR-P4-17 — Exam-prep-tied achievements
**Description**: The achievements catalogue shall extend with exam-prep-tied kinds: `mock_completed_5`, `mock_completed_25`, `mock_under_time`, `syllabus_25_pct..100_pct`, `pyq_chapter_clean`, `weak_topic_recovered`, `revision_streak_30`. Existing 17 generic engagement achievements stay intact.
**Acceptance**: Student completes 5 full-length mocks; `mock_completed_5` achievement unlocks; visible on profile.
**Sprint**: P4-S35.

### FR-P4-18 — Mobile parity for Phase 4 surfaces
**Description**: The Flutter mobile app shall reach feature parity with web on: PYQ drill, mock series, OMR-style answer sheet, syllabus coverage, revision queue, study plan v2, target rank UI, peer percentile (read-only).
**Acceptance**: All Phase 4 surfaces work on mobile with the same core UX as web.
**Sprint**: P4-S35.

---

## 2. New non-functional requirements

### NFR-P4-01 — Exam-mode session reliability
A mock test in progress shall survive a network drop of up to 5 minutes and resume from server-persisted state with the timer continuing. Lost answers (between disconnect and last-saved heartbeat) shall be limited to one item.
**Sprint**: P4-S23 (recovery is part of exam-mode UI).

### NFR-P4-02 — Time-stamp accuracy
`time_spent_ms` shall be computed server-side from `served_at` and `answered_at` timestamps to prevent client-side clock manipulation. Clients submitting tampered values shall be ignored.
**Sprint**: P4-S22.

### NFR-P4-03 — PYQ ingest throughput
The PYQ ingest CLI shall be able to ingest a 75-Q paper in < 10 minutes including LLM-assisted topic-tagging + human review pass.
**Sprint**: P4-S24.

### NFR-P4-04 — Cohort-percentile aggregation latency
The nightly `cohort_percentile_distribution` aggregation shall complete in < 5 minutes at 100K-user scale, on a single host.
**Sprint**: P4-S31.

### NFR-P4-05 — Revision queue surface latency
The daily revision-queue endpoint shall serve in p95 < 200 ms for a user with up to 500 tracked topics.
**Sprint**: P4-S27.

### NFR-P4-06 — Honest UI labelling for low-confidence predictions
When predicted AIR uses the fallback (cohort < 50 in bucket) or peer-percentile is hidden (cohort < 30), the UI shall clearly disclose the limitation rather than silently degrading.
**Sprint**: P4-S31 + P4-S32.

---

## 3. New user stories (story IDs reserve next-available numbers)

These extend [User Stories v2](05_UserStories_v2_Adaptive_Learning_Platform.docx). Story IDs follow the existing convention (STU = student, TCH = teacher, ADM = admin, AUT = author).

| ID (proposed) | As a … | I want to … | So that … | Sprint |
|---|---|---|---|---|
| STU-REQ-101 | Student | See how long I spent on each question | I can identify time-pressure patterns | P4-S22 |
| STU-REQ-102 | Student | Take a full-length real-pattern JEE Main mock | I can simulate exam day | P4-S23 |
| STU-REQ-103 | Student | Use an OMR-style answer sheet during mocks | The interface matches the actual exam | P4-S25 |
| STU-REQ-104 | Student | Browse PYQs by chapter and year | I can drill the most-frequent question types | P4-S24 |
| STU-REQ-105 | Student | See "you've covered N% of JEE Physics syllabus" | I know what I haven't touched yet | P4-S28 |
| STU-REQ-106 | Student | Get a daily revision queue based on what I'm forgetting | I don't have to plan revision myself | P4-S27 |
| STU-REQ-107 | Student | Be told "you make sign errors in inclined-plane problems — drill these 5" | I can fix specific weaknesses | P4-S29 |
| STU-REQ-108 | Student | Set a target AIR and see my trajectory | I know if I'm on track | P4-S33 |
| STU-REQ-109 | Student | See predicted AIR with honest confidence intervals | I trust the prediction or know when not to | P4-S31 |
| STU-REQ-110 | Student | See my percentile vs other JEE 2027 aspirants on a topic | I know how I rank | P4-S32 |
| STU-REQ-111 | Student | See NCERT chapter + video links on weak topics | I can fix a gap with canonical material | P4-S34 |
| STU-REQ-112 | Student | Get an achievement when I complete 5 full-length mocks | The platform recognises exam-prep behaviour | P4-S35 |
| TCH-REQ-101 | Teacher | See per-student error-pattern breakdown for a cohort | I can intervene where it matters | P4-S29 |
| TCH-REQ-102 | Teacher | See per-student syllabus coverage for a cohort | I know which students are behind | P4-S28 |
| AUT-REQ-101 | Author | Tag questions with exam_year + paper_session + pyq_flag | The PYQ corpus is searchable | P4-S24 |
| ADM-REQ-101 | Admin | Edit exam blueprints from a UI | I can adjust without a deploy | P4-S25 |

Full Definition of Done + acceptance criteria per story shipped at sprint-plan time.

---

## 4. Out of scope for Phase 4

Explicitly **not** in this requirements set; defer to Phase 5+:

- NEET / UPSC / CBSE depth (Phase 4 narrows to JEE Main + Advanced).
- Live class platform (compete with Vedantu live tutors) — separate workstream.
- Native video upload + DRM (P4 integrates external video URLs only).
- LLM-based error classification v2 — heuristic v1 in P4-S29 is the v1 path; LLM is reserved.
- Question-of-the-day daily-mode gamification.
- ML drop-out / recommendation upgrade (lightgbm / pgvector / OpenAI embeddings) — inherited Phase 3 carry-over.

---

## 5. Traceability

| Sprint | Closes Phase 4 FRs | Closes legacy gaps |
|---|---|---|
| P4-S22 | FR-P4-01, FR-P4-05 | partial gap-closure for "time analytics" (audit §1) |
| P4-S23 | FR-P4-02, FR-P4-03 | "real exam blueprints" (audit §3) |
| P4-S24 | FR-P4-04 | "PYQ catalogue" (audit §2) |
| P4-S25 | FR-P4-06 | "exam-mode UX" (audit §14) |
| P4-S26 | FR-P4-07 | "concept prerequisite graph activation" (audit §4) |
| P4-S27 | FR-P4-08, FR-P4-09 | "spaced repetition" (audit §6) |
| P4-S28 | FR-P4-10 | "syllabus coverage audit" (audit §7) |
| P4-S29 | FR-P4-11 | "error pattern classification" (audit §9) |
| P4-S30 | FR-P4-12 | "closed-loop study plan" (audit §16) |
| P4-S31 | FR-P4-13 | "calibrated rank prediction" (audit §8) |
| P4-S32 | FR-P4-14 | "peer percentile" (audit §11) |
| P4-S33 | FR-P4-15 | "goal/target rank + gap analysis" (audit §12) |
| P4-S34 | FR-P4-16 | "reference material integration" (audit §13) |
| P4-S35 | FR-P4-17, FR-P4-18 | "achievements rebalance" (audit §15) + mobile parity |

A consolidated RTM addendum will refresh [`06_RTM_Adaptive_Learning_Platform.docx`](06_RTM_Adaptive_Learning_Platform.docx) at Phase 4 close.
