# Phase 2 Retrospective

**Phase window**: 2026 (post-Phase-1) — Sprints 5 through 13 + the unplanned consolidation work + Sprint 14 closure.
**Author**: Deepak Sinha (full-stack AI developer, single-engineer team).
**Status**: Phase 2 closed 2026-04-28. Gates Phase 3 (P3-S0).

## What Phase 2 was supposed to be

The Phase 2 plan ([19_Phase2_SprintDevelopmentPlan.md](19_Phase2_SprintDevelopmentPlan.md)) called for **5 sprints** covering global expansion: live tutor sessions, native video, B2B API, Phase-2 carry-overs from Phase 1. Concrete deliverables planned:

- Stripe Checkout + Auth premium tier propagation
- Institution onboarding + cohorts + assignments
- Educator surface (web-portal teacher dashboard)
- Mobile feature parity (Stripe checkout, leaderboard, profile edits)
- Operational hardening (load tests, drills 7+8)

## What Phase 2 actually was

**9 sprints** (S5–S13) of feature work, then **5 sprints** of unplanned consolidation work (ADR-0005 Sprints A–E + smoke-test fixes), then **1 sprint** of post-consolidation closure (Sprint 14). Total: 15 sprints in the Phase 2 window.

Why the overshoot:
- The Phase 2 plan budgeted 1.5× Phase 1 cadence; actual cadence delivered ~3× the planned scope per sprint, so the same 22 weeks fit ~3× the planned content.
- The consolidation (12 → 5 services) was *not* in the plan. It surfaced from the Sprint 13 retro as "we have too many services for one engineer to operate" and ate roughly 5 sprints of capacity.
- Phase 1 carry-overs (Payment, Institution) landed in S8 — that was always the plan, just wasn't called out as a separate sprint.

## What shipped

### Feature work (S5–S13)

| Sprint | Theme | Headline outcomes | Tests added |
|---|---|---|---|
| S5 (post-MVP-1) | AI deepening | Adaptive engine — IRT estimator + photo doubt + study plan; EWA mastery refinements | ~50 |
| S6 (post-MVP-2) | Mobile parity | Flutter — adaptive quiz play, result, home, design tokens, deep-link parser | ~30 |
| S7 (post-MVP-3) | Engagement loop | Streaks, daily activity table, achievement unlocks, milestone notifications | ~28 |
| S8 | Payment + Institution | Stripe checkout + webhook + subscription FSM + premium tier; Institution core (tenants, cohorts, members); 3-portal admin shell | ~60 |
| S9 | Educator Assignments + Cohort Engagement | Assignment authoring + cohort leaderboard + assignment progress event | ~50 |
| S10 | Educator Surface + Quiz↔Assignment | Educator authoring UI; ASSIGNMENT mode in Quiz; web-portal admin dashboards | ~40 |
| S11 | Educator UX Polish + B2B Onboarding | Cohort invites + question picker + result explanations | ~35 |
| S12 | Realtime + Invite Revocation + Mobile Onboarding + Quiz↔Content Bridge | SSE leaderboard, mobile JoinCohort, full Quiz↔Content bridge for ASSIGNMENT mode | ~24 |
| S13 | Realtime Push + Educator Insights | NATS-driven leaderboard push, claim audit + funnel, student drill-down, cohort summary | ~28 |

### Consolidation (ADR-0005, Sprints A–E + smoke fixes)

A separate, unplanned but ultimately load-bearing piece of work. Documented in detail at [`docs/adr/0005-service-consolidation.md`](../adr/0005-service-consolidation.md).

| Sprint | What | Outcome |
|---|---|---|
| A | Foundations | ADR-0005, 3 service skeletons, contract-test harness (61 routes covered) |
| B | analytics + notification → alp-engagement | 92 unit tests pass on consolidated service; durable consumers preserved |
| C | catalog + content + doubts + search + adaptive → alp-learning | 142+ tests pass; 5 services collapsed in one merge |
| D | auth + user-profile + institution → alp-identity | 119 tests pass; JWT + Stripe webhook fallback edge preserved |
| E | Cleanup, docs, Phase 3 plan rewrite | Makefile + docker-compose + CLAUDE.md updated; Phase 3 plan annotated with new service mapping |
| smoke | Alembic schema bootstrap + web nginx + seed paths | 16/16 smoke steps pass on rebuilt stack |

### Sprint 14 (post-consolidation closure, this doc's gate)

| Item | Outcome |
|---|---|
| `make smoke` | 16-assertion bash script that exercises the full golden path; runs in <30s |
| Runbooks updated | `rollback.md`, `nats_dlq.md` reference 5 consolidated services; new `smoke_test.md` |
| Engagement integration tests resurrected | Marked with `@pytest.mark.integration`; default `pytest` skips, opt-in via `-m integration` |
| Phase 2 retrospective (this doc) | Closes Phase 2 |

## What slipped

| Item | Status | Where it goes |
|---|---|---|
| AWS staging deploy | ❌ blocked on AWS access since Phase 1 (GAP-22) | Not a Phase 2 problem; tracked separately as the AWS access blocker |
| Live tutor sessions | ❌ not started | P3-S1 (alp-marketplace) |
| Native video | ❌ not started | P3-S1 |
| B2B API writes | ❌ not started | P3 (extends `alp-identity.institution`) |
| Predictive analytics (drop-out, recommendations) | ❌ not started | P3-S5 (extends `alp-engagement.analytics`) |
| Drill 7 (marketplace fraud) + Drill 8 (webhook flood) | ❌ not exercised | P3-S6 |
| Larger integration test suites for `learning` + `identity` | 🟨 marked but not yet resurrected post-consolidation | Sprint 14 carry-over |
| Web mobile parity for new educator features (S11–S13) | 🟨 partially — JoinCohort shipped, others deferred | P3 |

