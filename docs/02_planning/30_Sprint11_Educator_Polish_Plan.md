# Sprint 11 — Educator UX Polish + B2B Onboarding

**Sprint window:** 2026-04-28 (single working session, Phase 2 sprint S0c)
**Theme:** Sprint 9+10 stood up the educator/cohort surfaces but the
self-service B2B onboarding is still a UUID-wrangling ordeal. This sprint
makes the paths that exist actually pleasant: cohort invites by signed
link, real question pickers, per-question explanations on the result page,
and the small carry-over fixes (notification mute, the pre-existing
`/questions/new` test).

## Backlog

### S11-A — Cohort invite link flow

- **A-1** Migration: `institution_schema.cohort_invites` (id, cohort_id,
  token, expires_at, max_uses, uses, created_by). Token is short
  HMAC-signed (HS256 with the institution `JWT_SECRET`).
- **A-2** Repos + `POST /institution/cohorts/{id}/invites` (educator
  generates), `POST /institution/cohorts/invites/{token}/claim` (student
  joins).
- **A-3** Student-facing `/join/{token}` route on web-student that
  prompts to confirm + auto-redirects to `/assignments` after claim.
- **A-4** Mobile mirror (deep-link path stub).

### S11-B — Question picker UI

Replace the wizard's Step 2 paste-UUIDs textarea with a real picker.

- **B-1** Wizard pulls educator's PUBLISHED questions via
  `GET /content/questions?status=PUBLISHED&scope=mine`, filterable by
  exam → subject → topic. Educator ticks checkboxes; the wizard's
  `questionIds` updates in place.

### S11-C — Per-question explanations on submit result

After Sprint 10's submit returns the grading breakdown, the result panel
surfaces just CORRECT/WRONG. Educators write `explanation` text on
questions today; students should see it inline on misses.

- **C-1** Backend: `submit` response now includes `stem` and
  `explanation` per breakdown entry (the educator's teaching note).
- **C-2** Web + mobile result panels render the explanation under each
  WRONG row.

### S11-D — assignment.new mute

The Sprint 7 notification prefs cover 7 inbox types. Sprint 9 added an
8th (`assignment.new`) but didn't wire the mute toggle.

- **D-1** Add `assignment.new` to the user-profile prefs schema
  defaults; surface it in web-student + mobile preferences screens.

### S11-E — Pre-existing test fix

- **E-1** Web-portal `/questions/new` test assertion. The page lost the
  "Topic ID" label when it switched to a cascading dropdown in PR
  906f530. Update the test to look for the new picker shape.

### S11-F — Educator dashboard landing

- **F-1** Web-portal dashboard hero gets a tenant + cohort summary
  block (current tenant, N cohorts, recent assignments) so the educator
  doesn't have to type tenant UUIDs every time they log in.

## Out of scope (Sprint 12+)

- Real Quiz session integration (assignments still render answers
  inline — the Sprint-10 grading flow is good enough; merging with the
  IRT FSM doesn't apply to fixed item sets)
- Real-time leaderboard streaming (SSE / NATS)
- Assignment grading rubrics (still boolean correct + accuracy)
- RS256 + JWKS rotation
- Mobile educator-side surface (educators are web-portal-first)

## Test targets

| Surface | Floor |
|---|---|
| Cohort invite repos + endpoints + signed-token helper | 8+ |
| Question picker filter/selection helpers | 4+ |
| Submit-result explanation contract | 2+ |
| Notification mute additions | 1+ |
| Web-portal `/questions/new` test fix | 0 (1 unblocked) |
| **Total floor** | **15+** |
