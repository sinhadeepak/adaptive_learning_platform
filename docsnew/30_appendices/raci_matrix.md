# RACI Matrix

**Status:** DRAFT v0.1 · 2026-05-27
**Anchored to:** Master BRD §3.2

R = Responsible · A = Accountable · C = Consulted · I = Informed

---

## Strategic Decisions

| Decision | Business Owner | Product | Tech Lead | Eng Squads | Design | Compliance |
|---|---|---|---|---|---|---|
| Platform vision & strategy | **A** | R | C | I | I | I |
| Product roadmap (phase scope) | C | **R/A** | C | I | C | I |
| Architecture (ADRs) | I | C | **R/A** | C | I | C |
| Design system (Vidya v3) | I | C | I | I | **R/A** | I |
| Data privacy / compliance | A | R | C | I | I | **R** |
| Subscription pricing | **A** | R | I | I | I | I |
| Marketplace take rate | **A** | R | I | I | I | C |
| Exam syllabus content | A | R | I | I | I | C (board compliance) |

## Operational Decisions

| Decision | Product | Tech Lead | Eng | QA | Design | DevOps | Compliance |
|---|---|---|---|---|---|---|---|
| Feature scope per sprint | **R/A** | C | C | I | C | I | I |
| API contract changes | C | **R/A** | R | C | I | I | I |
| Release approval (Phase 1 launch) | C | **A** | R | R | C | R | C |
| Hotfix vs scheduled fix | C | **R/A** | R | C | I | I | I |
| Feature flag rollout % | **R** | A | I | C | I | I | I |
| Pen-test fix prioritisation | I | A | R | C | I | C | **R** |

## Per-Surface Owners

| Surface | Tech Owner | Product Owner | Design Owner | QA Owner |
|---------|-----------|----------------|---------------|-----------|
| web-student | FE Lead | Product (B2C) | Design Lead | QA Lead |
| mobile | Mobile Lead | Product (B2C) | Design Lead | QA Lead |
| web-portal | FE Lead | Product (Marketplace) | Design Lead | QA Lead |
| web-admin | FE Lead | Product (Ops) | Design Lead | QA Lead |
| identity | BE Lead | Tech Lead | — | QA Lead |
| learning | BE Lead | Product + ML Lead | — | QA Lead |
| quiz | Go BE | Product + ML Lead | — | QA Lead |
| battle | Go BE | Product (B2C) | — | QA Lead |
| marketplace | BE Lead | Product (Marketplace) | Design Lead (booking flows) | QA Lead |
| payment | BE Lead | Finance | — | QA Lead |
| engagement | BE Lead | Product (Ops + B2C) | Design Lead (templates) | QA Lead |

## Cross-Functional Approval Gates

| Gate | Required Approvers |
|---|---|
| New ADR | Tech Lead (A) + relevant squad lead (R) + Architecture review (C) |
| Pre-Phase-1 readiness | Business Owner (A) + Product (R) + Tech Lead (R) + Compliance (C) + QA (R) |
| Launch sign-off | Business Owner (A) + Product (R) + Tech Lead (R) + QA (R) + Compliance (C) + DevOps (C) |
| Production incident response | Tech Lead (A) + On-call (R) + DevOps (R) + relevant squad (C) + Product (I) |
| Pricing change | Business Owner (A) + Product (R) + Finance (C) |
| Vendor / external contract | Finance (A) + relevant squad (R) + Legal (C) |

## Compliance Sign-Offs

| Document | Compliance | Legal | Security | Notes |
|---|---|---|---|---|
| DPDPA assessment | **R/A** | C | C | Annual |
| Pen-test report | C | I | **R/A** | Annual + per major release |
| Audit log retention policy | **R/A** | C | C | OQ-ID-02 to be finalised |
| Stripe/PCI-DSS scope | C | I | **R/A** | At launch + annual |
| KYC re-verify cadence (OQ-MK-01) | **R** | A | C | Phase 2 W1 |
| Tax (GST) handling | C | A | I | Phase 2 |
| Child safety (DPDPA §9) | **R/A** | C | I | Parental consent flow |
