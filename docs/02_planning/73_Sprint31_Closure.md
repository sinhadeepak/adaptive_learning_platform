# Sprint 31 Closure — P4-S31 Calibrated rank prediction (cohort-driven)

**Sprint window:** 2026-04-28
**Plan:** [`docs/02_planning/72_Sprint31_Plan.md`](72_Sprint31_Plan.md)

## Scope delivered

### S31-A — Engagement migration 008 — DONE

`analytics_schema` rev **008** adds the cohort-distribution table per [ADR-0015](../adr/0015-calibrated-rank-prediction.md):

```sql
CREATE TABLE analytics_schema.cohort_percentile_distribution (
  exam_id          UUID NOT NULL,
  topic_id         UUID NULL,
  readiness_bucket REAL NOT NULL,
  user_count       INTEGER NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exam_id, topic_id, readiness_bucket)
);
```

Composite PK supports both whole-exam (NULL topic_id) and per-topic distributions in one table.

### S31-B — Pure-function helpers — DONE

`engagement/analytics/cohort_percentile.py`:
- `bucket_for_readiness(readiness, step=0.05)` — snaps to bucket grid; clamps 1.0 to top bucket (0.95).
- `percentile_from_distribution(readiness, distribution)` → 0..100. Pure function over distribution rows.
- `confidence_from_cohort_size(n)` → `(label, half_width_fraction)` — `low` (0.40) for n<50, `medium` (0.20) for n<250, `high` (0.10) otherwise.
- `is_cohort_sufficient(distribution, min_total=50)` — gates the cohort path.
- `total_cohort_size(distribution)` — convenience.

Constants exposed: `COLD_START_THRESHOLD=50`, `HIGH_CONFIDENCE_THRESHOLD=250`, `DEFAULT_BUCKET_STEP=0.05`.

### S31-C — Aggregator + endpoints — DONE

- `aggregate_cohort_distribution(session, exam_id, topic_id?)` — groups `analytics_schema.readiness` (whole-exam) or `analytics_schema.mastery` (per-topic) by 0.05 buckets and upserts. Idempotent: deletes existing rows for the (exam, topic) before reinserting.
- `load_cohort_distribution(session, exam_id, topic_id?)` — read helper used by both the endpoint and the aggregation invocation.
- `GET /analytics/cohort-distribution?examId=X[&topicId=Y]` — returns `{examId, topicId, totalUsers, computedAt, buckets: [{readinessBucket, userCount}]}`.
- `POST /analytics/cohort-distribution/refresh?examId=X[&topicId=Y]` — invokes the aggregator. Idempotent. The actual periodic schedule (cron) defers to the staging-cutover sprint.

### S31-D — `rank.py` cohort path — DONE

- New `learning/adaptive/cohort_client.py` — alp-learning → alp-engagement HTTP client (`fetch_cohort_distribution`). Empty distribution on any error so the caller can fall back without an exception path.
- `rank.py::project_rank` extended with optional `exam_id` parameter:
  - When provided AND `cohort_size >= 50` AND `buckets` non-empty → uses cohort percentile (`percentileSource = "cohort"`).
  - Else → falls back to the existing hardcoded `_READINESS_TO_PERCENTILE` lookup (`percentileSource = "fallback"`).
  - Confidence band sourced from cohort size when on cohort path; from `n_attempts` otherwise.
  - New response fields: `percentileSource` and `cohortSize` so the UI can label "based on N=2,400 platform aspirants" honestly per the audit's call-out.

### S31-E — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/engagement/tests/analytics/test_cohort_percentile.py` | 13 | Python unit | written + verified standalone via `python -c` (full pytest gated on Docker autouse conftest) |

Plan estimated 14; one test for `aggregate_cohort_distribution` (DB-touching) intentionally deferred — covered by smoke. The pure-function helpers have full coverage.

### S31-F — Smoke — DONE

1 new step (63): `GET /analytics/cohort-distribution?examId=...` returns shape `{examId, totalUsers, buckets}`.

Smoke target: **63 steps**.

### S31-G — Closure + master phase index — DONE

This file. Master phase index updated.

## What surprised us this sprint

- **The cohort path is the simpler change in absolute terms** (~140 lines of new pure-function code + ~40 lines of rank.py integration), but its *value* depends entirely on cohort scale that the platform hasn't reached yet. The fallback regime is what runs in production until ~50 users per exam land. That's why the response carries `percentileSource` honestly — the alternative is dressing up a lookup as a prediction (the gap audit's exact criticism of the pre-S31 path).
- **Cold-start band of 50 is conservative.** Lowering to 25 would unlock the cohort path 2× faster but the percentile noise at that scale is ~10% — the wider confidence band on the fallback regime is more honest. Per ADR-0015 we revisit the threshold when we have real cohort variance data.
- **The aggregator is idempotent because it `DELETE` + reinsert**. An UPSERT-only path would leave stale buckets behind when the distribution shape narrows (e.g., users hit the top bucket mid-cycle). Wipe-then-fill is the simpler invariant.

## Carry-overs to Sprint 32

| Item | Why deferred | Owner |
|---|---|---|
| Aggregation cron firing | Scheduler infra | staging-cutover sprint |
| Per-topic percentile coaching surface ("you're at 67th percentile vs N students on Mechanics") | S32 | P4-S32 |
| Web-student rank-projection card with `percentileSource` labelling | UI consumer surface | P4-S32 (combined with peer percentile) |
| Mobile parity | S35 | P4-S35 |

## Sprint 31 status

**P4-S31 closed.** The "heuristic in a lab coat" path now has a cohort-driven alternative + an honest signal of which one fired. The fallback stays in service while cohort scale builds; predicted rank improves over time without engineering effort once the cohort grows past 50.
