# Phase 5 Low-Level Design Addenda

**Applies to**: All `docs/04_low_level_design/*.docx` per-service LLDs
**Date**: 2026-04-30
**Status**: DRAFT — gated on acceptance of [ADR-0017](../adr/0017-multi-parameter-assessment-engine.md), [ADR-0018](../adr/0018-polymorphic-question-types-and-resolution.md), [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md). Sprint plan: [`02_planning/54_Phase5_MultiParameterEngine_SprintPlan`](../02_planning/54_Phase5_MultiParameterEngine_SprintPlan.md).
**Parent docs**: extends per-service LLD `.docx` files + [`07_Phase4_LLD_Addenda`](07_Phase4_LLD_Addenda.md). Phase 5 makes module-level additions; **no service boundaries change.**

This document captures per-service LLD additions for Phase 5. Each section describes what changes inside an existing service. **No new services. Service ceiling holds ([ADR-0005](../adr/0005-service-consolidation.md)).** AI Gateway, AI Authoring, Localisation, and Evaluation all fold into `alp-learning` per [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md).

---

## 1. alp-quiz (Go) — Phase 5 LLD addendum

**Parent**: [`01_core_services/01_LLD_QuizService_AdaptiveLearningPlatform.docx`](01_core_services/01_LLD_QuizService_AdaptiveLearningPlatform.docx) + Phase 4 addendum.

Phase 5 changes are minimal: branch on `question_type` in submit handler, port a small set of DETERMINISTIC handlers to Go for inline grading, extend NATS payload.

### Schema additions

```sql
-- Mirror question_type column from content (received via existing
-- content.question.published consumer; no schema change in quiz)
-- The bridge subscriber widens to accept additional optional fields.

ALTER TABLE quiz_schema.quiz_session_items
  ADD COLUMN student_response_payload JSONB NULL,
  ADD COLUMN confidence REAL NULL CHECK (confidence BETWEEN 0 AND 1);
```

### New module: `internal/types/`

Go ports of DETERMINISTIC type handlers used for inline grading. Package layout:

```
internal/types/
  handler.go           // QuestionTypeHandler interface (Go shape mirroring Python Protocol)
  resolution.go        // Resolution + PartDetail + EvaluatorMetadata types
  registry.go          // type_id → handler dispatch
  objective/           // MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ASSERTION_REASON, MULTI_STATEMENT
  numeric/             // NUMERIC_INTEGER, NUMERIC_DECIMAL, NUMERIC_RANGE, FORMULA_INPUT (sympy via subprocess or pure-go alternative)
  matching/            // MATCH_THE_FOLLOWING, SEQUENCING, CLASSIFICATION
  fill_in/             // FILL_BLANK_SINGLE, FILL_BLANK_MULTI, CLOZE_PASSAGE
  visual/              // DIAGRAM_HOTSPOT, DIAGRAM_LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY
```

Each handler implements:

```go
type QuestionTypeHandler interface {
    TypeID() string
    Family() string
    Evaluate(ctx context.Context, payload, response json.RawMessage) (*Resolution, error)
}
```

AI_ASSISTED / HYBRID / HUMAN types are **not** ported to Go — Quiz Go calls `POST /grading/grade` on alp-learning for those.

### Submit handler extension (P5-S38)

```go
func (s *SessionService) Submit(ctx context.Context, sessionID UUID) error {
    items := s.store.LoadSessionItems(sessionID)
    for i, item := range items {
        q := s.store.LoadQuestion(item.QuestionID)
        switch evaluationModeFor(q.QuestionType) {
        case ModeDeterministic:
            handler := s.types.Get(q.QuestionType)
            res, err := handler.Evaluate(ctx, q.Payload, item.StudentResponsePayload)
            if err != nil { /* fall back to legacy MCQ exact-match for question_type=MCQ_SINGLE */ }
            items[i].Resolution = res
        case ModeAIAssisted, ModeHybrid, ModeHuman:
            res, err := s.learningClient.GradeRemote(ctx, q.ID, item.StudentResponsePayload, item.Confidence)
            if err != nil { /* item enters PENDING_HUMAN_REVIEW; do not block submit */ }
            items[i].Resolution = res
        }
    }
    s.store.UpdateItemResolutions(items)
    payload := buildPayload(items)  // now includes student_response_payload + confidence per item
    return s.publisher.Publish("quiz.session.completed", payload)
}
```

