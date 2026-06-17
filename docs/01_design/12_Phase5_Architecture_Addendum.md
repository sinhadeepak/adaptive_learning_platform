# Phase 5 Architecture Addendum — Multi-Parameter Adaptive Engine

**Applies to**: HLD v1.0, ERD v1.0, OpenAPI v1.0
**Date**: 2026-04-30
**Status**: DRAFT — gated on acceptance of [ADR-0017](../adr/0017-multi-parameter-assessment-engine.md), [ADR-0018](../adr/0018-polymorphic-question-types-and-resolution.md), [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md). Sprint plan locked at [`54_Phase5_MultiParameterEngine_SprintPlan`](../02_planning/54_Phase5_MultiParameterEngine_SprintPlan.md).
**Parent docs**: extends [`01_HLD_Adaptive_Learning_Platform.docx`](01_HLD_Adaptive_Learning_Platform.docx), [`02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx`](02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx), [`03_OpenAPI_Reference_AdaptiveLearningPlatform.docx`](03_OpenAPI_Reference_AdaptiveLearningPlatform.docx), [`11_Phase4_Architecture_Addendum`](11_Phase4_Architecture_Addendum.md).

This addendum documents architecture additions Phase 5 brings. **No new services. No new ports. No service-ceiling violations.** Every Phase 5 work item lands inside an existing service per [ADR-0005](../adr/0005-service-consolidation.md). The substantive shift: `alp-learning` grows four new modules (`ai_gateway`, `ai_authoring`, `localisation`, `evaluation`) per [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md).

---

## 1. Service responsibilities — Phase 5 deltas

| Service | Phase 5 absorbs |
|---|---|
| **alp-quiz** | branch on `question_type` in submit handler — DETERMINISTIC types grade inline (Go ports of MCQ + numeric + matching + fill-in + visual handlers); AI_ASSISTED / HYBRID / HUMAN POST to `/grading/grade` in alp-learning. NATS `SessionItemEvent` extends with `student_response_payload` + `confidence` (omitempty). Mirrored questions table extended via existing `content.question.published` consumer (zero-effort backward compat). |
| **alp-learning** | **Four new modules**: `ai_gateway` (single internal door for all LLM calls — provider abstraction, routing, structured-output, PII scrubber, quotas, audit, cost dashboard); `ai_authoring` (draft / expand / suggest_distractors + 6 quality checks); `localisation` (translation pipeline + glossary + cultural review + per-language reviewer queue); `evaluation` (Type Dispatcher routing by evaluation_mode + grader queue + calibration). Existing `catalog` extends with concept layer; `content` extends with question_type + payload + concept tagging + rubrics + translations + media + AI generation jobs. New `learning.types` package houses 22 Type Handler Protocol implementations; new `learning.kg` package houses traversal + root-cause walker; new `learning.grading` package wraps Type Dispatcher behind HTTP. |
| **alp-engagement** | per-concept multi-parameter mastery (concept_mastery + bloom_mastery + fluency + confidence_calibration + procedure_attempts tables). `process_session` fan-out to 4 new tables (best-effort try/except per existing pattern). Cross-DB JOINs against `catalog_schema.topics` replaced with HTTP via new `learning_catalog_client` (closes 5 pre-existing smoke failures). New `transfer.py` (multi-tag vs single-tag baseline). Existing per-topic mastery row continues to update — new per-concept rolls up to per-topic via topic-as-root-concept backfill. |
| **alp-identity** | unchanged in Phase 5 (target-goals already shipped in P4-S30) |
| **alp-payment** | unchanged in Phase 5 |
| **alp-marketplace** | unchanged in Phase 5 |

**Service ceiling = 6 preserved.** AI Gateway specifically is **not** a 7th service — see [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md) for the rationale and the deferred ADR-0021 trigger conditions for splitting it later.

---

## 2. Schema additions

### 2.1 `learning.catalog` schema

