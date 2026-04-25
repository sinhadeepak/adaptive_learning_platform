# Phase 3 Sprint Development Plan

**Project**: Adaptive Learning Platform — Phase 3 (Platform Evolution)
**Planning horizon**: ~22 weeks (6 sprints, target 2027 H1).
**Target launch**: 2027 — exact quarter set after Phase 2 closure retrospective.
**Team**: ~16 engineers (additions over P2: 1 BE Python, 1 Mobile, 1 ML, 1 Trust & Safety lead). Localization PM stays.
**Status**: **DRAFT — forward-looking**, lower fidelity than Phases 1/2. Concrete sprint scope is set after Phase 2 closure publishes; this doc establishes shape, count, and gating decisions so capacity planning can begin.
**Authoritative inputs**: [Release Plan / MVP §1.1](04_ReleasePlan_MVPScope_AdaptiveLearningPlatform.docx) (Phase 3 scope: B2B API writes, live tutor marketplace, content marketplace, advanced institution analytics — predictive), [Phase 2 Sprint Plan](19_Phase2_SprintDevelopmentPlan.md) (P3 inherits any P2 carry-overs).

---

## What changes vs. Phase 2

Phase 2 expanded markets and modes (live sessions + native video) but kept the **single-tenant content + single-vendor** model: instructors are institution-affiliated, content is platform-curated. Phase 3 turns the platform into a two-sided marketplace:

1. **Live tutor marketplace** — independent tutors discover/get-discovered, schedule sessions, get paid out. Students rate. Trust & Safety becomes a real surface.
2. **Content marketplace** — creators sell individual courses; platform takes commission. Refund flows, royalty math, creator payout cycles.
3. **B2B API writes + webhooks** — Phase 2's read-only API is now a real integration platform.
4. **Predictive analytics** — Phase 2 was descriptive (cohort vs. global, time-series). Phase 3 forecasts drop-out, suggests interventions, recommends content.

These four threads interact: marketplace requires payouts (Stripe Connect), payouts require KYC, KYC adds compliance load, B2B writes amplify any marketplace inconsistency, predictive analytics pulls data from all of the above. The plan reflects that interaction.

---

## Timeline at a glance

| Sprint | Weeks | Theme | Headline outcome |
|---|---|---|---|
| **P3-S0** | 1–3 | Foundation + P2 carry-overs + 6 gating ADRs | Marketplace economics + KYC + payout architecture decided |
| **P3-S1** | 4–7 | Live tutor marketplace — supply side | Tutor onboarding, KYC, profile, calendar; closed-beta to ~50 tutors |
| **P3-S2** | 8–11 | Live tutor marketplace — demand side + payouts | Discovery + booking + ratings + Stripe Connect payouts; soft launch |
| **P3-S3** | 12–15 | Content marketplace | Creator onboarding, course authoring v2, individual-course commerce, royalty engine |
| **P3-S4** | 16–18 | B2B API writes + webhooks | Partner-driven cohort/assignment creation; webhook fan-out; idempotency |
| **P3-S5** | 19–21 | Predictive analytics + recommendations maturity | Drop-out forecasting, intervention triggers, "you might also study" production-grade |
| **P3-S6** | 22 | Stabilization + Phase 3 launch | Drills 7+8 (marketplace fraud, webhook flood). Soft → full launch. |

**Total: 6 sprints, ~22 weeks.** Sprint widths follow the Phase 2 pattern (S0 = 3 weeks for ADR-heavy work, S1–S5 = 4 weeks for compound feature surfaces, S6 = 1-week launch sprint).

---

## P3-S0 — Foundation + P2 carry-overs + 6 ADRs (Weeks 1–3)

**Goal**: Phase 2 retrospective closed. Six load-bearing ADRs accepted before any P3 feature code.

**Capacity**: ~135 SP (3-week sprint). First 5 days: P2 carry-over closure + retrospective.

### Six gating ADRs

