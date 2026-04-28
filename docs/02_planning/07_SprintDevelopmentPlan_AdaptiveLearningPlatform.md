# Sprint Development Plan

**Project**: Adaptive Learning Platform — Phase 1 (India)
**Planning horizon**: 10 weeks (Sprint 0 + 4 feature sprints)
**Target MVP launch**: End of Week 10 (Phase 1c full launch)
**Team**: 12 (3 BE Python, 1 BE Go, 2 FE React+Vite across three web apps, 2 Mobile on a shared Flutter codebase, 1 ML, 1 DevOps, 1 QA, 1 Designer, 1 Tech Lead; Head of Product, PM, CTO participate cross-sprint). Frontend stack per [ADR-0002](../adr/0002-flutter-mobile-stack.md) (Flutter for mobile) and [ADR-0003](../adr/0003-three-web-app-split.md) (three web apps: `web-student`, `web-portal`, `web-admin`).
**Authoritative inputs**: [BRD v2](../00_requirements/02_BRD_v2_Adaptive_Learning_Platform.docx), [User Stories v2](../00_requirements/05_UserStories_v2_Adaptive_Learning_Platform.docx), [Release Plan / MVP](04_ReleasePlan_MVPScope_AdaptiveLearningPlatform.docx), [Sprint 0 Plan](02_Sprint0_Plan_AdaptiveLearningPlatform.docx), [Technical Spikes](05_TechnicalSpikes_AdaptiveLearningPlatform.docx), [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx).

---

## Timeline at a glance

| Week | Sprint | Phase | Key events |
|---|---|---|---|
| 1–2 | Sprint 0 | Foundation | Gate sign-off (GAP-24). CTO decides GAP-07. Staging AWS live. |
| 3–4 | Sprint 1 | Phase 1a closed beta opens | Auth + Profile + Catalog + Search MVP. SPIKE-01, SPIKE-07 run. |
| 5–6 | Sprint 2 | Closed beta | Quiz + Adaptive + Analytics + Content + Notification. Hindi search live. |
| 7–8 | Sprint 3 | Closed beta + hardening | Payment + Institution. Load tests. Failover test. Drills 1+2 @ T-14. |
| 9 | Sprint 4a | Phase 1b soft launch | Drills 3+4 @ T-7. Bug fix. Invite-only public. |
| 10 | Sprint 4b | Phase 1c full launch | Public registration. War room. PIR process active. |

---

## Sprint 0 — Foundation (Weeks 1–2)

**Goal**: Deliver a complete working environment and sign-off gate — no feature code.

**Capacity**: 89 SP (per existing Sprint 0 Plan). Non-negotiable: all tasks complete by Day 10.

