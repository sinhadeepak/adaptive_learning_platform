# Sprint 17 Closure — P3-S2 live tutor marketplace, demand side

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/42_Sprint17_Plan.md](42_Sprint17_Plan.md)

## Scope delivered

### S17-A — Schema migration 003 — DONE

`marketplace_schema` rev **003** adds 3 tables:

- `bookings` (16 columns) — booking FSM with price_paise + commission_paise snapshot at creation, Stripe payment intent ID, Daily room URL, plus all the timestamp fields per state. CHECK constraints enforce slot ordering, non-negative pricing, valid status enum. Partial unique index on `(tutor_user_id, slot_start) WHERE status IN ('CONFIRMED', 'IN_PROGRESS')` blocks exact-duplicate active slots.
- `tutor_sessions` — 1:1 with bookings; carries Daily room metadata + per-side join timestamps.
- `tutor_admin_actions` — append-only audit of admin approve/reject decisions, indexed `(tutor_user_id, created_at DESC)`.

### S17-B — booking_state FSM — DONE

`marketplace.booking_state` mirrors `tutor_state.py`:
- 8 states (PENDING_PAYMENT through 4 cancelled / no-show terminals).
- 9 transitions in the rule table.
- Helpers: `is_terminal`, `is_active` (CONFIRMED + IN_PROGRESS — used for slot conflict checks), `can_join_room`.

13 unit tests cover the rule table + edge cases.

### S17-C — Stripe Connect + Daily.co stubs — DONE

- `stripe_connect.py`:
  - `create_payment_intent()` returns `pi_test_<booking_prefix>_<random>`.
  - `confirm_payment_intent()` defaults to `succeeded`; `force=` for failure path testing.
  - `commission_split()` is a pure function — 15% default per ADR-0007, override via `tutor_profiles.commission_rate_override`. Half-paisa rounding so the tutor never gets short-changed. 5 unit tests.
  - Live mode behind `MARKETPLACE_STRIPE_CONNECT_LIVE=1`; raises `NotImplementedError` until creds arrive.

- `daily_room.py`:
  - `create_room()` returns deterministic `(rm_test_<short>, https://example.daily.co/...)`.
  - Live mode behind `MARKETPLACE_DAILY_LIVE=1`; raises `NotImplementedError`.

### S17-D — Booking routes — DONE