```sql
-- New: concept-grain knowledge graph (replaces topic-only graph as substrate)
CREATE TABLE catalog_schema.concepts (
  id                     UUID PRIMARY KEY,
  parent_topic_id        UUID NOT NULL REFERENCES catalog_schema.topics(id),
  parent_concept_id      UUID NULL REFERENCES catalog_schema.concepts(id),
  kind                   TEXT NOT NULL CHECK (kind IN (
    'topic_root','concept','sub_concept','definition','formula',
    'derivation','example','theorem','common_mistake','application','lecture_node'
  )),
  title                  TEXT NOT NULL,
  description_md         TEXT NULL,
  language               TEXT NOT NULL DEFAULT 'en',
  ordering_hint          INTEGER NULL,            -- course-mode sequential walk
  assessment_optional    BOOLEAN NOT NULL DEFAULT FALSE,  -- lecture nodes
  cognitive_demand       JSONB NULL,              -- {bloom, depth, procedural_steps_count, prereq_chain_length}
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_concepts_parent_topic ON catalog_schema.concepts(parent_topic_id);
CREATE INDEX ix_concepts_parent_concept ON catalog_schema.concepts(parent_concept_id);

-- Backfill: topics seed as topic_root concepts, reusing UUIDs
INSERT INTO catalog_schema.concepts (id, parent_topic_id, kind, title)
SELECT id, id, 'topic_root', title FROM catalog_schema.topics;

-- New: typed concept edges
CREATE TABLE catalog_schema.concept_edges (
  from_concept_id  UUID NOT NULL REFERENCES catalog_schema.concepts(id),
  to_concept_id    UUID NOT NULL REFERENCES catalog_schema.concepts(id),
  edge_type        TEXT NOT NULL CHECK (edge_type IN (
    'is_prerequisite_of','is_specialisation_of','is_applied_in',
    'is_example_of','is_tested_by','is_taught_by',
    'appears_in_blueprint','is_common_mistake_for'
  )),
  weight           REAL NULL,
  PRIMARY KEY (from_concept_id, to_concept_id, edge_type)
);
CREATE INDEX ix_concept_edges_to ON catalog_schema.concept_edges(to_concept_id, edge_type);

-- Migrate the 5 existing prereq edges from topics.prerequisites JSONB

-- New: 9-row static reference for skill axes
CREATE TABLE catalog_schema.skills (
  id    UUID PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);
INSERT INTO catalog_schema.skills (id, name) VALUES
  -- Bloom levels
  (uuid_generate_v4(), 'BLOOM_REMEMBER'),
  (uuid_generate_v4(), 'BLOOM_UNDERSTAND'),
  (uuid_generate_v4(), 'BLOOM_APPLY'),
  (uuid_generate_v4(), 'BLOOM_ANALYSE'),
  (uuid_generate_v4(), 'BLOOM_EVALUATE'),
  (uuid_generate_v4(), 'BLOOM_CREATE'),
  -- Procedural
  (uuid_generate_v4(), 'PROCEDURAL_BASIC'),
  (uuid_generate_v4(), 'PROCEDURAL_MULTI_STEP'),
  -- Strategic
  (uuid_generate_v4(), 'STRATEGIC_TEST_TAKING');

-- New: per-exam type-coverage filter
CREATE TABLE catalog_schema.exam_question_type_support (
  exam_id   UUID NOT NULL REFERENCES catalog_schema.exams(id),
  type_id   TEXT NOT NULL,            -- references content.questions.question_type
  enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (exam_id, type_id)
);
-- Seed default coverage matrix per Question Catalogue §2.2
```

### 2.2 `learning.content` schema

