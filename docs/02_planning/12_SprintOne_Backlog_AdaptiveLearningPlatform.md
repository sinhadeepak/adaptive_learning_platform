# Sprint 1 Backlog — Adaptive Learning Platform

**Sprint**: 1 of 4 feature sprints (Phase 1 India)
**Window**: Weeks 3–4 of 10. Planned duration 10 working days.
**Sprint goal**: First feature surface deployable — authenticated student can register, onboard, browse the catalog, and search in English. Three critical spikes closed. Tenant-aware flag service shipping as a thin slice so GAP-16 fallback flags can land across all 7 services.
**Closed beta opens**: Week 4 Day 5. 20 internal `@adaptivelearn.in` accounts.

**Team capacity**: 170 SP baseline per [Sprint Plan](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md); Sprint 1 commitment **168 SP** (feature 120 + gap closure 25 + spikes 15 + ceremony buffer 8).
**Authoritative inputs**: [User Stories v2](../00_requirements/05_UserStories_v2_Adaptive_Learning_Platform.docx), [Sprint Plan §Sprint 1](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md), [ADR-0001](../adr/0001-feature-flag-platform.md), [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx), [DoD/DoR](03_DoD_DoR_AdaptiveLearningPlatform.docx).

---

## 1. Sprint backlog — at a glance

**Feature work (120 SP, 35 stories)**

| Area | ST-IDs | Owner | SP | Notes |
|---|---|---|---|---|
| Auth (11 stories) | `ST-02-01-01..04`, `ST-02-02-01..03`, `ST-02-03-01..03`, `ST-02-04-01` | BE Lead Python A (Auth) | 34 | Covers `STU-REQ-01..11` — email+password, Google/Apple SSO, OTP, MFA hook, account lockout, logout, delete account, invite links (STU-REQ-06/07) |
| User Profile (9 stories) | `ST-03-01-01..02`, `ST-03-02-01..07` | BE Lead Python B (Profile) | 21 | Covers `STU-REQ-12..20` — exam selection FSM, language preference, target date, daily goal, profile edit, notification prefs |
| Catalog (4 stories) | `ST-04-02-01..04` | BE Lead Python C (Catalog) | 13 | Covers `STU-REQ-24..27` — browse all / filter / keyword search / course+topic detail. EN-only index. |
| Search (3 stories) | `ST-04-02-03` (keyword), + typeahead, + federated list | BE Lead Python C (Search) | 13 | Covers `STU-REQ-28..30` variants. OpenSearch English analyzer. Hindi deferred to Sprint 2 (SPIKE-02). |
| Institution shell + flag module (4 stories) | `FS-01..04` (new — see §3) | BE Lead Python B (Institution) + DevOps | 13 | Per [ADR-0001](../adr/0001-feature-flag-platform.md). No admin UI in Sprint 1. |
| `web-student` shell (auth + onboarding + catalog + search UI) | — | FE Lead A | 13 | Routing, auth screens, onboarding, catalog browse, search UI, JWT storage. Per [ADR-0003](../adr/0003-three-web-app-split.md) this is the consumer surface. |
| `web-portal` scaffold (routing + auth callback + role-gate stub) | — | FE Lead B | 2 | No feature screens in Sprint 1; first operator screens land Sprint 2 (content authoring). |
| `web-admin` scaffold (routing + auth callback + MFA gate stub) | — | FE Lead B | 2 | No feature screens in Sprint 1; flag-management UI + dashboards land Sprint 3. |
| Mobile shell — Flutter, one codebase for iOS + Android (auth + onboarding) | — | Mobile Leads (2) | 9 | Per [ADR-0002](../adr/0002-flutter-mobile-stack.md). SPIKE-05 informs token storage. Includes platform-specific signing + store config. |

**Gap closure (25 SP)**

