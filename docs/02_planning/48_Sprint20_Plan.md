# Sprint 20 — P3-S5 predictive analytics + recommendations

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Land the headline P3-S5 deliverable per the Phase 3 plan: drop-out forecasting + intervention recommendations + topic recommendations. Per [ADR-0010](../adr/0010-predictive-analytics-model-serving.md), pure Python in `engagement.analytics.predictive` (no MLflow / Sagemaker). Per [ADR-0011](../adr/0011-recommendation-algorithm.md), content-based via existing IRT signals (pgvector + OpenAI embeddings stay deferred to P3-S6 once we have proven baseline value).

## Why this sprint

S19 closed the marketplace value loop (courses, modules, ratings, refunds, earnings). What's missing now is the *intelligence layer* that makes the platform's "AI-powered personalised learning" promise real:

1. **Drop-out forecasting** — students who haven't engaged in 7+ days, or whose mastery is trending down, need an intervention before they churn.
2. **Topic recommendations** — students completing Mechanics shouldn't have to figure out "what should I do next" — the platform should suggest the next topic based on their current weak areas.
3. **Intervention triggers** — high-risk students should automatically get the right nudge: re-engagement notification, free trial tutor session, simpler topic priority.

ADR-0010 explicitly chose pure Python heuristics over ML for P3 — train sophisticated models in P3-S6+ once we have the training-data volume to make them work. v1 = transparent rules engineers can reason about; v2 = lightgbm/sklearn once we have ≥10K students × ≥30 days of activity.

## Backlog

### S20-A — Migration in engagement (analytics tree)

`analytics_schema` rev **004** (current is 003 from Phase 2):

- `predictive_dropout_scores` — cached scoring per user.
  - `user_id UUID PK`
  - `score REAL NOT NULL` (0–1; >0.7 = high risk)
  - `risk_band TEXT NOT NULL` (`LOW | MEDIUM | HIGH`)
  - `intervention_kind TEXT NULL` (`re_engagement_notification | suggest_tutor | lower_difficulty | none`)
  - `signals_json JSONB NOT NULL` — the inputs that drove the score (days_since_last_active, current_streak, longest_streak, avg_mastery, n_topics_below_floor)
  - `computed_at TIMESTAMPTZ NOT NULL`
  - Index `(score DESC, computed_at DESC)` for "high-risk users right now" queries.

- `cached_recommendations` — per-user topic recommendations.
  - `user_id UUID NOT NULL`
  - `position INTEGER NOT NULL` (1..N — display order)
  - `topic_id UUID NOT NULL`
  - `score REAL NOT NULL` (0–1; recommendation strength)
  - `reason_string TEXT NOT NULL` (the "why" surfaced in UI)
  - `computed_at TIMESTAMPTZ NOT NULL`
  - PRIMARY KEY `(user_id, position)`

Both tables are caches — recomputed on demand with TTL (1 hour for v1) or via a nightly cron once that lands. Stale entries served on cache miss while a recompute runs (eventual consistency acceptable).

### S20-B — Drop-out scorer (heuristic v1)

`engagement/analytics/predictive_dropout.py`:

```python
def score_user(signals: DropoutSignals) -> DropoutScore:
    """Pure-function heuristic.

    Score components (0..1 each, summed to score 0..1 with caps):
      - inactivity_score = min(1.0, days_since_last_active / 14)
        (no activity for 14+ days → max risk on this axis)
      - streak_broken_score = 0.4 if (longest_streak >= 5 and current_streak == 0) else 0.0
        (signals: was engaged, now isn't)
      - mastery_decline_score = 0.3 if avg_mastery < 0.35 else 0.0
        (signals: struggling)
      - many_weak_topics_score = 0.2 if n_topics_below_floor >= 3 else 0.0

    Final = average of components (so each contributes proportionally).
    """
```

The function is pure: takes a `DropoutSignals` dataclass, returns a `DropoutScore` with the band + suggested intervention.

Intervention rules:
- HIGH (≥0.7) + days_since_last_active ≥ 7 → `re_engagement_notification`
- HIGH + avg_mastery < 0.35 + many weak topics → `suggest_tutor`
- MEDIUM (0.4–0.7) + many weak topics → `lower_difficulty`
- LOW → `none`

`engagement/analytics/predictive.py` orchestrates: gathers signals from `mastery`, `streaks`, `daily_activity` tables; calls `predictive_dropout.score_user`; persists in `predictive_dropout_scores`; returns the score.

