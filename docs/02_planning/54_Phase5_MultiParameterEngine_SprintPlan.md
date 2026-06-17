# Phase 5 — Multi-Parameter Adaptive Engine — Sprint Development Plan

**Project**: Adaptive Learning Platform — Phase 5 (Multi-Parameter Engine)
**Planning horizon**: 12 sprints (S37 → S48) at the established single-working-session cadence; ~21 weeks of engineering work.
**Triggered by**: User directive to **invert the typical ed-tech build order** — *"build the engine first to be best-in-industry, then add content"*. Phase 4 closed the exam-prep depth gap on the Allen / Vedantu / Unacademy / PhysicsWallah dimensions; Phase 5 closes the structural gap to Embibe (concept-grain Knowledge Graph + multi-parameter assessment) and lifts ALP to industry-leading on 5 differentiators competitors don't publish.
**Status**: **DRAFT — 3 ADRs proposed (0017, 0018, 0019)**. Sprint plan + build doc are locked; awaiting ADR acceptance + decision-gate closures (see "Pre-sprint gates" below).
**Authoritative inputs**:
- [ADR-0017](../adr/0017-multi-parameter-assessment-engine.md) — 9-dimension multi-parameter assessment substrate at concept grain.
- [ADR-0018](../adr/0018-polymorphic-question-types-and-resolution.md) — 22 question types via Type Handler Protocol + Resolution contract.
- [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md) — AI Gateway as module inside `alp-learning` (preserves ADR-0005 ceiling).
- [Content Engine Question Catalogue](../additional_requirements/Content_Engine_Question_Catalogue.md) — 22 types × 4 evaluation modes spec.
- [AI & Multilingual Architecture](../additional_requirements/AI_Multilingual_Architecture.md) — Gateway + Localisation deep-dive.
- [Phase 5 Build Plan (working doc)](../../.claude/plans/gentle-popping-diffie.md) — comprehensive plan with full schema, API surface, and verification gates.
- [ADR-0005 service consolidation](../adr/0005-service-consolidation.md) — the 5+1 service ceiling, **still load-bearing**: every Phase 5 work item lands as a module inside an existing service.

---

## TL;DR

Phase 5 builds the substrate that makes ALP's adaptive engine industry-leading **even with 480 items today**. Content scaling becomes a content-team job after. Four halves ship together:

1. **Multi-parameter assessment** — 9 dimensions per student per concept (mastery × Bloom-depth × fluency × accuracy patterns × retention × confidence calibration × transfer × procedural × strategic). Embibe matches us on 4; we win on 5 (Bloom-depth, error patterns, confidence calibration, transfer, mastery clamp).
2. **22 question types × 4 evaluation modes** via the **Type Handler Protocol** pattern — one Protocol implementation per type covering authoring + validation + AI assist + evaluation + localisation + rendering + review. Resolution contract emitted by every evaluator (status × matched/total × per_part × evaluation_mode × evaluator_metadata) — **never marks**. Marks live in Quiz/Test orchestration.
3. **AI Gateway as one door** — every LLM call (authoring, quality, evaluation, translation, vision) goes through a single internal Gateway running as a module inside `alp-learning`. Provider-agnostic, schema-validated, cost-budgeted, PII-scrubbed, calibration-aware. **No 7th service.**
4. **Localisation pipeline** — Hindi at v1; Tamil/Telugu/Bengali/Marathi at Phase 2. Per-type `translatable_fields()` walker + glossary injection + per-language reviewer + cultural review queue. Publish independence per language.

| Tier | Sprints | Outcome |
|---|---|---|
| **Foundation** | S37 + S37.5 | Schema + Type Handler Protocol + payload contracts + ADRs land. Engagement → learning HTTP-ified (closes 5 pre-existing smoke failures). |
| **Engine v1** | S38–S40 | AI Gateway + 9 deterministic handlers (Objective + Numeric). Multi-parameter mastery tables + matching/fill-in handlers. AI authoring + 3 quality checks. |
| **Diagnostic** | S41 | Multi-dim selection + root-cause walker + transfer metric. WeaknessDiagnosis upgraded to concept grain. |
| **AI evaluation + localisation + grader** | S42–S43 | Subjective family + AI eval pipeline. Localisation + calibration + Human Grader Application. EN→HI MVP. |
| **Visual + authoring UI** | S44–S45 | Diagram canvas + 4 visual handlers. Multi-type authoring UI + remaining 3 quality checks + cost dashboard. |
| **Profile UI** | S46 | 9-dim radar + diagnostic deep-dive + per-type student renderers. |
| **Gated families + closure** | S47–S48 | Audio/video + interactive scaffolds (gated). Re-evaluation triggers. Calibration + translation analytics dashboards. CE phase retro. |

