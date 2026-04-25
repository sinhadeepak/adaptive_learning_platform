# Master Phase + Sprint Index

**Purpose**: single jump-off point for everything plan-related across all phases. If you're not sure which doc is current, start here.

**Updated**: 2026-04-25 (after PR #37 — Phase 3 plan landed).

---

## Phase model at a glance

| Phase | Window | Goal | Sprint plan | Status |
|---|---|---|---|---|
| **Ph 0** Foundation | Wks 1–2 | Sprint 0 complete; platform ready | [02_Sprint0_Plan](02_Sprint0_Plan_AdaptiveLearningPlatform.docx) | ✅ done |
| **Ph 1a** Closed Beta | Wks 3–8 | India invite-only; validate core loop | [07_SprintDevelopmentPlan](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md) §S1–S3 | 🟨 S1+S2 done; S3 ~50% |
| **Ph 1b** Soft Launch | Wk 9 | India limited public | §S4a (same doc) | ❌ not started |
| **Ph 1c** Full Launch | Wk 10+ | India public, freemium + premium + institution | §S4b (same doc) | ❌ not started |
| **Ph 2** Global Expansion | Q4 2026 | Global English + RTL/Arabic; live sessions; native video; B2B API reads | [19_Phase2_SprintDevelopmentPlan](19_Phase2_SprintDevelopmentPlan.md) | ❌ all 5 sprints pending |
| **Ph 3** Platform Evolution | 2027 | Marketplaces (live tutors + content), B2B API writes, predictive analytics | [21_Phase3_SprintDevelopmentPlan](21_Phase3_SprintDevelopmentPlan.md) | ❌ all 6 sprints pending |
| Phase 4+ | TBD | Out of scope today | — | (no plan) |

---

## Sprint count summary

| Phase | Sprints |
|---|---|
| Phase 0 | 1 |
| Phase 1 | 4 |
| Phase 2 | 5 |
| Phase 3 | 6 |
| **Total** | **16** |

**Pending today**: ~12.5 (Phase 1 S3 supplemental + all of P2 + all of P3).

---

## Closures (sprint retrospectives)

Each closure summarizes what shipped, what slipped, what carries to the next sprint, plus the test scoreboard at sprint close.

| Sprint | Closure doc | Status |
|---|---|---|
| Sprint 1 | [15_Sprint1_Closure](15_Sprint1_Closure.md) | ✅ |
| Sprint 2 | [16_Sprint2_Closure](16_Sprint2_Closure.md) | ✅ |
| Sprint 3 | [17_Sprint3_Closure](17_Sprint3_Closure.md) | ✅ written; **scope mismatch with plan** — ships backend hardening + content authoring + admin shell, NOT the planned Payment/Institution/drills work |
| Sprint 4 | [18_Sprint4_Closure](18_Sprint4_Closure.md) | ✅ written; covers post-S3 hardening (IRT calibration, deep-link parser, OTEL trace-id, Hindi seed, backfill, runbook); does NOT cover planned launch sprint |
| Phase 1 retrospective | (planned: `20_Phase1_Retrospective.md`) | ❌ not yet written; gates P2-S0 |
| Phase 2 retrospective | (planned: `22_Phase2_Retrospective.md`) | ❌ not yet written; gates P3-S0 |

---

## Honest gap between plan and reality (Phase 1)

What `07_SprintDevelopmentPlan` planned for S3 vs. what actually shipped:

| Planned | Status |
|---|---|
| Payment — Stripe Checkout, subscription FSM, webhooks | ❌ not shipped |
| Institution — onboarding, cohorts, assignments, teacher dashboard | ❌ not shipped |
| Web-portal teacher dashboard | ❌ not shipped (only review queue from #20) |
| Web-admin user management (search/suspend/impersonate) | ❌ not shipped (only flag console from #23) |
| Mobile Stripe checkout, leaderboard, profile edits, avatar upload | ❌ not shipped |
| LT-SEARCH-03/03B, LT-PIPELINE-01 load tests | ❌ not run |
| GAP-22 Aurora failover + PITR test | ❌ not run |
| GAP-29 Drills 1+2 (T-14) | ❌ not run |
| Backend resilience (JetStream durable, breaker, GAP-25 Py+Go, DB inbox, SMTP, profile internal) | ✅ shipped (PRs #11–#17) |
| Content authoring + bridge | ✅ shipped (PRs #20–#21) |
| Web-admin flag console (MVP cut) | ✅ shipped (PR #23) |
| Mobile forgot/reset + adaptive quiz | ✅ shipped (PRs #19, #22) |
| GAP-06 NATS DLQ runbook | ✅ shipped (PR #30) |
| Per-item IRT calibration `(a, b, c)` | ✅ shipped (PR #25) — was a SPIKE-01 follow-up, not in S3 plan |
| Mobile deep-link parser | ✅ shipped (PR #26) — Sprint 4 plan implication |
| W3C trace-context | ✅ shipped (PR #27) — was Sprint 4 hardening |
| Hindi content seed | ✅ shipped (PR #28) — was Sprint 4 plan implication |
| Analytics + Notification backfills | ✅ shipped (PRs #29, #33) — were Sprint 5 carry-overs |
| Streak tracking | ✅ shipped (PR #34) — Sprint 3 plan item, late |
| Search topics alias swap automation | ✅ shipped (PR #35) — Sprint 4 plan implication |
| Sprint 4 launch (Drills 3+4, soft + full launch) | ❌ not started — **AWS staging access still pending** |

**Phase 1 launch (Ph 1b/1c) is blocked on AWS access.** This is the single biggest gating issue in the project.

---

## Per-PR mapping (for "where did this code come from?")

PR numbers are the squash-merge to `development`.

| PR | Theme | Sprint per plan | Sprint per delivery |
|---|---|---|---|
| #1 | Sprint 1 student journey + cross-language flag plane | S1 | S1 |
| #2 | Quiz session FSM | S2 | S2 |
| #3 | 3PL IRT + EAP + MFI | S2 | S2 |
| #4 | quiz.session.completed + Analytics EWA + Notification | S2 | S2 |
| #5 | Bilingual `topics_v2` index | S2 | S2 |
| #6 | Sprint 2 closure doc | S2 | S2 |
| #7–#10 | S2 carry-overs (web-student quiz play + readiness) | S3 | S3 supplemental |
| #11 | JetStream durable streams | S3 hardening | S3 |
| #12 | GAP-01 circuit breaker + /metrics | S3 hardening | S3 |
| #13 | GAP-25 Python flag.decision | S3 hardening | S3 |
| #14 | DB-backed Notification inbox | S3 hardening | S3 |
| #15 | GAP-25 Go flag.decision parity | S3 hardening | S3 |
| #16 | SMTP outbound dispatcher | S3 hardening | S3 |
| #17 | Profile /internal/profile/{user_id} | S3 hardening | S3 |
| #18 | Forgot/reset password (web) | S3 supplemental | S3 |
| #19 | Mobile adaptive quiz | S3 carry from S2 | S3 |
| #20 | Content authoring service + portal UI | S3 plan | S3 |
| #21 | Content→Quiz bridge | S3 plan | S3 |
| #22 | Mobile forgot/reset password parity | S3 plan | S3 |
| #23 | Web-admin flag console (MVP) | S3 plan | S3 |
| #24 | Sprint 3 closure | S3 plan | S3 |
| #25 | Per-item IRT calibration `(a, b, c)` | SPIKE-01 follow-up | "S4" supplemental |
| #26 | Mobile reset-password deep-link parser | S3 plan implication | "S4" supplemental |
| #27 | W3C trace-context (Py + Go) | S4 hardening | "S4" supplemental |
| #28 | Hindi content seed via authoring API | S4 plan implication | "S4" supplemental |
| #29 | Analytics nightly backfill | (gap closed by hardening) | "S4" supplemental |
| #30 | NATS DLQ runbook (closes GAP-06) | S3 hardening | "S4" supplemental |
| #31 | "Sprint 4 closure" doc (scope mismatch with plan) | — | — |
| #32 | nginx dynamic DNS resolution fix | bug fix | bug fix |
| #33 | Notification nightly backfill | (gap closed by hardening) | "S5" supplemental |
| #34 | Analytics streak tracking | S3 plan, late | "S5" supplemental |
| #35 | Search topics alias swap automation | S4 plan implication | "S5" supplemental |
| #36 | Phase 2 sprint plan (this index series) | planning artifact | planning |
| #37 | Phase 3 sprint plan | planning artifact | planning |

---

## Authoritative inputs (cross-document)

These are the Single Sources of Truth — when sprint plans contradict them, the SoT wins:

- **Release strategy**: [04_ReleasePlan_MVPScope_AdaptiveLearningPlatform.docx](04_ReleasePlan_MVPScope_AdaptiveLearningPlatform.docx) §1.1 — phase model.
- **Backlog**: [01_PrioritisedProductBacklog_AdaptiveLearningPlatform.docx](01_PrioritisedProductBacklog_AdaptiveLearningPlatform.docx) — 57 P0 stories.
- **Definition of Done / Ready**: [03_DoD_DoR_AdaptiveLearningPlatform.docx](03_DoD_DoR_AdaptiveLearningPlatform.docx).
- **Engineering norms**: [06_TeamWorkingAgreements_EngineeringNorms_AdaptiveLearningPlatform.docx](06_TeamWorkingAgreements_EngineeringNorms_AdaptiveLearningPlatform.docx).
- **Gap register**: [GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) — 31 gaps tracked.
- **Open items**: [Appendix_OpenItems_GapRegister_v1.2.md](../06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md).
- **Dependency graph**: [10_DependencyGraph_Phase1.md](10_DependencyGraph_Phase1.md).
- **ADRs**: [docs/adr/](../adr/).

---

## Where to look for what

| Question | Doc |
|---|---|
| What's the current sprint, and what's its scope? | Latest `XX_SprintN_Closure.md` (most recent number) |
| What sprints are pending in any phase? | This doc (table at top) |
| Why was a feature deferred? | The closure doc for the sprint that deferred it |
| What's the next sprint going to ship? | The sprint plan (§Sprint X) for that sprint |
| Why was a technical decision made? | `docs/adr/` |
| What infrastructure is in place? | [08_DevEnvironmentRequirements](08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md) + Terraform files |
| What runbook covers an incident? | [runbook/README.md](../../runbook/README.md) |
| What spike work has been done? | `13_SPIKE-02_*`, `14_SPIKE-07_*`, etc. (`grep SPIKE` if numbering changes) |

---

## Maintenance

This index is canonical. When a new sprint plan or closure lands:

1. Update the **Phase model** table.
2. Update the **Sprint count summary** if a phase plan changes its sprint count.
3. Update **Closures** with the new doc link.
4. Update the **Per-PR mapping** rows for any PRs that landed since the last edit.
5. Refresh **Updated**: at top of file.

If you're updating one of these and the data conflicts with another doc, **fix the source first**, not just the table.
