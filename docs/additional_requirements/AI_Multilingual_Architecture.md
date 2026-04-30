# AI & Multilingual Architecture

**Provider Abstraction · Prompt Versioning · Evaluation Pipelines · Translation Workflow · Glossary Management**

*Adaptive Learning Platform · Architecture Deep Dive · v1.0 · CONFIDENTIAL*

Companion to the Question Catalogue LLD. Goes deep on the four new microservices (AI Gateway, AI Authoring Service, Localisation Service, Evaluation Service) and the cross-cutting infrastructure that makes AI usage safe, observable, vendor-agnostic, and cost-controlled.

> **Note:** The Service Consolidation Addendum (v1.0) revises the deployment model — only **AI Gateway** ships as a new service; the other three workflows fold into Content, Quiz, and Moderation. The architecture below describes the *logical* responsibilities; physical deployment follows the consolidation addendum.

| Attribute | Value |
|---|---|
| Document Title | AI & Multilingual Architecture — Deep Dive |
| Version | v1.0 |
| Companion to | Question Catalogue LLD v1.0 (this document expands §5 and §6) |
| Microservices introduced | 4 — AI Gateway · AI Authoring · Localisation · Evaluation |
| LLM providers supported | OpenAI · Anthropic · Google Gemini · self-hosted (Llama 3.1) for low-stakes paths |
| Languages targeted v1 | English, Hindi |
| Languages targeted Phase 2 | Tamil, Telugu, Bengali, Marathi |
| Classification | CONFIDENTIAL |

---

## 1. AI Gateway — One Door to All Providers

Direct LLM provider integrations scattered across services produce three pathologies: vendor lock-in, inconsistent observability, and uncontrolled cost. The AI Gateway exists to centralise every LLM call. Every service that needs AI calls the Gateway. The Gateway picks a provider, enforces structured output, records cost, and falls back on failure.

### 1.1 What the Gateway Does

1. Routes requests to the configured primary provider for the touchpoint.
2. Validates outputs against the supplied JSON schema; rejects free-form text.
3. On primary failure (timeout, rate limit, schema mismatch), retries on the fallback provider.
4. Logs every call: prompt template id and version, input hash, output, tokens, cost, latency.
5. Caches deterministic-prompt outputs (e.g. translation of identical text) — same input + same prompt + same model → cached response.
6. Enforces per-touchpoint and per-creator quotas before the request reaches a provider.

### 1.2 Provider Routing Configuration

Routing is centrally configured and reloads via a config-change event. No deploy is required to flip providers.

```yaml
# /config/ai_routing.yaml

routing:
  authoring:
    primary:    { provider: anthropic, model: claude-3.7-sonnet, max_tokens: 2000 }
    fallback:   { provider: openai,    model: gpt-4o,            max_tokens: 2000 }
    timeout_ms: 12000
    cost_target_per_call_usd: 0.05

  quality_check:
    primary:    { provider: anthropic, model: claude-3.5-haiku,  max_tokens: 800 }
    fallback:   { provider: openai,    model: gpt-4o-mini,       max_tokens: 800 }
    timeout_ms: 5000
    cost_target_per_call_usd: 0.005

  evaluation:
    primary:    { provider: anthropic, model: claude-3.7-sonnet, max_tokens: 1500 }
    fallback:   { provider: openai,    model: gpt-4o,            max_tokens: 1500 }
    timeout_ms: 15000
    cost_target_per_call_usd: 0.03

  translation:
    primary:    { provider: google,    model: nmt-pro,           max_tokens: 1500 }
    fallback:   { provider: anthropic, model: claude-3.5-sonnet, max_tokens: 1500 }
    timeout_ms: 8000
    cost_target_per_call_usd: 0.01

  vision:
    primary:    { provider: openai,    model: gpt-4o,            max_tokens: 1000 }
    fallback:   { provider: anthropic, model: claude-3.5-sonnet, max_tokens: 1000 }
    timeout_ms: 10000

rate_limits:
  per_creator_per_day:
    authoring: 50
    quality_check: unlimited
    translation: 100
  platform_per_minute:
    authoring: 200
    evaluation: 500
```

### 1.3 Structured Output Discipline

Every Gateway call requires a JSON schema. The Gateway uses each provider's native structured-output mechanism (OpenAI tool calls, Anthropic tool use, Google function calling). Free-form text completions are NOT allowed for any production path. This rules out a class of failures where parsers break on subtly malformed output.

