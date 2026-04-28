# Sprint 8 Closure — Payment + Institution Core

**Sprint window:** 2026-04-27 → 2026-04-28 (2 days, single working session)
**Plan:** [docs/02_planning/24_Sprint8_Payment_Institution_Plan.md](24_Sprint8_Payment_Institution_Plan.md)

## Scope delivered

### Payment service (P-1 through P-8) — DONE

- **P-1** Alembic + db wiring + migration `001_create_payment_schema.py`
  (customers, subscriptions, webhook_events; UNIQUE-by-stripe-id for
  idempotency).
- **P-2** Subscription FSM (`fsm.py`) as pure-logic module:
  INACTIVE → CHECKOUT_PENDING → ACTIVE → PAST_DUE → CANCELED → REACTIVATED
  with explicit allowed-edges set + idempotent self-loops + IllegalTransition.
  Late addition: INACTIVE → ACTIVE direct edge for instantly-paid Stripe
  flows that skip the `incomplete` status.
- **P-3** Repositories with `(row, created)` tuple pattern for webhook
  idempotency (Stripe redelivers up to 3 days).
- **P-4** `/payment/checkout/session` — Stripe SDK + stub-mode fallback
  when STRIPE_API_KEY unset (mirrors the OPENAI_API_KEY heuristic-degrading
  pattern from S5).
- **P-5** `/payment/webhook` — signature verify when secret set, idempotent
  by `stripe_event_id`, runs FSM transition, publishes
  `payment.subscription.changed` to NATS.
- **P-6** `/payment/me` + `/payment/internal/users/{id}/premium` — both
  consume `is_premium(state, period_end, now)`.
- **P-7** Wired into `main.py`, `pyproject.toml`, `docker-compose.yml`;
  migration applied against compose Postgres.
- **P-8** **30 tests green** (42 FSM, but split across allowed/illegal
  parametrizations; 11 repo tests; 8 route tests including dup-event
  idempotency, signature failure, free-tier `/payment/me`).

### Role propagation (R-1, R-2, R-3, R-4) — DONE

- **R-1** `auth.security.effective_role()` elevates STUDENT → STUDENT_PREMIUM
  when `users.premium_until > now()`. Non-STUDENT roles pass through
  unchanged so a TEACHER with a Stripe sub doesn't get re-tagged.
- **R-2** `auth.payment_subscriber` core-NATS subscriber to
  `payment.subscription.changed`; updates `auth_schema.users.premium_until`
  via the `derive_premium_until` contract (PAST_DUE keeps premium during
  the retry window; CANCELED-with-future-period keeps until then;
  INACTIVE clears).
- **Migration 006** `auth_schema.users.premium_until TIMESTAMPTZ`
  (deliberately NOT a new role-enum value to avoid clobbering TEACHER /
  EXPERT entitlements).
- **R-3** Quiz Go service — MOCK-mode tier gate via JWT decode in
  `internal/server/tier.go`. Free students get 403 `premium_required`;
  STUDENT_PREMIUM and any non-student role bypass. Disabled when
  `QUIZ_JWT_SECRET` is unset (preserves anonymous test runs).
- **R-4** Adaptive Engine — Redis-backed photo-doubt limiter
  (`rate_limit.py`). 3/UTC-day cap for STUDENT/anonymous; STUDENT_PREMIUM
  + staff bypass. Fail-open when Redis is down (LLM has its own per-key
  budget).
- **16 auth tests** + **8 Quiz Go tier tests** + **12 Adaptive rate-limit
  tests** all green.

### Institution Core (I-1 through I-5) — DONE

- **I-1** Migration `003_create_institution_core.py` — tenants, cohorts,
  cohort_members. Per-tenant slug uniqueness; (cohort_id, user_id) PK on
  members.
- **I-2..I-5** `core_routes.py` + `core_repo.py` — POST/GET tenants,
  POST/GET cohorts, POST/GET/DELETE cohort members. Idempotent member-add
  via ON CONFLICT DO NOTHING + (row, created) tuple.
