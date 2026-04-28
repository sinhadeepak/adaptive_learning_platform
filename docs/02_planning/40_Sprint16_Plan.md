# Sprint 16 — P3-S1 Live tutor marketplace, supply side

**Sprint window:** 2026-04-28 (single working session, opens P3-S1)
**Theme:** Land the tutor application flow end-to-end so a tutor can apply, fill profile + qualifications + availability + pricing, and reach the `APPROVED` state ready for student bookings (which arrive in P3-S2). Backend is the focus; web-portal gets one application page so the flow is demonstrable.

## Why this sprint

P3-S0 closed at Sprint 15 with the alp-marketplace skeleton + 6 gating ADRs. P3-S1's headline outcome (per the Phase 3 plan) is "30 tutors complete onboarding end-to-end including KYC; closed beta reachable to a small pre-confirmed student cohort". That depends on:

1. **Tutor profile domain** — there is no `tutor_profiles` table today.
2. **Application FSM** — APPLIED → KYC_PENDING → KYC_VERIFIED → APPROVED → ACTIVE | REJECTED. Without this, "approved" is just a flag that anyone can set.
3. **Pricing-band enforcement** (per [ADR-0008](../adr/0008-marketplace-pricing-model.md)) — without server-side enforcement of ₹100–5000/hr bands, race-to-the-bottom or premium-tier abuse is uncontrolled.
4. **KYC integration** — [ADR-0006](../adr/0006-kyc-vendor.md) chose Stripe Identity. Real integration needs Stripe credentials + webhooks; this sprint stubs the verification step locally so the flow is testable end-to-end.
5. **Tutor listing for students** — basic listing endpoint with filter-by-topic + filter-by-price-band so P3-S2 booking can hang off it.

## Backlog

### S16-A — Tutor profile schema migration

New tables in `marketplace_schema`:

- `tutor_profiles` — one row per tutor user.
  - `user_id UUID PK` (matches `auth_schema.users.id`).
  - `display_name TEXT NOT NULL`.
  - `headline TEXT NOT NULL` (one-liner shown in listing).
  - `bio TEXT NOT NULL` (longer-form, shown on profile page).
  - `hourly_rate_paise BIGINT NOT NULL CHECK (>= 10000 AND <= 500000)` — the band enforcement at DB level (₹100–₹5,000 in paise = 10000–500000). Override for premium tier handled via flag-driven update.
  - `commission_rate_override REAL NULL` — per-tutor commission override (admin-set; per [ADR-0007](../adr/0007-stripe-connect-rollout.md)).
  - `tier TEXT NOT NULL DEFAULT 'STANDARD'` — `STANDARD | PREMIUM_VERIFIED | RETIRED`.
  - `application_status TEXT NOT NULL DEFAULT 'APPLIED'` — the FSM state: `APPLIED | KYC_PENDING | KYC_VERIFIED | APPROVED | ACTIVE | REJECTED | SUSPENDED`.
  - `kyc_status TEXT NULL` — Stripe Identity status mirror.
  - `stripe_identity_session_id TEXT NULL` — one-shot ID for resuming verification.
  - `stripe_connect_account_id TEXT NULL` — set by P3-S2 Stripe Connect integration.
  - `applied_at`, `approved_at`, `created_at`, `updated_at`.

- `tutor_qualifications` — bullet-list of credentials.
  - `id UUID PK`, `tutor_user_id UUID FK CASCADE`, `kind TEXT NOT NULL` (`DEGREE | CERTIFICATE | EXAM_RANK | TEACHING_EXPERIENCE`), `title TEXT`, `institution TEXT NULL`, `year_completed INTEGER NULL`, `created_at`.

- `tutor_availability` — declared windows when bookable.
  - `id UUID PK`, `tutor_user_id UUID FK CASCADE`, `day_of_week INTEGER` (0–6, Mon=0), `start_minute INTEGER` (0–1439), `end_minute INTEGER` (0–1439, > start), `created_at`.
  - Recurring weekly windows for P3-S1; one-off blackout dates land in P3-S2 along with bookings.

