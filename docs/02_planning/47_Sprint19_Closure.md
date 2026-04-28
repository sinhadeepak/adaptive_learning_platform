# Sprint 19 Closure — P3-S4 marketplace polish + creator economics

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/46_Sprint19_Plan.md](46_Sprint19_Plan.md)

## Scope delivered

### S19-A — Migration 005 — DONE

`marketplace_schema` rev **005** adds 2 tables + columns:

- `course_modules` — module-level structure for courses; `position INTEGER` with `(course_id, position)` UNIQUE.
- `course_lessons` — lesson under module; carries `content_md` + `duration_seconds`. UNIQUE `(module_id, position)`.
- Both `tutor_session_ratings` and `course_ratings` gained `hidden_at`, `hidden_by_admin_id`, `hidden_reason` columns + a partial index `WHERE hidden_at IS NULL`.
- `tutor_admin_actions.action` enum widened to include `RATING_HIDE`, `RATING_UNHIDE`, `BOOKING_REFUND`, `COURSE_REFUND`.
- `bookings.status` enum widened to include `REFUNDED_BY_ADMIN`.

15 tables in `marketplace_schema` total.

### S19-B — Module + lesson routes — DONE

8 new endpoints in `lesson_routes.lesson_router`:
- POST `/marketplace/courses/{courseId}/modules` (auto-position)
- PATCH `/marketplace/courses/{courseId}/modules/{moduleId}`
- DELETE `/marketplace/courses/{courseId}/modules/{moduleId}` (cascades lessons)
- POST `/marketplace/courses/{courseId}/modules/{moduleId}/lessons` (auto-position)
- PATCH `/marketplace/courses/{courseId}/modules/{moduleId}/lessons/{lessonId}`
- DELETE `/marketplace/courses/{courseId}/modules/{moduleId}/lessons/{lessonId}`
- GET `/marketplace/courses/{courseId}/structure` — public, redacts `contentMd` for non-buyers, restores it for creator/admin/buyer.

The structure endpoint replaces `/marketplace/courses/{id}` as the canonical "show me the actual course" surface. The S18 endpoint stays for backward compat (returns truncated `content_md` from the legacy column).

### S19-C — Earnings dashboard — DONE

- GET `/marketplace/creators/me/earnings?since=&until=` — defaults to last 90 days.
- Aggregates over `course_purchases` (creator's PAID purchases) AND `bookings` (creator's COMPLETED tutor sessions, treating creator and tutor as potentially the same user).
- Returns 8 paise-denominated fields + 2 counts + `totalNetPaise` summary.
- Pure SQL aggregate; no caching. Caching is P3-S6 if/when scale demands.

### S19-D — Rating moderation — DONE

- POST `/marketplace/admin/ratings/{kind}/{ratingId}/hide` — `kind ∈ {session, course}`. Sets `hidden_at`, `hidden_by_admin_id`, `hidden_reason`. Logs `RATING_HIDE` audit row.
- POST `/marketplace/admin/ratings/{kind}/{ratingId}/unhide` — reverses, logs `RATING_UNHIDE`.
- Aggregate functions in `repositories.py` updated to filter on `hidden_at IS NULL`. The S18 definitions are overridden by later definitions in the same module (later-binding wins).

### S19-E — Refund flow — DONE

- POST `/marketplace/admin/bookings/{id}/refund` — booking must be `COMPLETED | CANCELLED_BY_TUTOR | NO_SHOW_TUTOR`. Calls `stripe_connect.refund_payment_intent` (stub). Sets `status='REFUNDED_BY_ADMIN'`. Logs `BOOKING_REFUND`.
- POST `/marketplace/admin/courses/{courseId}/purchases/{purchaseId}/refund` — purchase must be `PAID`. Sets `status='REFUNDED'`, `refunded_at=now()`. Logs `COURSE_REFUND`.
- Both routes accept `?forceFailure=true` for testing the failure branch (returns 502).
- New booking FSM action `ADMIN_REFUND` and state `REFUNDED_BY_ADMIN` (terminal).

### S19-F — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `test_module_lesson.py` | 6 | integration | 6/6 ✅ |
| `test_earnings.py` | 4 | integration | 4/4 ✅ |
| `test_rating_moderation.py` | 4 | integration | 4/4 ✅ |
| `test_refund.py` | 4 | integration | 4/4 ✅ |
| Carry-over | 52 unit + 20 integration | | ✅ |
| **Total** | **52 unit + 38 integration = 90** | | **90 / 90** |