1. **Marketplace economics** — commission rate, payout cadence, reserve policy, refund chargeback handling. HoP + CTO + Legal own.
2. **KYC + identity verification** for tutors and creators. Vendor (Persona / Onfido / Stripe Identity) vs. in-house. Privacy + data-residency implications across P2 markets.
3. **Stripe Connect topology** — Standard vs. Express vs. Custom accounts. Tutors are Standard (full Stripe dashboards); creators may be Express (lower friction). Settlement currency per region.
4. **Webhook delivery semantics** — at-least-once, signed (HMAC), retry/backoff, partner-side replay endpoint. Versioning of event payloads. Storage of delivery attempts.
5. **Predictive analytics architecture** — feature store, model serving, training cadence. Pure-stdlib (extending Adaptive Engine) vs. dedicated MLOps stack (MLflow + Sagemaker / Vertex AI).
6. **Recommendation system** — algorithm choice (collab filtering, content-based via embeddings, hybrid). Evaluation metric. Cold-start strategy.

### Other P3-S0 deliverables

- **Trust & Safety lead onboarded.** Establishes content + tutor moderation policy, abuse handling, escalation matrix.
- **Phase 2 retrospective** (`docs/02_planning/22_Phase2_Retrospective.md`).
- **Phase 2 carry-overs closed** — anything deferred from P2-S4 launch into P2.5 should land here, not become P3-S1 baggage.
- **Marketplace test cohort identified** — 50 candidate tutors + 5 candidate creators committed verbally to closed beta participation.

### Gap closure gating P3-S1

| Item | Owner | Must be YES before P3-S1 starts |
|---|---|---|
| 6 ADRs accepted | Tech Lead + CTO | All merged into `docs/adr/` |
| Stripe Connect sandbox accounts in target markets | Payment BE Lead | Test tutor onboarding works end-to-end without real KYC |
| KYC vendor sandbox usable | BE Lead Python A | Test identity flow returns mock decision |
| Trust & Safety policy v1 published | T&S Lead | Tutor onboarding can validate against published rules |
| Phase 2 P0/P1 carry-overs closed | Tech Lead | Gap Register clean, retrospective published |
| Marketplace test cohort signed-up | HoP | At least 30 tutors committed to participate in P3-S1 closed beta |

### Risks

- **ADR thrash** — 6 ADRs in 3 weeks is aggressive when Marketplace economics and KYC vendor choices have legal review loops. Mitigation: kick off Marketplace economics ADR pre-sprint (during P2-S4); use P3-S0 for execution + 4 lighter ADRs.
- **Trust & Safety lead delayed** — moderation policy blocks P3-S1 tutor onboarding flow. Mitigation: contract policy work to a vendor for the first 6 weeks while permanent hire lands.

---

## P3-S1 — Live tutor marketplace, supply side (Weeks 4–7)

**Goal**: 30 tutors complete onboarding end-to-end including KYC. Closed beta reachable to a small pre-confirmed student cohort.

**Capacity**: ~180 SP (4 weeks).

### Feature work

| Epic | Notes |
|---|---|
| **Tutor service (new)** — profile, qualifications, subjects taught, hourly rate, calendar availability, timezone | Owner: BE Lead Python A. New service following the pattern of Content/Institution. |
| **KYC integration** — vendor SDK in tutor onboarding flow; document upload; result polling; manual-review queue for borderline cases | Owner: BE Lead Python A + T&S Lead |
| **Stripe Connect onboarding** — tutor links a Stripe account; platform stores connect-account-id; tutor can update payout details via Stripe-hosted dashboard | Owner: BE Lead Python A |
| **Web-portal tutor section** — application form, KYC status tracking, calendar management, earnings preview | Owner: FE Lead B |
| **Mobile tutor flow (deferred)** — tutors use web for onboarding in P3-S1; mobile app comes in P3-S3 if capacity | — |
| **Tutor moderation tools** in web-admin — T&S queue, application approval/rejection, suspension flow | Owner: FE Lead B + T&S Lead |
| **Content moderation pipeline** — AI-assist (toxicity / NSFW classifiers), human-in-loop queue | Owner: ML Engineer + T&S Lead |

### Gap closure

- **GAP-XX tutor data privacy** — tutor PII (KYC docs) classified at higher tier; encryption-at-rest review.
- **OI-XX 1099/withholding compliance** for US tutors (if US is a P3 market).
- **OI-XX background check policy** for tutors teaching minors — does the platform require it? Region-specific.

