# Phase 4 Additions to the AWS Staging Cutover

**Status**: Addendum to [`24_DEPRECATED_Staging_Cutover_Plan.md`](24_DEPRECATED_Staging_Cutover_Plan.md), written at S36 close.
**Purpose**: Enumerate everything Phase 4 (S22–S35) added that the eventual staging-cutover sprint must absorb. The original cutover plan was written before Phase 4 existed; this addendum keeps the master doc honest without rewriting it.

---

## What changed in `development` between the original cutover plan and S36

### 5 new ADRs (`proposed`)

These need acceptance review before / during the cutover sprint:

- [ADR-0012](../adr/0012-exam-blueprint-pyq-schema.md) — exam blueprint metadata + PYQ schema
- [ADR-0013](../adr/0013-time-per-question-analytics.md) — time-per-question + per-section analytics
- [ADR-0014](../adr/0014-spaced-repetition-scheduling.md) — SM-2 + EWA tie-in
- [ADR-0015](../adr/0015-calibrated-rank-prediction.md) — cohort-driven rank prediction
- [ADR-0016](../adr/0016-error-pattern-classification.md) — 6-axis error-pattern classification

### Schema migrations to deploy (all additive, NULL-able defaults)

| Service / schema | Migrations to apply on staging |
|---|---|
| **alp-quiz** quiz_schema | rev 007 (`time_spent_ms` + `section_id` + PYQ mirror columns) + rev 008 (`MOCK_BLUEPRINT` mode + `blueprint_id`) |
| **alp-learning** catalog_schema | rev 009 (`exam_blueprints`) + rev 010 (`prerequisites` populated) + rev 011 (`syllabus_chapters` + `chapter_id`) + rev 012 (`topic_references`) |
| **alp-learning** content_schema | rev 006 (PYQ columns) + rev 007 (6 sample PYQs, `CONTENT_SEED_LOCAL=1` only) |
| **alp-engagement** analytics_schema | rev 005 (`session_section_stats`) + rev 006 (`revision_queue`) + rev 007 (`error_classifications`) + rev 008 (`cohort_percentile_distribution`) |
| **alp-identity** profile_schema | rev 010 (`target_exam_id`/`target_exam_date`/`target_rank`) |

Roll-forward only — no destructive changes. Down-migrations exist for every alembic revision and are tested.

### ~25 new HTTP endpoints

