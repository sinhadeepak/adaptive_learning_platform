# User Stories — Content Engine Question Catalogue

*Adaptive Learning Platform · User Stories · Content Engine v1.0 · CONFIDENTIAL*

**30 stories · 184 points** · spans question type handlers, AI Gateway, AI authoring assistance, AI evaluation pipeline, localisation pipeline, and human grader application.

| Attribute | Value |
|---|---|
| Document Title | User Stories — Content Engine Question Catalogue |
| Companion to | Question Catalogue LLD v1.0, AI & Multilingual Architecture v1.0 |
| Story prefix | `CE-*` (Content Engine) |
| New stories | 30 (CE-101 through CE-630) |
| Total points | 184 |
| Suggested distribution | Sprint 1: 26 · Sprint 2: 38 · Sprint 3: 36 · Sprint 4: 38 · Sprint 5: 32 · Sprint 6: 14 |
| Classification | CONFIDENTIAL |

> **Note:** Service ownership for these stories is revised by the **Service Consolidation Addendum (v1.0)** — see §8 of that document. The story scope and points are unchanged; only the owning service shifts. The references below to "Evaluation Service" and "Localisation Service" should be read as logical responsibilities; physical implementation lives inside Quiz/Moderation/Content per the consolidation.

---

## Epic CE-1 · Foundations

Establishes the type-dispatcher pattern, the new microservices, the AI Gateway, and the storage model. All later stories depend on these.

### CE-101 · Type dispatcher framework + handler protocol

**8 pts · P0**

> **As a** platform engineer, **I want** a Python module-level type registry that loads handlers at startup and routes calls, **so that** every later type can be added by writing one handler module.

**Acceptance criteria**
1. Registry exposes `get_handler(type_id)`, `is_supported(type_id)`, `all_types()`, `filter_by_family(family)`.
2. Handler protocol (per LLD §3.1) enforced via Python Protocol; missing methods cause startup failure.
3. MCQ_SINGLE handler shipped as the reference implementation, exercising every protocol method.
4. Adding a new type requires (a) one handler module, (b) one registration line. No DB migration required.
5. Unit tests cover: registration, lookup, missing-type error path, all_types completeness.

**Technical notes**
- Handlers are singletons; no per-request state.
- Registry is read-only after startup.
- `translatable_fields()` returns dotted-path list (e.g. `'options[*].text'`) for the localisation walker.

**QA test cases**
- Lookup of registered type → correct handler.
- Lookup of unregistered type → explicit error, no silent fallback.
- MCQ_SINGLE evaluation matches baseline on 100 historical responses.

---

### CE-102 · Evaluation Service scaffolding

**8 pts · P0**

> **As a** platform engineer, **I want** a new Evaluation Service exposing `/evaluation/evaluate` and gRPC equivalents, **so that** every quiz submission has one place to call for response judgement.

**Acceptance criteria**
1. Python FastAPI + grpcio. Stateless. EKS deployment with HPA on CPU > 60%.
2. Returns Resolution shape per the LLD §1.2 contract — never marks.
3. Reads artifact payloads from Content Service via gRPC; no DB access in Evaluation Service.
4. Health check, OpenAPI, Prometheus metrics endpoint included.
5. Quiz Service migrated to call this in place of any inline scoring code.
6. Telemetry: `ce_evaluation_total{type, status}` counter; `ce_evaluation_duration_seconds` histogram.

**QA test cases**
- End-to-end submission produces identical Resolution to baseline for all DETERMINISTIC types.
- 500 concurrent `/evaluate` calls succeed within latency SLO.
- Service health = unhealthy when Content Service unreachable.

---

### CE-103 · Storage migration — translations, media, rubrics, evaluation_records, ai_jobs

**5 pts · P0**

> **As a** platform engineer, **I want** the new tables created and indexed, **so that** later stories have somewhere to write to.

**Acceptance criteria**
1. Five tables created per LLD §3.3 with correct foreign keys.
2. Indexes: `translations(artifact_id, language)`, `media(artifact_id)`, `evaluation_records(response_id, evaluator_kind)`.
3. Backfill: existing artifacts get a translations row for their primary language pointing at their own payload.
4. Migration is reversible (down migration tested in staging).