Best-in-industry assessment substrate by **end of S43 (week 14)**. Remaining 5 sprints polish UX + add LLM-graded types + close gated families.

---

## Pre-sprint gates (decisions that must close before each phase starts)

| Phase | Gate to close | Owner | Decision by |
|---|---|---|---|
| S37 | ADR-0017 / 0018 / 0019 acceptance review; payload contracts locked week 1 | Eng + Product | Before S37 day 1 |
| S38 | AI provider DPDP agreements signed; cost budget approved; routing config seeded | Legal + Sec + Finance | Before S38 |
| S40 | AI authoring quota policy approved (50/day default OK?) | Product | Before S40 |
| S42 | Rubric ownership decided (creator vs admin per ENG-OAQ-6) | Product | Before S42 |
| S43 | Human grader staffing decided (internal vs partnered per ENG-OAQ-3); Grader App location decided (sub-route vs new app per ENG-OAQ-10) | Operations + Eng | Before S43 |
| S44 | Map tile renderer decided (Mapbox vs OSM per ENG-OAQ-8); image storage budget approved | Eng + Finance | Before S44 |
| S47 | Whisper hosting decided (self vs API per ENG-OAQ-9) | ML Eng | Before S47 |

Don't start a phase until its gate is closed. Engineering produces a draft ADR + initial design doc during the prior sprint to make the decision easier.

---

## Sprint sequence

