# Business Requirements Document — marketplace (service)

| | |
|---|---|
| **Service** | `services/marketplace` |
| **Tech** | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · Alembic · NATS · Daily.co · Stripe Identity |
| **Schema** | `marketplace_schema` (Aurora Postgres 15) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.5](../../00_platform/02_master_brd/master_brd.md#525-marketplace) |

---

## 1. Purpose

The `marketplace` service powers the **creator economy**: tutors onboard with KYC (Stripe Identity per ADR-0006), set rates within platform bands (ADR-0008), expose availability, accept bookings, run live sessions via Daily.co (ADR-0009), and receive payouts via Stripe Connect Express (ADR-0007, 15% platform take, weekly).

It coordinates with `payment` for money flow and `engagement` for notifications + reviews.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Tutor onboarding** | Application → review → activation |
| **KYC** | Stripe Identity start/poll/webhook |
| **Tutor profile** | Bio, qualifications, subjects, languages, rate, photo |
| **Pricing bands** | Per ADR-0008; admin sets bands; tutor rate within band |
| **Availability calendar** | Recurring + exceptions; TZ-aware |
| **Catalog + search** | Discover tutors with filters |
| **Booking** | Slot pick → checkout (delegates to payment) → confirm |
| **Inventory holds** | 15-min TTL on tentative booking |
| **Live session signalling** | NATS room create + Daily.co room URL + tokens |
| **Post-session** | Mandatory rating, optional review |
| **Refund policy** | ≥ 24 h before = full; in-flight per policy |
| **Reviews + rating** | 1–5 stars + text; min 4.0 retention threshold |
| **Earnings + payouts** | Coordinated with payment |
| **Creator analytics** | Sessions, earnings, ratings trend |
| **Admin tools** | Approve / reject tutor; resolve disputes; configure bands |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Content authoring | learning |
| Payment infrastructure | payment |
| Notifications | engagement |
| Video rendering / audio | Daily.co |
| Identity (verification step uses Stripe Identity, but we proxy) | Stripe Identity |

### 2.3 Scope by Phase

| Phase | marketplace ships |
|---|---|
| **Phase 1 (M0–M6)** | Foundation only (schema, scaffolding, OpenAPI scaffolding). No production marketplace yet. |
| **Phase 2 (M6–M12)** | Tutor onboarding · KYC · Profile + availability · Catalog + search · Booking + checkout integration · Daily.co live session · Post-session rating · Earnings + payouts · Disputes |
| **Phase 3+** | Group sessions · Session recording (opt-in) · International tutor expansion · Course storefronts |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead** | Tech owner | Architecture |
| **Marketplace Product** | Functional scope | AC approval |
| **Finance** | Take rate, payouts, tax | Sign-off |
| **Compliance** | KYC, content safety | Sign-off |
| **Security** | Daily.co token signing | Architecture review |
| **DevOps** | Daily.co integration | Cost monitoring |

## 4. Top Internal Journeys

| # | Journey | Trigger |
|---|---------|---------|
| 1 | Tutor applies | web-portal |
| 2 | KYC: Stripe Identity webhook updates status | Stripe |
| 3 | Student browses tutors | web-student / mobile |
| 4 | Booking → checkout → confirmation | Student |
| 5 | Pre-session lobby | T-5 min |
| 6 | Live session via Daily.co | Both parties join |
| 7 | Post-session rating | Student |
| 8 | Weekly payout job | Cron |
| 9 | Dispute opened by student | Student |
| 10 | Tutor banned by admin | web-admin |

## 5. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Tutor Onboarding + KYC | Application + Stripe Identity |
| FA-02 Tutor Profile | Bio, etc. |
| FA-03 Availability + Calendar | Slots, TZ |
| FA-04 Catalog + Search | Discover tutors |
| FA-05 Booking + Hold | Slot pick, 15-min hold, checkout |
| FA-06 Live Session Integration | Daily.co rooms, NATS signalling |
| FA-07 Post-Session Rating + Review | 1–5 + text |
| FA-08 Refund Policy | Window-based |
| FA-09 Earnings + Payouts | Connect Express, weekly |
| FA-10 Pricing Bands | Admin config |
| FA-11 Tutor Disputes | Status + evidence |
| FA-12 Creator Analytics | Sessions / earnings / ratings |
| FA-13 Admin Tutor Approval | Application queue |
| FA-XC | health/ready, OTel, OpenAPI, migrations |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-MK-01 | Perf | Tutor search (cached) | p95 < 200 ms |
| NFR-MK-02 | Perf | Tutor search (cold) | p95 < 600 ms |
| NFR-MK-03 | Perf | Booking create | p95 < 500 ms |
| NFR-MK-04 | Reliab | Booking inventory hold TTL | 15 min |
| NFR-MK-05 | Avail | Service uptime | 99.9% |
| NFR-MK-06 | Money | Weekly payout job idempotent | required |
| NFR-MK-07 | Money | Daily reconciliation with payment | required |
| NFR-MK-08 | Compliance | KYC re-verify cadence | annual (OQ-MK-01) |
| NFR-MK-09 | Compliance | DPDPA / GDPR tutor PII | encrypted; minimal logs |
| NFR-MK-10 | Compliance | Tax: India TDS 194O | Phase 2 (with payment) |
| NFR-MK-11 | Compliance | Financial record retention | 7 years |
| NFR-MK-12 | Security | Daily.co tokens server-signed | required |
| NFR-MK-13 | Security | Tutor banking info via Stripe Connect only | required |
| NFR-MK-14 | Observability | Per-stage funnel (apply → KYC → active → first booking) | required |
| NFR-MK-15 | Observability | Payout failure dashboard | required |
| NFR-MK-16 | Cost | Daily.co usage monitored (per minute) | required |
| NFR-MK-17 | Migration | Alembic up/down | required |
| NFR-MK-18 | API | OpenAPI 3.1 | required |
| NFR-MK-19 | Booking | Inventory hold race-safe (DB lock or Redis lease) | required |
| NFR-MK-20 | Rating | Minimum 4.0 avg for retention | enforced |

---

## 8. Constraints & Assumptions

- **C-MK-01** Per ADR-0006, KYC via Stripe Identity.
- **C-MK-02** Per ADR-0007, payouts via Stripe Connect Express; 15% platform take; weekly.
- **C-MK-03** Per ADR-0008, tutors set rate within platform-defined bands.
- **C-MK-04** Per ADR-0009, live session signalling via NATS + Daily.co.
- **C-MK-05** Bookings paid via `payment` service (delegation pattern).
- **C-MK-06** Tutor banking info NEVER in our DB — Stripe Connect only.
- **C-MK-07** Inventory holds race-safe.
- **C-MK-08** All amounts in paise.

### Assumptions
- **A-MK-01** Stripe Identity contract signed.
- **A-MK-02** Stripe Connect Express approved for India by go-live.
- **A-MK-03** Daily.co account active.

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-MK-01 | identity | tutor role + RBAC |
| D-MK-02 | payment (Stripe Connect + checkout) | Bookings + payouts |
| D-MK-03 | engagement | notifications |
| D-MK-04 | learning | tutors-as-authors cross-attribution |
| D-MK-05 | Stripe Identity | KYC |
| D-MK-06 | Daily.co | live video |
| D-MK-07 | NATS | session signalling + outbound events |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-MK-01 | KYC rejection rate high → tutor pipeline empty | Med | High | Pre-launch tutor seeding + actionable rejection feedback |
| R-MK-02 | Booking inventory race → double-booking | Med | High | Atomic hold + Redis lease + DB unique constraint |
| R-MK-03 | Daily.co outage during session | Low | High | Session reschedule policy + refund |
| R-MK-04 | Payouts incorrect (15% off) | Med | High | Daily reconciliation + payment service authoritative |
| R-MK-05 | Tutor fraud (impersonation) | Med | High | Stripe Identity + manual review + rating threshold |
| R-MK-06 | Tax compliance (TDS 194O) | High | High | Coordinate with payment Phase 2 |
| R-MK-07 | Currency conversion for non-INR tutors | Med | Med | Defer multi-currency Phase 2 with payment |

## 11. Success Criteria

marketplace Phase 2 launch **Done** when:

1. All P0/P1 stories shipped + tests
2. NFR-MK-* verified
3. 10 pilot tutors onboarded successfully end-to-end
4. KYC → first payout end-to-end on Stripe sandbox
5. 100 concurrent booking-search load test
6. Daily reconciliation green for 1 week
7. Disputes process tested

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-MK-01 | KYC re-verify cadence — annual / 2yr / risk-based | Compliance | Phase 2 Week 1 |
| OQ-MK-02 | Multi-currency Phase 2 — which non-INR | Finance | Phase 2 Week 4 |
| OQ-MK-03 | India TDS 194O handling | Finance + Legal | Phase 2 Week 2 |
| OQ-MK-04 | Group sessions vs 1:1 only | Product | Phase 2 Week 6 |
| OQ-MK-05 | Tutor exclusivity (other platforms allowed?) | Legal | Phase 2 Week 4 |
| OQ-MK-06 | Session recording — opt-in / mandatory / never | Product + Legal | Phase 2 Week 4 |
| OQ-MK-07 | Free trial first session | Product | Phase 2 Week 1 |
| OQ-MK-08 | Rating threshold for de-listing (3.5? 4.0?) | Product | Phase 2 Week 6 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead | _Pending_ | | |
| Marketplace Product | _Pending_ | | |
| Finance | _Pending_ | | |
| Compliance | _Pending_ | | |
| QA Lead | _Pending_ | | |
