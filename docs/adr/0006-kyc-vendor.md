# ADR-0006: KYC vendor for tutor + creator onboarding

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, HoP (Trust & Safety), Tech Lead
- **Related**: [Phase 3 plan](../02_planning/21_Phase3_SprintDevelopmentPlan.md), P3-S0 gating ADR #1, [ADR-0004](0004-checkout-platform.md), [ADR-0005](0005-service-consolidation.md)

## Context

Phase 3 P3-S1 onboards ~50 tutors. Each tutor must clear KYC before going live: government ID, selfie + liveness check, optional address-of-record proof, and a sanctions / PEP screening for Stripe Connect compliance.

This is not just a regulatory checkbox — it gates the **payouts** path (ADR-0007). Without KYC, Stripe Connect account creation fails. So KYC must land *before* tutor onboarding ships, not in parallel with it.

Three forces:

1. **Data residency** — Indian student PII data is the constraint that drove ADR-0001's "Aurora ap-south-1" decision. Tutor PII (passport / Aadhaar / address) is similarly sensitive. The vendor must either store data in-region or never store the data we send (token-only return).
2. **Operational overhead** — every KYC vendor needs an admin queue for borderline cases (manual review). Single-engineer team has limited capacity for a vendor-specific UI.
3. **Stripe coupling** — ADR-0007 is leaning toward Stripe Connect Express. Stripe Connect's own KYC (via Stripe Identity) is *integrated* into Connect onboarding. Choosing a separate KYC vendor means doing KYC twice.

## Decision

**Use Stripe Identity** (integrated into Stripe Connect Express onboarding) for tutor KYC. Tutors complete identity verification as part of the Stripe-hosted Connect onboarding flow. The platform never sees raw KYC documents; we receive a `verified | rejected | pending` status via webhook.

Creator marketplace (P3-S3) reuses the same Stripe Identity flow.

## Alternatives considered

- **Persona** — purpose-built KYC vendor; rich rule engine; markets-of-the-world coverage. **Rejected** because it adds a second PII data plane (in addition to Stripe), doubles the vendor surface area for the single-engineer team, and the rule-engine sophistication isn't needed for our 50-tutor closed beta.
- **Onfido** — similar shape to Persona; pricing favours volume. **Rejected** for the same reasons. Revisit if Stripe Identity proves inadequate at higher tutor scale (e.g. > 5,000 active tutors).
- **In-house KYC** — collect documents to S3, manual review by Trust & Safety lead. **Rejected** as a non-starter: regulatory liability (we'd need to be a Reporting Entity for AML purposes in India), engineering cost (selfie / liveness is a research project), and fraud risk (no automated check against sanctions lists).
- **Stripe Identity standalone** (not via Connect) — useful if we wanted the verification step decoupled from payouts. **Rejected** because it would mean stitching two Stripe products together for what Stripe already integrates.

## Consequences

### Positive

- **Single PII data plane** — Stripe stores all KYC + payout data; the platform never persists ID documents.
- **Single-engineer-friendly** — Stripe-hosted onboarding UI; no custom verification screens to build or maintain.
- **Sanctions/PEP screening** — built into Stripe Connect; no separate tool needed.
- **India residency** — Stripe is compliant with RBI norms for the markets this targets; legal sign-off needed but no architecture change.

### Negative

- **Vendor lock-in to Stripe** for both payouts AND KYC. If we ever want to change payout provider, we'd need to re-do KYC.
- **Less control over the rule engine** — Stripe's default thresholds are the thresholds. Edge cases (e.g. dual-citizenship tutors, low-income-country liveness false positives) are escalations to Stripe support, not adjustable knobs.
- **Per-verification cost** — Stripe Identity is ~$1.50/verification at the time of writing. At 50 tutors that's $75; at 5,000 it's $7,500. Revisit pricing model at scale (Persona/Onfido often beat Stripe for high-volume).

### Follow-up work

- [ ] Verify the Stripe Identity + Connect Express integration covers India + the Phase 2 markets in the planned P3-S1 cohort.
- [ ] Privacy policy + ToS update for tutor PII flow (Legal).
- [ ] Trust & Safety lead reviews Stripe's sanctions list coverage — minimum bar is OFAC SDN + UN.
- [ ] Webhook integration into `alp-payment` (already handles Stripe webhooks) — extend the `payment.subscription.changed` shape to include a sibling `payment.connect.identity_verified` event consumed by `alp-marketplace`.

## Review

Revisit by **2027-04-28** (one year) or earlier if any of:

- Stripe Identity false-positive rate on tutor onboarding > 10% (creates manual-review queue beyond Trust & Safety capacity).
- Per-verification cost at projected P3 end-of-year volume exceeds budgeted KYC line item by 2×.
- A new market requires KYC features Stripe Identity doesn't offer (e.g. specific regulator-mandated workflows in EU's PSD2 expansion).
