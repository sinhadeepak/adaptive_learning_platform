# Sprint 11 Closure — Educator UX Polish + B2B Onboarding

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/30_Sprint11_Educator_Polish_Plan.md](30_Sprint11_Educator_Polish_Plan.md)

## Scope delivered

### S11-A — Cohort invite link flow — DONE

- Migration `004_cohort_invites` (institution_schema) — token (UNIQUE),
  max_uses, uses, expires_at, FK to cohorts ON DELETE CASCADE.
- `invite_token.py` — pure HMAC-signed `<random>.<hmac>` token helper.
  Defense in depth: even with DB read access, an attacker can't forge
  signatures without the shared secret.
- `core_repo.py` — `create_invite`, `get_invite_by_token`,
  `increment_invite_uses` (atomic UPDATE … WHERE uses < max_uses).
- Routes: `POST /institution/cohorts/{id}/invites` (educator generates),
  `POST /institution/cohorts/invites/{token}/claim` (student joins).
  Returns 410 on bad signature / unknown token / expired / exhausted.
  Re-claim by the same student is no-op idempotent (cohort_members has
  a (cohort_id, user_id) PK).
- Web-student `pages/JoinCohort.tsx` + `/join/:token` route — student
  lander that auto-redirects to /assignments after a successful claim.
- **11 new tests.**

### S11-B — Question picker UI — DONE

- `lib/question_picker.ts` — pure helpers (`toggle`, `applyFilters`,
  `topicsInSet`, `setQuery`, `setTopic`).
- `pages/AssignmentNew.tsx` Step 2 rewritten — replaces the paste-UUIDs
  textarea with a real picker: search by stem, filter by topic, tick
  checkboxes. Keeps `wizard.questionIds` in sync with picker selection.
- **10 new tests** for the helpers.

### S11-C — Per-question explanations on submit result — DONE

- `assignments_repo.list_assignment_questions_with_keys` now returns
  `stem` + `explanation` alongside `correct_idx`.
- `grade_answers` extends the breakdown payload with `stem` (always)
  and `explanation` (only on misses — surfacing on correct answers
  dilutes the signal and rewards memorising explanations).
- Web `pages/AssignmentDetail.tsx` and mobile
  `screens/assignment_detail_screen.dart` result panels render
  `💡 <explanation>` under each WRONG row.
- **2 new tests** pinning the only-on-misses contract.

### S11-D — assignment.new mute — DONE

- Added `assignment.new` to the prefs catalog on web-student
  `pages/Settings.tsx` and mobile
  `screens/notification_preferences_screen.dart`. Reads the existing
  `notificationPrefs` JSONB on user-profile; the Notification consumer
  already honours the per-user mute via the
  `_is_type_muted` lookup added in Sprint 7.

### S11-E — Pre-existing test unblocked — DONE

- Web-portal `App.test.tsx::/questions/new` — replaced `Topic ID` text
  expectation with `Topic` (the cascading dropdown's label after the
  PR 906f530 rewrite). **Web-portal suite now 36/36 green.**

### S11-F — Educator dashboard landing — DONE

- `pages/Dashboard.tsx` — added a "Your cohorts" block. Educator pins
  a tenant ID once (persisted to localStorage); subsequent visits show
  one-click links to `/assignments?...` and `/cohorts/{id}/leaderboard`.
  Eliminates the type-the-tenant-UUID-every-time UX.

## Test totals

| Surface | New tests | Status |
|---|---|---|
| Institution invites (token + endpoints) | 11 | green |
| Content explanations | 2 | green |
| Web-portal question picker helpers | 10 | green |
| Web-portal `/questions/new` test (unblocked) | 1 unblocked | green |
| **Total new** | **23** | |

Full suite totals after Sprint 11:
- Content: **30/30**
- Institution: **32/32**
- Web-student: **47/47** (unchanged — JoinCohort lacks tests but the
  page is a thin wrapper around `api.post`; covered by integration smoke)
- Web-portal: **36/36** (was 25/26 — S11-E unblocked)
- Web-admin: **14/14**
- Mobile: **114/114**

## Out of scope (Sprint 12+)

- Real Quiz session integration (assignments still inline; scope/ROI
  tradeoff hasn't changed since Sprint 10)
- Mobile `JoinCohort` screen (deep-link path stub deferred — most
  invites are shared via Slack/WhatsApp web links anyway)
- Real-time leaderboard streaming (SSE / NATS)
- Assignment grading rubrics
- RS256 + JWKS rotation
- Tenant invite revocation UI (the API supports DELETE but the educator
  surface needs a list-invites endpoint first — Sprint 12)

## Sign-off

- [ ] Compose stack rebuilds green
- [ ] Smoke pass: educator generates invite → shares link → student
      opens in new browser → confirms join → sees published assignment
      → answers questions → result panel shows explanation under
      missed rows → educator sees row in cohort leaderboard
- [ ] CTO sign-off
