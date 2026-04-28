# ADR-0008: Marketplace pricing model — tutor sessions + creator content

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, HoP, Marketing Lead
- **Related**: P3-S0 gating ADR #3, [ADR-0007](0007-stripe-connect-rollout.md)

## Context

Two marketplaces in Phase 3:

1. **Live tutor sessions** (P3-S1+) — tutor sets a per-hour rate; student books a session at that rate; platform takes commission per ADR-0007.
2. **Creator content** (P3-S3+) — creator publishes a course; charges per-course or subscription; platform takes commission.

The pricing model question is: **who sets prices, and what bands constrain them?**

Three forces pulling against each other:

- **Tutor / creator autonomy** — they know their market value better than the platform does. A senior IIT JEE tutor charges 5× a recent graduate; that's the market clearing.
- **Student affordability** — at full tutor-sets-price, the platform's "AI-powered personalised learning" promise becomes hollow because only rich students can afford the top tutors. Phase 1 promise was "JEE/NEET prep affordable to a tier-3 town student".
- **Race-to-the-bottom risk** — open price-setting tends toward $5/hr commodity tutoring (good for student price, bad for tutor quality + retention). India ed-tech has seen this on Chegg/CourseHero.

## Decision

**Creator-set pricing within platform-imposed bands.** Specifically:

### Tutor sessions (P3-S1)

- Tutors set their per-hour rate.
- Bands enforced by the platform:
  - **Floor**: ₹100/hr (rough $1.20/hr) — below this commission can't sustain platform unit economics.
  - **Ceiling**: ₹5,000/hr (rough $60/hr) — above this we ask the tutor to apply for a "Verified Premium" tier (manual review, KYC of credentials, marketing tier listing).
- Bands are flag-driven (`tutor_pricing_floor_paise`, `tutor_pricing_ceiling_paise`), not hardcoded. Adjust per market.

### Creator content (P3-S3)

- Creators set per-course price.
- Bands:
  - **Floor**: ₹49/course (penny-tier; below this Stripe fees eat margin).
  - **Ceiling**: ₹4,999/course (above this requires a manual upload review).
- Free / pay-what-you-want modes deferred to P3-S4 (extra surface area).

### Platform-tiered overrides (escape hatches)

- **Free trial sessions**: each tutor gets 1 session/student priced at ₹0 (booking flow handles this; commission still deducted from a "platform-funded acquisition pool" so tutor still gets paid out for trial sessions). Limit per student = 3 trial sessions across all tutors. Anti-abuse via the existing rate-limiter.
- **Subscription bundling**: students on `STUDENT_PREMIUM` tier (per ADR-0004) get N tutor session credits/month. Implementation deferred to P3-S2.

## Alternatives considered

- **Platform-tiered (platform sets all prices)** — all tutor sessions at flat ₹X. **Rejected** — kills tutor differentiation; senior tutors leave for off-platform. Too inflexible.
- **Pure creator-set (no bands)** — Udemy / Outschool model. **Rejected** — race-to-the-bottom; quality erosion; doesn't fit the "premium AI tutoring" brand.
- **Auction (students bid, tutors accept)** — eBay-for-tutors. **Rejected** — research project for P3-S1 timeline; unfamiliar UX for ed-tech.
- **Subscription-only (tutor sessions included in STUDENT_PREMIUM)** — flat platform fee, tutors paid per-session by platform. **Rejected** because it caps tutor earning ceiling; high-end tutors leave. Considered as a *companion* offering (the bundling escape hatch above).

## Consequences

### Positive

- **Tutor differentiation preserved** — senior IIT JEE tutor at ₹3,000/hr coexists with bright graduate at ₹400/hr.
- **Student affordability protected via floors + bundling** — every student can find a ₹100/hr-tier tutor.
- **Race-to-the-bottom blocked** — floor ensures basic unit economics; no ₹50/hr commodity tutoring.
- **Bands are flag-driven** — per-market tuning without code change.

### Negative

- **Bands are arbitrary today** — chosen by gut feel + competitor scan. Need to A/B test or post-launch adjust.
- **Premium-tier review queue** — tutors > ceiling create manual-review work for Trust & Safety. Estimate 1–2 reviews/week at P3-S1 scale.
- **Free trial requires platform-funded acquisition pool** — accounting trick that complicates the ledger. Not free engineering work in P3-S2.

### Follow-up work

- [ ] Add `tutor_pricing_floor_paise` + `tutor_pricing_ceiling_paise` to the institution flag system (use the existing flag tables; tenant-scoped overrides allowed for B2B).
- [ ] Per-market band table (P3-S1 launches India-only; bands per future market is P3-S6).
- [ ] Premium-tier review workflow (P3-S2) — extends `tutor_profiles.tier` enum.
- [ ] Free-trial booking + acquisition-pool accounting (P3-S2).
- [ ] Subscription bundling design (P3-S2) — STUDENT_PREMIUM gets N credits/month.

## Review

Revisit by **end of P3-S2** (after first 3 months of tutor live data) or earlier if:

- Median tutor rate clusters at the floor (signals race-to-bottom; raise floor).
- Premium-tier review queue exceeds 5/week sustained (signals ceiling too low; raise it or simplify review).
- Student attach rate to bundling > 50% (signals demand for subscription-included tutoring; design v2).
