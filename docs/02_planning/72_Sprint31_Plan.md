# Sprint 31 — P4-S31: Calibrated rank prediction (cohort-driven)

**Sprint window:** 2026-04-28
**Theme:** Replace the hardcoded `_READINESS_TO_PERCENTILE` lookup in `rank.py` with a cohort-data-driven percentile distribution. Closes [GAP-P4-08](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-08--heuristic-rank-prediction-dressed-as-calibration).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md) and [ADR-0015](../adr/0015-calibrated-rank-prediction.md): the existing `EXAM_CALIBRATION` + `_READINESS_TO_PERCENTILE` mapping in `learning/adaptive/rank.py` is a hand-coded lookup. The strategic gap audit named this "heuristic in a lab coat" — the predicted AIR is a lookup answer dressed as a prediction. S31 grounds it in real cohort data with an honest fallback for the cold-start regime.

## Backlog

### S31-A — Engagement migration 008: `cohort_percentile_distribution`

`analytics_schema` rev **008** per ADR-0015:

```sql
CREATE TABLE analytics_schema.cohort_percentile_distribution (
  exam_id          UUID NOT NULL,
  topic_id         UUID NULL,                  -- NULL = whole-exam aggregate
  readiness_bucket REAL NOT NULL,              -- bucketed at 0.05 increments
  user_count       INTEGER NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exam_id, topic_id, readiness_bucket)
);

CREATE INDEX idx_cohort_pcdist_exam
    ON analytics_schema.cohort_percentile_distribution (exam_id, topic_id);
```

The `(exam_id, topic_id, readiness_bucket)` PK supports both "whole-exam percentile" (NULL topic_id) and per-topic percentile lookups in a single table.

### S31-B — Pure-function cohort percentile

New `engagement/analytics/cohort_percentile.py`:

- `bucket_for_readiness(readiness, *, step=0.05)` → float (0..1, snapped to bucket grid).
- `percentile_from_distribution(readiness, distribution)` → float in [0, 100]. Returns the fraction of the cohort *below* the user's bucket. Pure function — takes a list of `{readiness_bucket, user_count}` rows.
- `confidence_from_cohort_size(n)` → `(label, half_width_fraction)` — same shape as `confidence_from_attempts` in rank.py but anchored to cohort size: < 50 = "low" (0.40), < 250 = "medium" (0.20), ≥ 250 = "high" (0.10).
- `is_cohort_sufficient(distribution, *, min_total=50)` → bool — used to gate fallback.

### S31-C — Engagement aggregator + endpoint

- `aggregate_cohort_distribution(session, exam_id, topic_id?)` — runs the SQL bucketed `GROUP BY` over `analytics_schema.readiness` (whole-exam) or `analytics_schema.mastery` (per-topic). Upserts the distribution rows.
- `load_cohort_distribution(session, exam_id, topic_id?)` — read helper. Returns a list of `{readiness_bucket, user_count}` rows.
- New endpoint `GET /analytics/cohort-distribution?examId=X[&topicId=Y]` returning `{examId, topicId, totalUsers, computedAt, buckets: [...]}`. Used by alp-learning's rank.py.
- The actual periodic *aggregation cron* is left to the staging-cutover sprint; for S31 the aggregator is **CLI-invokable** + idempotent (re-runs are safe).

### S31-D — `learning.adaptive.rank` rewrite

- New HTTP client `learning/adaptive/cohort_client.py::fetch_cohort_distribution(exam_id, topic_id?)`.
- `rank.py::project_rank` extended to:
  - Call `fetch_cohort_distribution(...)`.
  - If `is_cohort_sufficient(distribution)` is True → use `percentile_from_distribution`. `source = "cohort"`.
  - Else → fall back to the existing `_READINESS_TO_PERCENTILE` lookup. `source = "fallback"`.
  - Add `cohortSize` + `source` fields to the response so the UI surfaces the regime honestly.
  - Confidence band computed from cohort size when `source == "cohort"`, from `n_attempts` otherwise.

### S31-E — Tests

| File | Tests | Type |
|---|---|---|
| `services/engagement/tests/analytics/test_cohort_percentile.py` | 10 | Python unit (pure helpers) |
| `services/learning/tests/adaptive/test_rank_cohort.py` | 4 | Python unit (rank.py uses cohort path when sufficient; fallback otherwise) |

### S31-F — Smoke + closure

1 new smoke step (63). Closure 73. Master phase index updated.

## Out of scope

- **Aggregation cron firing** — S31 ships the CLI-invokable aggregator + endpoint; the actual scheduled run defers to the staging-cutover sprint alongside the revision.due cron + cohort-percentile job.
- **Per-topic percentile coaching surface** ("you're at the 67th percentile vs 2,400 JEE 2027 aspirants on Mechanics") — S32 ships the user-facing surface; S31 ships the back-end primitive.
- **Distribution backfill from historical readiness rows** — first deploy populates from current rows; no backfill needed.
- **Mobile parity** — S35.

## Definition of done

- Engagement migration 008 applied; `cohort_percentile_distribution` table exists.
- `cohort_percentile.py` pure functions ship + unit-tested.
- Aggregator helper + `GET /analytics/cohort-distribution` endpoint serve.
- `rank.py::project_rank` uses cohort path when sufficient + falls back honestly.
- 14 new tests green (10 Python engagement + 4 Python learning).
- `make smoke` 63/63.
- Sprint 31 closure doc + master phase index updated.