**QA test cases**
- Existing artifacts continue to render unchanged post-migration.
- Insert into each new table from a unit test succeeds.
- Rollback migration restores the prior schema cleanly.

---

### CE-104 · Type registry API endpoints

**5 pts · P0**

> **As a** frontend engineer, **I want** `GET /content/types` and friends returning the registry, **so that** the authoring UI knows which types exist and what their schemas look like.

**Acceptance criteria**
1. `GET /content/types` returns array of `{type_id, family, evaluation_mode, supports_partial}`.
2. `GET /content/types/{id}/payload-schema` returns JSON schema.
3. `GET /content/types/{id}/translatable-fields` returns dotted-path list.
4. `GET /content/exams/{examId}/supported-types` returns filtered array.
5. All cached at edge (5 min TTL); updated via cache-purge event on registry change.

**QA test cases**
- Endpoint returns 16+ types after CE-1 epic complete.
- Schema endpoint returns valid JSON Schema parseable by Ajv.
- Cache-purge propagates within 30 seconds.

---

## Epic CE-2 · Type Handlers

One story per type or per closely-related cluster. Each handler ships with payload schema, evaluation logic, review checklist, translatable-fields contract.

### CE-201 · Objective family handlers (5 types)

**8 pts · P0**

> **As a** creator, **I want** to author all five objective question types, **so that** I can cover the universal objective formats used across every exam.

**Acceptance criteria**
1. Handlers shipped: MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ASSERTION_REASON, MULTI_STATEMENT.
2. Each handler validates payload, evaluates response deterministically, exposes review checklist + translatable fields.
3. ASSERTION_REASON auto-derives canonical option (A/B/C/D/E) from three boolean flags.
4. MULTI_STATEMENT validates internal consistency (statement-level flags align with marked correct option).
5. MCQ_MULTI supports partial-correct status (any incorrect selected → INCORRECT per JEE Adv rule, configurable via `partial_credit` flag).

**QA test cases**
- Five handlers register correctly in the dispatcher.
- Each handler's evaluate returns the right status for happy path + edge cases.
- ASSERTION_REASON: all five flag combos produce expected canonical option.
- MULTI_STATEMENT validation catches statement-flag / correct-option mismatches.

---

### CE-202 · Numeric & Quantitative family (4 types)

**8 pts · P0**

> **As a** JEE/GATE creator, **I want** to author numeric questions including formula input, **so that** I can cover the numerical-answer formats used in engineering exams.

**Acceptance criteria**
1. Handlers: NUMERIC_INTEGER, NUMERIC_DECIMAL, NUMERIC_RANGE, FORMULA_INPUT.
2. FORMULA_INPUT uses sympy for symbolic equivalence; `(x+1)²` and `x²+2x+1` evaluate equal.
3. DECIMAL accepts tolerance ±absolute; RANGE accepts `[low, high]` inclusive.
4. Unit field rendered alongside input; locale-aware.
5. Author UI rejects malformed payloads (e.g. RANGE with low > high).

**QA test cases**
- INTEGER 30, student 30 → CORRECT; student 30.0 → CORRECT; student 30.1 → INCORRECT.
- DECIMAL 3.14 ± 0.01: 3.13 CORRECT; 3.16 INCORRECT.
- FORMULA equivalence: `x² + 2x + 1` vs `(x+1)²` → equal.
- FORMULA student input that fails sympy parse → INCORRECT with hint.

---

### CE-203 · Matching & Ordering family (3 types)

**8 pts · P0**

> **As a** creator, **I want** match-the-following, sequencing, and classification handlers, **so that** I can cover NEET Biology, UPSC, and CAT logical reasoning patterns.

**Acceptance criteria**
1. Handlers: MATCH_THE_FOLLOWING, SEQUENCING, CLASSIFICATION.
2. MATCH supports unequal list lengths (distractors in list_b).
3. SEQUENCING evaluates element-by-element; longest-correct-prefix metric available as alt.
4. CLASSIFICATION supports multiple items per category and empty categories.
5. All three return per_part detail showing per-item correctness for analytics.