### Deliverables
1. **Monorepo + service skeletons** — one directory per service, standard layout (Go service + 10 Python services + 3 web apps [`apps/web-student`, `apps/web-portal`, `apps/web-admin`] + 1 Flutter mobile [`apps/mobile`] + `infrastructure/`). Lint + pre-commit hooks wired.
2. **AWS staging provisioned via Terraform** — EKS 1.29, Aurora PG 15 (Multi-AZ, cluster endpoint), Redis 7 cluster, OpenSearch 2.x, NATS JetStream (3-node), S3 + CloudFront, Secrets Manager, WAF.
3. **Local dev stack** — Docker Compose with Postgres, Redis, OpenSearch, NATS, LocalStack (for S3/SecretsManager). One-command bootstrap.
4. **CI/CD pipelines** — GitHub Actions (build, test, Snyk, Trivy) → ECR → ArgoCD. ArgoCD configured with **auto-sync OFF** (per [GAP-17 v1.2 amendment](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)).
5. **Observability stack** — Prometheus, Grafana, Loki, Tempo deployed to staging EKS. Default service dashboards scaffolded.
6. **Coding standards + ADR process** — `docs/adr/` template, PR template with backward-compat checkbox ([OI-01](../06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md)), DoR/DoD checklist embedded.
7. **Team norms published** — pair rotation, review SLAs, on-call roster skeleton.
8. **All three web apps dockerized** — `apps/web-student`, `apps/web-portal`, `apps/web-admin` each ship a multi-stage `Dockerfile` (node build → nginx serve), an nginx config that proxies `/api` to the gateway in dev, and a matching service in `infrastructure/docker/docker-compose.yml` on ports 35173 / 35174 / 35175 (per the `+30000` convention in the app READMEs). Corresponding CI paths-filter job + Trivy per-image scan + ECR repo + Helm chart stub per app. The existing web-app CI job is forked three ways (one per app) so a failing student-app build does not block an admin-app merge.
9. **Flutter mobile build pipeline** — `apps/mobile` has `flutter create .` run and `ios/` + `android/` platform folders committed; GitHub Actions lane builds debug APK + iOS simulator artefact on PR; Firebase App Distribution + TestFlight wiring stubbed (production certs Sprint 3).
10. **Shared frontend packages** — a `packages/` workspace landed under the pnpm workspace with the following libraries, each publishable internally and consumed by the three web apps:
    - `@alp/design-system` — tokens + primitive components (Input, Button, Badge, Modal, Table, Nav, etc.) per the [Common Controls Specification](../01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md). Sprint 0 publishes v0.1 with §2 tokens + §3.1–3.3 primitives; Storybook deployed to S3/CloudFront.
    - `@alp/icons` — shared SVG icon set (Lucide baseline + any brand-custom icons).
    - `@alp/api-client` — TypeScript client generated from `openapi/phase1.yaml` (openapi-typescript-codegen); one package consumed by all three web apps so types stay in lock-step with the contract.
    - `@alp/auth-client` — shared JWT + refresh + Google/Apple SSO flow and secure token storage. Web apps never reimplement auth.
    - `packages/design-tokens-flutter` — Dart mirror of `@alp/design-system` tokens so Flutter theme matches web brand.
11. **Design System Specification approved** — [07_CommonControls_Specification_AdaptiveLearningPlatform.md](../01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md) signed off by Designer + FE Leads + Tech Lead by end of Sprint 0 Day 5. Brand-colour and typography TBDs resolved; token slots filled.
12. **Cross-app conventions locked** — one decision per item, recorded in the spec or CONTRIBUTING.md: i18n library (`react-i18next` web, `flutter_localizations` mobile), form library (`react-hook-form`), data-fetching (`@tanstack/react-query`), router (`react-router` v6), state (`zustand` or react-query-only), error-boundary + telemetry pattern, env-var loading + runtime config shape.

### Gap closure gating Sprint 1 (Sprint 1 Start Gate — GAP-24)
| Item | Owner | Must be YES before Sprint 1 starts |
|---|---|---|
| GAP-07 ADR-0001 feature flag decision | CTO | ☑ Resolved 2026-04-22 — in-house tenant-aware flag service in Institution, Super Admin panel UI. See [ADR-0001](../adr/0001-feature-flag-platform.md) and [ResolutionsLog_GapRegister_v1.2.md](../06_gaps_resolution/ResolutionsLog_GapRegister_v1.2.md). |
| GAP-13 User Stories v2 changelog distributed | Tech Lead | ☐ |
| GAP-18 delegation order (5 levels) signed | CTO + Tech Lead | ☐ |
| GAP-23 dependency graph shared with engineering | Tech Lead | ☐ |
| GAP-24 gate sheet signed | Tech Lead | ☐ |
| GAP-09 seed script *specification* complete (not implementation) | QA Lead | ☐ |
| All P1 gaps have owner + due + known resolution | Tech Lead | ☐ |

### Exit criteria
- Developer can clone the repo, run `make dev`, and see all services healthy locally in < 15 minutes.
- `terraform plan` on staging shows zero drift.
- CI pipeline runs on PR and blocks merge on lint/test/scan failure.
- `make dev` also boots the three web apps (via Docker or concurrent `pnpm dev`) and a `flutter run` device target for the mobile app — a new engineer can reach each surface in the browser / simulator.
- `@alp/design-system` v0.1 published internally; Storybook reachable; the three web apps can import `<Button />` and `<Input />` from it and render without local overrides.
- Common Controls Specification signed off (§2 tokens filled, §3 inventory approved).
- Gate sheet signed.

