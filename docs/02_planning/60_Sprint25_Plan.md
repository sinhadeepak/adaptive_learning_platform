# Sprint 25 — P4-S25: Mock series view + OMR-style answer sheet

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Close the exam-mode loop on the student side: a Mocks page listing available + taken mocks with per-attempt summaries, and an OMR-style question palette inside the existing exam-mode player.

## Why this sprint

S23 shipped real exam blueprints + the exam-mode player shell. S24 made PYQ first-class. S25 closes what an exam-prep aspirant expects between mocks: a series view that shows what's available, what's been taken, with predicted-rank + per-section summary, and an OMR-style answer sheet inside the player so the UX matches what students see on test day.

[ADR-0012](../adr/0012-exam-blueprint-pyq-schema.md) (blueprints) and [ADR-0013](../adr/0013-time-per-question-analytics.md) (per-section time) underpin this sprint; both are already accepted in proposed state.

## Backlog

### S25-A — Quiz Go: list mock-mode sessions for a user

The existing `GET /quiz/sessions?userId=…` returns *every* session newest-first. Extend it with:

- `?mode=MOCK_BLUEPRINT` filter — narrows to blueprint-driven mocks.
- `blueprint_id` added to the `SessionListRow` shape so the client can join with the blueprint catalogue without a fan-out.

Backward-compatible: existing callers without `?mode=` see the historical union.

### S25-B — Web-student `Mocks.tsx`

New page listing available + taken mocks for the focus exam:

- **Available** tab: every blueprint for the chosen exam (`GET /catalog/exam-blueprints?examId=X`). Each card shows name, total Q, total minutes, marking scheme, "Start" CTA → `/mock-exam?blueprintId=…`.
- **Taken** tab: user's MOCK_BLUEPRINT sessions newest-first (`GET /quiz/sessions?userId=X&mode=MOCK_BLUEPRINT`). Each row shows blueprint name, attempt date, score, "View result" CTA → existing `/quiz/:sessionId/result`. When the session has per-section breakdown (S22), also surface the weakest section by accuracy.
- Pure helper `apps/web-student/src/lib/mock_series.ts::summariseAttempt(session, breakdown?)` for the row math (overall accuracy, weakest-section calculation). Unit-tested.

Routes wired:
- `/mocks` — series view.
- `/mock-exam?blueprintId=…` — already from S23.

### S25-C — MockExam.tsx: OMR-style question palette

Extend the exam-mode player with a fixed right-side question palette:

- Grid of question numbers (1..N), one cell per item.
- Per-cell colour coding:
  - **grey**: unanswered, not visited.
  - **amber**: marked-for-review (answered or not).
  - **green**: answered, not marked.
  - **blue ring**: current question (overlay on whatever base state).
- Click any cell → `gotoIdx(idx)` (existing helper).
- A small per-section count strip above the grid showing "Physics 7/25 · Chemistry 4/25 · Maths 0/25".

Pure helper `apps/web-student/src/lib/mock_palette.ts::computePaletteState(items, answers, marked)` returns one entry per item with the colour state. Unit-tested.

The palette only renders for MOCK_BLUEPRINT sessions (which is what MockExam.tsx already drives). Practice + assignment players keep their existing simpler UX.

### S25-D — Tests

| File | Tests | Type |
|---|---|---|
| `services/quiz/internal/store/store_mock_filter_test.go` | 2 | Go unit (mode filter happy path + back-compat) |
| `services/quiz/internal/server/list_sessions_test.go` | 2 | Go handler (?mode= forwarded; blueprint_id surfaced) |
| `apps/web-student/src/lib/mock_series.test.ts` | 4 | Vitest (summary math) |
| `apps/web-student/src/lib/mock_palette.test.ts` | 5 | Vitest (palette state machine) |

### S25-E — Smoke extension

1 new assertion:
- `GET /quiz/sessions?userId=<student>&mode=MOCK_BLUEPRINT` returns shape `{items: [...]}` (zero rows is acceptable on a fresh stack — the from-blueprint smoke step in S23 already accepts 422 short-paper).

Smoke target: **57 steps**.

### S25-F — Closure + master phase index

`docs/02_planning/61_Sprint25_Closure.md`. Master phase index updated with S25 row; Phase 4 row stays DRAFT.

## Out of scope

These remain on the Phase 4 plan but defer past S25:

- **Server-side section locks + 5-minute disconnect recovery** — needs a heartbeat endpoint + session-state persistence beyond what `quiz_session_items` already gives us. Defers to S30 stabilisation slot.
- **Admin blueprint editor + PYQ tagger admin UI** — S33 admin polish or post-cutover.
- **Date-gated "scheduled mocks"** (release-on-2026-12-01-style) — defers to S33.
- **5 seeded full-length JEE Main mocks blending PYQ + AI-authored questions** — content workstream W1; engineering ships the surface, content fills.
- **Mobile parity for the new surfaces** — S35.
- **Mock series stats dashboard (trajectory, last-N AIR trend chart)** — S31/S33 once cohort calibration improves.

## Definition of done

- Quiz Go `ListSessions` accepts `?mode=` and returns `blueprint_id` on the row.
- Mocks.tsx renders Available + Taken tabs end-to-end.
- MockExam.tsx renders an OMR-style palette + section-count strip.
- `mock_series.ts` and `mock_palette.ts` pure helpers unit-tested.
- 9 new tests green (4 Go + 5 TS palette + 4 TS series — note: 5+4=9, total = 13).
- `make smoke` 57/57.
- Sprint 25 closure doc + master phase index updated.