```python
# Calling the gateway
result = await ai_gateway.call(
    touchpoint="quality_check",
    prompt_template_id="mcq_quality_v3",
    prompt_inputs={"stem": "...", "options": [...]},
    schema=QualityReportSchema,
)
# result is a validated QualityReportSchema instance, not a string.
# If the provider returns malformed output, the Gateway retries on fallback
# before raising AIGatewayError.
```

### 1.4 Observability

| Metric / Log | Description |
|---|---|
| `ai_gateway_call_total{touchpoint, provider, status}` | Counter: every call. Status = success \| fallback \| error. |
| `ai_gateway_latency_seconds{touchpoint, provider}` | Histogram: latency per touchpoint per provider. SLO: p95 < timeout/2. |
| `ai_gateway_cost_usd_total{touchpoint, provider}` | Counter: estimated cost in USD. Updated daily. |
| `ai_gateway_tokens_total{touchpoint, provider, kind}` | Counter: input/output tokens per call. |
| `ai_gateway_cache_hit_total{touchpoint}` | Counter: cache hits — same input hash + prompt version. |
| Per-call log | Stored as audit row: (call_id, touchpoint, prompt_version, input_hash, provider, latency, tokens_in, tokens_out, cost, status). Retained 90 days. |

### 1.5 Cost Dashboard

Updated nightly. Visible to platform admins and finance.

- Today / this week / this month spend per touchpoint.
- Top 10 creators by AI generation usage.
- Cost per published artifact (rolled up). Useful for unit-economics reasoning.
- Forecast spend if current rate continues; alert if forecast > 120% of monthly budget.

---

## 2. AI Authoring Service

Helps content creators draft questions faster. Wraps the Gateway with type-aware prompt templates, validates outputs against the type's payload schema, marks every output as AI_DRAFT in the audit log, and never allows AI output to skip the human review queue.

### 2.1 The Three Authoring Operations

| Operation | Behaviour |
|---|---|
| `draft_question` | Given (type_id, topic, difficulty, exam, source_material?), produces a complete payload of the requested type. The author can edit any field. The audit_log records the prompt version, model, and the original draft (preserved for compliance even if the author edits heavily). |
| `expand_explanation` | Given a question payload (with stem and answer), produces a step-by-step solution / explanation. Useful when the author has the question but wants help articulating the reasoning. |
| `suggest_distractors` | Given a question with stem and correct answer, produces 3-5 plausible distractor options. Used after the author writes the stem and correct answer. |

### 2.2 Prompt Template Structure

Every prompt template is stored in version control and has a stable id and a semver version. The template includes: the model role (system prompt), few-shot examples, the schema description, and slots for input variables.

```yaml
# /prompts/authoring/mcq_single_v4.yaml
id: mcq_single
version: 4.2.0
description: "Generate a single-correct MCQ for a given topic and difficulty"

system: |
  You are an expert exam question writer for {exam}. Generate one MCQ on
  {topic} at {difficulty} difficulty. Follow the syllabus strictly: only
  test concepts within {syllabus_chapter}.
  Respond ONLY in the structured tool format provided.
  Distractors must be plausible — common student misconceptions, not absurd.
  Do not include "all of the above" or "none of the above" as an option.

few_shot:
  - input: { topic: "Newton's laws", difficulty: MEDIUM, exam: NEET }
    output:
      stem: "A body of mass 2 kg accelerates at 3 m/s²..."
      options:
        - { id: A, text: "5 N",  is_correct: false }
        - { id: B, text: "6 N",  is_correct: true }
        - { id: C, text: "1 N",  is_correct: false }
        - { id: D, text: "9 N",  is_correct: false }
      explanation: "F = ma = 2 × 3 = 6 N..."

inputs:
  topic:      { type: string, required: true }
  difficulty: { type: enum, values: [EASY, MEDIUM, HARD] }
  exam:       { type: string }
  syllabus_chapter: { type: string }

output_schema: MCQSingleDraftSchema
```

### 2.3 The AI_DRAFT Marker

Every AI-produced payload carries metadata that survives author edits:

- `ai_origin.original_payload` — the verbatim AI output.
- `ai_origin.prompt_template_id` and `version` — what generated it.
- `ai_origin.model` — which model produced it.
- `ai_origin.author_edited` — boolean; true if the author modified any field after generation.
- `ai_origin.edit_distance` — Levenshtein distance between original and final, per field. Reviewers see this — if it's near zero, the AI output went through unedited and the reviewer knows to scrutinise harder.