### Risks
- ~~CTO decision on GAP-07 delayed → Sprint 1 config PRs blocked.~~ **Resolved 2026-04-22** — ADR-0001 Accepted. Residual risk: Institution shell capacity (~10 SP) needs confirmation at Sprint 1 planning; if capacity is tight, descope Search typeahead to Sprint 2 rather than the flag module.
- AWS IAM/quota delays. Mitigation: file quota increase requests Day 1.
- **Design-system slip risk** — Sprint 1 FE feature work depends on `@alp/design-system` v0.1 landing by Sprint 0 Day 8 and token values being locked by Day 5. If Designer is blocked on brand-colour decisions, fallback is to ship the package with placeholder tokens and a global `token.override.css` that the Designer can edit without touching TSX; visual polish then catches up during Sprint 1 without blocking feature work.

---

## Sprint 1 — Auth, Profile, Catalog, Search + critical spikes (Weeks 3–4)

**Goal**: First feature surface live in staging. De-risk adaptive engine and NATS partition before Sprint 2.
**Closed beta opens Week 4** — 20 internal @adaptivelearn.in accounts first.

### Feature work (~120 SP — raised from 110 per GAP-07 resolution 2026-04-22)
| Epic | Stories | Owner |
|---|---|---|
| Auth — registration, email/SMS OTP, login, JWT, refresh | STU-REQ-01..08 | BE Lead Python (Auth) |
| User Profile — onboarding FSM, exam selection, JWT claim propagation | STU-REQ-53..58 | BE Lead Python (Profile) |
| Catalog — Exam→Subject→Topic hierarchy, browse, EN-only index | STU-REQ-24..27 | BE Lead Python (Catalog) |
| Search — federated search, EN-only, typeahead | STU-REQ-28..30 | BE Lead Python (Search) |
| **Institution shell + feature-flag module** (thin slice — no admin UI yet; per [ADR-0001](../adr/0001-feature-flag-platform.md)) — `feature_flags` + `feature_flag_overrides` + `feature_flag_audit` tables; REST endpoints `GET/PUT /flags/:name` and `PUT /flags/:name/tenants/:id`; NATS `flag.changed` publisher; Python + Go client SDKs with Redis 30s TTL + NATS invalidation + hardcoded fallback | — | BE Lead Python (Institution) + DevOps |
| `web-student` shell — routing, auth flows, onboarding, catalog browse, search UI. Consumes Auth/Profile/Catalog/Search APIs. | — | FE Lead A |
| `web-portal` scaffold — app bootstrap only (routing, auth callback, role gate stub). No feature screens this sprint. | — | FE Lead B (part-time) |
| `web-admin` scaffold — app bootstrap only (routing, auth callback, MFA gate stub). No feature screens this sprint. | — | FE Lead B (part-time) |
| Mobile shell (Flutter, one codebase for iOS + Android) — routing, auth flows, onboarding, platform signing config. Token storage per SPIKE-05. | — | Mobile Leads (2) |

### Gap closure (~60 SP)
- **GAP-16**: fallback config flags in all 7 services (includes Adaptive Engine `irt_model_enabled` and Notification `push_channel_enabled` / `sms_channel_enabled` per v1.2 amendment). One PR per service.
- **GAP-11**: Quiz schema audit columns (`created_by_ip`, `user_agent`), Content audit log table, Analytics mastery `created_at`.
- **GAP-25**: structlog startup config logging in every service (unconditional). Request middleware only if GAP-07 adopts a flag service.
- **GAP-27**: backward-compatibility rule published. `X-Client-Version` header logged in gateway middleware.
- **GAP-09**: seed script implementation (`scripts/seed_staging.py`). Exercised nightly in CI.

### Technical spikes (must close by end of sprint)
| Spike | Gap | Owner | Days |
|---|---|---|---|
| SPIKE-01 — IRT cold-start calibration vs 3PL | GAP-02 | ML Engineer | 5 |
| SPIKE-07 — NATS partition + failover + DLQ | GAP-06 | DevOps Lead | 4 |
| SPIKE-02 — OpenSearch Hindi analyzer baseline | GAP-04 | BE Lead Python (Search) | 3 |

### Exit criteria
- Auth + Profile + Catalog + Search deployed to staging; beta users can sign up, onboard, and browse the catalog.
- SPIKE-01 decision: keep binary-search cold-start OR switch to EAP Bayesian estimator. ADR filed.
- SPIKE-07 results documented. NATS config (R=3, AckWait=120s, MaxAckPending=1000) committed to IaC.
- All Sprint 1–due items in Gap Register closure checklist marked done.
- Contract tests run in CI against `openapi/phase1.yaml`.

