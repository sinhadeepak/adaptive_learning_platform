# ADR-0018: Polymorphic question types + Resolution contract

- **Status**: proposed
- **Date**: 2026-04-30
- **Deciders**: CTO, Tech Lead, Product Lead, Content Lead
- **Related**: P5-S37 gating ADR. Pairs with [ADR-0017](0017-multi-parameter-assessment-engine.md) (multi-parameter mastery — fed by per-item Resolution + concept tags) and [ADR-0019](0019-ai-gateway-and-consolidation.md) (AI Gateway — substrate for AI_ASSISTED + HYBRID evaluation modes). Builds on [ADR-0012](0012-exam-blueprint-pyq-schema.md) (blueprints compose typed items). Source docs: [Content Engine Question Catalogue](../additional_requirements/Content_Engine_Question_Catalogue.md), [User Stories Content Engine](../additional_requirements/UserStories_Content_Engine_v2.md).

## Context

ALP's content + quiz layer today is **MCQ-only**. `content_schema.questions` has `stem`, `choices` (JSONB array), `correct_idx`. `quiz_schema.questions` mirrors that shape. There is no `question_type` discriminator. Grading is binary exact-match on choice index — `student_idx == correct_idx` in `services/learning/src/learning/content/assignments_repo.py:240` (Python) and `services/quiz/internal/server/sessions.go:650` (Go). The 480 seeded questions are all MCQ.

This blocks five things at once:

1. **Real exam coverage.** JEE has numeric + integer + match + assertion-reason. UPSC mains is essay + descriptive + case-study. CBSE is fill-blank + short-text + diagram + map. NEET Biology is diagram-hotspot + match + classification. Without polymorphic types, ALP can't run a realistic full-exam mock.
2. **Authoring assist + AI evaluation.** AI authoring (ADR-0019, S40) needs to know what *kind* of payload to draft. AI evaluation (S42) needs to know whether to call deterministic-grader vs rubric-LLM-grader. A single MCQ shape conflates both.
3. **Localisation.** Different types translate different fields (stem only? stem + options? rubric criteria? hotspot labels?). Without per-type `translatable_fields()` declaration, the localisation pipeline (ADR-0020 / S43) can't walk the payload safely.
4. **Resolution-vs-marks separation.** The same question reused in different tests (a JEE Adv mock vs a Sunday practice quiz) earns different marks under different scoring rules. Today grading and scoring are co-mingled in `grade_answers` returning `(correct_count, total_count, breakdown)` — which is *almost* a Resolution but doesn't separate "correctness shape" (content concern) from "marks" (orchestration concern).
5. **Future course mode.** Courses need lecture-node concepts that aren't assessable + assessable-concept practice items in mixed types. Without the polymorphic substrate, courses become a separate product.

The [Content Engine Question Catalogue](../additional_requirements/Content_Engine_Question_Catalogue.md) §1.1 calls this out explicitly: *"A question is a piece of content. A test is a curated set of questions, with rules for marking them. The same question can appear in multiple tests with different scoring rules."* — and §3.1 codifies the Type Handler Protocol pattern.

## Decision

**Adopt the Type Handler Protocol pattern. Each question type registers as a Protocol implementation that captures authoring + validation + AI assist + evaluation + localisation + rendering + review responsibilities. Codify the `Resolution` contract every evaluator returns — `{status, matched_count, total_count, per_part, evaluation_mode, evaluator_metadata}`, never marks.**

### The Protocol

```python
class QuestionTypeHandler(Protocol):
    type_id: str                           # "ESSAY", "MAP_LOCATION", ...
    family: str                            # "Subjective", "Visual & Spatial", ...
    payload_schema: type[BaseModel]        # validates author input
    response_schema: type[BaseModel]       # validates student response
    evaluation_mode: Literal["DETERMINISTIC","AI_ASSISTED","HUMAN","HYBRID"]
    supports_partial: bool
    media_kinds: list[str]                 # ["image","audio","video"]

    # Authoring
    def author_validate(payload) -> list[ValidationError]: ...
    async def ai_generate_draft(prompt, context) -> Draft: ...
    async def ai_quality_check(payload) -> QualityReport: ...

    # Localisation
    def translatable_fields(payload) -> list[str]: ...   # dotted paths
    def merge_translation(payload, lang, translation) -> dict: ...

    # Rendering
    def render_payload(payload, mode, lang) -> dict: ...

    # Evaluation (returns Resolution; never marks)
    async def evaluate(payload, response, lang) -> Resolution: ...

    # Review
    def review_checklist(lang) -> list[CheckItem]: ...
```

Lives in `services/learning/src/learning/types/`. Registry exposes `get_handler(type_id)`, `is_supported(type_id)`, `all_types()`, `filter_by_family(family)`. Read-only after startup. Adding a 23rd type is one new module + one registry line — no DB migration, no state machine change.

### The 22 v1 types + 6 gated stubs

**Objective family (5)**: MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ASSERTION_REASON, MULTI_STATEMENT — all DETERMINISTIC.