### 2.4 What the Author Sees

Author opens the 'Generate with AI' panel:

1. Picks the type they want to author.
2. Fills in topic, difficulty, exam (auto-filled from their workspace).
3. Optionally pastes source material (textbook excerpt, syllabus statement).
4. Clicks Generate. Spinner shows; result arrives in 8-15 seconds typically.
5. AI's draft populates the standard authoring form. Author edits as needed. Each field shows a small 'AI' badge that disappears if the author edits that field.
6. Author can hit 'Regenerate with feedback' — provides a brief instruction ('make it harder', 'use Bohr model'), AI produces a new draft.
7. When author submits, the artifact enters the regular peer-review queue. Reviewer sees the AI badges and the audit trail.

### 2.5 Quality Check Service

Separate from generation. Runs automatically on every artifact at submit time. Returns warnings (never blocks).

| Check | What it does |
|---|---|
| **Ambiguity check** | LLM is asked: 'Is the correct answer unambiguous? Could a defensible argument be made for any other option?' Returns boolean + reasoning. If ambiguous, warning surfaced to reviewer with the AI's reasoning. |
| **Distractor plausibility** | Each distractor scored on plausibility (0-1). Low-scoring distractors flagged. |
| **Duplicate detection** | Embedding-similarity search against existing question bank. Flags artifacts with > 0.92 cosine similarity to an existing one. Reviewer can confirm legitimate (e.g. the same concept tested multiple ways) or remove. |
| **Syllabus tagging** | AI maps the stem to syllabus topics; compares with author-supplied tags. Mismatch surfaced as warning. |
| **Difficulty estimation** | Given stem and topic, AI predicts difficulty (EASY / MEDIUM / HARD). Compared with author-supplied difficulty; mismatch flagged. |
| **Tone & language quality** | Checks for grammar, clarity, age-appropriateness. Useful for translated content where AI translations occasionally produce stilted phrasing. |

---

## 3. Evaluation Service

Single point of truth for whether a student response is correct. Every quiz submission flows through here. Returns Resolution (never marks). Hosts the four evaluation modes from the catalogue.

### 3.1 Service Topology

```
POST /evaluation/evaluate
        │
        ▼
  Type Dispatcher
        │
        ├─ DETERMINISTIC: in-process handler runs, returns Resolution.
        │                 No network calls. Latency ~5 ms.
        │
        ├─ AI_ASSISTED:   load rubric → call AI Gateway
        │                 → validate against schema → return Resolution
        │                 with confidence. If confidence < 0.75, sets
        │                 status = PENDING_HUMAN_REVIEW and enqueues to
        │                 Grader Queue.
        │
        ├─ HYBRID:        AI_ASSISTED path + 5% calibration sample
        │                 routed to humans regardless of confidence.
        │                 Returns Resolution immediately with
        │                 status = (AI's status) but human review will
        │                 update it; orchestrator polls or receives webhook.
        │
        └─ HUMAN:         immediate enqueue to Grader Queue. Returns
                          PENDING_HUMAN_REVIEW immediately.
```

### 3.2 The Rubric-Driven LLM Prompt

For AI_ASSISTED and HYBRID evaluation, the prompt is constructed from: (a) the question stem, (b) the rubric (ordered list of criteria with weights), (c) the model answer (gold-standard exemplar), (d) the student response. The output schema is fixed.

```yaml
# /prompts/evaluation/essay_v2.yaml
id: essay_evaluation
version: 2.1.0

system: |
  You are evaluating a student's long-form answer. For EACH rubric
  criterion below, assess whether the student's response satisfies it.
  Return a structured JSON. Do not consider style or grammar — only
  whether the substantive criterion is met.

  Be strict but fair. If a criterion is partially met, score 0.5.
  Provide a one-line justification per criterion.

inputs:
  stem:           { type: string }
  rubric:         { type: list, items: { criterion: string, weight: number } }
  model_answer:   { type: string }
  student_response: { type: string }
  language:       { type: string }   # evaluator runs in this language

output_schema: EssayEvaluationSchema
# {
#   per_criterion: [
#     { criterion_id, satisfied: 0|0.5|1, justification: string },
#   ],
#   overall_confidence: 0.0-1.0,
#   flags: [ "needs_human_review" | "off_topic" | "plagiarism_suspected" ],
# }
```

### 3.3 Calibration Pipeline

AI evaluation drifts. Different model versions, different days, different prompt edits — all change behaviour. The platform runs a continuous calibration loop:

