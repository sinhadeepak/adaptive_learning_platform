# Sprint 12 — Realtime + Invite Revocation + Mobile Onboarding

**Sprint window:** 2026-04-28 (single working session, Phase 2 sprint S0d)
**Theme:** Close the four highest-value Sprint 11 carry-overs that turn
the educator UX from "demoable" into "operationally complete":
revocable invites, live leaderboards, mobile invite onboarding, and
the real Quiz-session bridge for assignments.

## Backlog

### S12-A — Tenant invite revocation

The Sprint 11 invite endpoint has no list/revoke surface. Educators
can't see what invites are outstanding or revoke a leaked link.

- **A-1** `GET /institution/cohorts/{id}/invites` — lists invites for
  a cohort (returns the token tail only — never the secret prefix —
  so a list payload leak isn't an immediate auth bypass).
- **A-2** `DELETE /institution/cohorts/invites/{id}` — hard-delete
  (matches the FK CASCADE design: gone means gone, no soft-delete
  window).
- **A-3** Web-admin UI — TenantCohorts adds an "Invites" expandable
  per cohort with copy-link + revoke buttons.

### S12-B — Real-time cohort leaderboard

Today the leaderboard endpoint returns a snapshot. Educators want
live updates as students complete assignments. Without breaking the
existing GET, add an SSE endpoint that pushes updates whenever a row
changes.

- **B-1** `GET /analytics/cohorts/{id}/leaderboard/stream` —
  text/event-stream. Initial frame is the same payload the GET
  returns; subsequent frames are `delta` events when a member's
  readiness changes.
- **B-2** Best-effort: piggyback on the existing
  `quiz.session.completed` NATS subscriber. When a session lands for
  a user we have in-memory subscriptions for, push a `delta`.
- **B-3** Web-portal CohortLeaderboard hooks the SSE source and patches
  the table in place.

### S12-C — Mobile JoinCohort screen

Web has `/join/:token`. Mobile shares the deep-link target so an invite
opened on a phone goes through the native flow.

- **C-1** New `JoinCohortScreen` (Flutter) that reads the token from
  arguments + calls `BillingClient`-pattern `AssignmentsClient`-style
  client, then pushes onto the AssignmentsScreen.
- **C-2** Wire the deep-link parser (existing `lib/auth/deep_link.dart`)
  to recognise `https://<host>/join/<token>` URLs.

### S12-D — Real Quiz-session integration for assignments

Assignments still render answers inline in `AssignmentDetail`. Wire
them through the actual Quiz service's session FSM so:
- Adaptive ordering can layer in later (per-student item shuffling)
- The same submit/score path is shared with PRACTICE / MOCK
- Bookmark/feedback flows already wired in Quiz "just work"

- **D-1** Quiz Go: `POST /quiz/sessions/from-assignment` — takes
  `{assignmentId}`, fetches the question list from Content via HTTP,
  creates a session with `mode=ASSIGNMENT` pinning that exact item set
  (no IRT shuffle).
- **D-2** Quiz session FSM: add `ASSIGNMENT` to the mode enum.
- **D-3** On submit, Quiz publishes `quiz.session.completed` as today;
  Content picks up the score via a new
  `notification:quiz-completed-for-assignment` consumer that maps
  session_id → assignment_id and upserts `assignment_progress`.
- **D-4** Web-student `AssignmentDetail` "Start" CTA now creates the
  session and routes to `/quiz/{sessionId}`.

## Out of scope

- RS256 + JWKS rotation (separate ops sprint with deploy + key
  rotation runbook)
- Assignment grading rubrics (needs design; bonus weights per question,
  partial credit, etc.)
- Educator analytics drill-down per student
- AI rewrite of the assignment authoring wizard (Phase 3)

## Test targets

| Surface | Floor |
|---|---|
| Invite list/revoke endpoints + token-tail safety | 4+ |
| SSE leaderboard delta encoding | 3+ |
| Mobile JoinCohort helpers | 2+ |
| Quiz `from-assignment` session creation | 4+ |
| **Total floor** | **13+** |
