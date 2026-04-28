# ADR-0010: Predictive analytics model serving

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead
- **Related**: P3-S0 gating ADR #5, [ADR-0005](0005-service-consolidation.md)

## Context

Phase 3 P3-S5 lands predictive analytics:

1. **Drop-out forecasting** — predict per-student probability of churn within next 14 days.
2. **Intervention recommendations** — for high-risk students, suggest the highest-leverage intervention (re-engagement notification, free tutor session, simpler topic-priority recalibration).
3. **Recommendation engine inputs** — feed the existing IRT + EWA signals into the recommendation system (ADR-0011).

The question is **where does model training and serving live?**

Three options span the build/buy/MLOps spectrum:

- **Pure Python in `alp-engagement.analytics`** — a new sub-module `engagement.analytics.predictive` with model training scripts (cron-driven), model artifacts on S3, inference at request time using whatever Python ML stack we want (sklearn, lightgbm, embeddings via OpenAI).
- **Dedicated MLOps stack** — MLflow for tracking, model registry, automated re-training, A/B serving. Sagemaker / Vertex AI as the serving layer. Significant new infrastructure.
- **Buy a "drop-out prediction" SaaS** — there are ed-tech-specific vendors (Renaissance, BrightBytes). Black box; integration cost; vendor lock-in.

Phase 1 / 2 already established that:

- **Mastery model** = EWA, α = 0.4, no decay (sealed constant per CLAUDE.md). Pure Python stdlib. Lives in `engagement.analytics.mastery`.
- **Readiness** = mean EWA. Pure Python.
- **IRT** = 3PL with EAP estimator + MFI selector. Pure Python stdlib (no numpy yet per CLAUDE.md).

There is precedent for "ML in pure Python within an existing service". Predictive analytics extends that.

## Decision

**Pure Python module inside `alp-engagement.analytics.predictive`.** Specifically:

- New sub-package `engagement.analytics.predictive`.
- Models = scikit-learn or lightgbm (both pure-Python wrappers around C; pip-installable; no GPU). For embeddings, OpenAI's `text-embedding-3-small` via the existing `openai` dep already in `alp-learning`.
- **Training**: cron job inside `alp-engagement` (extends existing backfill machinery). Runs nightly, loads features from `analytics_schema` + `quiz_schema` (read-only), trains, writes model artifact + metrics to a `predictive_models` table. No Sagemaker. No MLflow.
- **Serving**: in-process inference. The drop-out probability for a student is computed when the engagement service handles `quiz.session.completed` (already a hot path) — adds maybe 5ms / inference for tree-model evaluation.
- **Model registry**: a Postgres table `analytics_schema.predictive_models` with one row per trained version (version, trained_at, training_window, feature_list, metrics_json, artifact_s3_uri). At serve time, load the most recent `is_active=true` row.
- **Rollback**: flip `is_active=false` via admin endpoint (defer the admin UI; SQL update suffices for P3-S5).

## Alternatives considered

- **MLflow + Sagemaker / Vertex AI MLOps stack**. Considered. *Rejected* for Phase 3 because:
  - The platform has *one* engineer. MLflow + Sagemaker is tooling for ML teams of 5+.
  - At P3 projected scale (max ~50K active students by end of P3), the inference volume doesn't justify dedicated GPU/serving infrastructure. lightgbm in-process handles thousands of predictions/sec.
  - Re-training cadence (nightly) doesn't need an orchestrator; cron is fine.
  - **Trigger to revisit**: > 100K active students or model count > 5 distinct prediction tasks.
- **SaaS "ed-tech drop-out predictor"** (Renaissance, BrightBytes). *Rejected* — black-box predictions don't compose with the platform's existing IRT/EWA signals. We'd be lighting money on fire to lose explanatory power.
- **Dedicated `alp-predictive` service**. *Rejected* per [ADR-0005](0005-service-consolidation.md) service ceiling = 6. New service needs new ADR; this isn't one.
- **Python in `alp-learning` instead of `alp-engagement`**. *Rejected* — predictive features are derived from analytics signals (mastery, readiness, streaks, processed_sessions). Closer to the data.
- **Real-time streaming inference via Kafka / Flink**. *Rejected* — overkill for a problem where re-prediction every quiz session is enough. NATS handles the trigger; in-process inference handles the compute.

## Consequences

### Positive

- **Zero new infrastructure** — extends what's already running. No Sagemaker bill, no MLflow ops burden.
- **Model artifacts portable** — sklearn / lightgbm pickles are 100s of KB; storing on S3 (already used for static assets) is essentially free.
- **Feature engineering is in the same Python module as the data** — refactor across `engagement.analytics.mastery`, `streaks`, `readiness`, `predictive` is one PR not two services.
- **Inference latency in-process** — one Postgres connection, one cached model artifact, ~5ms per call.

### Negative

- **No automatic A/B model comparison** — built-in MLflow gives this for free. We'll build a minimal A/B harness in Python if/when needed.
- **Re-training is single-host** — if the engagement pod is small (1 vCPU), nightly training of a model on 100K students might take 30+ min. At scale, this needs a dedicated worker pod or moves to a batch job. **Trigger to revisit**: training time > 1 hour.
- **Model versioning is manual** — `predictive_models` table with admin endpoint, but no automatic experiment tracking. Acceptable for our 1–3 model count.
- **Single point of failure for predictions** — engagement pod down = no drop-out predictions. Mitigated by graceful fallback (treat all students as medium risk) which is the existing behavior pre-prediction.

### Follow-up work

- [ ] `analytics_schema.predictive_models` table (P3-S5 migration).
- [ ] `engagement.analytics.predictive` module with `train.py`, `serve.py`, `features.py`.
- [ ] Cron job spec (extend the existing `analytics-backfill` job in CI/cluster).
- [ ] Admin endpoint `POST /analytics/predictive/{model_name}/activate/{version}` for rollout.
- [ ] Model performance dashboard (Grafana — feature drift, prediction distribution).
- [ ] Decision threshold (which probability triggers an intervention) — tunable flag.

## Review

Revisit by **end of P3-S6** or earlier if any of:

- Active student count > 100K (in-process serving may strain).
- Model training time > 1 hour (move to dedicated worker).
- More than 3 distinct predictive tasks in active use (signals MLflow-or-similar value).
- Prediction call volume > 1,000 RPS sustained (need a serving cache or move to dedicated infra).
- A team scale-up — third+ engineer joins (MLflow + experiment tracking starts paying for itself).