**QA test cases**
- MATCH all 4 correct → CORRECT; 2 of 4 → PARTIAL_CORRECT (matched=2).
- SEQUENCING all-or-nothing default; partial-prefix metric returns matched_prefix length when configured.
- CLASSIFICATION 7 items into 3 categories scores per item.

---

### CE-204 · Fill-in & Cloze family (4 types)

**8 pts · P0**

> **As a** creator, **I want** fill-in-the-blank, cloze passage, and short-text handlers, **so that** I can cover CBSE, CAT, and language-exam formats.

**Acceptance criteria**
1. Handlers: FILL_BLANK_SINGLE, FILL_BLANK_MULTI, CLOZE_PASSAGE, SHORT_TEXT.
2. Match modes: exact, case_insensitive (default), fuzzy_token. Regex hidden from creators (admin-only).
3. Fuzzy threshold defaults 0.85; per-blank override.
4. CLOZE_PASSAGE supports word_bank (closed list) and free-fill (open).
5. SHORT_TEXT marked AI_ASSISTED — handler invokes AI Gateway with key concepts; returns Resolution with confidence.

**QA test cases**
- Fuzzy 'photosintesis' against accepted ['photosynthesis'] at 0.85 → CORRECT.
- Fuzzy obvious mismatch → INCORRECT.
- MULTI 3 blanks, 2 correct, partial=true → PARTIAL_CORRECT.
- SHORT_TEXT mocked Gateway returns confidence; handler returns PENDING_HUMAN_REVIEW when < 0.75.

---

### CE-205 · Subjective family handlers — ESSAY, DESCRIPTIVE_LONG, COMPREHENSION_LONG

**13 pts · P0**

> **As a** UPSC/GATE/CBSE creator, **I want** to author long-form questions with rubric-driven evaluation, **so that** I can cover essay, descriptive, and reading comprehension formats.

**Acceptance criteria**
1. Handlers: ESSAY, DESCRIPTIVE_LONG, COMPREHENSION_LONG.
2. Authoring UI captures stem, expected word count range, model answer, structured rubric.
3. Rubric editor enforces criteria-have-weights; weights sum to 100 (rubric-internal, not marks).
4. Authoring requires a model answer; AI verifies model answer covers each criterion.
5. `evaluate()` invokes AI Gateway evaluation prompt; returns Resolution with per-criterion satisfaction (0/0.5/1) and confidence.
6. COMPREHENSION_LONG composite: parent passage + child questions; child of any type.

**Technical notes**
- Rubric stored in `evaluation_rubrics` table, versioned.
- Each evaluation produces an `evaluation_record` (immutable on re-evaluation).
- Calibration sample (5%) routed to humans regardless of confidence.

**QA test cases**
- Author submits essay missing rubric → 422 with field hint.
- AI evaluation with mock confidence 0.95 → CORRECT/PARTIAL based on per-criterion.
- AI evaluation with mock confidence 0.65 → PENDING_HUMAN_REVIEW; enqueued.
- Rubric edit creates new version; old responses retain old rubric_version reference.

---

### CE-206 · CASE_STUDY composite handler

**8 pts · P0**

> **As an** MBA-prep creator, **I want** case study questions with mixed-type sub-questions, **so that** I can cover CAT and other case-based formats.

**Acceptance criteria**
1. CASE_STUDY artifact stores scenario passage + ordered list of `child_question_ids`.
2. Each child is any other type (often objective, short-text, essay mix).
3. Submit parent → all children + parent enter IN_PEER_REVIEW atomically.
4. Parent cannot publish until all children publish.
5. `evaluate()` iterates children; returns CompositeResolution `{ children: [Resolution], aggregate: {...} }`.

**QA test cases**
- Submit parent + 3 children → all 4 in queue.
- Approve parent + 2 of 3 children → parent stuck in APPROVED until 3rd child publishes.
- Student answers all 3 children → composite returns 3 child Resolutions plus aggregate counts.

---

### CE-207 · Visual & Spatial family — DIAGRAM_HOTSPOT, DIAGRAM_LABEL

**13 pts · P0**

> **As a** creator, **I want** to author diagram-based questions with hotspot and label modes, **so that** I can cover NEET anatomy, geography labelling, and similar visual formats.