### Exit criteria

- 30 tutors onboarded to staging, KYC clears, Stripe Connect linked, profiles visible.
- T&S queue processes 50 test applications in < 24h SLA.
- No P0 defects in tutor flow. Tutor can edit their availability calendar.

### Risks

- **KYC false-rejection rate** spikes with international document types. Mitigation: human-in-loop approval queue with 24h SLA from Day 1.
- **Stripe Connect approval delays** in some markets (KSA, UAE require business documents). Mitigation: scope P3-S1 to markets where Stripe Connect is already general-availability.

---

## P3-S2 — Live tutor marketplace, demand side + payouts (Weeks 8–11)

**Goal**: A real student books a real session with a real tutor. Tutor gets paid out at the end of the cycle.

**Capacity**: ~180 SP.

### Feature work

| Epic | Notes |
|---|---|
| **Tutor discovery** — search by subject + language + time-zone availability + price + ratings | Owner: BE Lead Python C — extends Search service with a `tutors` index alongside `topics` |
| **Booking flow** — slot selection, hold + payment, confirmation, calendar integration (ICS export) | Owner: BE Lead Python A |
| **Session join experience** — extends P2 live session infra; tutor + student see each other in the WebRTC room | Owner: BE Lead Go |
| **Ratings + reviews** — student rates after session; aggregate score on tutor profile; abuse reporting | Owner: BE Lead Python B + T&S Lead |
| **Stripe Connect payouts** — platform deducts commission; tutor receives net payout per Stripe schedule (daily / weekly per ADR) | Owner: BE Lead Python A |
| **Refund policy** — student-cancelled (full refund > 24h, 50% < 24h, 0% < 1h), tutor no-show (full refund + tutor strike) | Owner: BE Lead Python A + Legal |
| **Web-student tutor browse + book** | Owner: FE Lead A |
| **Mobile tutor browse + book** | Owner: Mobile Leads |

### Gap closure

- **GAP-XX session disputes** — a student claims the session didn't happen / wasn't useful. Resolution flow + escalation to T&S.
- **GAP-XX time-zone math edge cases** — sessions across DST boundaries; ICS calendar correctness.
- **OI-XX tax invoicing** — tutors need annual statements per market (1099 in US, GST in India, etc.).

### Exit criteria

- Closed beta: 100 students each book ≥ 1 session with one of the 30 tutors. ≥ 80% sessions complete (no-show < 20%).
- Stripe Connect payouts complete on schedule for the first cycle. Reconciliation report matches.
- Ratings show on tutor profiles; abuse reports flow into T&S queue.
- Phase 3a soft launch toggle ready (the feature-flag flip is the launch event).

### Risks

- **Marketplace cold-start** — too few tutors per subject means students see "no available slot in your timezone." Mitigation: P3-S0 onboarding cohort weighted toward most-popular subjects (math, physics).
- **Disputes overwhelm T&S** in early days. Mitigation: rate-limit booking volume per tutor in week 1; gradually lift.

---

## P3-S3 — Content marketplace (Weeks 12–15)

**Goal**: Creators sell individual courses. Platform takes commission. Closed beta with 5 creators.

**Capacity**: ~180 SP.

### Feature work

