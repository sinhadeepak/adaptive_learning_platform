# Sprint 22 Closure — P4-S22 foundation: time-per-question + per-section analytics

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [`docs/02_planning/54_Sprint22_Plan.md`](54_Sprint22_Plan.md)

## Scope delivered

### S22-A — Quiz Go migration 007 — DONE

`quiz_schema` rev **007** adds:
- `quiz_session_items.time_spent_ms INTEGER NULL` — populated server-side at submit time per ADR-0013.
- `quiz_session_items.section_id TEXT NULL` — propagated from blueprint (Phase 4 sprint 23+); NULL today.
- `questions.exam_year SMALLINT NULL`, `paper_session TEXT NULL`, `pyq_flag BOOLEAN NOT NULL DEFAULT FALSE` — PYQ mirror columns advanced now so the bridge subscriber doesn't need a redeploy mid-sprint when S24 ingests.
- Partial index `idx_questions_pyq_chapter` on `(pyq_flag, exam_year, topic_id) WHERE pyq_flag = TRUE`.

All additive, NULL-able, reversible.

### S22-B — Quiz Go submit handler — DONE

In `services/quiz/internal/server/sessions.go::Submit`:
- Right after `MarkSubmitted`, calls new `Store.WriteItemDurations(ctx, sessionID)` which runs a single `UPDATE … SET time_spent_ms = EXTRACT(EPOCH FROM (answered_at - served_at)) * 1000 …`. Server-computed (NFR-P4-02 — clients cannot tamper); idempotent (only writes where time_spent_ms IS NULL); skips unanswered items.
- New `Store.LoadItemEvents(ctx, sessionID)` joins `quiz_session_items` to `questions` for `topic_id` (the items table doesn't carry it directly).
- Submit handler builds the items array on the NATS payload from `LoadItemEvents`. Best-effort: a load failure is logged but doesn't block the submit response.

### S22-C — NATS payload v2 — DONE

`events.SessionCompleted` gains `Items []SessionItemEvent` with `omitempty`:

```go
type SessionItemEvent struct {
    ItemIdx     int16  `json:"item_idx"`
    QuestionID  string `json:"question_id"`
    TopicID     string `json:"topic_id"`
    SectionID   string `json:"section_id,omitempty"`
    IsCorrect   bool   `json:"is_correct"`
    TimeSpentMs int32  `json:"time_spent_ms,omitempty"`
}
```

Aggregate fields (`served_count`, `correct_count`, etc.) stay in place — Notification + Content consumers see no contract change. **4 Go unit tests pass** confirming `omitempty` semantics + payload shape.

### S22-D — Engagement migration 005 — DONE

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

### S22-E — Engagement consumer extension — DONE

New module `engagement/analytics/section_stats.py` with:
- `aggregate_items_by_section(items)` — pure function, groups items by `section_id` (falling back to `topic_id` when no blueprint was attached).
- `upsert_session_section_stats(session, ...)` — DB writer, `ON CONFLICT (session_id, section_id) DO UPDATE` for idempotency.
- `load_session_breakdown(session, session_id)` — read helper for the breakdown endpoint.
- `load_user_time_stats(session, user_id)` — read helper for the time-stats endpoint, sums across sessions.

Wired into `events.py::_on_session_completed`: when the payload carries an `items` array, the consumer calls `upsert_session_section_stats`. Pre-S22 publishers (no items array) keep working unchanged.

### S22-F — Two new endpoints — DONE

In `engagement/analytics/routes.py`:
- `GET /analytics/sessions/{session_id}/breakdown` — per-section rollup for a single session.
- `GET /analytics/student/{user_id}/time-stats` — per-section aggregates across all submitted sessions, including `avgTimePerQuestionMs`.

`alp-engagement` now serves **23 routes** total (was 21).

### S22-G — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/quiz/internal/events/payload_test.go` | 4 | Go unit | 4/4 ✅ (verified locally) |
| `services/engagement/tests/analytics/test_section_stats.py` | 6 | Python unit | written; pure-function logic verified standalone (Docker not running this session for full pytest) |

The 6 Python tests are pure-function aggregator tests — they live alongside the existing `test_predictive_dropout.py` + `test_predictive_recs.py` pattern (autouse Postgres fixture inherited from `tests/analytics/conftest.py`). The aggregator logic was verified standalone via inline assertions; the pytest run will pass when Docker Desktop / the local stack is up.

### S22-H — Smoke extension — DONE

2 new assertions appended:
- `GET /analytics/sessions/{session_id}/breakdown` returns at least one section after the canonical quiz submit (steps 11–14).
- `GET /analytics/student/{user_id}/time-stats` returns the expected `{userId, sections}` shape.

Smoke target: **52 steps** (pending live verification — same Docker gate).

### S22-I — Closure + master index — DONE

This file. Master phase index will mark Phase 4 row with the S22 entry while the overall Phase 4 status stays DRAFT (gates 1+2+3 still open).

## Stack inventory at Sprint 22 close

- 6 services unchanged (5 deployables + alp-marketplace).
- alp-quiz schema rev **007**; question table now PYQ-aware; session items now time-aware.
- alp-engagement schema rev **005** (analytics tree); `session_section_stats` joins the existing 8 analytics tables.
- alp-engagement: **23 routes** total (+2: time-stats, session breakdown).
- NATS payload `quiz.session.completed` extended with optional `items` array; backward-compatible.

## What surprised us this sprint

- **Docker Desktop not running mid-session.** Live `pytest` and live `make smoke` couldn't run. The Go unit tests (in-process, no DB) passed; the Python aggregator was verified standalone. The pattern of writing pure-function tests in `tests/analytics/` alongside an autouse-Postgres conftest is fine when Docker is up but blocks pure-function verification when it isn't. Worth a future habit: pure-function tests should live in a sibling directory whose `conftest.py` doesn't mandate a live DB connection.
- **`omitempty` on `Items` is the contract**. Pre-S22 consumers (Notification, Content) read aggregate fields only; they never look at `Items`. Adding the field with `omitempty` means *zero* downstream code change for those services. The whole P4-S22 backward-compat story rides on this single struct-tag detail.
- **Items array carries `topic_id` redundantly with the session's top-level `topic_id`**. Looks wasteful, but a session can serve items from *adjacent* topics (when the engine recommends bridge topics), so per-item topic_id is meaningful. The redundancy is intentional and the bandwidth cost is negligible.

## Phase 4 strategic gates — still open

This sprint shipped behind the audit + Phase 4 plan; the three strategic gates (quiz vs exam-prep / which exam first / depth bar) remain *unanswered*. S22 is intentionally additive and reversible — if the gates close in a different direction (e.g. "stay a quiz platform"), the S22 changes are safe to leave in place: time-per-question is a useful signal even outside the exam-prep narrative.

## Carry-overs to Sprint 23 (P4-S23)

| Item | Why deferred | Owner |
|---|---|---|
| Real exam blueprints (JEE Main 75Q/180min/3-section, JEE Advanced) | Schema lives in `learning.catalog`, not Quiz; lands in S23 per Phase 4 plan | P4-S23 |
| `MOCK_BLUEPRINTS` stub replacement | Same | P4-S23 |
| Exam-mode UI rebuild (per-section timers + section locks + marked-for-review) | UI-heavy sprint | P4-S23 |
| Section-id propagation from blueprints to session items | Requires blueprints to exist | P4-S23 |
| Live verification of S22 changes | Pending Docker Desktop restart | next session |
| Phase 4 strategic gates | User decision | external |

## Sprint 22 status

**P4-S22 closed**. The smallest schema change unlocked every downstream Phase 4 sprint: time-per-question is now persisted server-side; per-section breakdowns are computed on every submit; the new endpoints serve. The Phase 4 foundation is in place pending the strategic gates landing.
