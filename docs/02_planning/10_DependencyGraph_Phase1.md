# Phase 1 Dependency Graph (GAP-23)

**Purpose**: single, explicit picture of which component depends on which so the team can sequence work, detect critical-path slippage, and answer "if X is late, what slips?" without rediscovering the answer under pressure.

**Scope**: Phase 1 MVP (11 services, infra, gap closures, spikes). Excludes Phase 2 and long-tail items (Institution full feature set beyond the Sprint 1 flag slice is scoped to Sprint 3).

**Owner**: Tech Lead.
**Last reviewed**: 2026-04-22.

---

## Legend

- **Solid arrow** `A → B` means "B needs A in place before B can be built / deployed / validated."
- **Dashed arrow** `A ⇢ B` means "B's tests or integration depend on A, but B's code can progress in parallel."
- **[SP]** = Sprint the node is scheduled into.
- **★** = Phase 1 go-live gate item.

---

## Infrastructure layer (deferred AWS deploy — local dev stack covers Sprints 1–2)

```
                        ┌──────────────────┐
                        │ AWS accounts +   │
                        │ SSO + quotas     │  (Sprint 0 → Sprint 1 Wk2)
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Terraform state  │  (bootstrap landed 88ddc73)
                        │ backend + OIDC   │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ VPC              │  [S0/S1 Wk2]
                        └────────┬─────────┘
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
       ┌─────────┐         ┌──────────┐        ┌─────────────┐
       │ EKS 1.29│         │ Aurora   │        │ NATS JS     │
       │         │         │ PG 15    │        │ (3-node)    │
       └────┬────┘         └────┬─────┘        └──────┬──────┘
            │                   │                     │
            ├──► Redis 7 cluster (in-VPC)             │
            ├──► OpenSearch 2.x                       │
            └──► S3 + CloudFront + WAF                │
                                                      │
                        ┌──────────────────┐          │
                        │ Secrets Manager  │──────────┘
                        └─────────┬────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ ArgoCD + Helm    │  [S1 Wk2]
                        │ (auto-sync OFF)  │
                        └─────────┬────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ Observability    │  [S1 Wk2]
                        │ LGTM stack       │
                        └──────────────────┘
```

**Critical path**: AWS accounts → Terraform state → VPC → EKS → ArgoCD → services. Four serialisation points. Every day lost on AWS accounts slips every downstream item one day.

**Parallelisable within infra**: Aurora, Redis, OpenSearch, NATS, S3/CloudFront all branch from VPC independently and can be applied concurrently once VPC is green.

---

## Service layer

```
                     ┌───────────────┐
                     │ Auth [S1]     │◄──── JWT issuer + refresh
                     └───────┬───────┘      (upstream for everything)
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐      ┌──────────────┐    ┌──────────────┐
│ User Profile │      │ Institution  │    │ Catalog [S1] │
│   [S1]       │      │ (flag slice) │    │ Exam→Subj→Tpc│
│              │      │   [S1]       │    │              │
└──────┬───────┘      └──────┬───────┘    └──────┬───────┘
       │                     │                   │
       │                     │ flags read by     │
       │                     │ ALL services      ▼
       │                     │            ┌──────────────┐
       │                     │            │ Search [S1]  │
       │                     │            │ EN → +Hindi  │
       │                     │            │ (S2)         │
       │                     │            └──────────────┘
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Quiz (Go)    │◄─────│ Notification │
│   [S2] ★     │      │    [S2]      │
└──────┬───────┘      └──────────────┘
       │ gRPC
       ▼
┌──────────────┐
│ Adaptive     │  ─── depends on SPIKE-01 outcome
│ Engine [S2]★ │
└──────┬───────┘
       │
       ▼
┌──────────────┐           ┌──────────────┐
│ Analytics    │           │ Content [S2] │
│   [S2] ★     │           │ authoring    │
└──────────────┘           └──────┬───────┘
                                  │  content.published (NATS)
                                  ▼
                           (fans out to Search reindex,
                            Catalog mapping, Quiz pool)

┌──────────────┐           ┌──────────────┐
│ Payment [S3] │           │ Institution  │
│ Stripe SAQ A │           │ full [S3]    │
└──────────────┘           └──────────────┘
```

