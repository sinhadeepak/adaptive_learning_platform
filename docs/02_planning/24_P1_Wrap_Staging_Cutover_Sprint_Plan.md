# Sprint 8 — Phase 1 Wrap-up: Staging Cutover Plan

**Sprint number**: 8 of the post-MVP arc, framed as **the bridge from Phase 1 (feature-complete locally) to Phase 2 (Foundation + global expansion)**.
**Author**: Tech Lead.
**Status**: 📋 **PLANNED** — awaiting CTO sign-off on AWS account access (the gating dependency for the entire sprint).
**Inputs**: [20_Phase1_Retrospective §6](20_Phase1_Retrospective.md#6-carry-overs-to-phase-2-sprint-0) (carry-over list) · [19_Phase2_SprintDevelopmentPlan §P2-S0](19_Phase2_SprintDevelopmentPlan.md) (overlapping scope — see §6 reconciliation below) · [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx).

---

## 1. Why this sprint exists

The Phase 1 retro flagged that P2-S0 in the existing plan ([19_Phase2_SprintDevelopmentPlan.md](19_Phase2_SprintDevelopmentPlan.md)) overloads a 2-week sprint by mixing **staging cutover** with **Phase 2 foundation work** (i18n framework, Stripe global mode, video infra spike, B2B API ADR).

The lesson recorded in the retro:

> **5.1 Plan staging-deploy as a discrete sprint, not a tail-end task.** S4 carried it forward, S5 ate it for AI work. P2-S0 should be **only** staging deploy + drills + AWS-dependent gaps. No feature work alongside.

This sprint enacts that lesson. It's a **single-purpose sprint**: get the platform onto AWS staging, prove it under load, and close every AWS-blocked Phase 1 carry-over. Phase 2 foundation work (i18n, Stripe global, video, B2B API) shifts to a renamed P2-S0 that follows after this sprint.

---

## 2. Goal (singular)

**By close**: every student-facing endpoint that's green locally is also green against `staging.adaptivelearn.in`, with an automated rollback runbook proven by drill, and zero unresolved AWS-dependent items from the Phase 1 carry-over list.

If we can't say that on Day 10, we don't open Phase 2.

---

## 3. Capacity + team focus

**Capacity**: 60 SP (deliberately under the typical 80-90 SP because the gating risk is AWS access, not engineering effort).

**Team focus**:
- **DevOps** — sprint owner. AWS account, EKS cluster, Aurora, Redis, OpenSearch, NATS, S3+CloudFront. Helm charts. Terraform modules.
- **Tech Lead** — RS256+JWKS rollout across 11 services. Secrets Manager integration.
- **BE Python (1 of 3)** — notification real channels (SendGrid, Twilio, FCM/APNs); other 2 BE Python on Auth SSO + standby for incident response.
- **BE Go** — observability + load test scaffolding for Quiz.
- **FE React (both)** — env-config flips for staging URLs; smoke against staging from each web app.
- **Mobile (both)** — app_links plugin wiring for cold-start deep-link; FCM/APNs for push; release-mode APK + iOS TestFlight build pinned at staging API URL.
- **ML** — standby; reviews recommendations engine kickoff for next sprint.
- **QA** — full regression suite against staging on Day 7+. Drills 1-2 (Day 8) + 3-4 (Day 9). Sign-off Day 10.
- **Designer** — standby.
- **PM** — comms with stakeholders, daily standup, slip-detection.

---

## 4. Backlog (in priority order)

### 4.1 Gate items (must close — sprint fails if any of these slip)

| # | Item | Source | Acceptance |
|---|---|---|---|
| **G-1** | AWS account access provisioned | retro §6 | DevOps has IAM + KMS + Secrets Manager admin in `ap-south-1`; Terraform `apply` runs clean against the staging plan |
| **G-2** | EKS cluster + node groups up | retro §6, P2-S0 plan | `kubectl get nodes` returns ≥3 healthy; ALB ingress controller running |
| **G-3** | Aurora Postgres 15 + per-service schemas migrated | retro §6 | All 9 alembic services + Quiz Go migrate cleanly to head; row counts match local seed where deterministic |
| **G-4** | NATS JetStream durable streams (QUIZ_EVENTS, CONTENT_EVENTS) | retro §6 | All 5 durable consumers connected; smoke quiz submit → analytics + notification process within p95<1s |
| **G-5** | Redis (lockout + flag cache only) | retro §6 | ElastiCache cluster up; auth lockout test passes |
| **G-6** | OpenSearch with `topics_v2` index + alias | retro §6 | EN + Hindi search return live results; alias swap pattern (PR #35) demoed |
| **G-7** | Mailpit replaced by SendGrid for outbound email | retro §6 | quiz.completed → SendGrid → real inbox confirmed |
| **G-8** | LocalStack S3 replaced by real S3 + CloudFront for static assets | retro §6 | web-student bundle + APK served from `cdn.adaptivelearn.in` |
| **G-9** | RS256 + JWKS for JWT (not HS256) | retro §6 | All 11 services validate against `auth.adaptivelearn.in/.well-known/jwks.json`; signed by KMS-backed key |
| **G-10** | OAuth: Google + Apple SSO live | retro §6 | Real client IDs in Secrets Manager; e2e SSO from web-student + mobile lands a verified user |
| **G-11** | Mobile platform plugins wired | retro §6 | `app_links` resolves cold-start `https://adaptivelearn.in/reset?...`; FCM token registers + receives a test push |

### 4.2 Drill items (must run + pass — defines sprint exit)

| # | Drill | Day | Pass criterion |
|---|---|---|---|
| **D-1** | Aurora failover (GAP-22) | Day 8 | Failover < 60s; no data loss; quiz session resumes after Quiz reconnects |
| **D-2** | EKS node loss | Day 8 | Pod reschedules; SLOs hold during 5-minute window |
| **D-3** | NATS JetStream MaxDeliver drop | Day 9 | Nightly backfill (`make analytics-backfill`, `make notification-backfill`) recovers; idempotent on re-run |
| **D-4** | Rollback drill | Day 9 | `runbook/rollback.md` walkthrough completes < 15 min; auth + quiz endpoints green throughout |

### 4.3 Observability + ops (must land — without these we can't run drills)

| # | Item | Source |
|---|---|---|
| O-1 | OpenTelemetry SDK + Jaeger export wired (alp_telemetry / alptelemetry already inject trace_id; need real span sink) | S4 carry-over |
| O-2 | Prometheus + Grafana for service metrics (`/metrics` already on Quiz Go per S3 PR #12; expose for FastAPI services too) | new |
| O-3 | CloudWatch alarms for SLO breaches (5xx rate, p95 latency, durable consumer lag) | new |
| O-4 | Per-service runbooks linked from `docs/runbook/` index (extend the 5 already-committed runbooks) | new |

### 4.4 Test debt (should land — debt to repay alongside cutover)

| # | Item | Source |
|---|---|---|
| T-1 | Per-repo unit tests for new S5–S7 surfaces: ~~achievement repo~~ ✅ ~~mock-attempts repo~~ ✅ ~~bookmarks repo~~ ✅ ~~question-feedback repo~~ ✅ (all four landed pre-sprint, 2026-04-27, 25 new tests in `services/user-profile/tests/test_achievements.py`, `test_bookmarks.py`, `test_mock_attempts_and_feedback.py`); remaining: doubts service repos, notification read-state, multi-turn AI tutor flow | retro §7 |
| T-2 | Mobile widget tests for Bookmarks / History / Inbox / Doubts / Profile achievement screens | retro §7 |
| T-3 | Web e2e (Playwright) smoke covering the 8 top routes (`/inbox`, `/bookmarks`, `/doubts`, `/history`, `/profile`, `/mock/result`, `/settings`, `/home`) | retro §7 |

T-1 through T-3 are **stretch** for this sprint; they ride alongside cutover and slip to P2-S1 if the gate items take longer than expected.

---

## 5. Out of scope (explicitly)

These belong in **renamed P2-S0** or later sprints — they are NOT touched in this sprint:

- i18n framework (RTL/Arabic flips)
- Stripe global mode / multi-currency
- Video infra spike (WebRTC + MP4 + adaptive bitrate)
- B2B REST API design ADR
- Web Experts → backend doubts migration (Phase 1 retro §6 carry-over; defer to P2-S1)
- Real S3+CDN for avatars (today: base64 inline; works at pilot scale, swap when tenant count grows)
- Question feedback moderator surface (teacher portal expansion; P2-S1 or later)
- Live SSE/websocket inbox push (60s short-poll fine at pilot)
- Phase 1 launch ops: drills 1–4 of soft/full launch (re-baseline against staging in this sprint, run in renamed P2-S0)

---

## 6. Reconciliation with existing Phase 2 plan

The existing [19_Phase2_SprintDevelopmentPlan.md](19_Phase2_SprintDevelopmentPlan.md) describes a P2-S0 that mixes **Phase 1 carry-over closure** with **Phase 2 foundation work** (i18n, Stripe global, video spike, B2B API ADR).

**Recommended re-baseline**:

| Doc 19 P2-S0 (mixed) | This doc (Sprint 8 — Wrap) | Renamed P2-S0 (foundation only) |
|---|---|---|
| Phase 1 retrospective | ✅ already written ([20](20_Phase1_Retrospective.md)) | — |
| Phase 1 carry-over closure | ✅ this sprint | — |
| i18n framework + tooling | — | ✅ |
| Stripe global mode design | — | ✅ |
| Video infra spike | — | ✅ |
| B2B API ADR | — | ✅ |
| Localization PM hire confirmed | — | ✅ |

The original P2-S0 (12 weeks total) becomes a 4-week pair: **Sprint 8 wrap-up (2 weeks) + renamed P2-S0 foundation (2 weeks)**. Total Phase 2 timeline shifts from 12 to 14 weeks. The cost is two weeks; the benefit is a clean separation between operational cutover and feature foundation, plus an unambiguous sign-off gate for each.

Approval needed from CTO + Head of Product to accept the 2-week shift before this sprint begins.

---

## 7. Definition of Done (sprint exit)

Every gate item (G-1 through G-11) green. Every drill (D-1 through D-4) passed. Observability minimum (O-1 through O-4) operational.

If by Day 10 any gate item is red, **we don't open the next sprint** — instead we extend this sprint by one week and re-evaluate. Phase 2 doesn't start with a half-cut staging environment.

**Sign-off gates**:
- DevOps: gate items green
- Tech Lead: drill log signed
- QA: regression suite green against staging
- CTO: production-readiness review (no NFRs failing)

---

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | AWS account never granted | Sprint cannot start. PM escalation path: Tech Lead → CTO → board. Worst case: this sprint becomes a 6-month wait. |
| R-2 | Aurora failover drill fails (GAP-22) | Re-architect Quiz session expiry to be Aurora-failover-tolerant. Slip 3 days. |
| R-3 | OAuth credentials issued late | Auth SSO falls out of scope; ship without and pick up in renamed P2-S0. |
| R-4 | Mobile platform plugin wiring discovers a deep API gap | Defer FCM to renamed P2-S0; ship app_links only. |
| R-5 | Real notification dispatch surfaces SendGrid/FCM rate-limit issues | Rate limiting + retry logic; ship best-effort with logged drops; tighten in P2-S2. |
| R-6 | Unit-test debt (T-1, T-2, T-3) crowds out drills | These are stretch — drop without ceremony if gates need more time. |

---

## 9. Out-of-sprint asks

PM:
- Daily standup focus check: are we tracking against gate items, not test debt?
- Surface any AWS access blocker to CTO same-day.

Head of Product:
- Sign-off on the 2-week Phase 2 timeline shift before Day 1.
- Review carry-over deferrals (web Experts, S3+CDN, moderator surface, SSE) — confirm they're acceptable in renamed P2-S0 or later.

CTO:
- AWS account access — single largest gating dependency.
- RS256+JWKS rollout review on Day 5.
- Production-readiness sign-off Day 10.

---

## 10. After this sprint

Once gate + drills are green:
1. **Renamed P2-S0** (Foundation, Wks 3–4 of Phase 2): i18n framework, Stripe global mode design, video infra spike, B2B API ADR. Per existing [19_Phase2_SprintDevelopmentPlan §P2-S0](19_Phase2_SprintDevelopmentPlan.md).
2. **P2-S1** (Internationalization, Wks 5–7): RTL/Arabic UI flips, Arabic content authoring, multi-currency payments, localized OTP/email. Per existing plan.
3. … and so on.

Phase 1 closes at the operational layer the moment this sprint exits.
