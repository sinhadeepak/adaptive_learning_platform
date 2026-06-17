# Phase 4 — Exam-Prep Depth — Sprint Development Plan

**Project**: Adaptive Learning Platform — Phase 4 (Exam-Prep Depth)
**Planning horizon**: ~15 sprints (Sprints 22 → 36) at the established single-working-session cadence; calendar time expands with the content workstream.
**Triggered by**: [`52_ExamPrep_Strategic_Gap_Audit.md`](52_ExamPrep_Strategic_Gap_Audit.md). Phase 3 closed at Sprint 21; the audit identified a structural gap between the platform's "AI-powered competitive exam preparation" claim and the current product reality.
**Status**: **DRAFT — gated on three strategic decisions** (see "Pre-sprint gates" below). The plan is shippable once those land; until then it stays draft.
**Authoritative inputs**:
- [Strategic gap audit](52_ExamPrep_Strategic_Gap_Audit.md) — the why.
- [Phase 3 retrospective](22_Phase3_Retrospective.md) — what came before.
- [ADR-0005 service consolidation](../adr/0005-service-consolidation.md) — the 5+1 service ceiling, **still load-bearing**: every Phase 4 work item lands inside an existing service.

---

## TL;DR

Phase 4 closes the gap between *generic adaptive quiz platform* and *credible exam-prep product*. Three tiers, ~15 sprints, one focus exam (recommended: **JEE Main + JEE Advanced**, sharing content). Tier 1 alone (4 sprints) restores credibility. Tier 2 (5 sprints) closes most of the perception gap. Tier 3 (4 sprints) reaches feature parity with Allen / Vedantu / Unacademy / PhysicsWallah on the dimensions that matter. Two cross-cutting workstreams (content pipeline, mobile parity) run in parallel and are explicitly budgeted, not absorbed.

| Tier | Sprints | Outcome |
|---|---|---|
| **Tier 1 — Foundation** | S22–S25 (4 sprints) | Time tracking, real exam blueprints, exam-mode UI, PYQ catalogue |
| **Tier 2 — Depth** | S26–S30 (5 sprints) | Prerequisite graph, spaced repetition, syllabus coverage, error taxonomy, closed-loop study plan |
| **Tier 3 — Differentiation** | S31–S34 (4 sprints) | Calibrated rank, peer percentile, target-rank gap analysis, reference-material integration |
| **Closure** | S35–S36 (2 sprints) | Achievements rebalance + mobile parity, Phase 4 retrospective |

Then the deferred AWS staging cutover sprint (still AWS-blocked) closes the platform.

---

## Pre-sprint gates (decisions the user must make before S22 starts)

The audit named three. They do not need to land simultaneously, but **none can be skipped**:

### Gate 1 — Quiz platform or exam-prep platform?

If **quiz platform with marketplace**: discard this plan; Phase 4 instead becomes scale + mobile parity + AWS staging cutover; soften the marketing claim in [`docs/CLAUDE.md`](../CLAUDE.md).

If **exam-prep platform**: this plan is the path. Phase 4 starts at S22.

**No deliverable this plan can produce while this gate is open.**

### Gate 2 — Which exam first?

Trying to be NEET + JEE + UPSC + CBSE simultaneously produced the current generic depth. **Pick one track and own it.**

Recommended: **JEE Main + JEE Advanced together** (shared PCM content, well-defined exam patterns, single PYQ corpus, measurable success criterion = predicted AIR vs actual). Phase 5+ generalises to NEET / UPSC / CBSE on the same depth scaffolding.

This plan **assumes JEE Main + Advanced**. If a different exam is chosen, the per-sprint blueprint targets and PYQ ingest specifics shift; the architecture stays.

### Gate 3 — What is the depth bar?

The competitors set the bar. Phase 4 commits to matching them on these dimensions:

- PYQ catalogue (≥10 years, chapter-tagged)
- Real-pattern timed mocks with section-wise time budgets
- Time-per-question analytics
- Calibrated rank prediction (cohort-fed, with confidence intervals)
- Syllabus coverage audit
- Spaced revision

If the user wants to set a lower bar, the plan trims accordingly. The bar above is what the audit's "remediation" tiers deliver.

---

## Service ownership (post-ADR-0005 — service ceiling holds)

No new services. Phase 4 work lands inside the existing 5 + alp-marketplace:

