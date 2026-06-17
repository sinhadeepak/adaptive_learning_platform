# Sprint 27 — P4-S27: Spaced-repetition revision queue

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Daily revision becomes a platform-driven loop, not a self-discipline test. Closes [GAP-P4-06](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-06--no-spaced-repetition-revision-queue).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md) and [ADR-0014](../adr/0014-spaced-repetition-scheduling.md), Sprint 27 ships the SM-2 + EWA tie-in scheduler that drives a daily revision queue. Allen / Vedantu / Unacademy / PhysicsWallah aspirants expect the platform to tell them "10 topics due today" — not the other way around. Without it, weak-topic mastery decays silently between practice sessions.

## Backlog

### S27-A — Engagement migration 006: `revision_queue`

`analytics_schema` rev **006** per ADR-0014:

```sql
CREATE TABLE analytics_schema.revision_queue (
  user_id         UUID NOT NULL,
  topic_id        UUID NOT NULL,
  exam_id         UUID NULL,
  last_attempt_at TIMESTAMPTZ NOT NULL,
  due_at          TIMESTAMPTZ NOT NULL,
  interval_days   INTEGER NOT NULL,
  ease_factor     REAL NOT NULL DEFAULT 2.5,
  attempts        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, topic_id)
);
CREATE INDEX idx_revision_due ON analytics_schema.revision_queue (user_id, due_at);
```

The composite PK + `(user_id, due_at)` index supports the daily "what's due" query in p95 < 200 ms (NFR-P4-05) at 100K-MAU scale.

### S27-B — Pure-function SM-2 scheduler

New `engagement/analytics/srs.py` per ADR-0014:

- `compute_next_due(*, prev_interval_days, prev_ease_factor, prev_attempts, accuracy)` → `(next_interval_days, next_ease_factor)` — SM-2 standard algorithm with a quality-derived-from-accuracy mapping (`quality = round(5 * accuracy)`).
- `apply_ewa_clamp(due_at, mastery_ewa, *, now)` → `due_at` — clamps long intervals on weak-EWA topics to "now + 3 days" (the EWA tie-in from ADR-0014).
- `due_today(due_at, *, now)` — boolean helper that handles UTC normalisation.

Pure functions; no DB or HTTP coupling. Fully unit-testable.

### S27-C — Revision queue repo

New `engagement/analytics/revision_queue_repo.py`:

- `upsert(user_id, topic_id, *, last_attempt_at, due_at, interval_days, ease_factor, attempts, exam_id?)` — `INSERT … ON CONFLICT DO UPDATE`.
- `get_state(user_id, topic_id)` → `RevisionRow | None` — used by `update_revision_queue` to fetch prior interval/EF.
- `list_due(user_id, *, now, limit=10)` — items where `due_at <= now`, ordered by `due_at ASC, last_attempt_at ASC`. Joins catalog topics for title.

### S27-D — `update_revision_queue` orchestrator

New `engagement/analytics/revision.py::update_revision_queue(session, user_id, topic_id, *, accuracy, mastery_ewa, now)`:

1. Fetch prior `RevisionRow` (or default to interval=0, ef=2.5, attempts=0).
2. Compute next interval + ease factor via `srs.compute_next_due`.
3. Bump attempts.
4. Compute candidate `due_at = now + next_interval_days days`.
5. Apply EWA clamp via `srs.apply_ewa_clamp` (when ewa < 0.4 and due_at > now+7 days, clamp to now+3 days).
6. Upsert.

Pure orchestration; the math lives in `srs.py`.

### S27-E — Wire `process_session`

`engagement/analytics/processing.py::process_session` extends — after the EWA + readiness + streak updates and before the achievement-grant fan-out:

```python
await update_revision_queue(
    session,
    user_id=user_id,
    topic_id=topic_id,
    accuracy=score,
    mastery_ewa=new_ewa,
    now=datetime.now(tz=UTC),
)
```

Idempotent: `process_session` already short-circuits on `is_session_processed`, so a JetStream redelivery never double-applies.