### Risks
- SPIKE-01 fails acceptance → Adaptive Engine design changes for Sprint 2. Budget 2 days of rework.
- Closed beta user feedback surfaces auth UX issues. Reserve 10% of sprint for fast follow-ups.

---

## Sprint 2 — Quiz, Adaptive Engine, Analytics, Content, Notification, Hindi search (Weeks 5–6)

**Goal**: Complete the core student journey end-to-end: register → browse → take adaptive quiz → see readiness score → receive notification.

### Feature work (~130 SP)
| Epic | Stories | Notes |
|---|---|---|
| Quiz Service — session FSM, start/next/submit, resume, PRACTICE + MOCK modes | STU-REQ-15..23 | Session TTL 90 min (GAP-10). Idempotent answer submission (GAP-21 AC-05). |
| Adaptive Engine — 3PL IRT, MFI selection, cold-start, exposure control | STU-REQ-19 (expanded) | Uses SPIKE-01 outcome. `irt_model_enabled` internal flag. |
| Analytics — EWA mastery, readiness score, streak tracking | STU-REQ-20, 23 | EWA rationale in LLD (GAP-03). A/B instrumentation prepared. |
| Content — MCQ authoring, peer review, AI moderation | STU-REQ-31..44 | Published via NATS `content.published` event. |
| Notification — 11 types, preferences, FCM+APNs+SendGrid+Twilio | STU-REQ-14 (expanded) | Dedup per GAP-05 product decision. |
| Search — Hindi + Hinglish, always-dual-path | STU-REQ-28..30 (expanded) | GAP-04 decision applied. |
| `web-student` — adaptive quiz UI (start/next/submit/resume), readiness score dashboard, notification preferences, Hindi/English language toggle | STU-REQ-15..23, 14 | Owner: FE Lead A. Consumes Quiz + Adaptive + Analytics + Notification APIs. |
| `web-portal` — content authoring screens (MCQ create, peer review queue, AI moderation flag triage). First operator-surface drop. | STU-REQ-31..44 | Owner: FE Lead B. EPIC-08/09 subset. |
| Mobile (Flutter) — adaptive quiz flow, offline queue (STU-REQ-59), readiness score, push-notification integration (FCM+APNs) | STU-REQ-15..23, 14, 59 | Mobile Leads (2). Offline queue per GAP-10/GAP-15 decision. |

### Gap closure (~40 SP)
- **GAP-01** circuit breaker in Quiz `internal/adaptive/client.go`. Prometheus gauge + PagerDuty alert wired.
- **GAP-10 / STU-REQ-59** mobile offline queue + web IndexedDB queue (scope per [GAP-15 decision Option A/B/C](../06_gaps_resolution/GapResolutionRegister_v1.1_AdaptiveLearningPlatform.docx)).
  - Includes AC-07/08 app-kill persistence and HoP timer-behaviour decision.
- **GAP-25** per-request flag logging middleware (Python services), if flag service adopted.
- **GAP-28** cache key versioning pattern (`profile:v1:{user_id}`) in all new caches.
- **Contract tests** (OI-01) extended as each new endpoint lands.

### Exit criteria
- End-to-end journey works: a beta student can register → take adaptive quiz (10 questions) → see readiness score → receive push notification of result. Latency and accuracy manually verified.
- GAP-01 circuit breaker validated: killing Adaptive Engine pod in staging causes Quiz to fall to PRACTICE mode within 100ms.
- Hindi + Hinglish search returns sensible results on the 12-row test matrix from GAP-04.
- All Sprint 2–due gap items closed.

### Risks
- Adaptive Engine cold-start path takes first 3 questions to stabilize — if simulation results from SPIKE-01 are worse than expected, reserve 3 days to implement EAP fallback.
- Mobile offline queue slips → downgrade STU-REQ-59 to Option C (Sprint 3) per GAP-15.

---

## Sprint 3 — Payment, Institution, hardening, drills (Weeks 7–8)

**Goal**: All 11 services live in staging. Load tests pass. Drills 1+2 pass at T-14.