- **alp-learning** absorbs: PYQ schema additions, exam-blueprint metadata, prerequisite-graph activation, reference-material linkage, mock orchestrator v2, calibrated-rank model.
- **alp-quiz** absorbs: per-item time tracking, section-wise timing in session lifecycle, exam-mode session variant.
- **alp-engagement** absorbs: per-section analytics, syllabus-coverage audit, error-pattern classification, spaced-repetition scheduler, peer-percentile aggregator, achievements rebalance.
- **alp-identity** absorbs: target-rank/goal-score on user profile.
- **alp-payment**, **alp-marketplace**: untouched in Phase 4 (the marketplace already shipped in Phase 3).

If any P4 work item appears to need a new backend service, it requires a new ADR per ADR-0005. **No exceptions in Phase 4.**

---

## Cross-cutting workstreams

These run alongside the engineering sprints, not inside them. They are the difference between "shipping code" and "shipping the product." Treat them as first-class.

### W1 — Content pipeline (PYQ + blueprints + reference material)

**Why first-class**: PYQ tagging is ~hours-per-paper and scales linearly with content volume. JEE Main 10 years × 3 sessions/year × 90 questions × 2 papers (Main + Advanced) × 3 subjects ≈ 16,000 questions to ingest, normalise, and tag at minimum. Engineering can build the ingest schema in 1 sprint; content takes much longer.

**Deliverables across Phase 4**:
- Standard PYQ JSON schema (defined in S22 ADR-0012).
- LLM-assisted bulk-ingest tool with human-in-the-loop QA (S24).
- 10 years of JEE Main + Advanced PYQs ingested + tagged by S30 (parallel to engineering tracks).
- Topic ↔ NCERT chapter mapping (parallel to S33).
- Sample mock papers (full-length, real pattern) for JEE Main + Advanced — at least 5 mocks each ready by S25.

**Estimate**: ~120-200 hours of content effort across Phase 4. Can be:
- Author-side: hire a contractor familiar with JEE syllabus.
- Bulk-ingest from public PYQ corpora (legally cleanly sourced) + LLM-tag + human-review pipeline.
- Combination — LLM does first pass, human reviews edges.

**Decision point**: how is the content workstream resourced? This is a budget conversation, not a code conversation.

### W2 — Mobile parity

The Phase 3 retrospective explicitly deferred mobile to a post-cutover mobile sprint. Phase 4 makes that an explicit dual-track:

- Each engineering sprint ships web-first.
- Mobile parity catches up at S35 in a focused sprint, with the Sprint 7 pattern (single sprint covers all carry-overs).
- Mobile-only features (offline mock attempts, push-notification revision reminders) are Phase 5+.

### W3 — ADR cadence

Phase 4 needs **5 new ADRs**, all in S22 (the foundation sprint):

- **ADR-0012** — Exam-blueprint metadata + PYQ schema. Covers `question.exam_year`, `question.paper_session`, `question.pyq_flag`, `exam.blueprint` shape.
- **ADR-0013** — Time-per-question + per-section analytics. Covers schema (`time_spent_ms` on `quiz_session_items`), event payload changes, per-section emission.
- **ADR-0014** — Spaced-repetition scheduling algorithm. Covers SM-2 vs Leitner vs custom; due-at semantics; revision-event NATS subject.
- **ADR-0015** — Calibrated rank prediction with cohort data. Covers calibration update cadence, percentile distribution storage, confidence-interval methodology.
- **ADR-0016** — Error-pattern classification taxonomy. Covers the 5-axis taxonomy + heuristic-v1 vs LLM-v2 path.

These five ADRs gate everything downstream. **Sprint 22's primary deliverable is the ADRs, not code.**

---

## Timeline at a glance