**Acceptance criteria**
1. Handlers: DIAGRAM_HOTSPOT, DIAGRAM_LABEL.
2. Shared Diagram Authoring Canvas component (CE-208 dependency).
3. HOTSPOT supports circle, rect, polygon shapes; tolerance_px Minkowski expansion.
4. LABEL: markers + labels; reuses MatchHandler internally for evaluation.
5. Frontend normalises clicks to image-pixel coordinate system before submitting.
6. Image upload: 4 MB max; auto-WebP at 3 resolutions; content-hash verified at fetch.
7. Author confirms 'I have rights to use this image' checkbox before submit.

**QA test cases**
- Click inside correct circle → CORRECT; click in distractor rect → INCORRECT with hit_id captured.
- Polygon shape: concave polygon ray-casting works correctly.
- Tolerance 10 px: click 8 px outside → CORRECT.
- Image upload at device pixel ratio 2x: clicks normalise to original-image coords.

---

### CE-208 · Diagram authoring canvas (shared component)

**8 pts · P0**

> **As a** frontend engineer, **I want** a single React canvas component for hotspot and label authoring, **so that** both diagram types share the same UX.

**Acceptance criteria**
1. React component supports image upload (PNG/JPG/SVG; 4 MB max).
2. Auto-generates WebP at 3 resolutions (mobile, tablet, desktop).
3. Toolbar: select, circle, rect, polygon, marker.
4. Click-and-drag draws shapes; click-to-add-vertex polygons (close with double-click).
5. Selected shape moveable, resizeable, deletable.
6. Coords persisted in image-pixel space, independent of viewport zoom.
7. Preview mode hides overlays.
8. Reused by HOTSPOT, LABEL, MAP_LOCATION authoring.

---

### CE-209 · MAP_LOCATION handler with map tile renderer

**8 pts · P1**

> **As a** geography creator, **I want** to author map-based questions on a real map, **so that** I can cover UPSC and CBSE geography formats.

**Acceptance criteria**
1. MAP_LOCATION handler treats hotspots as lat/long polygons.
2. Map tile renderer integrated (Mapbox or OpenStreetMap-based; decision tracked as OAQ).
3. Author selects a base map (India, world, custom) and zoom level; draws hotspot region.
4. Student sees the map; clicks; click converted to lat/long; point-in-polygon evaluated.
5. Map locale: tile labels rendered in student's preferred language where supported by tile provider.

**QA test cases**
- Author draws India outline, hotspot on Maharashtra → student click in Mumbai → CORRECT.
- Tile labels render in Devanagari when `student.preferred_language = hi` (where provider supports).

---

### CE-210 · PICTORIAL_IDENTIFY handler

**5 pts · P1**

> **As a** creator, **I want** image-based 'identify what's shown' questions, **so that** I can cover art history, biology species ID, monument identification.

**Acceptance criteria**
1. PICTORIAL_IDENTIFY handler: image + 4 text options + correct answer.
2. Reuses MCQ_SINGLE evaluation logic with image rendering metadata.
3. Image upload via the standard media pipeline (CE-208 plumbing).
4. AI generates plausible distractor options given the correct answer + image (visually similar items).

**QA test cases**
- Author uploads monument image, picks correct answer, AI suggests 3 distractor monuments.
- Student picks distractor → INCORRECT.
- Image rendered at student's device resolution.

---

### CE-211 · Audio/Video family scaffolding (flag-gated)

**5 pts · P2**

> **As a** platform engineer, **I want** the LISTENING_COMP and VIDEO_QUESTION authoring UIs, **so that** the data model is ready for Phase 2 enablement.

**Acceptance criteria**
1. Handlers: LISTENING_COMP, VIDEO_QUESTION (composite parent + child).
2. Authoring UI uploads media; transcoded to MP3/MP4 web-safe.
3. Auto-transcript via Whisper; author edits and approves.
4. Submit returns 503 FEATURE_DISABLED while `audio_video_questions_enabled = false`.
5. When flag flipped: full submission flow active.

---

### CE-212 · Interactive/Gamified family scaffolding (flag-gated)

**5 pts · P2**

