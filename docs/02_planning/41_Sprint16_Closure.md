# Sprint 16 Closure — P3-S1 live tutor marketplace, supply side

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/40_Sprint16_Plan.md](40_Sprint16_Plan.md)

## Scope delivered

### S16-A — Tutor profile schema migration — DONE

`marketplace_schema` gained 4 new tables in revision **002**:

- `tutor_profiles` — one row per tutor user; carries the application FSM state (`APPLIED | KYC_PENDING | KYC_VERIFIED | APPROVED | ACTIVE | REJECTED | SUSPENDED`), tier (`STANDARD | PREMIUM_VERIFIED | RETIRED`), `hourly_rate_paise` with a CHECK constraint enforcing the ADR-0008 band (10000–500000 paise = ₹100–₹5000) for STANDARD tier, plus columns reserved for `stripe_identity_session_id` + `stripe_connect_account_id` (P3-S2).
- `tutor_qualifications` — `(id, tutor_user_id, kind, title, institution, year_completed)`. `kind ∈ {DEGREE | CERTIFICATE | EXAM_RANK | TEACHING_EXPERIENCE}`.
- `tutor_availability` — recurring weekly windows: `(day_of_week 0–6, start_minute 0–1439, end_minute > start)`.
- `tutor_topics` — `(tutor_user_id, topic_id)` PK; informal cross-DB FK to `learning.catalog_schema.topics`.

Listing index `idx_tutor_active_rate` is partial — only `WHERE application_status='ACTIVE'` — so the public listing scan is cheap.

### S16-B — Domain modules — DONE

New files in `services/marketplace/src/marketplace/`:

- `db.py` — lazy async sessionmaker, `dispose()` on shutdown.
- `security.py` — `require_user` JWT-decode dep + `require_admin` (accepts either `admin_access_level=='PLATFORM'` or `role=='PLATFORM_ADMIN'` — identity's current token shape doesn't always emit the former).
- `tutor_state.py` — pure-function FSM: `transition(state, action) -> new_state | raises IllegalTransition`. Includes `is_listable` + `can_book` helpers.
- `stripe_identity.py` — Sprint-16 stub. `start_verification` returns a `vs_test_*` id; `poll_verification` returns `verified` by default, with a `force=` escape hatch for testing the rejection branch. Live mode is gated behind `MARKETPLACE_STRIPE_IDENTITY_LIVE=1` and explicitly `NotImplementedError` until P3-S2 lands real credentials.
- `schemas.py` — Pydantic DTOs (`TutorApplyIn`, `TutorPatchIn`, `TutorProfileOut`, `KycStartOut`, `KycPollOut`, `TutorListingOut`, etc.). `hourlyRatePaise` field bounds enforce the band at validation time before the DB CHECK fires.
- `repositories.py` — SQLAlchemy `text()` queries (matches the rest-of-stack pattern of no ORM models). `list_active_tutors` supports filter by topic + price range + pagination.

### S16-C — Routes + FSM wiring — DONE