### NATS payload v3

The `quiz.session.completed` payload extends with per-item `student_response_payload` JSONB and `confidence` REAL. Both are `omitempty` (per [ADR-0018](../adr/0018-polymorphic-question-types-and-resolution.md)). Backward-compat: pre-Phase-5 consumers ignore unknown fields.

### content.question.published consumer extension

The bridge subscriber widens its row-upsert to accept the new optional fields from alp-learning's content payload:

```go
type ContentQuestionPublished struct {
    ID            string `json:"id"`
    TopicID       string `json:"topicId"`
    QuestionType  string `json:"questionType"`              // NEW
    Payload       *json.RawMessage `json:"payload,omitempty"` // NEW
    // existing fields: stem, choices, correctIdx, language, difficultyB, ...
    // ai_origin (NEW), cognitive_demand (NEW), procedural_steps_json (NEW)
}
```

### Tests added (P5-S38 + S39)

- `TestRegistryDispatch` — registry returns expected handler per type_id; missing type fails fast.
- `TestEvaluateMCQSingle` (8 cases — happy + edge + malformed payload).
- `TestEvaluateNumericDecimal` (10 cases — within tolerance, outside, negative, scientific notation).
- `TestEvaluateFormulaInput` (6 cases — symbolic equivalence delegated to sympy via subprocess or pure-go alternative; ENG-OAQ-13).
- `TestEvaluateMatchThe Following` (5 cases — full match, partial, ordering invariance).
- `TestEvaluateDiagramHotspot` (4 cases — point-in-shape: rect, circle, polygon).
- `TestSubmitBranchesByQuestionType` (3 cases — DETERMINISTIC inline, AI_ASSISTED HTTP escalation, HUMAN escalation).
- `TestSubmitPayloadV3` (2 cases — payload carries new omitempty fields; pre-Phase-5 consumer parses successfully).

### Open question

ENG-OAQ-13 (NEW): Go implementation of FORMULA_INPUT symbolic equivalence — sympy via subprocess (latency cost) vs pure-Go expression equivalence library (less mature) vs HTTP fallback to alp-learning's Python sympy. Decide before P5-S38.

---

## 2. alp-learning (Python / FastAPI) — Phase 5 LLD addendum

**Parent**: [`03_content_and_catalog/01_LLD_ContentService_AdaptiveLearningPlatform.docx`](03_content_and_catalog/01_LLD_ContentService_AdaptiveLearningPlatform.docx) + sibling LLDs + Phase 4 addendum.

Phase 5 grows alp-learning by **four new modules** + extensions to existing `catalog`, `content`, and `adaptive` modules. Largest delta in the platform.

### Module layout (post-Phase-5)