```sql
-- Extend existing questions table with question_type discriminator + payload
ALTER TABLE content_schema.questions
  ADD COLUMN question_type TEXT NOT NULL DEFAULT 'MCQ_SINGLE'
    CHECK (question_type IN (
      'MCQ_SINGLE','MCQ_MULTI','TRUE_FALSE','ASSERTION_REASON','MULTI_STATEMENT',
      'NUMERIC_INTEGER','NUMERIC_DECIMAL','NUMERIC_RANGE','FORMULA_INPUT',
      'MATCH_THE_FOLLOWING','SEQUENCING','CLASSIFICATION',
      'FILL_BLANK_SINGLE','FILL_BLANK_MULTI','CLOZE_PASSAGE','SHORT_TEXT',
      'ESSAY','DESCRIPTIVE_LONG','CASE_STUDY','COMPREHENSION_LONG',
      'DIAGRAM_HOTSPOT','DIAGRAM_LABEL','MAP_LOCATION','PICTORIAL_IDENTIFY',
      -- gated stubs
      'LISTENING_COMP','VIDEO_QUESTION',
      'KBC_LIFELINE','TIMED_REVEAL','ADAPTIVE_DIFFICULTY'
    )),
  ADD COLUMN payload JSONB NULL,                  -- type-specific shape (MCQ leaves NULL; uses existing choices+correct_idx)
  ADD COLUMN cognitive_demand JSONB NULL,         -- {bloom, depth, procedural_steps_count, prereq_chain_length}
  ADD COLUMN procedural_steps_json JSONB NULL,    -- multi-step problem step list
  ADD COLUMN ai_origin JSONB NULL;                -- {original_payload, prompt_template_id, version, model, author_edited, edit_distance}

-- Backfill: all existing 480 questions are MCQ_SINGLE
UPDATE content_schema.questions SET question_type='MCQ_SINGLE' WHERE question_type IS NULL;

-- New: question -> concept tagging (multi-tag)
CREATE TABLE content_schema.question_concepts (
  question_id  UUID NOT NULL REFERENCES content_schema.questions(id),
  concept_id   UUID NOT NULL REFERENCES catalog_schema.concepts(id),
  role         TEXT NOT NULL CHECK (role IN ('primary','prerequisite','distractor_targets','formula_invoked')),
  PRIMARY KEY (question_id, concept_id, role)
);
CREATE INDEX ix_question_concepts_concept ON content_schema.question_concepts(concept_id, role);

-- Backfill: each existing question tagged to its topic-root concept
INSERT INTO content_schema.question_concepts (question_id, concept_id, role)
SELECT id, topic_id, 'primary' FROM content_schema.questions;

-- New: subjective rubrics (versioned)
CREATE TABLE content_schema.evaluation_rubrics (
  id                    UUID PRIMARY KEY,
  artifact_id           UUID NOT NULL REFERENCES content_schema.questions(id),
  version               INTEGER NOT NULL,
  criteria              JSONB NOT NULL,          -- list of {criterion, weight, descriptors, keywords}
  max_score_points      INTEGER NULL,            -- content concern; never marks
  applies_to_languages  TEXT[] NOT NULL DEFAULT ARRAY['en'],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version)
);
CREATE INDEX ix_evaluation_rubrics_artifact ON content_schema.evaluation_rubrics(artifact_id);

-- New: immutable evaluation record per response (re-eval creates new row)
CREATE TABLE content_schema.evaluation_records (
  id                UUID PRIMARY KEY,
  response_id       UUID NOT NULL,         -- references quiz_schema.quiz_session_items via cross-DB
  evaluator_kind    TEXT NOT NULL CHECK (evaluator_kind IN ('AI','HUMAN','DETERMINISTIC')),
  evaluator_id      TEXT NOT NULL,         -- model name (AI) | grader_id (HUMAN) | 'system'
  resolution        JSONB NOT NULL,        -- the Resolution shape
  confidence        REAL NULL,
  prompt_version    TEXT NULL,
  rubric_version    INTEGER NULL,
  evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_evaluation_records_response ON content_schema.evaluation_records(response_id, evaluated_at DESC);

-- New: AI authoring audit log
CREATE TABLE content_schema.ai_generation_jobs (
  id                  UUID PRIMARY KEY,
  artifact_id         UUID NULL REFERENCES content_schema.questions(id),
  prompt_template_id  TEXT NOT NULL,
  prompt_version      TEXT NOT NULL,
  model               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  output              JSONB NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_generation_jobs_artifact ON content_schema.ai_generation_jobs(artifact_id) WHERE artifact_id IS NOT NULL;

-- New: per-language translations
CREATE TABLE content_schema.content_artifact_translations (
  artifact_id          UUID NOT NULL REFERENCES content_schema.questions(id),
  language             TEXT NOT NULL,
  payload_translation  JSONB NOT NULL,           -- per-type translatable_fields output
  status               TEXT NOT NULL CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','REJECTED')),
  translator_id        UUID NULL,
  reviewer_id          UUID NULL,
  ai_confidence        REAL NULL,
  version              INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, language)
);
CREATE INDEX ix_translations_status_lang ON content_schema.content_artifact_translations(language, status);

-- Backfill: existing artifacts get a translation row for primary language
INSERT INTO content_schema.content_artifact_translations
  (artifact_id, language, payload_translation, status, version)
SELECT id, language, '{}'::jsonb, 'PUBLISHED', 1 FROM content_schema.questions;

-- New: media (images / audio / video)
CREATE TABLE content_schema.content_media (
  id                UUID PRIMARY KEY,
  artifact_id       UUID NOT NULL REFERENCES content_schema.questions(id),
  kind              TEXT NOT NULL CHECK (kind IN ('image','audio','video')),
  s3_url            TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  dimensions        JSONB NULL,           -- {width, height} for image; {width, height, fps} for video
  duration_seconds  REAL NULL,
  mime_type         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_content_media_artifact ON content_schema.content_media(artifact_id);

-- New: localisation glossary
CREATE TABLE content_schema.localisation_glossary (
  id                UUID PRIMARY KEY,
  subject           TEXT NOT NULL,
  source_lang       TEXT NOT NULL,
  target_lang       TEXT NOT NULL,
  source_term       TEXT NOT NULL,
  target_term       TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('platform','subject','exam','locked','cultural')),
  case_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,
  context_hint      TEXT NULL,
  alt_translations  TEXT[] NULL,
  added_by          UUID NULL,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject, source_lang, target_lang, source_term)
);
CREATE INDEX ix_glossary_lookup ON content_schema.localisation_glossary(source_lang, target_lang, subject);

-- New: AI evaluation calibration samples (S43)
CREATE TABLE content_schema.calibration_samples (
  id              UUID PRIMARY KEY,
  response_id     UUID NOT NULL,
  ai_resolution   JSONB NOT NULL,
  human_resolution JSONB NULL,            -- filled when human grader completes
  criterion       TEXT NOT NULL,
  ai_score        REAL NOT NULL,
  human_score     REAL NULL,
  sampled_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_calibration_criterion_sampled ON content_schema.calibration_samples(criterion, sampled_at DESC);
```

