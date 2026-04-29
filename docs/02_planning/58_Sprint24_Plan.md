# Sprint 24 — P4-S24: PYQ catalog + ingest pipeline + chapter-wise drill view

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Make PYQ (Previous Year Question) a first-class concept on the platform — schema, ingest CLI, drill view, frequency analysis. Closes [GAP-P4-02](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-02--no-pyq-catalogue).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md), Sprint 24 closes one of the two largest content-side gaps the strategic audit named (the other being exam blueprints, which shipped in S23). Without PYQ as a first-class concept the platform cannot deliver chapter-wise PYQ drill, frequency-by-chapter analysis, or PYQ-anchored mock composition.

[ADR-0012](../adr/0012-exam-blueprint-pyq-schema.md) is the gating ADR; the schema additions on `quiz_schema.questions` already shipped in S22 as mirror columns. S24 lands the source-of-truth columns on `content_schema.questions`, the publisher/subscriber payload extension, the ingest CLI, and the read surfaces.

**Honest content gate**: this sprint ships the **pipeline** + **proof-of-pipeline** seed (one synthetic paper session, 6 questions across the JEE Main subjects). The ~16,000-question JEE PYQ corpus that closes the marketing-claim gap is parallel content workstream W1, not engineering.

## Backlog

### S24-A — Content migration 006: PYQ columns on `content_schema.questions`

```sql
ALTER TABLE content_schema.questions
    ADD COLUMN exam_year     SMALLINT NULL,
    ADD COLUMN paper_session TEXT     NULL,
    ADD COLUMN pyq_flag      BOOLEAN  NOT NULL DEFAULT FALSE;

CREATE INDEX idx_content_questions_pyq
    ON content_schema.questions (pyq_flag, exam_year, topic_id)
    WHERE pyq_flag = TRUE;
```

Source-of-truth side. Quiz mirror columns shipped in [S22 migration 007](../../services/quiz/migrations/007_time_per_question.up.sql).

### S24-B — Extend content publisher + Quiz subscriber payload

`learning.content.events.publish_question_published` extends the JSON payload with `exam_year`, `paper_session`, `pyq_flag` (omitted when null/false to preserve backward-compat for any old in-flight messages).

Quiz Go `content_subscriber.go::QuestionPublished` struct + UPSERT extend symmetrically. Backward-compatible: the new fields are nullable on the wire and default-on the row.

### S24-C — Content authoring routes accept PYQ fields

`POST /content/questions` accepts optional `examYear`, `paperSession`, `pyqFlag` on the create request. Default behaviour unchanged for non-PYQ authoring flows.

`paperSession` format (per ADR-0012):
```
<EXAM>-<SESSION>-<YEAR>-<SUB-SESSION>-<SHIFT>
```
Example: `JEE-MAIN-2024-JAN-S1`. The platform doesn't enforce format strictly in v1 — the convention is documented and content tooling validates.

### S24-D — PYQ ingest CLI

New `services/learning/scripts/ingest_pyq.py` — reads a normalised PYQ JSON file and pushes through the existing Content authoring → review → bridge pipeline. JSON shape:

```json
{
  "paper_session": "JEE-MAIN-2024-JAN-S1",
  "exam_year": 2024,
  "questions": [
    {
      "stem": "...",
      "choices": ["...", "..."],
      "correct_idx": 2,
      "topic_id": "<uuid>",
      "difficulty_b": 0.5,
      "explanation": "..."
    }
  ]
}
```

Behaviour:
- Authenticates as a moderator (token from env / CLI flag).
- For each question: POST `/content/questions` with `pyqFlag=true` + paper_session + exam_year, then POST `/content/questions/{id}/review` with approve=true.
- Fail-soft per-row: malformed rows logged; rest of the batch continues.
- Honest progress: prints per-row outcome (`OK / SKIP / FAIL`).

Bulk content (10 yrs × 3 sessions × 75 Q ≈ 2,250 questions for JEE Main alone) runs as workstream W1 — same CLI, different inputs.

### S24-E — PYQ list + frequency endpoints

In `learning.content.routes` (or new `pyq` sub-module — TBD; cleanest is a sub-module sibling to `exam_blueprints/`):

