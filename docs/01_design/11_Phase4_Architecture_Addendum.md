# Phase 4 Architecture Addendum — Exam-Prep Depth

**Applies to**: HLD v1.0, ERD v1.0, OpenAPI v1.0
**Date**: 2026-04-28
**Status**: DRAFT — gated on Phase 4 strategic decisions
**Parent docs**: extends [`01_HLD_Adaptive_Learning_Platform.docx`](01_HLD_Adaptive_Learning_Platform.docx), [`02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx`](02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx), [`03_OpenAPI_Reference_AdaptiveLearningPlatform.docx`](03_OpenAPI_Reference_AdaptiveLearningPlatform.docx).

This addendum documents the architecture additions that Phase 4 brings to the platform. **No new services. No new ports. No service-ceiling violations.** Every Phase 4 work item lands inside an existing service per [ADR-0005](../adr/0005-service-consolidation.md).

---

## 1. Service responsibilities — Phase 4 deltas

| Service | Phase 4 absorbs |
|---|---|
| **alp-quiz** | `time_spent_ms` per session item; `section_id` propagation; exam-mode session variant (resume-from-state on disconnect); blueprint-aware session creation |
| **alp-learning** | `exam_blueprints` table + admin endpoints; PYQ schema additions on `questions`; PYQ ingest CLI; mock orchestrator v2; prerequisite-graph activation; reference materials; calibrated rank-prediction (consumes cohort distribution from alp-engagement) |
| **alp-engagement** | per-section + per-topic time aggregation; spaced-repetition revision queue (new `revision_queue` table); syllabus coverage audit; error-pattern classification; cohort percentile distribution (new aggregation job); peer percentile aggregator; achievements catalogue extension; closed-loop study plan recalibration |
| **alp-identity** | `target_exam_id`, `target_exam_date`, `target_rank` columns on user profile |
| **alp-payment** | unchanged in Phase 4 |
| **alp-marketplace** | unchanged in Phase 4 (marketplace shipped in Phase 3) |

---

## 2. Schema additions

### 2.1 `learning.catalog` schema

```sql
-- New: exam blueprints
CREATE TABLE catalog_schema.exam_blueprints (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES catalog_schema.exams(id),
  name TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  total_minutes INTEGER NOT NULL,
  marks_correct INTEGER NOT NULL,
  marks_negative REAL NOT NULL DEFAULT 0,
  sections JSONB NOT NULL,
  inter_section_navigation BOOLEAN NOT NULL DEFAULT TRUE,
  per_section_time_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- New: syllabus chapters (between exams and topics)
CREATE TABLE catalog_schema.syllabus_chapters (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES catalog_schema.exams(id),
  subject_id UUID NOT NULL REFERENCES catalog_schema.subjects(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (exam_id, subject_id, position)
);

ALTER TABLE catalog_schema.topics
  ADD COLUMN chapter_id UUID NULL REFERENCES catalog_schema.syllabus_chapters(id);

-- New: topic references (NCERT, video, textbook, derivation, formula sheet)
CREATE TABLE catalog_schema.topic_references (
  id UUID PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES catalog_schema.topics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ncert','textbook','video','derivation','formula_sheet')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`prerequisites` JSONB on `topics` already exists; Phase 4 starts using it (P4-S26).

### 2.2 `learning.content` schema (PYQ metadata)

```sql
ALTER TABLE content_schema.questions
  ADD COLUMN exam_year SMALLINT NULL,
  ADD COLUMN paper_session TEXT NULL,
  ADD COLUMN pyq_flag BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_questions_pyq_chapter
  ON content_schema.questions (pyq_flag, exam_year, topic_id)
  WHERE pyq_flag = TRUE;
```

### 2.3 `quiz` schema (time + section)

```sql
ALTER TABLE quiz_schema.quiz_session_items
  ADD COLUMN time_spent_ms INTEGER NULL,
  ADD COLUMN section_id TEXT NULL;

ALTER TABLE quiz_schema.questions  -- mirror of PYQ flags via existing bridge
  ADD COLUMN exam_year SMALLINT NULL,
  ADD COLUMN paper_session TEXT NULL,
  ADD COLUMN pyq_flag BOOLEAN NOT NULL DEFAULT FALSE;