### 2.3 `engagement.analytics` schema

```sql
-- New: per-concept EWA mastery (replaces topic-only as primary substrate)
CREATE TABLE analytics_schema.concept_mastery (
  user_id        UUID NOT NULL,
  concept_id     UUID NOT NULL,
  ewa            REAL NOT NULL DEFAULT 0,   -- α=0.4 per ADR-0017
  n              INTEGER NOT NULL DEFAULT 0,
  last_seen_at   TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, concept_id)
);
CREATE INDEX ix_concept_mastery_concept ON analytics_schema.concept_mastery(concept_id);

-- New: per-(concept, bloom-level) EWA — the depth axis
CREATE TABLE analytics_schema.bloom_mastery (
  user_id      UUID NOT NULL,
  concept_id   UUID NOT NULL,
  bloom_level  TEXT NOT NULL CHECK (bloom_level IN (
    'BLOOM_REMEMBER','BLOOM_UNDERSTAND','BLOOM_APPLY',
    'BLOOM_ANALYSE','BLOOM_EVALUATE','BLOOM_CREATE'
  )),
  ewa          REAL NOT NULL DEFAULT 0,
  n            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, concept_id, bloom_level)
);

-- New: fluency (calibrated time-per-question)
CREATE TABLE analytics_schema.fluency (
  user_id                 UUID NOT NULL,
  concept_id              UUID NOT NULL,
  expected_ms_baseline    REAL NOT NULL,    -- calibrated from item difficulty
  actual_ms_rolling_avg   REAL NOT NULL,
  n                       INTEGER NOT NULL DEFAULT 0,
  fluency_score           REAL NOT NULL,    -- (expected / actual); > 1 = slower than baseline
  PRIMARY KEY (user_id, concept_id)
);

-- New: confidence calibration (Brier score on read)
CREATE TABLE analytics_schema.confidence_calibration (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL,
  question_id         UUID NOT NULL,
  predicted_correct   REAL NOT NULL CHECK (predicted_correct BETWEEN 0 AND 1),
  actual_correct      BOOLEAN NOT NULL,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_confidence_user ON analytics_schema.confidence_calibration(user_id, submitted_at DESC);

-- New: procedural skill (multi-step problem step-correctness)
CREATE TABLE analytics_schema.procedure_attempts (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL,
  question_id     UUID NOT NULL,
  step_results    JSONB NOT NULL,   -- per-step is_correct + reasoning
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_procedure_user_question ON analytics_schema.procedure_attempts(user_id, question_id);

-- Extend existing revision_queue from topic_id to concept_id (Phase 4 → Phase 5 widening)
ALTER TABLE analytics_schema.revision_queue
  ADD COLUMN concept_id UUID NULL REFERENCES catalog_schema.concepts(id);
-- Backfill: concept_id := topic_id (topic-as-root-concept holds)
UPDATE analytics_schema.revision_queue SET concept_id = topic_id WHERE concept_id IS NULL;
```