### Feature work (~100 SP)
| Epic | Stories | Notes |
|---|---|---|
| Payment — Stripe Checkout, subscription FSM, webhook HMAC, dunning | STU-REQ-01..13 | PCI SAQ A. Webhook idempotency. |
| Institution — onboarding, cohorts, assignments, teacher dashboard (backend) | STU-REQ-45..52 | `assignments_enabled` flag. |
| `web-student` — checkout flow, subscription management, streaks / leaderboard / profile edits / avatar upload | STU-REQ-01..13, misc | Owner: FE Lead A. Avatar upload is a descope candidate per GAP-15. |
| `web-portal` — teacher dashboard (cohorts, assignments, batch analytics), moderator review queue, institution-admin user search + invite links | EPIC-08 / EPIC-09 / EPIC-10 slices | Owner: FE Lead B. First full operator release. |
| `web-admin` — platform overview dashboard, user management (search/suspend/impersonate), **feature-flag management panel** per [ADR-0001](../adr/0001-feature-flag-platform.md), audit log viewer | ADM-REQ-01..08, 20 + ADR-0001 | Owner: FE Lead B (shared with `web-portal`); flag UI is the MVP cut (toggle + override + audit view). MFA-gated. |
| Mobile (Flutter) — Stripe checkout (SDK or hosted), streaks display, leaderboard, profile edits | STU-REQ-01..13, misc | Mobile Leads (2). Platform checkout compliance (Apple in-app review) per release-plan notes. |

### Gap closure + QA (~70 SP)
- **LT-SEARCH-03 + LT-SEARCH-03B** bilingual load test with random query generation and drained-node variant (GAP-14 v1.2 amendments).
- **LT-PIPELINE-01** end-to-end backpressure test with `pg_sleep()` Aurora stress trigger (GAP-31).
- **GAP-22** Aurora failover test: trigger failover, measure RTO, verify all 11 `DATABASE_URL` values use cluster endpoint. PITR restore test on a separate cluster.
- **GAP-12** rollback decision tree + **GAP-17** manual + kubectl fallback + flap guards published in Runbook.
- **GAP-19** PIR timing aligned across Go-Live Checklist, GAP-12 text, Monitoring Plan.
- **GAP-28** cache flush runbook step (Step 2.5 between rollback and smoke test).
- **GAP-30** PIR template created and linked from Runbook.
- **GAP-08** SLO → business impact mapping added to Monitoring Plan.
- **GAP-29 Drills 1 + 2** executed at T-14 (end of Week 8). Drill reports appended to Go-Live Checklist.
- **OI-03** Vendor Risk Register published.

### Exit criteria
- All 11 services deployed to staging. Beta users can complete the full flow including premium upgrade.
- Load tests pass at 500 VU with bilingual query mix (p99 search < 150ms, typeahead < 80ms, zero OpenSearch 429s).
- Aurora failover in < 60s. PITR restore of arbitrary 10-min window completes < 30 min.
- Drills 1 + 2 passed on first or second attempt.
- Monitoring Plan complete with SLO↔business mapping.

### Risks
- Stripe webhook edge cases surface late. Mitigation: implement webhook replay tool by Day 3.
- Load test fails under concurrent bilingual load — revert to 50% threshold per GAP-14 fallback action.
- **FE capacity crunch** — 2 FE engineers own three web apps from Sprint 3 onward (`web-student` consumer checkout, `web-portal` operator surface, `web-admin` flag management + ops tooling). Mitigation: `web-admin` Sprint 3 scope is **flag management + user management + dashboards only** — remaining ADM-REQ epic items (revenue, plans, moderation-team management, announcements) deliberately deferred to Phase 1.5. If `web-portal` teacher dashboard slips, descope batch analytics to Phase 1.5 and ship cohorts + assignments only.

---

## Sprint 4 — Stabilization, drills, launch (Weeks 9–10)

**Goal**: Soft launch Week 9, full launch Week 10, no P0 defects at handover.

### Week 9 (Sprint 4a) — T-7 to T-0

**T-7 day review and Drills 3 + 4**
- Drill 3: flag kill switch in staging — < 2 min (flag service) or < 5 min (Secrets Manager + restart).
- Drill 4: cache flush — Aurora CPU spikes and recovers within 60s, zero 5xx during warm period.
- Drill 2b (blackout escalation, per [OI-05](../06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md)) added to the schedule.

