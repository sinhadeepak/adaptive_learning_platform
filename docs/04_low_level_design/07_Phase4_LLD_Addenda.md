# Phase 4 Low-Level Design Addenda

**Applies to**: All `docs/04_low_level_design/*.docx` per-service LLDs
**Date**: 2026-04-28
**Status**: DRAFT — gated on Phase 4 strategic decisions
**Parent docs**: extends per-service LLD .docx files. Phase 4 makes module-level additions; no service boundaries change.

This document captures per-service LLD additions for Phase 4. Each section describes what changes inside an existing service. **No new services. Service ceiling holds (ADR-0005).**

---

## 1. alp-quiz (Go) — Phase 4 LLD addendum

**Parent**: [`01_core_services/01_LLD_QuizService_AdaptiveLearningPlatform.docx`](01_core_services/01_LLD_QuizService_AdaptiveLearningPlatform.docx)

### Schema additions

```sql
ALTER TABLE quiz_schema.quiz_session_items
  ADD COLUMN time_spent_ms INTEGER NULL,
  ADD COLUMN section_id TEXT NULL;

ALTER TABLE quiz_schema.questions
  ADD COLUMN exam_year SMALLINT NULL,
  ADD COLUMN paper_session TEXT NULL,
  ADD COLUMN pyq_flag BOOLEAN NOT NULL DEFAULT FALSE;
```

### New session mode: `MOCK_BLUEPRINT`

The Quiz session FSM gains a new mode (alongside `STANDARD` and `ASSIGNMENT`). When a session is created with `?blueprintId=X`:

- The session is bound to an `exam_blueprint_id` (stored as a session metadata field).
- Section composition is fetched from alp-learning at session-create time.
- The session lifecycle is exam-mode-aware: per-section timers are enforced server-side; section transitions emit explicit FSM events.

### State persistence for exam-mode reliability (NFR-P4-01)

To survive disconnect / reconnect:

- **Heartbeat**: client emits `POST /quiz/sessions/:id/heartbeat` every 30s with current question index + answered set.
- **Server-side state**: `quiz_session_items.answered_at` set on each answer save; `time_spent_ms` computed at submit.
- **Resume**: `GET /quiz/sessions/:id` returns full state (timer-remaining computed from session.created_at + per-section budget); client resumes from there.
- **Lost-answer bound**: at most 1 answer (between last heartbeat and disconnect) can be lost.

### Submit handler extension (P4-S22)

```go
func (s *SessionService) Submit(ctx context.Context, sessionID UUID) error {
    // Existing: load session, mark SUBMITTED, score, publish quiz.session.completed
    items := s.store.LoadSessionItems(sessionID)
    for _, item := range items {
        if item.AnsweredAt.Valid {
            item.TimeSpentMs = int32(item.AnsweredAt.Time.Sub(item.ServedAt).Milliseconds())
            s.store.UpdateItemTime(item)
        }
    }
    payload := buildPayload(items)  // now includes time_spent_ms + section_id per item
    return s.publisher.Publish("quiz.session.completed", payload)
}
```

### NATS payload v2

The `quiz.session.completed` payload extends with per-item `time_spent_ms` + `section_id` (see [ADR-0013](../adr/0013-time-per-question-analytics.md)). Backward-compat: consumers ignore unknown fields.

### Tests added

- `TestComputeTimeSpentMs` (3 cases) — happy path + same-instant + clock-skew
- `TestSubmitPayloadExtension` (2 cases) — payload carries new fields
- `TestExamModeStateResume` (2 cases) — resume after disconnect, expired session
- `TestSectionLockedBlueprint` (1 case) — cannot answer Physics Q after Physics time expired

---

## 2. alp-learning (Python / FastAPI) — Phase 4 LLD addendum

**Parent**: [`03_content_and_catalog/01_LLD_ContentService_AdaptiveLearningPlatform.docx`](03_content_and_catalog/01_LLD_ContentService_AdaptiveLearningPlatform.docx) + sibling LLDs

### New module: `learning.exam_blueprints`