> **As a** platform engineer, **I want** KBC_LIFELINE, TIMED_REVEAL, ADAPTIVE_DIFFICULTY wrappers, **so that** we can ship gamified content for entertainment formats.

**Acceptance criteria**
1. All three are wrappers atop existing types — store gamification metadata.
2. KBC_LIFELINE: which lifelines available (50:50, audience poll, phone-a-friend) + payload-affecting metadata.
3. TIMED_REVEAL: schedule of additional info reveals at preset intervals.
4. ADAPTIVE_DIFFICULTY: pool of variants at increasing difficulty.
5. Submit returns 503 FEATURE_DISABLED while `interactive_questions_enabled = false`.

---

## Epic CE-3 · AI Services

### CE-301 · AI Gateway service

**13 pts · P0**

> **As a** platform engineer, **I want** a single internal service all AI calls flow through, **so that** we have one place for vendor abstraction, observability, and cost control.

**Acceptance criteria**
1. Service exposes `call(touchpoint, prompt_template_id, inputs, schema)` → validated structured result.
2. Routing config loaded from `/config/ai_routing.yaml`; reload on config-change event.
3. Provider implementations: OpenAI, Anthropic, Google. Fallback on primary failure.
4. Schema validation: rejects free-form text outputs.
5. Cache for deterministic-input prompts (e.g. translation of identical text).
6. Per-touchpoint and per-creator quotas enforced before provider call.
7. Telemetry: `ai_gateway_call_total`, latency, cost, tokens, cache hits.
8. Per-call audit log retained 90 days.

**Technical notes**
- Stateless service; quotas in Redis.
- Cost calculator updated per-provider per-month based on published rates.
- Provider clients have circuit breakers; open after 5 consecutive failures, retry after 60s.

**QA test cases**
- Successful call returns validated schema instance.
- Provider timeout triggers fallback; second provider returns success.
- Both providers fail → AIGatewayError surfaced; metrics show two provider-error rows.
- Quota exceeded → 429 with `quota_reset_at`.

---

### CE-302 · Prompt template registry

**5 pts · P0**

> **As an** ML engineer, **I want** version-controlled prompt templates loaded at service startup, **so that** every AI call references a known prompt version.

**Acceptance criteria**
1. Templates stored as YAML in `/prompts/{touchpoint}/{template_id}_v{version}.yaml`.
2. Loader validates: id present, version semver, output_schema reference resolves, few_shot examples valid.
3. `ai_gateway.call()` requires (template_id, version) — explicit version, no implicit 'latest'.
4. Audit log captures `template_id` and version per call.

**QA test cases**
- Loading malformed YAML fails startup with explicit error.
- Missing schema reference fails startup.
- Calling unknown template_id raises in calling service.

---

### CE-303 · AI Authoring — `draft_question` for objective types

**8 pts · P0**

> **As a** creator, **I want** to draft an MCQ from a topic + difficulty, **so that** I save 80% of the typing on routine question generation.

**Acceptance criteria**
1. `POST /content/ai/draft` accepts `(type_id, topic, difficulty, exam, syllabus_chapter?, source_material?)`.
2. Returns full payload of the requested type, marked AI_DRAFT.
3. Author edits in standard authoring form; AI badges per field.
4. Audit log captures: prompt template version, model, original payload, edit distance per field at submit time.
5. Daily quota enforced (default 50; admin override).

**QA test cases**
- Draft for NEET Biology MCQ_SINGLE 'Photosynthesis' EASY returns valid payload.
- Author submits unedited → reviewer queue shows zero-edit warning + raw AI badge.
- Quota exhausted → 429 `quota_reset_at` returned.

---

### CE-304 · AI Quality checks (3 of 6 in v1)

**8 pts · P1**

> **As a** peer reviewer, **I want** automatic warnings on submitted artifacts, **so that** I focus my attention on questions with potential issues.

**Acceptance criteria**
1. `POST /content/ai/quality-check` accepts payload; runs three checks: ambiguity, distractor plausibility, duplicate detection.
2. Returns array of warnings (severity: info | warning), each with reasoning text.
3. Triggered automatically on artifact submit; results attached to the moderation queue item.
4. Reviewer UI displays warnings as collapsible cards.
5. Warnings never block submission; reviewer always retains final say.

