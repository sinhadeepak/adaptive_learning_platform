# Sprint 34 — P4-S34: Reference material integration

**Sprint window:** 2026-04-28
**Theme:** Topics carry pointers to canonical learning material (NCERT, textbook, video, derivation, formula sheet). Closes [GAP-P4-13](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-13--no-reference-material-integration).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md): a student opening "Trigonometry" should see "NCERT Class 11 Ch 3 + this 12-min explainer video + this derivation walkthrough" — the canonical learning material an aspirant uses alongside practice. Without this, the platform tells them they're weak but not what to read.

## Backlog

### S34-A — Catalog migration 012: `topic_references`

```sql
CREATE TABLE catalog_schema.topic_references (
  id           UUID PRIMARY KEY,
  topic_id     UUID NOT NULL REFERENCES catalog_schema.topics(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('ncert','textbook','video','derivation','formula_sheet')),
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_topic_references_topic ON catalog_schema.topic_references (topic_id, position);
```

Inline seed (proof of pipeline) — 2-3 references per existing JEE topic (~15-20 entries total). Bulk content (~150 references for the full JEE Physics syllabus) is content workstream W1.

### S34-B — Pure-function URL safety helper

New `learning/syllabus/url_safety.py::is_safe_reference_url(url)` — rejects `javascript:`, `data:`, `file:`, `vbscript:` schemes per the audit's NFR-P4-* security expectations. Allows http(s) only.

### S34-C — Read endpoint

`GET /catalog/topics/{topic_id}/references` — returns ordered list of references (kind + title + url + position).

### S34-D — Web-student topic-detail reference panel

`TopicDetail.tsx` adds a "References" section below the prereq pill. Pure helper `apps/web-student/src/lib/references.ts::groupByKind(refs)` for the kind-grouped rendering.

### S34-E — Tests

| File | Tests | Type |
|---|---|---|
| `services/learning/tests/syllabus/test_url_safety.py` | 6 | Python unit |
| `apps/web-student/src/lib/references.test.ts` | 4 | Vitest |

### S34-F — Smoke + closure

Smoke +1 (66). Closure 79.

## Out of scope

- Bulk JEE Physics references (~150 entries) — content W1.
- Admin UI to author/curate references — defers post-cutover.
- Per-reference click telemetry — defers to engagement analytics later.
- Mobile parity — S35.