## What surprised us

### Positive surprises

- **The consolidation was achievable in 5 sprints** without breaking any client contract. Web apps and mobile saw zero URL changes; NATS subjects + durable consumer names unchanged; JWT round-trips intact across the merge. Risk budget was set higher than the actual cost.
- **Cadence ran 3× plan**, not 1.5×. The Phase 2 plan's pessimism factor was too low. A single full-stack engineer with `make` + `docker compose` + `uv` can outpace what was budgeted.
- **The consolidation harness is reusable**. The contract-test scaffolding at `tests/consolidation/` is now general-purpose: any future module-boundary change has a pattern to follow (record → replay → assert parity).

### Negative surprises

- **Postgres async alembic transactions silently don't commit** with `engine.connect()`. Required switching to `engine.begin()` AND `transaction_per_migration=True` for the auth seed (enum-add → enum-use sequence in one migration chain). Cost: half a sprint of debugging during Sprint A.
- **Files outside `src/` are easy to lose during `git mv`**. The Sprint C deletion of `services/content/` accidentally took `seed/question_bank.py` with it. Recovered from git history but it cost ~1 hour of seed-restore debugging.
- **The original development branch diverged from origin by 3 PR-merge commits** that were content-equivalent but SHA-different. Forced a force-push at end of Phase 2 — cleaner than alternatives but a discipline reminder for future single-engineer-using-GitHub-merge-UI flows.
- **Quiz remained Go**, not because the team chose to but because the alternative (rewriting 4,256 LOC) was worse than living with the language boundary. ADR-0005 codifies trigger conditions for revisiting; until any fire, the polyglot stays.

## Numbers

| Metric | Phase 2 |
|---|---|
| Sprints actually run | 15 (9 feature + 5 consolidation + 1 closure) |
| Backend services delta | 11 → 5 (−6) |
| Postgres DBs delta | 12 → 5 (−7) |
| Docker containers delta | 22 → 14 (−8 backend pods + same infra) |
| HTTP edges (sync, between services) | 20 → ~10 |
| LOC moved during consolidation | ~14,000 (Python) + 0 (Go — quiz unchanged) |
| Total tests at Phase 2 end | identity 119, learning 142+, engagement 84+ unit / 22 integration, payment 5, quiz Go 27 |
| ADRs added | ADR-0005 |
| Runbooks added/updated | rollback (updated), nats_dlq (updated), smoke_test (new) |

## Inputs to P3-S0 (concrete decisions needed)

These are the gating ADRs the Phase 3 plan calls for in P3-S0 weeks 1–3:

1. **KYC vendor for tutors** — Persona vs. Onfido vs. Stripe Identity. Affects PII residency posture across markets.
2. **Stripe Connect rollout shape** — Express vs. Custom; payout cadence (daily/weekly/monthly); platform commission %.
3. **Marketplace pricing model** — flat fee vs. % commission vs. hybrid; how creator content is priced (creator-set vs. platform-tiered).
4. **Tutor session real-time signalling** — extend the existing NATS infra (alp-marketplace publishes session events) vs. dedicated WebRTC signalling service.
5. **Predictive analytics model serving** — pure Python in `alp-engagement.analytics` vs. dedicated MLOps stack (MLflow + Sagemaker / Vertex).
6. **Recommendation algorithm** — collab filtering vs. content-based via embeddings vs. hybrid; cold-start strategy.

## Outputs to P3-S0 (decisions already made)

These are codified in ADR-0005 + the Phase 3 plan and need no further debate in P3-S0:

- **Service ceiling = 6**. New domains land as modules inside `alp-identity / payment / learning / quiz / engagement / marketplace`. New service requires a new ADR.
- **alp-marketplace = the 6th slot** for tutor profiles + bookings + creator marketplace + revenue-share ledger.
- **Predictive analytics extends `alp-engagement.analytics`** — not a new service.
- **Stripe Connect splits / payout cycles extend `alp-payment`** — not a new "payouts" service.
- **B2B API write-side extends `alp-identity.institution`** — partner API keys, webhooks, shared cohorts.
- **Creator content marketplace extends `alp-learning.content`** — review pipeline, course authoring v2.

## What I'd do differently next phase

1. **Plan the consolidation up front**, not as a Sprint 13 retro discovery. The signal — "too many services for one operator" — was visible by Sprint 8.
2. **Ban inline routes in `main.py`** for new services. Notification's main.py had 7 inline route decorators that I had to extract during the consolidation. Routers belong in `routes.py`.
3. **Mark integration tests with `@pytest.mark.integration` from day one**, not retrofit at end-of-phase. CI test selection becomes opt-in cleanly.
4. **Write the runbook entry alongside the feature**, not at end-of-phase cleanup. `nats_dlq.md` references that became stale during the consolidation could have been consolidation-aware from the start if they'd been updated as the consolidation landed.
5. **Avoid GitHub's "merge via PR" UI for solo work**. It creates merge commits that diverge from local and cause force-push reconciliation later. `git merge --ff-only` from local is cleaner.