### S20-C — Recommendation engine (heuristic v1)

`engagement/analytics/predictive_recs.py`:

ADR-0011 choses content-based via OpenAI embeddings, but the "v1 with hooks for v2" pattern means we ship a simpler heuristic now and keep the embedding hooks (cached_recommendations table format reserves a `score` column compatible with cosine similarity later).

Heuristic:
1. Identify the user's **weakest topics** (mastery EWA < 0.4 and n_attempts >= 3).
2. For each weak topic, find **bridge topics** — topics in the same `subject_id` where the user has mastery ≥ 0.6 and n_attempts ≥ 5. These are "you've mastered X, which is foundational for Y, where you're struggling — drill X to consolidate".
3. If no bridge available: recommend topics in the user's selected exam(s) where mastery is unstarted (n_attempts == 0) — exposure value.
4. Cap at 5 recommendations. Sort by composite score (weak topic priority + bridge match weight).
5. The `reason_string` is generated client-side-friendly: "Mastering Mechanics will help you with Thermodynamics where you're scoring 32%."

Cache in `cached_recommendations` with TTL 1 hour.

### S20-D — Routes

In `engagement/analytics/routes.py`:

- `GET /analytics/predictive/dropout/{user_id}` — returns `{score, riskBand, intervention, signals, computedAt}`. Auth: caller must be the user OR admin OR educator with cohort access.
- `GET /analytics/predictive/dropout/cohorts/{cohort_id}` — returns the high-risk students in a cohort. Educators use this. Auth: educator-of-cohort OR admin.
- `GET /analytics/recommendations/{user_id}` — returns `[{topicId, score, reason}, ...]`. Same auth as dropout.
- `POST /analytics/predictive/recompute/{user_id}` — admin-only. Force recompute (skips cache).

### S20-E — Tests

| File | Tests | Type |
|---|---|---|
| `test_predictive_dropout.py` | 8 | unit (pure-function scorer; signal combinations) |
| `test_predictive_recs.py` | 5 | unit (bridge-topic logic + ranking) |
| `test_predictive_routes.py` | 4 | integration (route auth + cache-hit + recompute) |

### S20-F — Web-student home tile

- Extend `apps/web-student/src/pages/Home.tsx` with a "Personalised next step" tile:
  - If dropout risk is HIGH and intervention is `re_engagement_notification`: show "Welcome back" CTA.
  - If MEDIUM: show top recommendation with "why" string.
  - If LOW: show top recommendation as "Up next: ..." plus a couple of supplementary suggestions.
- New API namespace `apps/web-student/src/lib/api.ts::predictive`.

### S20-G — Web-admin rating moderation UI (S19 carry-over)

- New `apps/web-admin/src/pages/RatingModeration.tsx` — admin pastes a tutor or course id; sees recent ratings; can hide/unhide each. Shown reason badge for hidden.
- API namespace extension on `apps/web-admin/src/lib/api.ts`.

### S20-H — Smoke

Add 4 assertions:
- `GET /analytics/predictive/dropout/<student>` returns valid score
- Recommendation endpoint returns N items
- Force recompute (admin) works
- (skip cohort-level since it needs more setup)

Smoke target: 46 steps.

### S20-I — Closure + master index

`docs/02_planning/49_Sprint20_Closure.md`. Master index updated.

## Out of scope

- **lightgbm/sklearn training pipeline** — requires training-data volume not present yet. Ships in P3-S6+ once we have ≥30 days of activity from ≥10K students.
- **OpenAI embedding-based recommendations** — heuristic v1 ships now; embedding upgrade is the v2 trigger ADR-0011 reserved hooks for.
- **pgvector extension** — needed for embedding similarity at scale; stays deferred to P3-S6.
- **Module/lesson UI in CourseAuthor** — significant effort, deferred from S19; carries to S21.
- **Lesson reader UI updates** — same.
- **Mobile** — Phase 3 plan defers throughout.
- **Real Stripe Connect / Daily.co wiring** — pending creds.
- **Aggregate caches on tutor_profiles + courses** — performance optimisation; P3-S6.

## Definition of done

- engagement migration 004 applied; analytics_schema has 2 new tables.
- Drop-out scorer + recommendation heuristic + 17 unit/integration tests green.
- 4 new endpoints mounted in alp-engagement.
- Web-student home tile renders the personalised next step.
- Web-admin rating moderation page works end-to-end.
- `make smoke` 46/46.
- Sprint 20 closure doc + master index updated.
