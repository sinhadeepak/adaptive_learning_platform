# ADR-0005: Backend service consolidation — 12 → 5 (+1 reserved for Phase 3)

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead
- **Supersedes**: —
- **Related**: [ADR-0001](0001-feature-flag-platform.md) (Institution owns flags — preserved), [ADR-0004](0004-checkout-platform.md) (Payment domain shape — preserved), [Phase 3 plan](../02_planning/21_Phase3_SprintDevelopmentPlan.md)

## Context

The platform stands at **12 backend services** today: `auth`, `user-profile`, `catalog`, `content`, `doubts`, `payment`, `institution`, `notification`, `analytics`, `search`, `adaptive-engine` (Python · FastAPI), and `quiz` (Go). Phase 3 commits a Tutor service in P3-S0, and the Phase 3 plan implies a Predictive analytics service shortly after — taking us to 14+ deployments by 2027.

Three concrete pains motivated this review:

1. **Operational overhead** scales linearly with the count: 12 Dockerfiles, 12 CI lanes, 12 Helm releases, 12 sets of dashboards, 12 secret rotations.
2. **Under-utilisation** is real: `doubts` (636 LOC, 5 endpoints, no events), `search` (713 LOC, 3 endpoints, no own DB), `catalog` (888 LOC, mostly read-only), and `adaptive-engine` (3,235 LOC of which a large chunk is unfinished gRPC scaffolding) each run as a full deployable for what amounts to one router worth of work.
3. **Chatty edges in the hot paths**: 20 synchronous HTTP edges between services. The hottest pairs (`quiz↔adaptive-engine`, `content↔catalog`, `content↔search`, `notification↔user-profile`) all pay HTTP latency for what should be in-process calls.

A microservices count is not free. Without a deliberate ceiling, we will keep adding deployables for every new domain — a count that is hard to halt once a culture of "new feature → new service" sets in.

## Decision

Consolidate the 12 backend services into **5 deployables, with a 6th slot reserved for the Phase 3 Tutor Marketplace**, and adopt a **service ceiling = 6**:

| New service     | Stack          | Absorbs                                                      | Postgres DB & schemas                                                  |
|-----------------|----------------|--------------------------------------------------------------|-------------------------------------------------------------------------|
| `alp-identity`  | Python/FastAPI | auth · user-profile · institution                            | `identity` — schemas: `auth_schema`, `profile_schema`, `institution_schema` |
| `alp-payment`   | Python/FastAPI | payment (unchanged, **stays standalone**)                    | `payment` — schema: `payment_schema`                                    |
| `alp-learning`  | Python/FastAPI | catalog · content · doubts · search · adaptive-engine        | `learning` — schemas: `catalog_schema`, `content_schema`, `doubts_schema` (+ OpenSearch + Redis) |
| `alp-quiz`      | Go             | quiz (unchanged)                                             | `quiz` — schema: `quiz_schema`                                          |
| `alp-engagement`| Python/FastAPI | analytics · notification                                     | `engagement` — schemas: `analytics_schema`, `notification_schema`        |
| `alp-marketplace` *(reserved, Phase 3)* | TBD | tutor profiles · bookings · creator marketplace · revenue-share ledger | new in P3-S0 |

### Key properties

1. **Schemas are preserved, not merged**. AP-01 ("each service owns exactly one schema") is reinterpreted as "each *consolidated* service owns exactly one Postgres database that holds one schema per absorbed module." This keeps Alembic histories intact (`<schema>.alembic_version` per module) and lets us split a module back out later if scale demands.
2. **HTTP URL prefixes are preserved**. Web and mobile clients keep hitting `/auth/*`, `/profile/*`, `/catalog/*`, `/content/*`, `/doubts/*`, `/search/*`, `/adaptive/*`, `/analytics/*`, `/notifications/*`, `/flags/*`, `/institution/*`, `/payment/*`. Gateway routing changes; client code does not.
3. **NATS subjects and durable consumer names are preserved**. `quiz.session.completed`, `content.question.published`, `content.assignment.created`, `flag.changed`, `user.created`, `payment.subscription.changed` — all unchanged. Durable names like `analytics-quiz-completed`, `notification-quiz-completed`, `content-assignment-progress` move with their code; JetStream remembers them by name and resumes from the last acknowledged position.
4. **Payment stays standalone** to keep Stripe webhook traffic isolated from JWT issuance and login (PCI / blast-radius best practice). Triggers to revisit are codified below.
5. **Quiz stays in Go** because `quiz/` is 4,256 LOC of working session/IRT/circuit-breaker code; rewriting it to merge into a Python service is a multi-sprint effort with no commensurate benefit.
6. **Service ceiling = 6**. Any new domain in Phase 2/3 lands inside one of the 6 services unless a future ADR justifies a new boundary by naming the rejected home, the failure mode the new boundary prevents, and the scale threshold that triggered it.

### Triggers to revisit

**Payment standalone → bundle into Identity** if any of:
- Webhook volume drops below 10/day for 90 consecutive days (operational savings outweigh isolation).
- PCI scope is removed by moving cardholder data fully off-platform (Stripe-hosted everything).
- `alp-identity → alp-payment` premium-fallback HTTP latency exceeds 50ms p95 sustained for a week (in-process becomes meaningfully faster).

**Quiz Go → rewrite to Python** if any of:
- Quiz session volume falls below 1k sessions/day for 90 days AND no concurrency-pressure incidents in the same window (the original "deterministic latency under concurrency" rationale no longer applies).
- A future ADR explicitly supersedes the Go choice.