12 routes mounted (was 2 health probes):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/marketplace/tutors/apply` | user | Create profile (status=APPLIED) |
| GET | `/marketplace/tutors/me` | user | My tutor profile |
| PATCH | `/marketplace/tutors/me` | user | Edit headline/bio/rate/availability/topics |
| POST | `/marketplace/tutors/me/kyc/start` | user | Transition APPLIED → KYC_PENDING; create Stripe Identity session |
| POST | `/marketplace/tutors/me/kyc/poll` | user | Read verification result; transition to KYC_VERIFIED or REJECTED. `?force=` for stub-only testing. |
| POST | `/marketplace/tutors/me/activate` | user | Transition APPROVED → ACTIVE |
| POST | `/marketplace/admin/tutors/{user_id}/approve` | admin | Transition KYC_VERIFIED → APPROVED |
| POST | `/marketplace/admin/tutors/{user_id}/reject` | admin | Transition any → REJECTED |
| GET | `/marketplace/tutors` | public | Listing (filter: topicId, minHourlyPaise, maxHourlyPaise, page, perPage) |
| GET | `/marketplace/tutors/{user_id}` | public | Public profile (404 unless ACTIVE) |
| GET/GET | `/health`, `/ready` | public | Health probes |

### S16-D — Pricing band enforcement — DONE

Three layers:

1. **Pydantic** — `Field(ge=10000, le=500000)` on `hourlyRatePaise`. Rejects with HTTP 422 before reaching the DB.
2. **DB CHECK** — partial check (`WHEN tier='STANDARD'`) on `tutor_profiles.hourly_rate_paise`. Defence-in-depth; admin-promoted PREMIUM_VERIFIED tutors bypass.
3. **App layer** — `repo.patch_profile` raises 422 on `IntegrityError`.

The values are hardcoded for P3-S1; flag-driven per-market bands are deferred to P3-S6 per the [ADR-0008 review trigger](../adr/0008-marketplace-pricing-model.md#review).

### S16-E — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `test_state_machine.py` | 10 | unit (pure-function FSM) | 10/10 ✅ |
| `test_pricing_band.py` | 6 | unit (Pydantic) | 6/6 ✅ |
| `test_health.py` | 2 | unit (TestClient + /health) | 2/2 ✅ |
| `test_apply_flow.py` | 5 | integration (TestClient + Postgres) | 5/5 ✅ |

Default `pytest tests/` runs the 18 unit tests; `pytest -m integration` opts into the 5 DB-backed tests. Total 23 marketplace tests, all green.

The integration-test conftest uses a synchronous `docker exec psql` truncate rather than an async sessionmaker — TestClient spins up its own event loop per request, and a module-cached async engine bound to a different loop causes "Future attached to a different loop" errors. Documented in the conftest header.

### S16-F — Web-portal application page — DONE

Two new pages in `apps/web-portal/src/pages/`:

- `TutorApply.tsx` — full form: display name, headline, bio, rate (₹ → paise), repeatable qualifications, repeatable availability rows with day + time pickers, topic checkboxes loaded via cascading dropdown (exam → subject → topics from `/api/v1/catalog/*`).
- `TutorDashboard.tsx` — landing after apply. Shows current FSM state with copy explaining the next step. Drives the KYC stub via "Start verification" → "Simulate verification complete (stub)" → admin approval (out-of-band) → "Activate".

Routes wired:
- `/tutor/apply` (protected)
- `/tutor` (protected; redirects to `/tutor/apply` if no profile)

`apps/web-portal/src/lib/api.ts` gained a `marketplace` namespace with `applyAsTutor`, `getMyTutorProfile`, `startKyc`, `pollKyc`, `activate`. Plus exported `TutorProfile`, `TutorQualification`, `TutorAvailability`, `KycStartOut`, `KycPollOut` types.

### S16-G — Smoke extended to 23 steps — DONE

Six new assertions cover the full tutor application FSM: teacher login → apply → KYC start + poll → admin approve → tutor activate → public listing.

The smoke is also more deterministic now: it truncates marketplace tables at the start of the marketplace section so re-runs don't conflict with prior state.

`make smoke` ran **23/23 green** on the rebuilt stack.

### S16-H — Closure + master index — DONE

This file (`41_Sprint16_Closure.md`). Master phase index updated to add the Sprint 16 row and update the "pending today" tally.

## Test totals at Sprint 16 close

| Surface | Result | Status |
|---|---|---|
| alp-marketplace `pytest tests/` (unit) | 18 / 18 | ✅ |
| alp-marketplace `pytest tests/ -m integration` | 5 / 5 | ✅ |
| `make smoke` | 23 / 23 | ✅ |
| Other surfaces | unchanged from Sprint 15 close | ✅ |

## What surprised us this sprint

- **Identity's JWT doesn't carry `admin_access_level`** — the claim is in CLAUDE.md as part of the canonical shape, but the seeded `admin@alp.dev` token only carries `role: PLATFORM_ADMIN`. Fix was a one-line OR in `marketplace.security.require_admin` to accept either signal. **Action item**: harmonise this when alp-identity gets its first refactor pass — token shape should match the documented canonical claims.
- **TestClient + async SQLAlchemy + module-cached engine** doesn't work cleanly: each TestClient invocation spins up a fresh event loop, but the engine pool is loop-bound at first creation. Got around it by truncating via a sync subprocess in conftest (avoids cross-loop access entirely). Documented for the next service that needs integration tests.
- **Pydantic `Field(ge=10000)` is friendlier than DB CHECK** — bad rates get a clean 422 with a structured error payload instead of a Postgres CHECK constraint violation surfacing as a 500. The DB layer remains as defence-in-depth.

## Carry-overs to next sprint (P3-S2 = Sprint 17)

| Item | Why | Owner |
|---|---|---|
| Real Stripe Identity integration | Needs Stripe API keys + webhook target + tested redirect URLs | P3-S2 |
| Stripe Connect Express onboarding | Same blocker; ADR-0007 details accepted | P3-S2 |
| Booking flow (`bookings` table, `tutor_session` FSM) | The supply side is done; demand side is next | P3-S2 |
| Daily.co integration for A/V media | Per ADR-0009 | P3-S2 |
| Tutor admin search/suspend UI in web-admin | Approve flow exists at API level but no admin queue UI | P3-S2 |
| Reject reason audit table | `admin_reject` accepts a reason but only logs to the application_status transition; persist in a `tutor_admin_actions` table | P3-S2 |
| Mobile tutor application flow | Phase 3 plan defers to P3-S3 if capacity allows | P3-S3 |
| Subscription bundling / free trial sessions (per ADR-0008) | Out of P3-S1 scope | P3-S2 |
| Per-market pricing bands via flags | ADR-0008 review trigger | P3-S6 |
| Premium-tier review workflow | Above-ceiling pricing needs admin review queue | P3-S2 |

## P3-S1 status

**P3-S1 closed** at Sprint 16. The supply side is operational end-to-end in local dev: a tutor can apply via the web-portal `/tutor/apply` page, complete the KYC stub, get admin approval, and activate themselves into the public listing. Sprint 17 (P3-S2) opens the demand side — student-facing tutor browsing + booking flow + Stripe Connect + Daily.co.