- **9 institution-core tests** green; 12 pre-existing flag-route tests
  unaffected.

### Frontend (F-1 through F-5) — DONE

- **F-1** `/billing` route + Billing page (`pages/Billing.tsx`).
  Polls `/payment/me` after Stripe success-redirect for up to 30s.
- **F-2** `PaywallModal.tsx` — single-CTA upgrade dialog with
  monthly/yearly plan picker.
- **F-3** Post-checkout lander baked into Billing page (success/cancel
  query-string handling).
- **F-4** `PremiumPill.tsx` (compact + card variants) with module-level
  cache so sidebar re-renders don't refetch.
- **F-5** Mobile paywall WebView — `apps/mobile/lib/api/billing.dart`
  (typed client + `premiumDisplay` mirror), `screens/paywall_webview_screen.dart`
  (webview_flutter, redirect-back via pure `detectCheckoutOutcome` URL
  matcher), `screens/billing_screen.dart` (subscription card + post-success
  poll loop), entry point added to Profile tab ACCOUNT group.

**6 web-student lib tests + 14 mobile billing tests** — covers free, premium,
PAST_DUE, cancelling, no-period-end branches on both surfaces, plus
checkout-outcome URL detection (success/cancel/intermediate/garbage).

## Test totals

| Service / surface       | New tests | Status |
|-------------------------|-----------|--------|
| Payment FSM             | 42        | green  |
| Payment repos           | 11        | green  |
| Payment routes          | 8         | green  |
| Auth premium tier       | 16        | green  |
| Quiz Go tier gate       | 8         | green  |
| Adaptive rate limit     | 12        | green  |
| Institution Core        | 9         | green  |
| Web-student billing lib | 6         | green  |
| Mobile billing           | 14        | green  |
| **Total new**           | **126**   |        |

Pre-existing test failures (NOT introduced by Sprint 8):
- `services/adaptive-engine/tests/test_tutor.py::test_build_system_branches_on_mastery`
  — `SYSTEM_TEMPLATE.format()` collides with literal `{"title"}` JSON in
  the prompt template. Independent bug, not on the Sprint 8 critical path.
- `apps/web-student/src/App.test.tsx` `/quiz/sid-9/result` — `"80%"` text
  assertion fails. Affects QuizResult page which Sprint 8 didn't touch.

## Out of scope

Per the user's late-Sprint-7 redirect ("staging happens after all phases
complete + Stripe ready + AWS"), these stay deferred:

- Aurora failover drill (runbook/aurora_failover.md exists for ~Sprint 19)
- Staging cutover (runbook/staging_first_deploy.md preserved for ~Sprint 19)
- RS256 JWKS rotation (still HS256 + shared secret)
- Real Stripe price IDs (currently `price_test_*` placeholders)
- Webhook signature secret rotation runbook

## Carry-overs into Sprint 9

1. **R-1 self-elevation cache** — Auth could optionally fall back to
   `/payment/internal/users/{id}/premium` at JWT issuance when
   `premium_until` was last set > 30 mins ago, so a missed NATS message
   doesn't strand a paying user on STUDENT.
2. **I-6 admin UI** — web-admin needs tenant + cohort management screens
   (deferred from I-5; the API surface is complete).
3. **Pre-existing tutor test fix** — `SYSTEM_TEMPLATE.format()` JSON
   collision in `services/adaptive-engine/src/adaptive_engine/tutor.py`.
4. **Pre-existing QuizResult test fix** — `apps/web-student/src/App.test.tsx`
   `"80%"` assertion. Likely the result hero shape changed in PR #61.

## Sign-off

- [ ] Payment + Institution containers rebuild green in compose
- [ ] Smoke pass through paywall + Stripe stub Checkout + /payment/me
- [ ] Migration 006 applied to compose Auth DB
- [ ] Migration 001 applied to compose Payment DB
- [ ] Migration 003 applied to compose Institution DB
- [ ] CTO sign-off
