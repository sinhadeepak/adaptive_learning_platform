# Requirements Catalogue — payment (service)

**Anchored to:** [BRD §5](./01_brd.md#5-functional-areas) · [Master BRD §5.2.6](../../00_platform/02_master_brd/master_brd.md#526-payment)

---

## FA-01 — Customer + Payment Method

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-01-01 | Create Stripe Customer on first checkout | P0 | 1 |
| FR-PY-01-02 | Store Stripe customer_id in our DB | P0 | 1 |
| FR-PY-01-03 | Payment methods Stripe-tokenised; never our DB | P0 | 1 |
| FR-PY-01-04 | List user's payment methods (from Stripe API) | P1 | 1 |
| FR-PY-01-05 | Default payment method change | P1 | 1 |

## FA-02 — Subscription Lifecycle

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-02-01 | Plan catalogue: `premium_monthly_inr` (₹199), `premium_annual_inr` (₹1,599) | P0 | 1 |
| FR-PY-02-02 | Create subscription via Stripe | P0 | 1 |
| FR-PY-02-03 | Subscription status sync (active, past_due, canceled, incomplete) | P0 | 1 |
| FR-PY-02-04 | Trial support (if Product decides) | P2 | 2 |
| FR-PY-02-05 | Multi-plan: only one active subscription per user | P0 | 1 |

## FA-03 — Stripe Checkout

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-03-01 | `POST /checkout-sessions` creates Stripe Checkout session | P0 | 1 |
| FR-PY-03-02 | Success URL + cancel URL include `return_to` | P0 | 1 |
| FR-PY-03-03 | Customer attached (existing or new) | P0 | 1 |
| FR-PY-03-04 | Currency = INR Phase 1 | P0 | 1 |
| FR-PY-03-05 | Idempotent (Idempotency-Key) | P0 | 1 |
| FR-PY-03-06 | Marketplace booking → separate checkout flow via internal endpoint | P1 | 2 |

## FA-04 — Webhook Handler

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-04-01 | Verify Stripe signature on every webhook | P0 | 1 |
| FR-PY-04-02 | Dedupe by Stripe `event.id` in `webhook_events` table | P0 | 1 |
| FR-PY-04-03 | Handle `checkout.session.completed` | P0 | 1 |
| FR-PY-04-04 | Handle `customer.subscription.created` | P0 | 1 |
| FR-PY-04-05 | Handle `customer.subscription.updated` | P0 | 1 |
| FR-PY-04-06 | Handle `customer.subscription.deleted` | P0 | 1 |
| FR-PY-04-07 | Handle `invoice.paid` | P0 | 1 |
| FR-PY-04-08 | Handle `invoice.payment_failed` | P0 | 1 |
| FR-PY-04-09 | Handle `charge.dispute.created` | P0 | 1 |
| FR-PY-04-10 | Unknown event types — log + 200 ack (forward-compat) | P0 | 1 |
| FR-PY-04-11 | Webhook processing within 1 s p95 | P0 | 1 |
| FR-PY-04-12 | Connect-account webhooks for marketplace | P1 | 2 |

## FA-05 — Entitlement Events to identity

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-05-01 | On `checkout.session.completed` → PUT identity entitlement `premium=true` | P0 | 1 |
| FR-PY-05-02 | On `customer.subscription.deleted` (period end) → PUT `premium=false` | P0 | 1 |
| FR-PY-05-03 | On `invoice.payment_failed` past grace → PUT `premium=false` | P0 | 1 |
| FR-PY-05-04 | Entitlement flip < 60 s (FR-WS-10-10) | P0 | 1 |
| FR-PY-05-05 | Retry to identity with backoff (idempotent at identity) | P0 | 1 |

## FA-06 — Proration

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-06-01 | Upgrade monthly → annual prorates correctly | P0 | 1 |
| FR-PY-06-02 | Downgrade annual → monthly waits for period end | P1 | 1 |
| FR-PY-06-03 | Show preview of proration to user before confirm | P0 | 1 |

## FA-07 — Cancel + Resume

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-07-01 | Cancel: defaults to "cancel-at-period-end" | P0 | 1 |
| FR-PY-07-02 | Immediate cancel option (with refund eligibility per policy) | P1 | 1 |
| FR-PY-07-03 | Resume a cancellation pending | P0 | 1 |

## FA-08 — Failed Charge Retry

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-08-01 | Use Stripe Smart Retries (3 attempts) | P0 | 1 |
| FR-PY-08-02 | After 1st fail → emit "payment failed" notif via engagement | P0 | 1 |
| FR-PY-08-03 | Dunning UI banner (handled by web/mobile via entitlement payload) | P0 | 1 |
| FR-PY-08-04 | After final fail → cancel sub + entitlement flip | P0 | 1 |

## FA-09 — Invoices + Receipts

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-09-01 | List user invoices (from Stripe API + cache) | P1 | 1 |
| FR-PY-09-02 | Receipt PDF URL from Stripe | P1 | 1 |
| FR-PY-09-03 | Tax breakdown shown (Phase 2 with Stripe Tax) | P2 | 2 |

## FA-10 — Refunds

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-10-01 | Admin can issue full refund | P0 | 1 |
| FR-PY-10-02 | Admin can issue partial refund | P1 | 1 |
| FR-PY-10-03 | 2-step admin confirm | P0 | 1 |
| FR-PY-10-04 | Refund reason recorded | P0 | 1 |
| FR-PY-10-05 | Refund propagates to entitlement (if cancels sub) | P0 | 1 |
| FR-PY-10-06 | Policy-driven refund (marketplace cancel-24h-pre = full) | P1 | 2 |

## FA-11 — Disputes + Chargebacks

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-11-01 | `charge.dispute.created` → admin notification | P0 | 1 |
| FR-PY-11-02 | Evidence submission (admin form) | P1 | 2 |
| FR-PY-11-03 | Dispute status tracking | P0 | 1 |

## FA-12 — Marketplace Payouts (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-12-01 | Stripe Connect Express onboarding link | P1 | 2 |
| FR-PY-12-02 | Webhook: account.updated → payouts_enabled flag | P1 | 2 |
| FR-PY-12-03 | Weekly payout schedule | P1 | 2 |
| FR-PY-12-04 | 15% platform take (per ADR-0007) | P1 | 2 |
| FR-PY-12-05 | Payout failure handling + retry | P1 | 2 |
| FR-PY-12-06 | Payout reconciliation report | P1 | 2 |

## FA-13 — Tax (GST) (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-13-01 | Stripe Tax integration | P2 | 2 |
| FR-PY-13-02 | GST split shown on invoice | P2 | 2 |
| FR-PY-13-03 | B2B GST invoicing | P2 | 2 |

## FA-14 — Revenue Reporting

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-14-01 | MRR snapshot daily | P0 | 1 |
| FR-PY-14-02 | ARR snapshot daily | P0 | 1 |
| FR-PY-14-03 | Cohort retention curve | P1 | 2 |
| FR-PY-14-04 | Failed-charge dashboard | P0 | 1 |
| FR-PY-14-05 | Refund volume dashboard | P1 | 2 |

## FA-15 — Currency

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-PY-15-01 | INR only Phase 1 | P0 | 1 |
| FR-PY-15-02 | Multi-currency Phase 2 | P2 | 2 |

## Cross-Cutting

Standard: health/ready, OTel, OpenAPI, migrations, structured logs. 10 FRs.
