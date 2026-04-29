# ADR-0014: Spaced-repetition scheduling algorithm

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead, Product Lead
- **Related**: P4-S27 gating ADR. Builds on existing EWA mastery model in `services/engagement/src/engagement/analytics/mastery.py`.

## Context

The platform tracks mastery (EWA, α=0.4) and surfaces weak-topic recommendations via the Sprint-20 heuristic recommender. It does **not**:

- Schedule when a topic is due for revision based on forgetting-curve principles.
- Surface a daily revision queue.
- Tighten cadence as exam date approaches.

Aspirants who use Allen / Vedantu / Unacademy / PhysicsWallah expect a **daily revision** loop driven by the platform, not by their own discipline. Without it, weak-topic mastery decays silently between practice sessions.

Three classical SRS algorithms:

- **Leitner** (5-box system) — interval doubles per correct answer; resets on wrong. Simple, deterministic. Used by Quizlet.
- **SM-2** (SuperMemo) — interval grows by ease factor (`EF`, default 2.5); EF adjusts based on response quality (0–5). Foundation of Anki.
- **FSRS** (modern, ML-derived) — predicts retention probability per item; schedules at target retention (e.g., 90%). Complex; needs training data.

## Decision

**Use SM-2 (modified) for v1, with a built-in EWA tie-in.**

### Algorithm

For each `(user_id, topic_id)` pair:

```
On topic attempt with overall accuracy A in [0, 1]:
  quality = round(5 * A)  // map [0,1] accuracy to SM-2 quality [0,5]
  if quality < 3:
    interval_days = 1
    ease_factor = max(1.3, ease_factor - 0.2)
  else:
    if attempts == 1: interval_days = 1
    elif attempts == 2: interval_days = 6
    else: interval_days = round(prev_interval * ease_factor)
    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease_factor = max(1.3, ease_factor)
  due_at = now + interval_days days
```

### EWA tie-in

When `mastery.ewa < 0.4` AND `due_at > 7 days from now`, **clamp `due_at` to now + 3 days**. Rationale: SM-2 alone can over-extend intervals on topics the EWA flags as weak; the clamp ensures revision happens before EWA decays further (in the absence of decay we still want surface revisits).

### Schema (alp-engagement)

```sql
CREATE TABLE analytics_schema.revision_queue (
  user_id        UUID NOT NULL,
  topic_id       UUID NOT NULL,
  exam_id        UUID NULL,                        -- target exam, when set
  last_attempt_at TIMESTAMPTZ NOT NULL,
  due_at         TIMESTAMPTZ NOT NULL,
  interval_days  INTEGER NOT NULL,
  ease_factor    REAL NOT NULL DEFAULT 2.5,
  attempts       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX idx_revision_due ON analytics_schema.revision_queue (user_id, due_at);
```

### Update path

- The existing `process_session()` consumer extends to call `update_revision_queue(user_id, topic_id, accuracy)` after the EWA + readiness updates.
- Pure-function scheduler in `engagement/analytics/srs.py::compute_next_due()`.

### Surface

- `GET /analytics/revision/{user_id}` — items due today (LIMIT 10 by default).
- web-student `Revision.tsx` — daily revision view (P4-S27).
- New notification type `revision.due`, default-on per-user mute toggle.

### Pre-mock revision sprint mode

Within 7 days of a scheduled mock (per the goal/target rank in ADR-0015), the queue surfaces tighten:

- All weak topics (mastery < 0.4) become daily-due regardless of SM-2 interval.
- `due_at` is clamped to today.
- The `revision.due` notification fires with elevated priority.

This is the platform's "peaking strategy" before exam.

## Alternatives considered

- **Leitner**. *Rejected* — too coarse (5 boxes); doesn't react to per-attempt quality. SM-2 with EWA tie-in gives finer control.
- **FSRS (ML-based)**. *Rejected for v1* — needs training data the platform doesn't have. Reserve as a P5 upgrade if SRS retention metrics plateau.
- **Pure forgetting-curve formula** (Ebbinghaus exponential decay). *Rejected* — same algorithm space as SM-2, but harder to interpret + tune; SM-2 is the well-tested incarnation.
- **Hybrid: SM-2 for fast feedback + FSRS for long-horizon scheduling**. *Considered, deferred* — added complexity not justified at current scale.

## Consequences

### Positive

- **Daily revision becomes a platform-driven loop** — habit formation no longer relies on student self-discipline.
- **Pre-exam peaking is automated** — the platform surfaces a focused revision sprint when the exam is close.
- **Notification surface gains a high-value type** — `revision.due` is more useful than streak nudges.
- **EWA tie-in addresses SM-2's blind spot** — long intervals on under-practised topics get clamped.

### Negative

- **One more durable consumer write per session** — rounding error at current scale.
- **Notification fatigue risk** — `revision.due` daily can annoy. Mitigation: per-user mute toggle (default-on, but easy to disable).
- **Algorithm tuning** — EF + interval defaults are SM-2 standard; calibration per-cohort is a P5 problem if needed.

### Follow-up work

- [ ] Migration in `engagement/alembic/analytics/` — revision_queue table (P4-S27).
- [ ] Pure-function `compute_next_due()` helper + 12 unit tests (P4-S27).
- [ ] `process_session()` extension (P4-S27).
- [ ] `/analytics/revision/{user_id}` endpoint + Revision.tsx web-student page (P4-S27).
- [ ] `revision.due` notification consumer + per-user mute (P4-S27).
- [ ] Pre-mock revision sprint mode wired to `target_exam_date` in user profile (P4-S30).
- [ ] Mobile parity for revision queue (P4-S35).

## Review

Revisit by **end of Phase 4** or earlier if:

- Daily revision view CTR drops below 15% (then re-evaluate notification strategy or EF tuning).
- Topics drift to long intervals (interval > 30 days) before the EWA clamp kicks in (raise the clamp threshold).
- FSRS becomes practical (sufficient training data + retention measurement).
