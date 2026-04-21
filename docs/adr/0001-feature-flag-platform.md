# ADR-0001: Feature flag platform (GAP-07)

- **Status**: proposed (awaiting CTO decision)
- **Date**: 2026-04-21
- **Deciders**: CTO, Tech Lead
- **Related**: [GAP-07](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx), [GAP-25](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)

## Context

Sprint 1 needs fallback config flags in all 7 services (GAP-16) and structured startup logging for flag state (GAP-25). The team has not yet decided whether to adopt a managed flag service or implement fallback flags via environment variables + a config-map pattern. This decision blocks Sprint 1 config PRs.

## Decision

**Placeholder — CTO to decide before Sprint 1 kick-off.** Options below.

## Alternatives considered

- **Option A — LaunchDarkly**: managed SaaS, mature SDKs, audit trail, targeting. Cost ~$X/MAU; data residency concerns for Indian student PII.
- **Option B — Unleash (self-hosted)**: OSS, self-hosted in `ap-south-1`, solves residency. Operational overhead (we run it).
- **Option C — Reject managed flags**: use env-var + config-map only; simpler, but no runtime targeting, weaker audit.

## Consequences

To be written once a decision is made. Must address:
- GAP-16 flag-set per service
- GAP-25 structlog field `flag.decision` cardinality (5× log ingest at 1000 req/s — budget in Infrastructure Design cost model)
- Kill-switch drill (Drill 3 at T-7, per GAP-29)

## Follow-up work

- [ ] Sprint 0 Week 1 Day 3 standup: surface decision deadline
- [ ] Post-decision: open PRs in 7 services for GAP-16
- [ ] Post-decision: add `flag.decision` field to structlog middleware (GAP-25)

## Review

Must be resolved before Sprint 1 start gate (GAP-24).
