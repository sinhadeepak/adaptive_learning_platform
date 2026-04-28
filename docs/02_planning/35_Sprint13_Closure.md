# Sprint 13 Closure — Realtime Push + Educator Insights

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/34_Sprint13_Insights_Plan.md](34_Sprint13_Insights_Plan.md)

## Scope delivered

### S13-A — NATS-driven leaderboard push — DONE

Replaced the Sprint 12 5-second SSE poll with event-driven push.

- New `analytics/realtime.py` — process-local pub/sub. Per-cohort
  fan-out via `Subscription` objects holding (cohort_id, member_set,
  bounded asyncio.Queue).
- `analytics/events.py` — after every successful `process_session`,
  calls `publish_user_recomputed(user_id)` to wake any subscriber
  whose member set contains that user.
- SSE handler in `routes.py` swaps `asyncio.sleep(5)` for
  `await queue.get()` with a 25s heartbeat fallback. Member-set is
  refreshed every 60s so cohort_members add/remove changes propagate
  without forcing the educator to reload.
- Slow-consumer protection: queue capped at 8; oversubscription drops
  the tick (next tick rebuilds the full snapshot).
- **8 new tests** for the fan-out helpers.

### S13-B — Tenant-invite claim audit + funnel — DONE

- Migration `005_cohort_invite_claims` (institution_schema) — append-only,
  FK CASCADE to cohort_invites.
- Repos `insert_invite_claim`, `list_invite_claims`. The claim flow now
  inserts an audit row on every successful redemption (idempotent
  cohort_members PK still de-dupes the membership; the audit captures
  the funnel signal).
- New endpoint `GET /institution/cohorts/invites/{id}/claims` — returns
  the audit list for the educator UI.
- Web-admin `TenantCohorts` invite table extended with a "view claims"
  expandable row that calls the new endpoint.
- **4 new tests**: append-on-claim, repeated-claim funnel, unknown-id
  empty-list, revoked-invite cascade-clears.

### S13-C — Educator student drill-down — DONE

- New `analytics/student_drill_down.py` — composes readiness +
  per-topic mastery + streak + last-10 quiz sessions (cross-DB read
  from quiz_schema via the existing `quiz_database_url` handle, same
  pattern as `backfill.py`).
- New endpoint `GET /analytics/cohorts/{cohort_id}/students/{user_id}`.
- Web-portal `pages/StudentDrillDown.tsx` + route. Cohort leaderboard
  rows are now clickable → drill-down page.
- **8 new tests** for the pure aggregator (zeroed empty cohort, ISO
  timestamp shaping, accuracy computation, ordering preservation).

### S13-D — Cohort summary stats — DONE

- New `analytics/cohort_summary.py` — pure aggregation over leaderboard
  rows. Returns `memberCount`, `startedCount`, `avgReadinessPct`,
  `completionPct`, `atRisk` (top-3 lowest-scoring started students
  under threshold).
- Endpoint `GET /analytics/cohorts/{id}/summary` — reuses
  `_build_leaderboard` so no new DB hits beyond the existing leaderboard
  query.
- Web-portal `CohortLeaderboard` renders 4 stat tiles above the table.
- **8 new tests** pinning the at-risk filter (≥3 topics + score < 0.4),
  cap-of-3, sort-by-score-asc.

## Test totals

| Surface | New tests | Status |
|---|---|---|
| Analytics realtime fan-out | 8 | green |
| Analytics student drill-down | 8 | green |
| Analytics cohort summary | 8 | green |
| Institution invite claims (audit + funnel) | 4 | green |
| **Total new** | **28** | |

Stack-wide totals after Sprint 13:
- Analytics: **+24** new (realtime + drill-down + summary)
- Institution: **23/23 invite tests** (was 19/19)
- Web-portal: **36/36** (unchanged — wizard + assignment + UI tests untouched)
- Web-admin: **14/14**

Pre-existing failures (NOT introduced this sprint):
- `analytics/tests/test_streaks.py` — 4 tests reference
  `analytics_schema.user_mastery` (the table is named `mastery`, not
  `user_mastery`). Broken since the table rename in an earlier sprint.
  Logged for Sprint 14.

## Out of scope (Sprint 14+)

- Assignment grading rubrics — bonus weights, partial credit
- RS256 + JWKS rotation
- Cohort-level export (CSV / PDF) for parent-teacher meetings
- Multi-cohort student view (single student in N cohorts)
- Pre-existing test_streaks.py rename fix

## Carry-overs to Sprint 14

1. **Assignment grading rubrics** — schema + grading helper extension
   + educator UI for setting weights.
2. **RS256 + JWKS rotation** — its own ops sprint with deploy + key
   rotation runbook.
3. **test_streaks.py user_mastery → mastery rename** — small fix,
   high signal value (suite goes back to clean).
4. **Cohort-level export** — CSV / PDF download from the leaderboard.
5. **Real-time push from Quiz directly** — currently the realtime fan-out
   triggers off Analytics's `process_session` callback; pushing from
   Quiz's own NATS subscriber would shave another ~50ms of latency.

## Sign-off

- [ ] Compose stack rebuilds green
- [ ] Smoke pass: open cohort leaderboard in browser → student submits
      assignment → leaderboard delta lands within ~1s (was 5s pre-S13-A);
      summary tiles update; click row → drill-down page shows recent
      sessions. Web-admin invites table → "view claims" expands with
      the audit list.
- [ ] CTO sign-off