| Sprint | Window | Theme | Key outcomes |
|---|---|---|---|
| **S37** | 2 wk | Schema + Type Handler Protocol + payload contracts | 8 alembic migrations (KG: concepts/concept_edges/skills + Catalogue: question_type/payload/cognitive_demand on questions, question_concepts, evaluation_rubrics, evaluation_records, ai_generation_jobs, content_artifact_translations, content_media, localisation_glossary, exam_question_type_support). Type registry + Protocol ABC + 4 endpoints. Backfill 480 questions and 24 topics (topic-as-root-concept + auto MCQ tagging). ADRs 0017/0018/0019 land in `proposed` state. |
| **S37.5** | 1 wk | HTTP-ify engagement → learning | New `engagement.analytics.learning_catalog_client` replaces every cross-DB JOIN against `catalog_schema.topics` with HTTP. **Closes 5 pre-existing smoke failures** (steps 59, 62, 63, 65) and unblocks S39 cleanly. |
| **S38** | 2 wk | AI Gateway + Objective family + Numeric family | AI Gateway shell (provider abstraction, routing, structured-output enforcement, PII scrubbing, quotas, audit log, metrics). Prompt template registry. **9 deterministic Type Handlers**: Objective family (5) + Numeric family (4 — including FORMULA_INPUT via sympy). New `POST /grading/grade` + `POST /grading/batch`. Quiz Go branches on question_type. ~50 unit tests. |
| **S39** | 2 wk | Multi-parameter mastery + Matching family + Fill-in family | Engagement: concept_mastery + bloom_mastery + fluency + confidence_calibration tables. process_session fan-out (best-effort try/except per existing pattern). Confidence slider in front-end. **3 Matching handlers** (MATCH_THE_FOLLOWING, SEQUENCING, CLASSIFICATION). **3 Fill-in deterministic handlers** (FILL_BLANK_SINGLE, FILL_BLANK_MULTI, CLOZE_PASSAGE — fuzzy-token with per-blank tolerance). |
| **S40** | 2 wk | AI Authoring + 3 Quality Checks + Image moderation | `POST /content/ai/draft` for objective + numeric. `expand_explanation` + `suggest_distractors`. AI_DRAFT marker + edit_distance audit. Quality checks: ambiguity, distractor plausibility, duplicate detection (embedding similarity > 0.92). Per-creator quotas (50/day default). Image moderation pipeline (NSFW + violence + copyrighted-character) for image uploads. |
| **S41** | 2 wk | Multi-dim selection + diagnostic root-cause + transfer ability | `learning.adaptive.multi_dim_selector` + `learning.kg.root_cause` walker (DFS prereq chain, deepest-weak return). New `POST /adaptive/diagnostic/root-cause` + `POST /adaptive/select-multi-dim`. Engagement `transfer.py` (multi-tag vs single-tag baseline). WeaknessDiagnosis.tsx switches to concept grain. |
| **S42** | 2 wk | Subjective family + AI evaluation + SHORT_TEXT | Type Handlers: ESSAY, DESCRIPTIVE_LONG, COMPREHENSION_LONG (composite), CASE_STUDY (composite parent + child types of any kind). SHORT_TEXT (AI_ASSISTED). Evaluation Service AI path: rubric + model answer + student response → AI Gateway (touchpoint=evaluation) → confidence-based routing (≥0.95 auto, 0.75–0.95 sample 5%, < 0.75 to human). Rubric editor in authoring UI. evaluation_records persisted with prompt_version + rubric_version. Re-evaluation triggers stub. |
| **S43** | 2 wk | Localisation + Calibration + Human Grader App | Localisation module shell. Translation pipeline walks payload via `handler.translatable_fields()`, calls AI Gateway per field, stores DRAFT in `content_artifact_translations`. Per-language reviewer queue + UI. Glossary management (CRUD + admin UI + bulk CSV import). Cultural review queue stub. Calibration sampling pipeline (5% HYBRID → humans, deterministic via hash). Human Grader Application (separate web app or web-admin sub-route): grader role, queue view, anonymised grading view, calibration set at session start, time tracking, 2nd-grader 10% sampling. **EN→HI MVP**: first 50 questions translated end-to-end. |
| **S44** | 2 wk | Visual & Spatial family + Diagram canvas | Shared **Diagram Authoring Canvas** React component (image upload 4 MB, auto-WebP at 3 resolutions, toolbar circle/rect/polygon/marker, click-and-drag draws, click-to-add-vertex polygons, coords in image-pixel space). Type Handlers: DIAGRAM_HOTSPOT (point-in-shape + tolerance), DIAGRAM_LABEL (markers + labels, MatchHandler-equivalent), MAP_LOCATION (lat/long polygon, Mapbox or OSM tile renderer per ENG-OAQ-8), PICTORIAL_IDENTIFY (MCQ-equivalent + image). Vision-based AI quality check (anatomical/geographical placement). |
| **S45** | 2 wk | Authoring UI multi-type + 3 remaining Quality Checks + Cost dashboard | QuestionAuthor.tsx multi-type router. ConceptTagger.tsx with prereq-coverage warning. AIDraftPanel UI hooked to S40 backend. RubricEditor.tsx for subjective. TranslationReview.tsx side-by-side. CulturalReview.tsx queue. Quality checks: syllabus tagging accuracy, difficulty estimation, tone & language. Cost dashboard (admin) with 80%/95% budget alerts. |
| **S46** | 1 wk | Multi-dim student profile UI | ConceptProfile.tsx (9-dim radar per topic). DiagnosticDeepDive.tsx (root-cause path visualisation). Per-question-type student renderers (one component per family — `Objective`, `Numeric`, `Matching`, `FillIn`, `Subjective`, `Visual`Renderer). Confidence slider per question. Per-language UI shell (language switch + Hindi at v1). |
| **S47** | 2 wk | Gated families + Re-evaluation + Calibration dashboard | LISTENING_COMP + VIDEO_QUESTION authoring (gated; submit returns 503). KBC_LIFELINE + TIMED_REVEAL + ADAPTIVE_DIFFICULTY wrappers (gated). Whisper transcription pipeline (ready for when flag flips). Re-evaluation triggers (rubric/prompt-version updates produce new immutable evaluation_records). Calibration dashboard: kappa per criterion over 12 weeks; auto-pause indicator; ML alert hook. |
| **S48** | 1 wk | Translation analytics + closure | Translation analytics dashboard (acceptance rate, edit distance distribution, re-translation rate, cultural-flag rate, lead time per language, glossary hit rate). CE phase retro doc. CLAUDE.md refresh. Master phase index update. |

**Total**: 21 weeks across 12 sprints (S37 + S37.5 + S38–S48). At 1 sprint / 2 weeks pace = ~10 calendar months for sequential execution. Best-in-industry assessment substrate by S43 close (week 14).

**Critical paths**:
- S37 → S38 → S40 — first end-to-end (objective + AI authoring) by end of S40.
- S38 → S43 — first translation E2E by end of S43.
- S37 → S42 → S43 — first subjective evaluation E2E mid-S43.
- S44 (canvas) blocks the visual handlers and parts of S45 (authoring UI).