All Phase 5 migrations are **additive with NULL-able defaults**. No destructive changes. Existing per-topic mastery rows continue to update; new per-concept rows roll up via the topic-as-root-concept backfill — UI components rendering at topic grain remain unchanged.

---

## 3. NATS subjects (additions)

| Subject | Producer | Consumers | Phase 5 changes |
|---|---|---|---|
| `quiz.session.completed` | alp-quiz | alp-engagement, alp-learning (assignment-progress) | payload `SessionItemEvent` extends with `student_response_payload` JSONB and `confidence` REAL — both `omitempty` (backward-compat) |
| `content.question.published` | alp-learning | alp-quiz mirror | payload extends with `question_type` + `payload` JSONB — `omitempty` |
| `translation.published` | alp-learning | alp-engagement (cache invalidation) | NEW — fires when a per-language reviewer approves a translation |
| `ai_evaluation.kappa_alert` | alp-learning (calibration batch) | notification dispatcher | NEW — fires when Cohen's kappa per criterion drops < 0.7 |

No new streams; reuses `QUIZ_EVENTS` + the existing `CONTENT_EVENTS` and notification streams.

---

## 4. New HTTP endpoints (summary)

### Type registry + grading

| Endpoint | Service | Sprint |
|---|---|---|
| `GET /content/types` | alp-learning | P5-S37 |
| `GET /content/types/{type_id}/payload-schema` | alp-learning | P5-S37 |
| `GET /content/types/{type_id}/translatable-fields` | alp-learning | P5-S37 |
| `GET /content/exams/{exam_id}/supported-types` | alp-learning | P5-S37 |
| `POST /grading/grade` | alp-learning | P5-S38 |
| `POST /grading/batch` | alp-learning | P5-S38 |
| `GET /grading/queue` | alp-learning (grader role) | P5-S43 |
| `POST /grading/responses/{id}/grade` | alp-learning (grader role) | P5-S43 |
| `POST /evaluation/responses/{id}/re-evaluate` | alp-learning (admin) | P5-S47 |

### Knowledge Graph

| Endpoint | Service | Sprint |
|---|---|---|
| `GET /catalog/concepts/{id}` | alp-learning | P5-S37 |
| `GET /catalog/concepts/{id}/prereqs` | alp-learning | P5-S37 |
| `GET /catalog/concepts/bulk?ids=…` | alp-learning (internal, used by engagement) | P5-S37.5 |
| `GET /catalog/topics/bulk?ids=…` | alp-learning (internal) | P5-S37.5 |

### Adaptive engine v2

| Endpoint | Service | Sprint |
|---|---|---|
| `POST /adaptive/diagnostic/root-cause` | alp-learning | P5-S41 |
| `POST /adaptive/select-multi-dim` | alp-learning | P5-S41 |

### Multi-parameter analytics

| Endpoint | Service | Sprint |
|---|---|---|
| `GET /analytics/concept-mastery/{user_id}` | alp-engagement | P5-S39 |
| `GET /analytics/student/{user_id}/multi-profile` | alp-engagement | P5-S39 |
| `GET /analytics/transfer/{user_id}` | alp-engagement | P5-S41 |

### AI Authoring + Quality

| Endpoint | Service | Sprint |
|---|---|---|
| `POST /content/ai/draft` | alp-learning | P5-S40 |
| `POST /content/ai/quality-check` | alp-learning | P5-S40 + P5-S45 |

### Localisation

| Endpoint | Service | Sprint |
|---|---|---|
| `POST /localisation/translate` | alp-learning (internal) | P5-S43 |
| `GET /localisation/glossary/{subject}/{lang}` | alp-learning | P5-S43 |
| `POST /localisation/glossary/{subject}/{lang}` | alp-learning (admin) | P5-S43 |
| `POST /content/questions/{id}/translations/{lang}/request` | alp-learning | P5-S43 |
| `POST /content/questions/{id}/translations/{lang}/review` | alp-learning (reviewer) | P5-S43 |
| `GET /content/questions/{id}/translations` | alp-learning | P5-S43 |