| Sprint | Theme | Headline outcome | Tier |
|---|---|---|---|
| **S22** | Foundation ADRs + time-per-Q schema | 5 ADRs accepted; `quiz_session_items.time_spent_ms` shipped; per-section analytics on practice sessions | Tier 1 |
| **S23** | Exam-mode UI + real blueprints | Full-length JEE Main blueprint (75Q/180min/3 sections); per-section timers + section locks + marked-for-review queue | Tier 1 |
| **S24** | PYQ ingest pipeline + drill view | PYQ schema + ingest tool; first-cut PYQ drill view (chapter-wise, year-wise) | Tier 1 |
| **S25** | OMR-style answer sheet + mock series | OMR UI; Mock series view (taken / scheduled / available); 5 seeded JEE mocks | Tier 1 |
| **S26** | Concept prerequisite graph | Activate the existing `prerequisites` JSONB; gating in adaptive engine + study plan + recommendation | Tier 2 |
| **S27** | Spaced-repetition revision queue | New `revision_queue` table; SM-2 scheduler; daily revision view; `revision.due` notification | Tier 2 |
| **S28** | Syllabus coverage audit | Chapter-level coverage view; "you've covered N% of JEE Physics" surface | Tier 2 |
| **S29** | Error-pattern classification | 5-axis heuristic taxonomy on wrong answers; "your patterns" view in weakness-diagnosis surface | Tier 2 |
| **S30** | Closed-loop study plan | Weekly recalibration; exam-date pacing; mocks-per-week target adjusts dynamically | Tier 2 |
| **S31** | Calibrated rank prediction | Replace lookup-table calibration with cohort-driven percentile mapping; confidence intervals from real data | Tier 3 |
| **S32** | Peer percentile per topic | Anonymous aggregation across cohort; "you're at 67th percentile vs JEE 2027 students on Mechanics" | Tier 3 |
| **S33** | Goal/target rank + gap analysis | `target_rank` on profile; gap-to-target plan; trajectory tracking | Tier 3 |
| **S34** | Reference material integration | NCERT chapter links, textbook references, optional video links per topic | Tier 3 |
| **S35** | Achievements rebalance + mobile parity | Exam-prep-tied achievements catalogue; full Phase-4 surface on mobile | Closure |
| **S36** | Phase 4 retrospective + final cutover prep | Phase 4 retrospective; AWS staging cutover plan refreshed against new surfaces | Closure |

---

## Per-sprint detail

### S22 — Foundation ADRs + time-per-question schema

**Goal**: ADRs accepted, the smallest schema change unlocked, per-section analytics shipped on regular practice.

**Capacity**: Single working session, mostly ADR drafting + tight schema migration + analytics emission tweak.

**Deliverables**:
- ADR-0012 through ADR-0016 (see W3 above).
- alp-quiz migration: `time_spent_ms INTEGER NULL` on `quiz_session_items`. Compute on submit (`answered_at - served_at`). Backfill leaves NULL for historical rows.
- alp-quiz `submit` handler emits `time_spent_ms` per item in NATS payload of `quiz.session.completed`.
- alp-engagement consumer: per-section accuracy + per-section time aggregation in mastery / readiness compute. Surface in the readiness endpoint and the Sprint-13 student-drill-down endpoint.
- 6 unit tests + smoke step (mock submit shows per-section time + accuracy).

**Exit criteria**: ADRs in `proposed` state; time_spent_ms populated on new sessions; per-section breakdown visible in mastery/readiness surfaces.

### S23 — Exam-mode UI shell + real blueprints

**Goal**: A JEE Main aspirant taking a mock on this platform sees the actual JEE pattern, not a 20-question stub.

**Deliverables**:
- alp-learning: replace `MOCK_BLUEPRINTS` stub in `adaptive/mock.py` with real blueprints. JEE Main: 75 Q (25 each Physics/Chem/Math), 180 minutes, 3 sections, 1/4 negative marking, allow inter-section navigation. JEE Advanced Paper 1 + Paper 2 separately.
- New mock-orchestrator endpoint paths preserve backward compat with existing 20-Q stubs (label them `practice-mock-short`).
- web-student `MockTest.tsx` rebuild: per-section timers + section locks (configurable per blueprint) + marked-for-review queue with end-of-section review pass + exam-instruction screen + clock-on-screen + dropped-connection recovery preserving exam state.
- Per-section navigation strip with marked / answered / unanswered indicators.
- 12 unit tests on the mock-blueprint logic + UI tests on the section-lock state machine.

**Exit criteria**: Take a full-length 75-Q 180-min JEE Main mock end-to-end with section-aware timing.

**Content gate**: This sprint depends on the question bank being scaled enough to populate a real 75-Q JEE Main paper with appropriate difficulty distribution. Coordinate with content workstream W1.

### S24 — PYQ ingest pipeline + chapter-wise PYQ drill

**Goal**: PYQ becomes a first-class concept in the platform.

