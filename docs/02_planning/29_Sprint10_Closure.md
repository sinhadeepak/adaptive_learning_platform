# Sprint 10 Closure — Educator Authoring Surface + Quiz↔Assignment Integration

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/28_Sprint10_Educator_Surface_Plan.md](28_Sprint10_Educator_Surface_Plan.md)

## Scope delivered

### S10-A Catalog test fixture — DONE

- Content `tests/conftest.py` now monkey-patches `catalog_client.authorize_topic`
  to always-allow (the catalog hop is exercised in catalog's own tests).
- The 7 previously-failing `test_routes.py` tests are now green.
- **Content suite: 30/30 green** (was 23/30, broken since PR 906f530).

### S10-B Web-portal Assignment Authoring — DONE

- `lib/assignment_wizard.ts` — pure 3-step state machine
  (`validateStep`, `nextStep`, `prevStep`, `toggleQuestion`, `dueAtToIso`).
  **15 unit tests.**
- `pages/Assignments.tsx` rewritten — replaces the Phase-Two stub with
  cohort-filtered listing + "New Assignment" CTA.
- `pages/AssignmentNew.tsx` — wizard wrapper, gated to TEACHER+ via
  `RoleGate(canAuthor)`.
- `pages/AssignmentDetail.tsx` — educator-side detail with the
  per-assignment leaderboard table (consumes Sprint 9 L-1 endpoint).

### S10-C Web-admin Institution Core UI — DONE

- `lib/api.ts` extended with typed `tenants` + `cohorts` clients.
- `pages/Tenants.tsx` rewritten — replaces Phase-Two stub with lookup-by-id
  + create-tenant form (slug auto-derives from name; kind enum; seat limit).
- `pages/TenantCohorts.tsx` — cohort sidebar + member table per cohort,
  with create-cohort + add/remove member forms.
- New routes `/institutions` + `/institutions/:tenantId/cohorts`.
- 14 web-admin tests still green.

### S10-D Quiz ↔ Assignment integration — DONE

Replaces the type-the-score-yourself UX from Sprint 9 with a
server-graded flow:

- Backend: `GET /content/assignments/{id}/questions` now returns `choices`
  (NOT `correct_idx`); `POST /content/assignments/{id}/submit` takes
  `{answers: {questionId: choiceIdx}}`, grades via the new pure
  `grade_answers()` function, and upserts `assignment_progress` in one
  round-trip. Returns the per-question breakdown.
- Web-student `pages/AssignmentDetail.tsx` rebuilt around inline answer
  radios + a Submit button; result panel shows CORRECT/WRONG per item.
- Mobile `screens/assignment_detail_screen.dart` mirror — radios for
  every question, server-graded submit, breakdown ListTile.
- **Content tests: +4 for grade_answers + submit endpoint** (tests now 18 total).
- **Mobile suite still 114/114 green** after the screen rebuild.

### S10-E Cohort leaderboard UI — DONE

- Web-portal `pages/CohortLeaderboard.tsx` — consumes the L-1 analytics
  endpoint added in Sprint 9. Pure presentation: rank, student id,
  readiness %, topics covered, last update. Inactive rows
  (`started: false`) get a dimmed style.
- Route `/cohorts/:cohortId/leaderboard`.

## Test totals

| Surface | New tests | Status |
|---|---|---|
| Content assignments (S10-D submit) | 4 | green |
| Content suite (S10-A unblocked) | 7 unblocked | green (30/30) |
| Web-portal wizard helpers | 15 | green |
| **Total new** | **19** | |

Suite totals after Sprint 10:
- Content: **30/30** (S10-A unblocked the 7 previously failing)
- Web-student: **47/47** (App.test + billing + assignments libs)
- Web-portal: **25/26** (1 pre-existing `/questions/new` test failure
  unrelated to Sprint 10 — Topic ID label removed in PR 906f530)
- Web-admin: **14/14**
- Mobile: **114/114**

## Out of scope (deferred to Sprint 11+)

- **Real Quiz session integration** — assignments still render answers
  inline rather than routing into the Quiz service's session FSM. The
  current UX delivers the value (server-graded score) without the
  Quiz-side rewrite.
- **Question picker UI** — the wizard's Step 2 takes pasted UUIDs
  rather than a filterable picker. Sprint 11 backlog item.
- **Web-portal `/questions/new` test** — pre-existing failure when the
  authoring page swapped to a cascading dropdown.
- **Cohort invite link flow** (Sprint 11)
- **Real-time leaderboard streaming** (Sprint 11+)

## Sign-off

- [ ] Compose stack rebuilds green
- [ ] Smoke pass: educator picks cohort → wizard → publish → student
      sees inbox notification → opens detail → answers radios → submit →
      educator opens leaderboard → sees the row
- [ ] CTO sign-off