### Admin

| Endpoint | Service | Sprint |
|---|---|---|
| `GET /admin/ai-cost-dashboard` | alp-learning (admin) | P5-S45 |
| `GET /admin/calibration-dashboard` | alp-learning (admin) | P5-S47 |

OpenAPI v1.2 will catalogue these formally at Phase 5 close.

---

## 5. Updated data-flow diagrams

### Quiz submit (Phase 5 — type-aware grading)

```
Quiz Service /quiz/sessions/{id}/submit
  → for each item, branch on question_type:
     - DETERMINISTIC types (objective + numeric + matching + fill-in + visual):
         grade inline via Go-port type handler → Resolution
     - AI_ASSISTED / HYBRID / HUMAN types:
         POST /grading/grade to alp-learning → Resolution (or PENDING_HUMAN_REVIEW)
  → publishes to NATS QUIZ_EVENTS / quiz.session.completed
       (payload now carries student_response_payload + confidence per item, omitempty)
  → Engagement consumer:
       - process_session()  → topic-mastery, readiness, streak (existing, UNCHANGED)
       - persist session_section_stats (existing P4)
       - update_revision_queue() (existing P4, now keyed on concept_id)
       - classify_error() per wrong item (existing P4)
       - NEW: update_concept_mastery() per item per concept tag
       - NEW: update_bloom_mastery() per (concept, bloom-level) tuple
       - NEW: update_fluency() — actual_ms / expected_ms calibrated
       - NEW: record_confidence() if confidence supplied
     (each fan-out is best-effort try/except; transient failure does not roll
      back the load-bearing topic-mastery + readiness updates)
```

### AI authoring draft (NEW in Phase 5)

```
Author opens 'Generate with AI' panel in QuestionAuthor.tsx
  → POST /content/ai/draft {type_id, topic, difficulty, exam, source_material?}
  → ai_authoring.draft_question() loads prompt template
  → calls ai_gateway.call(touchpoint=authoring, schema=<type's payload_schema>)
       → AI Gateway: PII scrub → quota check → provider routing →
         structured-output enforcement → audit log
  → response validates against payload_schema; AI_DRAFT marker stored
  → original_payload preserved in ai_origin JSONB for review audit
  → author edits in form (per-field AI badges; edit_distance tracked)
  → on submit, artifact enters peer review queue with edit_distance + AI badges visible
```

### AI evaluation (HYBRID — NEW in Phase 5)

```
Student submits ESSAY answer in /quiz/sessions/{id}/submit
  → Quiz Go branches on question_type=ESSAY → POST /grading/grade
  → evaluation.dispatcher routes by evaluation_mode=HYBRID
  → Loads rubric (versioned) + model answer + student response
  → calls ai_gateway.call(touchpoint=evaluation, schema=EssayEvaluationSchema)
  → AI returns per-criterion scores + confidence
  → if confidence ≥ 0.95: Resolution finalised (status=CORRECT/PARTIAL/INCORRECT)
    if 0.75 ≤ confidence < 0.95: deterministic 5% sample → human queue
    if confidence < 0.75: status=PENDING_HUMAN_REVIEW; enqueue to grader queue
    if AI error: status=PENDING_HUMAN_REVIEW
  → evaluation_records insert (immutable); calibration_samples insert if sampled
```

### Translation lifecycle (NEW in Phase 5)

```
Artifact PUBLISHED in primary language
  → triggers POST /content/questions/{id}/translations/{lang}/request
  → localisation.translator walks payload via handler.translatable_fields()
  → for each field, calls ai_gateway.call(touchpoint=translation,
      schema=TranslationSchema, glossary_terms=<relevant>)
  → reassembles translated payload
  → INSERT INTO content_artifact_translations status=DRAFT
  → enters per-language reviewer queue
  → reviewer approves / edits-and-approves / rejects / flags for cultural review
  → APPROVED → status=PUBLISHED
  → publishes translation.published NATS event for cache invalidation
```

### Calibration (NEW in Phase 5)