| Epic | Notes |
|---|---|
| **Creator service** — course authoring v2 (multi-lesson, prerequisites, video chapters, attachments). Reuses Content service patterns | Owner: BE Lead Python C |
| **Course commerce** — course as a SKU; one-time purchase (vs. Phase 1's subscription); refund policy | Owner: BE Lead Python A |
| **Royalty engine** — platform commission, creator payout, partner referrals (if any). Per-purchase fee accounting | Owner: BE Lead Python A — extends P3-S2 payout infra |
| **Bundles + promotions** — creator can bundle courses; platform-issued promo codes | Owner: BE Lead Python A + FE Lead B |
| **Creator analytics dashboard** — views, completion, revenue per course | Owner: BE Lead Python A + FE Lead B |
| **Web-portal creator section** — application, course authoring v2 UI, earnings preview | Owner: FE Lead B |
| **Web-student course browse + buy + consume** | Owner: FE Lead A |
| **Mobile course consumption** — premium-gated; offline download per course (Premium-tier perk) | Owner: Mobile Leads |
| **Course moderation** — T&S reviews each course before public listing | Owner: T&S Lead |

### Exit criteria

- 5 creators publish 1 course each. Test cohort of 50 students each buys + completes ≥ 1 course.
- Royalty engine reconciles: sum of (platform commission + creator payout + tax withholding) == gross revenue.
- Course moderation queue processes new submissions within 48h SLA.

### Risks

- **Refund-fraud abuse** — student buys course, downloads, requests refund. Mitigation: refund policy gates on watch-progress threshold (< 25% watched is refundable; ≥ 25% is not).
- **Course quality floor** unclear — what's "good enough" for the storefront? Mitigation: T&S + ML Engineer build a lightweight quality classifier (audio level, video resolution, transcript clarity) as part of moderation pipeline.

---

## P3-S4 — B2B API writes + webhooks (Weeks 16–18)

**Goal**: Two pilot partners (carried from P2-S3 sandbox) execute production write flows. Webhook fan-out reliable.

**Capacity**: ~135 SP (3 weeks — narrower scope, lower-risk sprint).

### Feature work

| Epic | Notes |
|---|---|
| **API writes** — POST `/cohorts`, POST `/cohorts/:id/students`, POST `/assignments`, POST `/topics` (limited), DELETE patterns | Owner: BE Lead Python C |
| **Webhooks** — partner-supplied URL receives signed POST on configured events (student.completed_quiz, cohort.assignment_due, etc.). Retries with exponential backoff. Delivery dashboard | Owner: BE Lead Python B |
| **Idempotency keys** — partner-supplied `Idempotency-Key` header for write endpoints; server stores for 24h. RFC-aligned. | Owner: BE Lead Python C |
| **Rate-limit overhaul** — partner-tier specific (free / standard / enterprise); per-endpoint and global; observable | Owner: BE Lead Go (gateway extends from P2-S3) |
| **Partner SDK (TypeScript)** — generated from OpenAPI spec; published to npm | Owner: Tech Lead + DevOps |
| **API console in web-portal** — partner sees their event stream + can replay individual webhooks | Owner: FE Lead B |

### Gap closure

- **GAP-XX webhook signature versioning** — what does it look like when we change the signing algorithm?
- **GAP-XX partner idempotency-key TTL** — collision handling, observability.

### Exit criteria

- 2 pilot partners execute 1k+ write API calls each in production sandbox; 100% delivered + idempotent.
- Webhook retry budget honored: 99.5% delivered within 5 min; never delivered out-of-order within a single partner channel.
- TypeScript SDK published; example app reaches green CI in partner repo.

### Risks

- **Partner-side bugs cause webhook storms** that exhaust our delivery infra. Mitigation: hard rate-limit per partner; circuit-break on sustained 5xx.

---

## P3-S5 — Predictive analytics + recommendations maturity (Weeks 19–21)

**Goal**: Drop-out prediction + intervention triggers in production. Recommendations engine MVP from P2-S4 graduates to A/B-tested production system.

**Capacity**: ~135 SP.

### Feature work

| Epic | Notes |
|---|---|
| **Drop-out prediction model** — features: streak, recent quiz completion rate, readiness trend, days-since-active. Output: probability + top contributing features. Trained weekly. | Owner: ML Engineer (lead) + BE Lead Python A |
| **Intervention engine** — when probability > threshold, trigger nudge (push notification, email, in-app banner). Cooldown to avoid harassment. | Owner: ML Engineer + BE Lead Python B |
| **Recommendations production** — supersedes the P2-S4 stretch MVP. A/B tested vs. baseline. Cold-start handled. | Owner: ML Engineer |
| **Recommendation surfaces** — "you might also study" on web-student home, mobile home, post-quiz screen | Owner: FE Lead A + Mobile Leads |
| **ML observability** — model drift dashboards, training metrics, feature-distribution alarms | Owner: ML Engineer + DevOps |

### Exit criteria

- Drop-out classifier achieves ≥ 0.7 AUC on held-out test set.
- A/B test runs for ≥ 2 weeks; recommendation lift ≥ 5% on quiz-completion rate (if not, ship-as-baseline + iterate).
- Nudge cooldown working: no user receives > 2 nudges/week.

### Risks

- **Model fairness** — drop-out predictor may correlate with demographics. Mitigation: fairness audit before production; document mitigations.
- **Nudge fatigue** — users disable notifications. Mitigation: respect existing notification preferences; A/B-test cooldown windows.

---

## P3-S6 — Stabilization + Phase 3 launch (Week 22)

**Goal**: Phase 3 features available to general public globally.

**Capacity**: ~50 SP.

### Drills 7 + 8

- **Drill 7: marketplace fraud** — simulated fake-tutor abuse pattern; T&S response time < 4h; payout-hold mechanism honors freeze.
- **Drill 8: webhook delivery storm** — partner returns 5xx for 30 min; verify retry queue drains, no message loss, no other-partner impact.

### Phase 3a soft launch (Week 22 Day 4)
- Live tutor marketplace + content marketplace open to existing customers in 2 markets (India + UAE).
- B2B API writes available to existing API customers.
- Predictive nudges enabled at conservative threshold.

### Phase 3b full launch (Week 22 Day 7)
- Marketplaces public globally.
- Press + marketing release.
- 24/7 on-call expanded; T&S response SLAs enforced.

---

## Sprint count summary (final)

| Phase | Sprints | Status |
|---|---|---|
| Phase 0 | 1 | ✅ done |
| Phase 1 | 4 (S1–S4) | S1+S2 done · S3 ~50% · S4 not started |
| Phase 2 | 5 | ❌ all 5 pending (`19_Phase2_SprintDevelopmentPlan.md`) |
| **Phase 3** | **6** | **❌ all 6 pending (this doc)** |

**Total sprints across all phases**: **16** (1 + 4 + 5 + 6).
**Sprints pending today**: **~12.5** (Phase 1 carry-over ≈ 1.5 + all of Phase 2 + all of Phase 3).
**Phase 3 launch window**: 2027 (TBD precise quarter after Phase 2 retrospective).

---

## What this plan deliberately does NOT cover

These items appear in long-term vision conversations but are NOT scoped here. They land in a future Phase 4 plan if/when product strategy commits to them:

- **Native mobile-first authoring** (currently authoring is web-only).
- **Generative-AI question authoring assistant** for content creators.
- **Live group classes** (1-to-many tutoring vs. P3's 1-to-1).
- **Adaptive content marketplace** — recommendations for which course to buy next based on mastery state.
- **Localization for non-Latin/non-Devanagari/non-Arabic scripts** beyond what P2 ships.

---

## Open questions blocking finalization

These need answers before the Phase 2 retrospective hands off to P3-S0:

1. **Phase 3 markets** — same as P2 (UAE + Singapore + UK + KSA + India)? Or expansion to LATAM / SEA?
2. **Marketplace commission structure** — flat 20%? Tiered? Negotiable for high-volume creators?
3. **KYC vendor** — Persona vs. Onfido vs. Stripe Identity. Cost/feature comparison needed.
4. **Live-session 1-to-many extension** — Phase 3 or Phase 4? Has product-strategy implications.
5. **ML team scaling** — current 1 ML Engineer can MVP recommendations + drop-out, but A/B test infrastructure may need a dedicated ML platform engineer.

---

## Authoring note

This plan is **forward-looking and lower-fidelity** than Phases 1/2 by design. Concrete PR breakdowns aren't possible 12+ months ahead of execution. What this doc does:

- Establishes that Phase 3 is **6 sprints** for capacity planning purposes.
- Identifies the **6 gating ADRs** that must precede feature work.
- Names the **load-bearing risks** (marketplace cold-start, KYC false-rejection, fraud, ML fairness) so they're not surprises.
- Locks the **launch order** (live tutors → content marketplace → B2B writes → predictive analytics → public launch).

Re-baseline at Phase 2 closure retrospective. Treat estimates as ±30%.
