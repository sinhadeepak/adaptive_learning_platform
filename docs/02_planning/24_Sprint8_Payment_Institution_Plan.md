# Sprint 8 — Payment + Stripe + Institution Core — Plan

**Sprint number**: 8 of the post-MVP arc.
**Author**: Tech Lead.
**Status**: 📋 **PLANNED** — sequencing reset 2026-04-27 after the user clarified that staging cutover (originally scoped for Sprint 8) **only happens once Phase 1, Phase 2, and Phase 3 sprints are all complete** alongside Stripe integration. The earlier Sprint-8-as-staging plan is preserved at [24_DEPRECATED_Staging_Cutover_Plan.md](24_DEPRECATED_Staging_Cutover_Plan.md) for reference; the gate items / drills / runbooks in that doc remain valid for the eventual staging sprint, just not for *this* sprint.

**Inputs**:
- [Phase 1 Retrospective](20_Phase1_Retrospective.md) — explicitly deferred Payment + Institution
- [Phase 2 Sprint Development Plan §P2-S1 / §P2-S3](19_Phase2_SprintDevelopmentPlan.md) — Payment + Institution scope
- [BRD §Monetization](../00_requirements/02_BRD_v2_Adaptive_Learning_Platform.docx) — Stripe Checkout + subscription FSM
- User direction (2026-04-27): "I cannot push the code to staging unless all the phases and sprints are complete… AWS will also be involved during the staging phase along with the Stripe integration."

---

## 1. Why Payment now

The Phase 1 retro recorded:

> **5.2 Payment + Institution are foundational for B2B revenue, not optional**

User direction confirms: staging push needs **Stripe integration** in place. That makes Payment the unblocker for *every* subsequent sprint that depends on staging (drills, OAuth credentials, notification real channels, …).

Institution Core ships in the same sprint because the two are coupled — a paying user maps to a tenant, a tenant maps to a billing relationship, cohorts inherit the tenant's subscription tier. Splitting them would create a window where Payment is wired but Institution can't consume it.

## 2. Goal (singular)

**By close**: a student can sign up, hit the Stripe paywall, complete Checkout against Stripe test mode, land back in the app with a `STUDENT_PREMIUM` role, and Institution Core has the cohort/assignment skeleton ready for an eventual teacher-portal sprint.

If the Checkout round-trip is broken on Day 10, we don't open the next sprint.

## 3. Capacity + team focus

**Capacity**: 80 SP. Heavier than Sprint 8's original 60 because feature work is well-understood — the unknowns (AWS access, real OAuth) are no longer in scope.

**Team focus**:
- **BE Python (3)** — Payment service (1), Institution Core (1), shared subscription FSM + role propagation across services (1)
- **BE Go** — Quiz service tier-gating (premium-only mock tests, premium-only photo doubt rate limits)
- **FE React (web-student)** — Paywall page, Checkout redirect, post-checkout success/failure, premium UI hints (badge, limited-feature locks)
- **FE React (web-portal)** — Institution onboarding wizard skeleton (admin creates a tenant, invites a student to a cohort)
- **Mobile (Flutter)** — Paywall screen + WebView for Checkout (Stripe SDK comes in P2-S2 if scope holds)
- **ML** — standby; recommendations work pulls forward only if all of the above lands by Day 7
- **QA** — Stripe webhook race-condition test plan, subscription FSM exhaustive coverage, multi-tenant isolation
- **Designer** — Paywall + checkout-success copy + premium-pill design tokens
- **DevOps** — Stripe webhook signing-secret rotation procedure documented; no infra changes
- **PM** — Stripe test-mode keys provisioned Day 1; price IDs locked Day 2

## 4. Backlog

### 4.1 Payment Service (Python)

