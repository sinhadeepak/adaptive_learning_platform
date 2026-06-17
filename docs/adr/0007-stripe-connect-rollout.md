# ADR-0007: Stripe Connect rollout shape (account type, payout cadence, commission)

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, HoP, Finance Lead
- **Related**: [Phase 3 plan](../02_planning/21_Phase3_SprintDevelopmentPlan.md), P3-S0 gating ADR #2, [ADR-0004](0004-checkout-platform.md), [ADR-0006](0006-kyc-vendor.md)

## Context

Tutors and creators need to be paid. Stripe Connect is the platform-payouts product. Within Connect there are three account types (**Express**, **Custom**, **Standard**), three cadence options (**daily / weekly / monthly**), and a commission % the platform sets (**typical marketplace range: 10–30%**).

Each axis is a real trade-off:

- **Express** — Stripe-hosted onboarding + Stripe-hosted dashboard. Tutor sees Stripe's UI for tax forms, payout details, dispute responses. Lowest engineering work; least control over the experience. KYC integrated (per ADR-0006).
- **Custom** — platform owns 100% of the UI. Heaviest engineering lift, most flexibility. PCI scope expands.
- **Standard** — tutor effectively has their own Stripe account; platform takes a fee. Tutor manages everything via Stripe directly. Easiest for tutors who already have a Stripe account; awkward for new-to-Stripe tutors.

The platform is single-engineer; tutors are first-time-online-instructors not finance professionals. Express is the obvious lean.

For cadence, the trade is between cash-flow-friendliness for tutors (daily) and platform float / dispute-window safety (monthly). Stripe defaults to daily; commission deductions reconcile per payout.

For commission, the platform value-prop is acquisition + KYC + dispute handling + tools. Marketplace research lands at 15–20% as the "fair" band for an early-stage marketplace; >25% drives tutor leakage to off-platform; <10% can't sustain unit economics with KYC + Stripe fees on top.

## Decision

- **Account type**: **Stripe Connect Express**.
- **Payout cadence**: **Weekly** (every Monday for the prior Mon–Sun period).
- **Platform commission**: **15%** flat, with a tier-test mechanism (per-tutor override stored in `marketplace_schema.tutor_profiles.commission_rate_override` for grandfathered or VIP tutors).

This applies symmetrically to creators in P3-S3, with the override mechanism reused.

## Alternatives considered

- **Custom account type** — full UI control. **Rejected** for the engineering cost: tutor onboarding alone would be ~2 sprints (vs. 0.5 with Express). Revisit if Express's UX limits cause material conversion drop in P3-S1.
- **Standard account type** — minimum platform burden but tutor sees Stripe's branding everywhere. **Rejected** because it requires every tutor to be capable of self-managing a Stripe account; we want lower friction.
- **Daily payouts** — most tutor-friendly cash flow. **Rejected** because:
  - Disputes have a 14-day window; daily payouts make claw-back math noisier.
  - Each payout has a per-transaction fee (~$0.25); 50 tutors × 30 daily payouts/mo = 1,500 fees/mo vs. 200 weekly. Saves ~$300/mo at P3-S1 scale, more at scale.
  - Tutors have indicated in pre-launch interviews that weekly is acceptable — daily isn't a deal-breaker.
- **Monthly payouts** — platform-friendliest. **Rejected** because tutors at the scale we're targeting (independent instructors, not corporates) often live month-to-month; monthly payout cadence feels like the platform is hoarding their money.
- **Commission 10%** — competitive vs. Udemy (instructor-discovered: 37%; instructor-promoted: 50%; coupon: 97%) and Outschool (30%). **Rejected** because at 10% the unit economics don't cover Stripe fees (~3%) + Stripe Identity ($1.50/onboard amortised) + dispute provisioning + acquisition costs.
- **Commission 20%** — closer to industry norm. **Rejected as initial setting** but kept as the "if growth slows, raise here" lever.

## Consequences

### Positive

- **Express + KYC-integrated** = the simplest tutor onboarding flow possible. From "click Apply" to "first session bookable" is < 30 minutes for a tutor with a passport.
- **15% leaves headroom** to compete on tutor acquisition vs. Udemy/Outschool (37–50% instructor discount).
- **Weekly cadence + 14-day dispute window** = sufficient claw-back time without making tutors wait too long.
- **Per-tutor override** is the escape hatch for VIP tutors and the experimental tier (e.g. "first 10 tutors get 0% commission for 6 months").

### Negative

- **No tutor-side dashboard branding** — tutors see Stripe's UI for finance things. Marketplace.alp.com brand is shown only on the platform-side pages. Acceptable trade-off.
- **15% means platform runs lean** at low volume. At 50 tutors averaging $200/mo gross = $10K platform revenue → minus Stripe fees → ~$5K/mo net. Not a sustainable Phase 3 burn. **Phase 3 is investment, not ROI**.
- **Override field is a footgun** — must be admin-only; audit log on every change. Build in P3-S2 before any override is granted.

### Follow-up work

- [ ] Stripe Connect Express integration in `alp-marketplace` (P3-S1 owns).
- [ ] Webhook listener for `account.updated` (verifies KYC status changed) — extends `alp-payment`'s existing webhook surface.
- [ ] `tutor_profiles.commission_rate_override` column + admin endpoint (P3-S2).
- [ ] Audit log on every commission override change (use existing `feature_flag_audit` pattern from ADR-0001).
- [ ] Finance acceptance of 15% / weekly assumptions for the P3 P&L model.

## Review

Revisit by **P3-S6 launch retrospective** or earlier if any of:

- Tutor conversion rate (apply → first session) below 30%.
- Tutor-side complaints about Stripe-hosted dashboard exceed 10% of tutor population.
- Platform unit economics negative for two consecutive quarters at >100-tutor scale.
- A regulator (RBI, EU PSD2 successor) requires direct platform control over tutor finances that Express doesn't permit.
