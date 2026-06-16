# Business Requirements Document — payment (service)

| | |
|---|---|
| **Service** | `services/payment` |
| **Tech** | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · Alembic · Stripe SDK |
| **Schema** | `payment_schema` (Aurora Postgres 15) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.6](../../00_platform/02_master_brd/master_brd.md#526-payment) |

---

## 1. Purpose

The `payment` service handles all money flow: subscriptions, billing, refunds, disputes, and marketplace tutor payouts via Stripe Connect. It is the **only** service that interacts with Stripe.

**Money requires correctness, idempotency, and auditability.** Webhooks may arrive multiple times; payouts must not double-pay; refunds must not silently fail.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Customer + Payment Method** | Create/link Stripe Customer; payment methods always Stripe-tokenised |
| **Subscriptions** | Premium ₹199/mo, ₹1,599/yr |
| **Stripe Checkout** | Hosted checkout for web + WebView mobile |
| **Webhook handler** | 7 critical Stripe events; dedupe; idempotent |
| **Entitlement events** | PUT to identity within 60 s (FR-WS-10-10) |
| **Proration** | Upgrade/downgrade monthly↔annual |
| **Cancel + Resume** | Cancel-at-period-end vs immediate |
| **Failed-charge retry** | Stripe Smart Retries config + dunning |
| **Invoices + Receipts** | Stripe-generated; we store ref + PDF link |
| **Refunds** | Admin-initiated + policy-driven (marketplace bookings) |
| **Disputes / Chargebacks** | Webhook → admin notify; evidence submission |
| **Marketplace Payouts** | Stripe Connect Express; 15% platform take per ADR-0007; weekly schedule |
| **Tax (GST India)** | Phase 2 — Stripe Tax integration |
| **Revenue reporting** | MRR / ARR / cohort retention for admin |
| **Currency** | INR Phase 1; multi-currency Phase 2 |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Subscription gating logic (premium features) | each app reads entitlement claim |
| Plan UI | web-student / mobile |
| Tutor onboarding (KYC, Connect link) initiated by marketplace; payment provides the link | marketplace |
| Notification copy | engagement |

### 2.3 Scope by Phase

| Phase | payment ships |
|---|---|
| **Phase 1 (M0–M6)** | Customer create · Checkout · 7 webhook events · Entitlement webhook · Proration · Cancel+resume · Failed-charge retry · Invoices · Refunds · INR currency · Idempotency |
| **Phase 2 (M6–M12)** | Marketplace Connect payouts · Disputes evidence flow · Tax (GST) · Multi-currency · Revenue reports · Retention dashboard |
| **Phase 3+** | Razorpay fallback prototype (risk hedge) · B2B GST invoicing · Coupons |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead** | Tech owner | Architecture |
| **Finance** | Money flow | Reconciliation; tax |
| **Compliance** | PCI-DSS | Scope assertion |
| **Security** | Webhook signing keys | KMS |
| **Marketplace Lead** | Payout policies | Connect setup |

## 4. Top Internal Journeys

| # | Journey | Trigger |
|---|---------|---------|
| 1 | User subscribes | App tap "Upgrade" |
| 2 | Webhook: checkout.completed | Stripe |
| 3 | Webhook: invoice.payment_failed | Stripe |
| 4 | Cancel subscription | App |
| 5 | Admin refund | web-admin |
| 6 | Tutor payout (weekly job) | Cron |
| 7 | Dispute opened | Stripe webhook |

## 5. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Customer + Payment Method | Stripe Customer create/link |
| FA-02 Subscription Lifecycle | Create / change / cancel / resume |
| FA-03 Stripe Checkout | Hosted page integration |
| FA-04 Webhook Handler | 7 events + dedupe + idempotency |
| FA-05 Entitlement Events to identity | PUT within 60 s |
| FA-06 Proration | Upgrade/downgrade |
| FA-07 Cancel + Resume | Cancel-at-period-end |
| FA-08 Failed Charge Retry | Smart Retries + banner trigger |
| FA-09 Invoices + Receipts | Storage + listing |
| FA-10 Refunds | Admin + policy-driven |
| FA-11 Disputes + Chargebacks | Notify + evidence |
| FA-12 Marketplace Payouts (Connect) | Express + weekly |
| FA-13 Tax (GST) | Phase 2 |
| FA-14 Revenue Reporting (admin) | MRR / ARR / retention |
| FA-15 Currency | INR Phase 1; multi Phase 2 |
| FA-XC | health/ready, OTel, OpenAPI, migrations |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-PY-01 | Perf | Create checkout session | p95 < 500 ms |
| NFR-PY-02 | Perf | Webhook processing | p95 < 1 s per event |
| NFR-PY-03 | Avail | Service uptime | 99.9% (webhooks must retry) |
| NFR-PY-04 | Reliab | Webhook idempotency | 100% — dedupe by event id |
| NFR-PY-05 | Reliab | Entitlement flip SLA | < 60 s from `checkout.session.completed` |
| NFR-PY-06 | Reliab | Webhook retry tolerance | Stripe retries; we process exactly-once |
| NFR-PY-07 | Reliab | At-least-once event emission to identity | with dedupe at identity |
| NFR-PY-08 | Security | Stripe signing secret | KMS; rotated |
| NFR-PY-09 | Security | No PAN/CVV ever in our DB | PCI-DSS via tokenisation |
| NFR-PY-10 | Security | Refund requires admin re-auth + 2-step confirm | required |
| NFR-PY-11 | Compliance | PCI-DSS scope | minimal (Stripe-tokenised) |
| NFR-PY-12 | Compliance | Tax docs retention | 7 years |
| NFR-PY-13 | Observability | Per-event-type webhook latency dashboard | required |
| NFR-PY-14 | Observability | Entitlement-flip latency tracked + alert > 60 s | required |
| NFR-PY-15 | Migration | Alembic up/down | required |
| NFR-PY-16 | API | OpenAPI 3.1 | required |
| NFR-PY-17 | Backward compat | Webhook handlers must remain forward-compat (ignore unknown event types gracefully) | required |
| NFR-PY-18 | DR | Webhook event log retention | indefinite (legal + reconciliation) |

---

## 8. Constraints & Assumptions

- **C-PY-01** Stripe is the only PSP (per ADR-0004). Razorpay is fallback prototype, not Phase 1 production.
- **C-PY-02** Marketplace payouts via Stripe Connect Express (per ADR-0007); 15% platform take; weekly schedule.
- **C-PY-03** Subscription pricing per Master BRD §5.1.1 (₹199/mo · ₹1,599/yr).
- **C-PY-04** Webhook handler must dedupe by Stripe `event.id`.
- **C-PY-05** Entitlement updates published as events; identity reconciles.
- **C-PY-06** No PAN/CVV touches our DB.
- **C-PY-07** Refunds require admin re-auth + 2-step confirm.

### Assumptions
- **A-PY-01** Stripe India merchant approved (D-01 dependency on Master BRD).
- **A-PY-02** Webhooks signed; signing secret in KMS.
- **A-PY-03** Failed-charge retry uses Stripe Smart Retries (3 attempts).

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-PY-01 | identity (entitlement PUT) | Premium unlock |
| D-PY-02 | marketplace (booking → checkout delegation) | Marketplace payments |
| D-PY-03 | engagement (notify on failed charges) | Dunning |
| D-PY-04 | Stripe + Stripe Connect | PSP |
| D-PY-05 | Stripe Tax (Phase 2) | GST |
| D-PY-06 | KMS | Webhook signing secret |
| D-PY-07 | Aurora | Storage |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-PY-01 | Webhook delivered twice → double entitlement / double payout | High | High | Dedupe by Stripe event.id in `webhook_events` table |
| R-PY-02 | Entitlement flip exceeds 60 s | Med | Med | Direct PUT to identity (not event-only) + monitor |
| R-PY-03 | Stripe outage during checkout | Low | High | Stripe SLA + Razorpay fallback prototype (R-04 in Master BRD) |
| R-PY-04 | Refund issued to wrong account | Low | Critical | 2-step admin confirm + audit |
| R-PY-05 | Stripe Connect India approval delayed | Med | High | Marketplace Phase 2; have plan to delay marketplace launch if blocked |
| R-PY-06 | Disputed transactions exceed 1% (Stripe risk) | Med | High | Proactive fraud detection; review high-velocity sub creation |

## 11. Success Criteria

payment Phase 1 is **Done** when:

1. All P0 stories shipped + tests
2. NFR-PY-* verified
3. 7 webhook events handled idempotently
4. Entitlement flip < 60 s in 99% of cases in staging
5. Refund flow end-to-end with Stripe sandbox
6. Failed-charge retry sequence tested
7. Reconciliation report green for 1 week

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-PY-01 | International expansion Phase 2 — which countries first | Finance + Product | Phase 2 Week 1 |
| OQ-PY-02 | Tax engine: Stripe Tax vs in-house | Finance | Phase 2 Week 2 |
| OQ-PY-03 | Dunning escalation: 3 retries vs more | Finance + Product | Phase 1 Week 6 |
| OQ-PY-04 | GST invoicing for B2B institutions | Finance + Legal | Phase 2 Week 4 |
| OQ-PY-05 | Razorpay fallback prototype activation criteria | Eng leadership | Phase 1 Week 8 |
| OQ-PY-06 | Refund partial vs full UX | Product | Phase 1 Week 4 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead | _Pending_ | | |
| Finance | _Pending_ | | |
| Compliance | _Pending_ | | |
| Security | _Pending_ | | |
| QA Lead | _Pending_ | | |