**QA test cases**
- Question with 2 defensibly-correct options → ambiguity warning surfaced.
- Question with implausible distractors ('the moon') → plausibility warning.
- Near-duplicate of existing question (similarity 0.94) → duplicate warning with link to existing.

---

### CE-305 · AI Quality checks (remaining 3)

**5 pts · P2**

> **As a** peer reviewer, **I want** syllabus tagging, difficulty estimation, language-quality checks, **so that** AI augments the full reviewer toolset.

**Acceptance criteria**
1. Adds three more quality checks per LLD §2.5.
2. Syllabus tagging: AI maps stem to syllabus topics, compares to author tags.
3. Difficulty estimation: predicted vs author-claimed; mismatch surfaces warning.
4. Tone & language: grammar, clarity, age-appropriateness.
5. All three integrated into the existing `/quality-check` endpoint.

---

### CE-306 · AI Evaluation for SHORT_TEXT and ESSAY

**13 pts · P0**

> **As a** platform engineer, **I want** the Evaluation Service AI path live for short-text and essay types, **so that** subjective responses get judged automatically with confidence-based human escalation.

**Acceptance criteria**
1. Evaluation Service detects type's `evaluation_mode = AI_ASSISTED` or `HYBRID`.
2. Constructs prompt from rubric + model answer + student response; calls AI Gateway.
3. Validates output against EssayEvaluationSchema (per-criterion 0/0.5/1, overall confidence, flags).
4. If confidence < 0.75 → status = PENDING_HUMAN_REVIEW, enqueues to grader queue.
5. If HYBRID + 5% calibration sample → enqueues even on high confidence.
6. `evaluation_record` persisted with `rubric_version` + `prompt_version`.

**Technical notes**
- Calibration sampling deterministic via `hash(response_id) % 20 == 0`.
- Prompt versioning enforces explicit version reference per call.

**QA test cases**
- Mock Gateway returns confidence 0.92, all criteria 1.0 → CORRECT, no human queue.
- Mock Gateway returns confidence 0.6 → PENDING_HUMAN_REVIEW.
- 5% sampled response with confidence 0.99 → still queued for human (calibration).

---

### CE-307 · Calibration pipeline + dashboard

**8 pts · P1**

> **As an** ML engineer, **I want** weekly calibration metrics computed and dashboarded, **so that** AI evaluation drift is detected before students are affected.

**Acceptance criteria**
1. Weekly batch job: pulls `calibration_samples` (last 30 days), computes Cohen's kappa AI vs human per criterion.
2. Dashboard: kappa per criterion over time; flagging criteria below 0.7.
3. Auto-pause: criterion with kappa < 0.7 → AI evaluation disabled for that criterion; 100% human routing; alert ML Eng + PM.
4. Calibration audit log retained indefinitely.

**QA test cases**
- Synthetic test: 50 samples with deliberate AI/human disagreement → kappa < 0.7 → criterion auto-paused.
- Dashboard shows last 12 weeks of kappa per criterion.

---

### CE-308 · Human Grader Application

**13 pts · P0**

> **As a** human grader, **I want** an interface to grade subjective responses, **so that** low-AI-confidence responses get authoritative judgement.

**Acceptance criteria**
1. Separate web UI; graders log in with their own role.
2. Queue view: filter by language, subject, oldest-first or auto-assigned.
3. Grading view: stem + rubric + model answer + student response (anonymised) + AI's per-criterion suggestion (collapsible).
4. Grader marks each criterion (0 / 0.5 / 1) with one-line justification.
5. Submit → final Resolution emitted; webhook to orchestrator.
6. Daily calibration set: 3 pre-graded items at start of each grader's session; gold-comparison scored.
7. Time tracking per grade; outliers flagged.
8. Second-grader sampling: 10% of completed grades randomly sent to a second grader.

**QA test cases**
- Grader picks item; sees stem + rubric; submits per-criterion grades; orchestrator receives webhook.
- Calibration items at session start: scored against gold; > 15% deviation triggers refresher.
- Anonymised student data: name, age, history not visible.

---