```
services/learning/src/learning/
├── adaptive/              # existing + Phase 5 extensions
│   ├── irt.py             # 3PL IRT (kept as-is; per-topic θ)
│   ├── multi_dim_selector.py    # NEW (P5-S41) — pure
│   ├── ... (existing modules)
├── catalog/               # existing + Phase 5 extensions
│   └── (existing repos + concept-graph repos)
├── content/               # existing + Phase 5 extensions
│   ├── assignments_repo.py          # grade_answers refactored to call MCQ handler
│   └── ...
├── doubts/                # existing, unchanged
├── search/                # existing, unchanged
├── kg/                    # NEW (P5-S41) package
│   ├── traversal.py       # transitive_prereqs, gate_state, has_cycle generalised to concepts
│   └── root_cause.py      # DFS prereq chain, deepest-weak return — pure
├── types/                 # NEW (P5-S37) package — 22 Type Handler Protocol implementations
│   ├── base.py            # QuestionTypeHandler Protocol ABC
│   ├── registry.py        # get_handler / is_supported / all_types / filter_by_family
│   ├── objective/         # 5 handlers
│   ├── numeric/           # 4 handlers
│   ├── matching/          # 3 handlers
│   ├── fill_in/           # 4 handlers (incl. SHORT_TEXT AI_ASSISTED)
│   ├── subjective/        # 4 composite-aware handlers
│   ├── visual/            # 4 handlers
│   ├── audio_video/       # 2 gated stubs
│   └── interactive/       # 3 gated stubs
├── grading/               # NEW (P5-S38) — HTTP wrapper over Type Dispatcher
│   ├── routes.py          # POST /grading/grade, /grading/batch
│   └── service.py         # type → handler.evaluate → Resolution
├── ai_gateway/            # NEW (P5-S38) — single internal door for all LLM calls
│   ├── router.py          # routing config + provider dispatch
│   ├── providers/
│   │   ├── anthropic.py
│   │   ├── openai.py
│   │   ├── google.py
│   │   └── llama.py       # self-hosted (gated on ENG-OAQ-1)
│   ├── pii_scrubber.py    # pre-call regex + anonymisation token map
│   ├── quotas.py          # Redis-backed per-touchpoint + per-creator
│   ├── prompt_registry.py # versioned YAML loader
│   ├── audit.py           # 90-day per-call audit log
│   └── telemetry.py       # Prometheus metrics
├── ai_authoring/          # NEW (P5-S40)
│   ├── draft.py           # draft_question / expand_explanation / suggest_distractors
│   ├── ai_draft_marker.py # AI_DRAFT audit + edit_distance per field
│   └── quality_checks/
│       ├── ambiguity.py
│       ├── distractor_plausibility.py
│       ├── duplicate.py        # embedding similarity > 0.92
│       ├── syllabus_tagging.py # P5-S45
│       ├── difficulty.py       # P5-S45
│       └── tone_language.py    # P5-S45
├── localisation/          # NEW (P5-S43)
│   ├── translator.py      # walks payload via handler.translatable_fields()
│   ├── glossary.py        # CRUD + injection into translation prompts
│   ├── cultural_review.py # AI flag heuristic + reviewer queue
│   └── reviewer_queue.py  # per-language queue
└── evaluation/            # NEW (P5-S38–S43)
    ├── dispatcher.py      # routes by evaluation_mode
    ├── grader_queue.py    # human grader queue
    └── calibration.py     # Cohen's kappa per criterion + auto-pause hook
```

### Type Handler Protocol (P5-S37)

```python
class QuestionTypeHandler(Protocol):
    type_id: str
    family: str
    payload_schema: type[BaseModel]
    response_schema: type[BaseModel]
    evaluation_mode: Literal["DETERMINISTIC","AI_ASSISTED","HUMAN","HYBRID"]
    supports_partial: bool
    media_kinds: list[str]

    def author_validate(payload) -> list[ValidationError]: ...
    async def ai_generate_draft(prompt, context) -> Draft: ...
    async def ai_quality_check(payload) -> QualityReport: ...
    def translatable_fields(payload) -> list[str]: ...
    def merge_translation(payload, lang, translation) -> dict: ...
    def render_payload(payload, mode, lang) -> dict: ...
    async def evaluate(payload, response, lang) -> Resolution: ...
    def review_checklist(lang) -> list[CheckItem]: ...
```

Registry exposes `get_handler(type_id)`, `is_supported(type_id)`, `all_types()`, `filter_by_family(family)`. Read-only after startup. Missing methods cause startup failure (Protocol enforcement).

### Resolution contract (P5-S38)

```python
class Resolution(BaseModel):
    question_id: UUID
    type_id: str
    status: Literal["CORRECT","PARTIAL_CORRECT","INCORRECT","UNATTEMPTED","PENDING_HUMAN_REVIEW"]
    matched_count: int
    total_count: int
    per_part: list[PartDetail]
    evaluation_mode: Literal["DETERMINISTIC","AI_ASSISTED","HUMAN","HYBRID"]
    evaluator_metadata: EvaluatorMetadata | None

class EvaluatorMetadata(BaseModel):
    model: str | None
    rubric_version: int | None
    prompt_version: str | None
    evaluated_at: datetime
    human_review_required: bool
```

**Resolution never carries marks.** Marks live in Quiz/Test orchestration only.

### AI Gateway calling convention (P5-S38)

```python
result: QualityReportSchema = await ai_gateway.call(
    touchpoint="quality_check",
    prompt_template_id="mcq_quality",
    prompt_template_version="3.1.0",   # explicit; no implicit "latest"
    prompt_inputs={"stem": "...", "options": [...]},
    schema=QualityReportSchema,
)
```