See the inventory in the [Phase 4 retrospective](24_Phase4_Retrospective.md#new-http-endpoints-25). All routes are already wired in `development` and pass smoke (66/66).

### NATS payload extension

`quiz.session.completed` now carries an optional `items` array with per-item `time_spent_ms` + `section_id`. **Backward-compatible** (omitempty); pre-S22 publishers' messages continue to work but yield only the aggregate stats. The S22 commit message documents the contract change.

### New JetStream / consumer behaviour

No new streams or durable consumers. The existing `analytics-quiz-completed` consumer was extended (S22, S27, S29) to call additional pure-function helpers (`upsert_session_section_stats`, `update_revision_queue`, `upsert_classification`) inline with the existing `process_session()` flow. All extensions are best-effort try/except — a transient failure in any of them does **not** roll back the mastery + readiness updates above.

---

## New cutover gates (in addition to the original G-1..G-11)

### G-12 — Cron infrastructure for scheduled jobs

**Why**: Two Phase 4 surfaces need periodic firing — they ship as endpoints today and need a scheduler at staging:

| Cron | Source sprint | What it does |
|---|---|---|
| daily `revision.due` notification fan-out | S27 | Walk `analytics_schema.revision_queue` for `due_at <= now`, fire `revision.due` notification per user (template registered in S27) |
| nightly `cohort_percentile_distribution` aggregation | S31 | Per-exam re-run of `aggregate_cohort_distribution`; supports the rank-prediction cohort path |

**Options**: k8s CronJob (preferred — already in use elsewhere if Helm chart exists), or in-process scheduler bootstrapped on alp-engagement startup (simpler).

**Owner**: DevOps lead.

### G-13 — Exam-mode session reliability (NFR-P4-01)

**Why**: A 5-minute network drop during a mock should not lose progress. The schema (server-side `served_at` / `answered_at`) supports this; the heartbeat endpoint + state-resume on reconnect was honestly deferred from S23.

**Drill (Drill 9 — exam-mode disconnect chaos)**: 100 concurrent mocks, randomly disconnect 20% mid-session, verify resume succeeds.

**Owner**: BE Go lead + Mobile lead (mobile heartbeat).

### G-14 — Content workstream W1 coordination

**Why**: The strategic gap audit's bulk-content gap is now an external dependency. Engineering ships the schema + ingest pipeline; content team ships the data:

| Workstream | Volume | Owner |
|---|---|---|
| JEE Main + Advanced PYQ corpus | ~16,000 questions across 10 years × 3 sessions | Content lead |
| JEE chapter mapping | ~50 chapters × ~80 topic-chapter assignments | Content lead |
| Topic references | ~150 entries across 50 topics | Content lead |
| Full-length JEE mocks | 5 mocks blending PYQ + AI-authored | Content lead + ML |

**Pre-cutover gate**: at least one paper-session of JEE Main 2024 PYQ (~75 questions) ingested via `services/learning/scripts/ingest_pyq.py` so the smoke + UAT have realistic content to drill against.

### G-15 — Cross-service goals fetch + study-plan v2

**Why**: S30 + S33 left the closed-loop study plan as pure-function helpers. The cutover sprint wires them through:

1. New thin HTTP client in alp-learning fetching goals from alp-identity (`GET /profile/me/goals` or similar — S30 only added the `PATCH`).
2. `learning/adaptive/study_plan.py::build_study_plan` consumes goals → calls `gap_analysis.summarise_gap` → injects pacing into the LLM prompt + heuristic ranking.
3. New endpoint `GET /adaptive/study-plan/{user_id}/trajectory` exposing the `summarise_gap` output for the Goals.tsx UI page.
4. Web-student `Goals.tsx` page (form + trajectory pill + weekly actions panel).

### G-16 — UI consolidation pass

**Why**: Several Phase 4 sprints added pure-function UI helpers + endpoints but deferred the on-page integration to a single consolidated pass:

| Page | Sprints | Changes |
|---|---|---|
| `TopicDetail.tsx` | S26 + S32 + S34 | Prereq pill (S26 — already integrated) + percentile pill (S32 — helper ships, render deferred) + reference panel (S34 — helper ships, render deferred) |
| `WeaknessDiagnosis.tsx` | S29 | Pattern panel sourced from `/analytics/student/{id}/error-patterns` (helpers ship; panel deferred) |
| `Goals.tsx` (NEW) | S33 | Form + trajectory pill + weekly actions panel |
| `StudyPlan.tsx` v2 | S30 + S33 | Trajectory hero + weekly digest + 4-week view (current page is one-shot card) |

### G-17 — Live wiring of S35 achievement triggers

**Why**: S35 ships pure-function eligibility checkers; live wiring into `process_session` was deferred because each trigger needs cross-service signal aggregation that's cleanest at staging:

- `check_mock_completed` — needs mock-attempt count from quiz (S35 hookup point: after `process_session` completes, when payload mode = MOCK_BLUEPRINT)
- `check_mock_under_time` — needs `total_seconds` (blueprint duration from learning) + `remaining_seconds` (clock at submit, alp-quiz)
- `check_syllabus_milestone` — needs prev/new syllabus-coverage % from S28 endpoint (computed twice on submit; diff → milestone check)
- `check_pyq_chapter_clean` — needs PYQ-chapter accuracy aggregation
- `check_weak_topic_recovered` — already has prev/new EWA inside `process_session`; trivially wireable
- `check_revision_streak` — needs daily-streak counter on `revision_queue` (S27 schema doesn't have it; small migration to add)

### G-18 — Phase-4-Mobile standalone sprint

**Why**: Flutter port of 6 screens + 7 helper ports per the [scope catalog](Phase4_Mobile_Parity_Scope.md). All 16 backend endpoints are live. This runs as its own sprint after the staging cutover; it's not a cutover gate per se but lives in this addendum to make the dependency chain explicit.

---

## Updated Drills

The original cutover plan has Drills 1–8. Phase 4 adds:

- **Drill 9 — Exam-mode disconnect chaos**: 100 concurrent mocks, randomly disconnect 20% of clients mid-session for 30s–5min, verify resume succeeds + lost-answer count ≤ 1 per disconnect.
- **Drill 10 — Cohort aggregation under load**: Run nightly cohort aggregation against 100K-user fixture, assert < 5 min runtime per NFR-P4-04.
- **Drill 11 — Revision queue at scale**: 100K users with seeded `revision_queue` rows, query daily endpoint, assert p95 < 200ms per NFR-P4-05.

---

## Updated SLOs

The original cutover plan tracks the Phase 1 SLOs. Phase 4 adds:

| SLO | Target | Source |
|---|---|---|
| `time_spent_ms` coverage on new sessions | > 95% | S22 / NFR-P4-* (data-quality SLO) |
| Mock-test session create latency p95 | < 500 ms | NFR-P4-* (S23) |
| Daily revision queue endpoint p95 | < 200 ms | NFR-P4-05 (S27) |
| PYQ frequency view p95 (warm) | < 300 ms | S24 |
| Cohort-percentile aggregation runtime | < 5 min | NFR-P4-04 (S31) |
| Predicted-AIR cohort hit rate | > 60% within 30 days of launch | S31 calibration health |
| Exam-mode session resume success rate | ≥ 99% on 5-min disconnect | NFR-P4-01 (S23) |
| Anonymity threshold enforcement | 100% of peer-percentile responses with cohort < 30 are hidden | NFR-P4-06 (S32) |

---

## Updated `docs/CLAUDE.md` patches

The cutover sprint should refresh `docs/CLAUDE.md` to reflect Phase 4. Specific patches:

1. **Tech stack > AI/ML** section: add references to S22 time-per-question, S27 SM-2 revision queue, S29 error-classifier, S31 cohort-driven rank, S32 peer percentile, S35 exam-prep achievements.
2. **Service inventory** table: alp-engagement now exposes `/analytics/revision/*`, `/analytics/syllabus-coverage/*`, `/analytics/student/*/error-patterns`, `/analytics/student/*/time-stats`, `/analytics/cohort-distribution`, `/analytics/peer-percentile/*`. alp-learning now exposes `/catalog/exam-blueprints/*`, `/catalog/syllabus-tree`, `/catalog/topics/*/prereqs`, `/catalog/topics/*/gate`, `/catalog/topics/*/references`, `/content/pyqs/*`. alp-identity adds `/profile/me/goals`. alp-quiz adds `/quiz/sessions/from-blueprint`.
3. **Open P1 items**: add G-12..G-17 above.
4. **Last refresh** date.

---

## Cutover sequencing notes

The original plan suggested ~10 days for the cutover. With Phase 4 additions:

- **Days 1–4**: Original infra (AWS, EKS, RS256+JWKS, Stripe Connect, Daily.co, Aurora failover, etc.) — unchanged.
- **Day 5**: Apply all Phase 4 alembic migrations (additive; no risk).
- **Day 6**: Wire Phase 4 cron jobs (G-12) + S35 achievement triggers (G-17).
- **Day 7**: G-13 exam-mode reliability (heartbeat + state resume).
- **Day 8**: G-15 study-plan v2 cross-service wiring + Goals.tsx + UI consolidation pass (G-16).
- **Day 9**: Drills 1–11 (originals + new 9–11).
- **Day 10**: Sign-off + Phase-4-Mobile standalone sprint kickoff (G-18).

The Content workstream W1 (G-14) runs in parallel from Day 1.

---

## Bottom line

Phase 4 added significant *capability* to the platform. None of it changed the cutover gate set fundamentally — it adds 6 new gates (G-12..G-17) that the cutover sprint absorbs cleanly, plus 3 drills and 8 SLOs. Phase 4 work is additive and rollback-safe; the cutover sprint can safely defer any individual G-12..G-17 if AWS access slips and ship without it.

**Engineering is no longer the bottleneck on launch readiness. AWS access (still gating from Phase 1), content workstream W1, and the mobile port are.**
