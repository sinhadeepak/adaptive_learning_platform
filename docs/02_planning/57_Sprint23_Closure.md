# Sprint 23 Closure — P4-S23 real exam blueprints + exam-mode UI shell

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [`docs/02_planning/56_Sprint23_Plan.md`](56_Sprint23_Plan.md)

## Scope delivered

### S23-A — Catalog migration 009 — DONE

`catalog_schema` adds `exam_blueprints` per [ADR-0012](../adr/0012-exam-blueprint-pyq-schema.md). Three blueprints seeded inline with deterministic UUIDs:

| ID suffix | Name | Questions | Minutes | Sections |
|---|---|---|---|---|
| `…0001` | JEE Main — Standard | 75 | 180 | 25 Phys + 25 Chem + 25 Math |
| `…0002` | JEE Advanced — Paper 1 | 54 | 180 | 18 + 18 + 18 |
| `…0003` | JEE Advanced — Paper 2 | 54 | 180 | 18 + 18 + 18 |

All with 1/4 negative marking, inter-section navigation enabled, per-section time locks **off** (matching the real exam patterns).

### S23-B — alp-learning blueprints module — DONE

New `services/learning/src/learning/exam_blueprints/`:
- `repositories.py` — `list_for_exam(examId)`, `get_by_id(blueprintId)`. Admin write paths defer to S25.
- `composer.py` — pure-function `compose_paper(blueprint, candidates_by_section)` returning ordered `[{position, sectionId, questionId, topicId}]`. Honest about content shortage: per-section `short` flag + paper-level `short` flag when any section is below requested. Deterministic with seeded RNG via `derive_user_seed(blueprintId, userId)` so retakes are reproducible.
- `routes.py` mounted at `/catalog/exam-blueprints`:
  - `GET /catalog/exam-blueprints?examId=X` — list.
  - `GET /catalog/exam-blueprints/{id}` — detail.
  - `POST /catalog/exam-blueprints/{id}/compose?userId=X&attemptIdx=N` — compose a paper. Pulls candidate questions per section by listing topics under section.subject_id (catalog DB) then fetching questions from the Quiz bank via HTTP.

### S23-C — Quiz Go migration 008 — DONE

`quiz_schema` rev **008**:
- `quiz_sessions.blueprint_id UUID NULL` for traceability.
- `chk_mode` extended to allow `'MOCK_BLUEPRINT'` alongside the existing modes.
- Partial index `idx_sessions_blueprint_user` on `(blueprint_id, user_id) WHERE blueprint_id IS NOT NULL`.

### S23-D — Quiz Go StartFromBlueprint — DONE

- New `domain.ModeMockBlueprint` constant.
- New HTTP client `internal/learning/client.go` — `FetchComposedPaper(ctx, bearer, blueprintID, userID, attemptIdx)` calls alp-learning's compose endpoint. Surfaces `ErrBlueprintNotFound` (404) and `ErrEmptyPaper` (zero items — honest content-gate signal).
- New `Store.ServeQuestionWithSection(sessionID, itemIdx, questionID, sectionID, servedAt)` sibling of the existing `ServeQuestion`. Sets `quiz_session_items.section_id` so the engagement consumer's per-section aggregator (S22) groups correctly.
- New `Store.CreateSession` extended to persist `blueprint_id`; `Store.GetSession` reads it back into `domain.Session.BlueprintID`.
- New `SessionService.StartFromBlueprint` handler mirroring `StartFromAssignment`:
  - 503 if `learningClient` is unwired.
  - 400 on missing/invalid blueprintId/userId.
  - 404 when blueprint doesn't exist.
  - 422 `empty_paper` when the composer returned zero items (content-gate honest).
  - 502 on transient learning-service errors.
  - 201 with full session shape + per-section summary on success.
- Route wired at `POST /quiz/sessions/from-blueprint`.
- Config + main.go: new `QUIZ_LEARNING_BASE_URL` env (default `http://learning:8000`).

### S23-E — Web-student MockExam.tsx — DONE

New `apps/web-student/src/pages/MockExam.tsx` — exam-mode shell:
- Pre-exam instruction screen (read & accept) before the timer starts.
- Section navigation strip with per-section answered/served + marked counts.
- Global timer (red < 5 min remaining); auto-submit on timeout.
- Marked-for-review queue with click-to-jump.
- Section locks honoured client-side via `canNavigate(items, current, target, interSectionNavigation)`.
- Honest `short=true` banner when the composer flagged the paper as content-short.

