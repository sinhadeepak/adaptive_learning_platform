# Sprint 13 — Realtime Push + Educator Insights

**Sprint window:** 2026-04-28 (single working session, Phase 2 sprint S0e)
**Theme:** Close out the operational debt from Sprint 12 (replace the
5-second poll with a real push) and give educators the analytics depth
they've been asking for since Sprint 9 (per-student drill-down + invite
funnel + cohort summary).

## Backlog

### S13-A — NATS-driven leaderboard push

Today's `GET /analytics/cohorts/{id}/leaderboard/stream` polls the L-1
endpoint every 5s and re-emits when the digest changes. That's "live"
to within 5s but means every connected educator triggers DB load every
5s even when nothing's happening.

- **A-1** Process-local pub/sub (`analytics/realtime.py`): an
  `asyncio.Queue` per cohort_id with subscriber registration.
- **A-2** Hook the existing `quiz.session.completed` consumer in
  `events.py`. After `process_session()` succeeds, look up the user's
  cohort membership (HTTP to Institution) and publish a "user
  recomputed" tick to every queue subscribed to those cohorts.
- **A-3** SSE handler swaps the `asyncio.sleep(5)` loop for
  `await queue.get()` with a 25s heartbeat fallback. On wake, it
  rebuilds the snapshot, diffs the digest, and emits a `delta` event
  only when it actually changed.
- **A-4** Remove the 5s poll path. Pure helpers `register_subscriber`
  / `publish_cohort_tick` get unit tests for fan-out + cleanup.

### S13-B — Tenant-invite claim audit + funnel

Educators want to know who actually claimed an invite link they
shared. Today the invite row only carries an aggregate `uses` count.

- **B-1** Migration: `cohort_invite_claims` (invite_id, user_id,
  claimed_at). Append-only — never delete — so the audit survives
  invite revocation.
- **B-2** Wire the existing `claim` route to insert a row on each
  successful claim.
- **B-3** New endpoint `GET /institution/cohorts/invites/{id}/claims`
  returning the audit list.
- **B-4** Web-admin TenantCohorts invite row gets a "View claims"
  expandable that calls the new endpoint.

### S13-C — Educator student drill-down

Cohort leaderboard rows aren't actionable today. Tapping a row should
open a per-student page showing topic mastery + readiness + recent
quiz sessions.

- **C-1** New analytics endpoint
  `GET /analytics/cohorts/{cohort_id}/students/{user_id}` that joins
  `analytics_schema.user_mastery` + `readiness` + a recent-sessions
  trail (last 10 from `quiz_schema.quiz_sessions` via the existing
  read-only handle).
- **C-2** Web-portal `/cohorts/{cohortId}/students/{userId}` page that
  consumes it.
- **C-3** CohortLeaderboard row → links to the drill-down.

### S13-D — Cohort summary stats on leaderboard header

The leaderboard header is a one-liner today. Educators want a
30-second-glance summary: cohort size, avg readiness, completion %,
top-3 names that need attention.

- **D-1** `GET /analytics/cohorts/{cohort_id}/summary` — pure
  aggregation over the same data the leaderboard uses, plus a
  computed "at-risk" list (readiness < 0.4 with N≥3 topics).
- **D-2** Render it as 4 stat tiles above the leaderboard table.

## Out of scope (Sprint 14+)

- Assignment grading rubrics (bonus weights, partial credit) — needs
  design + larger schema work.
- RS256 + JWKS rotation — its own ops sprint with deploy + key
  rotation runbook.
- Multi-cohort student view (single student in N cohorts).
- Cohort-level export (CSV / PDF) for parent-teacher meetings.
- Real-time student typing indicators (Phase 3).

## Test targets

| Surface | Floor |
|---|---|
| Pure realtime fan-out helpers | 5+ |
| Invite claim audit endpoints | 4+ |
| Student drill-down aggregation | 4+ |
| Cohort summary computation | 4+ |
| **Total floor** | **17+** |
