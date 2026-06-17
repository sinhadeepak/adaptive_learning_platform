# Sprint 19 — P3-S4 marketplace polish + creator economics

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Promote courses from atomic content to a structured `module → lesson` hierarchy, give creators an earnings dashboard, give admins rating-moderation + refund tooling. Real Stripe Connect / Daily.co remain stubbed pending credentials.

## Why this sprint

S18 shipped both marketplace channels end-to-end, but courses were "atomic" — a single markdown blob per course. That works for v1 but doesn't match real e-learning UX (Udemy/Coursera/Outschool all use module + lesson hierarchy). Plus four operational carry-overs from S18:

1. **Creators can't see their money.** No earnings view; they have to reconstruct it from bookings + purchases.
2. **No rating moderation.** Abusive comments stay public; admins have no tool to hide them.
3. **No refund flow.** The schema reserves `REFUNDED` but nothing transitions to it.
4. **No way to edit a published course's content.** Today: retire + recreate. Painful.

S19 picks the four highest-leverage of these:

- Module + lesson hierarchy → unlocks real course UX.
- Creator earnings → the missing money story.
- Rating moderation → unblocks scaling beyond closed beta.
- Refund flow stub → operational baseline; real Stripe path lights up when creds land.

Premium-tier review workflow + edit-after-publish + video upload defer to P3-S5 / P3-S6.

## Backlog

### S19-A — Migration 005

Three changes:

- **`course_modules`** — `id UUID PK`, `course_id FK CASCADE`, `position INTEGER`, `title`, `description NULL`, `created_at`, `updated_at`. Unique `(course_id, position)`.
- **`course_lessons`** — `id UUID PK`, `module_id FK CASCADE`, `position INTEGER`, `title`, `content_md`, `duration_seconds NULL`, `created_at`, `updated_at`. Unique `(module_id, position)`.
- **Rating moderation** — add `hidden_at TIMESTAMPTZ NULL`, `hidden_by_admin_id UUID NULL`, `hidden_reason TEXT NULL` columns to both `tutor_session_ratings` and `course_ratings`. Aggregates exclude rows where `hidden_at IS NOT NULL`.

The `courses.content_md` column stays for backward compatibility; new courses author into `course_modules + course_lessons` and the legacy field becomes a "course summary" used as the listing description fallback.

### S19-B — Module + lesson routes

Mounted in a new `lesson_routes.py` to keep the creator route file from getting unwieldy.

- POST `/marketplace/courses/{courseId}/modules` — creator-only. Body `{title, description?}`. Position auto-assigned (current max + 1).
- PATCH `/marketplace/courses/{courseId}/modules/{moduleId}` — creator-only. Edit title/description/position.
- DELETE `/marketplace/courses/{courseId}/modules/{moduleId}` — creator-only. Cascade-deletes lessons.
- POST `/marketplace/courses/{courseId}/modules/{moduleId}/lessons` — creator-only. Body `{title, contentMd, durationSeconds?}`.
- PATCH `/marketplace/courses/{courseId}/modules/{moduleId}/lessons/{lessonId}` — creator-only.
- DELETE `/marketplace/courses/{courseId}/modules/{moduleId}/lessons/{lessonId}` — creator-only.
- GET `/marketplace/courses/{courseId}/structure` — public on PUBLISHED; returns `[{module, lessons:[...]}]`. **Lesson `contentMd` is omitted** unless the caller is creator/admin or has a PAID purchase. The truncation rule from S18 generalises here.

Module/lesson edits work in any course state — content edits within the module/lesson are no longer FSM-locked because the per-lesson granularity makes "version drift" less risky than the previous monolithic content_md was. Document this as a deliberate v2 choice.

### S19-C — Creator earnings dashboard

- Pure-aggregation endpoint:
  - GET `/marketplace/creators/me/earnings?since=YYYY-MM-DD&until=YYYY-MM-DD`
  - Defaults to the last 90 days.
  - Returns `{periodStart, periodEnd, courseRevenuePaise, courseCommissionPaise, courseNetPaise, sessionRevenuePaise, sessionCommissionPaise, sessionNetPaise, totalNetPaise, paidCourses, completedSessions}`.
  - Course revenue: sum of `course_purchases.price_paise` where the course's creator is `me` and `status='PAID'`. Commission: sum of `course_purchases.commission_paise`. Net = revenue − commission.
  - Session revenue: sum of `bookings.price_paise` where `tutor_user_id` is `me` (treats tutor and creator as potentially the same user). `status='COMPLETED'` only. Commission likewise.
  - This is a single query each, no caching for v1. The scale where caching matters is P3-S6.

