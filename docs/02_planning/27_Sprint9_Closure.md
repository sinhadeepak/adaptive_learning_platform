# Sprint 9 Closure — Educator Assignments + Cohort Engagement

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/26_Sprint9_Educator_Assignments_Plan.md](26_Sprint9_Educator_Assignments_Plan.md)

## Scope delivered

### Sprint 8 polish (carry-overs closed)

- **A-1** Auth `premium_until` staleness fallback. New
  `services/auth/src/auth/payment_fallback.py` — when `users.premium_until IS NULL`
  at JWT issuance, hits `/payment/internal/users/{id}/premium` (1s timeout,
  fail-open). Catches the dropped-NATS-payment-success edge case. **5 new tests.**
- **A-2** Tutor `SYSTEM_TEMPLATE.format()` JSON collision fixed —
  switched to `str.replace()` for the four named placeholders since the
  template carries literal `{"title": "..."}` artifact-schema JSON that
  collides with Python's str.format placeholders. **5 existing tutor
  tests now pass.**
- **A-3** Web QuizResult test fixed — PR #61 changed the result hero
  shape; assertions now use substring regex (`/80%/`, `4/5` combined,
  `/CORRECT/` & `/WRONG/` pills). **All 28 web-student tests green.**

### Educator Assignments (E-block — DONE)

- **E-1** Migration `005_create_assignments` (content_schema):
  `assignments` (DRAFT/PUBLISHED via `published_at` flag), `assignment_questions`
  (pivot with position), `assignment_progress` (UNIQUE on assignment_id+user_id
  for last-write-wins on re-attempts).
- **E-2..E-4** `assignments_repo.py` + `assignments_routes.py`:
  - `POST /content/assignments` — educator creates DRAFT
  - `PUT /content/assignments/{id}/questions` — replace question set
    (locked after publish — 409 attempts to edit)
  - `POST /content/assignments/{id}/publish` — flips published_at,
    publishes `content.assignment.created` to NATS (idempotent — re-publish
    does NOT re-fanout)
  - `GET /content/assignments?cohortId=...` — educator + student variants
    (students see only published)
  - `GET /content/assignments/{id}/questions` — ordered question list
- **E-5** `notification/assignment_subscriber.py` — durable consumer on
  `content.assignment.created`. Hits Institution `/cohorts/{id}/members`
  via HTTP, writes one `assignment.new` notification row per member.
  Idempotent via deterministic uuid5 id (assignment_id + user_id).
- **E-6** `POST /content/assignments/{id}/progress` — student records
  score; UNIQUE constraint enables re-attempt overwrite.
- **E-7** `GET /content/assignments/{id}/leaderboard` — educator-side
  per-assignment progress sorted by accuracy_pct DESC.

**Tests:** 14 content endpoint tests, 5 notification subscriber tests = **19**.

### Class leaderboard (L-block — DONE)

- **L-1** `analytics/cohort_leaderboard.py` — pure-function `rank_leaderboard()`
  (sort by score DESC, n_topics DESC, userId ASC; LEAD_TEACHER excluded
  by default). HTTP fetch + batch DB read in `routes.py` GET
  `/analytics/cohorts/{cohort_id}/leaderboard?includeTeachers=true`.
  **8 new tests.**

### Frontend (F-block — DONE)

- **F-1** Web-student:
  - `/assignments` route + `pages/Assignments.tsx` (inbox)
  - `/assignments/:id` + `pages/AssignmentDetail.tsx`
  - `lib/assignments.ts` with `progressBucket()` + `formatDueAt()` pure helpers
  - **13 unit tests** for the helpers.
- **F-2** Mobile:
  - `lib/api/assignments.dart` — typed `AssignmentsClient` mirroring web
  - `screens/assignments_screen.dart` (inbox) + `screens/assignment_detail_screen.dart`
  - Entry point added to Profile tab STUDY group
  - **14 unit tests** for the helpers + JSON parsing.

## Test totals

| Surface | New tests | Status |
|---|---|---|
| Auth premium fallback | 5 | green |
| Tutor template (re-enabled) | 0 (5 unblocked) | green |
| Content assignments | 14 | green |
| Notification assignment.new | 5 | green |
| Analytics cohort leaderboard | 8 | green |
| Web-student assignments lib | 13 | green |
| Mobile assignments helpers | 14 | green |
| **Total new** | **59** | |

Mobile suite: **114/114 green** (100 pre-existing + 14 Sprint 9).
Web-student suite: **28/28 green** (1 was failing pre-sprint, now fixed).

Pre-existing failures still present (unchanged by Sprint 9):
- `services/content/tests/test_routes.py` — 7 tests dependent on seeded
  catalog topics + educator_assignments. Broken since PR 906f530.
  Sprint 10 backlog item — needs a `make seed-test-catalog` fixture.

## Out of scope (deferred to Sprint 10)

- **Web-portal educator authoring UI** — the create-assignment wizard;
  the backend is complete and the web-admin already has the cohort/tenant
  lookup. UI is Sprint 10.
- **Web-admin Institution Core UI** — tenant/cohort CRUD screens.
  Backend exists since Sprint 8.
- **Real quiz-runner integration on assignments** — currently the student
  manually enters their score on the assignment detail page; the full
  flow chains the question list into a Quiz session and auto-submits
  the score on completion.
- **Cohort invite flow** — link-sharing for student onboarding.
- **Real-time leaderboard SSE** — pull-only for now.
- **Pre-existing content test fixture** (catalog topics + educator_assignments
  seed for the 7 failing tests).

## Carry-overs into Sprint 10

1. **Web-portal Assignment Authoring UI** — wizard: pick cohort, pick
   questions, set due date, publish. The backend is ready since this sprint.
2. **Web-admin Institution UI** — tenants list + cohort detail with
   member management. Backend exists since Sprint 8.
3. **Quiz session ↔ Assignment integration** — when student finishes the
   quiz session for an assignment, auto-call `POST /progress` with the
   real score. Today the student types it in.
4. **Test fixture** for catalog topic + educator_assignment seed so the
   7 failing content route tests pass.
5. **RS256 + JWKS rotation** (still HS256 + shared secret).

## Sign-off

- [ ] Compose stack rebuilds green
- [ ] Smoke pass: educator creates DRAFT → publish → student sees in inbox → records score → educator sees on leaderboard
- [ ] Migration 005 applied to compose Content DB
- [ ] CTO sign-off