| ID | Item | Owner | SP |
|---|---|---|---|
| GAP-16 | Fallback flag PRs in 7 services (Auth, Profile, Catalog, Search, Adaptive Engine, Notification, Quiz preparations) | 7 × BE Leads | 14 |
| GAP-25 | structlog startup + (if flag service adopted) per-request `flag.decision` — Sprint 1 covers startup only; per-request in Sprint 2 | All BE Leads | 4 |
| GAP-27 | Gateway middleware logs `X-Client-Version`; backward-compat rule published in CONTRIBUTING.md | Tech Lead + BE Lead Python A | 3 |
| GAP-09 | Seed script implementation per [spec](11_SeedScript_Specification.md) | QA Lead + BE Lead Python B | 4 |

**Spikes (15 SP)**

| Spike | Gap | Owner | Days |
|---|---|---|---|
| SPIKE-01 IRT cold-start calibration vs 3PL | GAP-02 | ML Engineer | 5 |
| SPIKE-07 NATS partition + failover + DLQ | GAP-06 | DevOps Lead | 4 |
| SPIKE-02 OpenSearch Hindi analyzer baseline | GAP-04 | BE Lead Python C (Search) | 3 |

**Ceremonies & slack (8 SP)** — standups, reviews, retro, buffer for closed-beta feedback fast-follows.

---

## 2. Sprint goals (acceptance at sprint review)

All seven must be demonstrable on the last day of the sprint to pass review:

1. **Register + log in**: new user can create an account with email + password, verify email via OTP, and receive a valid JWT + refresh token.
2. **Google / Apple SSO**: tested on web and Flutter mobile; SPIKE-05 informs token storage.
3. **Onboard**: user lands on the onboarding flow, selects an exam, sets target date, and lands on the home feed.
4. **Browse catalog**: user navigates Exam → Subject → Topic hierarchy in the web app.
5. **Search**: user types a query in English and sees results with typeahead < 80ms p99 on local dev stack.
6. **Flag service end-to-end**: Tech Lead changes `irt_model_enabled` from `false` → `true` via CLI; an Auth service in staging observes the change within 35 seconds (Redis TTL + NATS propagation).
7. **Three spikes closed**: SPIKE-01 ADR filed, SPIKE-07 NATS config committed to IaC, SPIKE-02 Hindi analyzer recommendation documented.

**Stretch (not counted in commit)**: closed beta registers 20 @adaptivelearn.in accounts, each completing steps 1–4 without manual intervention.

---

## 3. Institution flag-module thin slice — new stories

These four stories are not yet in User Stories v2 (they were created by [ADR-0001](../adr/0001-feature-flag-platform.md) on 2026-04-22). They will be folded into v2.1. Each is treated as a first-class Sprint 1 backlog item.

### FS-01  `feature_flags` + `feature_flag_overrides` + `feature_flag_audit` tables and DB migration

- **Area**: Institution service, Aurora PG Institution schema
- **Owner**: BE Lead Python B (Institution)
- **Story Points**: 3
- **Depends on**: nothing (first Institution deliverable)
- **Gherkin AC**:

  ```gherkin
  Scenario: Fresh migration creates all three flag tables
    Given a fresh Aurora PG instance with the Institution schema
    When `alembic upgrade head` runs
    Then the tables `feature_flags`, `feature_flag_overrides`, and `feature_flag_audit` exist
    And their columns match the schema sketch in ADR-0001

  Scenario: Migration is idempotent
    Given the migration has run once
    When it runs again
    Then no error is raised and no schema change occurs

  Scenario: Audit row is written on override insert
    Given a flag `irt_model_enabled` exists with default `false`
    When a row is inserted into `feature_flag_overrides` with `value=true`
    Then a matching row exists in `feature_flag_audit` with `old_value=NULL` and `new_value=true`
    (enforced via trigger OR service-layer; Institution team decides)
  ```