### S19-G — Web-portal earnings — DONE

- New `apps/web-portal/src/pages/CreatorEarnings.tsx` — period selector (30/90/365 days), total-net hero card, breakdown grid (course vs. session revenue + commission + counts).
- `apps/web-portal/src/lib/api.ts` extended with `courseStructure` (module/lesson CRUD) + `creatorEarnings` namespaces.
- Route `/creator/earnings` wired; link added on MyCourses page.

### S19-H — Smoke extended to 42 steps — DONE

6 new assertions:
- Add module + lesson to course
- Course structure visible to buyer (contentMd populated)
- Creator earnings reflect the paid course
- Admin hides course rating → aggregate count = 0
- Admin refunds course purchase → REFUNDED

`make smoke` passes **42/42**.

### S19-I — Closure + master index — DONE

This file. Master phase index updated.

## Test totals at Sprint 19 close

| Surface | Result | Status |
|---|---|---|
| alp-marketplace `pytest tests/` (unit) | 52 / 52 | ✅ |
| alp-marketplace `pytest tests/ -m integration` | 38 / 38 | ✅ |
| `make smoke` | 42 / 42 | ✅ |
| Other surfaces | unchanged | ✅ |

## Stack inventory at Sprint 19 close

- 6 services (still under ADR-0005 ceiling).
- alp-marketplace: 61 routes (was 49 at S18 close), 15 tables (was 13).
- 4 distinct FSMs: tutor application, creator application, course publishing, booking + booking-refund.

## What surprised us this sprint

- **Module/lesson auto-position via `MAX(position) + 1`** races under concurrent inserts — two simultaneous POSTs could compute the same `position`. The UNIQUE constraint will reject one of them, but the API surfaces it as a 500 IntegrityError. For P3-S4 traffic levels (one creator typing one module at a time), this is fine. Real concurrent-author scenarios need per-course advisory locks; defer to P3-S6.
- **Function override pattern in repositories.py** worked out cleanly — re-defining `aggregate_tutor_ratings` and `aggregate_course_ratings` later in the same module made the older S18 definitions inactive. Cleaner than refactoring the original definitions to take an extra `include_hidden=False` parameter.
- **Refund's allowed-from set is narrower than I'd have expected.** `CANCELLED_BY_STUDENT` is *not* refundable through the admin tool — student already triggered the cancel; if money needs to come back, that's a customer service refund through Stripe directly, not a marketplace-FSM transition. Documented in the FSM rules table.
- **Audit table column reuse.** The `tutor_admin_actions.tutor_user_id` column now holds tutor IDs, creator IDs, course IDs, AND rating subject IDs (tutor-id-or-course-id depending on kind). Generic-but-unspecific. Worth renaming to `subject_id` in a future cleanup migration.

## Carry-overs to Sprint 20 (P3-S5 starts)

| Item | Why deferred | Owner |
|---|---|---|
| Module/lesson UI in CourseAuthor.tsx | Significant complexity (sidebar nav + reordering); only API + earnings UI shipped this sprint | P3-S5 |
| Lesson reader UI updates in CourseRead.tsx | Falls back to legacy `content_md` for now; nav UI lands with the author UI | P3-S5 |
| Admin rating-moderation UI in web-admin | API works; UI is a list + hide/unhide buttons | P3-S5 |
| Real Stripe Connect Express + Daily.co | Still pending creds | P3-S5 if creds arrive |
| Predictive analytics (drop-out forecasting per ADR-0010) | Phase 3 plan headline for P3-S5 | P3-S5 |
| Recommendation engine (ADR-0011) | Same; embeds + cosine sim in `engagement.analytics.predictive` | P3-S5 |
| Mobile flows | Phase 3 plan defers throughout | P3-S5+ |
| Aggregate rating + earnings columns (cached) | Performance optimisation when scale demands | P3-S6 |
| Per-course advisory locks for module insert races | Concurrent-author safety | P3-S6 |
| Subject_id rename on tutor_admin_actions | Cosmetic refactor | Whenever the audit table needs a feature change |

## P3-S4 status

**P3-S4 closed** at Sprint 19. Marketplace polish + creator economics are operational: courses now have modules + lessons, creators can see their earnings, admins can moderate ratings + issue refunds, all FSMs are tested. Sprint 20 (P3-S5) opens predictive analytics + recommendation engine per ADR-0010 + ADR-0011, plus the deferred UI work for module/lesson navigation.
