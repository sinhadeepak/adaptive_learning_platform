# alp-marketplace

The 6th and final service slot reserved by [ADR-0005](../../docs/adr/0005-service-consolidation.md). Phase 3 destination for:

- **Tutor profiles + availability + bookings** (P3-S1)
- **Tutor session ratings** (P3-S2)
- **Stripe Connect onboarding events** (P3-S2)
- **Creator profiles + course listings** (P3-S3)
- **Revenue-share ledger** (P3-S3)
- **Live tutor session real-time signalling** (P3-S2 — see [ADR-0009](../../docs/adr/0009-tutor-session-realtime-signalling.md))

## State

**Sprint 15 (P3-S0)**: skeleton — `/health` + `/ready` only. Empty `marketplace_schema` exists in Postgres but no tables. No NATS subscriptions or publishers yet.

**Sprint 16+ (P3-S1)**: tutor profile domain lands.

## Storage

Postgres DB `marketplace`, schema `marketplace_schema`. Single alembic tree (no per-module split — marketplace is one bounded domain unlike identity/learning/engagement which absorbed multiple old services).

## Service ceiling

Per ADR-0005, marketplace is the **last** new service. Any new Phase 3 domain that does not fit one of the 6 services (alp-identity, alp-payment, alp-learning, alp-quiz, alp-engagement, alp-marketplace) requires a new ADR justifying the boundary.
