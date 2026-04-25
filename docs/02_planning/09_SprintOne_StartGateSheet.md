# Sprint 1 Start Gate Sheet (GAP-24)

**Purpose**: single-page checklist that must be ☑ on every row before Sprint 1 kicks off. Owned by Tech Lead. One control loop — all items binary. No percentages, no partial credit.

**Authoritative inputs**: [Gap Resolution Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx), [Sprint Development Plan](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md), [Resolutions Log](../06_gaps_resolution/ResolutionsLog_GapRegister_v1.2.md).

**Gate opens**: Sprint 0 Day 8.
**Gate closes**: Sprint 0 Day 10, 17:00 IST. If any row is ☐ at gate-close, Sprint 1 is deferred by one day and a blocker review is held.

---

## The seven binary preconditions

| # | Item | Owner | Status | Evidence / resolution pointer | Signed-off by |
|---|---|---|---|---|---|
| 1 | GAP-07 — ADR-0001 feature flag decision | CTO | ☑ 2026-04-22 | [ADR-0001](../adr/0001-feature-flag-platform.md); [Resolutions Log](../06_gaps_resolution/ResolutionsLog_GapRegister_v1.2.md) | CTO |
| 2 | GAP-13 — User Stories v2 changelog distributed to engineering | Tech Lead | ☐ | Pointer to changelog doc + distribution evidence (email / Slack thread) | Tech Lead |
| 3 | GAP-18 — Delegation order (5 levels) signed | CTO + Tech Lead | ☐ | Pointer to signed [Delegation Order doc](../05_launch/03_DelegationOrder.md) | CTO + Tech Lead |
| 4 | GAP-23 — Dependency graph shared with engineering | Tech Lead | ☐ | Pointer to [Phase-1 Dependency Graph](10_DependencyGraph_Phase1.md) + read receipts from 10 engineers | Tech Lead |
| 5 | GAP-24 — Gate sheet complete (this document) | Tech Lead | ☐ | All six other rows ☑; this row auto-completes when the others do | Tech Lead |
| 6 | GAP-09 — Seed script **specification** complete (not implementation) | QA Lead | ☐ | Pointer to [Seed Script Specification](11_SeedScript_Specification.md) with QA Lead sign-off | QA Lead |
| 7 | All P1 gaps have named owner + due date + known resolution path | Tech Lead | ☐ | Updated Gap Register v1.2 (or [Resolutions Log](../06_gaps_resolution/ResolutionsLog_GapRegister_v1.2.md)) — every P1 row filled in | Tech Lead |

---

## Deferred from Sprint 0 (authorised by CTO 2026-04-22)

The following items were originally Sprint 0 deliverables but are deferred pending AWS access and are **NOT** gating Sprint 1 start:

- Terraform apply on staging (VPC → EKS → Aurora → Redis → OpenSearch → NATS → S3/CloudFront → Secrets Manager → WAF)
- Observability stack deployment (Prometheus / Grafana / Loki / Tempo)
- ArgoCD bootstrap in cluster
- ECR repository creation + CI push

Consequence: Sprint 1 feature services run against the local Docker Compose stack only. Staging deployment target is **Sprint 1 Week 2 Day 3** once AWS accounts are provisioned; if slippage occurs, Sprint 1 exit criteria are re-scoped (feature work still demoable via local stack).

---

## Sign-off block

| Role | Name | Signature / Slack ack | Date |
|---|---|---|---|
| Tech Lead | _______________________ | _______________________ | _________ |
| CTO | _______________________ | _______________________ | _________ |
| Head of Product | _______________________ | _______________________ | _________ |
| QA Lead | _______________________ | _______________________ | _________ |
| DevOps Lead | _______________________ | _______________________ | _________ |

**Result** (circle one): **GATE OPEN — Sprint 1 begins Day 11** / **GATE HELD — blocker review scheduled _____________**

---

## Blocker review template (used only if gate is held)

If any row is ☐ at gate-close:

1. Item, owner, reason it is not ☑.
2. Named remediation action and new due date (must be within 48h — otherwise escalate to CTO for scope or schedule change).
3. Does Sprint 1 start partially (feature work begins, one workstream held) or wholesale (all of Sprint 1 defers)?
4. Communicated to: engineering, HoP, CTO.

A held gate is not a failure — it is the system working. A quietly-open gate with ☐ rows is the failure mode to prevent.
