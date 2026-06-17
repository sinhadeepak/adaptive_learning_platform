# Sprint 17 — P3-S2 Live tutor marketplace, demand side

**Sprint window:** 2026-04-28 (single working session, follows S16 supply-side)
**Theme:** Stand up the booking FSM + booking endpoints + minimal student browsing UI so a student can find an active tutor, pick a slot, "pay" (Stripe Connect stub), and join an A/V room (Daily.co stub). Real Stripe / Daily wiring waits for credentials.

## Why this sprint

Sprint 16 (P3-S1) shipped the supply side: tutors apply → KYC → admin approve → activate → appear in public listing. Without a demand side, the listing does nothing. P3-S2's headline (per Phase 3 plan) is "discovery + booking + ratings + Stripe Connect payouts; soft launch".

Five things have to land for the closed beta to be testable:

1. **`bookings` + `tutor_sessions` schema + FSM** — what state is a booking in, who owns the transitions, what's the source of truth for "did the session happen".
2. **Booking endpoints** — student creates a booking, tutor starts/completes/no-shows it, either side cancels (with cancellation rules).
3. **Stripe Connect Express stub** — booking creation needs to "charge" the student and earmark the tutor payout. Without real Stripe creds we stub the payment intent + the Connect transfer; the FSM still moves through states correctly.
4. **Daily.co A/V stub** — a session in `IN_PROGRESS` returns a Daily room URL. Stub returns `https://example.daily.co/room-{session_id}` for now.
5. **Web-student browsing + booking** — minimum viable UI so the flow is testable end-to-end.

Plus operational debt the supply-side surfaced:

6. **Reject-reason audit** — Sprint 16 accepted a reason in the admin reject route but never persisted it. New `tutor_admin_actions` table.
7. **Web-admin moderation queue** — tutors landing in `KYC_VERIFIED` need a UI for the platform admin to approve.

## Backlog

### S17-A — Schema migration 003

New tables in `marketplace_schema`:

- **`bookings`** — one row per booking attempt.
  - `id UUID PK`
  - `student_user_id UUID NOT NULL` (informal FK to `identity.auth_schema.users`)
  - `tutor_user_id UUID NOT NULL REFERENCES tutor_profiles(user_id)`
  - `slot_start TIMESTAMPTZ NOT NULL`
  - `slot_end TIMESTAMPTZ NOT NULL CHECK (slot_end > slot_start)`
  - `price_paise BIGINT NOT NULL` (snapshotted from `tutor_profiles.hourly_rate_paise * duration_hours` at booking time)
  - `commission_paise BIGINT NOT NULL` (15% per ADR-0007; admin override applied if `tutor_profiles.commission_rate_override` set)
  - `status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'` — FSM: `PENDING_PAYMENT | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED_BY_STUDENT | CANCELLED_BY_TUTOR | NO_SHOW_STUDENT | NO_SHOW_TUTOR`
  - `stripe_payment_intent_id TEXT NULL`
  - `daily_room_url TEXT NULL`
  - `created_at`, `updated_at`, `confirmed_at`, `started_at`, `completed_at`, `cancelled_at`
  - Indexes: `(tutor_user_id, slot_start)` for slot-conflict checks; `(student_user_id, created_at DESC)` for "my bookings".
  - CHECK: a tutor can't have two CONFIRMED/IN_PROGRESS bookings overlapping (enforced via partial unique index, see below).

- **`tutor_sessions`** — operational telemetry separate from booking state. Sprint-scope minimum: just the Daily.co room URL + recording metadata stub.
  - `id UUID PK` = `bookings.id` (1:1 link).
  - `daily_room_id TEXT NOT NULL`
  - `daily_room_url TEXT NOT NULL`
  - `joined_by_student_at TIMESTAMPTZ NULL`
  - `joined_by_tutor_at TIMESTAMPTZ NULL`
  - `created_at`

