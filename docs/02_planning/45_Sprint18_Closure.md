# Sprint 18 Closure — P3-S3 creator content marketplace + ratings

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/44_Sprint18_Plan.md](44_Sprint18_Plan.md)

## Scope delivered

### S18-A — Migration 004 — DONE

`marketplace_schema` rev **004** adds 5 tables (13 total now):

- `creator_profiles` — mirrors tutor_profiles for the creator persona; same FSM (APPLIED → KYC → APPROVED → ACTIVE).
- `courses` — atomic content artifact. ADR-0008 pricing band (4900–499900 paise = ₹49–₹4,999) enforced via DB CHECK with a FREE-tier exception (price must equal 0).
- `course_purchases` — student-course purchase records; partial unique index on `(student_user_id, course_id) WHERE status='PAID'` blocks double-purchase.
- `tutor_session_ratings` — 1:1 with bookings via UNIQUE FK; CHECK stars BETWEEN 1 AND 5.
- `course_ratings` — 1:1 with purchases via UNIQUE FK.

The `tutor_admin_actions.action` enum extended to cover `CREATOR_APPROVE`, `CREATOR_REJECT`, `COURSE_APPROVE`, `COURSE_REJECT`. The original FK constraint on `tutor_user_id` dropped — the column is now a generic "marketplace entity the admin acted on".

### S18-B — Creator FSM + routes — DONE

- `marketplace/creator_state.py` — pure-function FSM, identical actions/states to `tutor_state.py`. 8 unit tests.
- 7 creator endpoints in `creator_routes.py`:
  - apply, /me, PATCH /me, kyc/start, kyc/poll, activate, admin queue + approve + reject.

### S18-C — Course FSM + routes — DONE

