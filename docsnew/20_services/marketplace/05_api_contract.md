# API Contract — marketplace (service)

**Base URL:** `https://api.vidya.example/v1/marketplace`
**Auth:** Bearer JWT (role-scoped); admin endpoints + RBAC; S2S endpoints with peer auth.

---

## Tutor (web-portal)

### Profile + Application

| Method | Path | Purpose |
|---|---|---|
| POST | `/tutors/me/application` | Submit application |
| GET | `/tutors/me/application` | Status |
| GET | `/tutors/me` | My profile (private view) |
| PATCH | `/tutors/me` | Update profile |
| POST | `/tutors/me/photo` | Upload photo (multipart) |

### KYC

| Method | Path | Purpose |
|---|---|---|
| POST | `/tutors/me/kyc/start` | Returns Stripe Identity URL |
| GET | `/tutors/me/kyc` | Status |
| POST | `/webhooks/stripe-identity` | Webhook |

### Availability

| Method | Path | Purpose |
|---|---|---|
| GET | `/tutors/me/availability` | My slots |
| PUT | `/tutors/me/availability` | Update recurring + exceptions |

### Earnings

| Method | Path | Purpose |
|---|---|---|
| GET | `/tutors/me/earnings` | Lifetime + this month |
| GET | `/tutors/me/payouts` | History |
| POST | `/tutors/me/payouts/setup` | Trigger Connect onboarding link (delegates to payment) |

---

## Student-Facing (web-student / mobile)

### Discovery

| Method | Path | Purpose |
|---|---|---|
| GET | `/tutors` | Browse (filters: subject, exam, language, price, rating, sort, cursor) |
| GET | `/tutors/{id}` | Public profile |
| GET | `/tutors/{id}/availability?from=...&to=...` | Available slots |

### Booking

| Method | Path | Purpose |
|---|---|---|
| POST | `/bookings` | Create with hold |
| GET | `/bookings/{id}` | Status |
| GET | `/me/bookings` | My bookings |
| POST | `/bookings/{id}/cancel` | Cancel (refund per policy) |
| POST | `/bookings/{id}/join` | Get Daily.co room URL + token (at T-5 min) |

### Session

| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions/{id}/heartbeat` | Periodic ping (s2s) |
| POST | `/webhooks/daily-co` | Session-end webhook |

### Rating + Review

| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions/{id}/rating` | Submit rating + review |
| GET | `/tutors/{id}/reviews` | Public reviews |
| POST | `/reviews/{id}/report` | Report a review |

### Disputes

| Method | Path | Purpose |
|---|---|---|
| POST | `/bookings/{id}/dispute` | Open |
| GET | `/me/disputes` | My disputes |
| POST | `/disputes/{id}/evidence` | Add evidence |

---

## Service-to-Service

### `POST /internal/checkout-callback`
Payment service notifies on checkout completion.
- **Auth:** S2S
- **Body:** `{ booking_id, payment_event_id, status }`
- **200**: idempotent on payment_event_id.

### `POST /internal/payouts/weekly-trigger`
Cron triggers weekly payout computation.
- **Auth:** S2S
- **Body:** `{ as_of: <date> }`
- **200:** `{ payout_count, total }`.

---

## Admin

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/applications` | Pending list |
| POST | `/admin/applications/{id}/approve` | Approve |
| POST | `/admin/applications/{id}/reject` | Reject + reason |
| POST | `/admin/tutors/{id}/ban` | Ban |
| POST | `/admin/tutors/{id}/restore` | Restore |
| GET | `/admin/disputes` | Open queue |
| POST | `/admin/disputes/{id}/resolve` | Resolve |
| GET | `/admin/pricing-bands` | List |
| PUT | `/admin/pricing-bands/{id}` | Update |
| GET | `/admin/payouts/failures` | Dashboard |

---

## Common

- `GET /health`, `GET /ready`
- OTel + structured logs
- Error shape `{ code, message, details, request_id }`

### Error Codes

| Code | HTTP |
|---|---|
| `APPLICATION_PENDING` | 409 |
| `KYC_PENDING` | 412 |
| `SLOT_HELD` | 409 |
| `SLOT_UNAVAILABLE` | 410 |
| `HOLD_EXPIRED` | 410 |
| `RATE_OUT_OF_BAND` | 422 |
| `PAYMENT_REQUIRED` | 402 |
| `PAYOUT_BLOCKED_KYC` | 412 |
| `DISPUTE_INVALID` | 422 |
| `DAILYCO_DOWN` | 503 |
| `RATING_ALREADY_SUBMITTED` | 409 |