The Gateway:

1. Validates `(prompt_template_id, version)` exists and matches `schema`.
2. Runs PII scrubber over `prompt_inputs` — replaces email / phone / name patterns with placeholders; stores anonymisation token map.
3. Checks per-touchpoint + per-creator Redis quota; raises 429 with `quota_reset_at` if exceeded.
4. Looks up routing config for `touchpoint`; calls primary provider with structured-output mechanism (Anthropic tool use / OpenAI tool calls / Google function calling).
5. On timeout / 5xx / schema-mismatch: retries fallback provider per circuit-breaker rules.
6. Validates response against `schema`; raises `AIGatewayError` if neither provider succeeds.
7. Inserts audit row `(call_id, touchpoint, prompt_version, input_hash, provider, latency, tokens_in, tokens_out, cost_usd, status)` retained 90 days.
8. Increments Prometheus counters: `ai_gateway_call_total`, `ai_gateway_latency_seconds`, `ai_gateway_cost_usd_total`, `ai_gateway_tokens_total`.
9. Returns the validated schema instance to caller.

### Calibration pipeline (P5-S43)

Weekly batch job:

```python
async def run_calibration():
    samples = await load_calibration_samples_last_30d()  # human_resolution NOT NULL
    for criterion in distinct_criteria(samples):
        kappa = cohen_kappa(samples, criterion)
        if kappa < 0.7:
            await pause_ai_evaluation(criterion)
            await publish_kappa_alert(criterion, kappa)
        await store_kappa_history(criterion, kappa, run_date=today())
```

5% of HYBRID responses route to humans regardless of AI confidence (deterministic via `hash(response_id) % 20 == 0`). Stored in `calibration_samples` with `ai_resolution`; human grader fills `human_resolution` async via grader queue.

### Tests added (Phase 5 sprint-by-sprint)

- **S37**: Type Handler Protocol conformance test (`TestRegistryEnforcesProtocol` — registration fails fast if any method missing); Pydantic payload contract tests per type (~80 tests across 22 types); migration tests (concepts backfill, question_concepts backfill).
- **S37.5**: HTTP-ify engagement→learning (5 pre-existing smoke failures flip to green).
- **S38**: 9 deterministic handler tests (~50 unit tests); AI Gateway provider routing + fallback (10 tests); PII scrubber (8 tests); quota enforcement (6 tests); prompt registry (6 tests).
- **S39**: 6 deterministic handlers (matching + fill-in deterministic) (~30 unit tests).
- **S40**: AI authoring draft + 3 quality checks (~20 unit tests); AI_DRAFT marker + edit_distance (4 tests).
- **S41**: multi_dim_selector (10 tests); root_cause walker (12 tests); transfer metric (6 tests).
- **S42**: 5 subjective handlers (~25 unit tests); AI evaluation dispatcher + confidence routing (8 tests); rubric editor + versioning (5 tests).
- **S43**: localisation pipeline (10 tests); glossary CRUD + injection (8 tests); cultural review queue (4 tests); calibration sampling + kappa (8 tests); Human Grader Application (15 tests).
- **S44**: 4 visual handlers (~20 unit tests); image moderation (6 tests).
- **S45**: 3 remaining quality checks (12 tests).
- **S47**: 5 gated handlers + Whisper transcription stub (10 tests); re-evaluation triggers (6 tests).

---

## 3. alp-engagement (Python / FastAPI) — Phase 5 LLD addendum

**Parent**: [`04_data_and_analytics/`](04_data_and_analytics/) per-service LLDs + Phase 4 addendum.

### Schema additions

5 new analytics tables per [§2.3 of the architecture addendum](../01_design/12_Phase5_Architecture_Addendum.md). All keyed at concept grain.

### New modules