**Numeric family (4)**: NUMERIC_INTEGER, NUMERIC_DECIMAL (tolerance), NUMERIC_RANGE ([low, high]), FORMULA_INPUT (sympy symbolic equivalence) — all DETERMINISTIC.

**Matching family (3)**: MATCH_THE_FOLLOWING, SEQUENCING, CLASSIFICATION — DETERMINISTIC, partial-credit-capable.

**Fill-in family (4)**: FILL_BLANK_SINGLE, FILL_BLANK_MULTI, CLOZE_PASSAGE — DETERMINISTIC (fuzzy-token); SHORT_TEXT — AI_ASSISTED.

**Subjective family (4)**: ESSAY, DESCRIPTIVE_LONG — HYBRID; CASE_STUDY, COMPREHENSION_LONG — composite (children of any type).

**Visual family (4)**: DIAGRAM_HOTSPOT, DIAGRAM_LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY — all DETERMINISTIC.

**Audio/Video family (2 gated)**: LISTENING_COMP, VIDEO_QUESTION — schema + authoring stub ship; submission returns 503 until flag flips.

**Interactive family (3 gated)**: KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY — wrapper schema only; gated.

### The Resolution contract

```python
class Resolution(BaseModel):
    question_id: UUID
    type_id: str
    status: Literal["CORRECT", "PARTIAL_CORRECT", "INCORRECT",
                    "UNATTEMPTED", "PENDING_HUMAN_REVIEW"]
    matched_count: int
    total_count: int
    per_part: list[PartDetail]
    evaluation_mode: Literal["DETERMINISTIC","AI_ASSISTED","HUMAN","HYBRID"]
    evaluator_metadata: EvaluatorMetadata | None
    # evaluator_metadata: { model, rubric_version, prompt_version,
    #                       evaluated_at, human_review_required }
```

**Resolution never carries marks.** The boundary is enforced at the API: `/grading/grade` (new in S38) returns Resolution; `/quiz/sessions/{id}/submit` (existing) consumes Resolution and applies the test's scoring profile. Same question in a JEE Adv mock (3 marks correct, −1 wrong) and in a Sunday practice quiz (1 mark correct, no negative) returns the **same Resolution** — different marks come from the orchestrator.

### Per-exam type filter

`catalog_schema.exam_question_type_support` (new in S37): `(exam_id, type_id, enabled)`. Authoring UI hides types not enabled for the author's exam. Defaults from catalogue §2.2 (e.g. NEET = Objective + Matching + Visual; UPSC = Objective + Matching + Subjective + Visual; CBSE = all except Interactive).

## Alternatives considered

- **Strategy-pattern grader system only (no Protocol).** *Rejected* — graders cover only the evaluation responsibility. Authoring assist needs payload validation + AI draft; localisation needs translatable-fields declaration + merge; rendering needs per-type display logic. The Type Handler Protocol covers the full lifecycle in one Protocol per type. Strategy is too narrow.
- **Per-type tables in DB (one table per question type).** *Rejected* — payload JSONB on `content_schema.questions` is more flexible. Per-type tables explode cross-type queries (e.g. *"how many questions tagged with concept X across all types?"*) and force schema migrations for every new type. JSONB + Pydantic schema lock at the application layer is cleaner.
- **Single type discriminator without Protocol** — just `question_type` column, no behaviour. *Rejected* — pushes per-type logic into ad-hoc if/else chains in graders, authoring routes, localisation walker, etc. Loses the registration test (Protocol enforcement at startup catches missing methods); loses the registry-driven authoring UI.
- **Marks emitted by content engine.** *Rejected* — same question reused across tests with different scoring profiles is the canonical case (a JEE Adv mock applies +3/−1 negative marking; a practice quiz applies +1/0). Marks belong to Quiz/Test orchestration. Resolution + scoring profile is the cleanest separation.
- **Skip subjective types in v1, ship objective + numeric only.** *Rejected* — UPSC mains, GATE descriptive, CBSE 8-mark biology, CAT case study all need subjective. Ships HYBRID grading via AI Gateway (S42); AI confidence < 0.75 escalates to human grader. Cost is real but the engine-first directive demands subjective coverage.
- **Auto-port MCQ grading to the Protocol but keep `grade_answers` as the canonical entry.** *Rejected for v1, partially adopted for compat* — the existing `grade_answers` becomes a thin wrapper over the MCQ_SINGLE handler's `evaluate()` method during S38 transition. Old code paths preserved behind `question_type='MCQ'` until full type coverage verified.

## Consequences

### Positive