**Deliverables**:
- alp-learning content migration: `question.exam_year SMALLINT NULL`, `question.paper_session TEXT NULL` (e.g., `JEE-MAIN-2024-JAN-S1`), `question.pyq_flag BOOLEAN NOT NULL DEFAULT FALSE`. Composite index `(pyq_flag, exam_year, topic_id)`.
- LLM-assisted bulk-ingest CLI: takes a normalised PYQ JSON file + writes through Content authoring → Quiz bridge.
- New endpoint `GET /content/pyqs?examId=X&topicId=Y&year=Z` returning paginated PYQ corpus.
- web-student `PYQDrill.tsx`: chapter-wise + year-wise PYQ navigation. Topic → years available → questions in that year. Includes per-chapter frequency analysis ("Rotational Dynamics: 3 questions in 2024, 4 in 2023, 6 in 2022 → trending up").
- Seed 1 year of JEE Main (2024) PYQ as proof of pipeline (~225 questions). Remaining 9 years runs as content workstream W1.
- 8 unit tests on the ingest schema + 4 on the frequency-analysis aggregator.

**Exit criteria**: A student can land on Mechanics, click "PYQ", see all 2024 JEE Main Mechanics questions. Frequency view renders.

### S25 — OMR-style answer sheet + mock series

**Goal**: Exam-mode UX matches what students see on test day.

**Deliverables**:
- web-student OMR-style answer sheet panel for mock-mode (mock-only, not for practice). Click to mark, click again to clear.
- web-student mock series view: `Mocks.tsx` listing taken / scheduled / available mocks. Per-mock: predicted AIR, time taken, accuracy by section, weak-section call-out.
- alp-learning: 5 seeded JEE Main mocks (full-length, real pattern, mixing PYQ + AI-authored). Available date-gated (if user wants "JEE Main Mock 3 — release date 2026-12-01", the mock is locked until then).
- Mobile defer (S35).
- 6 web tests + smoke step (take 2 mocks, see them in mock series view with correct AIR + section breakdown).

**Exit criteria**: Mock-test UX is exam-simulator quality, not "quiz play with sections." Student has a real mock series surface.

### S26 — Concept prerequisite graph

**Goal**: The `prerequisites` JSONB column that has existed since Sprint 1 starts being used.