```
services/engagement/src/engagement/analytics/
├── learning_catalog_client.py    # NEW (P5-S37.5) — HTTP shim replacing cross-DB JOIN
├── concept_mastery.py            # NEW (P5-S39) — pure: update_concept_mastery
├── bloom_mastery.py              # NEW (P5-S39) — pure: update_bloom_mastery
├── fluency_model.py              # NEW (P5-S39) — pure: update_fluency
├── confidence.py                 # NEW (P5-S39) — pure: record_confidence + brier_score
├── transfer.py                   # NEW (P5-S41) — pure: multi-tag vs single-tag baseline
├── events.py                     # EXTEND process_session — fan-out
├── revision_queue_repo.py        # MODIFY — replace cross-DB JOIN with HTTP
└── (existing analytics modules unchanged)
```

### `learning_catalog_client.py` (P5-S37.5)

Replaces every cross-DB JOIN against `catalog_schema.topics` with HTTP calls to alp-learning. Bulk endpoints (`/catalog/topics/bulk`, `/catalog/concepts/bulk`) batch lookups to minimise round-trips. Closes 5 pre-existing smoke failures (steps 59, 62, 63, 65). Pattern matches the existing alp-engagement → alp-identity HTTP idiom.

### `events.py::process_session` extension (P5-S39)

```python
async def process_session(payload):
    # Existing code (UNCHANGED): topic-mastery, readiness, streak,
    # session_section_stats, error_classifier, revision_queue, mock_attempts

    # NEW: per-concept fan-out (best-effort try/except)
    for item in payload.items:
        question_concepts = await learning_catalog_client.get_question_concepts(item.question_id)
        cognitive_demand = await learning_catalog_client.get_question_cognitive_demand(item.question_id)

        try: await update_concept_mastery(user_id, question_concepts, item.is_correct)
        except Exception as e: log.warn("concept_mastery update failed", err=e)

        try: await update_bloom_mastery(user_id, question_concepts, cognitive_demand.bloom, item.is_correct)
        except Exception as e: log.warn("bloom_mastery update failed", err=e)

        try: await update_fluency(user_id, question_concepts, item.time_spent_ms, cognitive_demand)
        except Exception as e: log.warn("fluency update failed", err=e)

        if item.confidence is not None:
            try: await record_confidence(user_id, item.question_id, item.confidence, item.is_correct)
            except Exception as e: log.warn("confidence record failed", err=e)
```

Best-effort try/except matches the existing pattern (S22 / S27 / S29). A transient failure in any fan-out **does not** roll back the load-bearing topic-mastery + readiness updates.

### Per-concept IRT θ — explicitly deferred

Per ADR-0017, per-concept IRT requires ≥ 30 items/concept. Current item bank (480 items / ~100 backfilled concepts ≈ 1–5 items/concept) cannot calibrate. Per-(concept, bloom) EWA is the v1 mastery signal. Per-concept IRT lands as a future follow-up; no sprint claimed.

### New endpoints

| Endpoint | Sprint |
|---|---|
| `GET /analytics/concept-mastery/{user_id}` | P5-S39 |
| `GET /analytics/student/{user_id}/multi-profile` | P5-S39 |
| `GET /analytics/transfer/{user_id}` | P5-S41 |

### Tests added

- 12 concept-mastery tests + 8 bloom-mastery tests + 8 fluency tests + 6 confidence + brier tests + 6 transfer tests (P5-S39, P5-S41).
- 4 catalog-client integration tests (P5-S37.5).
- 8 process-session fan-out tests covering: happy path with all dimensions, transient failure in each dimension does not roll back primary mastery, missing concept tags fail-soft.

---

## 4. alp-identity (Python / FastAPI) — Phase 5 LLD addendum

**Parent**: [`02_auth_and_profile/`](02_auth_and_profile/) per-service LLDs + Phase 4 addendum.

**No Phase 5 changes** — target-goals + profile fields shipped in P4-S30 already cover Phase 5 needs.

### Internal endpoint changes (none)

`/profile/me/goals` and `/internal/profile/{user_id}` continue to serve unchanged. Phase 5 multi-parameter mastery does not require new identity-side fields.

---

## 5. alp-marketplace + alp-payment

**No Phase 5 changes** to either service.

---

## 6. Frontend modules — Phase 5 LLD addendum

### apps/web-portal (S44, S45, S47)