- `marketplace/course_state.py` — DRAFT → PENDING_REVIEW → PUBLISHED → RETIRED. 8 unit tests.
- 12 course endpoints (`course_router`):
  - POST `/marketplace/courses` (creator-only, must be ACTIVE)
  - PATCH `/marketplace/courses/{id}` (content_md edits locked to DRAFT state)
  - POST `/marketplace/courses/{id}/submit-for-review`
  - POST `/marketplace/admin/courses/{id}/{approve,reject}`
  - POST `/marketplace/courses/{id}/retire`
  - GET `/marketplace/courses` (public PUBLISHED listing with filters)
  - GET `/marketplace/courses/{id}` (truncated content for non-buyers)
  - GET `/marketplace/creators/me/courses` (creator's all-state list)
  - POST `/marketplace/courses/{id}/purchase`
  - POST `/marketplace/courses/{id}/purchase/{purchaseId}/confirm-payment`
  - GET `/marketplace/purchases/me`
  - GET `/marketplace/purchases/me/{courseId}/access` (full content unlock)

### S18-D — Ratings — DONE

- `rating_router`:
  - POST `/marketplace/bookings/{id}/rating` (only on COMPLETED; one per booking)
  - POST `/marketplace/courses/{id}/rating` (purchase must be PAID; one per purchase)
  - GET `/marketplace/tutors/{userId}/ratings` (aggregate + recent comments)
  - GET `/marketplace/courses/{id}/ratings` (same shape)

### S18-E — Tests — DONE

| File | Tests | Type | Status |
|---|---|---|---|
| `test_creator_state.py` | 8 | unit | ✅ |
| `test_course_state.py` | 8 | unit | ✅ |
| `test_course_flow.py` | 8 | integration | ✅ |
| Carry-over (S16 + S17) | 38 unit + 12 integration | | ✅ |
| **Total** | **52 unit + 20 integration = 72** | | **72 / 72** |

### S18-F — Web-portal creator pages — DONE

4 new pages in `apps/web-portal/src/pages/`:

- `CreatorApply.tsx` — slim form (display name, headline, bio).
- `CreatorDashboard.tsx` — FSM-aware dashboard with KYC stub buttons + Activate.
- `MyCourses.tsx` — creator's course list with status badges + Submit-for-review + Retire actions.
- `CourseAuthor.tsx` — markdown editor for course content; price + meta fields. Auto-disabled in non-DRAFT states.

`apps/web-portal/src/lib/api.ts` extended with `creator` + `courseAuthoring` namespaces. Routes wired: `/creator`, `/creator/apply`, `/creator/courses`, `/creator/courses/new`, `/creator/courses/:id/edit`.

### S18-G — Web-student pages — DONE

4 new pages in `apps/web-student/src/pages/`:

- `Courses.tsx` — public listing with rating count.
- `CourseDetail.tsx` — preview + purchase + recent reviews.
- `MyPurchases.tsx` — student's bought courses with access link + Rate button.
- `CourseRead.tsx` — full markdown content reader (post-purchase).

`apps/web-student/src/lib/api.ts` extended with `courseMarketplace` + `tutorRatings` namespaces. Routes wired: `/courses`, `/courses/:courseId`, `/courses-mine`, `/courses/:courseId/read`.

### S18-H — Smoke extended to 36 steps — DONE

8 new assertions: rate completed booking, creator login, creator KYC, creator activate, course create, course approve, course payment confirm, course rating.

`make smoke` passes **36/36**.

## Test totals at Sprint 18 close

| Surface | Result | Status |
|---|---|---|
| alp-marketplace `pytest tests/` (unit) | 52 / 52 | ✅ |
| alp-marketplace `pytest tests/ -m integration` | 20 / 20 | ✅ |
| `make smoke` | 36 / 36 | ✅ |
| Other surfaces | unchanged from S17 close | ✅ |

## Stack inventory at Sprint 18 close

Same 6 services, marketplace continues to grow:

- 49 routes (was 23 at S17 close)
- 13 tables in `marketplace_schema` (was 7)
- Two distinct application FSMs (tutor + creator)
- Two distinct content FSMs (booking + course)
- Two ratings surfaces (tutor session + course)

## What surprised us this sprint

- **`:tids::jsonb` parameter binding doesn't work in async SQLAlchemy** — the double-colon Postgres cast collides with the `:name` parameter syntax. Fixed by switching to `CAST(:tids AS jsonb)`. Worth remembering for any future jsonb column work.
- **The `tutor_admin_actions` table needed retroactive widening** — I'd put a strict FK on `tutor_user_id` in Sprint 17 thinking only tutors would be audited. Sprint 18's creator + course audits broke it. Migration 004 drops the FK. Lesson: reserve a generic `subject_id` instead of a typed FK when the audit table will serve multiple entity kinds.
- **Conftest truncate ordering matters with FKs**. Adding tables to the TRUNCATE list works because we use `CASCADE`, but if any test creates implicit dependencies (e.g. course_purchases referencing courses via FK) and the TRUNCATE runs in a non-CASCADE order, it fails. The current `RESTART IDENTITY CASCADE` handles this, but it's worth being intentional.

## Carry-overs to Sprint 19 (P3-S4 starts)

| Item | Why deferred | Owner |
|---|---|---|
| Module + lesson hierarchy inside courses | v1 is atomic content; needs UI + schema for nested structure | P3-S4 |
| Video upload + CDN integration | Needs transcoding pipeline + S3 + signed URLs | P3-S4 |
| Real Stripe Connect Express + Daily.co | Still gated on credentials | P3-S4 once creds arrive |
| Refund flow | Schema reserved `REFUNDED` state; needs real Stripe integration | P3-S4 |
| Course versioning + edit-after-publish | Today: RETIRE → re-create. Real flow needs draft-on-published-course | P3-S4 |
| Creator payouts schedule + earnings dashboard | Stripe Connect dashboard handles money side; we need a creator-facing earnings summary view | P3-S4 |
| Rating moderation (abuse handling) | Manual admin tooling for offensive comments | P3-S4 |
| Mobile flows for course discovery + purchase | Phase 3 plan deferred mobile to P3-S5 (or later) | P3-S5 |
| Aggregate rating columns on tutor_profiles + courses | Performance optimisation — currently computed on the fly | P3-S6 |
| Premium-tier review workflow | Above-ceiling pricing review queue | P3-S4 |

## P3-S3 status

**P3-S3 closed** at Sprint 18. Both marketplace channels — synchronous tutor sessions (P3-S2) and asynchronous creator courses (P3-S3) — are operational end-to-end in local dev with their respective FSMs, payment stubs, ratings, and admin moderation queues. Sprint 19 (P3-S4) opens course content modules + ratings moderation + earnings dashboard + real Stripe/Daily wiring once credentials arrive.
