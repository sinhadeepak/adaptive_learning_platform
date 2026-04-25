# ADR-0001: Feature flag platform (GAP-07)

- **Status**: Accepted
- **Date**: 2026-04-22
- **Deciders**: CTO, Tech Lead
- **Supersedes**: —
- **Related**: [GAP-07](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx), [GAP-16](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx), [GAP-25](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx), [GAP-29](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) (Drill 3 kill-switch)

## Context

Sprint 1 needs fallback config flags in all 7 affected services (GAP-16), structured startup logging for flag state (GAP-25), and a kill-switch drill capability under 2 minutes at T-7 (GAP-29 Drill 3). The ADR originally listed three options — LaunchDarkly (managed SaaS), Unleash (self-hosted OSS), or env-var only. None were a clean fit: LaunchDarkly raised PII residency concerns for Indian student data; Unleash added a 12th deployable with its own UI that duplicates admin functionality the platform already needs; env-var only cannot satisfy the < 2 min runtime kill-switch requirement.

A fourth option emerged: build an **in-house flag service exposed through the existing Super Admin panel**. This keeps flag state inside Aurora `ap-south-1` (residency solved), aligns toggle authority with the Admin role already contemplated by [GAP-18](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) delegation order, and avoids running a parallel admin UI.

## Decision

Adopt an **in-house, tenant-aware feature flag service** owned by the **Institution** service, toggleable from the Super Admin panel.

### Key properties

1. **Targeting model**: tenant-based. Every flag has a global default; per-tenant overrides supported. Per-user targeting is explicitly out of scope for Phase 1 (revisit in Phase 2 if A/B experimentation needs it).
2. **Ownership**: the `feature_flags` module lives inside the **Institution** service. No 12th deployable.
3. **Storage**: Aurora PostgreSQL, Institution schema. Three tables — definition, per-tenant override, and append-only audit.
4. **Propagation**: clients read flag state from **Redis with a 30-second TTL**. On toggle, the Institution service publishes a `flag.changed` event on NATS; each service's flag SDK invalidates its local cache on receipt. Redis TTL is the safety net if the NATS event is missed.
5. **Fallback**: every client caches a last-known-good value locally (in-process) with a 60-second TTL beyond the Redis TTL, and falls back to a **hardcoded safe default** (compiled-in constant) if Redis is unreachable at first boot.
6. **Audit**: every write produces a row in `feature_flag_audit` capturing `flag_name`, `tenant_id` (nullable for globals), `old_value`, `new_value`, `admin_user_id`, `ts`, `reason`.

### Evaluation order (client SDK)

```
per-tenant override  →  global default  →  hardcoded fallback constant
```

The hardcoded fallback is the only layer that survives a total platform outage; it must be chosen conservatively (typically `false` for new features, `true` for existing behaviour we might want to disable).

### Schema sketch