| # | Item | Acceptance |
|---|---|---|
| **P-1** | New `payment_schema` migrations: `customers`, `subscriptions`, `webhook_events` tables | `alembic upgrade head` clean; smoke insert returns valid uuid |
| **P-2** | Stripe SDK wired (`stripe-python`); test-mode key in `.env` | `from stripe import Customer; Customer.create(...)` works against test mode |
| **P-3** | `POST /payment/checkout/session` — creates Checkout Session for the calling user | Returns `{url, sessionId}`; web client redirects to Stripe |
| **P-4** | `POST /payment/webhook` — verifies signature, idempotent on `webhook_events.id` | Stripe `--forward-to` CLI delivers events; FSM transitions logged |
| **P-5** | Subscription FSM: `INACTIVE → CHECKOUT_PENDING → ACTIVE → CANCELED → REACTIVATED` | State machine has a single transition function; rejects illegal moves with 409 |
| **P-6** | `customer.subscription.created` + `.updated` + `.deleted` handlers | Each event flips DB state + publishes `payment.subscription.changed` to NATS |
| **P-7** | `GET /payment/me` — returns the calling user's subscription summary | `{tier, status, periodEnd, cancelAtPeriodEnd}` |
| **P-8** | Tests: 1 happy path Checkout, 1 webhook signature failure, 1 idempotent dup-webhook, 1 each transition in the FSM | ≥ 12 tests green |

### 4.2 Subscription role propagation

Stripe is the source of truth, but every service needs to know "is this user premium?" without round-tripping to Payment.

| # | Item | Acceptance |
|---|---|---|
| **R-1** | New role: `STUDENT_PREMIUM`. Auth issues this role in JWT when Payment marks the user ACTIVE | `decode_token(...)` reflects new role |
| **R-2** | Auth subscribes to `payment.subscription.changed` — flips `users.role` accordingly + invalidates active sessions on tier downgrade | Live smoke: webhook → role change → user is forced to re-login on next request |
| **R-3** | Quiz Go: gate `mock` mode on `STUDENT_PREMIUM` (free tier gets practice only) | 403 with `{"code":"premium_required"}` for free-tier mock attempt |
| **R-4** | Adaptive Engine: rate-limit `/adaptive/doubt/photo` for free tier (3/day; unlimited for premium) | 429 with `{"code":"daily_limit"}` after 4th call same UTC day |

### 4.3 Institution Core