## Epic CE-4 · Localisation

### CE-401 · Localisation Service shell

**8 pts · P0**

> **As a** platform engineer, **I want** the new Localisation microservice with translate API and reviewer queue, **so that** we can run translations through a controlled pipeline.

**Acceptance criteria**
1. Python FastAPI service exposing `/localisation/translate`, `/localisation/jobs/{id}`.
2. Walks payload using `handler.translatable_fields()` — calls AI Gateway translation per field.
3. Reassembles translated payload, stores as DRAFT in `content_artifact_translations`.
4. Async job model: returns `job_id` immediately; polling endpoint for completion.
5. Per-language reviewer queue auto-populated.

**QA test cases**
- Translate an MCQ_SINGLE EN → HI; translation row appears in DRAFT state.
- Numeric values, formula syntax, image URLs unchanged.
- Job polling returns IN_PROGRESS → COMPLETE → final translation_id.

---

### CE-402 · Translation review UI (per-language reviewer)

**8 pts · P0**

> **As a** Hindi language reviewer, **I want** to see source and translation side-by-side and approve/edit/reject, **so that** translations are accurate and consistent before students see them.

**Acceptance criteria**
1. Reviewer queue filtered by language assignment.
2. Side-by-side compare: source field + translated field; edit-in-place.
3. Per-translation actions: approve, edit-and-approve, reject (with reason), request re-translation, flag for cultural review.
4. Edits trigger glossary suggestion: 'Add this term to glossary?'.
5. Approved → translation status PUBLISHED; visible to students in target language.

**QA test cases**
- Reviewer approves unedited → translation PUBLISHED in < 2 seconds.
- Reviewer edits stem and approves → glossary-suggestion modal appears for changed terms.
- Reject with reason → original AI translation preserved with rejection reason in audit log.

---

### CE-403 · Glossary management — schema + admin UI

**8 pts · P0**

> **As a** localisation admin, **I want** to manage subject glossaries per (subject, source_lang, target_lang), **so that** terminology stays consistent across the question bank.

**Acceptance criteria**
1. `localisation_glossary` table per LLD §6.3; categories enforced.
2. Admin UI: CRUD glossary entries; bulk import CSV.
3. Per-translation prompt automatically injects relevant glossary entries (matched by source-text token containment).
4. 'Add to glossary' from review UI creates a candidate entry; admin reviews weekly.

**QA test cases**
- Insert biology EN→HI glossary entry; subsequent translation containing source term uses it.
- Locked term ('Homo sapiens') passes through translation unchanged.
- Bulk CSV import of 50 entries succeeds.

---

### CE-404 · Cultural review queue

**5 pts · P1**

> **As a** cultural reviewer, **I want** a separate queue for content with cultural sensitivity, **so that** we don't auto-approve content that needs deeper context judgement.

**Acceptance criteria**
1. AI translation flags potentially-cultural content (regex + LLM-based heuristic).
2. Flagged translations route to cultural-review queue (separate from regular review).
3. Cultural reviewer can: approve, suggest substitution, mark for not-localising (revert to source language).
4. 5-working-day SLA tracked separately from regular translation review.

**QA test cases**
- Question mentioning a regional festival → flagged for cultural review.
- Cultural reviewer suggests substitution → updated translation queued for re-review.

---

### CE-405 · Translation analytics dashboard

**5 pts · P1**

> **As an** operations lead, **I want** to see translation pipeline metrics, **so that** I can staff reviewer panels appropriately.

**Acceptance criteria**
1. Dashboard surfaces: AI acceptance rate, edit distance distribution, re-translation rate, cultural-flag rate, lead time per language, glossary hit rate.
2. Filter by language and subject.
3. Trends over 12 weeks visible.
4. Export CSV.

---

### CE-406 · Catalog filtering by published-language

**5 pts · P0**

> **As a** student, **I want** to see only questions published in my preferred language, **so that** I never see English questions when I have Hindi enabled.

**Acceptance criteria**
1. Catalog Service filters: `artifact.status = PUBLISHED AND translation.status = PUBLISHED for language = student.preferred_language`.
2. Quiz orchestration honours language filter when picking questions.
3. Fallback configurable per quiz: skip-untranslated OR show-source-language-with-banner.