- **NFR**: migration runs in < 5 seconds on a 100-row Aurora instance.
- **Edge cases**: `ON DELETE CASCADE` on override when the parent flag is deleted — audit rows are NOT deleted (forensics).
- **DoD**: migration file committed, code review ☑, integration test in CI ☑, Alembic downgrade path tested ☑.

### FS-02  Institution service flag REST endpoints + auth guard

- **Area**: Institution service, FastAPI
- **Owner**: BE Lead Python B (Institution)
- **Story Points**: 5
- **Depends on**: FS-01
- **Endpoints** (all require admin scope in JWT):

  - `GET /api/v1/flags/:name` — return global default + per-tenant overrides
  - `PUT /api/v1/flags/:name` — set global default; writes audit row
  - `PUT /api/v1/flags/:name/tenants/:tenant_id` — set per-tenant override; writes audit row
  - `GET /api/v1/flags/:name/audit?limit=100` — return last N audit rows

- **Gherkin AC** (representative):

  ```gherkin
  Scenario: Admin toggles a flag globally
    Given an authenticated Super Admin
    And a flag `irt_model_enabled` exists with default `false`
    When they PUT /api/v1/flags/irt_model_enabled with body {"value": true}
    Then the response is 200
    And `feature_flags.default_value` is `true`
    And an audit row exists with old_value=false, new_value=true, admin_user_id matches JWT sub

  Scenario: Non-admin rejected
    Given an authenticated student (role != Admin)
    When they PUT /api/v1/flags/irt_model_enabled with body {"value": true}
    Then the response is 403
    And no audit row is written
  ```

- **NFR**: p95 < 50ms on toggle endpoint.
- **API contract**: to be added to [OpenAPI spec](../01_design/03_OpenAPI_v3.1_AdaptiveLearningPlatform.docx).
- **DoD**: endpoints deployed to local stack, contract tested, audit trail verified, OpenAPI updated.

### FS-03  NATS `flag.changed` publisher

- **Area**: Institution service
- **Owner**: BE Lead Python B (Institution) + DevOps
- **Story Points**: 2
- **Depends on**: FS-02; SPIKE-07 NATS config
- **Gherkin AC**:

  ```gherkin
  Scenario: Global toggle publishes event
    Given the endpoint from FS-02 succeeds
    When the handler returns
    Then a message is published on NATS subject `flag.changed`
    With payload {"flag_name": "irt_model_enabled", "scope": "global", "tenant_id": null, "new_value": true, "actor_user_id": "<uuid>", "ts": "<RFC3339>"}

  Scenario: Tenant override publishes event with tenant_id
    Given the endpoint from FS-02 tenant path succeeds
    Then the payload includes "scope": "tenant" and the correct tenant_id

  Scenario: Failed NATS publish does not roll back the DB write
    Given NATS is unreachable
    When the toggle endpoint is called
    Then the DB write succeeds and audit row is written
    And the publish error is logged at WARN with trace_id
    And a reconciliation background task republishes within 30 seconds
  ```

- **NFR**: publish latency p95 < 20ms.
- **DoD**: event shape committed to `schemas/events/flag.changed.v1.json`, contract test exercises all three scenarios, reconciliation task proved via failure-injection test.

### FS-04  Python + Go client SDK with Redis + NATS + hardcoded fallback

- **Area**: two libraries — `libs/python/alp_flags/` + `libs/go/alpflags/`
- **Owner**: DevOps + BE Lead Python B + BE Lead Go
- **Story Points**: 3
- **Depends on**: FS-02, FS-03
- **Gherkin AC** (representative for Python; Go library has identical behaviour):

  ```gherkin
  Scenario: Evaluate with tenant override present
    Given Redis has `flag:irt_model_enabled:default = false`
    And Redis has `flag:irt_model_enabled:tenant:T123 = true`
    When `get_flag("irt_model_enabled", tenant_id="T123")` is called
    Then it returns `true`
    And emits an OTEL span attribute `flag.decision=true` with `flag.source=tenant_override`

  Scenario: Fall back to hardcoded default when Redis unreachable at boot
    Given Redis is unreachable
    When `get_flag("irt_model_enabled")` is called
    Then it returns the hardcoded fallback constant (false for this flag)
    And emits span attribute `flag.source=hardcoded`
    And does not raise

  Scenario: Cache invalidated on `flag.changed` event
    Given the SDK has cached `flag:irt_model_enabled:default = false`
    When a NATS `flag.changed` event arrives with new_value=true and scope=global
    Then the next `get_flag("irt_model_enabled")` call returns `true`
    Within 100ms of event receipt
  ```