- `GET /content/pyqs?examId=X&topicId=Y&year=Z&page=N&perPage=N` — paginated PYQ corpus filter.
- `GET /content/pyqs/frequency?examId=X&subjectId=Y` — chapter-wise frequency rollup. Returns:
  ```json
  {
    "examId": "...", "subjectId": "...",
    "chapters": [
      {"topicId": "...", "topicTitle": "...", "yearCounts": {"2024": 3, "2023": 4, "2022": 6}, "total": 13}
    ]
  }
  ```

Both endpoints use `content_schema.questions` directly (not the Quiz mirror) — content is the source of truth.

### S24-F — Seed JEE-MAIN-2024-JAN-S1 sample (proof of pipeline)

Content migration 007 inline-seeds **6 sample PYQ questions** (2 per subject — Physics + Chemistry + Math) tagged `paper_session='JEE-MAIN-2024-JAN-S1'`, `exam_year=2024`, `pyq_flag=true`. These are placeholders so the ingest pipeline + drill view + frequency view return non-empty data on a fresh stack.

Note: 6 questions is intentionally tiny — proof-of-pipeline only. The 75-Q full paper for the same session is content workstream W1 effort.

### S24-G — Web-student PYQDrill.tsx

New page `apps/web-student/src/pages/PYQDrill.tsx`:

- Top nav: subject pills (filtered by selected exam from URL or default JEE Main).
- Left sidebar: chapter list with mastery + PYQ-frequency badge per chapter.
- Right: per-chapter view — questions filtered by selected year (year pills above the question list).
- Click a question to open it for solo practice (creates a one-question session via existing `/quiz/sessions/start` with the question's topic).
- Per-chapter frequency view at top: "Mechanics: 6 questions across 2024 (3) / 2023 (2) / 2022 (1) → trending up".
- Pure helper `apps/web-student/src/lib/pyq_frequency.ts::trendDirection(yearCounts)` extracted for unit testing.

Route `/pyq?examId=…` wired.

### S24-H — Tests

| File | Tests | Type |
|---|---|---|
| `services/learning/tests/content/test_pyq_routes.py` | 3 | Python integration (list filter + frequency rollup + empty-result) |
| `services/learning/tests/content/test_ingest_pyq.py` | 2 | Python unit (CLI happy path + malformed row skip) |
| `apps/web-student/src/lib/pyq_frequency.test.ts` | 4 | Vitest (trend up / down / flat / single-year) |

### S24-I — Smoke extension

Add 2 assertions:
- `GET /content/pyqs?examId=<JEE Main>` returns ≥1 PYQ (after seed).
- `GET /content/pyqs/frequency?examId=<JEE Main>&subjectId=<Physics>` returns shape `{examId, subjectId, chapters: [...]}`.

Smoke target: **56 steps**.

### S24-J — Closure + master index

`docs/02_planning/59_Sprint24_Closure.md`. Master phase index updated with the S24 row; Phase 4 row stays DRAFT.

## Out of scope

- **Bulk PYQ corpus load (10 yrs × ~2,250 questions per exam)** — content workstream W1.
- **LLM-assisted topic-tagging in the ingest CLI** — `paper_session` JSON must come pre-tagged with `topic_id` per question. LLM auto-tagging is a P5 enhancement.
- **PYQ-anchored mock composition** — once enough PYQ rows exist, the S23 composer can prefer PYQ rows; this is a S25/S26 follow-up driven by the bank state.
- **PYQ Tagger admin UI** (AU-29 from the UI screen catalogue) — defers to S25.

## Definition of done

- content migration 006 applied; columns exist with partial index.
- content publisher + Quiz subscriber both round-trip the new fields end-to-end.
- POST /content/questions accepts the new fields.
- PYQ ingest CLI works against a sample JSON file.
- 2 new endpoints serve correctly.
- 6 sample PYQs land via migration 007 (proof of pipeline).
- Web-student PYQDrill renders chapter/year navigation + frequency view.
- 9 new tests green (5 Python + 4 TS).
- `make smoke` 56/56.
- Sprint 24 closure doc + master phase index updated.
