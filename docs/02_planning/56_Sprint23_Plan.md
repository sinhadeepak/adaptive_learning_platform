# Sprint 23 — P4-S23: real exam blueprints + exam-mode UI shell

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Replace the 20-Q stub `MOCK_BLUEPRINTS` with real JEE Main + JEE Advanced exam patterns; ship the exam-mode UI shell (per-section timer + section navigation strip + marked-for-review queue).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md), Sprint 23 turns the platform's "mock test" surface from a 20-Q practice quiz into a real-pattern exam simulator. The structural foundation (time-per-question, section_id column, NATS payload extension) shipped in S22 — S23 adds the blueprint that drives section composition.

[ADR-0012](../adr/0012-exam-blueprint-pyq-schema.md) is the gating ADR.

**Honest content gate**: the seeded question bank can't fill a real 75-Q JEE Main paper today. The orchestrator handles content shortage gracefully (composes what's available, flags short). Bulk content load is a parallel workstream W1.

## Backlog

### S23-A — Catalog migration 009: exam_blueprints

`catalog_schema` adds `exam_blueprints` per ADR-0012:

```sql
CREATE TABLE catalog_schema.exam_blueprints (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES catalog_schema.exams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  total_minutes INTEGER NOT NULL,
  marks_correct INTEGER NOT NULL,
  marks_negative REAL NOT NULL DEFAULT 0,
  sections JSONB NOT NULL,
  inter_section_navigation BOOLEAN NOT NULL DEFAULT TRUE,
  per_section_time_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Inline seed for **JEE Main Standard** (75 Q / 180 min / 3 sections), **JEE Advanced Paper 1** (54 Q / 180 min / 3 sections), **JEE Advanced Paper 2** (54 Q / 180 min / 3 sections). Section names match catalog subjects so the composer can resolve subject_id by name.

### S23-B — alp-learning blueprints module

New `services/learning/src/learning/exam_blueprints/`:

- `repositories.py` — `list_for_exam`, `get_by_id`, `insert`, `update`, `delete` (admin paths land in S25; reads ship now).
- `composer.py` — pure function `compose_paper(blueprint, candidate_pool_per_section) -> ComposedPaper`. Returns ordered `[{section_id, position, question_id}]`. Honestly returns "short" papers when pool is insufficient.
- `routes.py` — 3 GET endpoints today; admin POST/PATCH/DELETE deferred to S25.

Routes mounted on alp-learning:
- `GET /catalog/exam-blueprints?examId=X` — list blueprints for an exam.
- `GET /catalog/exam-blueprints/{id}` — single blueprint detail.
- `POST /catalog/exam-blueprints/{id}/compose?userId=Y` — compose a paper (returns ordered question list with section_id per question).

### S23-C — Quiz Go migration 008

`quiz_schema` rev **008**:
- Extend `quiz_sessions.mode` CHECK to allow `'MOCK_BLUEPRINT'`.
- Add `quiz_sessions.blueprint_id UUID NULL` for traceability.

### S23-D — Quiz Go StartFromBlueprint

Mirrors the Sprint 12 `StartFromAssignment` pattern.

- New domain mode `domain.ModeMockBlueprint`.
- New HTTP client `internal/learning/client.go` — `FetchComposedPaper(ctx, bearer, blueprintID, userID)` calls alp-learning's `/catalog/exam-blueprints/{id}/compose`.
- New endpoint `POST /quiz/sessions/from-blueprint` — pre-serves the composed paper via `ServeQuestionWithSection(sessionID, itemIdx, questionID, sectionID, servedAt)` (a section_id-aware sibling of the existing `ServeQuestion`).
- Returns standard session shape; client walks /next as before.

### S23-E — Web-student MockExam.tsx

New page `apps/web-student/src/pages/MockExam.tsx` — exam-mode shell:

- Hero — exam-instruction screen (read & accept).
- Section navigation strip — pills per section showing answered/marked/unanswered counts; click to jump (when blueprint allows inter-section navigation).
- Global timer + per-section timer (when blueprint enforces section locks).
- Marked-for-review queue with end-of-section review pass.
- Standard answer choice rows (OMR-style refinements ship in S25).
- "Submit" + "End section early" CTAs.
- Reads from `POST /quiz/sessions/from-blueprint` then walks `/quiz/sessions/{id}/next` like the existing player.

Pure helper `apps/web-student/src/lib/mock_state.ts::computeSectionTotals(items, answers, marked)` extracted for unit testing the section-strip math.

Routes wired:
- `/mock-exam?blueprintId=…` — exam-mode player.
- (mocks-series `/mocks` page lands in S25.)

### S23-F — Tests

| File | Tests | Type |
|---|---|---|
| `services/learning/tests/test_blueprints_composer.py` | 6 | Python unit (pure-function composer + handles short pool) |
| `services/learning/tests/test_blueprints_routes.py` | 3 | Python integration |
| `services/quiz/internal/server/blueprint_test.go` | 3 | Go unit (handler wiring; happy + missing blueprint + missing client) |
| `apps/web-student/src/lib/mock_state.test.ts` | 3 | Vitest (pure helper) |

### S23-G — Smoke extension

Add 2 assertions:
- `GET /catalog/exam-blueprints?examId=<JEE Main>` returns ≥1 blueprint.
- `POST /quiz/sessions/from-blueprint` for JEE Main blueprint creates a session with `mode == MOCK_BLUEPRINT` (or honestly returns 422 short-pool when the question bank can't fill the blueprint, per the content gate).

Smoke target: **54 steps**.

### S23-H — Closure + master index

`docs/02_planning/57_Sprint23_Closure.md`. Master phase index updated with S23 row.

## Out of scope

- **OMR-style answer sheet** — S25.
- **Section locks UI enforcement** — schema supports it; UI exposes the toggle but full lock-out logic with recovery behaviour lands in S25.
- **Dropped-connection recovery / heartbeat** — listed in plan but full server-side state-resume is its own surface; lands in S25.
- **Mocks series view** — S25.
- **Admin blueprint editor** — S25.
- **Content scaling to fill 75-Q JEE Main paper** — content workstream W1; engineering ships honest "short paper" handling.
- **PYQ-driven section composition** — needs PYQ corpus loaded; S24.

## Definition of done

- catalog migration 009 applied; 3 blueprints seeded (JEE Main + JEE Adv P1 + JEE Adv P2).
- 3 GET endpoints serve blueprints + compose-paper.
- Quiz Go migration 008 applied; MOCK_BLUEPRINT mode accepted.
- Quiz Go from-blueprint endpoint composes + pre-serves a session with section_id propagated.
- Web-student MockExam.tsx renders exam-mode shell end-to-end.
- 15 new tests green (6 Python unit + 3 Python integration + 3 Go + 3 TS).
- `make smoke` 54/54.
- Sprint 23 closure doc + master phase index updated.