```
src/
├── pages/
│   ├── QuestionAuthor.tsx           # MODIFY (P5-S45) — multi-type router
│   ├── TranslationReview.tsx        # NEW (P5-S43)
│   ├── CulturalReview.tsx           # NEW (P5-S43)
│   ├── CostDashboard.tsx            # NEW (P5-S45)
│   └── CalibrationDashboard.tsx     # NEW (P5-S47)
├── components/
│   ├── DiagramCanvas.tsx            # NEW (P5-S44) — shared canvas (HOTSPOT/LABEL/MAP)
│   ├── ConceptTagger.tsx            # NEW (P5-S45) — multi-select against concept tree
│   ├── AIDraftPanel.tsx             # NEW (P5-S45) — AI authoring assist
│   └── RubricEditor.tsx             # NEW (P5-S42 hooks, S45 UI)
└── lib/
    ├── question_author_state.ts     # pure-function multi-type wizard state
    ├── concept_tagger.ts            # pure helpers
    ├── translation_review.ts        # pure side-by-side helpers
    └── cost_calc.ts                 # pure cost-rollup helpers
```

### apps/web-student (S46)

```
src/
├── pages/
│   ├── ConceptProfile.tsx           # NEW (P5-S46) — 9-dim radar per topic
│   ├── DiagnosticDeepDive.tsx       # NEW (P5-S46) — root-cause path visualisation
│   └── WeaknessDiagnosis.tsx        # MODIFY (P5-S41) — concept-grain
├── components/
│   ├── renderers/
│   │   ├── ObjectiveRenderer.tsx    # NEW (P5-S46) — 5 objective types
│   │   ├── NumericRenderer.tsx      # NEW (P5-S46)
│   │   ├── MatchingRenderer.tsx     # NEW (P5-S46)
│   │   ├── FillInRenderer.tsx       # NEW (P5-S46)
│   │   ├── SubjectiveRenderer.tsx   # NEW (P5-S46)
│   │   └── VisualRenderer.tsx       # NEW (P5-S46) — DiagramCanvas student-side
│   └── ConfidenceSlider.tsx         # NEW (P5-S39) — per-question optional input
└── lib/
    ├── concept_profile.ts           # pure helpers — 9-dim radar shape
    ├── diagnostic_path.ts           # pure helpers — root-cause graph layout
    └── question_renderer.ts         # pure helpers — type → component dispatch
```

### Human Grader Application (NEW surface, S43)

Decision pending (ENG-OAQ-10): separate web app vs sub-route in web-admin. Either way:

```
src/
├── pages/
│   ├── GraderQueue.tsx              # filtered by language + subject
│   ├── GradingView.tsx              # stem + rubric + model answer + student response (anonymised) + AI suggestion (collapsible)
│   ├── CalibrationSet.tsx           # 3 pre-graded items at session start
│   └── TimeTracking.tsx             # outlier detection
└── lib/
    ├── grader_queue.ts              # pure helpers
    └── anonymisation.ts             # ensure student id never visible
```

### apps/mobile (Flutter) — Phase-4-Mobile sprint

Per-type renderers + ConfidenceSlider absorb into the existing Phase-4-Mobile standalone sprint catalogued at [`Phase4_Mobile_Parity_Scope.md`](../02_planning/Phase4_Mobile_Parity_Scope.md). Single unified mobile push covers S22–S35 + S37–S48 surfaces.

---

## 7. Cross-cutting concerns

### 7.1 Dependency injection (alp-learning)

Type Handler Protocol implementations resolve concrete dependencies via FastAPI's `Depends()`:

- `payload_schema` and `response_schema` are class-level attributes; dispatched by registry.
- `ai_generate_draft` and `ai_quality_check` take an `ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)]` dependency.
- `evaluate` for AI_ASSISTED / HYBRID types uses the same Gateway dep.

### 7.2 Async / sync boundaries

- DETERMINISTIC handlers expose `evaluate` as `async def` for protocol uniformity but contain no awaits in the hot path. Latency p99 < 10 ms preserved.
- AI_ASSISTED / HYBRID handlers `await` the Gateway. Latency p95 < 8 s. Quiz Go's HTTP client uses 15 s timeout per [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md) routing config.

### 7.3 Type Handler conformance test

```python
def test_all_handlers_implement_protocol():
    """Registration fails fast if any handler is missing a Protocol method."""
    for type_id in registry.all_types():
        handler = registry.get_handler(type_id)
        for method in PROTOCOL_METHODS:
            assert hasattr(handler, method), f"{type_id} missing {method}"
            assert callable(getattr(handler, method))
```