- **Real exam coverage becomes possible.** A JEE Main mock can mix MCQ_SINGLE + NUMERIC_INTEGER + MULTI_STATEMENT + ASSERTION_REASON in a single session. UPSC mains can be ESSAY + DESCRIPTIVE_LONG + CASE_STUDY. NEET Biology can be DIAGRAM_HOTSPOT + MATCH + PICTORIAL_IDENTIFY. The engine matches exam shape — not just content.
- **Resolution-vs-marks separation is enforced at API level.** Same question reusable across tests with different scoring profiles. Quiz orchestration owns marks; content engine owns correctness. Clean boundary that survives schema evolution.
- **Adding a 23rd type is trivial.** One new module + one registry line. Protocol enforcement at startup catches missing methods (registration test fails fast). No state machine, no audit-log change. Future types — language proficiency listening (Phase 2 flag flip), code-execution problems for engineering exams (long-tail), drag-drop sequencing for kids' content — all plug in cleanly.
- **AI authoring + AI evaluation get clear hooks.** ADR-0019's AI Gateway calls `handler.ai_generate_draft()` for authoring assist and `handler.evaluate()` (which internally calls Gateway for AI_ASSISTED / HYBRID modes). The Protocol is the abstraction that makes the AI layer composable rather than per-type-bespoke.
- **Localisation walker is type-aware.** `handler.translatable_fields()` returns dotted paths (`stem`, `options[*].text`, `hotspots[*].label`); the walker doesn't need to know type internals. Localisation pipeline (ADR-0020) becomes mostly type-agnostic.

### Negative

- **22 types is a lot to ship.** Mitigated: 8 sprints (S38 → S44) cover deterministic + AI-graded + visual handlers in tranches; 6 audio/video + interactive types are gated stubs that ship schema only. Per-exam type filter hides non-applicable types from each author so the authoring UX doesn't show all 22 at once.
- **Per-type Pydantic payload contracts are brittle if not locked first.** Mitigated: contracts land week 1 of S37 *before* migrations (lock-first principle). Gateway-fronted JSON-schema discipline catches payload contract violations at the AI provider boundary too. ADR-0018 requires payload contract review with Eng + Product before migration.
- **Composite types (CASE_STUDY, COMPREHENSION_LONG) add submit-flow complexity.** Parent + N children must submit atomically. Children evaluate via their own handlers; parent aggregates Resolutions into CompositeResolution. Worth the complexity; CASE_STUDY is core to CAT and UPSC. Catalogue §4.5 prescribes the pattern.
- **Backward compat with 480 MCQs requires careful migration.** Mitigated: backfill `UPDATE questions SET question_type='MCQ'` for all 480 rows; existing `choices` + `correct_idx` columns continue to back the MCQ_SINGLE handler's `evaluate()`. New `payload` JSONB column is NULL for MCQ. No data movement; no breaking change.
- **Grader latency varies by type.** DETERMINISTIC ~5 ms in-process; AI_ASSISTED 8 s p95; HYBRID 8 s p95 + async human escalation; HUMAN async. Mitigated: Quiz Go inlines DETERMINISTIC grading (Go ports of the simpler handlers) for zero-latency MCQ + NUMERIC submission; only AI_ASSISTED + HYBRID + HUMAN cross the HTTP boundary to alp-learning's grader.

### Follow-up work

- [ ] Pydantic payload + response schemas per type, locked week 1 (P5-S37).
- [ ] `learning.types` package + `QuestionTypeHandler` Protocol ABC + registry (P5-S37).
- [ ] Migration: extend `content_schema.questions` with `question_type`, `payload`, `cognitive_demand`, `procedural_steps_json` (P5-S37).
- [ ] Migration: `catalog_schema.exam_question_type_support` (P5-S37).
- [ ] Backfill all 480 questions to `question_type='MCQ'` + 480 rows in `question_concepts` (P5-S37).
- [ ] 9 deterministic handlers — Objective family (5) + Numeric family (4) (P5-S38).
- [ ] 6 deterministic handlers — Matching family (3) + Fill-in family deterministic (3) (P5-S39).
- [ ] 4 subjective handlers — ESSAY, DESCRIPTIVE_LONG, CASE_STUDY, COMPREHENSION_LONG + SHORT_TEXT (P5-S42).
- [ ] 4 visual handlers — DIAGRAM_HOTSPOT, DIAGRAM_LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY (P5-S44).
- [ ] 5 gated stubs — LISTENING_COMP, VIDEO_QUESTION, KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY (P5-S47).
- [ ] `Resolution` Pydantic model + `/grading/grade` + `/grading/batch` endpoints (P5-S38).
- [ ] Quiz Go branches on `question_type`: inline DETERMINISTIC grading + HTTP escalation for AI/HYBRID/HUMAN (P5-S38).
- [ ] Type Handler conformance test (registration fails if any Protocol method missing) (P5-S37).
- [ ] Per-exam type filter exposed via `GET /content/exams/{exam_id}/supported-types` (P5-S37).

## Review

Revisit by **end of P5-S44** (after deterministic + subjective + visual handlers are live) or earlier if:

- A new exam family (e.g. JEE Advanced introduces a new question shape) forces a 23rd type — verify the Protocol is the right abstraction; amend if not.
- Composite-type submission flow (CASE_STUDY parent + children) shows race conditions or partial-submit bugs — amend the atomicity contract.
- AI evaluator reliability (HYBRID kappa monitoring per ADR-0019 / S43) drops on a specific type for > 4 weeks — that type's evaluation_mode may need to fall back to HUMAN-only; ADR amends to record the policy.
- Resolution shape needs to carry additional fields (e.g. external integrators want a structured-feedback array) — version the contract; never break existing consumers.