Pure-helper module `apps/web-student/src/lib/mock_state.ts`:
- `firstIdxOfSection(items, sectionId)`
- `computeSectionTotals(items, sections, answers, marked)` — drives the strip math.
- `markedReviewQueue(items, marked)` — drives the review pass.
- `canNavigate(items, currentIdx, targetIdx, interSectionNavigation)` — section-lock state machine.

Route `/mock-exam?blueprintId=…` wired (admin/educator-gated by the existing protected-route shell).

### S23-F — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/learning/tests/exam_blueprints/test_composer.py` | 6 | Python unit | 6/6 ✅ |
| `services/quiz/internal/server/blueprint_test.go` | 4 | Go unit (handler-wiring) | 4/4 ✅ |
| `apps/web-student/src/lib/mock_state.test.ts` | 7 | Vitest | 7/7 ✅ |

**Total: 17 new tests.** Integration tests (DB-backed routes) deferred — the smoke step covers the live happy path.

### S23-G — Smoke extension — DONE

2 new assertions:
- `GET /catalog/exam-blueprints?examId=<JEE Main>` returns at least 1 blueprint.
- `POST /quiz/sessions/from-blueprint` returns 201 (success) or 422 (`empty_paper` — honest content-gate signal). Both outcomes are accepted per the content-gate caveat in the plan.

Smoke target: **54 steps**.

### S23-H — Closure + master index — DONE

This file. Master phase index updated with the S23 row; Phase 4 row stays DRAFT.

## Stack inventory at Sprint 23 close

- 6 services unchanged.
- alp-learning catalog rev **009**; new `exam_blueprints` table with 3 seeded blueprints.
- alp-learning: new `learning.exam_blueprints` module + 3 routes (list/detail/compose).
- alp-quiz schema rev **008**; sessions are blueprint-aware; new `MOCK_BLUEPRINT` mode constant.
- alp-quiz: new `internal/learning` HTTP client + `StartFromBlueprint` handler + route.
- web-student: new `MockExam.tsx` page + `mock_state.ts` pure-helper module + route.

## What surprised us this sprint

- **JSONB seeding via Alembic uses `$$…$$` quoting** to avoid escape hell. The blueprint sections JSON has nested commas + colons that would break a single-quoted SQL string; double-dollar-quote (Postgres dollar-string syntax) handles it cleanly. Worth a future habit when seeding JSONB.
- **`ServeQuestionWithSection` is a pure superset of `ServeQuestion`** but kept separate. Could have replaced ServeQuestion with the section-aware version + an empty default for the legacy path, but the existing assignment-mode path is well-tested and didn't warrant churning. The duplication is ~25 lines — acceptable tax for the safety.
- **Composer's per-user RNG seed** is `hash((blueprint_id, user_id)) ^ attempt_idx`. Retake N+1 differs from retake N because the XOR perturbs the seed. Same student same blueprint same attempt always gives the same paper — useful for debugging "why did Q3 land in Physics this time?".
- **Content gate is real**. The seeded question bank can't fill 75 JEE Main questions today (we have ~24 topics in the catalog and ~20 PUBLISHED questions per topic, but they're scattered across NEET/JEE/UPSC/CAT). Hitting `from-blueprint` against a fresh stack will likely return `empty_paper` until content workstream W1 scales the bank. **The smoke step accepts both 201 and 422** to reflect this honestly — passing the smoke does not mean the content gate has closed.

## Phase 4 strategic gates — still open

S23 ships the structural plumbing; the content gate (which exam first, which depth bar, who resources W1) is still the gating decision. The 75-Q JEE Main blueprint is seeded; what's missing is questions to fill it.

## Carry-overs to Sprint 24 (P4-S24)

| Item | Why deferred | Owner |
|---|---|---|
| PYQ ingest pipeline + frequency view | Sprint scope — content/topic of S24 | P4-S24 |
| Admin blueprint editor UI | Stretch — defers to S25 | P4-S25 |
| OMR-style answer sheet | Stretch — defers to S25 | P4-S25 |
| Server-side section locks + 5-min disconnect recovery | Stretch — defers to S25 | P4-S25 |
| Bulk-load `from-blueprint` integration test (DB) | Pending Docker stack up | next session |
| Live verification of S23 changes (full mock end-to-end) | Pending Docker stack + content-bank fill | next session |

## Sprint 23 status

**P4-S23 closed**. Real-pattern blueprints replace the 20-Q stub; the exam-mode UI shell renders an exam-simulator-quality surface. The content gate is honest — UI banners declare short papers; smoke accepts the 422 fallback. Next sprint opens the PYQ ingest path that lets W1 start filling these blueprints.
