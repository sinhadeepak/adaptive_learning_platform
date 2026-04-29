# ADR-0013: Time-per-question + per-section analytics

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead
- **Related**: P4-S22 gating ADR. [ADR-0012](0012-exam-blueprint-pyq-schema.md) (sections from blueprints).

## Context

The Quiz schema has `served_at` and `answered_at` timestamps but no per-item duration field. Time elapsed is computable in the UI but never persisted, never aggregated, and never analysed. For exam-prep:

- **Time management is the #1 failure mode in JEE/NEET** — most aspirants know more than they can complete in time.
- **Time-per-question vs accuracy curves** are the foundational analytic for strategy coaching ("you spend 4× the median on Q-types you get wrong; this is a time-pressure pattern").
- **Section-wise time budgeting** is required for real-pattern mocks (NEET = 60 min Physics + 60 min Chem + 60 min Bio, separately enforced).

## Decision

**Persist per-item duration on submit. Emit per-section breakdowns on the existing `quiz.session.completed` NATS subject. Aggregate in alp-engagement.**

### Schema change (alp-quiz)

```sql
ALTER TABLE quiz_schema.quiz_session_items
  ADD COLUMN time_spent_ms INTEGER NULL;
```

Computed at submit time as `(answered_at - served_at).total_milliseconds()` and persisted in the same transaction. NULL for historical rows (backfill not attempted; aggregations gracefully skip NULL).

### Event payload extension

`quiz.session.completed` payload gains:

```json
{
  "session_id": "...",
  "user_id": "...",
  "items": [
    {
      "item_idx": 0,
      "question_id": "...",
      "topic_id": "...",
      "section_id": "physics",        // new — drawn from blueprint when ASSIGNMENT or MOCK mode
      "is_correct": true,
      "time_spent_ms": 47000          // new
    }
  ],
  "completed_at": "..."
}
```

`section_id` is set when the session is created with a blueprint (mock mode); for free-practice sessions it's NULL and section-wise aggregation falls back to `topic_id → subject_id`.

### alp-engagement consumers

The existing `analytics-quiz-completed` consumer already runs `process_session()`. It gains:

- Per-section accuracy + time aggregation, persisted in a new `analytics_schema.session_section_stats` table.
- Per-topic time-spent average, persisted as a new column on `analytics_schema.mastery` (or a parallel `mastery_time_stats` table — see follow-up).

### Surface endpoints

- `GET /analytics/student/{user_id}/time-stats?examId=X` — per-section + per-topic time-vs-accuracy breakdown.
- `GET /analytics/sessions/{session_id}/breakdown` — per-section breakdown for a single submitted session.

The Sprint 13 student-drill-down endpoint extends with `time_spent_ms` per session item.

## Alternatives considered

- **Compute time client-side and stop there**. *Rejected* — UI-only data is invisible to the adaptive engine, the recommendation engine, the educator drill-down, and the rank predictor. Persisting it is the small fixed cost that unlocks every downstream feature.
- **Per-item event on every answer (granular)**. *Rejected for now* — `quiz.session.completed` already aggregates the session; adding a per-answer event doubles NATS volume for a feature that doesn't need real-time granularity. Revisit if real-time educator dashboards demand it.
- **Store time as a JSON blob in `quiz_session_items`** instead of a column. *Rejected* — query patterns (avg time per topic, percentile time per section) are columnar; JSON destroys index performance.

## Consequences

### Positive

- **Time-pressure pattern detection becomes possible** in error classification (ADR-0016).
- **Per-section mock analytics** become real (currently mock.py outputs section stats but practice sessions do not).
- **Strategy coaching** ("you spend 4× the median on Q-types you get wrong") gains a foundation.
- **Educator drill-down** gains a time dimension.

### Negative

- **One additional integer column per session item** — negligible storage at current scale.
- **NATS payload grows** — per-item adds ~40 bytes; at 50K sessions/day with 10 items each, ~20 MB/day extra. Acceptable.
- **NULL handling** — historical sessions and free-practice sessions need defensive aggregation. Mitigation: aggregators skip NULL.

### Follow-up work

- [ ] Migration in `services/quiz/migrations/` — `time_spent_ms` column (P4-S22).
- [ ] Submit handler computes and persists `time_spent_ms` (P4-S22).
- [ ] NATS payload includes `time_spent_ms` and `section_id` (P4-S22).
- [ ] alp-engagement consumer aggregates per-section (P4-S22).
- [ ] `/analytics/student/{user_id}/time-stats` endpoint (P4-S22).
- [ ] web-student readiness page surfaces per-topic time-spent (P4-S22).
- [ ] Time-pressure heuristic in error classification (P4-S29 / ADR-0016).

## Review

Revisit by **end of Phase 4** or earlier if:

- p95 time-per-question on a topic exceeds 5 minutes consistently — points to rendering-latency or content-quality issues, not student behaviour.
- NATS payload volume becomes a constraint at multi-million-session scale.
- Per-item granular events become necessary for real-time educator dashboards.