**Service ceiling = 6 → expand to 7+** only via a new ADR that names the service being added, why no existing service can host it, and what observability/failure-isolation property the new boundary buys.

## Alternatives considered

- **Option A: Status quo (12+ services)**.
  *Pros*: independent scaling per service; clean bounded contexts; no migration cost.
  *Cons*: operational overhead grows linearly; under-utilised services consume the same per-deployable fixed costs as load-bearing ones; chatty HTTP edges in hot paths; nothing prevents drift to 14+ in Phase 3. **Rejected** because the platform is at <10K students and the per-service overhead is disproportionate to the scaling benefit.

- **Option B: Aggressive 3-service consolidation** (Identity + Learning + Engagement, with Payment and Quiz folded in).
  *Pros*: maximal in-process savings; tightest CI lane.
  *Cons*: requires a Go→Python rewrite of Quiz (2–3 sprints, high risk on session-state correctness); puts Stripe webhook traffic on the same pod as login (PCI blast radius); collapses two language ecosystems into one polyglot container. **Rejected** because the Quiz rewrite cost is too high for the marginal saving, and webhook isolation is a defensible best practice.

- **Option C: Ship 5 services today, defer the ceiling discussion to Phase 3**.
  *Pros*: minimal commitment; preserves option value.
  *Cons*: without a ceiling and an ADR-discipline, Phase 3 will add Tutor + Predictive + likely Live-Tutor-Realtime as separate services, returning us to 9+ deployables by 2028. The whole point of consolidating is to reset the trend, not to take a one-time discount and start over. **Rejected** in favour of codifying the ceiling now.

- **Option D: Module-based monolith (1 service, many modules)**.
  *Pros*: simplest deploy; no inter-service edges at all.
  *Cons*: loses independent scaling between login (synchronous, latency-sensitive) and JetStream consumers (async, throughput-oriented); a single bug or memory leak takes down the whole platform; merges a Go and Python codebase. **Rejected** as too far in the other direction; the goal is a balanced cut, not a return to monolith.

## Consequences

### Positive

- **20 HTTP edges → ~10**: the chatty Learning cluster collapses (5 edges become in-process: `content→catalog`, `adaptive→catalog`, `adaptive→content`, `search→catalog`, plus reduces `quiz`'s 4 upstream URLs to 1).
- **Operational footprint shrinks** from 12 deployables to 5: 5 Dockerfiles, 5 CI lanes, 5 Helm releases, 5 dashboards. Roughly 60% reduction in fixed per-service overhead.
- **Phase 3 has a known home** for every planned domain: Tutor → Marketplace; Predictive → Engagement.analytics; Stripe Connect splits → Payment; tutor real-time signalling → Marketplace. No surprise services arrive in 2027.
- **Service ceiling discipline** prevents the count from drifting back up. Every future "new service" requires an ADR.
- **Web/mobile clients see no change**. URL prefixes preserved end-to-end.
- **Event consumers stay durable**. JetStream consumer names unchanged → no replay; no DLQ flush.

### Negative

- **One Postgres DB hosts multiple schemas per consolidated service**. Slight increase in blast-radius if a schema-level lock or vacuum stalls — but each schema's connection pool is independent. Mitigated by per-schema Alembic versioning and per-schema connection limits.
- **Loss of independent scaling within a bundle** (e.g. `auth/login` cannot scale separately from `institution/cohort-write`). At <10K students this is acceptable; we revisit at the threshold codified above.
- **Migration risk during cutover**. Each merge sprint runs the new service in parallel with the old, gates traffic on contract-test parity, and only deletes the old service after the new one passes a full smoke. Rollback = revert that one merge sprint.
- **One-time cost**: ~5 sprints (1 foundation + 3 merges + 1 cleanup). Some open feature PRs against old service directories will need rebasing during the cutover window.

### Follow-up work

- [ ] **Sprint A** — scaffold `services/identity/`, `services/learning/`, `services/engagement/` skeletons; per-route contract test harness at `tests/consolidation/`; `make dev-new` target.
- [ ] **Sprint B** — merge `analytics` + `notification` → `alp-engagement`. Lowest-risk first.
- [ ] **Sprint C** — merge `catalog` + `content` + `doubts` + `search` + `adaptive-engine` → `alp-learning`. Highest payoff.
- [ ] **Sprint D** — merge `auth` + `user-profile` + `institution` → `alp-identity`. Highest risk; do last.
- [ ] **Sprint E** — delete the 10 superseded service directories; rewrite Phase 3 plan in [`docs/02_planning/21_Phase3_SprintDevelopmentPlan.md`](../02_planning/21_Phase3_SprintDevelopmentPlan.md) to use the new service names; update [`docs/CLAUDE.md`](../CLAUDE.md) Tech-stack and Build-order sections.
- [ ] Update `infrastructure/docker/docker-compose.yml` per sprint as new services come up.
- [ ] Update `Makefile` `PY_SERVICES := identity learning engagement payment` once Sprint E lands.
- [ ] Reflect AP-01 reinterpretation ("one DB per consolidated service, one schema per absorbed module") in `docs/CLAUDE.md` Architecture-principles.

## Review

Revisit by **2026-10-28** (six months) or earlier if any of the trigger conditions above fire. Specifically check at that point: (a) has the 6-service ceiling held? (b) did the contract-test harness catch real regressions during cutover, or was it ceremony? (c) has Payment standalone caused any incidents that bundling would have prevented?