**Deliverables**:
- Content workstream populates JEE Physics topic prerequisites (Mechanics: Newton's Laws → Friction → Circular Motion → Rotational Dynamics, etc.). ~50 topics, ~80 prereq edges. Do this in a structured CSV → migration data load.
- alp-learning adaptive engine: `gate_by_prereqs(user_id, topic_id)` returns `{can_attempt: bool, missing_prereqs: [...], suggested_path: [...]}`. Surface this in the topic page as a "you're ready" / "we recommend mastering X first" pill.
- Recommendation engine update: prefer prereq-mastered topics in the "next topic" suggestion.
- Study plan update: order topics by prereq depth.
- 10 unit tests on the prereq-traversal logic.

**Exit criteria**: A student attempting Rotational Dynamics with weak Newton's-Laws mastery sees an inline pill recommending Newton's Laws first; can override.

### S27 — Spaced-repetition revision queue

**Goal**: A daily revision habit becomes a platform-driven loop, not a self-discipline test.

**Deliverables**:
- alp-engagement migration: `revision_queue` table — `(user_id, topic_id, last_attempted_at, due_at, interval_days, ease_factor)`. Inserted on each topic attempt, updated on each subsequent attempt per SM-2.
- Pure-function scheduler `compute_next_due(prev_interval, ease_factor, was_correct)` per ADR-0014 (SM-2 algorithm).
- Daily revision view on web-student `Revision.tsx` — top 10 topics due today.
- New notification type `revision.due` (per-user mute toggle, default-on).
- Pre-mock revision sprint mode: 7 days before a scheduled mock, queue surfaces tightened.
- 12 unit tests on the SM-2 helper + 4 on the daily-revision endpoint.

**Exit criteria**: Student opens the platform at 6 AM, sees "10 topics due for revision today." Revision feels structured.

### S28 — Syllabus coverage audit

**Goal**: Aspirants see explicit, exam-syllabus-tagged coverage, not just per-topic mastery.

**Deliverables**:
- alp-learning catalog migration: `chapter_id` on `topics` if not already there; `syllabus_chapters` table with FK to exam.
- Content workstream maps existing topics to JEE Main + JEE Advanced syllabus chapters.
- alp-engagement endpoint `GET /analytics/syllabus-coverage/{user_id}?examId=X` returning chapters covered + per-chapter mastery + missing chapters.
- web-student `SyllabusCoverage.tsx` — tree view: Subject → Chapters → Topics with mastery colour. Top-of-page bar: "JEE Physics: 67% covered, 8 chapters remaining."
- 8 unit tests on the coverage aggregator.

**Exit criteria**: Student opens "My Syllabus" and sees explicit progress against JEE Physics syllabus tree.

### S29 — Error-pattern classification

**Goal**: Wrong answers carry diagnostic information, not just a `is_correct=false` flag.

**Deliverables**:
- alp-engagement migration: `error_classification` column on `processed_session_items` (or a new table) with values from ADR-0016 taxonomy: `silly_mistake / conceptual_gap / time_pressure / formula_error / sign_or_unit_error / unattempted`.
- Heuristic-v1 classifier (pure function):
  - `time_pressure` if `time_spent_ms < 30s` AND topic mastery > 0.5
  - `silly_mistake` if mastery > 0.7 AND wrong (single-attempt regression)
  - `conceptual_gap` if mastery < 0.4
  - `sign_or_unit_error` if chosen choice differs from correct only in sign/unit (requires choice-similarity helper)
  - `formula_error` fallback
- Surface in weakness-diagnosis page: per-pattern counts + top examples + drill-targeted recommendation.
- 14 unit tests on the classifier + 4 on the surface endpoint.

**Exit criteria**: Student opens weakness diagnosis, sees "you made 8 silly mistakes this week (mastery > 0.7 but wrong)" with a "drill these 5" CTA.

**Future**: ADR-0016 reserves an LLM-v2 path that re-classifies edge cases. Not in scope for S29.

### S30 — Closed-loop study plan + exam-date pacing

**Goal**: The study plan stops being a static 7-day card and becomes a living document.

**Deliverables**:
- alp-identity: `target_exam_id`, `target_exam_date`, `target_rank` on user profile (migration).
- alp-learning study-plan v2: weekly recalibration (cron-friendly endpoint `POST /adaptive/study-plan/{user_id}/recompute`), exam-date pacing (more drills + more mocks closer to date), mocks-per-week target rising on a S-curve.
- Trajectory tracking: per-week readiness delta + projected vs target.
- web-student `StudyPlan.tsx` upgrade: weekly view + 4-week view + "you are on track / behind / ahead" pill + "what to do this week" digest.
- Update the existing LLM-prose layer to reflect the recalibration honestly ("last week you did X; this week the plan adjusts to Y because…").
- 12 unit tests on the recalibration + pacing logic.

**Exit criteria**: Student updates their target rank from 12K to 5K; the study plan shifts immediately (more daily volume + tighter mock cadence).

### S31 — Calibrated rank prediction (cohort-driven)

**Goal**: Predicted AIR is anchored in real data, not a hardcoded lookup.

**Deliverables**:
- alp-engagement: `cohort_percentile_distribution` table — per (`exam_id`, `topic_id`, `readiness_bucket`), counts of students in that bucket. Updated nightly via a new aggregation job.
- alp-learning rank.py rewrite: `_READINESS_TO_PERCENTILE` lookup replaced by a query against the distribution table; falls back to the hardcoded calibration if cohort data is sparse (< 50 users in the bucket). Confidence intervals widen automatically when fallback is used.
- New surface: rank-prediction breakdown — "predicted AIR 7,500 ± 1,200 — derived from N=2,400 platform aspirants in your readiness bucket on JEE Main."
- 10 unit tests on the calibration aggregator + 4 on the rank-prediction endpoint.

**Exit criteria**: When the platform has > 100 users per readiness bucket on the focus exam, predicted ranks reflect actual distribution. Sparse buckets honestly say so.

**Gate**: This sprint's value scales with cohort size. Ship the engineering; the data calibrates over time.

### S32 — Peer percentile per topic

**Goal**: "How am I doing vs others on this topic?" gets a real answer.

**Deliverables**:
- alp-engagement `peer_percentile` aggregator: per (`user_id`, `topic_id`, `exam_id`), compute the percentile rank of the user's mastery within the cohort (anonymised). Cached daily.
- New endpoint `GET /analytics/peer-percentile/{user_id}?examId=X&topicId=Y`.
- web-student topic-detail page: "Mechanics — your mastery is 0.62, you are at the 67th percentile vs 2,400 JEE 2027 aspirants on this platform." Hidden when cohort < 30.
- web-portal cohort drill-down: educator sees student's per-topic percentile.
- 8 unit tests on the percentile aggregator.

**Exit criteria**: Topic pages render percentile when cohort is sufficient; gracefully hidden when sparse.

### S33 — Goal / target-rank + gap analysis

**Goal**: A student picks a target AIR; the platform tells them how far off they are and what to do about it.

**Deliverables**:
- alp-identity: `target_rank` (already added in S30) is now writable from a student-facing UI.
- web-student `Goals.tsx`: pick exam + target rank. Page shows current trajectory vs target + "gap closer" recommendations (which topics, how much volume).
- Trajectory tracking continues from S30; this sprint adds the goal-set surface.
- 6 unit tests on the gap-analysis logic.

**Exit criteria**: Student sets target AIR 5,000; sees "you're tracking AIR 8,500; close the gap by drilling Modern Physics + 2 more mocks/week."

### S34 — Reference material integration

**Goal**: Topics carry pointers to canonical learning material.

**Deliverables**:
- alp-learning catalog migration: `topic_references` table — `(topic_id, kind, title, url)` with `kind ∈ ('ncert', 'textbook', 'video', 'derivation', 'formula_sheet')`.
- Content workstream populates references for JEE Physics (~50 topics × ~3 references each = 150 entries). Crowd-sourced URLs OK; admin-curated quality bar.
- web-student topic-detail page: reference panel.
- Recommendation engine considers reference availability when ranking topics for study.
- 6 unit tests + content QA gate.

**Exit criteria**: A student opening Trigonometry sees "NCERT Class 11 Ch 3 + this 12-min explainer video + this derivation walkthrough."

### S35 — Achievements rebalance + mobile parity

**Goal**: Achievements measure exam-progress; mobile catches up to web.

**Deliverables — achievements**:
- alp-engagement `processing.py` extended:
  - `mock_completed_5` / `mock_completed_25` (full-length mocks)
  - `mock_under_time` (finished a real-pattern mock with > 10 min remaining)
  - `syllabus_25_pct` / `syllabus_50_pct` / `syllabus_75_pct` / `syllabus_100_pct` (per-exam)
  - `pyq_chapter_clean` (>80% on a PYQ chapter)
  - `weak_topic_recovered` (mastery <0.4 → >0.7 on the same topic)
  - `revision_streak_30` (30 days of clearing the daily revision queue)
- Existing 17 generic engagement achievements stay (don't churn the catalog), 8 new exam-prep-tied join them. Total catalog → 25.

**Deliverables — mobile parity** (Phase 4 surfaces):
- Mobile: PYQ drill, mock series view, OMR-style answer sheet, syllabus coverage, revision queue, study plan v2, target rank UI, peer percentile (read-only).
- Mobile-only: offline mock attempts (start a mock, lose connection, complete, sync on reconnect) — Phase 5+ if scope budget tight.

**Exit criteria**: Achievements catalog reflects exam-prep behaviour; mobile is at feature parity with web on Phase 4 surfaces.

### S36 — Phase 4 retrospective + final cutover prep

**Goal**: Phase 4 closes; the AWS staging cutover plan is refreshed against the new surfaces.

**Deliverables**:
- `docs/02_planning/24_Phase4_Retrospective.md` — what shipped, what slipped, surprises, numbers (mirrors Phase 1/2/3 retros).
- AWS staging cutover plan refresh: the deferred plan needs additions for the Phase 4 surfaces (PYQ data residency, content-pipeline storage, cohort-percentile aggregation cron, exam-mode session reliability requirements).
- Updated `docs/CLAUDE.md`: tech-stack section reflects Phase 4 additions (PYQ schema, revision queue, calibrated rank distribution).
- Updated [`52_ExamPrep_Strategic_Gap_Audit.md`](52_ExamPrep_Strategic_Gap_Audit.md) — close-out annotation showing which gaps closed and which remain.

**Exit criteria**: Phase 4 closed; the only remaining sprint in the master index is the deferred AWS staging cutover.

---

## Out of scope (and where they go)

These are deliberate Phase-5+ defers, not oversights:

| Item | Why deferred | Where |
|---|---|---|
| NEET / UPSC / CBSE depth | Phase 4 narrows to JEE; generalising the depth scaffolding is Phase 5 | Phase 5 |
| Live-class platform (compete with Vedantu live tutors) | The marketplace covers async tutoring; live group-class infra is greenfield | Phase 5 |
| Native video infrastructure | The platform integrates with external video URLs in S34; native upload + DRM is Phase 5 | Phase 5 |
| Question-of-the-day / daily-mode gamification | Engagement layer is sufficient for current cohort scale | Phase 5 |
| LLM error-pattern classifier (v2) | ADR-0016 reserves the path; heuristic v1 in S29 is enough until validated | Phase 5 |
| ML drop-out / recommendation upgrade (lightgbm / pgvector / OpenAI embeddings) | Inherited from Phase 3 carry-over | Phase 5 |
| Real Stripe Connect / Daily.co | Cred-blocked since Phase 3 | Final cutover |
| AWS staging deploy + Drills 7+8 | AWS-blocked since Phase 1 | Final cutover |

---

## Risk register

| Risk | Mitigation |
|---|---|
| Content workstream lags engineering, leaving Phase 4 features without content | W1 budget is explicit; PYQ ingest pipeline (S24) deliberately ships before bulk content so engineering doesn't block on content. Sprint exit criteria are met with proof-of-pipeline content; bulk content is parallel. |
| Calibrated rank prediction looks worse than the lookup table at low cohort scale | S31 fallback path keeps the lookup table active when cohort < 50 per bucket. Honest "based on N students" surfacing makes the limitation transparent rather than hidden. |
| Spaced-repetition habit formation is a UX problem more than an algorithm problem | S27 includes a `revision.due` notification (default-on) + daily-revision view. If the habit doesn't form, Phase 5 doubles down on Notification surfacing rather than re-engineering the algorithm. |
| Exam-mode UI introduces session-state-loss bugs (dropped connection mid-mock) | S23 explicitly lists dropped-connection recovery as a deliverable. Add a 5-minute heartbeat to the exam-mode session and resume-from-server-state on reconnect. |
| Strategic Gate 1 stays open and the plan is half-implemented | This plan stays in DRAFT until Gate 1 closes. Half-implementing it produces a worse product than either decision. |
| User picks a different exam (NEET / CBSE / UPSC) | The architecture is exam-agnostic; only the per-blueprint metadata + PYQ corpus shifts. Content workstream shifts focus; engineering changes are minor. |
| Mobile parity sprint (S35) compresses too much work | If S35 over-scopes, split into S35a (achievements + half of Phase 4 surfaces) and S35b (rest). Net: one extra sprint; doesn't push the closure sprint. |

---

## Numbers (target shape at Phase 4 close)

| Metric | At Phase 3 close | Target at Phase 4 close |
|---|---|---|
| Backend services | 6 (5 + alp-marketplace) | **6** (no change — service ceiling holds) |
| ADRs added in phase | 6 (ADR-0006…0011) | **+5** (ADR-0012…0016) |
| New tables across schemas | ~16 marketplace + 2 predictive | **+5** (revision_queue, syllabus_chapters, topic_references, cohort_percentile_distribution, error_classification) |
| Smoke step count | 50 | **~70** |
| Engineering test count delta | ~250 in Phase 3 | **~200 in Phase 4** |
| Question bank size | ~480 (seed + Hindi seed) | **~16,000** (10 yrs of JEE Main + Advanced PYQ) |
| Marketing claim defensibility | "AI-powered competitive exam preparation" — not earned | **Earned** for JEE; Phase 5 generalises to NEET/UPSC/CBSE |

---

## What this plan asks of the user

1. **Close Gate 1, 2, 3.** This is the gating decision. The plan is shippable once those land.
2. **Resource the content workstream W1.** This is a budget conversation. Hire a contractor, scrape + clean public PYQ corpora, or commit owner-time. Plan can't ship without it.
3. **Accept a ~15-sprint phase length.** Phase 3 was 7 sprints to add a marketplace; Phase 4 is twice that to close the exam-prep gap because the gap is genuinely twice as wide and content is half the work.
4. **Defer NEET / UPSC / CBSE to Phase 5.** Trying all four exams in Phase 4 reproduces the current generic depth.

If any of these is a no, the plan trims accordingly. The honest version is on the table.
