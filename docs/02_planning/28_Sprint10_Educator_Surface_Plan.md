# Sprint 10 — Educator Authoring Surface + Quiz↔Assignment Integration

**Sprint window:** 2026-04-28 (single working session, Phase 2 sprint S0b)
**Theme:** Close the Sprint 9 backend loop with educator-side UIs. The
pieces that exist as APIs but had no surface (paying-tenant admin tools,
assignment authoring wizard) get rendered. Plus close the
type-the-score-yourself UX gap by hooking Assignments into the Quiz
session flow.

## Backlog

### S10-A — Catalog test fixture (close pre-existing test debt)

- **A-1** `make seed-test-catalog` — idempotent script that pre-seeds
  catalog with one known exam + subject + topic and a matching
  educator_assignment row. The 7 content `test_routes.py` tests that
  hard-code random topic UUIDs need a known-good topic to authorize
  against. Broken since PR 906f530.

### S10-B — Web-portal Assignment Authoring wizard

- **B-1** `/assignments` route (educator listing + create CTA)
- **B-2** `/assignments/new` wizard:
  - Step 1: pick cohort (from `/institution/tenants/{t}/cohorts`)
  - Step 2: pick questions (filter from `/content/questions` by topic)
  - Step 3: title, description, due date, review + Publish
- **B-3** `/assignments/{id}` educator detail with Leaderboard tab
  (consumes `GET /content/assignments/{id}/leaderboard`)
- Pure-logic helpers + tests for the wizard step machine.

### S10-C — Web-admin Institution Core UI

- **C-1** `/institution/tenants` list page (consumes Sprint 8 endpoints)
- **C-2** `/institution/tenants/new` create form
- **C-3** `/institution/tenants/{id}` detail with Cohorts tab + Members
  drill-down.

### S10-D — Quiz ↔ Assignment integration

- **D-1** Web-student `AssignmentDetail` "Start questions" CTA — passes
  the assignment's question list into a Quiz session and routes back
  to a result page that auto-calls
  `POST /content/assignments/{id}/progress`.
- **D-2** Mobile mirror.

### S10-E — Cohort leaderboard surface

- **E-1** Web-portal: cohort detail page surfaces the L-1 leaderboard
  rows the analytics service already returns. No new endpoint — purely UI.

### Documentation

- **F-1** Sprint 10 closure + master index + memory.

## Out of scope (pushed to Sprint 11+)

- Real-time leaderboard (SSE / NATS streaming)
- Cohort invite link flow
- Assignment grading rubrics (still boolean correct + accuracy)
- RS256 + JWKS rotation
- Mobile educator-side surface (educators are web-portal-first)

## Test targets

| Surface | Floor |
|---|---|
| Catalog seed fixture (idempotency, content tests unblocked) | 7+ now-passing |
| Web-portal Assignment authoring helpers | 6+ |
| Web-portal Institution helpers | 4+ |
| Quiz ↔ Assignment progress contract | 4+ |
| **Total floor** | **20+** |