```
Weekly batch in alp-learning (S43+)
  → SELECT FROM calibration_samples WHERE sampled_at > now() - interval '30 days'
       AND human_resolution IS NOT NULL
  → compute Cohen's kappa per criterion (AI vs human agreement)
  → IF kappa < 0.7 for any criterion:
       - flag criterion as auto-paused
       - subsequent HYBRID evaluations on that criterion route 100% to humans
       - publishes ai_evaluation.kappa_alert NATS event
  → calibration dashboard renders kappa per criterion over 12 weeks
```

---

## 6. Security additions

- **PII never leaves the platform (architecture §5.1)**: AI Gateway pre-call middleware scrubs `[EMAIL]`, `[PHONE]`, `[NAME]` patterns. Anonymisation token map per call. Provider zero-data-retention configured (Anthropic / OpenAI / Google enterprise tier where available). Self-hosted Llama reserved for sensitive paths (gated on ENG-OAQ-1).
- **Structured-output discipline (architecture §1.3)**: every Gateway call passes a JSON schema. Free-form text completions disallowed in production paths. Eliminates parse-failure attack tail.
- **Explicit prompt versioning (architecture §1.5)**: every AI call references `(prompt_template_id, version)`; no implicit "latest". Audit log captures version per call. Reproducibility preserved.
- **AI never publishes content**: all AI generations marked `AI_DRAFT`; peer reviewer + moderator approval required before publish. AI evaluations < 0.75 confidence routed to human grader. AI translations gated on per-language reviewer for first publish.
- **Per-touchpoint and per-creator quotas**: Redis-enforced before provider call. Defaults 50 authoring/creator/day, 100 translations/creator/day, platform-wide 200 authoring/min + 500 evaluation/min. Cost dashboard with 80%/95% budget alerts.
- **Calibration auto-pause**: Cohen's kappa < 0.7 → AI evaluation auto-paused for that criterion; 100% human routing; ML alert. Platform never silently degrades.
- **Image moderation**: every image upload runs through NSFW + violence + copyrighted-character classifier before reaching reviewer queue (S40, S44).
- **Honest signalling preserved per dimension**: every multi-parameter response surfaces `n` + confidence/sample-size indicator. Brier score for confidence calibration. Transfer ability hidden when fewer than 5 multi-tag attempts.

---

## 7. Performance budgets

| Surface | p95 target | Sprint |
|---|---|---|
| AI Gateway availability | 99.5% | P5-S38 onwards |
| Authoring draft latency p95 | < 15 s | P5-S40 |
| Quality-check latency p95 | < 5 s | P5-S40 + P5-S45 |
| Evaluation latency p95 (DETERMINISTIC types) | < 10 ms | P5-S38 |
| Evaluation latency p95 (AI_ASSISTED / HYBRID) | < 8 s | P5-S42 |
| Translation latency p95 (per field) | < 8 s | P5-S43 |
| Translation lead time (HI, p95) | < 36 h | P5-S43 |
| Calibration kappa per criterion | ≥ 0.7 | P5-S43 onwards |
| AI translation acceptance rate | > 70% | P5-S43 |
| Cost per published question | ≤ ₹0.20 | P5-S40 onwards |
| Cost per evaluated subjective response | ≤ ₹0.05 | P5-S42 onwards |
| Multi-profile endpoint p95 | < 200 ms | P5-S39 |
| Diagnostic root-cause p95 | < 500 ms | P5-S41 |
| Concept-mastery query p95 | < 200 ms | P5-S39 |

---

## 8. Risks (architecture-level)