- **Fields in the evaluation span** (GAP-25): `flag.name`, `flag.decision`, `flag.source` ∈ {tenant_override, global_default, hardcoded, cache_hit_local, cache_hit_redis}, `flag.tenant_id`.
- **NFR**: evaluation p99 < 2ms when locally cached; < 15ms on Redis hit.
- **DoD**: both libraries published as internal packages, pinned in pyproject.toml and go.mod of all 7 services that will consume them, integration tested against local NATS + Redis.

---

## 4. Representative Auth + Profile + Catalog story detail

The flag-module stories above are documented in full because they are new. The remaining 30 feature stories are described in [User Stories v2](../00_requirements/05_UserStories_v2_Adaptive_Learning_Platform.docx) — engineers should read that source and not a summary. A few non-obvious or cross-cutting points surfaced here for sprint planning:

### Auth

- **ST-02-01-01 Register with email and password** (`STU-REQ-01`, 5 SP): email verification via OTP is synchronous (OTP sent immediately, token not issued until verified). Rate limit 3 OTP requests / 5 min / email.
- **ST-02-03-01 Account lockout** (`STU-REQ-10`, 3 SP): lock after 5 failed attempts / 15 min window; unlock after 30 min OR manual admin action (admin endpoint is Sprint 3). Lockout counter stored in Redis, not Aurora.
- **ST-02-02-01 SSO — Google + Apple** (`STU-REQ-02`, 5 SP): SPIKE-05 output is an input here; token storage pattern for mobile (Flutter) depends on the spike's recommendation.
- **JWT strategy**: access token 15 min, refresh token 30 days, rotation on refresh. Claim `tenant_id` propagated from Profile service at login time (via synchronous Profile lookup — Sprint 1 accepts 20ms overhead; Sprint 2 moves to Redis-cached claim).

### Profile

- **ST-03-01-01 Exam selection — mandatory gate** (`STU-REQ-12`, 5 SP): first login after registration routes to onboarding; user cannot reach the home feed until at least one exam is selected. FSM states: `NEW → EXAM_SELECTED → ONBOARDED`.
- **ST-03-02-02 Target exam date** (`STU-REQ-15`, 3 SP): `PATCH /profile/exams/:exam_id` with `target_date`. No past dates. One date per exam.

### Catalog + Search

- **ST-04-02-01..04** (`STU-REQ-24..27`, 13 SP total): browse → filter → keyword search → course+topic detail. Keyword search hits OpenSearch; browse and filter hit Aurora directly. EN-only index; Hindi index is Sprint 2 deliverable conditional on SPIKE-02 outcome.
- **Search typeahead (`STU-REQ-28..30` variants, 5 SP)**: OpenSearch `completion` suggester. p99 latency target < 80ms local, < 120ms staging.

**For everything else** (the other ~22 stories in the sprint), engineers work directly from User Stories v2. Each has complete Gherkin AC, BR, NFR, Dependencies, EC, DoD, Data, API, QA sections in the source.

---

## 5. Gap closure items — detail

### GAP-16 — fallback flag PRs in 7 services

One PR per service, each wiring the flag SDK from FS-04 to the relevant decisions. Flag list per service:

| Service | Flag | Default | Purpose |
|---|---|---|---|
| Adaptive Engine | `irt_model_enabled` | `false` | Binary-search cold-start vs 3PL IRT |
| Notification | `push_channel_enabled` | `true` | FCM+APNs kill switch |
| Notification | `sms_channel_enabled` | `true` | Twilio SMS kill switch |
| Notification | `email_channel_enabled` | `true` | SendGrid kill switch |
| Auth | `premium_tier_enforcement` | `false` | Off for Sprint 1 closed beta |
| Catalog | `premium_tier_enforcement` | `false` | Same flag, same default — Catalog respects it |
| Payment | `checkout_enabled` | `false` | Master switch (Sprint 3 wiring) |

**DoR per PR**: FS-04 library published, flag name seeded via [seed script](11_SeedScript_Specification.md) §7.
**DoD per PR**: service reads flag on the relevant decision path, structlog emits `flag.decision` attribute, unit test exercises both flag states.

### GAP-25 — startup + per-request flag logging

- **Sprint 1**: every service emits a `service.startup` structlog event including flag state. Already partly in place from Sprint 0 scaffold — extend to include current flag values.
- **Sprint 2**: FastAPI middleware emits `flag.decision` span attribute per request. Cardinality budget per [OI-04](../06_gaps_resolution/Appendix_OpenItems_GapRegister_v1.2.md) — measure before Sprint 3.

### GAP-27 — X-Client-Version + backward-compat rule

- Gateway (or Auth service, Sprint 1 rev proxy) logs `X-Client-Version` on every request.
- `CONTRIBUTING.md` updated with the backward-compat commitment text.
- OI-01 contract test enforcement is Sprint 2 work.

### GAP-09 — seed script implementation

Per [specification](11_SeedScript_Specification.md). Sprint 1 delivers `minimal` and `beta` profiles; `load` profile in Sprint 3 alongside load tests.

---

## 6. Spikes

### SPIKE-01 — IRT cold-start calibration vs 3PL

- **Owner**: ML Engineer
- **Days**: 5
- **Deliverable**: ADR + simulation harness + results comparing binary-search cold-start, EAP Bayesian, and 3PL full.
- **Acceptance**: ADR filed in `docs/adr/`. Recommendation adopted at sprint review.
- **Contingency trigger**: if simulation shows no approach meets < 3-question convergence target, escalate to Tech Lead + HoP for scope decision.

### SPIKE-07 — NATS partition + failover + DLQ

- **Owner**: DevOps Lead
- **Days**: 4
- **Deliverable**: k3d or local NATS 3-node config tested with partition injection. Final config committed to Terraform module `infrastructure/terraform/modules/nats/`.
- **Acceptance**: R=3, AckWait=120s, MaxAckPending=1000 config validated. DLQ subject + retry policy documented. Evidence: partition test output in spike report.

### SPIKE-02 — OpenSearch Hindi analyzer baseline

- **Owner**: BE Lead Python C (Search)
- **Days**: 3
- **Deliverable**: report comparing OpenSearch's built-in Hindi analyzer against a custom analyzer on the 12-row test matrix from [Gap Register v1.2 GAP-04](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx).
- **Acceptance**: ADR or comment in Search LLD documenting the chosen analyzer. Sprint 2 Hindi work proceeds from this decision.

---

## 7. Definition of Ready (sprint entry) — per story

Echoing [DoD/DoR](03_DoD_DoR_AdaptiveLearningPlatform.docx) — a story is Ready to enter Sprint 1 only when all boxes are ticked:

- ☐ Story exists in User Stories v2 (or is a sprint-authored story with equivalent detail, e.g. FS-01..04)
- ☐ Gherkin AC present
- ☐ Dependencies identified and scheduled
- ☐ Story points estimated by the team (not by an individual)
- ☐ Design wireframes available for UI stories
- ☐ API contract stub in OpenAPI (for backend stories touching public APIs)
- ☐ **For FE stories**: `@alp/design-system` v0.1 published (Sprint 0 exit criterion); required primitives (Input, Button, Badge, Modal, Nav, Tabs, Stepper, Form controls) are available in Storybook; tokens from [Common Controls Spec §2](../01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md) are filled in, not TBD

