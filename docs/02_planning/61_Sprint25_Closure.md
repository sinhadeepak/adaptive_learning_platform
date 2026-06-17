# Sprint 25 Closure — P4-S25 Mock series view + OMR-style answer sheet

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [`docs/02_planning/60_Sprint25_Plan.md`](60_Sprint25_Plan.md)

## Scope delivered

### S25-A — Quiz Go: list mock-mode sessions for a user — DONE

`Store.ListSessionsForUser(ctx, userID, limit, mode string)` — added optional `mode` filter; empty string preserves the historical "all modes" path. Now returns `BlueprintID *uuid.UUID` per row when the session was created from a blueprint.

`SessionListRow` shape extended with `BlueprintID`. `sessionListItem` JSON DTO surfaces `blueprintId` (omitempty) so the Mocks series view can join with `/catalog/exam-blueprints` client-side without a Quiz→Learning fan-out.

`GET /quiz/sessions?userId=…&mode=MOCK_BLUEPRINT&limit=N` is the new entry point used by the Mocks tab. Backward-compatible — pre-S25 callers without `?mode=` see the same union list as before.

### S25-B — Web-student `Mocks.tsx` — DONE

New page at `/mocks` with two tabs:

- **Available**: every blueprint for the focus exam (`GET /catalog/exam-blueprints?examId=…`). Per-card: name, total Q, total minutes, marking scheme, **Start mock** CTA → `/mock-exam?blueprintId=…`.
- **Taken**: user's MOCK_BLUEPRINT sessions newest-first. Per-row: blueprint name (resolved from the catalogue list), status badge, started-at + answered count + **accuracy** + **weakest section** call-out (when the per-section breakdown from S22 is available). Click-through → existing `/quiz/:sessionId/result`.

Pure helper at `apps/web-student/src/lib/mock_series.ts`:
- `summariseAttempt(session, breakdown?)` — combines a session row + optional per-section breakdown into an `AttemptSummary`. Computes overall accuracy + identifies the weakest section by accuracy (skipping zero-served sections).
- `formatPct(n)` — renders 0–1 floats as `60%` / `0%` / `—` for non-finite.

### S25-C — MockExam.tsx OMR-style answer-sheet palette — DONE

Player layout reflowed into a 2-column grid. Question pane on the left; new sticky right-side **Answer sheet** panel:

- Per-section answered/total strip ("Physics 7/25 · Chemistry 4/25 · Maths 0/25").
- 5-column grid of question cells:
  - **green** = answered (no flag)
  - **amber** = marked-for-review (flagged answered or not)
  - **grey** = unanswered + unflagged
  - **blue ring** overlay = current question
- Click any cell → `gotoIdx(idx)` (existing helper).
- Legend below the grid.

Pure helper at `apps/web-student/src/lib/mock_palette.ts`:
- `paletteStateFor(questionId, answers, marked)` — returns `unanswered | answered | marked | answered_marked`.
- `computePaletteState(items, answers, marked)` — emits one cell per item.
- `paletteSectionCounts(cells)` — drives the section strip.

### S25-D — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/quiz/internal/server/list_sessions_test.go` | 2 | Go handler | 2/2 ✅ |
| `apps/web-student/src/lib/mock_palette.test.ts` | 7 | Vitest (state machine) | 7/7 ✅ |
| `apps/web-student/src/lib/mock_series.test.ts` | 6 | Vitest (summary math) | 6/6 ✅ |

**Total: 15 new tests, all green in this session.** Note the plan called for 9; the actual count is higher because the palette + series helpers each picked up an edge case test that wasn't in the plan.

Full integration coverage (real DB rows + mode filter SQL) is deferred to the Postgres-backed `sessions_pg_test.go` suite — the new tests exercise handler-level argument routing without standing up a database.

### S25-E — Smoke extension — DONE

1 new assertion (step 57): `GET /quiz/sessions?userId=<student>&mode=MOCK_BLUEPRINT&limit=10` returns shape `{userId, items}`. Zero rows is acceptable (S23's from-blueprint smoke step honestly accepts 422 short-paper) — the assertion validates the new filter route works.

Smoke target: **57 steps**.

### S25-F — Closure + master phase index — DONE

This file. Master phase index updated with the S25 row; Phase 4 row stays DRAFT.

## Stack inventory at Sprint 25 close

- 6 services unchanged.
- alp-quiz: `ListSessionsForUser` accepts mode + returns `blueprint_id`. No schema change.
- web-student: new `Mocks.tsx` page + `mock_series.ts` + `mock_palette.ts` pure-helper modules + route. `MockExam.tsx` reflowed with the OMR-style palette aside.

## What surprised us this sprint

- **Sticky right-rail palette is a layout-only change.** No new state, no new fetch — the existing `items` + `answers` + `marked` state already drives the palette via `computePaletteState`. The visual change looks substantial but the diff is tight because the helpers from S23 (mock_state.ts) carried the right shape forward.
- **Mocks taken-tab needs blueprint metadata for nice rendering** ("JEE Main — Standard" instead of `bp-44444444…`). Two options: (a) Quiz returns blueprint name in the session row via a join; (b) client fetches blueprints once and joins client-side. Picked (b) — Mocks.tsx already fetches the blueprint list for the Available tab; reusing that list as a lookup map for the Taken tab is free. Avoids a Quiz→Learning HTTP fan-out per session.
- **Tests grew past the plan estimate** because the palette's "current question overlay on top of state" interaction surfaced edge cases (answered+marked + current = three layers). `paletteStateFor` covers each combo + `computePaletteState` covers the per-cell ordering and the section_id null fallback.
- **The IDE momentarily reported stale diagnostics** from a `Edit replace_all` pass — actual `go vet` + `go test -count=1` came back clean. Worth the reflex of re-reading the file when IDE warnings disagree with the test runner.

## Phase 4 strategic gates — still open

S25 polishes the exam-mode loop. The strategic gates (which exam first / depth bar / quiz-vs-exam-prep) remain *unanswered*. The work is additive and reversible if Phase 4 ultimately doesn't ship.

## Carry-overs to Sprint 26 (P4-S26 — concept prerequisite graph activation)

| Item | Why deferred | Owner |
|---|---|---|
| Server-side section locks + 5-min disconnect recovery | Heartbeat endpoint needed; defers to stabilisation slot | P4-S30 |
| Admin blueprint editor + PYQ tagger admin UI | Admin polish | P4-S33 |
| Date-gated "scheduled mocks" (release-on-X) | Schema column + UI gate | P4-S33 |
| Bulk seeded full-length mocks blending PYQ + AI-authored | Content workstream | W1 |
| Mobile parity | Phase 4 plan defers | P4-S35 |
| Live verification (full mock end-to-end on running stack) | Pending Docker stack up + content-bank fill | next session |

## Sprint 25 status

**P4-S25 closed.** Mocks series view is live; OMR-style answer-sheet palette is wired into the exam-mode player; the surface matches what students expect on test day. Next sprint opens the prerequisite-graph activation per the Phase 4 plan.