```

### 2.4 `engagement.analytics` schema

```sql
-- Per-section session stats
CREATE TABLE analytics_schema.session_section_stats (
  session_id UUID NOT NULL,
  section_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  correct_count INTEGER NOT NULL,
  served_count INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, section_id)
);

-- Spaced-repetition revision queue
CREATE TABLE analytics_schema.revision_queue (
  user_id UUID NOT NULL,
  topic_id UUID NOT NULL,
  exam_id UUID NULL,
  last_attempt_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  interval_days INTEGER NOT NULL,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, topic_id)
);
CREATE INDEX idx_revision_due ON analytics_schema.revision_queue (user_id, due_at);

-- Cohort percentile distribution (rank-prediction calibration)
CREATE TABLE analytics_schema.cohort_percentile_distribution (
  exam_id UUID NOT NULL,
  topic_id UUID NULL,
  readiness_bucket REAL NOT NULL,
  user_count INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exam_id, topic_id, readiness_bucket)
);

-- Error-pattern classification (per session item)
ALTER TABLE analytics_schema.processed_session_items  -- or a new table if needed
  ADD COLUMN error_classification TEXT NULL
    CHECK (error_classification IN (
      'silly_mistake','conceptual_gap','time_pressure',
      'formula_error','sign_or_unit_error','unattempted'
    ));
```

### 2.5 `identity.profile` schema

```sql
ALTER TABLE profile_schema.user_profiles
  ADD COLUMN target_exam_id UUID NULL,
  ADD COLUMN target_exam_date DATE NULL,
  ADD COLUMN target_rank INTEGER NULL;
```

---

## 3. NATS subjects (additions)

| Subject | Producer | Consumers | Phase 4 changes |
|---|---|---|---|
| `quiz.session.completed` | alp-quiz | alp-engagement, alp-learning (assignment-progress) | payload extended with `time_spent_ms` per item + `section_id` per item |
| `revision.due` | alp-engagement | notification dispatcher | NEW — per-user daily revision reminder |
| `mock.completed` | alp-quiz / alp-learning | alp-engagement (achievements + analytics) | extends existing `quiz.session.completed` route or splits — TBD in P4-S25 |

No new streams; reuses `QUIZ_EVENTS` + the existing notification stream.

---

## 4. New HTTP endpoints (summary)

| Endpoint | Service | Sprint |
|---|---|---|
| `GET /analytics/student/{user_id}/time-stats?examId=X` | alp-engagement | P4-S22 |
| `GET /analytics/sessions/{session_id}/breakdown` | alp-engagement | P4-S22 |
| `GET /content/pyqs?examId=X&topicId=Y&year=Z` | alp-learning | P4-S24 |
| `GET /content/pyqs/frequency?examId=X&subjectId=Y` | alp-learning | P4-S24 |
| `GET /catalog/exam-blueprints?examId=X` | alp-learning | P4-S23 |
| `POST /catalog/exam-blueprints` | alp-learning (admin) | P4-S25 |
| `GET /analytics/revision/{user_id}` | alp-engagement | P4-S27 |
| `GET /analytics/syllabus-coverage/{user_id}?examId=X` | alp-engagement | P4-S28 |
| `GET /analytics/student/{user_id}/error-patterns?examId=X` | alp-engagement | P4-S29 |
| `POST /adaptive/study-plan/{user_id}/recompute` | alp-learning | P4-S30 |
| `GET /analytics/peer-percentile/{user_id}?examId=X&topicId=Y` | alp-engagement | P4-S32 |
| `GET /catalog/topics/{topic_id}/references` | alp-learning | P4-S34 |
| `PATCH /profile/me/goals` (target_exam, target_rank) | alp-identity | P4-S33 |

OpenAPI v1.1 will catalogue these formally at Phase 4 close.

---

## 5. Updated data-flow diagrams

### Quiz submit (extended payload, Phase 4)

```
Quiz Service /quiz/sessions/{id}/submit
  → computes time_spent_ms = answered_at - served_at per item
  → publishes payload to NATS QUIZ_EVENTS / quiz.session.completed
       (payload now carries section_id + time_spent_ms per item)
  → Analytics consumer:
       - process_session()  → mastery, readiness, streak (existing)
       - persist session_section_stats (NEW — per-section breakdown)
       - update_revision_queue() (NEW — SM-2 + EWA tie-in)
       - classify_error() per wrong item (NEW — heuristic taxonomy)
  → Notification consumer: unchanged
  → Content consumer (assignment-progress mode): unchanged
