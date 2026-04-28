# Sprint 18 — P3-S3 creator content marketplace + ratings

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Open the second sales channel: creators publish individual courses (asynchronous learning content), students purchase, ratings close the trust loop on both tutors and courses. Real Stripe Connect / Daily.co wiring still gated on credentials.

## Why this sprint

P3-S2 closed at Sprint 17 with the live tutor marketplace (synchronous sales channel). The Phase 3 plan calls for the **creator content marketplace** in P3-S3 — asynchronous: creators publish self-paced courses, students buy individual courses, platform takes commission per ADR-0007.

Plus two carry-overs that fit naturally:

- **Ratings** — mentioned in the Phase 3 plan for P3-S2 but deferred. With both tutor sessions and course purchases now in the platform, the trust loop needs closing.
- **Reuse of the Stripe Connect + commission split + Stripe Identity stubs** — already in `marketplace/stripe_connect.py` and `marketplace/stripe_identity.py`. Creators reuse them.

Out of scope (deliberately): modules + lessons hierarchy inside a course. For Sprint 18, a "course" is a single atomic content artifact — title, description, content body (markdown), price. Splitting into modules + lessons + video chunks is a Sprint 19 polish item.

## Backlog

### S18-A — Schema migration 004

Five new tables in `marketplace_schema`:

- **`creator_profiles`** — mirrors `tutor_profiles` for the creator persona. Same FSM pattern (`APPLIED → KYC_PENDING → KYC_VERIFIED → APPROVED → ACTIVE | REJECTED | SUSPENDED`). `display_name`, `headline`, `bio`, `tier`, `application_status`, `kyc_status`, `stripe_identity_session_id`, `stripe_connect_account_id`, `commission_rate_override`. **No `hourly_rate_paise`** — pricing is per-course.
- **`courses`** — one row per course. `id UUID PK`, `creator_user_id UUID FK`, `title`, `description`, `content_md` (the actual course content as markdown — no module/lesson hierarchy yet), `price_paise BIGINT CHECK (>= 4900 AND <= 499900)` per ADR-0008 course bands, `tier ENUM('FREE','STANDARD','PREMIUM')`, `status ENUM('DRAFT','PENDING_REVIEW','PUBLISHED','RETIRED')`, `cover_image_url`, `exam_id UUID NULL`, `subject_id UUID NULL`, plus topic_ids JSONB array, `created_at`, `published_at`, `updated_at`.
- **`course_purchases`** — student bought a course. `id UUID PK`, `student_user_id`, `course_id FK`, `price_paise` (snapshot), `commission_paise`, `status ENUM('PENDING_PAYMENT','PAID','REFUNDED')`, `stripe_payment_intent_id`, `purchased_at`, `refunded_at`. Unique `(student_user_id, course_id) WHERE status='PAID'` blocks double-purchase.
- **`tutor_session_ratings`** — student rates a completed booking. `id UUID PK`, `booking_id FK UNIQUE` (one rating per booking), `student_user_id`, `tutor_user_id`, `stars INTEGER CHECK (1..5)`, `comment TEXT NULL`, `created_at`.
- **`course_ratings`** — student rates a course they've purchased. `id UUID PK`, `purchase_id FK UNIQUE`, `course_id`, `student_user_id`, `stars INTEGER CHECK (1..5)`, `comment TEXT NULL`, `created_at`.

Index plan:
- `(creator_user_id, status, published_at DESC)` on courses for "my courses" + listing scans.
- `(course_id, status)` on course_purchases for "who bought my course".
- `(tutor_user_id, created_at DESC)` on tutor_session_ratings for tutor profile aggregate.
- `(course_id, created_at DESC)` on course_ratings same.

### S18-B — Creator domain modules

Mirror the tutor domain layout exactly:

- `marketplace/creator_state.py` — pure-function FSM, identical actions/states to `tutor_state.py`. Pure-function tests follow the same pattern.
- Add creator endpoints to `routes.py` (parallel to tutor application routes):
  - `POST /marketplace/creators/apply` — start application
  - `GET /marketplace/creators/me`
  - `PATCH /marketplace/creators/me`
  - `POST /marketplace/creators/me/kyc/{start,poll}` (stub reuses Stripe Identity)
  - `POST /marketplace/creators/me/activate`
  - `POST /marketplace/admin/creators/{userId}/{approve,reject}` (admin actions reuse `tutor_admin_actions` audit table — extend the action enum to include `CREATOR_APPROVE`, `CREATOR_REJECT`).
  - `GET /marketplace/admin/creators/queue`

### S18-C — Course domain modules

- `marketplace/course_state.py` — FSM: `DRAFT → PENDING_REVIEW → PUBLISHED → RETIRED`. The PENDING_REVIEW step is so admin can review a course before it goes public (per ADR-0008 premium-tier review pattern, applied to all courses for v1).
- `marketplace/course_routes.py` — new router:
  - `POST /marketplace/courses` — creator only. Status starts at `DRAFT`.
  - `PATCH /marketplace/courses/{id}` — creator only; only on DRAFT.
  - `POST /marketplace/courses/{id}/submit-for-review` — DRAFT → PENDING_REVIEW.
  - `POST /marketplace/admin/courses/{id}/approve` — PENDING_REVIEW → PUBLISHED. Admin only.
  - `POST /marketplace/admin/courses/{id}/reject` — back to DRAFT with reason logged to `tutor_admin_actions` (action `COURSE_REJECT`).
  - `POST /marketplace/courses/{id}/retire` — creator self-service; PUBLISHED → RETIRED.
  - `GET /marketplace/courses` — public listing of PUBLISHED courses with filters: `?examId`, `?subjectId`, `?topicId`, `?creatorId`, `?maxPaise`, page, perPage.
  - `GET /marketplace/courses/{id}` — public; full course detail including `content_md` if status=PUBLISHED. If status≠PUBLISHED, only the creator + admin can view.
  - `GET /marketplace/creators/me/courses` — creator's own courses across all states.