**Possible parallelisation** (with team budget): S40 (AI authoring) alongside S39 (mastery); S44 (visual handlers) alongside S43 (localisation). Best-case sequential-with-overlap: ~7 calendar months.

---

## The 9 dimensions

Per [ADR-0017](../adr/0017-multi-parameter-assessment-engine.md). Each dimension has a concrete signal, named storage, and surfacing endpoint.

| # | Dimension | Storage | Surfaced via |
|---|---|---|---|
| 1 | Concept mastery | `analytics_schema.concept_mastery` | `GET /analytics/concept-mastery/{user}` |
| 2 | Knowledge depth (Bloom) | `analytics_schema.bloom_mastery` | `GET /analytics/student/{user}/multi-profile` |
| 3 | Fluency | `analytics_schema.fluency` | profile endpoint |
| 4 | Accuracy patterns (S29) | `analytics_schema.error_classifications` | existing endpoint |
| 5 | Retention | `analytics_schema.revision_queue` (FK to concept_id) | existing endpoint |
| 6 | Confidence calibration | `analytics_schema.confidence_calibration` | profile endpoint |
| 7 | Transfer ability | derived | `GET /analytics/transfer/{user}` |
| 8 | Procedural skill | `analytics_schema.procedure_attempts` | profile endpoint |
| 9 | Strategic test-taking | derived (S22 + S25) | mock results page |

**Dimensions 2, 4, 6, 7** are where ALP leaps past Embibe.

---

## The 22 question types × 4 evaluation modes

Per [ADR-0018](../adr/0018-polymorphic-question-types-and-resolution.md) and the [Question Catalogue](../additional_requirements/Content_Engine_Question_Catalogue.md). 8 families:

| Family | Types | Evaluation modes | Sprint |
|---|---|---|---|
| Objective | MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ASSERTION_REASON, MULTI_STATEMENT | DETERMINISTIC | S38 |
| Numeric | NUMERIC_INTEGER, NUMERIC_DECIMAL, NUMERIC_RANGE, FORMULA_INPUT | DETERMINISTIC | S38 |
| Matching | MATCH_THE_FOLLOWING, SEQUENCING, CLASSIFICATION | DETERMINISTIC | S39 |
| Fill-in | FILL_BLANK_SINGLE, FILL_BLANK_MULTI, CLOZE_PASSAGE, SHORT_TEXT | DETERMINISTIC + AI_ASSISTED (SHORT_TEXT) | S39 + S42 |
| Subjective | ESSAY, DESCRIPTIVE_LONG, CASE_STUDY, COMPREHENSION_LONG | HYBRID + composite | S42 |
| Visual | DIAGRAM_HOTSPOT, DIAGRAM_LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY | DETERMINISTIC | S44 |
| Audio/Video | LISTENING_COMP, VIDEO_QUESTION | composite (gated) | S47 |
| Interactive | KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY | DETERMINISTIC + wrapper (gated) | S47 |

22 types active in v1; 6 gated stubs ship as schema + authoring UI but submission returns 503 `FEATURE_DISABLED` until the family flag flips.