### S27-F — Endpoint `GET /analytics/revision/{user_id}`

In `engagement/analytics/routes.py`:

```
GET /analytics/revision/{user_id}?limit=10
```

Returns:

```json
{
  "userId": "...",
  "now": "2026-04-28T06:00:00Z",
  "items": [
    {"topicId": "...", "topicTitle": "Mechanics",
     "lastAttemptAt": "...", "dueAt": "...",
     "intervalDays": 6, "easeFactor": 2.5, "attempts": 3,
     "overdueDays": 0}
  ]
}
```

`overdueDays` is computed from `now - dueAt` (rounded down to days, ≥ 0). Useful for UI sorting + visual emphasis.

### S27-G — Web-student `Revision.tsx`

New page at `/revision`:

- Hero: count + "topics due for revision today".
- Top-10 list. Each card: topic title, mastery pill (resolve from existing `/analytics/mastery/{userId}`), interval days, last-attempt date, "Practice now →" CTA → `/quiz/sessions/start` for that topic.
- Empty state: "✓ Nothing due today — good time to explore new topics."
- Pure helper `apps/web-student/src/lib/revision_queue.ts`:
  - `summariseRevisionList(items, mastery)` — joins items with mastery pill labels.
  - `formatInterval(days)` — "1 day" / "5 days" / "2 weeks" / "1 month".

Routes:
- `/revision` — daily revision view.

### S27-H — Notification type registration (mute toggle, no firing)

The notification *firing* (cron-driven daily wake-up) is deferred to S30 stabilisation alongside the cohort-percentile aggregation cron. S27 ships only the **mute toggle catalog entry** so users can opt out before any cron-driven firing lands:

- `engagement/notification/sender.py::TEMPLATES` adds a `revision.due` template.
- web-student notification prefs page adds a `revision.due` toggle (default-on).

This keeps the surface honest: the queue is queryable today; the daily push is a downstream task.

### S27-I — Tests

| File | Tests | Type |
|---|---|---|
| `services/engagement/tests/analytics/test_srs.py` | 14 | Python unit (compute_next_due across quality bands + ease-factor floor + EWA clamp + due_today edges) |
| `services/engagement/tests/analytics/test_revision_orchestrator.py` | 4 | Python integration (update_revision_queue: insert-then-update, default seed, EWA clamp triggered, accuracy=0 fail path) |
| `apps/web-student/src/lib/revision_queue.test.ts` | 4 | Vitest (formatInterval bands + summariseRevisionList edges) |

### S27-J — Smoke extension

1 new assertion (step 59):
- `GET /analytics/revision/{student}` returns shape `{userId, now, items}`. After the canonical quiz submit (steps 11–14 in the smoke), the student should have ≥1 row in their queue.

Smoke target: **59 steps**.

### S27-K — Closure + master phase index

`docs/02_planning/65_Sprint27_Closure.md`. Master index updated with the S27 row.

## Out of scope

- **Daily `revision.due` notification cron** — needs scheduler infra; defers to S30 stabilisation alongside the cohort-percentile aggregation cron.
- **Pre-mock revision sprint mode** — depends on `target_exam_date` on user profile (lands in S30); S27 ships the queue, S30 wires the pre-exam tightening.
- **FSRS (forgetting-curve ML)** — ADR-0014 reserves SM-2; FSRS is P5+.
- **Engagement-side recommendation engine integration** (predictive_recs prefers due-today topics) — S30 stabilisation slot.
- **Mobile parity** — S35.

## Definition of done

- engagement migration 006 applied; `revision_queue` table exists with index.
- `srs.py` pure-function helpers ship + unit-tested.
- `process_session` calls `update_revision_queue` end-to-end (verified by smoke).
- `GET /analytics/revision/{userId}` serves the daily list.
- web-student `Revision.tsx` renders the daily list with mastery pills.
- Notification template `revision.due` registered (mute toggle works).
- 22 new tests green (14 + 4 Python + 4 TS).
- `make smoke` 59/59.
- Sprint 27 closure doc + master phase index updated.
