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

### S12-D — Quiz `ASSIGNMENT` mode end-to-end — DONE

Originally scoped as foundation-only with the cross-service bridge
deferred to Sprint 13; we closed it fully in this sprint.

- **Quiz Go**:
  - Migration `006_assignment_session.up.sql` — nullable
    `assignment_id` UUID column + extended `chk_mode` to allow
    ASSIGNMENT.
  - `domain.Mode` gets `ModeAssignment`; `domain.Session` carries
    `AssignmentID *uuid.UUID`.
  - `store.CreateSession` + `GetSession` propagate the column.
  - New `internal/content/client.go` HTTP client.
    `FetchAssignmentQuestions` forwards the inbound bearer so
    Content's role + visibility checks run unchanged.
  - New endpoint `POST /quiz/sessions/from-assignment` —
    `SessionService.StartFromAssignment`. Calls Content, creates the
    ASSIGNMENT session, and pre-serves the educator's exact ordering
    via `ServeQuestion` so existing `/next` walks the pinned list.
  - Submit handler embeds `assignment_id` in the `quiz.session.completed`
    NATS payload when present.
- **Content**:
  - New `quiz_session_subscriber.py` durable JetStream consumer on
    `quiz.session.completed`. Filters `mode == ASSIGNMENT`, calls
    `upsert_progress`. Idempotent on redelivery (UNIQUE
    `(assignment_id, user_id)` PK with last-write-wins).
  - 7 handler tests (PRACTICE/MOCK ignored, ASSIGNMENT writes,
    replay LWW, missing-fields skipped, lowercase-mode normalised).
- **Frontend**:
  - Web-student `lib/assignments.ts::startAssignmentQuiz()` + a
    `▶ Start as Quiz` CTA on `AssignmentDetail` → `/quiz/{sessionId}`.
    Inline-radio submit path retained as a fallback.
  - Mobile `AssignmentsClient.startAsQuiz()` + matching CTA on
    `AssignmentDetailScreen` that pushes the existing `QuizScreen`.

End-to-end story: educator publishes → student taps **▶ Start as Quiz**
→ Quiz session FSM runs (existing `/next` / `/answer` / `/submit` flow
with bookmarks, feedback, IRT-skipping all reused) → on submit Quiz
publishes to NATS → Content's subscriber upserts `assignment_progress`
→ educator's leaderboard updates within ~5s via the S12-B SSE stream.

## Test totals

| Surface | New tests | Status |
|---|---|---|
| Institution invites (list/revoke + redact helper) | 4 | green |
| Analytics SSE digest | 6 | green |
| Mobile deep-link parser (join paths) | 6 | green |
| Quiz Go ASSIGNMENT mode constant | 1 | green |
| Content quiz.session.completed subscriber | 7 | green |
| **Total new** | **24** | |

Stack-wide totals after Sprint 12:
- Institution: **36/36** (was 32/32)
- Analytics: **+6** new SSE digest tests
- Mobile: **120/120** (was 114/114)
- Content: **43/43** (was 30/30 — +7 subscriber + +6 from migration housekeeping)
- Quiz Go: still green; no regressions
- Web-admin / web-portal / web-student: unchanged

## Carry-overs to Sprint 13

1. **NATS-driven leaderboard push** — replace the 5s SSE poll with a
   subscriber that watches `quiz.session.completed` and pushes deltas
   only when the affected user is in the cohort the SSE client opened.
2. **Assignment grading rubrics** — bonus weights, partial credit,
   rubric-based scoring rather than the current correct/total ratio.
3. **RS256 + JWKS rotation** — its own ops sprint with deploy + key
   rotation runbook.
4. **Tenant-invite analytics** — claim funnel, time-to-first-claim per
   invite, conversion dashboard for the educator.
5. **Educator analytics drill-down** — per-student report inside a cohort.

(The original Sprint 13 carry-over of Quiz↔Content bridge was closed in
this sprint; see S12-D above. Web + mobile UX swap is also done.)

<!-- Note: the originally-scoped Sprint 13 carry-over of "Real
Quiz↔Content bridge" was closed in this sprint — see S12-D end-to-end
above. The list above is what's now actually open for Sprint 13. -->

## Sign-off

- [ ] Compose stack rebuilds green
- [ ] Smoke pass: educator generates invite from web-admin → revoke →
      old link 410s on claim. Open leaderboard in browser → student
      submits assignment → leaderboard shows row within 5s without page
      reload. Mobile deep-link `https://<host>/join/<token>` → redeems.
- [ ] CTO sign-off
