# Sprint 22 — P4-S22 foundation: time-per-question + per-section analytics

**Sprint window:** 2026-04-28 (single working session)
**Theme:** First sprint of Phase 4. Land the smallest schema change that unlocks every downstream Phase 4 sprint, plus the per-section analytics surface that the strategic gap audit named as a structural omission.

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md), Sprint 22 is the foundation sprint of Phase 4. The 5 ADRs (0012–0016) are already drafted in `proposed` state; this sprint commits the additive schema changes and the analytics consumer extension that the rest of Phase 4 builds on:

- **Time-per-question tracking** is the highest-leverage foundational signal (FR-P4-01, GAP-P4-01).
- **Per-section analytics on practice sessions** closes a current asymmetry — mock papers emit per-section breakdowns, regular practice does not (GAP-P4-10).
- **Backward-compatible NATS payload extension** so downstream Notification + Content consumers keep working.

Phase 4 strategic gates (quiz vs exam-prep / which exam first / depth bar) remain *open*. This sprint ships behind the audit doc — the schema changes are additive and reversible if the gates ultimately go the other way. ADR-0012 + ADR-0013 are the gating ADRs that already drove the design.

## Backlog

### S22-A — Quiz Go migration 007

`quiz_schema` rev **007**:

- `quiz_session_items.time_spent_ms INTEGER NULL` — populated at submit time.
- `quiz_session_items.section_id TEXT NULL` — propagated when the session is created from a blueprint (mock mode); NULL for practice/assignment sessions.
- `questions.exam_year SMALLINT NULL`, `paper_session TEXT NULL`, `pyq_flag BOOLEAN NOT NULL DEFAULT FALSE` — mirror columns for the bridge subscriber, advance now so PYQ ingest in S24 has a target.

All additive, reversible.

### S22-B — Quiz Go submit handler

In `services/quiz/internal/server/sessions.go::Submit`:

- After `MarkSubmitted`, load all session items.
- Compute `time_spent_ms = (answered_at - served_at).Milliseconds()` for items where `answered_at IS NOT NULL`.
- Persist via a new `Store.WriteItemDurations(ctx, sessionID)` helper that runs a single `UPDATE … SET time_spent_ms = EXTRACT(EPOCH FROM (answered_at - served_at)) * 1000 WHERE session_id = $1`.
- Build a per-item array in the NATS payload.

### S22-C — NATS payload extension

`events.SessionCompleted` gains an optional `Items []SessionItemEvent` field:

```go
type SessionItemEvent struct {
    ItemIdx     int16   `json:"item_idx"`
    QuestionID  string  `json:"question_id"`
    TopicID     string  `json:"topic_id"`
    SectionID   string  `json:"section_id,omitempty"`
    IsCorrect   bool    `json:"is_correct"`
    TimeSpentMs int32   `json:"time_spent_ms,omitempty"` // 0 if unanswered
}
```

`omitempty` on `Items` keeps the historical payload shape valid for any consumer that hasn't been updated. Aggregate fields (`served_count`, `correct_count`, etc.) stay in place untouched — Notification and Content consumers see no contract change.

### S22-D — Engagement migration 005

`analytics_schema` rev **005** adds `session_section_stats`:

```sql
CREATE TABLE analytics_schema.session_section_stats (
  session_id     UUID NOT NULL,
  section_id     TEXT NOT NULL,
  user_id        UUID NOT NULL,
  correct_count  INTEGER NOT NULL,
  served_count   INTEGER NOT NULL,
  total_time_ms  BIGINT NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, section_id)
);
CREATE INDEX idx_session_section_user ON analytics_schema.session_section_stats (user_id, section_id);
```

`section_id` is the literal section identifier from the blueprint when present. For sessions without a blueprint, the consumer falls back to `topic_id` so practice sessions still produce per-topic time stats (which the rest of P4 reads as "section" for analytical purposes).

### S22-E — Engagement consumer extension

In `engagement/analytics/events.py::_on_session_completed`:

- After the existing `process_session()` call, if the payload has an `items` array:
  - Group items by `section_id ?? topic_id`.
  - For each group, upsert into `session_section_stats` with `correct_count`, `served_count`, `total_time_ms = sum(time_spent_ms)`.
- Pure additive; if `items` is absent, behaviour is identical to today.

### S22-F — Two new endpoints

In `engagement/analytics/routes.py`:

- `GET /analytics/student/{user_id}/time-stats?examId=X` — returns per-section + per-topic median time, average time, accuracy, n_attempts. Cached aggregation.
- `GET /analytics/sessions/{session_id}/breakdown` — returns the section-wise breakdown for a single submitted session.

Both surfaces are read-only; auth is the existing `STUDENT` self-or-admin gate already used in this module.

### S22-G — Tests

| File | Tests | Type |
|---|---|---|
| `services/quiz/internal/server/sessions_test.go` (new tests) | 4 (compute happy + clock-skew + empty-items + payload-shape) | Go unit |
| `services/engagement/tests/test_section_stats.py` | 4 (group-by-section, fallback-to-topic, no-items, multi-section) | Python unit |
| `services/engagement/tests/test_time_stats_route.py` | 2 (route shape + auth) | Python integration |

### S22-H — Smoke extension

Add 2 assertions:

- After the existing quiz submit, `GET /analytics/sessions/{session_id}/breakdown` returns at least one section with non-zero `total_time_ms`.
- `GET /analytics/student/{user_id}/time-stats` returns shape `{userId, sections: [...]}`.

Smoke target: **52 steps** (was 50 at Sprint 21 close).

### S22-I — Closure + master phase index

`docs/02_planning/55_Sprint22_Closure.md`. Master phase index updated with the S22 row; Phase 4 row stays DRAFT (gates still open) but S22's schema additions are landed.

## Out of scope for this sprint

Explicitly *not* in S22 (each defers to its named sprint, per the Phase 4 plan):

- Real exam blueprints (S23) — schema for blueprints lives in `learning.catalog`, not Quiz; lands later.
- Mock-mode UI rebuild (S23 + S25).
- PYQ ingest pipeline (S24) — schema mirror columns ship now so the bridge subscriber doesn't have to be redeployed mid-sprint, but no PYQ rows are ingested in S22.
- Section-id propagation from blueprints (S23) — until blueprints exist, `section_id` is NULL on session items.
- LLM error classifier (S29).
- Cohort-driven rank prediction (S31).

## Definition of done

- Quiz migration 007 applied; `time_spent_ms` populated on new sessions.
- Engagement migration 005 applied; `session_section_stats` table exists.
- Quiz Go submit handler computes time_spent_ms + emits items array in NATS payload.
- Engagement consumer persists per-section breakdown when items array is present.
- 2 new endpoints serve correctly.
- 10 new tests (4 Go + 6 Python) green.
- `make smoke` 52/52.
- Sprint 22 closure doc + master phase index updated.
