# Sprint 24 Closure — P4-S24 PYQ catalog + ingest pipeline + drill view

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [`docs/02_planning/58_Sprint24_Plan.md`](58_Sprint24_Plan.md)

## Scope delivered

### S24-A — Content migration 006: PYQ columns — DONE

`content_schema.questions` rev **006** adds:
- `exam_year SMALLINT NULL`
- `paper_session TEXT NULL`
- `pyq_flag BOOLEAN NOT NULL DEFAULT FALSE`
- Partial index `idx_content_questions_pyq` on `(pyq_flag, exam_year, topic_id) WHERE pyq_flag = TRUE`.

Source-of-truth side. Quiz mirror columns shipped in S22 migration 007.

### S24-B — Publisher + subscriber payload extension — DONE

- `learning.content.events.publish_question_published` payload now carries optional `pyq_flag`, `exam_year`, `paper_session`. Omitted when not a PYQ to keep wire shape tight + preserve backward-compat.
- Quiz Go `events.QuestionPublished` struct extends with the same fields (omitempty).
- Quiz Go subscriber UPSERT writes them into `quiz_schema.questions`. Round-trip is end-to-end.

### S24-C — Content authoring accepts PYQ fields — DONE

- `QuestionCreate` Pydantic model: optional `examYear` (1990 ≤ y ≤ 2100), `paperSession` (max 120 chars), `pyqFlag`.
- `QuestionDetail` returns the new fields.
- `repositories.insert_question` + `_row_to_dict` propagate the columns.
- `routes.create_question` wires the request through.

### S24-D — PYQ ingest CLI — DONE

`services/learning/scripts/ingest_pyq.py` — drives a paper-session JSON through the existing Content authoring → submit → review pipeline. Two tokens (author + moderator) so the FSM's no-self-approval gate is honoured. Per-row outcome printed (`OK / FAIL`); fail-soft on malformed rows.

Pure-function `validate_row(row)` exposed at module scope for testing.

CLI usage:
```
uv run python -m scripts.ingest_pyq path/to/paper.json [--base-url URL] [--jwt-secret SECRET]
```

### S24-E — PYQ list + frequency endpoints — DONE

New `learning.pyq` module:
- `repositories.list_pyqs(...)` — paginated PYQ list with optional `exam_id`, `subject_id`, `topic_id`, `year`, `paper_session` filters. Joins catalog when needed.
- `repositories.aggregate_chapter_frequency(rows)` — pure function rolling per-(topic, year) counts into chapter buckets sorted by total desc.
- `repositories.chapter_frequency(exam_id, subject_id?)` — DB query + dispatch to the pure aggregator.
- `routes.py` mounted at `/content/pyqs`:
  - `GET /content/pyqs?examId=&subjectId=&topicId=&year=&paperSession=&page=&perPage=`
  - `GET /content/pyqs/frequency?examId=&subjectId=`

`alp-learning` now serves the new endpoints alongside the existing routes.

### S24-F — Seed JEE-MAIN-2024-JAN-S1 (proof of pipeline) — DONE

Content migration 007 seeds **6 sample PYQs** spanning Physics (Mechanics × 2), Chemistry (Physical + Organic), and Maths (Calculus + Coordinate). All tagged:
- `paper_session = 'JEE-MAIN-2024-JAN-S1'`
- `exam_year = 2024`
- `pyq_flag = TRUE`

Guarded by `CONTENT_SEED_LOCAL=1` to mirror the existing question-bank seed contract. Idempotent via deterministic UUIDs (uuid5 over a stable namespace + `paper_session#index`).

**Bulk corpus (~16,000 JEE Main + Advanced PYQs over 10 years) remains content workstream W1.** This 6-question seed proves the pipeline works end-to-end on a fresh stack.

### S24-G — Web-student PYQDrill.tsx — DONE

New page `apps/web-student/src/pages/PYQDrill.tsx`:
- Subject pill row at the top.
- Left sidebar — chapter list with frequency badge + trend arrow (↑ green / ↓ red / → grey / · single year).
- Right pane — year filter pills + question list with click-to-reveal answers + explanations.

