# Sprint 15 Closure — P3-S0 foundations (alp-marketplace + 6 gating ADRs)

**Sprint window:** 2026-04-28 (single working session, opens Phase 3)
**Plan:** [docs/02_planning/38_Sprint15_Plan.md](38_Sprint15_Plan.md)

## Scope delivered

### S15-A — alp-marketplace service skeleton — DONE

Six new files at `services/marketplace/`:

- `pyproject.toml` — Python 3.11, FastAPI, alp-flags + alp-telemetry; pytest with `integration` marker registered (matches the engagement pattern from Sprint 14).
- `src/marketplace/__init__.py`, `src/marketplace/config.py` (pydantic-settings, `MARKETPLACE_` env prefix), `src/marketplace/main.py` (`/health`, `/ready`, empty lifespan).
- `Dockerfile` — copy of the engagement template; entrypoint `uvicorn marketplace.main:app`.
- `README.md` — slot rationale + Phase 3 timeline of what lands here (P3-S1 tutor profiles, P3-S2 bookings + Stripe Connect, P3-S3 creator marketplace).
- `tests/test_health.py` — 2 tests, both green via `uv run pytest`.

### S15-B — `marketplace_schema` initial migration — DONE

- `alembic.ini` (single-tree, not per-module like learning).
- `alembic/env.py` using the post-Sprint-14 pattern: `engine.begin()`, `transaction_per_migration=True`, schema pre-create inside `do_run_migrations`, `version_table_schema="marketplace_schema"`.
- `alembic/versions/001_create_marketplace_schema.py` — runs `CREATE SCHEMA IF NOT EXISTS marketplace_schema`. No tables yet (P3-S1+ adds `tutor_profiles`, `bookings`, etc.).
- **Verified**: `make migrate svc=marketplace` runs; `marketplace_schema.alembic_version` = 001.

### S15-C — Compose + Makefile + nginx wiring — DONE

- `Makefile` `PY_SERVICES := identity payment learning engagement marketplace`.
- `infrastructure/docker/docker-compose.yml`:
  - Added `marketplace` to `POSTGRES_MULTIPLE_DATABASES`.
  - New `marketplace` service entry on port `38110:8000` with `MARKETPLACE_*` env vars and Postgres + NATS dependencies.
- `apps/web-{student,portal,admin}/nginx.conf` — added `/api/v1/marketplace` proxy block in all three. P3-S1 frontend work touches no nginx.

### S15-D — Six gating ADRs (PROPOSED) — DONE

| ADR | Title | Recommendation |
|---|---|---|
| [0006](../adr/0006-kyc-vendor.md) | KYC vendor for tutor + creator onboarding | **Stripe Identity** (integrated with Connect) |
| [0007](../adr/0007-stripe-connect-rollout.md) | Stripe Connect rollout shape | **Express + weekly cadence + 15% commission** with override hatch |
| [0008](../adr/0008-marketplace-pricing-model.md) | Marketplace pricing model | **Creator-set within platform-imposed bands** (₹100–5,000/hr tutor; ₹49–4,999 course) |
| [0009](../adr/0009-tutor-session-realtime-signalling.md) | Tutor session real-time signalling + media | **NATS for state + Daily.co for A/V media** |
| [0010](../adr/0010-predictive-analytics-model-serving.md) | Predictive analytics model serving | **Pure Python in `engagement.analytics.predictive`** — no MLflow/Sagemaker for P3 |
| [0011](../adr/0011-recommendation-algorithm.md) | Recommendation algorithm | **Content-based via OpenAI embeddings** with hooks for collaborative filtering in P3-S6+ |

All six land as **status: proposed**. Final acceptance happens at the start of P3-S1 after CTO review.

### S15-E — Smoke extended + verified — DONE

- `scripts/smoke_test.sh` — added `marketplace /health 200` assertion (step 5). Total: **17 ordered assertions**.
- Verified: `make migrate svc=marketplace` → `docker compose build marketplace` → `docker compose up -d marketplace`. `make smoke` ran 17/17 green on the rebuilt stack.

### S15-F — Closure + master index — DONE

- This file (`39_Sprint15_Closure.md`).
- Master phase index updated to add Sprint 15 row + flip P3-S0 status.

## Test totals

| Surface | Result | Status |
|---|---|---|
| alp-marketplace `pytest tests/` | 2 / 2 | ✅ |
| `make smoke` | 17 / 17 | ✅ |
| All other surfaces | unchanged from Sprint 14 close | ✅ |

## Stack inventory at Sprint 15 close

6 backend services live (the full ADR-0005 ceiling):

| Service | Port | DB | Status |
|---|---|---|---|
| alp-identity | 38001 | identity | healthy |
| alp-payment | 38007 | payment | healthy |
| alp-learning | 38101 | learning | healthy |
| alp-quiz | 38011 | quiz | healthy |
| alp-engagement | 38100 | engagement | healthy |
| **alp-marketplace** | **38110** | **marketplace** | **healthy (P3-S0 skeleton)** |

## What surprised us this sprint

- **Marketplace deploy briefly disrupted engagement's connection pool.** First `make smoke` after marketplace came up failed steps 15 + 17 (analytics consumer + readiness endpoint) with "connection is closed" errors in `engagement.analytics.db`. Re-running 5s later passed all 17. Hypothesis: Docker network reshuffle on the new container's join. Not a structural bug; the engagement lifespan's best-effort `_try` handler logged + continued, and the next message was processed cleanly.
  - **Action item**: consider adding a connection-pool warm-up step to `make smoke`, or having `engagement.analytics.db` retry once on `connection is closed`.
- **Service-ceiling discipline working as intended.** Adding marketplace required *zero* new ADRs about service architecture (ADR-0005 already reserved the slot). Authoring 6 *domain* ADRs (0006–0011) was the bulk of the work, exactly as the Phase 3 plan budgeted.

## Carry-overs to next phase

| Item | Why deferred | Owner |
|---|---|---|
| CTO review + acceptance of ADRs 0006–0011 | They ship as `proposed`; acceptance needs the human in the loop | Before P3-S1 kickoff |
| Tutor profile schema + KYC integration | Out of P3-S0 scope by plan | P3-S1 (Sprint 16) |
| Daily.co account + API keys | Out of P3-S0 scope by plan | P3-S1 prep |
| `pgvector` extension on Postgres | ADR-0011 deferred this; JSON-in-Postgres for P3-S5 | P3-S6 enhancement |

## Phase 3 P3-S0 status

**P3-S0 closed** at Sprint 15. Phase 3 P3-S1 (live tutor marketplace, supply side) is unblocked pending ADR acceptance.
