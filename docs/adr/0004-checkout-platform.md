# ADR-0004: Checkout platform (web + iOS + Android)

- **Status**: proposed
- **Date**: 2026-04-22
- **Deciders**: CTO, Head of Product, Tech Lead, Legal / Compliance
- **Related**: [Sprint 3 plan §Payment](../02_planning/07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md#sprint-3--payment-institution-hardening-drills-weeks-78), [Sprint 3 Pass 3 wireframes §1–§3](../01_design/10_Wireframes_Sprint3_All_AdaptiveLearningPlatform.md), `STU-REQ-01..13` (subscription flow)

## Context

Phase 1 monetisation launches in Week 9 with a single paid tier (Premium) billed monthly or yearly in INR. We must accept payment from **three clients** (`web-student`, iOS, Android) with different platform rules. Two dimensions to settle before Sprint 3 Day 1:

1. **Web checkout form**: Stripe Payment Element embedded inside `/checkout`, OR Stripe Checkout (hosted page, redirect to Stripe's domain then return).
2. **Mobile platform-store compliance**: on iOS, App Store Guideline 3.1.1 requires Apple In-App Purchase (IAP) for "unlocking features or functionality" — Apple takes 30 % (15 % for small business). Stripe in-app for digital goods is not allowed on iOS. Android has looser but non-zero constraints.

Forces:

- **Regulatory (India)**: GST 18 % must be shown separately on invoice. RBI e-mandate rules for recurring autopay cap monthly auto-debit at ₹15,000 without 24 h prior notification — within our plan limits, but the mandate setup UX must match RBI.
- **Compliance**: We are targeting **PCI-SAQ A** — card data must never touch our servers. Any decision must preserve that scope.
- **Cost**: Stripe India = 2 % + ₹3 per successful charge for domestic cards; IAP = 30 % / 15 %. For a ₹399/mo subscription, Stripe = ~₹11, IAP = ~₹120 (small-biz) or ₹60 (after Small Business Program if eligible).
- **UX friction**: embedded = lowest drop-off; hosted = simplest PCI scope; IAP = highest trust on iOS but highest revenue loss.
- **Timeline**: 2 engineering weeks in Sprint 3 to ship on all three surfaces; Apple review cycle ≥ 7 days — iOS build must be store-ready by end of Sprint 3 Week 1.

## Decision

We will use **Stripe Checkout (hosted page)** on `web-student` and **Apple In-App Purchase on iOS** + **Google Play Billing on Android** for the mobile apps.

- `web-student`: redirect to Stripe's hosted Checkout page; webhook-driven activation; Stripe Billing portal for subscription self-service.
- iOS: StoreKit 2 IAP with server-side receipt validation by our Payment service.
- Android: Play Billing Library 7 with server-side subscription status via Real-time Developer Notifications (RTDN).
- **Single source of truth**: the Payment service holds the canonical subscription state. Any of the three payment paths (Stripe / IAP / Play) can activate it; dunning + cancellation policy lives here.

## Alternatives considered

- **Option A — Stripe Payment Element embedded on web**
  - **Pros**: lowest friction; we control the UI; analytics events at every step; can A/B test the checkout form.
  - **Cons**: PCI scope creeps (we still host the iframe + load Stripe.js — technically still SAQ A, but security review is heavier); 3DS flows harder to debug; less robust against payment-method additions (UPI, net-banking, wallets — India payment diversity is broad).
  - **Why not**: not worth the extra security-review and dev burden for Phase 1. We can revisit when we have traffic to justify conversion-rate A/B tests.

- **Option B — Stripe in-app on iOS (against App Store guidelines)**
  - **Pros**: ~₹11 per charge instead of ~₹60–₹120; we control the UX end-to-end; one integration across all three surfaces.
  - **Cons**: **likely rejected at App Store review** for digital goods. Workarounds (external website purchase + instructions) are explicitly called out as non-compliant per Guideline 3.1.3 except narrow "reader" apps. Apple has threatened to pull non-compliant apps.
  - **Why not**: launch-blocking compliance risk. iOS is half our addressable market.

- **Option C — Hybrid: Stripe only on web, kill iOS monetisation in Phase 1**
  - **Pros**: ships faster (no IAP integration); dodges the 30 % haircut on iOS entirely.
  - **Cons**: students on iOS can't become Premium unless they open a browser; conversion hit is hard to estimate but plausibly 20–40 % of iOS traffic lost. Poor user experience.
  - **Why not**: leaves money on the table and creates a two-tier experience by platform.

- **Option D — IAP-only across all platforms (including web)**
  - Rejected immediately: IAP does not exist on web; would require a bespoke web-store payment flow. No upside.

## Consequences

### Positive
- **Compliance**: fully aligned with Apple + Google store rules on iOS / Android day one.
- **PCI scope stays at SAQ A**: hosted Checkout keeps card data off our servers entirely.
- **Three surfaces can ship in parallel** — web team uses Stripe SDK redirect (~2 days wiring); iOS team uses StoreKit 2 template (~5 days); Android team uses Play Billing template (~4 days).
- **Dunning + retry**: Stripe Billing handles failed-card retries for web; Apple + Google handle grace periods on mobile — we consume webhooks and update state.

### Negative
- **Revenue margin on mobile is materially lower** (~30 % vs ~3 % Stripe). Yearly plan on Apple through Small Business Program brings it to 15 %, still 5× Stripe cost.
- **Subscription migration between surfaces is constrained**: a user who bought via IAP can't cancel via our web UI; they must use Apple's Manage Subscriptions. We must link out and explain clearly.
- **Different renewal dates per surface**: IAP renewal windows are Apple-controlled and can drift from our billing cycle. The Subscription Management screen (Pass 3 §3) must display the surface-specific renewal source.
- **Refund policy varies**: Stripe refunds are ours to issue; Apple refunds are Apple-adjudicated; Play has a 48-h self-serve window.

### Follow-up work

- [ ] Register for Apple Small Business Program (if eligible — < $1M annual) — Finance / CTO, before iOS submission.
- [ ] Add `payment_source` field to Subscription model: `{stripe, apple, google}` — BE Lead Python (Payment), Sprint 3 Day 1.
- [ ] Implement StoreKit 2 receipt validation endpoint — Mobile Lead iOS + BE Lead Python, Sprint 3 Week 1.
- [ ] Implement Google Play RTDN consumer — Mobile Lead Android + BE Lead Python, Sprint 3 Week 1.
- [ ] Stripe Checkout redirect + webhook handler — BE Lead Python (Payment), Sprint 3 Week 1.
- [ ] RBI e-mandate configuration in Stripe dashboard for INR recurring — DevOps + Finance, Sprint 3 Day 3.
- [ ] Subscription Management screen surface-aware rendering (Pass 3 §3) — FE Lead A + Mobile Leads, Sprint 3 Week 2.
- [ ] "Managed by Apple" / "Managed by Google" banner + deep-link to system Manage Subscriptions — FE Lead A, Sprint 3 Week 2.
- [ ] Dunning copy + email templates (Stripe webhook → Notification service) — PM + BE Lead Python (Notification), Sprint 3 Week 2.
- [ ] Update [Runbook](../../runbook/) with Stripe webhook replay + IAP receipt re-validation procedures — DevOps, Sprint 3 Week 2.
- [ ] Add `payment.path.*` analytics events split by source — Analytics Lead, Sprint 3 Week 1.

## Review

Revisit by **2027-01-31** (6 months post-launch) or sooner if:
- Apple IAP rejection on first submission forces a platform pivot.
- Conversion rate on Stripe web checkout is < 60 % (hosted-page drop-off) — re-evaluate embedded Payment Element.
- India payment regulation changes (e.g. RBI mandates a new flow for recurring below ₹15k).
- Combined iOS + Android revenue exceeds 30 % of total and the IAP margin hit becomes material enough to justify a "subscribe on web" nudge strategy (within Apple's guidelines).