- **`tutor_admin_actions`** — append-only audit of admin decisions on tutor profiles.
  - `id UUID PK`
  - `admin_user_id UUID NOT NULL`
  - `tutor_user_id UUID NOT NULL REFERENCES tutor_profiles(user_id)`
  - `action TEXT NOT NULL CHECK (action IN ('APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE'))`
  - `reason TEXT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

- **Slot-conflict prevention**: a partial unique index `idx_tutor_active_slots` on `(tutor_user_id, slot_start, slot_end) WHERE status IN ('CONFIRMED', 'IN_PROGRESS')`. Adequate for v1 — ranges don't *strictly* prevent overlapping slots, only exact duplicates. Real range exclusion uses `EXCLUDE USING gist` with `tstzrange`; that's a P3-S6 follow-up because it needs the `btree_gist` extension. App-layer check fills the gap for now.

### S17-B — booking_state FSM

Pure-function FSM matching the patterns established in `tutor_state.py`:

- States: `PENDING_PAYMENT | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED_BY_{STUDENT,TUTOR} | NO_SHOW_{STUDENT,TUTOR}`.
- Transitions:
  - PENDING_PAYMENT + payment_succeeded → CONFIRMED
  - PENDING_PAYMENT + payment_failed → CANCELLED_BY_STUDENT
  - PENDING_PAYMENT + cancel_by_student → CANCELLED_BY_STUDENT
  - CONFIRMED + start → IN_PROGRESS
  - CONFIRMED + cancel_by_student → CANCELLED_BY_STUDENT (rules: must be > 24h pre-slot)
  - CONFIRMED + cancel_by_tutor → CANCELLED_BY_TUTOR
  - IN_PROGRESS + complete → COMPLETED
  - IN_PROGRESS + no_show_student → NO_SHOW_STUDENT
  - IN_PROGRESS + no_show_tutor → NO_SHOW_TUTOR

The 24-hour cancellation window is a business rule, not an FSM rule. Enforced in the route, not in the state machine.

### S17-C — Stripe Connect + Daily.co stubs

- `marketplace/stripe_connect.py` — symmetric with `stripe_identity.py`:
  - `create_payment_intent(booking_id, amount_paise, tutor_connect_account) -> intent_id`
  - `confirm_payment_intent(intent_id) -> "succeeded" | "failed"`
  - In stub mode: returns `pi_test_<random>` and always confirms `succeeded`. `force=` escape hatch for failure path.
  - Live mode (`MARKETPLACE_STRIPE_CONNECT_LIVE=1`) is `NotImplementedError` until real creds.

- `marketplace/daily_room.py`:
  - `create_room(session_id) -> (room_id, room_url)`
  - Stub: returns `("rm_test_{session_id[:8]}", "https://example.daily.co/rm_test_{session_id[:8]}")`
  - Live mode (`MARKETPLACE_DAILY_LIVE=1`) is `NotImplementedError` until real creds.

### S17-D — Booking routes

All under `/marketplace/`:

- `POST /marketplace/bookings` — JWT-required (any logged-in user, role doesn't matter — we enforce non-tutor client in code). Body: `{tutorUserId, slotStart, slotEnd}`. Returns the booking with `stripePaymentIntentId` for the client to confirm.
- `POST /marketplace/bookings/{id}/confirm-payment` — student client calls this after Stripe SDK confirms the intent. Triggers `payment_succeeded` transition + creates `tutor_sessions` row + Daily room.
- `POST /marketplace/bookings/{id}/start` — tutor-only. CONFIRMED → IN_PROGRESS. Caller must own the booking (or be admin).
- `POST /marketplace/bookings/{id}/complete` — tutor-only. IN_PROGRESS → COMPLETED.
- `POST /marketplace/bookings/{id}/no-show` — tutor-only. Body: `{whom: 'student' | 'tutor'}`.
- `POST /marketplace/bookings/{id}/cancel` — student or tutor. 24h rule enforced for student-side cancellation.
- `GET /marketplace/bookings/me` — list bookings for the calling user (as student, via `student_user_id`). Optional `?role=tutor` to filter as tutor.
- `GET /marketplace/bookings/{id}` — get a specific booking. 403 unless caller is participant or admin.
- `GET /marketplace/tutors/{userId}/availability?date=YYYY-MM-DD` — compute open slots from the tutor's `tutor_availability` declarations minus the bookings on that date. Returns `[{start, end}]`.

### S17-E — Admin moderation routes

- `GET /marketplace/admin/tutors/queue` — admin-only. Returns tutors in `KYC_VERIFIED` state awaiting platform approval.
- `POST /marketplace/admin/tutors/{userId}/approve` (already exists from S16) — extended to write a row to `tutor_admin_actions`.
- `POST /marketplace/admin/tutors/{userId}/reject` (already exists) — extended to write the `reason` to `tutor_admin_actions`.
- `GET /marketplace/admin/tutors/{userId}/actions` — admin-only. Returns the audit history.

### S17-F — Web-student pages

- `apps/web-student/src/pages/Tutors.tsx` — listing of active tutors with filter by topic + price.
- `apps/web-student/src/pages/TutorDetail.tsx` — public profile + bookable slot grid for the next 14 days.
- `apps/web-student/src/pages/BookSession.tsx` — confirm booking + (stubbed) Stripe payment flow.
- `apps/web-student/src/pages/MyBookings.tsx` — student's upcoming + past sessions; "Join session" button surfaces the Daily room URL when status = IN_PROGRESS.
- New `marketplace` namespace in `apps/web-student/src/lib/api.ts` (parallel to web-portal's; types reused).

### S17-G — Web-admin moderation queue

- `apps/web-admin/src/pages/TutorModerationQueue.tsx` — list of KYC_VERIFIED tutors with Approve / Reject buttons. Reject form requires a reason.
- `apps/web-admin/src/pages/TutorAdminActions.tsx` — per-tutor audit history.
- New `marketplace` namespace in `apps/web-admin/src/lib/api.ts`.

### S17-H — Tests + smoke

- `tests/test_booking_state.py` — pure-function FSM coverage (parallel to `test_state_machine.py`).
- `tests/test_booking_flow.py` — integration test: tutor exists + active → student creates booking → confirms payment → tutor starts → tutor completes → "my bookings" returns it. Plus the cancel-by-student rule (24h cutoff) and admin moderation queue + audit history.
- `make smoke`: extend with 5 booking-domain assertions (create booking → confirm → start → complete → my-bookings includes it).

### S17-I — Closure + master index

- `docs/02_planning/43_Sprint17_Closure.md`.
- Master phase index updated.

## Out of scope

- **Real Stripe Connect onboarding + payment** — credentials needed; stubbed for P3-S2.
- **Real Daily.co room creation** — credentials needed; stubbed for P3-S2.
- **Ratings system** — Phase 3 plan put it in P3-S2 but it's the lowest-priority demand-side feature. Deferred to P3-S3 if we have time.
- **Subscription bundling / free trial** — ADR-0008 deferred this; remains deferred.
- **Premium-tier review workflow** — ditto.
- **Mobile booking flow** — Phase 3 P3-S3.
- **Range-based slot conflict prevention** (`EXCLUDE USING gist`) — needs `btree_gist`; P3-S6.
- **NATS events for booking lifecycle** — engagement consumers don't exist for these yet; defer until P3-S5 predictive analytics needs them.

## Definition of done

- Migration 003 applied; `marketplace_schema` has 7 tables.
- 9 booking routes + 2 admin queue routes mounted.
- Booking FSM tests pass; integration booking flow test passes.
- `make smoke` passes 28/28 (was 23/23).
- Web-student `/tutors` + `/tutors/:id` + `/book` + `/bookings` pages render and complete a booking end-to-end against the local stack.
- Web-admin `/tutors-admin` shows the queue; approve/reject buttons work and the audit page shows actions.
- Sprint 17 closure doc + master phase index updated.
