# Sprint 12 Closure — Realtime + Invite Revocation + Mobile Onboarding

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/32_Sprint12_Realtime_Plan.md](32_Sprint12_Realtime_Plan.md)

## Scope delivered

### S12-A — Tenant invite revocation — DONE

- Repos: `list_invites_for_cohort`, `delete_invite`, plus the pure
  `redact_invite_token()` helper that surfaces only the last 4 chars of
  the random head — never the HMAC tail. A list-payload leak then can't
  be replayed against the claim endpoint.
- Routes: `GET /institution/cohorts/{id}/invites` and
  `DELETE /institution/cohorts/invites/{id}`.
- Web-admin `pages/TenantCohorts.tsx` extended with an Invites section:
  generate-link form, redacted invite table, copy-to-clipboard for the
  freshly minted secret, revoke button.
- **4 new tests** (token redaction + delete flow + 404 path + the pure helper).

### S12-B — Real-time cohort leaderboard via SSE — DONE

- New `GET /analytics/cohorts/{id}/leaderboard/stream` (text/event-stream).
  Initial frame is `event: snapshot`; subsequent `event: delta` frames
  fire when the digest changes (~5s poll). `: keepalive` every 25s so
  proxies don't idle the connection out.
- Pure `_leaderboard_digest()` helper — SHA256 over (userId, rank,
  score, nTopics) tuples. Educator UI re-renders only on real changes.
- Web-portal `pages/CohortLeaderboard.tsx` rebuilt around `EventSource`
  with snapshot fallback through the existing GET (covers proxies that
  strip text/event-stream).
- **6 new tests** for the digest contract.

Why poll-based not push-based: the Sprint 9 L-1 endpoint already
returns a deterministic snapshot; a content-hash diff catches all real
changes without in-process pub/sub plumbing. Sprint 13+ can swap in a
NATS-driven pusher if 5s lag isn't tight enough.

### S12-C — Mobile JoinCohort + deep-link parser — DONE

- `auth/deep_link.dart` extended with `DeepLinkRouteKind.joinCohort`.
  Accepted shapes: `https://<host>/join/<token>`, `http://...`, and
  `alp://join/<token>` (custom scheme for dev builds without
  universal-link app-association).
- `screens/join_cohort_screen.dart` — confirm → claim → success state
  machine; mirrors the web `/join/:token` page.
- **6 new deep-link parser tests** (HTTPS, HTTP, custom scheme,
  case-insensitive path, empty-token rejection, non-collision with /reset).

### S12-D — Quiz `ASSIGNMENT` mode foundation — DONE (foundation only)

Full Quiz↔Content bridge (Quiz fetches Content's question list at
session creation, Content's submit subscriber maps sessionId →
assignmentId) is a Sprint 13 sized job. For Sprint 12 we shipped the
foundation:

- `domain.Mode` gets `ModeAssignment = "ASSIGNMENT"`. Same FSM as
  PRACTICE for the play loop; the difference is at create + submit
  time, both deferred.
- `SessionService.Start` validator now accepts ASSIGNMENT mode without
  triggering the MOCK tier-gate.
- 1 constant-value test pinning the enum so Sprint 13's cross-service
  contract doesn't silently drift.

The cross-service plumbing (Quiz `POST /sessions/from-assignment`
endpoint, Content's quiz.session.completed assignment-mapper consumer)
is **explicitly carried into Sprint 13**.

## Test totals

| Surface | New tests | Status |
|---|---|---|
| Institution invites (list/revoke + redact helper) | 4 | green |
| Analytics SSE digest | 6 | green |
| Mobile deep-link parser (join paths) | 6 | green |
| Quiz Go ASSIGNMENT mode (constant) | 1 | green |
| **Total new** | **17** | |

Stack-wide totals after Sprint 12:
- Institution: **36/36** (was 32/32)
- Analytics: **+6** new SSE digest tests
- Mobile: **120/120** (was 114/114)
- Quiz Go: still green; no regressions
- Web-admin / web-portal / web-student / Content: unchanged

## Carry-overs to Sprint 13

1. **Real Quiz↔Content bridge** (the bulk of S12-D-as-originally-scoped):
   - Quiz `POST /sessions/from-assignment` that calls Content over HTTP
     to fetch the pinned question list and creates an ASSIGNMENT session.
   - Content NATS subscriber on `quiz.session.completed` filtering for
     `mode=ASSIGNMENT`, mapping sessionId → assignmentId, calling
     `upsert_progress`.
   - Web + mobile UX swap: AssignmentDetail "Submit" button replaced
     with "Start as Quiz" → routes to `/quiz/{sessionId}` (web) or
     mobile's quiz player.
2. **NATS-driven leaderboard push** (replace the 5s poll with
   `quiz.session.completed` subscription).
3. **Assignment grading rubrics** (bonus weights, partial credit).
4. **RS256 + JWKS rotation** (its own ops sprint).
5. **Tenant invite analytics** (claim funnel, time-to-first-claim).

## Sign-off

- [ ] Compose stack rebuilds green
- [ ] Smoke pass: educator generates invite from web-admin → revoke →
      old link 410s on claim. Open leaderboard in browser → student
      submits assignment → leaderboard shows row within 5s without page
      reload. Mobile deep-link `https://<host>/join/<token>` → redeems.
- [ ] CTO sign-off