```
services/learning/src/learning/exam_blueprints/
├── __init__.py
├── repositories.py      # CRUD for exam_blueprints table
├── routes.py            # GET /catalog/exam-blueprints, POST/PATCH/DELETE (admin)
├── schemas.py           # Pydantic for blueprint shape
├── orchestrator.py      # paper composer (consumes blueprints + question bank)
└── tests/
    ├── test_repositories.py
    ├── test_orchestrator.py
    └── test_routes.py
```

### New module: `learning.pyq`

```
services/learning/src/learning/pyq/
├── __init__.py
├── repositories.py      # PYQ-filtered question queries
├── routes.py            # GET /content/pyqs, /content/pyqs/frequency
├── ingest_cli.py        # PYQ ingest pipeline (admin-only)
└── tests/
    ├── test_pyq_routes.py
    └── test_ingest.py
```

### `learning.adaptive.mock` rewrite (P4-S23)

The current `MOCK_BLUEPRINTS` hardcoded dict gets replaced by:

```python
async def compose_paper(
    session: AsyncSession,
    *,
    blueprint_id: UUID,
    user_id: UUID,
) -> ComposedPaper:
    """Read blueprint from catalog_schema.exam_blueprints; compose section-wise.

    Section composition rules (per ADR-0012):
      - For each section in blueprint.sections:
        - draw n_questions from candidate pool
        - candidate pool: subject_id ∩ topic_distribution ∩ difficulty_distribution
        - prefer pyq_flag = TRUE for difficulty calibration anchor
        - shuffle deterministically by user_id (so a retake gives different ordering)
    """
```

### `learning.adaptive.rank` rewrite (P4-S31)

```python
async def predict_rank(
    session: AsyncSession,
    user_id: UUID,
    exam_id: UUID,
) -> RankPrediction:
    """Replace the hardcoded _READINESS_TO_PERCENTILE lookup with cohort lookup.

    Falls back to hardcoded calibration if cohort_size in user's bucket < 50.
    Returns confidence interval derived from cohort variance.
    """
    user_readiness = await get_readiness(session, user_id, exam_id)
    distribution = await load_cohort_distribution(session, exam_id)
    if total_cohort_size(distribution) < COLD_START_THRESHOLD:
        return _fallback_calibration(user_readiness, exam_id)
    # ... cohort math (see ADR-0015)
```

### `learning.catalog` extensions (P4-S26 + P4-S28 + P4-S34)

- `prerequisites` JSONB activation: existing column gets a `traverse_prereqs(topic_id, max_depth=3)` helper; consumed by `adaptive.recommendations` and `adaptive.study_plan`.
- New `syllabus_chapters` table + `topics.chapter_id` column.
- New `topic_references` table + CRUD routes (admin).

### Tests added (alp-learning)

- ~50 new unit tests across blueprint composer, PYQ ingest, prereq traverser, rank predictor, syllabus aggregator, reference list.
- ~6 new integration tests for the new endpoints.

---

## 3. alp-engagement (Python / FastAPI) — Phase 4 LLD addendum

**Parent**: [`04_data_and_analytics/01_LLD_AnalyticsService_AdaptiveLearningPlatform.docx`](04_data_and_analytics/01_LLD_AnalyticsService_AdaptiveLearningPlatform.docx) + notification LLD

### Schema additions (analytics_schema)

