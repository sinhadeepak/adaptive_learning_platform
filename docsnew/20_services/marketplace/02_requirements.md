# Requirements Catalogue — marketplace (service)

**Anchored to:** [BRD §5](./01_brd.md#5-functional-areas) · [Master BRD §5.2.5](../../00_platform/02_master_brd/master_brd.md#525-marketplace)

---

## FA-01 — Tutor Onboarding + KYC

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-01-01 | Submit application (subjects, qualifications, sample work, motivation) | P0 | 2 |
| FR-MK-01-02 | Application status visible | P0 | 2 |
| FR-MK-01-03 | Start KYC via Stripe Identity (start endpoint) | P0 | 2 |
| FR-MK-01-04 | Poll KYC status | P0 | 2 |
| FR-MK-01-05 | Stripe Identity webhook → status update + UI within 60 s | P0 | 2 |
| FR-MK-01-06 | On rejection: actionable reason + retry | P0 | 2 |
| FR-MK-01-07 | Admin approval transition (application_status → approved) | P0 | 2 |
| FR-MK-01-08 | identity role escalation to `tutor` on approval | P0 | 2 |
| FR-MK-01-09 | Annual KYC re-verify (OQ-MK-01) | P1 | 2 |

## FA-02 — Tutor Profile

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-02-01 | Bio (rich text, ≤ 1500 chars) | P1 | 2 |
| FR-MK-02-02 | Subjects taught (multi-select) | P1 | 2 |
| FR-MK-02-03 | Languages spoken | P1 | 2 |
| FR-MK-02-04 | Hourly rate within band (FR-MK-10) | P1 | 2 |
| FR-MK-02-05 | Profile photo (≤ 2 MB, square crop) | P1 | 2 |
| FR-MK-02-06 | Qualifications (multi-entry, ≤ 5) | P1 | 2 |
| FR-MK-02-07 | Public preview | P1 | 2 |
| FR-MK-02-08 | Profile completion meter | P1 | 2 |

## FA-03 — Availability + Calendar

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-03-01 | Recurring weekly availability | P1 | 2 |
| FR-MK-03-02 | One-off exceptions | P1 | 2 |
| FR-MK-03-03 | Slot length config (30/60/90 min) | P1 | 2 |
| FR-MK-03-04 | Lead time min (e.g. 4 hr) | P1 | 2 |
| FR-MK-03-05 | TZ display + storage in UTC | P0 | 2 |
| FR-MK-03-06 | iCal feed export | P2 | 2 |

## FA-04 — Catalog + Search

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-04-01 | Browse tutors with filters (subject, exam, language, price, rating) | P1 | 2 |
| FR-MK-04-02 | Sort by rating / price / availability | P1 | 2 |
| FR-MK-04-03 | Tutor profile public detail | P1 | 2 |
| FR-MK-04-04 | OpenSearch indexing of public profiles | P1 | 2 |
| FR-MK-04-05 | Featured tutors (admin curation) | P2 | 2 |
| FR-MK-04-06 | Cache search results (60 s TTL) | P0 | 2 |

## FA-05 — Booking + Hold

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-05-01 | Create booking with 15-min inventory hold | P1 | 2 |
| FR-MK-05-02 | Atomic hold (no double-booking) | P0 | 2 |
| FR-MK-05-03 | Initiate checkout via payment service | P1 | 2 |
| FR-MK-05-04 | Payment webhook → booking confirmed | P0 | 2 |
| FR-MK-05-05 | Confirmation notification | P1 | 2 |
| FR-MK-05-06 | Calendar invite (ICS) | P2 | 2 |
| FR-MK-05-07 | Hold expiry releases slot | P0 | 2 |
| FR-MK-05-08 | Booking visible in tutor's "today" panel | P1 | 2 |

## FA-06 — Live Session Integration

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-06-01 | Pre-session join window (T-5 min) | P1 | 2 |
| FR-MK-06-02 | Server creates Daily.co room with signed token | P0 | 2 |
| FR-MK-06-03 | Both parties join via SDK | P1 | 2 |
| FR-MK-06-04 | Session heartbeat every 30 s | P1 | 2 |
| FR-MK-06-05 | Session end webhook from Daily.co | P0 | 2 |
| FR-MK-06-06 | Session-end records duration + status | P0 | 2 |
| FR-MK-06-07 | No-show detection (one party didn't join 10 min in) | P1 | 2 |
| FR-MK-06-08 | NATS publish on session events | P1 | 2 |

## FA-07 — Post-Session Rating + Review

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-07-01 | Mandatory rating (1–5) after session | P1 | 2 |
| FR-MK-07-02 | Optional text review | P1 | 2 |
| FR-MK-07-03 | Aggregate rating updated within 5 min | P1 | 2 |
| FR-MK-07-04 | Public reviews visible on tutor profile | P1 | 2 |
| FR-MK-07-05 | Tutor cannot delete reviews | P0 | 2 |
| FR-MK-07-06 | Review-report flow (auto-flag profanity) | P1 | 2 |

## FA-08 — Refund Policy

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-08-01 | Cancel ≥ 24 h before slot = full refund | P1 | 2 |
| FR-MK-08-02 | Cancel < 24 h = no refund (policy) | P1 | 2 |
| FR-MK-08-03 | No-show by tutor = full refund + tutor strike | P1 | 2 |
| FR-MK-08-04 | Refund executed via payment service | P0 | 2 |

## FA-09 — Earnings + Payouts

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-09-01 | Compute tutor earnings (85% of completed session amount) | P1 | 2 |
| FR-MK-09-02 | Earnings dashboard read | P1 | 2 |
| FR-MK-09-03 | Trigger weekly payout (delegated to payment) | P1 | 2 |
| FR-MK-09-04 | Reconcile payout status from payment | P1 | 2 |
| FR-MK-09-05 | Failed payout notification + remediation steps | P1 | 2 |

## FA-10 — Pricing Bands

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-10-01 | Admin creates pricing bands per exam/subject (₹X..₹Y) | P1 | 2 |
| FR-MK-10-02 | Tutor sets rate within band (validate on PUT) | P1 | 2 |
| FR-MK-10-03 | Band history (audit) | P1 | 2 |

## FA-11 — Tutor Disputes

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-11-01 | Dispute submission (by student or tutor) | P1 | 2 |
| FR-MK-11-02 | Dispute status: open → under_review → resolved-{tutor, student} | P1 | 2 |
| FR-MK-11-03 | Evidence submission | P1 | 2 |
| FR-MK-11-04 | Resolution affects payout (hold/refund) | P1 | 2 |
| FR-MK-11-05 | Admin queue (in web-admin) | P1 | 2 |

## FA-12 — Creator Analytics

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-12-01 | Sessions count + duration sum | P1 | 2 |
| FR-MK-12-02 | Earnings (lifetime + month) | P1 | 2 |
| FR-MK-12-03 | Rating trend | P1 | 2 |
| FR-MK-12-04 | No-show rate | P1 | 2 |

## FA-13 — Admin Tutor Approval (provides API for web-admin)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-MK-13-01 | List pending applications | P1 | 2 |
| FR-MK-13-02 | Approve / reject application | P1 | 2 |
| FR-MK-13-03 | Ban tutor (reason + audit) | P1 | 2 |
| FR-MK-13-04 | Restore tutor | P1 | 2 |

## Cross-Cutting

Standard 10 FRs.