Runs at service startup; any handler missing a method blocks deployment.

### 7.4 Evaluation re-runs

Per ADR-0018, `evaluation_records` is **immutable**. Re-evaluation (rubric edit, prompt version bump, admin manual trigger) inserts a new record; old record retained for audit + appeal. Endpoint `POST /evaluation/responses/{id}/re-evaluate` (P5-S47) admin-only.

### 7.5 Rate limiting + circuit breakers

AI Gateway providers wrapped in circuit breakers (5 consecutive failures → open for 60s). Per-touchpoint + per-creator quotas Redis-backed. Cost dashboard surfaces all metrics in real-time at admin endpoint.

### 7.6 Smoke counter growth

Phase 4 closed at smoke = 66. Phase 5 grows the smoke suite from 66 → ~120 over 12 sprints. New `make smoke-types`, `make smoke-grading`, `make smoke-translation` targets for sub-suite running.

---

## 8. Service ceiling check

[ADR-0005](../adr/0005-service-consolidation.md) sets ceiling = 6 (5 today + 1 marketplace). Phase 5 adds **zero new services**.

| Logical capability | Phase 5 home | Why not a separate service |
|---|---|---|
| AI Gateway | module inside `alp-learning` per [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md) | Bulk of LLM consumers (authoring, quality, translation, evaluation) are content-shaped; co-location avoids 7th-pod operational overhead. Reversible — ADR-0021 (deferred) reserves split when alp-learning latency p95 crosses threshold. |
| AI Authoring | module inside `alp-learning` | Wraps Gateway with type-aware drafts; lives next to `learning.types` and `learning.content`. |
| Localisation | module inside `alp-learning` | Walks payload via `handler.translatable_fields()`; needs direct access to type registry. |
| Evaluation Service (Type Dispatcher) | module inside `alp-learning` | Owns Resolution emission; needs direct access to type registry + AI Gateway + grader queue. |
| Knowledge Graph | extends `learning.catalog` schema + new `learning.kg` package | Graph + topology operations are catalog-shaped; no new boundary. |
| Multi-parameter mastery | extends `engagement.analytics` schema + new modules | Already inside the analytics fan-out; no boundary change. |

**Total services after Phase 5: still 5 deployable + 1 reserved marketplace.** Service ceiling preserved.

---

## 9. Verification + rollback

Per-sprint verification gates documented in [`02_planning/54_Phase5_MultiParameterEngine_SprintPlan`](../02_planning/54_Phase5_MultiParameterEngine_SprintPlan.md) §"Sprint sequence" and the [build plan](../../.claude/plans/gentle-popping-diffie.md) §"Verification". Rollback discipline:

- Migrations are additive + reversible (down-migrations tested in staging).
- New routes added; existing routes never deleted.
- Old code paths preserved behind `question_type='MCQ_SINGLE'` until multi-type path is verified.
- AI Gateway disable-able platform-wide via flags (`ai_authoring_enabled`, `ai_quality_checks_enabled`, `ai_evaluation_enabled`, `ai_localisation_enabled`); platform falls back to manual + DETERMINISTIC paths gracefully.
- Each sprint cuts over one cluster behind a feature flag where applicable. Rollback = revert one sprint commit.

---

## 10. Open questions (Phase 5 LLD)

| ID | Question | Owner | Decision by |
|---|---|---|---|
| ENG-OAQ-13 (NEW) | Quiz Go FORMULA_INPUT symbolic equivalence: sympy-via-subprocess vs pure-Go vs HTTP fallback to alp-learning? | Eng (Go) | Before P5-S38 |
| ENG-OAQ-14 (NEW) | Composite types (CASE_STUDY) — atomic submit transaction vs per-child eventual-consistency? Trade-off: latency vs consistency. | Eng (Python) | Before P5-S42 |
| ENG-OAQ-15 (NEW) | DiagramCanvas — server-side hotspot validation vs client-only? Trade-off: load on alp-learning vs trust in client. | Eng (Frontend) | Before P5-S44 |

(Also see ENG-OAQ-1 through ENG-OAQ-12 in the architecture addendum for cross-Phase open questions.)