### S19-D — Rating moderation

- POST `/marketplace/admin/ratings/{kind}/{id}/hide` — admin-only. `kind ∈ {session, course}`. Body `{reason}`. Sets `hidden_at = now()`, `hidden_by_admin_id`, `hidden_reason`. Logs to `tutor_admin_actions` with action `RATING_HIDE`.
- POST `/marketplace/admin/ratings/{kind}/{id}/unhide` — admin-only. Clears the moderation columns. Logs `RATING_UNHIDE`.
- Aggregate endpoints already filter on `hidden_at IS NULL` — update repo functions.

Admin-actions enum widens to include `RATING_HIDE`, `RATING_UNHIDE`.

### S19-E — Refund flow

Booking refunds and course purchase refunds, both admin-initiated for v1.

- POST `/marketplace/admin/bookings/{id}/refund` — admin-only. Booking must be COMPLETED or CANCELLED_*. Calls `stripe_connect.refund_payment_intent` (stub returns `succeeded`). Sets booking `status='REFUNDED_BY_ADMIN'` (new state in booking_state). Logs to `tutor_admin_actions` with action `BOOKING_REFUND`.
- POST `/marketplace/admin/courses/{courseId}/purchases/{purchaseId}/refund` — admin-only. Purchase must be PAID. Sets `course_purchases.status='REFUNDED'`, `refunded_at=now()`. Logs `COURSE_REFUND`.
- `stripe_connect.refund_payment_intent(intent_id, *, force=...) -> "succeeded" | "failed"`. Stub mode same pattern as the rest.

Booking FSM gets a new state `REFUNDED_BY_ADMIN` — terminal. Audit-log-only on student/tutor side; the booking just appears refunded in their bookings list.

### S19-F — Tests

| File | Tests | Type |
|---|---|---|
| `test_module_lesson.py` | ~6 | integration (CRUD + structure access gating) |
| `test_earnings.py` | ~4 | integration (aggregation correctness across mixed data) |
| `test_rating_moderation.py` | ~4 | integration (hide/unhide + aggregate excludes hidden) |
| `test_refund.py` | ~4 | integration (booking + course refund happy path + state checks) |

### S19-G — Web-portal updates

- Extend `CourseAuthor.tsx` with a module/lesson sidebar — list modules, click-through to lessons, add/edit/delete buttons. Markdown editor moves from `course.contentMd` to the active lesson's content_md.
- New `apps/web-portal/src/pages/CreatorEarnings.tsx` — read-only dashboard with period picker (last 30/90 days, custom). Shows the 8 numbers from the API.
- Routes wired: `/creator/earnings`.

### S19-H — Web-student lesson reader

- `apps/web-student/src/pages/CourseRead.tsx` evolves: shows module → lesson navigation in a sidebar; clicking a lesson shows that lesson's content_md.
- For courses still authored as atomic content (S18-style), the page falls back to rendering `courses.content_md`.

### S19-I — Web-admin moderation tools

- New `apps/web-admin/src/pages/RatingModeration.tsx` — admin can search by tutor/course id, see ratings with hide/unhide actions.
- Inline buttons on `TutorAdminActions.tsx` audit history to surface `RATING_HIDE` events.

### S19-J — Smoke

Add 4 assertions:
- Add module + lesson to the course in S18 smoke flow
- Course structure endpoint returns the nested data for the buyer
- Earnings endpoint reports the course revenue
- Admin hides the course rating; aggregate shows 0 ratings

40-step smoke target.

## Out of scope

- **Real Stripe Connect / Daily.co wiring** — pending creds.
- **Edit-after-publish course content** for the legacy atomic-content_md path — replaced by module/lesson granularity which permits edits in any state.
- **Premium-tier review workflow** — defer to P3-S5.
- **Mobile flows for any of this** — Phase 3 plan defers.
- **Video upload** — needs CDN + transcoding pipeline; P3-S5+.
- **Aggregate rating columns on tutor_profiles + courses** — performance optimisation; P3-S6.

## Definition of done

- Migration 005 applied; `marketplace_schema` has 15 tables.
- Module + lesson CRUD works end-to-end in tests.
- Earnings endpoint returns correct aggregates across mixed creator/tutor data.
- Admin can hide + unhide a rating; aggregates respect the hidden flag.
- Both refund paths reach `REFUNDED` / `REFUNDED_BY_ADMIN` state.
- Web-portal: creator can author module/lesson hierarchy + see earnings.
- Web-student: course reader shows module/lesson nav.
- Web-admin: rating-moderation page works.
- `make smoke` passes 40/40.
- Sprint 19 closure doc + master phase index updated.
