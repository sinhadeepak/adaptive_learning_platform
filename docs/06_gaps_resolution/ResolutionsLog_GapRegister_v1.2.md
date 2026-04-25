# Resolutions Log — Gap Register v1.2

**Applies to**: [Gap Resolution Register v1.2](GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)
**Purpose**: Record decisions and closures that resolve OPEN gaps between v1.2 publication and Sprint 1 kick-off. The register `.docx` is the source of truth; this log is the interim record until the next register revision folds each resolution back into the authoritative doc.

**How to use**: when a gap is resolved, append an entry here with the decision maker, date, and pointer to the ADR / PR / runbook that holds the resolution detail. Update the companion memory (`gap_resolution_status.md`) and the ADR index in parallel.

---

## GAP-07 — Feature flag platform

- **Status**: Resolved
- **Date**: 2026-04-22
- **Decided by**: CTO + Tech Lead
- **Resolution**: Build an **in-house, tenant-aware feature flag service** owned by the **Institution** service, toggleable through the existing Super Admin panel. No managed SaaS (LaunchDarkly rejected on PII residency); no self-hosted Unleash (rejected to avoid a 12th deployable and duplicate admin UI). Env-var-only rejected because it cannot meet the < 2 min kill-switch requirement from GAP-29 Drill 3.
- **Detail**: See [ADR-0001](../adr/0001-feature-flag-platform.md) for the full decision — schema, evaluation order (per-tenant override → global default → hardcoded fallback), Redis 30s TTL + NATS `flag.changed` propagation, audit table, and sprint phasing.
- **Downstream impact**:
  - Institution service is pulled forward into **Sprint 1** as a thin flag-module shell (~8–13 SP). Full Institution feature set (cohorts, assignments, Super Admin UI) still lands in Sprint 3.
  - Unblocks GAP-16 (fallback config flags in 7 services) — Sprint 1.
  - Unblocks GAP-25 (structured flag-decision logging) — Sprint 1/2.
  - Unblocks GAP-29 Drill 3 (kill-switch < 2 min) — T-7.
  - Closes one of the seven ☐ items on the GAP-24 Sprint 1 Start Gate sheet.
- **Docs to patch on next register revision**:
  - GAP-07 row: status OPEN → RESOLVED, add pointer to ADR-0001.
  - GAP-24 Sprint 1 Start Gate table: flip GAP-07 row to ☑.
  - Critical path from GAP-23: annotate "GAP-07 complete 2026-04-22."

---

*(Future resolutions will be appended below in the same format.)*