---

## 8. Definition of Done — sprint exit

A story counts toward sprint velocity only if:

- ☐ Code reviewed and merged into `main` (or a feature branch scheduled for merge before sprint review)
- ☐ Unit tests written, passing in CI
- ☐ Integration test present for any cross-service behaviour
- ☐ Observability hooks present: structlog, OTEL, metrics where applicable
- ☐ Feature flag wired for any gated behaviour
- ☐ DoD section of the story verified
- ☐ Contract test added (if applicable) to the `contract-tests` CI job
- ☐ Security review noted on PR for any auth/authz/PII code path
- ☐ Rolled to staging (if AWS staging is available; else local stack demo suffices per Sprint 0 AWS deferral)

---

## 9. Risks and contingencies

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AWS staging unavailable through Sprint 1 | Medium | Medium | Demo from local Docker Compose stack at review; defer staging deploy to Sprint 2 Week 1 Day 3 |
| SPIKE-01 does not converge | Low | High | Contingency 3-day rework budget allocated to Sprint 2 per Sprint Plan |
| Closed-beta users surface auth UX issues | High | Low-Medium | Reserve 10% of sprint (≈17 SP) for fast-follows; do not absorb into commit |
| Flag-module delivery slips | Low | High (blocks GAP-16) | Descope Search typeahead to Sprint 2 if FS-02/03 are late at Day 6 |
| Institution service SSO + JWT scope not yet defined | Medium | Medium | Tech Lead decision in Sprint 1 Day 1 planning; default to Super Admin scope gated by single hardcoded admin list for Sprint 1 only |
| `@alp/design-system` missing primitives at Sprint 1 Day 1 | Low | High (blocks all FE work) | Sprint 0 exit criterion gates this. If a primitive is missing at Day 1, FE Lead A commits the primitive to the design-system package first (one-day escape valve); FE Lead B pairs on the story. No bespoke-per-app reimplementation. |
| Brand tokens still TBD when FE work starts | Medium | Low–Medium | Ship with placeholder token values; `token.override.css` lets the Designer swap hex values without TSX edits. Visual polish catches up without blocking feature PRs. |

---

## 10. Ceremonies (Sprint 1 specific)

| Ceremony | When | Owner | Output |
|---|---|---|---|
| Sprint 1 Planning | Day 1, 09:30–13:30 IST | Tech Lead + PM | This doc finalised; stories in tracker |
| Daily standup | Days 1–10, 09:30 IST, 15 min | Rotating | Blocker list |
| Mid-sprint check | Day 5, 16:00 IST, 30 min | Tech Lead | Go/no-go on flag module; adjust scope if needed |
| Spike review | Day 8 afternoon | Tech Lead + CTO | SPIKE-01/02/07 ADRs signed off |
| Sprint review + demo | Day 10, 14:00 IST, 2h | Tech Lead | Demo to HoP, closed-beta cohort, CTO |
| Retrospective | Day 10, 16:00 IST, 1h | Tech Lead | Learnings, action items |

---

## 11. Distribution

| Role | Name | Read by | Date |
|---|---|---|---|
| Tech Lead | _______________________ | _______________________ | _________ |
| BE Leads (4) | _______________________ | _______________________ | _________ |
| FE Leads (2) | _______________________ | _______________________ | _________ |
| Mobile Leads (2) | _______________________ | _______________________ | _________ |
| ML Engineer | _______________________ | _______________________ | _________ |
| DevOps Lead | _______________________ | _______________________ | _________ |
| QA Lead | _______________________ | _______________________ | _________ |
| HoP + PM + CTO (for visibility) | _______________________ | _______________________ | _________ |

Backlog is committed by Tech Lead at the close of Sprint 1 planning. Any scope change after that requires a standup discussion + Tech Lead approval.
