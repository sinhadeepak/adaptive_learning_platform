# Sprint 9 — Educator Assignments + Cohort Engagement

**Sprint window:** 2026-04-28 → 2026-05-26 (4 weeks; Phase 2 sprint S0a)
**Theme:** Turn Sprint 8's Institution Core into an actual B2B SaaS surface — educators create assignments tied to cohorts, students see them, analytics rolls up to a class leaderboard.

**Why now:** Sprint 8 landed tenants/cohorts/cohort_members but nothing *consumes* them. The premium tier-gate works for individual students; the Institutional sale (CBSE coaching center buys 30 seats) doesn't actually deliver value until educators can assign work and watch progress. This sprint closes that loop.

## Backlog

### Sprint 8 polish (close carry-overs first)

- **A-1** Auth `premium_until` staleness fallback — when the column was last updated > 30 min ago, fall back to `/payment/internal/users/{id}/premium` at JWT issuance so a dropped NATS message doesn't strand a paying user on STUDENT.
- **A-2** Fix `services/adaptive-engine/src/adaptive_engine/tutor.py::SYSTEM_TEMPLATE.format()` JSON collision (literal `{"title"}` in the prompt template hits Python str.format placeholder syntax).
- **A-3** Fix `apps/web-student/src/App.test.tsx /quiz/sid-9/result` — PR #61 changed the QuizResult hero shape; the assertion still expects the old `"4"` + `"/5"` split.

### Educator Assignments (E-block)

- **E-1** Migration: `content_schema.assignments` (id, cohort_id, created_by, title, description, question_ids[], due_at, published_at) + `assignment_progress` (assignment_id, user_id, completed_at, correct_count, total_count). Lives on content_schema since the question authoring path already lives there.
- **E-2** Repos + `POST /content/assignments` — educator picks N already-published questions + cohort + due date.
- **E-3** `GET /content/assignments?cohortId=...` — list cohort assignments (educator + student variants).
- **E-4** `POST /content/assignments/{id}/publish` — publishes the assignment, fires `content.assignment.created` to NATS so Notification can fan out to cohort members.
- **E-5** Notification: new type `assignment.new` with deep-link `/assignments/{id}` (mobile + web). Subscribed by Notification's NATS consumer.
- **E-6** `POST /content/assignments/{id}/progress` — student marks an assignment complete after running through the questions in Quiz mode.
- **E-7** `GET /content/assignments/{id}/leaderboard` — per-assignment progress for the educator.

### Class Leaderboard (L-block)

- **L-1** Analytics endpoint `GET /analytics/cohorts/{cohort_id}/leaderboard` — top N students by readiness score within the cohort. Joins `cohort_members` (institution_schema) → `analytics_schema.user_readiness` via the per-service HTTP fallback (Phase 1 pattern).

### Frontend (F-block)

- **F-1** Web-student Assignments page (`/assignments` + `/assignments/{id}`) — list + detail with "Start" CTA that creates a quiz session over the question set.
- **F-2** Mobile Assignments screen — same shape as web; deep-link target for `assignment.new` notification.
- *(Web-portal educator-side authoring UI deferred to Sprint 10 — backend is the gate.)*

### Documentation

- **D-1** Sprint 9 closure doc.
- **D-2** Master phase index update.
- **D-3** Memory `sprint_progression.md` update.

## Out of scope

- **Web-portal educator UI** — Sprint 10 (backend ready first; UI is a flat extension)
- **Web-admin Institution Core UI** — Sprint 10 (the API was unblocked S8; UI is design + tests, not infra)
- **Real-time NATS streaming for leaderboard** — pull-only for now
- **Assignment grading/feedback** — currently boolean complete + accuracy; rubrics deferred
- **Cohort invite flow** (link sharing) — Sprint 10
- **RS256 + JWKS rotation** (still HS256 + shared secret)

## Test targets

| Surface | Floor |
|---|---|
| Auth premium fallback | 4+ |
| Adaptive tutor template fix | 2+ |
| Content assignments (FSM-ish + repos + routes) | 18+ |
| Notification `assignment.new` | 4+ |
| Analytics leaderboard | 4+ |
| Web Assignments page | 4+ |
| Mobile Assignments screen | 4+ |
| **Total floor** | **40+** |