**QA test cases**
- Hindi student querying catalog → no English-only questions returned.
- Mixed-language quiz with skip-untranslated: only translated questions selected.
- With show-source: English question rendered with 'Translation pending' banner.

---

## Epic CE-5 · Cross-cutting

### CE-501 · PII scrubbing on AI calls

**5 pts · P0**

> **As a** security engineer, **I want** all AI calls scrubbed of student PII before leaving the platform, **so that** we don't leak student data to third-party providers.

**Acceptance criteria**
1. Pre-call middleware in AI Gateway: regex scan for email, phone, name patterns; replace with placeholders.
2. Anonymisation token map stored per-call; output reverse-mapped if needed.
3. Provider data-retention configured to zero where supported (OpenAI/Anthropic enterprise tier, Google).
4. Audit log captures whether PII was found and scrubbed.

**QA test cases**
- Call containing 'student@example.com' → outbound prompt has `[EMAIL]` placeholder.
- Call containing student name in response → name in submitted text replaced.

---

### CE-502 · Image moderation pipeline

**5 pts · P1**

> **As a** platform engineer, **I want** every uploaded image moderated before reaching the review queue, **so that** we don't expose moderators to NSFW or copyrighted-character content.

**Acceptance criteria**
1. Every image upload runs through a content-safety filter.
2. NSFW, violence, copyrighted-character (Disney, Marvel, etc.) detection.
3. Failures block upload; author sees explicit reason.
4. Suspicious-but-not-blocking results route to a separate pre-moderation queue.

---

### CE-503 · Cost dashboard + budget alerts

**5 pts · P1**

> **As a** platform admin, **I want** a daily-updated dashboard of AI spend with budget alerts, **so that** I catch runaway costs before they hit invoicing.

**Acceptance criteria**
1. Dashboard: today/week/month spend per touchpoint, top creators, cost per published question, forecast.
2. Alert at 80% of monthly budget (Slack); escalation at 95%.
3. Per-touchpoint quotas adjustable via admin UI without redeploy.

---

### CE-504 · Re-evaluation triggers

**5 pts · P2**

> **As a** platform admin, **I want** responses re-evaluated when rubric or AI prompt is updated, **so that** score consistency is maintainable when content evolves.

**Acceptance criteria**
1. Endpoint `POST /evaluation/responses/{id}/re-evaluate`.
2. Bulk endpoint to re-evaluate all responses for an artifact (when rubric updated).
3. Old `evaluation_record` preserved (immutable); new record becomes current.
4. Orchestrator notified via webhook; admin policy decides student-visible-score behaviour.

---

## Sprint Distribution

Recommendation: split work across six sprints. Foundations + AI Gateway must complete before type handlers begin. Translation pipeline runs in parallel with type-handler work in S3-S4. Diagram + map work in S5. Audio/Video and Interactive families remain flag-gated stubs.

| Sprint | Pts | Stories |
|---|---|---|
| **Sprint 1** | 26 | CE-101, CE-102, CE-103, CE-104, CE-301 (start) |
| **Sprint 2** | 38 | CE-301 (finish), CE-302, CE-201, CE-202, CE-303, CE-501 |
| **Sprint 3** | 36 | CE-203, CE-204, CE-401, CE-402, CE-403, CE-406 |
| **Sprint 4** | 38 | CE-205, CE-206, CE-306, CE-307, CE-308 (start) |
| **Sprint 5** | 32 | CE-308 (finish), CE-207, CE-208, CE-209, CE-304 |
| **Sprint 6** | 14 | CE-210, CE-211, CE-212, CE-404 |
| **Backlog** | — | CE-305, CE-502, CE-503, CE-504 — non-blocking polish |

**Critical paths:**
- CE-101 → CE-201 → CE-303 — first end-to-end (objective + AI authoring) by end of Sprint 2.
- CE-301 → CE-401 — first translation E2E by end of Sprint 3.
- CE-205 → CE-306 → CE-308 — first subjective evaluation E2E by mid Sprint 4.
- CE-208 (canvas) blocks CE-207, CE-209 — must be in Sprint 5 with diagram handlers.