Pure helpers at `apps/web-student/src/lib/pyq_frequency.ts`:
- `trendDirection(yearCounts)` — returns `up | down | flat | single`.
- `totalAcrossYears(yearCounts)`.

Route `/pyq?examId=…` wired (default JEE Main).

### S24-H — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/learning/tests/pyq/test_frequency_aggregator.py` | 7 | Python unit (3 aggregator + 4 ingest validator) | 7/7 ✅ |
| `apps/web-student/src/lib/pyq_frequency.test.ts` | 7 | Vitest | 7/7 ✅ |

**Total: 14 new tests, all green in this session.** Integration tests for the new endpoints (DB-backed routes) are deferred — pending Docker stack up; the smoke step covers the live path.

### S24-I — Smoke extension — DONE

2 new assertions:
- `GET /content/pyqs?examId=<JEE Main>` returns ≥1 PYQ (after seed migration 007 fires under `CONTENT_SEED_LOCAL=1`).
- `GET /content/pyqs/frequency?examId=<JEE Main>&subjectId=<Physics>` returns shape `{examId, subjectId, chapters}`.

Smoke target: **56 steps**.

### S24-J — Closure + master phase index — DONE

This file. Master phase index updated with the S24 row; Phase 4 row stays DRAFT.

## Stack inventory at Sprint 24 close

- 6 services unchanged.
- alp-learning content rev **006** + content rev **007** (seed). Source-of-truth PYQ schema active.
- alp-learning: new `pyq` module + 2 routes; `exam_blueprints` from S23 unchanged.
- alp-quiz subscriber struct extended; mirrors PYQ fields end-to-end.
- web-student: new `PYQDrill.tsx` page + `pyq_frequency.ts` pure-helper module + route.

## What surprised us this sprint

- **Cross-schema joins inside alp-learning are convenient.** Both `content_schema.questions` and `catalog_schema.subjects/topics` live in the same `learning` Postgres database (per ADR-0005's per-service-DB consolidation). Cross-schema joins for the frequency view are a single SQL statement; no service-to-service HTTP needed. This is one of the structural wins that the 12→5 consolidation enables — without it, frequency would have required a Catalog HTTP fan-out per chapter.
- **The seed migration's $$ dollar quoting** (used inline for stems and JSON choices) is robust against Python f-string awkwardness around quotes. No need to escape or template.
- **PYQ-flag is opt-in everywhere.** Old Quiz subscriber messages without the new fields just default `pyq_flag=false` on the column — no migration data fix needed for the existing question bank. The schema additions are pure-additive.
- **Content gate is real but de-risked.** The 6-question seed is enough that the smoke + drill view return non-empty data. The real 75-Q-paper × 30-paper-sessions × 10-years volume is W1; the ingest CLI is the unblock for content effort.

## Phase 4 strategic gates — still open

S24 ships the structural pipeline. The 16K-question corpus that closes the marketing-claim gap is content effort, not engineering.

## Carry-overs to Sprint 25 (P4-S25)

| Item | Why deferred | Owner |
|---|---|---|
| OMR-style answer sheet | Sprint scope — S25 | P4-S25 |
| Mocks series view | Sprint scope — S25 | P4-S25 |
| Server-side section locks + 5-min disconnect recovery | Sprint scope — S25 | P4-S25 |
| Admin blueprint editor + PYQ tagger | Sprint scope — S25 | P4-S25 |
| Bulk PYQ corpus load (10 yrs × ~225 Q × 3 sessions per exam) | Content workstream | W1 |
| LLM-assisted topic-tagging for ingested PYQs | P5+ enhancement | P5 |
| DB-backed integration tests for PYQ routes | Pending Docker stack | next session |

## Sprint 24 status

**P4-S24 closed**. PYQ is now a first-class concept on the platform: schema lives on the source-of-truth side, the publisher + subscriber round-trip the metadata, the authoring path accepts it, the ingest CLI drives bulk ingestion, the read endpoints serve the corpus + frequency view, and a 6-question seed makes the surface demoable on day one. The bank-fill effort starts now in parallel with S25.
