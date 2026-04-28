# Sprint 15 — P3-S0 foundations (alp-marketplace shell + gating ADRs)

**Sprint window:** 2026-04-28 (single working session, opens Phase 3)
**Theme:** Stand up the 6th and final service slot reserved by ADR-0005, and draft the gating ADRs the Phase 3 sprint plan calls for in P3-S0 weeks 1–3. **No tutor onboarding or KYC integration in this sprint** — that's P3-S1. This sprint is foundations only.

## Why this sprint

Phase 2 closed at Sprint 14. Phase 3 P3-S0 (per [`21_Phase3_SprintDevelopmentPlan.md`](21_Phase3_SprintDevelopmentPlan.md)) needs:

1. **alp-marketplace service skeleton** — the 6th service ADR-0005 reserved for tutor + creator marketplace + revenue-share. Today there is no such directory. Without it, every Phase 3 PR has to reinvent the boilerplate.
2. **Gating ADRs** — six architectural decisions that must be made before P3-S1 can start coding:
   - KYC vendor for tutors
   - Stripe Connect rollout shape (Express vs. Custom; payout cadence; commission %)
   - Marketplace pricing model (creator-set vs. platform-tiered)
   - Tutor session real-time signalling (NATS extension vs. dedicated WebRTC service)
   - Predictive analytics model serving (pure Python vs. MLOps stack)
   - Recommendation algorithm (collab filtering vs. content-based vs. hybrid)
3. **Operational integration** — docker-compose entry, nginx proxy paths, `make smoke` extension to cover marketplace `/health`. Without these the service exists but isn't reachable from the rest of the stack.

This sprint deliberately *does not* build any tutor functionality. P3-S1 will fill in tutor profiles, KYC, calendar. Today we only ship the empty container.

## Backlog

### S15-A — alp-marketplace service skeleton

Mirror the existing 4 Python service skeletons (alp-identity / alp-payment / alp-learning / alp-engagement). Same FastAPI + uv + alembic + Dockerfile pattern.

- **A-1** `services/marketplace/` directory with `pyproject.toml` (deps: FastAPI, Pydantic, SQLAlchemy async, asyncpg, alembic, nats-py, alp_flags, alp_telemetry).
- **A-2** `src/marketplace/main.py` — FastAPI app with `/health` and `/ready`. Lifespan stays empty for now (no NATS subscribers, no DB pool init beyond what alembic needs).
- **A-3** `src/marketplace/config.py` — pydantic-settings with `MARKETPLACE_` prefix; `database_url` defaults to `postgresql+asyncpg://postgres:postgres@localhost:35432/marketplace`.
- **A-4** `Dockerfile` — copy of the engagement template, `CMD uvicorn marketplace.main:app`.
- **A-5** `README.md` documenting the slot per ADR-0005, what lands here in P3-S1+.
- **A-6** `tests/test_health.py` — TestClient asserts `/health` returns `{"status":"ok","service":"marketplace"}`. One test.

### S15-B — Initial Postgres schema migration

The marketplace schema starts empty in this sprint — no tables. The migration just creates the schema namespace + alembic_version table so future P3-S1 migrations have somewhere to land.

- **B-1** `alembic.ini` (single-file, not multi-module like learning — marketplace is one bounded domain).
- **B-2** `alembic/env.py` matching the post-consolidation pattern (`engine.begin()`, `transaction_per_migration=True`, `version_table_schema="marketplace_schema"`, schema pre-create).
- **B-3** `alembic/versions/001_create_marketplace_schema.py` — runs `CREATE SCHEMA IF NOT EXISTS marketplace_schema`. No tables yet.
- **B-4** Verified: `make migrate svc=marketplace` runs and `marketplace_schema.alembic_version` shows revision `001`.

### S15-C — Compose + Makefile wiring

