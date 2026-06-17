# ADR-0015: Calibrated rank prediction with cohort data

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead, Product Lead
- **Related**: P4-S31 gating ADR. Replaces hardcoded calibration in `services/learning/src/learning/adaptive/rank.py`.

## Context

`adaptive/rank.py` defines `EXAM_CALIBRATION` with hardcoded candidate-pool sizes and a piecewise-linear `_READINESS_TO_PERCENTILE` lookup table. The current implementation is honest about its uncertainty (widening confidence bands at low attempt volume) but the **base mapping is an assumption, not a fact**:

- No cohort data is collected.
- No real percentile distribution is learned.
- No update as the platform scales.

The strategic gap audit named this "heuristic in a lab coat". A predicted AIR coming out of the current code is a lookup answer dressed as a prediction.

## Decision

**Replace the hardcoded percentile lookup with a cohort-driven distribution. Keep the hardcoded fallback for the cold-start regime. Surface confidence intervals derived from real cohort variance.**

### Cohort distribution table

```sql
CREATE TABLE analytics_schema.cohort_percentile_distribution (
  exam_id           UUID NOT NULL,
  topic_id          UUID NULL,                  -- NULL = whole-exam aggregate
  readiness_bucket  REAL NOT NULL,              -- bucketed at 0.05 increments
  user_count        INTEGER NOT NULL,           -- distinct users in this bucket
  computed_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exam_id, topic_id, readiness_bucket)
);
```

Refreshed nightly by a new aggregation job:

```sql
INSERT INTO cohort_percentile_distribution (exam_id, topic_id, readiness_bucket, user_count, computed_at)
SELECT
  m.exam_id,
  NULL AS topic_id,
  ROUND(r.readiness * 20) / 20 AS readiness_bucket,
  COUNT(DISTINCT r.user_id) AS user_count,
  now()
FROM analytics_schema.readiness r
JOIN ...  -- exam scoping
GROUP BY m.exam_id, ROUND(r.readiness * 20) / 20
ON CONFLICT (exam_id, topic_id, readiness_bucket) DO UPDATE
  SET user_count = EXCLUDED.user_count, computed_at = EXCLUDED.computed_at;
```

### Rank-prediction algorithm

```python
def predict_rank(user_readiness: float, exam_id: UUID) -> RankPrediction:
    distribution = load_cohort_distribution(exam_id)
    total_users = sum(d.user_count for d in distribution)

    if total_users < COLD_START_THRESHOLD:  # 50 users in cohort
        return _fallback_to_hardcoded_calibration(user_readiness, exam_id)

    user_bucket = round(user_readiness * 20) / 20
    users_below = sum(d.user_count for d in distribution if d.readiness_bucket < user_bucket)
    percentile = (users_below / total_users) * 100

    candidate_pool = EXAM_CALIBRATION[exam_id].candidate_pool  # still hardcoded — population size is external
    estimated_rank = candidate_pool * (1 - percentile / 100)

    confidence = _compute_confidence(total_users, user_bucket, distribution)
    return RankPrediction(
        rank=estimated_rank,
        confidence_lower=estimated_rank - confidence.delta_lower,
        confidence_upper=estimated_rank + confidence.delta_upper,
        cohort_size=total_users,
        source="cohort"  # vs "fallback"
    )
```

### Confidence interval

Confidence width derives from:

- **Cohort size**: smaller cohort → wider CI. CI shrinks roughly as `1/sqrt(N)` for the bucket.
- **Bucket density**: sparse bucket (e.g., < 10 users in this readiness range) → wider CI for that user.
- **Time since last refresh**: if the distribution is > 7 days old, widen by 10%.

### Surface

- The existing rank-prediction endpoint in alp-learning gains:
  - `confidence_lower`, `confidence_upper` (already partially present)
  - `cohort_size` (new)
  - `source` (`"cohort"` or `"fallback"`) — UI surfaces this honestly: "Based on N=2,400 platform aspirants in your readiness bucket on JEE Main."
- web-student rank-projection card honestly says "Based on N=X" or "Limited data — using calibration estimate".

## Alternatives considered

- **Keep the hardcoded calibration**. *Rejected* — strategic gap audit specifically called it out as un-earned. The platform's "AI-powered" claim depends on at least one calibrated signal.
- **Bayesian update on the hardcoded prior**. *Considered, deferred* — adds machinery for marginal accuracy gain over straight cohort lookup. Revisit if cohort distribution exhibits high variance.
- **Live cohort lookup at request time** (no nightly aggregation). *Rejected* — readiness query is too expensive to run on every rank-prediction request. Nightly cache is fine; rank prediction is a daily-checked metric, not a sub-second one.
- **Use external benchmark data** (Allen / Aakash published cutoffs). *Considered* — no clean source available; legal grey area on republishing competitor cutoff data. Use platform cohort only.

## Consequences

### Positive

- **Predicted AIR becomes data-grounded** as the platform grows.
- **Cold-start regime is honest** — fallback path is labelled, confidence intervals are wide.
- **The "AI-powered" claim earns a defensible signal** — the platform actually measures what it says.
- **Rank prediction improves over time without engineering effort** — more users → better calibration automatically.

### Negative

- **Cold-start period** — the first 50 users per exam still see the hardcoded estimate. Honest labelling mitigates the user-experience downside.
- **Nightly aggregation job** — adds a cron-like task in alp-engagement. Minor ops burden.
- **Cohort scoping decisions** — should the cohort be "all platform users for this exam this year" or "platform users + last-year cohort"? Phase 4 decision: current-cycle users only. P5 may extend.

### Follow-up work

- [ ] Migration in `engagement/alembic/analytics/` — `cohort_percentile_distribution` table (P4-S31).
- [ ] Nightly aggregation job (P4-S31).
- [ ] Rewrite of `learning/src/learning/adaptive/rank.py` — replace lookup with cohort query (P4-S31).
- [ ] Confidence-interval helper (P4-S31).
- [ ] web-student rank-prediction surface — honest source labelling (P4-S31).
- [ ] educator drill-down extension — show cohort percentile (P4-S32 / educator surface).
- [ ] Backfill — populate cohort distribution from existing mastery + readiness rows on first deploy.

## Review

Revisit by **end of Phase 4** or earlier if:

- Cohort distribution is too coarse at the 0.05-bucket level (drop to 0.025).
- Predicted-AIR mean error vs actual JEE 2027 results > 30%.
- Per-topic distribution for percentile coaching demands sub-bucket resolution.
- Multi-exam cohorts share enough structure to enable cross-exam transfer learning.