**Critical path (features)**:
`Auth → User Profile → Catalog → Search → Quiz → Adaptive Engine → Analytics`

Quiz and Adaptive Engine are the star of Phase 1 (★ go-live gate items). If Auth slips, every downstream story slips.

**Flag service (Institution thin slice, Sprint 1)** is a fan-in dependency: every service reads flags, so Institution must ship the `/flags/:name` endpoint + NATS publisher + client SDKs by Sprint 1 Day 5 or GAP-16 PRs stall across all 7 affected services.

---

## Spike dependencies

| Spike | Gap | Owner | Blocks |
|---|---|---|---|
| SPIKE-01 IRT cold-start vs 3PL | GAP-02 | ML Engineer | Adaptive Engine Sprint 2 design |
| SPIKE-07 NATS partition + DLQ | GAP-06 | DevOps Lead | NATS config commit; Sprint 2 event pipeline |
| SPIKE-02 OpenSearch Hindi analyzer | GAP-04 | BE Lead Python (Search) | Hindi search Sprint 2 |
| SPIKE-05 Mobile security (JWT storage) | — | Mobile Lead | Auth token storage pattern Sprint 1 |
| SPIKE-16 Flutter web/mobile parity | ADR-0002 | Mobile Leads | Phase 2 web-from-Flutter decision |

Spikes SPIKE-01, SPIKE-07, SPIKE-02 must close by end of Sprint 1. If any fails acceptance, contingency budget of 3 days applied per the Sprint Plan's contingency table.

---

## Gap dependencies feeding Sprint 1 start gate (GAP-24)

```
  GAP-07 (flag platform) ──► GAP-16 (fallback flags in 7 services)
         │                           │
         └─ Resolved 2026-04-22      └─ Sprint 1 deliverable
                                           │
                                           ▼
                                   GAP-25 (structlog flag.decision)

  GAP-13 (User Stories v2 changelog) ──► Sprint 1 backlog DoR
  GAP-18 (delegation order)          ──► on-call rotation readiness
  GAP-23 (this graph)                ──► Sprint 1 planning clarity
  GAP-24 (gate sheet)                ──► binary go/no-go
  GAP-09 (seed script spec)          ──► nightly CI Sprint 1 Wk 2
```

---

## Critical path summary

The single longest chain to launch (Week 10):

```
AWS accounts (S0/S1)
  → Terraform apply (S1 Wk2)
  → EKS + ArgoCD up (S1 Wk2)
  → Auth deployed to staging (S1 end)
  → Profile + Catalog + Search deployed (S1 end)
  → Quiz + Adaptive + Analytics deployed (S2 end)
  → Payment + Institution deployed (S3 end)
  → Drills 1+2 @ T-14 (S3 end)
  → Drills 3+4 @ T-7 (S4 Wk1)
  → Soft launch (S4 Wk1 Day 5)
  → Full launch (S4 Wk2)
```

**Slack**: ~2 days in Sprint 3 (load test and failover test are parallel streams). **No slack in Sprint 1 or Sprint 4.**

---

## Distribution record (GAP-23 gate item)

| Role | Name | Ack date | Comment |
|---|---|---|---|
| Backend Lead (Python) | _______________________ | _________ | |
| Backend Lead (Python) | _______________________ | _________ | |
| Backend Lead (Python) | _______________________ | _________ | |
| Backend Lead (Go) | _______________________ | _________ | |
| Frontend Lead | _______________________ | _________ | |
| Frontend Lead | _______________________ | _________ | |
| Mobile Lead (iOS) | _______________________ | _________ | |
| Mobile Lead (Android) | _______________________ | _________ | |
| DevOps Lead | _______________________ | _________ | |
| ML Engineer | _______________________ | _________ | |

Gate row 4 (GAP-23) signs off only when all 10 engineers have acknowledged.