- **C-1** `infrastructure/docker/docker-compose.yml` — add `marketplace` service entry (mirror engagement's shape — Postgres dep, NATS dep, `MARKETPLACE_*` env vars, port `38110:8000`). Add `marketplace` to `POSTGRES_MULTIPLE_DATABASES`.
- **C-2** `Makefile` `PY_SERVICES := identity payment learning engagement marketplace`.
- **C-3** `apps/web-student/nginx.conf`, `apps/web-portal/nginx.conf`, `apps/web-admin/nginx.conf` — add `/api/v1/marketplace` proxy block pointing at `http://marketplace:8000`. Even though no marketplace routes exist yet, the proxy must be ready so P3-S1 frontend work doesn't have to touch nginx.

### S15-D — Six gating ADRs (PROPOSED status)

Each ADR captures the decision space, the recommendation, and the trigger for revisiting. All land as **status: proposed** — final acceptance happens after CTO review at the start of P3-S1.

- **D-1** `docs/adr/0006-kyc-vendor.md` — Persona vs. Onfido vs. Stripe Identity vs. in-house. Recommendation: Stripe Identity (already paying for Stripe; same data plane).
- **D-2** `docs/adr/0007-stripe-connect-rollout.md` — Express vs. Custom; payout cadence; platform commission %. Recommendation: Express (faster onboarding, tutors keep their own dashboard); weekly payout; 15% commission tier-tested.
- **D-3** `docs/adr/0008-marketplace-pricing-model.md` — creator-set price vs. platform-tiered. Recommendation: creator-set with platform-imposed bands.
- **D-4** `docs/adr/0009-tutor-session-realtime-signalling.md` — extend existing NATS infra vs. dedicated WebRTC signalling. Recommendation: extend NATS for state machine + use a third-party WebRTC media (Daily.co or Twilio Video) for the actual A/V — don't build SFU.
- **D-5** `docs/adr/0010-predictive-analytics-model-serving.md` — pure Python in alp-engagement vs. MLOps stack. Recommendation: pure Python module inside `engagement.analytics.predictive` for Phase 3; revisit at scale threshold.
- **D-6** `docs/adr/0011-recommendation-algorithm.md` — collab filtering vs. content-based via embeddings vs. hybrid. Recommendation: content-based via OpenAI embeddings of topics + question text (low cold-start cost; reuses existing IRT signals).

Each ADR follows the template at `docs/adr/0000-template.md`: Context → Decision → Alternatives → Consequences → Review.

### S15-E — Smoke + verify

- **E-1** Extend `scripts/smoke_test.sh` with one assertion: `marketplace /health 200`. Total: 17 steps.
- **E-2** Run `make migrate svc=marketplace`, `docker compose build marketplace`, `docker compose up -d marketplace`. Verify `/health` returns 200.
- **E-3** Run `make smoke`, expect 17/17 green.

### S15-F — Sprint 15 closure + master index

- **F-1** `docs/02_planning/39_Sprint15_Closure.md` — what shipped.
- **F-2** Update `00_MasterPhaseIndex.md`:
  - Add Sprint 15 row to the closures table.
  - Mark P3-S0 status row.

## Out of scope

- **Tutor profile schema, KYC integration, calendar, Stripe Connect onboarding** — all P3-S1.
- **Creator onboarding, course authoring v2** — P3-S3.
- **Final acceptance of the gating ADRs** — they ship as `status: proposed`. CTO review happens before P3-S1 kickoff.
- **Web app pages for marketplace** — no marketplace routes yet, so no UI.
- **Mobile marketplace flows** — same.

## Definition of done

- `services/marketplace/` exists with skeleton + `tests/test_health.py` passing.
- `marketplace_schema` exists in the `marketplace` Postgres DB; `alembic_version` shows revision 001.
- `docker compose up marketplace` succeeds; `curl http://localhost:38110/health` returns 200.
- All three web app nginx configs have a `/api/v1/marketplace` proxy block.
- 6 ADRs (0006–0011) exist as `status: proposed` with full Context/Decision/Alternatives/Consequences sections.
- `make smoke` passes 17/17.
- Sprint 15 closure doc + master phase index updated.