1. Random 5% of HYBRID responses are routed to human grading regardless of AI confidence.
2. Human grades stored alongside AI grades in the `calibration_samples` table.
3. Weekly batch job computes inter-rater reliability (Cohen's kappa) between AI and humans, per criterion.
4. If kappa drops below 0.7 for any criterion: auto-pause AI evaluation for that criterion; route 100% to humans; alert ML Eng + Product.
5. Monthly review meeting examines calibration dashboard; prompt or model changes proposed.

### 3.4 Re-evaluation

Three cases where re-evaluation is needed:

- The rubric was updated (author edited the rubric on a published question).
- The AI prompt template was upgraded (e.g. from v2.1 to v2.2).
- A platform admin manually triggers a re-evaluation (e.g. on appeal).

Each `evaluation_record` stores `rubric_version` and `prompt_version`. On re-evaluation, the previous record is preserved (immutable) and a new record becomes current. Test orchestration sees the new Resolution; if marks change, admin policy decides whether to update student-visible scores or not.

### 3.5 Human Grader Application

Separate UI from authoring. Grader logs in, sees their queue, picks an item:

1. Stem and rubric on the left.
2. Model answer expandable below the stem.
3. Student response on the right (anonymised — no student id visible).
4. AI's per-criterion judgement displayed as a 'starting suggestion' (collapsible).
5. Grader marks each criterion (0 / 0.5 / 1) with a one-line note.
6. Submit → final Resolution, orchestrator notified by webhook.

**Quality controls for graders:**

- Daily calibration set: every grader's day starts with 3 pre-graded responses; their answers are compared to the gold standard. Diverging from gold > 15% triggers a refresher.
- Anonymised: graders never see the student's name, age, or prior performance.
- Time tracking: median grade time per criterion is monitored. Outliers (rushing or stalling) reviewed by lead grader.
- Second-grader sampling: 10% of completed grades randomly sampled and re-graded by a second grader; disagreements resolved by lead grader.

---

## 4. Localisation Service

Owns the translation pipeline. Drives every artifact through the per-language review workflow. Manages glossaries. Coordinates with Content Service to know when a translation is ready to publish.

### 4.1 The Translation Lifecycle Per Language

```
  ┌─ Triggered by: artifact PUBLISHED in primary language
  │  OR explicit request via POST /content/questions/{id}/translations/{lang}/request
  ▼
  Localisation Service receives task
  ▼
  Walks payload using handler.translatable_fields()
  ▼
  For each field, calls AI Gateway (touchpoint=translation)
  with: source text, target lang, glossary terms, type metadata
  ▼
  Reassembles translated payload
  ▼
  Stores in content_artifact_translations as DRAFT
  ▼
  Enters per-language review queue
  ▼
  Per-language reviewer (linguist + subject SME)
    • Side-by-side compare
    • Edit any field
    • Approve / reject / request re-translation
  ▼
  APPROVED → translation status PUBLISHED, language available to students
```

### 4.2 What Gets Translated, What Doesn't

Per-type, exposed via `handler.translatable_fields()`. Common rules:

| Field type | Behaviour | Example |
|---|---|---|
| Question text | Translated | stem, options[*].text, hotspot labels, rubric criteria |
| Numeric values | NOT translated | 30 m/s stays 30 m/s |
| Units | Translated where vernacular form exists | metres → मीटर; m/s stays m/s |
| Image/audio URLs | NOT translated | Phase 2 may add per-language image variants |
| Coordinates and shape data | NOT translated | hotspot coords, marker positions |
| Formula syntax | NOT translated | x² + 2x + 1 stays as is |
| Scientific names | NOT translated (locked glossary) | Homo sapiens stays Homo sapiens |
| Proper nouns | Locked or transliterated | Mahatma Gandhi → महात्मा गांधी (locked entry) |

### 4.3 Glossary Management

Glossaries live in the `localisation_glossary` table, scoped by (subject, source_lang, target_lang). Every AI translation prompt is constructed with the relevant glossary entries injected. This ensures terminology consistency across the question bank.

#### 4.3.1 Glossary Categories

| Category | Description |
|---|---|
| **Platform** | Common UI/exam terms (question, option, attempt) — fixed across all subjects. |
| **Subject** | Discipline-specific (photosynthesis, derivative, Constitution). Curated by domain experts. |
| **Exam** | Exam-specific phrasings ('Choose the correct option' vs 'Mark the right answer'). |
| **Locked** | Terms NEVER translated (scientific names, formulas, proper nouns). |
| **Cultural** | Terms with culturally-specific implications flagged for human reviewer (festivals, religious references, regional politics). |

#### 4.3.2 Glossary Entry Schema

```json
{
  "id": "uuid",
  "subject": "biology",            // or "general", "physics", etc.
  "source_lang": "en",
  "target_lang": "hi",
  "source_term": "photosynthesis",
  "target_term": "प्रकाश संश्लेषण",
  "category": "subject",            // or "platform", "exam", "locked", "cultural"
  "case_sensitive": false,
  "context_hint": "biological process by which plants make food",
  "alt_translations": [],           // accepted variants (for matching, not generation)
  "added_by": "user_id",
  "added_at": "2026-04-15"
}
```

#### 4.3.3 Glossary Workflow

1. During translation, AI Gateway includes glossary terms relevant to the source text in its prompt: 'Translate the following, using these fixed mappings: X → Y, A → B'.
2. Reviewer encountering a missing or wrong term clicks 'add to glossary' on the affected field.
3. Glossary admin (separate role) reviews proposed entries weekly; approves into the canonical glossary.
4. On glossary update, no automatic re-translation happens — that's a separate admin trigger to avoid blowing up the review queue.

### 4.4 Cultural Context Review

Some content cannot be translated literally — political references, religious sensitivities, region-specific examples. These flow through a separate cultural review queue staffed by reviewers familiar with the target region.

- AI flags potentially cultural content during translation (politicians, religious figures, region-specific examples, historical events with contested narratives).
- Cultural reviewer can: approve, suggest a culturally-appropriate substitution, or flag for not localising (use English variant in the translated context).
- Cultural reviews are slower (target SLA 5 working days vs 1 day for general translation review). Operations should plan for this.

### 4.5 Reviewer Assignment & SLA

| Language | Reviewer model | Target SLA |
|---|---|---|
| Hindi | Internal panel of 6 reviewers | First review within 1 working day; resolution within 2 |
| Tamil, Telugu, Bengali, Marathi (Phase 2) | Mix of internal + external freelance pool, vetted | First review within 2 working days; resolution within 4 |
| Other regional (Phase 3) | External agency partnership | First review within 5 working days |
| Cultural review (any language) | Senior reviewers only | 5 working days |

### 4.6 Quality Metrics for Translation

| Metric | Description |
|---|---|
| AI translation acceptance rate | % of AI translations approved by reviewer without edits. Target: > 70%. |
| Edit distance per translation | Mean character-level edit distance between AI output and reviewer-approved version. Lower is better. |
| Re-translation rate | % of translations rejected with 'request re-translation'. Target: < 10%. |
| Cultural flag rate | % of translations flagged for cultural review. Tracks per language; informs panel staffing. |
| Translation lead time | Time from artifact published in primary language to all-languages-published. Tracked per language; SLA-driven. |
| Glossary hit rate | % of translations where ≥ 1 glossary term applied. Target growing over time as glossary matures. |

---

## 5. Cross-Cutting Concerns

### 5.1 Privacy & PII

AI calls must not leak student PII to external providers.

1. Student responses sent to AI evaluator are anonymised — student id, name, email stripped before the Gateway call.
2. Author-uploaded source material is checked for accidentally-pasted PII via a regex scan; matches block submission.
3. Provider data-retention agreements: OpenAI, Anthropic, Google all configured for zero-data-retention API tiers where available.
4. Self-hosted Llama is used for any path where provider data residency is uncertain (e.g. Phase 2 EU students).

### 5.2 Bias Monitoring

LLMs encode training-data biases. The platform monitors for bias in three places:

- *Generation:* review of AI-drafted questions for stereotyped framing (occupations, gender roles, cultural stereotypes). Manual audit quarterly.
- *Evaluation:* response evaluation grades cross-tabulated with student demographics; significant disparities trigger investigation.
- *Translation:* cultural reviewer flags content where source-language framing doesn't preserve appropriately into target.

### 5.3 Failure Modes & Degradation

| Failure mode | Degradation behaviour |
|---|---|
| AI Gateway down | All AI features disabled. Authoring continues in manual mode (no draft assist, no quality checks). Evaluation falls back to DETERMINISTIC types only; AI_ASSISTED and HYBRID responses queued for human grading. Translation jobs queued. |
| Specific provider down | Gateway fails over to fallback provider automatically. Per-touchpoint provider health surfaced on internal dashboard. |
| Vision model down | PICTORIAL_IDENTIFY authoring assist disabled (manual only); image moderation falls back to a basic NSFW classifier; vision-based quality checks skipped. |
| Translation budget exhausted | Translation jobs queue (FIFO). Admin alerted at 80% budget; escalation at 95%. Existing translations remain available. |
| Calibration kappa drop | AI evaluation auto-paused for the affected criterion; 100% human routing for that criterion. ML Eng investigates within 24 hours. |

### 5.4 SLOs

| SLO | Target | Alert at | Measurement |
|---|---|---|---|
| AI Gateway availability | 99.5% | < 99% | External health check + per-touchpoint up rate. |
| Authoring draft latency p95 | < 15 s | > 25 s | Gateway histogram. |
| Evaluation latency p95 (DETERMINISTIC) | < 10 ms | > 30 ms | Per-handler histogram. |
| Evaluation latency p95 (AI_ASSISTED) | < 8 s | > 15 s | Histogram. |
| Translation lead time (HI, p95) | < 36 h | > 48 h | From request to publish. |
| Calibration kappa (per criterion) | ≥ 0.7 | < 0.7 | Weekly batch. |
| AI generation acceptance rate | > 60% | < 40% | Weekly batch — fraction of AI drafts that get submitted (vs discarded). |

### 5.5 Cost Targets

| Cost line | Target |
|---|---|
| AI cost per published question (authoring + quality + translation) | < $0.20 average |
| AI cost per evaluated subjective response (single attempt) | < $0.05 average |
| Monthly AI spend at 5K MAU | < $5,000 |
| Monthly AI spend at 100K MAU | < $50,000 (linear scaling not guaranteed; revisit quarterly) |

---

## 6. Roll-out Plan

| Sprint | Scope | Notes |
|---|---|---|
| **S1** | AI Gateway shell + provider abstraction | Set up internal service. OpenAI + Anthropic providers. No real touchpoints yet — just plumbing + observability. |
| **S1** | Prompt template registry | Version-controlled YAML; loader; schema validator. |
| **S2** | AI Authoring — `draft_question` for MCQ_SINGLE | First touchpoint live. Peer reviewer sees AI badges. Iterate on prompts. |
| **S2** | Quality checks (3 of 6) | Ambiguity, distractor plausibility, duplicate detection. |
| **S3** | Evaluation Service (DETERMINISTIC) | All deterministic types ported to Evaluation Service. No AI yet. |
| **S3** | Localisation Service shell + EN→HI MVP | Translation API, reviewer queue, glossary management. First batch of 50 questions translated end-to-end. |
| **S4** | AI Evaluation for SHORT_TEXT and ESSAY | AI_ASSISTED and HYBRID modes go live. Calibration pipeline running. |
| **S4** | Authoring expansion to all objective types | MCQ_MULTI, ASSERTION_REASON, MULTI_STATEMENT, NUMERIC_*. |
| **S5** | Diagram authoring + vision quality checks | DIAGRAM_HOTSPOT, DIAGRAM_LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY. |
| **S5** | Subject glossaries seeded | Biology, Physics, Chemistry, Maths, History — initial 200 terms each. |
| **S6** | Cultural review queue | Reviewer workflow, SLA tracking. |
| **S6** | Phase 2 language pilots | Tamil pilot with 100 questions. Validate the pipeline scales. |
| **S7+** | Audio/Video, KBC family | Flag-gated; designed but not built in v1. |

---

## 7. Open Architecture Questions

| ID | Question | Owner | Decision by |
|---|---|---|---|
| **AIM-OAQ-1** | Should we self-host any open-weight model (Llama 3.1, Mixtral) for cost or data-residency reasons in v1? | ML Eng + Sec | Before S2 |
| **AIM-OAQ-2** | What is the data-retention agreement with each AI provider — does it satisfy DPDP? | Legal + Sec | Before S1 deploy |
| **AIM-OAQ-3** | How are graders trained, and at what scale do we hire? Internal panel vs partnered service? | Operations | Before S4 |
| **AIM-OAQ-4** | Should glossary management be exposed as an API for institutions to add their own terminology? | Product | Phase 2 |
| **AIM-OAQ-5** | For cross-language student responses (English question, Hindi answer): UX cost vs accessibility benefit? | Product + UX | Phase 2 |
| **AIM-OAQ-6** | Is rubric ownership creator-level or admin-level? Allowing creators full rubric authority means rubric quality varies wildly. | Product | Before S4 |