### Resolution contract

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
```

**Resolution never carries marks.** Marks belong to Quiz/Test orchestration. Same question reused in different tests with different scoring profiles returns the same Resolution.

---

## AI Gateway

Per [ADR-0019](../adr/0019-ai-gateway-and-consolidation.md). Module inside `alp-learning`. Single entry point for every LLM call. Per-touchpoint provider routing, structured-output enforcement, PII scrubbing, cost/quota controls, full observability.

5 touchpoints: `authoring`, `quality_check`, `evaluation`, `translation`, `vision`. Each has primary + fallback provider in `config/ai_routing.yaml`. Reload on config change; no redeploy.

Calibration: weekly Cohen's kappa per criterion; auto-pause AI evaluation if kappa < 0.7; 100% human routing on pause; ML alert.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Per-concept IRT calibration unviable at 480 items | Per-concept IRT explicitly deferred. EWA-based mastery is v1 signal. Lands when item bank ≥ 30/concept. |
| Cross-DB JOIN bugs compound | S37.5 isolates this before S39. |
| Authoring UX gets too complex with 22 types | Type-specific sub-forms with progressive disclosure. MCQ default. Per-exam type filter (catalogue §2.2 coverage matrix). |
| AI hallucinated content reaches students | AI_DRAFT marker + audit log + edit_distance + zero-edit-warning + peer-reviewer + moderator approval all required. AI never publishes. |
| AI evaluation drift over time | Weekly Cohen's kappa per criterion. Auto-pause at < 0.7. 5% HYBRID samples to humans always. |
| AI vendor lock-in | AI Gateway abstracts vendor; routing config flips providers without redeploy. |
| AI cost overrun | Per-touchpoint and per-creator quotas (Redis-enforced). Cost dashboard with 80%/95% budget alerts. |
| Translation introduces ambiguity | Per-language reviewer mandatory on first publish. Cultural review queue. Glossary enforcement. |
| PII leakage to providers | Pre-call regex scrub. Anonymisation token map. Provider zero-data-retention. Self-hosted Llama for sensitive paths (Phase 2). |
| Service ceiling (ADR-0005) | AI Gateway, AI Authoring, Localisation, Evaluation all lands as modules in alp-learning. **No 7th service.** |
| Mobile parity slips further | Phase-4-Mobile sprint absorbs S22–S35 + S37–S48. Single unified mobile push later. |
| Schema lock-in if payload contracts wrong | Pydantic payload contracts land **before** migrations in S37 week 1. |
| Catalogue scope creep (28 types) | 22 types in v1; 6 gated (audio/video + interactive). |
| Re-evaluation explosion when prompt updates | Per-evaluation cap (max 2 automatic re-evaluations); beyond that admin-trigger only. Old evaluation_records preserved immutably. |

---

## Open questions

| ID | Question | Owner | Decision by |
|---|---|---|---|
| ENG-OAQ-1 | Self-host Llama 3.1 / Mixtral for any v1 path (cost / data-residency)? | ML Eng + Sec | Before S38 |
| ENG-OAQ-2 | AI provider data-retention agreements satisfy DPDP for student data? | Legal + Sec | Before S38 |
| ENG-OAQ-3 | Human grader staffing — internal panel vs partnered service? | Operations | Before S43 |
| ENG-OAQ-4 | Glossary management exposed as API for institutions? | Product | Phase 2 |
| ENG-OAQ-5 | Cross-language student response (English Q, Hindi A)? | Product + UX | Phase 2 |
| ENG-OAQ-6 | Rubric ownership: creator-level vs admin-level? | Product | Before S42 |
| ENG-OAQ-7 | 1-day spike before S37 to prototype topic-as-root-concept backfill? | Eng | Before S37 |
| ENG-OAQ-8 | Map tile renderer choice (Mapbox vs OSM)? | Eng + Product | Before S44 |
| ENG-OAQ-9 | Whisper self-hosted vs API for transcription? | ML Eng | Before S47 |
| ENG-OAQ-10 | Human Grader App: separate app vs web-admin sub-route? | Eng | Before S43 |
| ENG-OAQ-11 | Confidence slider UX: numeric vs ordinal buttons? | UX research | Before S39 |
| ENG-OAQ-12 | Calibration dashboard: audience scope? | Product | Before S47 |

---

## What this plan does NOT cover

- **Audio/Video families implementation** (LISTENING_COMP, VIDEO_QUESTION) — schema and authoring stub ship gated; submission returns 503 until flag flipped.
- **Interactive families implementation** (KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY) — wrapper schema only; gated.
- **Phase-2 languages** (Tamil / Telugu / Bengali / Marathi) — pipeline ready; content scope is a separate sprint per language after Phase 5.
- **Mobile parity** — absorbed into the existing Phase-4-Mobile standalone sprint catalogued at [`Phase4_Mobile_Parity_Scope.md`](Phase4_Mobile_Parity_Scope.md). Per-type mobile renderers + confidence slider ride that wave.
- **Per-concept IRT θ calibration** — gated on item-bank ≥ 30/concept (no sprint claimed; long-tail follow-up).
- **BKT-vs-EWA A/B test** — gated on real cohort > 10K active students (long-game research; no sprint claimed).
- **AWS staging cutover** — still AWS-blocked since Phase 1; not gated on Phase 5.

---

## Next session

Land the **Pydantic payload contracts per question type** (S37 week 1 deliverable). 22 type-specific `payload_schema` + `response_schema` Pydantic models + Resolution model + GradeResult harness, locked before migrations land in week 2. Reference: [Phase 5 Build Plan](../../.claude/plans/gentle-popping-diffie.md) §"Type Handler Protocol" and §"Schema additions".
