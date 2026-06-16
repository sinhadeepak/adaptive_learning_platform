# API Contract — payment (service)

**Base URL:** `https://api.vidya.example/v1/payment`
**Auth:** Bearer JWT (user); admin endpoints + admin RBAC + re-auth; S2S endpoints with peer auth; webhooks signed.
**Idempotency:** Required on POST mutations (`Idempotency-Key`).

---

## Customer-Facing (Subscriptions)

### `POST /checkout-sessions`
Create a Stripe Checkout session.
- **Body:** `{ plan_id, success_url, cancel_url }`
- **Headers:** `Idempotency-Key`
- **200:** `{ checkout_session_id, redirect_url }`

### `GET /me/subscriptions`
- **200:** `{ active?: {plan_id, status, current_period_end, cancel_at_period_end, ...} }`

### `POST /subscriptions/{id}/cancel`
- **Body:** `{ at: "period_end" | "immediate" }`
- **200:** updated subscription.

### `POST /subscriptions/{id}/resume`
Resume a cancellation pending.
- **200:** updated.

### `POST /subscriptions/{id}/change-plan`
- **Body:** `{ new_plan_id, prorate: true }`
- **200:** `{ proration_preview, updated_subscription }`

### `GET /me/invoices`
- **200:** paginated invoices (proxied from Stripe API + cache).

### `GET /me/invoices/{id}/download`
- **302:** Stripe-hosted PDF URL.

### `GET /me/payment-methods`
- **200:** list (from Stripe customer).

---

## Admin

### `POST /admin/refunds`
Issue refund.
- **Auth:** admin + re-auth + 2-step confirm
- **Body:** `{ charge_id?, subscription_id?, amount?, reason }`
- **Headers:** `Idempotency-Key`
- **200:** `{ refund_id, status }`

### `POST /admin/subscriptions/{id}/cancel`
Admin override.
- **200:** updated.

### `GET /admin/disputes`
- **200:** list of open disputes.

### `POST /admin/disputes/{id}/evidence`
- **Body:** `{ text?, files[] }`
- **204**

### `GET /admin/reports/mrr-arr`
- **200:** `{ mrr, arr, by_plan: [...] }`

### `GET /admin/reports/failed-charges`
- **200:** `{ count_last_30d, breakdown_by_reason }`

---

## Webhooks (Stripe → us)

### `POST /webhooks/stripe`
- **Signature:** `Stripe-Signature` header (verified)
- **Body:** Stripe event payload
- **200:** ack (idempotent)
- **400:** signature invalid
- Handled event types:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `charge.dispute.created`
- Unknown event types: log + 200 ack.

---

## Service-to-Service

### `POST /internal/checkout-marketplace`
Marketplace booking → checkout.
- **Auth:** S2S
- **Body:** `{ user_id, booking_id, amount_inr_paise, success_url, cancel_url }`
- **200:** `{ checkout_session_id, redirect_url }`

### `POST /internal/payouts/run-weekly`
Internal cron-triggered weekly payout job (Phase 2).
- **Auth:** S2S
- **Body:** `{ as_of: <date> }`
- **200:** `{ payout_count, total_paid_paise }`

---

## Common

- `GET /health`, `GET /ready`
- OTel + structured logs
- Error shape `{ code, message, details, request_id }`

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `PLAN_NOT_FOUND` | 404 | Unknown plan_id |
| `ALREADY_SUBSCRIBED` | 409 | Active subscription exists |
| `IDEMPOTENCY_REQUIRED` | 400 | Missing header |
| `WEBHOOK_SIG_INVALID` | 400 | |
| `REFUND_NOT_ALLOWED` | 403 | Out of policy window |
| `STRIPE_DOWN` | 503 | Stripe API unreachable |
| `CURRENCY_NOT_SUPPORTED` | 422 | Phase 2 |
| `KYC_REQUIRED` | 412 | Tutor not Connect-onboarded (Phase 2 payout) |