```sql
-- Institution schema
CREATE TABLE feature_flags (
    id            UUID PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,        -- e.g. 'irt_model_enabled'
    description   TEXT NOT NULL,
    default_value BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feature_flag_overrides (
    flag_id    UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    tenant_id  UUID NOT NULL,
    value      BOOLEAN NOT NULL,
    set_by     UUID NOT NULL,                   -- admin user id
    set_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (flag_id, tenant_id)
);

CREATE TABLE feature_flag_audit (
    id             BIGSERIAL PRIMARY KEY,
    flag_id        UUID NOT NULL,
    flag_name      TEXT NOT NULL,               -- denormalized for forensics
    tenant_id      UUID,                        -- NULL for global default changes
    old_value      BOOLEAN,
    new_value      BOOLEAN NOT NULL,
    admin_user_id  UUID NOT NULL,
    reason         TEXT,
    ts             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Sprint phasing

| Sprint | Scope |
|---|---|
| Sprint 1 (Weeks 3–4) | **Thin slice**: Institution service shell stood up; `feature_flags` module + schema + 3 REST endpoints (`GET /flags/:name`, `PUT /flags/:name`, `PUT /flags/:name/tenants/:id`); NATS publisher; Python + Go client SDKs; audit table writes. **No admin UI yet** — toggles via authenticated CLI by Tech Lead or direct SQL + audit row. Unblocks GAP-16 fallback flags in 7 services. |
| Sprint 2 (Weeks 5–6) | Extend SDK with OTEL span emission (GAP-25 `flag.decision` field). Wire remaining services. |
| Sprint 3 (Weeks 7–8) | Super Admin panel UI lands with rest of Institution service — flag list, toggle widget, tenant override picker, audit log view. |
| Sprint 4 (Weeks 9–10) | Drill 3 at T-7: validate kill-switch toggle → all pods observe change in < 2 min. |

**Sprint 1 cost**: ~8–13 SP added to Sprint 1 capacity. Tech Lead to confirm capacity at Sprint 1 planning.

## Consequences

### Positive

- PII residency solved — all flag data in Aurora `ap-south-1`.
- No external vendor bill, no vendor lock-in, no new SaaS contract.
- Admin toggle authority aligns with GAP-18 delegation order (Super Admin role).
- Audit trail is native to the platform and usable in post-incident reviews (GAP-30 PIR template).
- Cross-service propagation path (NATS) is already a dependency; no new infrastructure.

### Negative

- Institution service is pulled forward into Sprint 1 as a shell, expanding Sprint 1 scope by ~10 SP. Mitigated by strict slice — no UI, no cohorts, no assignments.
- We own the reliability of the flag service. If Institution + Redis + NATS all fail simultaneously, services fall back to the hardcoded constant — acceptable for kill-switches but means no runtime control during total outage.
- No per-user targeting in Phase 1. If experimentation needs surface in Phase 1 closed beta, they must wait or be hand-rolled.
- GAP-25 structlog cardinality budget (`flag.decision` field at 1000 req/s) still applies — must be validated in Infrastructure Design cost model.

### Neutral

- Flag definitions (names, descriptions, defaults) seeded via migration in each service that owns the flag domain — e.g. Quiz ships the migration adding `irt_model_enabled`, Notification ships `push_channel_enabled` / `sms_channel_enabled`.

## Kill-switch drill budget (Drill 3, T-7)

| Stage | Target |
|---|---|
| Super Admin panel toggle → DB commit + NATS publish | < 1s |
| NATS fan-out → client SDK cache invalidation | < 2s |
| Next read by in-flight request uses new value | < 30s (Redis TTL worst case if NATS missed) |
| **Total observable latency end-to-end** | **< 2 min** (well inside GAP-29 Drill 3 target) |

## Follow-up work

- [x] CTO decision recorded (2026-04-22)
- [ ] Update [07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md](../02_planning/07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md): add "Institution service flag-module thin slice" to Sprint 1 scope (+8–13 SP)
- [ ] Open Sprint 1 stories: (a) Institution shell + `feature_flags` tables, (b) Python flag SDK, (c) Go flag SDK, (d) NATS subject `flag.changed` + subscriber wiring
- [ ] Open Sprint 3 story: Super Admin panel UI for flag management
- [ ] GAP-16: one PR per service wiring each flag through the SDK (7 services)
- [ ] GAP-25: structlog middleware emits `flag.decision` span attribute — measure cardinality in staging before Sprint 2 exit
- [ ] Update Gap Register v1.2: mark GAP-07 **Resolved** with pointer to this ADR
- [ ] Runbook: add flag kill-switch procedure referencing the Super Admin panel path
- [ ] Drill 3 test plan: pre-scripted toggle + SLO assertion

## Review

Accepted 2026-04-22 by CTO and Tech Lead. Re-review trigger: if per-user targeting becomes a Phase 1 requirement, or if flag-service outages in staging breach the 99.5% availability target during Sprints 2–4.
