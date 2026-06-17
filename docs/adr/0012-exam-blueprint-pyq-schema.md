# ADR-0012: Exam blueprint metadata + PYQ schema

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead, Product Lead, Content Lead
- **Related**: P4-S22 gating ADR. Strategic gap audit [`52_ExamPrep_Strategic_Gap_Audit.md`](../02_planning/52_ExamPrep_Strategic_Gap_Audit.md). Phase 4 plan [`53_Phase4_ExamPrepDepth_SprintPlan.md`](../02_planning/53_Phase4_ExamPrepDepth_SprintPlan.md). Builds on [ADR-0011](0011-recommendation-algorithm.md) (recommendation algorithm reuses `topic_id`).

## Context

The strategic gap audit (Apr 2026) found the platform has no structural representation of:

1. **Real exam paper patterns** — `MOCK_BLUEPRINTS` in `services/learning/src/learning/adaptive/mock.py` hardcodes 20-Q / 25-min stubs; actual JEE Main = 75 Q / 180 min / 3 sections.
2. **Previous-Year Questions (PYQ)** — questions carry `topic_id` only; no exam_year, paper_session, or pyq_flag. The 480-question seed bank is hand-authored + Hindi seed, not PYQ-derived.
3. **Section-aware paper composition** — the mock orchestrator returns flat question lists; section-wise time budgets, locks, and review passes have nothing to bind to.

Without this, the platform cannot deliver: real-pattern timed mocks, chapter-wise PYQ drills, frequency-by-chapter analysis, exam-pattern modelling for JEE/NEET/UPSC/CBSE.

## Decision

**Add three additive concepts: exam blueprints, PYQ metadata on questions, paper-session identifiers.**

### 1. Exam blueprints (new table in `learning.catalog`)

```sql
CREATE TABLE catalog_schema.exam_blueprints (
  id              UUID PRIMARY KEY,
  exam_id         UUID NOT NULL REFERENCES catalog_schema.exams(id),
  name            TEXT NOT NULL,                    -- "JEE Main Standard"
  total_questions INTEGER NOT NULL,
  total_minutes   INTEGER NOT NULL,
  marks_correct   INTEGER NOT NULL,                 -- per-question marks
  marks_negative  REAL NOT NULL DEFAULT 0,          -- e.g. -1 for 1/4 negative
  sections        JSONB NOT NULL,                   -- section composition (see below)
  inter_section_navigation BOOLEAN NOT NULL DEFAULT TRUE,
  per_section_time_locked  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`sections` JSON shape (validated at write time):

```json
[
  {
    "section_id": "physics",
    "name": "Physics",
    "subject_id": "<uuid>",
    "n_questions": 25,
    "n_minutes": 60,
    "topic_distribution": {"<topic_id>": 0.4, ...},
    "difficulty_distribution": {"easy": 0.3, "medium": 0.5, "hard": 0.2}
  },
  ...
]
```

Why JSON not relational: section composition is a configuration artifact, not a queryable entity. JSON keeps the blueprint atomic; the orchestrator reads + composes papers at runtime.

### 2. PYQ metadata on questions

```sql
ALTER TABLE content_schema.questions
  ADD COLUMN exam_year     SMALLINT NULL,                 -- 2024
  ADD COLUMN paper_session TEXT     NULL,                 -- "JEE-MAIN-2024-JAN-S1"
  ADD COLUMN pyq_flag      BOOLEAN  NOT NULL DEFAULT FALSE;

CREATE INDEX idx_questions_pyq_chapter
  ON content_schema.questions (pyq_flag, exam_year, topic_id)
  WHERE pyq_flag = TRUE;