- `tutor_topics` — what the tutor teaches.
  - `tutor_user_id UUID, topic_id UUID, PRIMARY KEY (tutor_user_id, topic_id)`. Topics live in `learning.catalog_schema.topics` (cross-DB FK is informal; we don't enforce). The tutor declares "I teach Mechanics + Thermodynamics".

Migration: `alembic/versions/002_create_tutor_profiles.py`.

### S16-B — Domain modules

Mirror the engagement/learning patterns:

- `marketplace/db.py` — async sessionmaker, dispose-on-shutdown.
- `marketplace/schemas.py` — Pydantic DTOs (`TutorApplyIn`, `TutorProfileOut`, `QualificationIn`, `AvailabilityIn`, `TutorListingFilter`, etc.).
- `marketplace/repositories.py` — SQLAlchemy text() queries (no ORM models; matches the rest of the stack).
- `marketplace/security.py` — JWT decode + dependency `Depends(require_user)` returning a `Principal`.
- `marketplace/stripe_identity.py` — local stub. Function `start_verification(user_id) -> session_id` returns a fake `vs_test_*` id. Function `poll_verification(session_id) -> status` returns `verified` in local mode. Real integration in staging+ wired behind `MARKETPLACE_STRIPE_IDENTITY_LIVE=1`.
- `marketplace/tutor_state.py` — FSM transitions. `transition(current, action) -> new_state | raises`. Transitions:
  - APPLIED + start_kyc → KYC_PENDING
  - KYC_PENDING + kyc_verified → KYC_VERIFIED
  - KYC_PENDING + kyc_rejected → REJECTED
  - KYC_VERIFIED + admin_approve → APPROVED
  - KYC_VERIFIED + admin_reject → REJECTED
  - APPROVED + activate → ACTIVE (tutor's own action — declares ready to take bookings)
  - ACTIVE + suspend → SUSPENDED
  - SUSPENDED + reactivate → ACTIVE

### S16-C — Routes

All under `/marketplace/`:

- `POST /marketplace/tutors/apply` — JWT-required. Creates a `tutor_profiles` row with `application_status=APPLIED`. Body is `TutorApplyIn` (display_name, headline, bio, hourly_rate_paise, qualifications: list, availability: list, topic_ids: list). Returns the created profile.
- `GET /marketplace/tutors/me` — JWT-required. Returns the calling user's tutor profile (or 404 if none).
- `PATCH /marketplace/tutors/me` — JWT-required. Edit headline, bio, hourly_rate_paise (with band check), availability, topics.
- `POST /marketplace/tutors/me/kyc/start` — kicks off Stripe Identity. Sets `application_status=KYC_PENDING`, `stripe_identity_session_id=<session id>`. Returns the session id (in real integration, also returns the redirect URL).
- `POST /marketplace/tutors/me/kyc/poll` — polls `stripe_identity_session_id`. On `verified`, transitions to `KYC_VERIFIED`. On `rejected`, transitions to `REJECTED`.
- `POST /marketplace/tutors/me/activate` — only valid from `APPROVED`. Tutor self-flips to `ACTIVE`.
- `POST /marketplace/admin/tutors/{user_id}/approve` — admin-only (PLATFORM_ADMIN role). Transition `KYC_VERIFIED` → `APPROVED`.
- `POST /marketplace/admin/tutors/{user_id}/reject` — admin-only. Transition any state → `REJECTED`. Body: `{reason: str}`.
- `GET /marketplace/tutors` — public (or JWT-required, gated by flag). Returns `ACTIVE` tutors only. Filters: `?topic_id=`, `?max_hourly_paise=`, `?min_hourly_paise=`. Pagination: `?page=`, `?per_page=` (max 50).
- `GET /marketplace/tutors/{user_id}` — public. Returns profile if `ACTIVE`, 404 otherwise.

### S16-D — Pricing band enforcement

Per [ADR-0008](../adr/0008-marketplace-pricing-model.md):
- Floor: ₹100/hr = 10000 paise.
- Ceiling: ₹5,000/hr = 500000 paise.
- Premium tier (above ceiling): only allowed when `tier='PREMIUM_VERIFIED'`.

Enforcement layers:
1. **DB CHECK constraint** on `hourly_rate_paise` (10000–500000 for STANDARD tier; check skipped if `tier != 'STANDARD'` via partial check or app-level enforcement).
2. **App-level**: `repositories.set_hourly_rate(user_id, rate, allow_premium)` returns 422 if rate violates band.
3. **Flag-driven bands** (deferred): the floor/ceiling are hardcoded in this sprint. Flag-driven per-market bands are a P3-S6 follow-up.

### S16-E — Tests

- `tests/test_apply_flow.py` — happy path: apply → kyc start → kyc verify (via stub) → admin approve → tutor activate → listing shows them.
- `tests/test_pricing_band.py` — under floor rejected; over ceiling rejected (unless tier=PREMIUM); inside band accepted.
- `tests/test_state_machine.py` — pure-function FSM tests (no DB).
- `tests/test_listing.py` — filter by topic, by price; only ACTIVE tutors returned.
- `tests/test_security.py` — admin endpoints reject non-admin tokens.

Marker for tests that need live Postgres (most of them) follow the engagement pattern: integration tests use `pytestmark = pytest.mark.integration`. Pure-function FSM tests stay default.

### S16-F — Web-portal application page

Minimum viable UI:

- New `/tutor/apply` route in `apps/web-portal/src/pages/TutorApply.tsx`.
- Fields: display name, headline, bio (textarea), hourly rate (in rupees, converted to paise on submit), qualifications (repeatable rows), availability (repeatable rows: day + start + end), topic checkboxes (loaded from `/api/v1/catalog/exams` → drill to subjects → topics).
- Submit calls `marketplace.applyAsTutor(...)` (new namespace in `apps/web-portal/src/lib/api.ts`).
- After submit: navigate to `/tutor/dashboard` placeholder showing "Application submitted; KYC next" + a "Start KYC" button calling `/kyc/start`.
- KYC stub flow: clicking "Start KYC" returns the fake session id; for local dev a "Simulate verification complete" button calls `/kyc/poll` to flip to `KYC_VERIFIED`.

This is deliberately ugly. Polish is P3-S2. Goal: show the flow works.

### S16-G — Smoke test extension

Add tutor-domain assertions to `scripts/smoke_test.sh`:

- Apply as `teacher@alp.dev` (the existing TEACHER seed user).
- Verify `tutor_profiles` row created.
- Trigger KYC start → KYC poll (stub returns verified).
- Admin (PLATFORM_ADMIN) approves.
- Tutor activates.
- Listing endpoint returns the tutor.

That's 6 new steps, taking smoke from 17 → 23.

## Out of scope

- **Stripe Connect actual onboarding** — no credentials in local; P3-S2 owns the live integration.
- **Booking flow + Daily.co integration** — P3-S2.
- **Tutor session FSM + auxiliary streams (chat, whiteboard)** — P3-S2.
- **Per-market band tuning via flags** — P3-S6.
- **Mobile tutor application flow** — Phase 3 plan defers to P3-S3 if capacity allows.
- **Subscription bundling / free trial sessions** (per ADR-0008) — P3-S2.
- **Tutor admin search/suspend UI in web-admin** — P3-S2.

## Definition of done

- `marketplace_schema` has 4 new tables; alembic at revision 002.
- `pytest tests/` in `services/marketplace/` passes (X unit + Y integration tests, integration opt-in).
- `make smoke` passes 23/23.
- `apps/web-portal/` builds and the `/tutor/apply` page submits + transitions through KYC stub + activates.
- All endpoints behave per the FSM table in S16-B.
- Sprint 16 closure doc + master phase index updated.