- Course purchase routes:
  - `POST /marketplace/courses/{id}/purchase` — student creates a purchase + payment intent. Returns purchase + intent ID.
  - `POST /marketplace/courses/{id}/purchase/{purchaseId}/confirm-payment` — flips PENDING_PAYMENT → PAID.
  - `GET /marketplace/purchases/me` — student's purchases. Lists course headers + access status.
  - `GET /marketplace/purchases/me/{courseId}/access` — returns the full course detail if `status='PAID'`. The discovery endpoint `/marketplace/courses/{id}` returns the truncated content; the `/access` endpoint is the unlock.

### S18-D — Ratings

- `marketplace/ratings.py` — small module with two endpoints:
  - `POST /marketplace/bookings/{id}/rating` — student only. One rating per booking (DB UNIQUE). Booking must be `COMPLETED`.
  - `POST /marketplace/courses/{id}/rating` — student only. Body: `{purchaseId, stars, comment}`. Purchase must belong to caller and be `PAID`. One rating per purchase.
  - `GET /marketplace/tutors/{userId}/ratings` — public; aggregate (avg + count + recent comments).
  - `GET /marketplace/courses/{id}/ratings` — public; same shape.

The aggregates (avg, count) computed on the fly for v1; cached aggregate columns on tutor_profiles + courses are a P3-S6 optimisation.

### S18-E — Tests

| File | Tests | Type |
|---|---|---|
| `test_creator_state.py` | ~10 | unit |
| `test_course_state.py` | ~8 | unit |
| `test_course_pricing.py` | ~5 | unit (Pydantic band) |
| `test_creator_flow.py` | ~5 | integration |
| `test_course_flow.py` | ~7 | integration (CRUD + submit + admin approve + publish + purchase + my-purchases lists it) |
| `test_ratings.py` | ~6 | integration (booking rating, course rating, can't rate twice, can't rate before COMPLETED/PAID) |

### S18-F — Web-portal creator pages

- `apps/web-portal/src/pages/CreatorApply.tsx` — mirror TutorApply, slimmed (no hourly rate, no availability, no topics — all course-level).
- `apps/web-portal/src/pages/CreatorDashboard.tsx` — mirror TutorDashboard for the creator FSM. Shows status, drives KYC stub, links to "My Courses".
- `apps/web-portal/src/pages/MyCourses.tsx` — list of creator's courses across all states.
- `apps/web-portal/src/pages/CourseAuthor.tsx` — create/edit a single course (title, description, content as markdown textarea, price, exam/subject/topic picker).
- `apps/web-portal/src/lib/api.ts` extends with `creator` + `courseAuthoring` namespaces.
- Routes: `/creator/apply`, `/creator`, `/creator/courses`, `/creator/courses/new`, `/creator/courses/:id/edit`.

### S18-G — Web-student pages

- `apps/web-student/src/pages/Courses.tsx` — listing.
- `apps/web-student/src/pages/CourseDetail.tsx` — public course preview + purchase button.
- `apps/web-student/src/pages/MyCourses.tsx` — student's purchased courses with access links.
- `apps/web-student/src/pages/CourseRead.tsx` — the actual course content (markdown rendering) once purchased.
- Add `RateBooking.tsx` flow on MyBookings — small star widget + comment.
- Add rating widget on CourseRead.
- API namespace extensions on `apps/web-student/src/lib/api.ts`: `marketplace.courses` + `marketplace.purchases` + `marketplace.ratings`.

### S18-H — Web-admin pages

- `apps/web-admin/src/pages/CreatorModerationQueue.tsx` — like TutorModerationQueue but for creators in `KYC_VERIFIED`.
- `apps/web-admin/src/pages/CourseReviewQueue.tsx` — courses in `PENDING_REVIEW` with Approve / Reject. Reject logs reason.

### S18-I — Smoke

Extend to cover the creator + course flow:
- Apply as creator (reuse existing `moderator@alp.dev` seeded account)
- KYC stub
- Admin approves creator
- Creator activates
- Creator creates a course
- Creator submits for review
- Admin approves course
- Student purchases course
- Confirm payment (stub)
- Student rates booking from S17 + rates new course

5–8 new assertions, taking smoke to ~36 steps.

### S18-J — Closure + master index

`docs/02_planning/45_Sprint18_Closure.md`. Master index updated.

## Out of scope

- **Module + lesson hierarchy inside a course** — Sprint 19 polish.
- **Video upload / embedding** — needs CDN strategy + transcoding pipeline.
- **Real Stripe Connect onboarding + Daily.co wiring** — credentials still pending.
- **Course versioning** — once published, courses can edit only meta (title, price); content edits require RETIRE → re-create flow. Acceptable for v1.
- **Refund flow** — schema reserves `REFUNDED` status; flow waits for real Stripe.
- **Rating moderation** — abusive comments need admin tooling; defer to P3-S4 alongside content marketplace abuse handling.
- **Mobile flows** — Phase 3 plan defers.

## Definition of done

- Migration 004 applied; `marketplace_schema` has 12 tables (was 7).
- Creator FSM + course FSM tests green.
- Course purchase flow integration test green.
- Ratings flow integration test green.
- `make smoke` passes 36/36.
- Web-portal: creator can apply, get approved, create + publish a course end-to-end.
- Web-student: student can browse courses, buy one, leave a rating, rate a tutor session.
- Web-admin: separate moderation queues for creators + courses.
- Sprint 18 closure doc + master phase index updated.