```

The Quiz bridge mirrors these columns into `quiz_schema.questions` so adaptive selection can prefer PYQ patterns.

### 3. Paper-session identifier convention

`paper_session` is a stable string identifier with format:

```
<EXAM>-<SESSION>-<YEAR>-<SUB-SESSION>-<SHIFT>
```

Examples:
- `JEE-MAIN-2024-JAN-S1`
- `JEE-ADV-2024-PAPER-1`
- `NEET-UG-2024`
- `CBSE-CLASS12-PHYS-2024`

The convention is human-readable, sortable, and lets a PYQ ingest tool unambiguously identify which paper a question came from.

### 4. PYQ ingest pipeline

A CLI tool (`services/learning/scripts/ingest_pyq.py`) reads a normalised PYQ JSON file:

```json
{
  "paper_session": "JEE-MAIN-2024-JAN-S1",
  "exam_year": 2024,
  "exam_id": "<uuid>",
  "questions": [
    {
      "stem": "...",
      "choices": [...],
      "correct_idx": 2,
      "topic_id": "<uuid>",
      "difficulty_b": 0.5,
      "discrimination_a": 1.2,
      "guessing_c": 0.25,
      "explanation": "..."
    }
  ]
}
```

The tool writes through the Content authoring service so the existing review queue + Quiz bridge fire normally. PYQ items can skip the review queue if the content lead flags them as pre-vetted (sourced from authoritative compilations).

## Alternatives considered

- **Separate `pyqs` table**. *Rejected* — duplicates the question schema. A PYQ is a question with extra metadata; promoting it to its own table would force two paths in the Content authoring service, the Quiz bridge, and the adaptive engine.
- **Store blueprints in YAML files inside the codebase**. *Rejected* — content lead and ops team need to edit blueprints without a deploy. Database-backed blueprints support an admin UI in P4-S25.
- **Use a third-party exam-content library (e.g., licensed PYQ corpus from Allen / Aakash)**. *Considered, partially adopted* — public-domain PYQs are ingestible; licensed corpora may join later but the schema doesn't depend on it.
- **`pgvector` for question similarity in PYQ search**. *Considered, deferred* — Phase 4 does not need vector similarity on PYQs (chapter-tag + year filtering covers the core flows). Defer to Phase 5 if PYQ search needs semantic similarity.

## Consequences

### Positive

- **Real exam-pattern mocks become possible**. P4-S23 ships full-length JEE Main + Advanced blueprints.
- **PYQ as first-class concept** unlocks chapter-wise drilling, frequency analysis, and PYQ-only mocks.
- **Adaptive engine gains a new signal** — prefer PYQ questions for high-stakes practice.
- **Content team can ship blueprints without engineering** — admin UI in P4-S25.

### Negative

- **Migration touches both `content_schema.questions` and `quiz_schema.questions`** — must coordinate; the bridge subscriber must accept the new columns before any PYQ row arrives.
- **PYQ ingest is a content workstream, not an engineering workstream** — the schema unblocks the path; bulk content load is parallel effort (see [Phase 4 plan W1](../02_planning/53_Phase4_ExamPrepDepth_SprintPlan.md)).
- **Blueprints need maintenance** — exam patterns change (JEE Main changed pattern in 2021). Versioning of blueprints (`version` column) deferred to P5 if needed.

### Follow-up work

- [ ] Migration in `learning/alembic/catalog/` — exam_blueprints table (P4-S22).
- [ ] Migration in `learning/alembic/content/` — questions PYQ columns (P4-S22).
- [ ] Migration in `services/quiz/migrations/` — questions PYQ columns mirror (P4-S22).
- [ ] Mock orchestrator v2 in `adaptive/mock.py` consuming blueprints (P4-S23).
- [ ] PYQ ingest CLI (P4-S24).
- [ ] PYQ frequency-by-chapter aggregator endpoint (P4-S24).
- [ ] Blueprint admin UI in web-portal or web-admin (P4-S25).

## Review

Revisit by **end of Phase 4** or earlier if:

- Blueprint JSON validation becomes a recurring source of bugs (move to Pydantic-validated row).
- PYQ corpora exceed 50K questions (re-evaluate index strategy + storage).
- A new exam adoption (NEET, UPSC, CBSE) reveals shape mismatches in `sections` JSON.