**Go-Live Checklist walkthrough**
- All ★ items marked ☑. Any EXCEPTION requires written justification and CTO sign-off.
- 10-role final sign-off: TL, HoP, CTO, Security Lead, QA Lead, DevOps Lead, BE Lead Go, BE Lead Python, 5th Delegate, DBA.

**Phase 1b soft launch (Week 9 Day 5)**
- Lift registration gate for invite/waitlist cohort (~500 users).
- Enable `premium_tier_enforcement=true`, `checkout_enabled=true`.
- LaunchDarkly (or Unleash) flag `adaptive_quiz_enabled` to 100%.
- War room staffed: TL + DevOps Lead + BE Lead Python on-call during business hours.

**Client polish (all surfaces)** — soft-launch exit criteria require P0 UX defects cleared on every client surface:
- `web-student` — Lighthouse budget + a11y pass + Hindi copy review.
- `web-portal` — operator keyboard-flow QA, table-density pass, bulk-action audit.
- `web-admin` — MFA flow verified, IP allow-list applied, flag-management panel dry-run during Drill 3.
- Mobile (Flutter) — iOS + Android store-submission build, FCM/APNs push live-fire, offline-queue soak test on real device.

### Week 10 (Sprint 4b) — Launch

**Phase 1c full launch**
- Public registration on.
- 24/7 on-call rotation active per GAP-18 delegation order.
- Instant rollback authority pre-authorised for Payment, Auth, Quiz per GAP-18 pre-authorised rollback list.
- Post-Launch Monitoring Plan active: SLO burn, error budget, business metrics tracked daily.

**T+7 post-launch review**
- Weekly health review agenda (per GAP-08): any SLO breach correlated with business metric movement?
- Begin MASTERY-AB-01 A/B test data collection (per GAP-03, 30-day collection, 90-day report).
- Retrospective: collect learnings for Phase 2 scope.

### Exit criteria
- Zero P0 defects in production for 5 consecutive days post-launch.
- SLO compliance ≥ 99.5% across all services in launch week.
- All four drills reports archived in Go-Live Checklist.
- First post-launch PIR (if any P1 incident) completed per GAP-19 / GAP-30 process.

---

## Cross-sprint ceremonies

| Ceremony | Cadence | Purpose |
|---|---|---|
| Sprint Planning | Day 1 of each sprint (4h) | Backlog → committed sprint scope |
| Daily Standup | 15 min, 09:30 IST | Progress + blockers |
| Backlog Refinement | Wed + Fri 30 min | Upcoming stories → DoR |
| Spike Review | End of sprint during spikes | ADR sign-off |
| Sprint Review + Retro | Last day of sprint (2h + 1h) | Demo + learnings |
| Gate Review | Sprint 0 end, T-14, T-7 | Sign-off checkpoints |
| War Room | Week 9–10 (launch) | Real-time incident response |

## Tracking

- **Backlog**: GitHub Projects (monorepo) or Linear — decide in Sprint 0 Day 1.
- **Gap closure**: the [v1.2 closure checklist](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) is the single source of truth. Each ☐ owned by one named individual.
- **Velocity**: recorded after each sprint. Baseline 170 SP/sprint; adjust if S1 delivers materially above/below.
- **Risk register**: reviewed at each sprint review. New risks logged with owner + mitigation.

## Contingency

| Trigger | Response |
|---|---|
| Velocity < 140 SP in Sprint 1 | Descope: defer Institution to Phase 1.5 post-launch. Maintain Student + Teacher roles only for MVP. |
| SPIKE-01 or SPIKE-07 fails acceptance | Add 3-day rework block in Sprint 2. Escalate to CTO if rework blocks Sprint 2 exit. |
| Major security finding in pen test | Full-sprint freeze on affected service. Revisit launch date. |
| Load test LT-SEARCH-03 fails | Revert to 50% threshold (GAP-14 fallback). Re-run test. If still fails: descope Hindi search to Phase 1.5. |
| Aurora failover > 60s | Do not launch. File P0 infrastructure ticket. Escalate to AWS support. |