| # | Item | Acceptance |
|---|---|---|
| **I-1** | `institution_schema.tenants` + `cohorts` + `cohort_members` tables | migrations clean; smoke insert returns valid uuid |
| **I-2** | `POST /institution/tenants` (admin only) | Creates tenant; sets `tenant_id` on creating admin's profile |
| **I-3** | `POST /institution/cohorts` + `POST /institution/cohorts/{id}/invite` | Email link → student lands on signup with `?cohort=...` prefilled |
| **I-4** | Tenant-scoped subscription: institution-tier paywall covers all cohort members | Webhook with `metadata.tenant_id` flips all members to PREMIUM |
| **I-5** | Tests: 1 tenant create, 1 cohort invite happy path, 1 cross-tenant isolation (tenant A's admin can't list tenant B's cohorts) | ≥ 8 tests green |

### 4.4 Frontend — paywall + premium UI

| # | Item | Acceptance |
|---|---|---|
| **F-1** | `/billing` route on web-student — current tier + "Upgrade" / "Manage" buttons | Renders against /payment/me real data |
| **F-2** | Paywall modal — surfaces on attempted premium action (mock test for free tier, etc.) | Click → /payment/checkout/session → Stripe redirect |
| **F-3** | Post-checkout `?session_id=...` lander — polls /payment/me until role flips | Race-condition tested with delayed webhook |
| **F-4** | Premium pill in Profile + sidebar avatar tooltip | Renders only when role === STUDENT_PREMIUM |
| **F-5** | Mobile: Paywall screen + Checkout WebView | Same flow; Stripe SDK deferred to P2-S2 |

### 4.5 Stretch (only if 4.1–4.4 land by Day 7)

- **S-1** — Institution Cohort dashboard read-side (teacher sees per-student readiness)
- **S-2** — Recommendations engine MVP (collaborative-filtering on quiz attempt history)
- **S-3** — Web Experts → backend doubts migration (1101 lines of localStorage chat → /doubts persistence)

## 5. Out of scope (explicitly)

- AWS staging deploy / EKS / Aurora / drills (per user direction — moved to post-Phase-3)
- OAuth Google + Apple SSO live (still credential-blocked; out of this sprint)
- Real notification channels (SendGrid / Twilio / FCM) — staying on Mailpit + in-app inbox until staging
- RS256 + JWKS migration — keeps HS256 until staging
- i18n framework + RTL/Arabic — that's P2-S2 territory
- Live tutor sessions / WebRTC / native video — P2-S3
- B2B REST API — P2-S4

## 6. Definition of Done (sprint exit)

By Day 10:
1. ✅ Stripe Checkout round-trip works end-to-end against test mode (free → premium → free)
2. ✅ JWT `STUDENT_PREMIUM` role propagates to Quiz + Adaptive Engine + Auth on webhook
3. ✅ Free-tier hits the paywall on attempted mock test (Quiz returns `premium_required`)
4. ✅ Institution Core tables + create-tenant + create-cohort + invite endpoints live; 1 cross-tenant isolation test green
5. ✅ Paywall UI on web-student + mobile paywall placeholder; premium pill renders
6. ✅ ≥ 20 new tests across Payment + Institution + Auth role propagation; full repo suite green

If any criterion is red on Day 10: extend by 3 days, no Phase 2 sprint kicks off until green.

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Stripe test-mode keys not provisioned Day 1 | Block PM; sprint slips by however long it takes |
| R-2 | Webhook race condition (Stripe redirect arrives before webhook) | Post-checkout client polls /payment/me every 2s for up to 30s; surfaces "still processing" on timeout |
| R-3 | NATS `payment.subscription.changed` consumer lag → user upgraded but Auth not yet flipped | Force re-auth on every Payment side effect; client's next 401 → re-login → fresh JWT |
| R-4 | Cross-tenant data leak from Institution Core | Every read / write goes through `tenant_id_required` middleware; QA owns the invariant test |
| R-5 | Mobile WebView Checkout flow breaks on Apple/Google review (in-app purchase rules) | Web-only Checkout for sprint 8; native IAP integration scoped for P2-S2 |

## 8. Sequence after this sprint

| Sprint | Theme | Closure expectation |
|---|---|---|
| **Sprint 9** | Phase 2 Sprint 1 — i18n framework + RTL/Arabic UI flips | 4 weeks; closes localization carry-over |
| **Sprint 10** | Phase 2 Sprint 2 — Live sessions + native video infra | WebRTC tutor sessions + recording + adaptive bitrate |
| **Sprint 11** | Phase 2 Sprint 3 — Advanced institution analytics + B2B API | Cohort comparative analytics + B2B REST API + OAuth2 client-credentials |
| **Sprint 12** | Phase 2 Sprint 4 — Stabilization + Phase 2 retrospective | Phase 2 closure |
| **Sprint 13–18** | Phase 3 — 6 sprints (marketplaces, B2B writes, predictive analytics, …) | Per [21_Phase3_SprintDevelopmentPlan](21_Phase3_SprintDevelopmentPlan.md) |
| **Sprint 19** | **Staging cutover** (per user direction — only after all phases above) | Deferred plan in [24_DEPRECATED_Staging_Cutover_Plan.md](24_DEPRECATED_Staging_Cutover_Plan.md). Promote to active when reached. |

The platform's full lifecycle now: 7 closed (S1–S7) + this sprint (S8) + 11 more before staging (S9–S19) = **19 sprints total before push to staging**.

## 9. Sign-off gates

- Tech Lead: backlog 4.1–4.5 each row green
- QA: full regression including new Payment + Institution suites
- Head of Product: Stripe price IDs + tier definitions reviewed
- PM: Phase 2 sprint sequence reviewed for consistency with [19_Phase2_SprintDevelopmentPlan](19_Phase2_SprintDevelopmentPlan.md)

CTO sign-off is **not** required for this sprint (no AWS / staging touchpoints).