| Risk | Mitigation |
|---|---|
| 8 new alembic migrations on hot tables (`questions`, `revision_queue`) — must be backward-compatible | All Phase 5 migrations are additive with NULL-able defaults; no destructive changes; backfill scripts use UUID-equality (topic.id == topic-root-concept.id) so existing FK references resolve unchanged |
| Per-concept IRT calibration unviable at 480 items (1–5 items/concept) | Per-concept IRT explicitly deferred per ADR-0017; per-(concept, bloom) EWA is the v1 mastery signal; revisit when item bank ≥ 30/concept |
| Cross-DB JOINs from engagement against `catalog_schema.topics` compound as Phase 5 schema grows | S37.5 introduces `learning_catalog_client` HTTP shim before any Phase 5 cross-schema work; closes 5 pre-existing smoke failures |
| AI Gateway becomes single point of failure for AI features | Graceful degradation per §6: gateway down → AI features disable, deterministic paths continue, queued work resumes when gateway recovers; circuit breaker on each provider after 5 consecutive failures |
| AI evaluation drift over time (model versions change) | Weekly Cohen's kappa per criterion + auto-pause at < 0.7 + ML alert + 5% HYBRID samples to humans regardless of confidence + monthly calibration review |
| AI vendor lock-in | AI Gateway abstracts vendor; routing config flips providers without redeploy; fallback provider per touchpoint; self-hosted Llama for high-sensitivity paths |
| AI cost overrun | Per-touchpoint + per-creator quotas (Redis-enforced before provider call); cost dashboard with 80% / 95% monthly-budget alerts; forecast-vs-budget visible to admins + finance |
| Translation introduces ambiguity | Per-language reviewer mandatory on first publish; cultural review queue for high-context content; glossary enforcement (locked terms); edit distance + acceptance rate tracked |
| 22 question types is a lot to ship | Tranched across 5 sprints (S38–S44 + S47 gated); per-exam type filter (`exam_question_type_support`) hides non-applicable types from authors; MCQ remains default; existing 480 MCQs preserve backward compat |
| Composite types (CASE_STUDY, COMPREHENSION_LONG) add submit-flow complexity | Parent + N children submit atomically; children evaluate via own handlers; parent aggregates Resolutions into CompositeResolution; pattern prescribed in catalogue §4.5 |
| Schema lock-in if payload contracts wrong | Pydantic payload contracts land **before** migrations in S37 week 1 (lock-first principle); Gateway-fronted JSON-schema discipline catches contract violations at provider boundary |
| Service ceiling ADR-0005 violated by AI Gateway | ADR-0019 codifies AI Gateway as module inside alp-learning, not 7th service; deferred ADR-0021 reserves option to split when alp-learning latency p95 exceeds threshold |

---

## 9. ADR cross-reference

| ADR | Title | Surfaces in this addendum |
|---|---|---|
| [0017](../adr/0017-multi-parameter-assessment-engine.md) | Multi-parameter assessment engine (9 dimensions, concept grain) | §1, §2.1, §2.3, §5 |
| [0018](../adr/0018-polymorphic-question-types-and-resolution.md) | Polymorphic question types via Type Handler Protocol + Resolution contract | §1, §2.2, §3, §4 (Type registry + grading), §5 |
| [0019](../adr/0019-ai-gateway-and-consolidation.md) | AI Gateway as module inside alp-learning (preserves ADR-0005 ceiling) | §1, §3, §4 (AI Authoring + Localisation), §5, §6, §8 |
| [0005](../adr/0005-service-consolidation.md) | Service consolidation 12 → 5 (+ 1 reserved) | §1 (service ceiling check), §8 |
| [0014](../adr/0014-spaced-repetition-scheduling.md) | Spaced-repetition scheduling (SM-2 + EWA tie-in) | §2.3 (revision_queue extended to concept_id), §5 |
| [0015](../adr/0015-calibrated-rank-prediction.md) | Calibrated rank prediction (cohort-driven) | §6 (honest signalling pattern extended) |
| [0016](../adr/0016-error-pattern-classification.md) | Error-pattern classification taxonomy | §2.3 (concept_id tagging on existing classifications), §5 |

---

## 10. Source reference docs

The Phase 5 design is grounded in three previously-shared architecture docs now committed under [`docs/additional_requirements/`](../additional_requirements/):

- [Content_Engine_Question_Catalogue.md](../additional_requirements/Content_Engine_Question_Catalogue.md) — 22 types × 4 evaluation modes specification, Type Handler Protocol pattern, Resolution contract.
- [AI_Multilingual_Architecture.md](../additional_requirements/AI_Multilingual_Architecture.md) — AI Gateway design, prompt versioning, evaluation pipelines, translation workflow, glossary management, calibration discipline.
- [UserStories_Content_Engine_v2.md](../additional_requirements/UserStories_Content_Engine_v2.md) — 30 user stories (CE-101 through CE-630, 184 points, 6 sprints) — semantic source for the sprint sequence.

Build plan with full implementation details: `~/.claude/plans/gentle-popping-diffie.md` (1389 lines).