```

### Daily revision wake-up (new in Phase 4)

```
Cron / scheduled job in alp-engagement
  → Query revision_queue where due_at <= now AND notification_sent_today = false
  → Publish revision.due event per user
  → Notification dispatcher (existing) sends via SMTP / push
```

### Cohort percentile aggregation (new in Phase 4)

```
Nightly job in alp-engagement
  → Aggregate readiness rows per (exam_id, topic_id, readiness_bucket)
  → Upsert into cohort_percentile_distribution
  → alp-learning rank.py reads this table on every prediction request
       (fallback to hardcoded calibration if cohort_size < 50 in bucket)
```

---

## 6. Security additions

- **Time-stamp integrity (NFR-P4-02)**: `time_spent_ms` computed server-side from server-set `served_at` and `answered_at`. Client-submitted values rejected.
- **Exam-mode session isolation**: a mock-mode session cannot transition to free-practice mode mid-flight (FSM gate added in P4-S23). Prevents students from converting a low-stakes practice session into a "rate-limited mock attempt" exploit.
- **Anonymity threshold for peer percentile**: cohort < 30 hides the percentile (NFR-P4-06). Prevents identification at low cohort scale.

---

## 7. Performance budgets

| Surface | p95 target | Sprint |
|---|---|---|
| Daily revision queue endpoint | < 200 ms | P4-S27 |
| Mock-test session create (with blueprint) | < 500 ms | P4-S23 |
| PYQ frequency-by-chapter view | < 300 ms (cached) | P4-S24 |
| Cohort-percentile aggregation (nightly) | < 5 min total | P4-S31 |
| Predicted-rank surface | < 200 ms (cohort cache hit) | P4-S31 |
| Syllabus-coverage view | < 300 ms | P4-S28 |
| Time-stats per topic | < 200 ms | P4-S22 |

---

## 8. Risks (architecture-level)

| Risk | Mitigation |
|---|---|
| Schema migrations touch hot tables (`quiz_session_items`, `processed_session_items`, `topics`) — must be backward-compatible | All Phase 4 migrations are additive (new columns NULL-able, new tables); no destructive changes |
| Bridge subscriber must accept new PYQ columns before any PYQ row arrives | Coordinate P4-S22 (Quiz schema) with P4-S24 (PYQ ingest start); land schema first |
| Nightly cohort-percentile job overlaps with engagement durable consumer | Schedule cron to a low-traffic window; aggregation reads readiness, doesn't lock |
| Exam-mode session reliability (NFR-P4-01) is non-trivial | Add 30-second heartbeat + server-side state; covered in P4-S23 explicitly |
| 16K-question PYQ corpus exceeds Quiz schema indexing assumptions | Indexed by `(pyq_flag, exam_year, topic_id)`; partial index only on PYQ rows; storage cost minor |

---

## 9. ADR cross-reference

| ADR | Title | Surfaces in this addendum |
|---|---|---|
| [0012](../adr/0012-exam-blueprint-pyq-schema.md) | Exam blueprint + PYQ schema | §2.1, §2.2, §2.3 |
| [0013](../adr/0013-time-per-question-analytics.md) | Time-per-question analytics | §2.3, §2.4, §3, §4 |
| [0014](../adr/0014-spaced-repetition-scheduling.md) | Spaced-repetition scheduling | §2.4, §3, §4 |
| [0015](../adr/0015-calibrated-rank-prediction.md) | Calibrated rank prediction | §2.4, §4, §5 |
| [0016](../adr/0016-error-pattern-classification.md) | Error-pattern classification | §2.4, §3, §5 |
