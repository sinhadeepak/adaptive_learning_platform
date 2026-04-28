# Master Phase + Sprint Index

**Purpose**: single jump-off point for everything plan-related across all phases. If you're not sure which doc is current, start here.

**Updated**: 2026-04-25 (after PR #37 — Phase 3 plan landed).

---

## Phase model at a glance

| Phase | Window | Goal | Sprint plan | Status |
|---|---|---|---|---|
| **Ph 0** Foundation | Wks 1–2 | Sprint 0 complete; platform ready | [02_Sprint0_Plan](02_Sprint0_Plan_AdaptiveLearningPlatform.docx) | ✅ done |
| **Ph 1a** Closed Beta | Wks 3–8 | India invite-only; validate core loop | [07_SprintDevelopmentPlan](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md) §S1–S3 | ✅ S1+S2+S3 done |
| **Ph 1b** Soft Launch | Wk 9 | India limited public | §S4a (same doc) | 🟨 feature-complete locally; **staging deploy deferred to end-of-Phase-3 per user direction** |
| **Ph 1c** Full Launch | Wk 10+ | India public, freemium + premium + institution | §S4b (same doc) | 🟨 feature-complete locally; staging deferred (see Final cutover row below) |
| **Ph 1 emergent** Post-MVP | 2026-04-26→27 | Close visible gaps (AI verticals, mobile parity, engagement loop) | S5 [19_AI_Sprint_Closure](19_AI_Sprint_Closure.md) · S6 [22_Platform_Completion](22_Platform_Completion_Sprint_Closure.md) · S7 [23_Engagement](23_Engagement_Sprint_Closure.md) | ✅ all three closed |
| **Ph 2** Global Expansion | Q4 2026 | Global English + RTL/Arabic; live sessions; native video; B2B API reads | [19_Phase2_SprintDevelopmentPlan](19_Phase2_SprintDevelopmentPlan.md) | ❌ all 5 sprints pending |
| **Ph 3** Platform Evolution | 2027 | Marketplaces (live tutors + content), B2B API writes, predictive analytics | [21_Phase3_SprintDevelopmentPlan](21_Phase3_SprintDevelopmentPlan.md) | ❌ all 6 sprints pending |
| Phase 4+ | TBD | Out of scope today | — | (no plan) |

---

## Sprint count summary

| Phase | Sprints |
|---|---|
| Phase 0 | 1 (Sprint 0 — done) |
| Phase 1 | 4 planned (S1–S4) **+ 3 emergent post-MVP** (S5 AI Deepening, S6 Platform Completion, S7 Engagement) — all closed |
| Phase 2 | **5** (S8 Payment + Institution = next; S9 i18n; S10 Live sessions/video; S11 Inst-analytics + B2B API; S12 stabilization). Existing [Phase 2 plan](19_Phase2_SprintDevelopmentPlan.md) covers themes; sprint numbering aligned to global counter post-rebaseline. |
| Phase 3 | 6 |
| **Final cutover sprint** | 1 — Staging deploy + drills, deferred per user direction until all Phase 1+2+3 sprints land + Stripe ready. Plan preserved at [24_DEPRECATED_Staging_Cutover_Plan](24_DEPRECATED_Staging_Cutover_Plan.md). |
| **Total** | **20** sprints to staging push (S0–S19) |

**Pending today**: ~4 (Phase 2 + P3-S0 + P3-S1 + P3-S2 closed at Sprints S13–S17. Sprint 17 shipped the booking flow end-to-end with Stripe Connect + Daily.co stubs; P3-S3 opens creator marketplace + ratings + real Stripe/Daily wiring. Staging cutover still AWS-blocked).

---

## Closures (sprint retrospectives)

Each closure summarizes what shipped, what slipped, what carries to the next sprint, plus the test scoreboard at sprint close.

| Sprint | Closure doc | Status |
|---|---|---|
| Sprint 1 | [15_Sprint1_Closure](15_Sprint1_Closure.md) | ✅ |
| Sprint 2 | [16_Sprint2_Closure](16_Sprint2_Closure.md) | ✅ |
| Sprint 3 | [17_Sprint3_Closure](17_Sprint3_Closure.md) | ✅ written; **scope mismatch with plan** — ships backend hardening + content authoring + admin shell, NOT the planned Payment/Institution/drills work |
| Sprint 4 | [18_Sprint4_Closure](18_Sprint4_Closure.md) | ✅ written; covers post-S3 hardening (IRT calibration, deep-link parser, OTEL trace-id, Hindi seed, backfill, runbook); does NOT cover planned launch sprint |
| Sprint 5 — AI Deepening | [19_AI_Sprint_Closure](19_AI_Sprint_Closure.md) | ✅ closed 2026-04-27 — emergent post-MVP sprint. The staging-deploy work originally planned for S5 remains **AWS-blocked** and rolls forward. Shipped 9 AI verticals end-to-end across web + mobile (study plan, guided next steps, explanations, tutor chat, photo-OCR doubt, rank trajectory, weakness diagnosis, mock tests, predictive AIR). Heuristic-degrading so the stack runs without an OpenAI key. |
| Sprint 6 — Platform Completion | [22_Platform_Completion_Sprint_Closure](22_Platform_Completion_Sprint_Closure.md) | ✅ closed 2026-04-27 — doubts microservice (12th in the stack), per-day analytics + activity-heatmap groundwork, mobile parity (Doubts tab, Profile tab settings flows, Edit Profile / Change Password / Preferences screens). Mobile reached feature-parity with web. |
| Sprint 7 — Engagement | [23_Engagement_Sprint_Closure](23_Engagement_Sprint_Closure.md) | ✅ closed 2026-04-27 — bookmarks (web + mobile) + quiz session history + notification inbox with read state + 7 notification types + per-type mute prefs + persistent mock attempts + 21-kind achievements catalog + daily-goal card + 30-day activity heatmap + question feedback flag + web Doubts pages + Ask-AI-from-quiz-review doubt flow + avatar upload + post-close addendum (cumulative achievements, search recents, streak nudge, locked-badge preview, `streak.broken` notification). Real engagement loop end-to-end. |
| Phase 1 retrospective | [20_Phase1_Retrospective](20_Phase1_Retrospective.md) | ✅ written 2026-04-27 — wraps S1–S7 (planned + emergent). Gates P2-S0; sign-off block lists CTO + Head of Product + PM as pending. |
| Sprint 8 — Payment + Institution Core | [24_Sprint8_Payment_Institution_Plan](24_Sprint8_Payment_Institution_Plan.md) → [25_Sprint8_Closure](25_Sprint8_Closure.md) | ✅ DELIVERED 2026-04-28 — Stripe Checkout + subscription FSM (P-1..P-8), Auth STUDENT_PREMIUM + NATS subscriber (R-1, R-2), Quiz Go tier gate (R-3), Adaptive photo-doubt rate limit (R-4), Institution Core tenants/cohorts/members (I-1..I-5), Frontend paywall + Billing page + Premium pill + mobile WebView (F-1..F-5 all closed). **126 new tests green** (42 FSM + 11 repos + 8 routes + 16 auth + 8 Quiz Go + 12 Adaptive + 9 Institution + 6 web + 14 mobile). Re-baseline note: original staging-cutover doc lives at [24_DEPRECATED_Staging_Cutover_Plan](24_DEPRECATED_Staging_Cutover_Plan.md) — gate items + drills + runbooks remain valid for the eventual ~Sprint 19 staging push. |
| Sprint 9 — Educator Assignments + Cohort Engagement | [26_Sprint9_Educator_Assignments_Plan](26_Sprint9_Educator_Assignments_Plan.md) → [27_Sprint9_Closure](27_Sprint9_Closure.md) | ✅ DELIVERED 2026-04-28 — Sprint 8 carry-overs (A-1..A-3) + Educator Assignments backend (E-1..E-7: migration 005, FSM-light publish flow, NATS fanout, leaderboard) + Notification `assignment.new` consumer (E-5) + Analytics cohort leaderboard (L-1) + Frontend (F-1 web + F-2 mobile, both with `progressBucket`/`formatDueAt` pure-helpers). 59 new tests green; mobile 114/114, web-student 28/28. F-stretch web-portal authoring UI + web-admin Institution UI deferred to Sprint 10. |
| Sprint 10 — Educator Surface + Quiz↔Assignment | [28_Sprint10_Educator_Surface_Plan](28_Sprint10_Educator_Surface_Plan.md) → [29_Sprint10_Closure](29_Sprint10_Closure.md) | ✅ DELIVERED 2026-04-28 — Content catalog stub fixture (S10-A unblocked the 7 pre-existing failing tests; suite now 30/30), Web-portal Assignment Authoring wizard with pure-logic step machine (S10-B), Web-admin Institution Core UI — tenant lookup/create + cohort/members CRUD (S10-C), server-graded `/submit` endpoint replacing manual score-entry UX (S10-D — `grade_answers` pure helper + web + mobile surfaces), Cohort leaderboard view on web-portal (S10-E). 19 new tests; web-student 47/47; web-admin 14/14; mobile 114/114; web-portal 25/26 (1 pre-existing). |
| Sprint 11 — Educator UX Polish + B2B Onboarding | [30_Sprint11_Educator_Polish_Plan](30_Sprint11_Educator_Polish_Plan.md) → [31_Sprint11_Closure](31_Sprint11_Closure.md) | ✅ DELIVERED 2026-04-28 — Cohort invite link flow with HMAC-signed tokens + claim endpoint + /join/:token (S11-A, 11 tests), real Question Picker UI replacing paste-UUIDs textarea (S11-B, 10 tests), per-question explanations on assignment result panel (S11-C, 2 tests; only-on-misses contract), `assignment.new` mute toggle wired into web + mobile prefs (S11-D), pre-existing `/questions/new` test fixed — web-portal now **36/36** (S11-E), educator dashboard cohort quick-access pinning (S11-F). 23 new tests. Full stack now: Content 30/30, Institution 32/32, web-student 47/47, web-portal 36/36, web-admin 14/14, mobile 114/114. |
| Sprint 12 — Realtime + Invite Revocation + Mobile Onboarding + Quiz↔Content Bridge | [32_Sprint12_Realtime_Plan](32_Sprint12_Realtime_Plan.md) → [33_Sprint12_Closure](33_Sprint12_Closure.md) | ✅ DELIVERED 2026-04-28 — Tenant invite list/revoke with token redaction (S12-A, 4 tests), SSE-driven cohort leaderboard with digest-diff polling + EventSource client (S12-B, 6 digest tests), mobile JoinCohort screen + deep-link parser /join/<token> (S12-C, 6 tests), **full Quiz↔Content bridge for ASSIGNMENT mode** (S12-D end-to-end: Quiz migration 006 + Content HTTP client + `POST /quiz/sessions/from-assignment` + `assignment_id` in NATS payload + Content `quiz.session.completed` subscriber + web + mobile "▶ Start as Quiz" CTAs; 8 tests). **24 new tests.** Stack totals: Institution 36/36, Content 43/43, Mobile 120/120, Quiz Go green; web-admin/web-portal/web-student unchanged from Sprint 11. |
| Sprint 13 — Realtime Push + Educator Insights | [34_Sprint13_Insights_Plan](34_Sprint13_Insights_Plan.md) → [35_Sprint13_Closure](35_Sprint13_Closure.md) | ✅ DELIVERED 2026-04-28 — NATS-driven leaderboard push (S13-A, 8 tests; replaces 5s SSE poll with `realtime.publish_user_recomputed` fan-out from `process_session` callback), tenant-invite claim audit + funnel (S13-B, migration 005 + endpoint + web-admin "view claims" expandable; 4 tests), educator student drill-down endpoint + page (S13-C, cross-DB read into quiz_schema + web-portal `/cohorts/:id/students/:userId`; 8 tests), cohort summary stats with at-risk list (S13-D, 4 tile header + endpoint; 8 tests). **28 new tests.** Stack totals: Analytics +24, Institution 23/23 invites; web-portal 36/36, web-admin 14/14. |
| Service consolidation 12→5 (Sprints A–E + smoke-test fixes) | [`docs/adr/0005-service-consolidation.md`](../adr/0005-service-consolidation.md) | ✅ DELIVERED 2026-04-28 — unplanned but completed across 5 commits (`bca18d6` → `2a42961`) on `chore/service-consolidation` then merged to `development`. 12 backend services → 5 (`alp-identity`, `alp-payment`, `alp-learning`, `alp-quiz`, `alp-engagement`) + 6th slot reserved for `alp-marketplace` (P3). HTTP edges 20 → ~10. NATS subjects + durable consumer names preserved. End-to-end smoke green (16/16). |
| Sprint 14 — Consolidation closure + Phase 2 wrap-up | [36_Sprint14_Plan](36_Sprint14_Plan.md) → [37_Sprint14_Closure](37_Sprint14_Closure.md) | ✅ DELIVERED 2026-04-28 — `make smoke` 16-assertion golden-path script (S14-A); `runbook/rollback.md` + `runbook/nats_dlq.md` updated to 5 consolidated services + new `runbook/smoke_test.md` (S14-B); engagement integration tests resurrected with `@pytest.mark.integration` marker, 84 unit tests pass, 22 integration opt-in (S14-C); Phase 2 retrospective written (S14-D). |
| Phase 2 retrospective | [22_Phase2_Retrospective](22_Phase2_Retrospective.md) | ✅ written 2026-04-28; unblocks P3-S0. |
| Sprint 15 — P3-S0 foundations (alp-marketplace + 6 gating ADRs) | [38_Sprint15_Plan](38_Sprint15_Plan.md) → [39_Sprint15_Closure](39_Sprint15_Closure.md) | ✅ DELIVERED 2026-04-28 — alp-marketplace skeleton (the 6th and final service slot per ADR-0005) live on port 38110 with `marketplace_schema` initialised; ADRs [0006](../adr/0006-kyc-vendor.md) (Stripe Identity), [0007](../adr/0007-stripe-connect-rollout.md) (Connect Express + 15% + weekly), [0008](../adr/0008-marketplace-pricing-model.md) (creator-set within bands), [0009](../adr/0009-tutor-session-realtime-signalling.md) (NATS + Daily.co), [0010](../adr/0010-predictive-analytics-model-serving.md) (pure Python in engagement), [0011](../adr/0011-recommendation-algorithm.md) (OpenAI embeddings) all proposed; smoke 17/17 green. **P3-S0 closed**; P3-S1 unblocked pending ADR acceptance. |
| Sprint 16 — P3-S1 live tutor marketplace, supply side | [40_Sprint16_Plan](40_Sprint16_Plan.md) → [41_Sprint16_Closure](41_Sprint16_Closure.md) | ✅ DELIVERED 2026-04-28 — tutor application FSM end-to-end. Migration 002 adds 4 tables (tutor_profiles + qualifications + availability + topics) with ADR-0008 pricing band CHECK; 10 routes wired (/marketplace/tutors/apply + /me + /me/kyc/{start,poll} + /me/activate + /admin/{user_id}/{approve,reject} + /tutors listing + /tutors/{id} public); Stripe Identity stub for KYC (real wiring P3-S2); web-portal /tutor/apply + /tutor pages + marketplace API namespace. Tests: 18 unit + 5 integration green. **make smoke = 23/23**. P3-S1 closed; P3-S2 opens demand side + Stripe Connect + Daily.co. |
| Sprint 17 — P3-S2 live tutor marketplace, demand side | [42_Sprint17_Plan](42_Sprint17_Plan.md) → [43_Sprint17_Closure](43_Sprint17_Closure.md) | ✅ DELIVERED 2026-04-28 — booking flow end-to-end. Migration 003 adds bookings + tutor_sessions + tutor_admin_actions; 11 booking routes (create + confirm-payment + start + complete + cancel + no-show + my-bookings + availability) + 2 admin queue routes; Stripe Connect + Daily.co stubs (real wiring still gated on creds); 24h student cancel rule; commission_split with 15% default + per-tutor override (ADR-0007); web-student /tutors + /tutors/:id + /bookings pages; web-admin /tutors-admin moderation queue + audit page; reject reason now persisted to tutor_admin_actions. Tests: 36 unit + 12 integration. **make smoke = 28/28**. P3-S2 closed; P3-S3 opens creator marketplace + ratings + Stripe/Daily real wiring. |

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