11 new endpoints (mounted via `booking_routes.booking_router`):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/marketplace/bookings` | user | Create booking; price snapshot + payment intent |
| POST | `/marketplace/bookings/{id}/confirm-payment` | student | PENDING_PAYMENT → CONFIRMED + provision Daily room |
| POST | `/marketplace/bookings/{id}/start` | tutor/admin | CONFIRMED → IN_PROGRESS |
| POST | `/marketplace/bookings/{id}/complete` | tutor/admin | IN_PROGRESS → COMPLETED |
| POST | `/marketplace/bookings/{id}/no-show` | tutor/admin | IN_PROGRESS → NO_SHOW_{STUDENT|TUTOR} |
| POST | `/marketplace/bookings/{id}/cancel` | participant/admin | Cancel; 24h cutoff for student-side cancellation |
| GET | `/marketplace/bookings/me` | user | List as student (default) or tutor (`?role=tutor`) |
| GET | `/marketplace/bookings/{id}` | participant/admin | Single booking |
| GET | `/marketplace/tutors/{userId}/availability?date=` | public | Open slots = declared availability − active bookings |

### S17-E — Admin moderation routes — DONE

- `GET /marketplace/admin/tutors/queue` — returns tutors in `KYC_VERIFIED` (or any status via `?status=`). Admin-only.
- `GET /marketplace/admin/tutors/{userId}/actions` — audit history for one tutor.
- Existing `approve` and `reject` routes (Sprint 16) extended to write `tutor_admin_actions` rows. Reject now persists the `reason`.

### S17-F — Web-student pages — DONE

- `apps/web-student/src/pages/Tutors.tsx` — listing with max-rate filter (slider).
- `apps/web-student/src/pages/TutorDetail.tsx` — public profile + slot picker; booking flow chains through `createBooking` + `confirmPayment` (stub auto-confirms) and redirects to `/bookings`.
- `apps/web-student/src/pages/MyBookings.tsx` — student's bookings with status badges, "Join session" link when status = IN_PROGRESS, cancel button (24h rule enforced server-side).
- `apps/web-student/src/lib/api.ts` — new `marketplace` namespace with 6 methods + 5 type exports.
- Routes wired: `/tutors`, `/tutors/:userId`, `/bookings` (all `ProtectedRoute`).

### S17-G — Web-admin moderation queue — DONE

- `apps/web-admin/src/pages/TutorModerationQueue.tsx` — table of KYC_VERIFIED tutors with Approve / Reject buttons. Reject opens a `prompt()` for the reason (UX is functional, not pretty — polish in P3-S3).
- `apps/web-admin/src/pages/TutorAdminActions.tsx` — per-tutor audit log.
- `apps/web-admin/src/lib/api.ts` — new `marketplaceAdmin` namespace.
- Routes: `/tutors-admin`, `/tutors-admin/:userId` (admin-gated).

### S17-H — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `test_state_machine.py` | 10 | unit (S16 carryover) | 10/10 ✅ |
| `test_pricing_band.py` | 6 | unit (S16 carryover) | 6/6 ✅ |
| `test_health.py` | 2 | unit (S16 carryover) | 2/2 ✅ |
| `test_apply_flow.py` | 5 | integration (S16 carryover) | 5/5 ✅ |
| **`test_booking_state.py`** | **13** | **unit (NEW)** | **13/13 ✅** |
| **`test_commission.py`** | **5** | **unit (NEW)** | **5/5 ✅** |
| **`test_booking_flow.py`** | **7** | **integration (NEW)** | **7/7 ✅** |
| **Total** | **48** | | **48 / 48** |

The integration suite covers: full booking flow happy path, self-booking rejection, payment failure path, 24h cancel rule for student, admin queue filters by status, audit history records both APPROVE and REJECT, and the availability endpoint subtracts active bookings.

### S17-I — Smoke extended to 28 steps — DONE

5 new assertions for the booking flow: create booking → confirm payment → start session → complete session → my-bookings includes COMPLETED row. Smoke patches teacher availability to all-day all-week before the booking step so the smoke slot fits in a window without time-of-day flakes.

`make smoke` ran **28/28 green** on the rebuilt stack.

## Test totals at Sprint 17 close

| Surface | Result | Status |
|---|---|---|
| alp-marketplace `pytest tests/` (unit) | 36 / 36 | ✅ |
| alp-marketplace `pytest tests/ -m integration` | 12 / 12 | ✅ |
| `make smoke` | 28 / 28 | ✅ |
| Other surfaces | unchanged from S16 close | ✅ |

## Stack inventory at Sprint 17 close

Same 6 services as S16 — alp-marketplace just got fatter:

- 23 routes (was 12)
- `marketplace_schema` has 7 tables (was 4)
- Web-student gains 3 pages + marketplace API namespace
- Web-admin gains 2 pages + marketplaceAdmin API namespace

## What surprised us this sprint

- **`tstzrange` + `EXCLUDE USING gist`** would be the right way to prevent overlapping bookings, but it requires the `btree_gist` extension. The partial unique index on `(tutor_user_id, slot_start) WHERE status IN ('CONFIRMED', 'IN_PROGRESS')` is best-effort — a tutor could in theory get two bookings at 10:00 and 10:30 on the same day if neither has the same start minute. App-layer check is the gap-filler; range-exclude is a P3-S6 follow-up.
- **TestClient + integration test conftest** that worked for Sprint 16 still works, but I had to **add booking + session + audit tables to the truncate list** in the conftest. Each new table is a separate FK chain to track. Worth a Make target to dump-and-restore a "clean marketplace" snapshot for faster integration test cycles in the future.
- **The 24h cancel rule could be FSM-level**, but keeping it as a route-level business rule turns out cleaner — the FSM stays pure-function (no time math), and the 24h threshold is itself a flag-driven business decision (would change for premium customers). Documented inline.

## Carry-overs to Sprint 18 (P3-S3 starts)

| Item | Why deferred | Owner |
|---|---|---|
| Real Stripe Connect Express onboarding | Needs real Stripe creds + Connect account approval | P3-S2-late or P3-S3 |
| Real Daily.co room provisioning | Needs Daily.co account + API keys | P3-S3 |
| Ratings system | Lowest demand-side priority; ADR-0008 doesn't gate | P3-S3 |
| Premium-tier review workflow | Above-ceiling pricing needs admin review queue | P3-S3 |
| Subscription bundling / free trial sessions | ADR-0008 deferred | P3-S3 |
| Mobile booking flow | Phase 3 plan defers | P3-S3 |
| pgvector for tutor recommendation similarity | ADR-0011 reserved hooks; needs the extension | P3-S6 |
| Range-based slot conflict (`EXCLUDE USING gist`) | Needs `btree_gist`; partial-index is good enough for P3 launch traffic | P3-S6 |
| NATS events for booking lifecycle (`booking.created`, `booking.completed`) | No consumer needs them yet; engagement.analytics.predictive in P3-S5 will | P3-S5 |
| Web-admin search/filter UI for tutor moderation | Queue is functional but unsorted/unfiltered | P3-S3 polish |

## P3-S2 status

**P3-S2 closed** at Sprint 17. The demand side is operational end-to-end in local dev: a student can browse tutors, pick a slot, "pay" (stub), have the tutor start + complete the session, and see it in their bookings list. Sprint 18 (P3-S3) opens creator content marketplace + ratings + tutor session polish.
