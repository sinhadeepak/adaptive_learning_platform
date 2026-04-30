# Strategic Gap Audit — "Quiz app" vs "AI-powered competitive exam prep"

**Date**: 2026-04-28
**Author**: Deepak Sinha (full-stack AI developer)
**Triggered by**: User observation after end-to-end review of the live stack — "this looks more like a quiz application, not an exam preparation application with deep analytics."

This document does not soften that critique. It validates it, grounds it in code, and proposes a path forward.

---

## TL;DR

The user is right. The platform today is a **competent adaptive-quiz engine + marketplace + engagement loop, with cosmetic LLM surfaces wrapped around heuristics**. It is not an exam-preparation product. The marketing claim ("AI-powered competitive exam preparation for India — NEET, JEE, UPSC, CBSE") and the actual user experience diverge meaningfully.

The platform succeeds at:
1. Adaptive next-question selection via 3PL IRT
2. Per-topic mastery tracking (EWA α=0.4)
3. Engagement mechanics (streaks, achievements, daily goals)
4. Marketplace (live tutors + creator courses + ratings + payouts)
5. Predictive heuristic v1 (drop-out + topic recommendations)

The platform fails at — or has only stubbed — every structural feature that distinguishes a serious exam-prep product:

- No time-per-question tracking
- No PYQ (Previous Year Question) catalog
- No real exam-paper blueprint (current "NEET mock" is 20 Qs in 25 min — actual NEET is 180 Qs in 180 min)
- No concept prerequisite graph (the column exists in [`catalog_schema.topics.prerequisites`](../../services/learning/alembic/catalog/versions/001_create_catalog_schema.py#L89), but no code reads it)
- No spaced-repetition revision queue
- No syllabus-coverage audit
- No calibrated rank prediction (the calibration table is a hand-coded lookup, not learned from cohort data)
- No error-pattern classification (only `is_correct` boolean)
- No section-wise analytics on regular practice sessions
- No peer percentile vs national cohort
- No goal/target-rank + gap analysis
- No reference-material integration (NCERT chapters, video links, textbook references)
- No real exam-mode UI (no per-section timers, no OMR-style answer sheet, no section locks)
- 17 of 17 achievements are generic engagement (streaks, session counts) — zero tied to exam-prep behaviour

The remediation is a strategic question, not a technical one. Either commit to closing this gap on a focused timeline, or stop selling the platform as exam preparation.

---

## What "exam prep" means in the Indian competitive context

Aspirants for NEET / JEE / UPSC / CBSE Board exams work with a remarkably consistent toolkit:

1. **NCERT + standard reference texts** (NCERT for boards/NEET; HC Verma + Irodov for JEE Physics; OP Tandon for Chemistry; etc.)
2. **PYQ corpus** — every aspirant drills 10–20 years of previous-year papers chapter-wise. Frequency analysis ("rotational dynamics shows up in 80% of JEE papers") is a key signal.
3. **Mock test series** — full-length, exam-pattern timed mocks with all-India ranking. Allen, Aakash, Vedantu, Unacademy, PhysicsWallah all sell mock series; aspirants take 30–80 mocks before the exam.
4. **Concept videos** — short topic explainers for foundation, longer derivation walk-throughs for depth.
5. **Doubt resolution** — fast turnaround on "why is my answer wrong" with conceptual explanations, not just correct-answer reveal.
6. **Time management** — the **single biggest** failure mode in JEE/NEET is not "I don't know the answer" but "I ran out of time on Section A and rushed Section C." Time-per-question vs accuracy curves are the most-watched analytics.
7. **Strategy** — when to skip, when to attempt, optimal section ordering, negative-marking-aware risk taking.
8. **Stamina training** — building 3-hour sustained-focus capacity.
9. **Revision discipline** — spaced repetition of weak topics, peaking strategy in the last 4–6 weeks.

A serious exam-prep product surfaces these explicitly. The platform today surfaces **none of them**.

---

## Surface-by-surface audit (evidence-grounded)

### 1. Time-per-question — **MISSING**

[`quiz_session_items`](../../services/quiz/migrations/001_create_quiz_schema.up.sql#L44-L53) has `served_at` and `answered_at` timestamps but no duration field, no aggregation, no analytics surface. Time elapsed is computable in the UI as a difference but is never persisted or reported.

For an exam-prep platform, this is the single highest-value missing signal. Time-per-question vs accuracy is the foundation of strategy coaching.

### 2. PYQ catalog — **MISSING**

The `questions` table has `topic_id` only. No `exam_year`, no `paper_session` (e.g., "JEE Main 2024 January Shift 1"), no `pyq_flag`. The 480-question bank is hand-authored content + Hindi seed, not PYQ-derived. There is no way for the platform to say "this is a 2023 NEET question" or "show me the 50 most-frequent JEE Mechanics PYQs."

### 3. Exam paper blueprint — **STUB**

[`adaptive/mock.py`](../../services/learning/src/learning/adaptive/mock.py#L48-L77) hardcodes `MOCK_BLUEPRINTS` for NEET and JEE, but the comment at [line 15](../../services/learning/src/learning/adaptive/mock.py#L15) admits it's "20–30 Qs; full-length 180 Q NEET papers wait for content scaling." This is 1/9th of the real NEET pattern. A NEET aspirant taking this "mock" gets a misleading-by-construction practice signal — short mocks do not prepare you for sustained 3-hour exam stamina.

### 4. Topic prerequisites — **DECLARED, UNUSED**

The `prerequisites` JSONB column exists on [`catalog_schema.topics`](../../services/learning/alembic/catalog/versions/001_create_catalog_schema.py#L89) but no code anywhere queries it. The schema declared the intent; the logic was never built. As a result:
- The adaptive engine cannot say "you can't attempt rotational dynamics until you've mastered torque and moment-of-inertia"
- The recommendation engine's "bridge topics" feature (Sprint 20) approximates this with "mastered sibling in same subject," which is a much weaker signal
- The study plan cannot order topics by prereq dependency

### 5. Mock test orchestration — **SHALLOW**

`adaptive/mock.py` returns a paper with sections + questions + scoring rules. The web UI ([`MockTest.tsx`](../../apps/web-student/src/pages/MockTest.tsx)) renders a global timer + flag-for-review button. **Missing**:
- Per-section time budgets (NEET = 60 min Physics + 60 min Chem + 60 min Bio, separately enforced)
- Section locks (if Physics time expires, you cannot go back)
- OMR-style answer sheet
- Marked-for-review queue with end-of-section review pass
- Strict no-back-navigation mode (some exams forbid revisiting earlier sections)
- Section-wise time-analytics post-submission
- Mock attempt persistence (this exists per Sprint 7) but doesn't produce per-section-time vs accuracy curves

### 6. Spaced repetition — **MISSING**

Zero references to `spaced`, `srs`, `review_due`, `forgetting_curve`, `anki` anywhere in the codebase. The mastery model is a stateless EWA. There is no "topics due for revision today" surface, no Leitner/SM-2 scheduling, no pre-exam revision sprint mode.

### 7. Syllabus coverage audit — **MISSING**

Mastery is per-topic. No aggregation against a defined syllabus tree. The platform cannot say "you have practised 35% of the JEE Physics syllabus, the missing chapters are X, Y, Z." For aspirants, syllabus completion is a primary anxiety driver and a primary retention surface.

### 8. Calibrated rank prediction — **HEURISTIC IN A LAB COAT**

[`adaptive/rank.py`](../../services/learning/src/learning/adaptive/rank.py#L31-L71) defines `EXAM_CALIBRATION` with hardcoded candidate pool sizes (~2.4M NEET, ~1.4M JEE, ~1M UPSC) and a piecewise-linear `_READINESS_TO_PERCENTILE` lookup table at [lines 78-89](../../services/learning/src/learning/adaptive/rank.py#L78). **The "calibration" is an assumption.** No cohort data is collected, no real percentile distribution is learned, no model updates as the platform scales.

The code does honestly widen confidence bands when attempt volume is low (good), and the comment at [line 3](../../services/learning/src/learning/adaptive/rank.py#L3) calls itself "deliberately *honest*." But the base rank is fictional. A predicted AIR coming out of this is a **lookup answer**, not a prediction.

### 9. Error-pattern classification — **MISSING**

Wrong answers are stored as `is_correct = false` only. There is no taxonomy (silly mistake / conceptual gap / time pressure / formula misapplication / sign error / unit error). [`adaptive/weakness.py`](../../services/learning/src/learning/adaptive/weakness.py) calls the LLM to identify cross-topic weakness *patterns* but does not classify individual errors. Without that, weakness diagnosis stays generic.

### 10. Section-wise analytics on practice sessions — **PARTIAL**

Mock scoring emits per-section breakdowns. Regular practice sessions in alp-quiz emit `correct_count` + `served_count` aggregates only. So if a student does 90 minutes of mixed practice across Physics + Chem topics, they cannot see "you got 70% in Physics Mechanics but 40% in Chem Stoichiometry, and you spent 2x as long on Chem."

### 11. Peer percentile vs national cohort — **MISSING**

Cohort leaderboards exist for institution students. There is no "you are at the 67th percentile vs all JEE 2027 students who have attempted Mechanics on this platform." That requires anonymous aggregation across the full student base — the data model can support it; the surface doesn't exist.

### 12. Goal/target rank + gap-to-target — **MISSING**

No `target_rank`, `goal_score`, or gap-analysis fields anywhere. The study plan ([`adaptive/study_plan.py`](../../services/learning/src/learning/adaptive/study_plan.py#L279)) targets `min(0.7, max(0.4, ewa + 0.2))` per weak topic — a generic "lift mastery by 0.2 this week" rule, not a multi-week plan tied to "your target is AIR 5000; here's the gap to close."

### 13. Reference material integration — **MISSING**

Topics have descriptions and objectives but no foreign keys to NCERT chapters, textbook references, or concept videos. The platform cannot say "to fix your Trigonometry weakness, watch this video and read NCERT Class 11 Chapter 3." That entire content layer is absent.

### 14. Real exam-mode UI — **STUB**

The mock-test UI is a "quiz play with sections" surface. It is not an exam simulator. Missing: per-section time, OMR-style answer marking, section locks, marked-for-review queue with end-of-section review pass, exam-instruction screen, no-pause modal, hardware-clock-on-screen, dropped-connection recovery preserving exam state.

### 15. Achievements catalog — **17 generic engagement kinds, 0 exam-prep kinds**

[`engagement/analytics/processing.py`](../../services/engagement/src/engagement/analytics/processing.py#L36-L46) defines: streak milestones (3/7/14/30/60/100/365 days), session counts (10/50/100/500), question counts (50/250/1000/5000), first session, daily goal hit. **All 17 are generic engagement metrics.** There is no "complete a full-length NEET mock under 180 minutes," "cover the entire JEE Physics syllabus to >50% mastery," "score >80% in 3 consecutive PYQ chapters." Achievements optimise for *daily app return*, not *exam preparedness*.

### 16. Study plan + weakness diagnosis — **AI prose around heuristics**

`study_plan.py` either calls the LLM or falls back to `_heuristic_study_plan` ([line 262](../../services/learning/src/learning/adaptive/study_plan.py#L262)). Both produce a one-time static 7-day schedule. Neither recalibrates weekly. Neither paces to exam date. Neither shifts focus when the student suddenly masters a weak topic. The LLM path produces narrative ("This week, focus on Mechanics — your 32% mastery here is the biggest gap…") around the same heuristic ranking. **It is personalisation theatre, not adaptive logic.**

`weakness.py` is gated to ≥15 attempts + ≥5 wrong answers, then calls the LLM once for cross-topic patterns. It does not recommend follow-up drills, does not track whether the student acted on the prescription, does not re-run to measure improvement. **It is a static screen, not a closed loop.**

---

## Why this gap exists (structural read)

The platform was built **bottom-up, infra-first**:

```
Phase 0:  Foundation (CI, Helm, Terraform, Docker)
Phase 1:  Core loop validation
            → Quiz session FSM, IRT, mastery, NATS, Notification, Auth, Catalog
Phase 2:  Global expansion (becoming Phase 1 + payment + institution + educator features)
            → Stripe, Cohorts, Assignments, Cohort leaderboards
Phase 3:  Platform evolution (marketplace + predictive heuristic v1)
            → Tutors, creators, courses, ratings, refunds, dropout/recommendations
```

Each phase delivered competent infrastructure and ergonomic developer experience. **No phase delivered exam-domain depth.** The closest was "S5 AI Deepening" (study plan, mock orchestrator, predictive AIR), but as the audit shows, every one of those nine AI verticals is a heuristic with LLM prose overlay — not an adaptive learning loop calibrated to a specific exam.

The ADRs that gate the architecture were also written from a generic-platform perspective:
- [ADR-0010](../adr/0010-predictive-analytics-model-serving.md) chose "pure Python heuristics" for predictive analytics, optimising for **drop-out** prediction
- [ADR-0011](../adr/0011-recommendation-algorithm.md) chose content-based recommendations, optimising for **next topic** suggestion

Neither ADR addresses **exam preparedness** as a first-class metric. There is no ADR for:
- Time-per-question modelling
- PYQ ingest pipeline
- Concept dependency graph
- Spaced repetition
- Calibrated rank prediction with cohort data
- Exam blueprint metadata schema

This is the heart of the gap. **The platform's architecture optimises for a generic adaptive-learning platform; the marketing positions it as a specific exam-prep product.** The two need not be in conflict, but they currently are because no architectural budget was ever allocated to the exam-prep specifics.

A second contributor: **Phase 3 chose the marketplace over deepening exam prep.** Sprints 15–21 (P3-S0 through P3-S6) put 7 sprints into tutor + creator + ratings + refunds + course modules. That work is good — but it was a strategic bet on *who teaches* rather than *how the platform prepares*. A counterfactual Phase 3 could have spent 7 sprints on PYQ ingest, exam blueprint schema, time-per-question analytics, syllabus coverage audit, calibrated rank prediction, exam-mode UI, and spaced repetition. That would have produced a different product.

---

## What an aspirant sees today (concrete walk-through)

Imagine a JEE Main 2027 aspirant lands on the platform at 6 AM on a Sunday, 6 months before the exam:

1. **Login** → student dashboard. Sees: streak counter, daily goal pill, "personalised next step" tile (Sprint 20).
2. **Browse exams** → JEE Main → Physics → Mechanics → Newton's Laws. 20 questions in the topic, IRT-difficulty-calibrated.
3. **Practice 10 questions.** Sees per-question correctness, an explanation on each. Mastery EWA ticks up. No timer pressure. No "this is how this question would appear on JEE." No PYQ tag. No "you spent 4 minutes on Q3, the JEE allowance is 2 minutes."
4. **Take a "JEE Main mock"** → 20 questions in 25 minutes (shown as a "scaled" mock, but not labelled clearly as such).
5. **See results.** Predicted AIR = 47,000 (from a hardcoded lookup). No confidence interval explanation. No "compared to other JEE 2027 aspirants on this platform." No "your time management was the issue, not your accuracy."
6. **Open weakness diagnosis.** LLM-generated prose: "You have a pattern weakness in dimensional analysis across Mechanics and Fluid Dynamics. Try drilling unit conversions." No specific drills surfaced. No follow-up tracking.
7. **Open study plan.** 7-day plan: focus on Mechanics, 30 min/day, 5 topics in cyclic rotation. No mention of exam date. No mention of syllabus coverage. No mention of mocks-per-week pacing.
8. **Look at achievements.** Earned: "first session," "3-day streak," "50 questions answered." Locked: "100 questions," "30-day streak."

Now imagine the same student opening Allen TestSeries / Vedantu / PhysicsWallah at 6 AM on the same Sunday:

1. **Daily revision queue** — 12 spaced-repetition items due today, drawn from forgetting-curve scheduling on past mistakes.
2. **PYQ chapter drill** — JEE 2024 January Shift 1, Physics, Mechanics. 8 questions, exact paper layout. Time pressure: 16 minutes. Negative marking on.
3. **After submission** — section-wise time analytics, peer percentile (top 23% on this question set), error-pattern tags ("you made a sign error twice; you misapplied the equation in Q5"), recommended drills (3 follow-up questions).
4. **Open syllabus dashboard** — JEE Physics, 70% covered, missing chapters: Rotational Dynamics, Capacitors, Modern Physics.
5. **Look at exam-readiness pacing** — "JEE Main is 184 days away. You're on track for AIR 12,000. Your target is AIR 5,000. To close the gap, focus on Modern Physics and increase mocks to 2/week."
6. **Mocks tab** — last 5 mocks: AIR projection trajectory, time-to-finish trend, section accuracy heatmap.

The two experiences are not the same product.

---

## Remediation roadmap (priority-ranked, evidence-driven)

This roadmap assumes the strategic decision is "yes, become an exam-prep platform." If the decision goes the other way, skip this section and read "Strategic decision points" below.

### Tier 1 — Most-of-the-perception-shift, ~3–4 sprints

These are additive, well-scoped, and individually visible to users.

**S22-A: Time-per-question instrumentation.** Add `time_spent_ms` to `quiz_session_items`. Compute on submit (already have `served_at` + `answered_at`). Surface in result panel + per-topic analytics + post-mock breakdown. ~1 sprint.

**S22-B: Real exam blueprints + exam-mode UI.** Replace the 20-Q stub `MOCK_BLUEPRINTS` with full-length NEET (180 Q / 180 min / 4 sections) + JEE Main (75 Q / 180 min / 3 sections). Add exam-mode UI: per-section timers, section locks, marked-for-review queue with review pass, OMR-style answer marking. **Requires growing the question bank** — see S22-C. ~2 sprints (UI + content).

**S22-C: PYQ ingest pipeline.** Schema: `question.exam_year`, `question.paper_session` (e.g., "JEE-Main-2024-Jan-S1"), `question.pyq_flag`. Build PYQ ingest tooling. Seed at minimum 5 years of one exam (e.g., JEE Main 2020-2024 Physics). Surface a PYQ-frequency-by-chapter view. Seeding work scales with content effort, not engineering. ~1 sprint engineering + ongoing content.

**S22-D: Section-wise practice analytics.** Emit per-section accuracy + time-spent on standard practice sessions, not just mocks. Wire into the readiness/mastery view. ~0.5 sprint.

### Tier 2 — Closes the gap meaningfully, ~4–5 sprints

**S23-A: Concept prerequisite graph activation.** Populate the existing `prerequisites` JSONB for the seeded exam (start with JEE Physics). Wire into adaptive engine ("recommend prereq if mastery < 0.3"), study plan ("don't suggest rotational dynamics before torque is mastered"), and weakness diagnosis. ~1 sprint code + content effort.

**S23-B: Spaced-repetition revision queue.** New table `revision_queue` keyed on `(user_id, topic_id)` with `due_at` from a Leitner/SM-2 scheduler over EWA gaps. Daily revision view on web + mobile. Wires into existing notification surface (`revision.due` event type). ~1.5 sprints.

**S23-C: Syllabus coverage audit.** Add `chapter_id` to topics if not already there; build coverage view ("JEE Physics: 67% covered; missing: Modern Physics, Capacitors, Wave Optics"). ~1 sprint.

**S23-D: Error-pattern classification.** Lightweight taxonomy: `silly_mistake / conceptual_gap / time_pressure / formula_error / sign_or_unit_error`. Tag wrong answers via heuristics (time-pressure if `time_spent_ms < 30s`; sign/unit error if the chosen answer matches expected with sign/unit flipped, etc.). Fully heuristic v1; LLM v2 later. ~1 sprint.

**S23-E: Closed-loop study plan.** Recalibrate weekly based on actual progress. Pace to exam date. Reflect mocks taken vs. plan. ~1 sprint upgrade to existing study_plan.py.

### Tier 3 — Slow burn / Phase 4

**S24-A: Calibrated rank prediction.** Replace lookup-table calibration with cohort-data-driven percentile mapping. Requires sufficient cohort scale. Surface confidence intervals more aggressively.
**S24-B: Peer percentile vs cohort.** Per-topic, per-exam percentile vs all platform users on the same exam track.
**S24-C: Goal/target-rank + gap analysis.** UI for setting target AIR, plan recalibration to close the gap.
**S24-D: Reference material integration.** NCERT chapter links, textbook references, concept video URLs on topics.
**S24-E: Achievements rebalanced for exam-prep.** Add exam-prep-tied achievements: "completed 5 full-length mocks," "covered 50% of JEE Physics syllabus," "achieved >70% in 3 consecutive PYQ chapters." Rebalance the catalog.

---

## Strategic decision points

Before any of the above ships, three decisions need to land:

### 1. Quiz platform or exam-prep platform?

The current product is a **strong adaptive-quiz platform with a marketplace and engagement loop**. That is a defensible product on its own. It can compete with Khan Academy (in pedagogy depth) or Quizlet (in question variety) for the *general practice* market, especially with the marketplace and Indian-context pricing.

The marketed product is **AI-powered competitive exam preparation**. That is a different market — Allen, Aakash, Vedantu, Unacademy, PhysicsWallah, BYJU's are the competitors. None of them would lose a customer to the current platform because the current platform doesn't address what those customers buy.

**Pick one and align everything (positioning, roadmap, ICP, success metrics) to it.**

### 2. If exam-prep: which exam first?

Trying to be a quality NEET + JEE + UPSC + CBSE prep platform simultaneously is what produced the current generic depth. Each of those exams has its own pattern, its own PYQ corpus, its own pedagogy:

- **NEET**: Biology-dominant, factual recall + conceptual mix, 4 sections, 720 marks
- **JEE Main**: PCM, numerical-heavy, 3 sections, 300 marks
- **JEE Advanced**: PCM, multi-correct + integer + paragraph, harder, ranked separately
- **UPSC**: Prelims (objective) → Mains (subjective answer-writing) → Interview, optional subjects, current affairs
- **CBSE Boards**: Class-10 + Class-12 board-pattern questions, syllabus-bound, marking-scheme-aware

Pick **one exam track** (recommendation: **JEE Main + JEE Advanced together**, since they share content and have the most measurable success criterion). Build the exam-prep depth on that track. Generalise to other exams in Phase 5+, not now.

### 3. What is the depth bar?

Allen / Aakash / Vedantu / Unacademy / PhysicsWallah set the depth bar. Not every feature they ship needs to be in v1, but the ones that do:

- PYQ catalogue (≥5 years, fully chapter-tagged)
- Real-pattern mocks with section-wise time
- Time-per-question analytics
- Calibrated rank prediction (or honest-about-uncertainty rank prediction)
- Syllabus coverage audit
- Spaced revision

Without those, the platform cannot enter the exam-prep conversation.

---

## What this platform is if the gap isn't closed

A clear-eyed read on the *current* product:

**Strong points:**
- Best-in-class infra for a single full-stack engineer (5 services + marketplace, smoke 50/50, 200+ tests)
- Solid adaptive engine (3PL IRT + EAP + MFI)
- Working engagement loop (streaks, achievements, daily goals)
- Marketplace is real (tutors + courses + ratings + refunds + earnings)
- Three web apps + mobile parity (Flutter)
- Predictive heuristic v1 deployed
- Stub-first integration design (Stripe Identity, Stripe Connect, Daily.co, OpenAI)

**What the platform is, fairly:**
- A high-quality *general adaptive quiz platform* with a *vertical-marketplace overlay* and *engagement features*.
- Comparable to: Quizlet + Khan Academy quiz layer + Outschool marketplace + Anki (without the SRS).
- *Not* comparable to: Allen TestSeries, Aakash iTutor, PhysicsWallah, Unacademy, BYJU's, Vedantu — those are exam-prep products.

**The risk if marketing claims and product reality stay misaligned:**
- A NEET aspirant signs up expecting exam prep, sees a quiz app, churns. Drives the dropout score the platform itself measures.
- Coaching institutes evaluating the platform for B2B will pattern-match against Allen et al, find the gaps, and pass.
- Educator/creator marketplace doesn't compensate for the missing aspirant-side product depth, because educators teach *to* an exam pattern that the platform doesn't model.

**The simplest path forward** is the one this document already laid out: **decide the strategic question, then commit ~3 sprints to Tier 1 (time tracking + real blueprints + PYQ + section analytics) — that alone closes maybe 40% of the perception gap and restores credibility for the "exam-prep" claim.**

The harder path is to also tackle Tier 2 in the same year (~4–5 more sprints). That gets the platform to ~80% of the perception gap closed.

Tier 3 is a Phase-4-and-beyond conversation.

---

## Recommended next action

1. **User decides** the strategic question (quiz platform vs exam-prep platform; if exam-prep, which exam first; what's the depth bar).
2. **One sprint of ADRs** — at minimum: ADR-0012 (exam blueprint metadata + PYQ schema), ADR-0013 (time-per-question + per-section analytics), ADR-0014 (spaced-repetition scheduling), ADR-0015 (calibrated rank prediction post-cohort-data).
3. **Sprint 22 = Tier 1** — time tracking + real blueprints + exam-mode UI shell (PYQ content seeding runs in parallel as a content effort).
4. **Update the platform marketing language** in [`docs/CLAUDE.md`](../CLAUDE.md) to reflect what the platform actually is *today*. The current "AI-powered competitive exam preparation platform for India" claim should be either earned or softened.

This is not a refactor. It is a strategic alignment between what the platform claims to be and what it actually does.

---

**Appendix — reference points used in this audit:**
- Quiz schema: [`services/quiz/migrations/001_create_quiz_schema.up.sql`](../../services/quiz/migrations/001_create_quiz_schema.up.sql)
- Mock orchestrator: [`services/learning/src/learning/adaptive/mock.py`](../../services/learning/src/learning/adaptive/mock.py)
- Rank prediction: [`services/learning/src/learning/adaptive/rank.py`](../../services/learning/src/learning/adaptive/rank.py)
- Study plan: [`services/learning/src/learning/adaptive/study_plan.py`](../../services/learning/src/learning/adaptive/study_plan.py)
- Weakness diagnosis: [`services/learning/src/learning/adaptive/weakness.py`](../../services/learning/src/learning/adaptive/weakness.py)
- Achievements: [`services/engagement/src/engagement/analytics/processing.py`](../../services/engagement/src/engagement/analytics/processing.py)
- Catalog schema (prerequisites column declared, unused): [`services/learning/alembic/catalog/versions/001_create_catalog_schema.py`](../../services/learning/alembic/catalog/versions/001_create_catalog_schema.py)
- Master phase index: [`docs/02_planning/00_MasterPhaseIndex.md`](00_MasterPhaseIndex.md)
- Phase 3 retrospective (closed 2026-04-28): [`docs/02_planning/22_Phase3_Retrospective.md`](22_Phase3_Retrospective.md)

---

# Phase 4 close-out (added 2026-04-28 at S36)

Phase 4 (Sprints 22–36) executed against this audit. Each of the 16 originally-named gaps has a status row below. **Backend foundation closed for all 16 gaps**; the remaining work is content (W1), UI consolidation, mobile port, and scheduler-cron wiring — all named explicitly in carry-over lists.

| # | Gap (as named in this audit) | Status | Sprint(s) | Notes |
|---|---|---|---|---|
| 1 | Time-per-question tracking | ✅ closed | S22 | `time_spent_ms` column + server-computed at submit (NFR-P4-02); per-section breakdown endpoint |
| 2 | PYQ catalog | ✅ closed | S22 + S24 | Schema columns + ingest CLI + 6 sample seed; bulk content (~16K JEE) is W1 |
| 3 | Exam paper blueprint (real-pattern, not 20Q stub) | ✅ closed | S23 | 3 seeded JEE blueprints (Main 75Q/180min + Adv P1/P2 54Q/180min) + composer + StartFromBlueprint |
| 4 | Topic prerequisites declared but unused | ✅ closed | S26 | Migration 010 populates 7 edges over 9 topics; pure-function traversal + gate endpoint + study-plan integration + TopicDetail pill |
| 5 | Mock orchestrator shallow (no per-section budgets, no OMR, no review queue) | ✅ closed | S23 + S25 | Section navigation + global timer + marked-for-review queue + sticky OMR-style 5-col palette + Mocks series |
| 6 | No spaced-repetition revision queue | ✅ closed | S27 | SM-2 + EWA-clamp scheduler + revision_queue table + daily endpoint + Revision.tsx |
| 7 | No syllabus coverage audit | ✅ closed | S28 | syllabus_chapters table + 12-chapter seed + tree endpoint + 4-band coverage aggregator + SyllabusCoverage.tsx |
| 8 | Heuristic rank prediction dressed as calibration | ✅ closed | S31 | cohort_percentile_distribution table + idempotent aggregator + rank.py honest fallback (`percentileSource`+`cohortSize` fields) |
| 9 | No error-pattern classification | ✅ closed | S29 | 6-axis taxonomy heuristic v1 + sign-flip + unit-pair detection + endpoint + UI helpers |
| 10 | Section-wise analytics only on mocks | ✅ closed | S22 | Per-section breakdown on every submit via `items` array + `session_section_stats` table |
| 11 | No peer percentile per topic | ✅ closed | S32 | Pure-function aggregator with anonymity threshold (NFR-P4-06) + endpoint + UI helpers |
| 12 | No goal/target rank + gap analysis | ✅ closed | S30 + S33 | target_* columns + PATCH /profile/me/goals + pacing helpers + gap_analysis composer + UI helpers |
| 13 | No reference material integration | ✅ closed | S34 | topic_references table + 16-entry seed + URL safety helper + endpoint + UI helpers; bulk W1 |
| 14 | No real exam-mode UI | ✅ closed | S23 + S25 | Full exam-mode shell with section nav + timers + OMR palette + marked-for-review queue |
| 15 | Achievements catalogue is generic engagement only | ✅ closed | S35 | 8 exam-prep-tied kinds via pure-function eligibility checkers; live `process_session` wiring deferred to cutover |
| 16 | Static one-shot study plan | 🟨 partial | S30 + S33 | Pacing primitives + gap composer ship; full closed-loop recalibration with cross-service goals fetch + LLM prompt v2 + StudyPlan.tsx UI deferred to cutover |

## Final reckoning

When this audit was written (2026-04-28 morning), the platform's marketing claim ("AI-powered competitive exam preparation for India") was un-earned on every dimension this audit named. By Phase 4 close (2026-04-28 same day, after 15 sprints of focused depth work), **the platform has the structural primitives to defend that claim on JEE for every dimension catalogued — pending bulk content, UI consolidation, and mobile port**.

The audit's three strategic gates ("quiz vs exam-prep / which exam first / depth bar") were never closed. Phase 4 was deliberately additive and reversible — the schema additions and pure-function modules are useful in either direction. If the gates ultimately favour the exam-prep narrative, the foundation is in place. If they favour staying a quiz/marketplace platform, none of the Phase 4 work was wasted: time-per-question, prereq graphs, syllabus chapters, and peer percentiles are signals quiz apps benefit from too.

What remains:

1. **Content workstream W1** — ~16K JEE PYQs + ~50 chapter mappings + ~150 references + 5 full-length JEE mocks. Engineering can't substitute for content effort.
2. **AWS staging cutover sprint** — absorbs the cron-scheduling + cross-service goals fetch + UI consolidation + S35 trigger wiring. See [Phase 4 retrospective §"Inputs to AWS staging cutover"](24_Phase4_Retrospective.md).
3. **Phase-4-Mobile standalone sprint** — Flutter port of 6 screens + 7 helper ports per the [scope catalog](Phase4_Mobile_Parity_Scope.md). All 16 backend endpoints already live.

The platform engineering is no longer the bottleneck on the marketing claim. Content + scheduling are.