See [Architecture Addendum §2.4](../01_design/11_Phase4_Architecture_Addendum.md#24-engagementanalytics-schema):
- `session_section_stats` (per-section per-session breakdown)
- `revision_queue` (SM-2 + EWA tie-in)
- `cohort_percentile_distribution` (rank-prediction calibration)
- `error_classification` column on `processed_session_items`

### New module: `engagement.analytics.srs` (P4-S27)

```
services/engagement/src/engagement/analytics/srs.py
```

Pure functions (per [ADR-0014](../adr/0014-spaced-repetition-scheduling.md)):

```python
def compute_next_due(
    prev_interval_days: int,
    ease_factor: float,
    accuracy: float,        # [0..1] from session
    attempts: int,
    mastery_ewa: float,
) -> tuple[int, float]:
    """SM-2 with EWA tie-in; returns (next_interval_days, next_ease_factor)."""
```

The `process_session()` consumer extends with `update_revision_queue()` after the EWA + readiness updates.

### New module: `engagement.analytics.error_classifier` (P4-S29)

Pure heuristic classifier (per [ADR-0016](../adr/0016-error-pattern-classification.md)):

```python
def classify_error(
    *,
    is_correct: bool,
    time_spent_ms: int | None,
    mastery_ewa: float,
    chosen_choice_text: str,
    correct_choice_text: str,
    answered: bool,
) -> ErrorTag:
    """Returns one of {silly_mistake, conceptual_gap, time_pressure,
    formula_error, sign_or_unit_error, unattempted}."""
```

### New module: `engagement.analytics.cohort_percentile` (P4-S31, P4-S32)

```
services/engagement/src/engagement/analytics/cohort_percentile.py
```

Aggregator + serve helper:

- `aggregate_cohort_distribution(session, exam_id)` — nightly cron-friendly job populating `cohort_percentile_distribution`.
- `compute_peer_percentile(session, user_id, exam_id, topic_id)` — per-topic percentile against cohort (anonymity threshold 30).

### Notification dispatcher extension (P4-S27)

New notification type: `revision.due`. Per-user mute toggle. Default-on. Integrated with the existing notification subscriber pattern.

### Achievements catalogue extension (P4-S35)

Adds 8 exam-prep-tied achievement kinds to `processing.py::MILESTONES`:

- `mock_completed_5`, `mock_completed_25`
- `mock_under_time`
- `syllabus_25_pct`, `syllabus_50_pct`, `syllabus_75_pct`, `syllabus_100_pct`
- `pyq_chapter_clean`
- `weak_topic_recovered`
- `revision_streak_30`

Existing 17 generic engagement achievements stay intact.

### Tests added (alp-engagement)

- ~80 new unit tests across SM-2 scheduler, error classifier, cohort aggregator, syllabus aggregator, peer percentile, achievement triggers.
- ~25 new integration tests across end-to-end revision flow, error classification on session consume, syllabus coverage view, cohort distribution refresh.

---

## 4. alp-identity (Python / FastAPI) — Phase 4 LLD addendum

**Parent**: [`02_auth_and_profile/`](02_auth_and_profile/)

### Schema additions (profile_schema)

```sql
ALTER TABLE profile_schema.user_profiles
  ADD COLUMN target_exam_id UUID NULL,
  ADD COLUMN target_exam_date DATE NULL,
  ADD COLUMN target_rank INTEGER NULL;
```

### New endpoint

`PATCH /profile/me/goals` — accepts `{target_exam_id, target_exam_date, target_rank}` (any subset). Updates the user's goal fields. Triggers `goal.updated` event for downstream consumers (study-plan recalibration in alp-learning).

### Tests added (alp-identity)

- 4 new unit tests on the goals PATCH handler.
- 2 new integration tests for cross-service goal-changed-triggers-plan-recalibration flow.

---

## 5. alp-marketplace + alp-payment

**Unchanged in Phase 4.** Marketplace shipped fully in Phase 3; payment is standalone. No P4 work touches either.

---

## 6. Frontend modules — Phase 4 LLD addendum

**Parent**: existing front-end LLDs (none currently in `04_low_level_design/`; see [`docs/ui/`](../ui/) for screen catalogue). The architecture-relevant additions:

### web-student (Vite + React)

New top-level pages:
- `MockTest.tsx` v2 — exam-mode player with per-section timers + OMR + marked-for-review queue (P4-S23 + P4-S25).
- `Mocks.tsx` — mock series view (P4-S25).
- `PYQDrill.tsx` — chapter/year-wise PYQ navigation + frequency analysis (P4-S24).
- `Revision.tsx` — daily revision queue (P4-S27).
- `SyllabusCoverage.tsx` — chapter-level coverage tree view (P4-S28).
- `Goals.tsx` — target-rank + trajectory + gap-closer (P4-S33).

Page upgrades:
- `StudyPlan.tsx` v2 — closed-loop, weekly recalibration view (P4-S30).
- `WeaknessDiagnosis.tsx` extension — error-pattern panel (P4-S29).
- topic-detail page extension — peer percentile + reference materials (P4-S32 + P4-S34).
- `ResultPanel.tsx` extension — time-per-question per item (P4-S22).

### web-portal (educator)

- `CohortAtRisk.tsx` — already shipped in Sprint 21.
- `CohortErrorPatterns.tsx` — per-cohort error-pattern rollup (P4-S29 educator surface).
- `CohortSyllabusCoverage.tsx` — per-cohort coverage view (P4-S28 educator surface).

### web-admin

- `ExamBlueprintEditor.tsx` — admin-only blueprint CRUD (P4-S25).
- `PYQIngestStatus.tsx` — view ingest job status + recent failures (P4-S24).

### Mobile (Flutter)

S35 catches up to web on all Phase 4 surfaces. Mobile-only feature: offline-mock-attempt (start mock, lose connection, complete offline, sync on reconnect) — P5+ if scope budget permits.

---

## 7. Cross-cutting concerns

### Migration ordering

P4 migrations across schemas must land in this order to avoid FK / consumer mismatches:

1. **P4-S22 batch** (additive, safe to land first):
   - `quiz_schema.quiz_session_items.time_spent_ms` + `section_id`
   - `quiz_schema.questions` PYQ columns (advance the bridge consumer)
   - `analytics_schema.session_section_stats`
2. **P4-S23 batch**: `catalog_schema.exam_blueprints`. Mock orchestrator v2 reads this.
3. **P4-S24 batch**: `content_schema.questions` PYQ columns. Bridge consumer already advanced in S22.
4. **P4-S26 batch**: no new schema; data load only (`prerequisites` JSONB population).
5. **P4-S27 batch**: `analytics_schema.revision_queue`.
6. **P4-S28 batch**: `catalog_schema.syllabus_chapters` + `topics.chapter_id`.
7. **P4-S29 batch**: `analytics_schema.processed_session_items.error_classification` (or new table).
8. **P4-S30 batch**: `profile_schema.user_profiles.target_*` columns.
9. **P4-S31 batch**: `analytics_schema.cohort_percentile_distribution`.
10. **P4-S34 batch**: `catalog_schema.topic_references`.

All migrations are additive. No destructive changes.

### Backwards compatibility

- All new HTTP endpoints are additive; existing endpoints retain their shape.
- NATS payload changes are additive (`time_spent_ms`, `section_id`); consumers ignoring unknown fields continue to work.
- New session mode `MOCK_BLUEPRINT` doesn't affect existing `STANDARD` / `ASSIGNMENT` sessions.

### Observability

- Every new endpoint carries `trace_id` propagation via `alp_telemetry`.
- New NATS subject `revision.due` follows existing structured logging convention.
- New metrics:
  - `engagement.revision_queue.due_today` (gauge, per user)
  - `engagement.cohort_percentile.aggregation_seconds` (histogram, nightly)
  - `learning.pyq.ingest_duration_seconds` (histogram, per ingest run)
  - `quiz.session.time_spent_ms` (histogram, distribution per item)

---

## 8. Service ceiling check

Phase 4 introduces **0 new services**. All work absorbed inside:

- alp-quiz (Go): `time_spent_ms`, `section_id`, `MOCK_BLUEPRINT` mode
- alp-learning: 2 new modules (`exam_blueprints`, `pyq`), 4 sub-module additions (mock, rank, catalog, adaptive)
- alp-engagement: 3 new modules (`srs`, `error_classifier`, `cohort_percentile`), notification + achievements extensions
- alp-identity: 3 new columns + 1 new endpoint
- alp-marketplace + alp-payment: unchanged

ADR-0005 service ceiling = 6. Phase 4 close: still 6.
