# Content Engine Question Catalogue

**Authoring · Evaluation · AI Scope · Multilingual**

*Adaptive Learning Platform · Content Engine LLD · v1.0 · CONFIDENTIAL*

Specifies the complete set of question categories the content engine supports across competitive, academic, and entertainment formats — ranging from objective MCQs through subjective essays, case studies, map-based questions, and gamified KBC-style formats. For each category: how it is authored, how the response is evaluated (correct / partial / incorrect — not marks), what role AI plays, and how the question gets translated into multiple languages.

> **Scoring (marks per correct, negative marking, partial-credit ratios) is OUT OF SCOPE for this document.** Scoring belongs to the Quiz / Mock Test / Exam orchestration module and is configured per exam, per test, or per module — not per question type. The content engine emits a structured Resolution that scoring modules consume.

| Attribute | Value |
|---|---|
| Document Title | Question Catalogue — Authoring, Evaluation, AI Scope, Multilingual |
| Version | v1.0 — supersedes the question-types LLD addendum that mixed scoring into content |
| Date | April 2026 |
| Companion to | Content Generation & Approval Engine LLD v1.0 |
| Question categories in scope | 8 families · 22 distinct question types |
| Out of scope | Scoring profiles, marks, negative marking, partial-credit ratios, mark-rounding rules |
| Languages supported in v1 | English, Hindi · regional languages (Tamil, Telugu, Bengali, Marathi) gated for Phase 2 |
| AI services scoped | Authoring assistance · quality checks · response evaluation · localisation |
| Audience | Backend, Frontend, Mobile, AI/ML, Content Operations, Localisation Team |
| Classification | CONFIDENTIAL |

---

## 1. Why Content and Scoring Are Separate Concerns

A question is a piece of content. A test is a curated set of questions, with rules for marking them. The same question can appear in multiple tests with different scoring rules. The content engine must therefore know everything about the question itself — its semantics, its variants in different languages, how to evaluate a response — but nothing about marks.

### 1.1 The Content / Test Boundary

```
┌─────────────────────────────────────────────────────────────────────────┐
│   CONTENT ENGINE (this document)                                        │
│                                                                          │
│   • Question authoring (per type)                                       │
│   • Stored payload and translations                                     │
│   • Reviewer workflow (peer + moderator)                                │
│   • Response evaluation: correct? partial? which parts?                 │
│   • AI services: generation, quality, localisation, evaluation          │
│                                                                          │
│   Emits: Resolution { status, matched_count, total, per_part_detail }   │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │  Resolution
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│   QUIZ / TEST / MOCK ORCHESTRATION (separate module)                    │
│                                                                          │
│   • Picks a scoring profile (per exam · per test · per section)         │
│   • Translates Resolution into marks                                    │
│   • Aggregates per-question marks into test totals                      │
│   • Applies negative marking, partial-credit ratios, ceilings           │
│   • Owns the per-test mark history and analytics                        │
└─────────────────────────────────────────────────────────────────────────┘
```

*This separation is enforced at the API boundary. The Content Engine's evaluate endpoint never returns marks; the Test Orchestrator's submit endpoint never inspects question payloads. Each side owns its concern fully.*

### 1.2 What the Resolution Contract Looks Like

Every question type's evaluator returns the same Resolution shape. Test orchestration consumes this shape uniformly; only the orchestrator knows what marks any of these states produce.

```json
{
  "question_id": "uuid",
  "type_id": "MCQ_SINGLE" | "ESSAY" | "MAP_HOTSPOT" | ...,
  "status": "CORRECT" | "PARTIAL_CORRECT" | "INCORRECT" | "UNATTEMPTED" | "PENDING_HUMAN_REVIEW",
  "matched_count": int,            // for partial-credit-capable types
  "total_count": int,
  "per_part": [                     // per-component detail (per blank, per marker, per criterion)
    { "id": "...", "matched": bool, "ai_confidence": 0.0-1.0, "details": {...} }
  ],
  "evaluation_mode": "DETERMINISTIC" | "AI_ASSISTED" | "HUMAN" | "HYBRID",
  "evaluator_metadata": {           // present for AI/human-evaluated types
    "model": "gpt-4o" | "human:expert-id",
    "rubric_version": int,
    "evaluated_at": "ISO timestamp",
    "human_review_required": bool
  }
}
```

---

## 2. The Question Universe — 8 Families, 22 Types

Different exams need radically different question forms. NEET and JEE rely on objective questions with one or more correct answers. UPSC mains and CBSE board exams use long-form subjective answers. CAT and other MBA entrance tests use case studies. GATE uses mixed objective and numerical. Map-based and pictorial questions appear in geography and biology. KBC-style entertainment formats need lifelines and timed reveals.

### 2.1 Family Map

| Family | Members | Where it shows up |
|---|---|---|
| **Objective** | MCQ_SINGLE · MCQ_MULTI · TRUE_FALSE · ASSERTION_REASON · MULTI_STATEMENT | All competitive exams; school assessments; KBC-style; corporate certifications. |
| **Numeric & Quantitative** | NUMERIC_INTEGER · NUMERIC_DECIMAL · NUMERIC_RANGE · FORMULA_INPUT | JEE, GATE, engineering exams; physics/chemistry/maths chapters. |
| **Matching & Ordering** | MATCH_THE_FOLLOWING · SEQUENCING · CLASSIFICATION | NEET Biology, UPSC, CBSE; logical reasoning sections. |
| **Fill-in & Cloze** | FILL_BLANK_SINGLE · FILL_BLANK_MULTI · CLOZE_PASSAGE · SHORT_TEXT | Language exams, CBSE, CAT verbal, vocabulary tests. |
| **Subjective** | ESSAY · DESCRIPTIVE_LONG · CASE_STUDY · COMPREHENSION_LONG | UPSC mains, GATE descriptive, MBA case interviews, CBSE 5/8/10-mark questions. |
| **Visual & Spatial** | DIAGRAM_HOTSPOT · DIAGRAM_LABEL · MAP_LOCATION · PICTORIAL_IDENTIFY | Geography, biology, art history, civil engineering, design. |
| **Audio & Video** | LISTENING_COMP · VIDEO_QUESTION | Language proficiency, music theory, medical procedure assessment. Flag-gated in v1. |
| **Interactive & Gamified** | KBC_LIFELINE · TIMED_REVEAL · ADAPTIVE_DIFFICULTY | Entertainment formats, quiz shows, engagement-driven products. Flag-gated in v1. |

### 2.2 Coverage Reality Check

Not every exam needs every type. The content engine supports all of them; an exam configuration declares which types are valid for that exam, and the authoring UI hides the rest. A teacher creating content for CBSE Class 10 sees a different palette than one creating for UPSC Mains.

| Family | NEET | JEE | GATE | UPSC | CBSE | CAT | KBC |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Objective | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Numeric | — | ✓ | ✓ | — | ✓ | ✓ | — |
| Matching | ✓ | — | — | ✓ | ✓ | ✓ | — |
| Fill-in / Cloze | — | — | — | — | ✓ | ✓ | — |
| Subjective | — | — | ✓ | ✓ | ✓ | ✓ | — |
| Visual & Spatial | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Audio / Video | — | — | — | — | ✓ | — | — |
| Interactive | — | — | — | — | — | — | ✓ |

*Coverage is configured in `exam_question_type_support`; the matrix above is the default. New exams just plug into this same support table — no code changes.*

---

## 3. Architecture — How the Engine Stays Type-Agnostic

Every question type follows the same lifecycle: it is authored, optionally AI-assisted; it goes through peer and moderator review; it is published; a student responds; the engine evaluates the response. Adding a new type means writing a Handler module that plugs into this lifecycle — nothing else in the platform changes.

### 3.1 The Type Handler Protocol

Every type registers a handler implementing the methods below. The dispatcher routes calls to the right handler based on the question's `type_id`. Adding a new type is one new module plus one registry line. No state machine, queue, or audit-log changes.

```python
class QuestionTypeHandler(Protocol):
    type_id: str                      # e.g. "ESSAY", "MAP_LOCATION"
    family: str                       # e.g. "Subjective", "Visual & Spatial"
    payload_schema: Type[BaseModel]   # validates author input
    response_schema: Type[BaseModel]  # validates student response
    evaluation_mode: Literal["DETERMINISTIC", "AI_ASSISTED", "HUMAN", "HYBRID"]
    supports_partial: bool
    media_kinds: List[str]            # ["image", "audio", "video"] used by this type

    # Authoring
    def author_validate(payload) -> List[ValidationError]: ...
    def ai_generate_draft(prompt, context) -> Draft: ...     # may raise NotSupported
    def ai_quality_check(payload) -> QualityReport: ...

    # Localisation
    def translatable_fields(payload) -> List[str]: ...
    def merge_translation(payload, lang, translation) -> payload: ...

    # Rendering
    def render_payload(payload, mode, lang) -> dict: ...

    # Evaluation (returns Resolution; never marks)
    def evaluate(payload, response, lang) -> Resolution: ...

    # Review
    def review_checklist(lang) -> List[CheckItem]: ...
```

### 3.2 Service Topology

```
                            Content Service (Python FastAPI)
                                       │
         ┌─────────────────────────────┼────────────────────────────┐
         │                             │                            │
         ▼                             ▼                            ▼
  Type Dispatcher              AI Authoring Service        Localisation Service
  (in-process registry)        (separate svc, async)       (separate svc, async)
                                       │                            │
                                       ▼                            ▼
                              ┌─ LLM provider ─┐         Translation models +
                              │  (OpenAI /      │         human reviewer queue
                              │   Anthropic)    │
                              └─────────────────┘

                            Evaluation Service (Python FastAPI)
                                       │
         ┌─────────────────────────────┼────────────────────────────┐
         │                             │                            │
         ▼                             ▼                            ▼
  DeterministicEvaluator       AI Evaluator (rubric-LLM)    HumanEvaluator queue
  (MCQ, numeric, match, etc)   (essays, case studies)        (manual grading UI)
```

> **Note:** The Service Consolidation Addendum (v1.0) revises the deployment topology — these four services collapse to **AI Gateway + expansions to Content/Quiz/Moderation**. Treat the topology above as the *logical* decomposition.

### 3.3 Storage Model

| Table | What it holds |
|---|---|
| `content_artifacts` (existing) | One row per question, regardless of type. `payload` JSONB shape varies by type and is validated through the dispatcher. `type_id`, `family`, `status`, `current_version_id`, `primary_language`. |
| `content_artifact_translations` (NEW) | `(artifact_id, language, payload_translation JSONB, status, translator_id, reviewer_id, ai_confidence, version)`. One row per (artifact, language). Primary language has translation_id = artifact's own row; non-primary go through their own review. |
| `content_media` (NEW) | `(id, artifact_id, kind, s3_url, content_hash, dimensions, duration_seconds, mime_type)`. Images, audio, video referenced by artifact payloads. |
| `evaluation_rubrics` (NEW) | `(id, artifact_id, version, criteria JSONB, max_score_points, applies_to_languages)`. For subjective types only. Rubric is part of content, not scoring — it defines *what* counts as correct, not *how many marks* it earns. |
| `evaluation_records` (NEW) | `(id, response_id, evaluator_kind, evaluator_id, resolution JSONB, confidence, evaluated_at)`. Every response evaluation is persisted for audit and to support re-evaluation if a question is corrected. |
| `ai_generation_jobs` (NEW) | `(id, artifact_id?, prompt, context, model, status, output JSONB, created_at)`. Authoring assists are async; this records every call so authors can browse history. |

---

## 4. Per-Family Specifications

For each family: representative types, how authoring works, what evaluation looks like, where AI helps, and how multilingual is handled. Detailed payload schemas live in the type-handler unit specs (one per type, not in this document); this section captures the design decisions per family.

### 4.1 Objective Family

**Types:** `MCQ_SINGLE` · `MCQ_MULTI` · `TRUE_FALSE` · `ASSERTION_REASON` · `MULTI_STATEMENT`

**Authoring**
- Author writes a stem and a fixed set of options. For ASSERTION_REASON, author states three boolean flags (A true, R true, R explains A) and the system derives the canonical answer.
- Authoring UI is a structured form with dedicated fields per option. No free-form payload editing.
- Author marks which options are correct via radio (single) or checkbox (multi).
- Validation enforces sane shapes: 2-6 options, at least one correct, no duplicates, stem non-empty.
- Bulk import via CSV/JSON template — primary path for question banks.

**Evaluation**
- 100% deterministic. Compare student's selection to author's correct flags.
- Result is CORRECT, PARTIAL_CORRECT (multi only), INCORRECT, or UNATTEMPTED.
- Per-option detail returned for analytics: which distractors students choose tells us which misconceptions are common.
- No AI involvement at evaluation time. Latency p99 under 5 ms.

**AI scope**
- *Generation:* LLM produces draft stem + 4 plausible options + correct answer + explanation, given (topic, difficulty, exam). All drafts marked AI_DRAFT and require human review (cannot bypass).
- *Quality checks:* automatic detection of (a) ambiguous correct answer (more than one option could be defended), (b) implausible distractors, (c) overlap with existing question bank, (d) syllabus-tag mismatch.
- *Difficulty estimation:* predicts EASY/MEDIUM/HARD before any student attempts; refined post-hoc using actual student performance.

**Multilingual treatment**
- Translatable fields: stem, each option text, explanation. Option ids (A/B/C/D) stay constant across languages.
- Translation is independent per language. A question with errors in Hindi but correct in English remains usable in English.
- Numeric values in stems (e.g. 'a particle moves at 5 m/s') are NOT translated — units are localisation-context but values stay.
- Per-language reviewer ensures the translated stem and options preserve the same correct answer.

**Examples**
- JEE Main physics MCQ_SINGLE on circular motion.
- JEE Advanced MCQ_MULTI on thermodynamics — multiple options correct.
- UPSC Prelims MULTI_STATEMENT on the Indian Constitution.
- KBC objective question with four options.

### 4.2 Numeric & Quantitative Family

**Types:** `NUMERIC_INTEGER` · `NUMERIC_DECIMAL` · `NUMERIC_RANGE` · `FORMULA_INPUT`

**Authoring**
- INTEGER: author specifies a single integer answer.
- DECIMAL: author specifies a value plus an absolute tolerance (e.g. 3.14 ± 0.01).
- RANGE: author specifies [low, high]; any value in the closed interval is correct.
- FORMULA_INPUT: author specifies a target expression in MathJax-compatible syntax; student types a formula that the engine compares for symbolic equivalence (uses sympy on the backend).
- Optional unit field rendered alongside the input. Units are locale-aware (m vs metres) but the numeric value is universal.
- Author writes a step-by-step solution in the explanation field; AI offers to expand a one-line solution into full working.

**Evaluation**
- INTEGER: parse-as-int; equality compare. INCORRECT if parsing fails.
- DECIMAL: parse-as-float; `|student - correct| ≤ tolerance`.
- RANGE: parse-as-float; `correct_low ≤ student ≤ correct_high`.
- FORMULA_INPUT: parse student input via sympy; `symbolic_equal(student, target)`. Handles equivalent-but-differently-written expressions like `x² + 2x + 1` vs `(x+1)²`.
- All deterministic; no AI at evaluation time.

**AI scope**
- *Generation:* LLM produces stem + correct value + step-by-step solution. Given (topic, formula, difficulty), produces realistic numeric problems.
- *Quality:* a separate LLM pass solves the question and verifies the author's stated answer matches (catches arithmetic errors before students see them).
- *Tolerance recommendation:* AI suggests an appropriate tolerance based on the precision implied by the stem (e.g. 'two decimal places' → 0.005).
- FORMULA_INPUT additionally uses LLM to suggest equivalent forms students might enter, helping the author flag expected variants for symbolic comparison.

**Multilingual treatment**
- Translatable: stem, units (where they have a vernacular form — e.g. 'metres' → 'मीटर'), explanation.
- NOT translated: numeric values, formulas (mathematical syntax is universal).
- Care needed for cultural context — a question about distance to the local market should pick an appropriate landmark per language. AI flags such cultural references for human reviewer attention.

**Examples**
- JEE Main: 'Find v after 5s with a = 6 m/s²' → 30
- GATE: 'The integral ∫(0,π) sin(x) dx evaluates to ___' → 2
- JEE Adv (FORMULA): 'Write the general solution of x² - 5x + 6 = 0' → x = 2 or x = 3

### 4.3 Matching & Ordering Family

**Types:** `MATCH_THE_FOLLOWING` · `SEQUENCING` · `CLASSIFICATION`

**Authoring**
- MATCH: two parallel lists; author defines correct pairs. Distractor items in the right list (more right items than left) supported.
- SEQUENCING: ordered list of items; author drags into correct order. Optional ordering criterion stem.
- CLASSIFICATION: items + categories; author assigns each item to a category. Multiple items per category allowed; some categories may be empty.
- All three share a common drag-and-drop authoring canvas with click-to-link as keyboard-accessible alternative.

**Evaluation**
- MATCH: compare student pair set to correct pair set. Per-pair detail in `per_part`. Partial result reported as 'matched 3 of 5' — orchestrator decides whether that earns partial marks.
- SEQUENCING: position-by-position equality. Optional 'longest correct prefix' or Levenshtein-on-positions metric available, configurable per question.
- CLASSIFICATION: per-item correctness; `per_part` returns per-item detail.
- Deterministic. No AI at evaluation.

**AI scope**
- *Generation:* LLM produces matching pairs given a topic (e.g. 'match scientists to discoveries' for a chemistry chapter).
- *Quality:* AI checks that pairings are unambiguous — flags cases where a left item could plausibly match multiple right items.
- AI suggests distractor right-list items that are plausible-but-wrong, increasing question difficulty without ambiguity.

**Multilingual treatment**
- Translatable: every item text in both lists. Item ids stay constant.
- Pairings are language-invariant — if A matches Q in English, the translated A still matches the translated Q.
- AI translation must preserve cultural references in matching pairs (e.g. matching authors to books — the canonical translated book title must be used, not a literal back-translation).

**Examples**
- NEET Biology MATCH: scientists ↔ discoveries.
- UPSC SEQUENCING: chronological order of events in Indian freedom struggle.
- CAT verbal CLASSIFICATION: words categorised by sentiment.

### 4.4 Fill-in & Cloze Family

**Types:** `FILL_BLANK_SINGLE` · `FILL_BLANK_MULTI` · `CLOZE_PASSAGE` · `SHORT_TEXT`

**Authoring**
- FILL_BLANK: stem template with `{{n}}` placeholders; author specifies accepted answers per blank, plus a match mode (exact, case-insensitive, fuzzy-token).
- CLOZE_PASSAGE: long passage with multiple blanks, often each blank is a single word from a closed list. Author may specify a 'word bank' for students to draw from.
- SHORT_TEXT: free-form short answer (1-3 sentences). Author specifies key concepts that must appear; AI evaluates whether response covers them.
- Fuzzy threshold defaults to 0.85 (high). Regex match mode hidden from creators — admin-only.

**Evaluation**
- FILL_BLANK and CLOZE: deterministic. Per-blank match using configured mode.
- SHORT_TEXT: AI-assisted. The evaluator passes (student response, key concepts, model answer) to an LLM with a fixed prompt template; LLM returns per-concept presence flags + overall confidence.
- SHORT_TEXT responses with confidence < 0.7 are auto-flagged for human review; confidence ≥ 0.95 considered final.
- Fuzzy matching for fill-blank uses token-level Levenshtein, surfaced clearly to authors so they can tune.

**AI scope**
- *Generation:* LLM produces cloze passages given a topic and target vocabulary, with appropriate distractor word banks.
- *Quality:* AI suggests common student misspellings or alternative phrasings the author should accept; flags blanks where the accepted list seems too narrow.
- *Evaluation (SHORT_TEXT):* structured prompt — 'For each key concept, indicate whether the student response addresses it. Provide a 0-1 confidence.' Always returns structured JSON; never free-form.

**Multilingual treatment**
- Translatable: stem template, accepted answers per blank, key concepts (SHORT_TEXT), word banks.
- FUZZY threshold may need tuning per language — Devanagari token-similarity metrics differ from Latin script. Per-language tolerance overrides supported.
- SHORT_TEXT evaluation runs in the response language; the LLM is prompted in the response language to assess concepts in that same language.

**Examples**
- CBSE FILL_BLANK: 'Mitochondria are the ___ of the cell' → 'powerhouse'.
- CAT verbal CLOZE: 60-word passage with 6 blanks, each picked from a 12-word bank.
- UPSC SHORT_TEXT: 'In 50 words, explain the doctrine of basic structure' → AI checks for keywords (Kesavananda, basic structure, parliamentary amendment).

### 4.5 Subjective Family

**Types:** `ESSAY` · `DESCRIPTIVE_LONG` · `CASE_STUDY` · `COMPREHENSION_LONG`

**Authoring**
- ESSAY: stem with expected word count range; author writes an exemplar answer and a structured rubric.
- DESCRIPTIVE_LONG: technical descriptive answer (GATE-style); rubric typically structural ('definition', 'derivation', 'example') with weights per criterion.
- CASE_STUDY: scenario passage + 2-5 sub-questions; each sub-question is its own type (often a mix of objective, short-text, and essay). Stored as parent + linked children.
- COMPREHENSION_LONG: extended passage (1000+ words) + 3-8 sub-questions of mixed types. Used in CAT, GATE, UPSC.
- Rubric editor lets author define criteria, weights (within a 100% rubric — these are *content* weights, not marks), required keywords, and acceptable variations.
- Author writes a model answer that explicitly satisfies every rubric criterion. AI verifies the model answer covers each criterion.

**Evaluation**
- All four types: hybrid AI + human. AI evaluates first; human reviews if confidence is low or random sampling triggers.
- AI evaluator receives (rubric, model answer, student response) and returns per-criterion satisfaction (0-1) plus reasoning.
- Returns Resolution with status `PENDING_HUMAN_REVIEW` when `ai_confidence < threshold` (default 0.75) or random 5% sample selected for human spot-check (calibration).
- Human grader UI shows AI's per-criterion judgement as a starting point; grader can override any criterion with their own assessment.
- Final Resolution carries `evaluator_kind = 'AI'` or `'HUMAN'` and a chain showing which assessments came from where.
- Re-evaluation: if a rubric is updated, all responses can be re-evaluated against the new rubric — old Resolution kept for audit, new one becomes current.

**AI scope**
- *Generation:* LLM produces essay stems + structural rubric given (topic, exam, expected length). Always marked AI_DRAFT — never auto-published.
- *Model-answer assistance:* given stem + rubric, AI drafts a model answer; author edits and approves.
- *Plagiarism detection* on student responses: cross-check against (a) the model answer, (b) other student responses in the same cohort, (c) a corpus of online sources. Flagged for human review if similarity > threshold.
- *Evaluation:* structured rubric-driven LLM call. Strict JSON output. Calibrated quarterly by sampling AI vs human evaluations and measuring correlation.

**Multilingual treatment**
- Translatable: stem, rubric criteria, model answer.
- Student responses arrive in any enabled language. AI evaluator runs in the response language.
- Rubric criteria are language-aware: 'cites at least 2 case laws' translates to the same intent in Hindi, but 'lists three states starting with M' would not — a per-language rubric override is supported for these cases.
- Cross-language evaluation (student answers in Hindi, model in English) is not supported — student must answer in a language for which a translated rubric exists.

**Examples**
- UPSC mains essay: 'Discuss the relevance of Gandhian philosophy in modern India' (250 words).
- GATE descriptive: 'Derive the time complexity of QuickSort in worst case' (5-mark structural answer).
- CAT case study: 4-page corporate scenario + 3 sub-questions (1 MCQ, 1 numeric, 1 short-text).
- CBSE 8-mark biology question: 'Explain the human digestive system with a labelled diagram'.

### 4.6 Visual & Spatial Family

**Types:** `DIAGRAM_HOTSPOT` · `DIAGRAM_LABEL` · `MAP_LOCATION` · `PICTORIAL_IDENTIFY`

**Authoring**
- All four use the shared Diagram Authoring Canvas — image upload, click to draw shapes (circle, rect, polygon), drag to place markers.
- DIAGRAM_HOTSPOT: author draws hotspot regions on an image; one is correct, others are plausible distractors.
- DIAGRAM_LABEL: author places markers on an image; defines a label list (with extras as distractors); links each marker to its correct label.
- MAP_LOCATION: special case of HOTSPOT using a base map (state, country, world). Tile-based map renderer; hotspot coords in lat/long. Author selects the map base and draws the hotspot.
- PICTORIAL_IDENTIFY: 'identify what is shown' — image plus 4 text options (which species? which monument? which artwork?).
- All images stored in S3 with content-hash verification; auto-converted to WebP at three resolutions.

**Evaluation**
- HOTSPOT and MAP_LOCATION: point-in-shape test. CORRECT if click is in correct hotspot, INCORRECT otherwise. Tolerance pixels expand the shape.
- DIAGRAM_LABEL: same as MATCH_THE_FOLLOWING but with image markers as left list.
- PICTORIAL_IDENTIFY: same as MCQ_SINGLE — student picks one option.
- Deterministic. No AI at evaluation.
- Click coords always normalised to image-pixel space by the frontend before submit (handles device pixel ratio and zoom).

**AI scope**
- *Generation:* LLM-with-vision (GPT-4o, Claude 3.5 Sonnet) inspects an uploaded image and suggests plausible hotspots and labels.
- *Quality:* vision model verifies that author's labelled markers are placed on the right anatomical/geographical regions; flags placement errors.
- *PICTORIAL_IDENTIFY generation:* AI generates distractor options that are visually similar to the correct answer (e.g. for 'which Mughal monument is this?', distractors are other Mughal monuments).
- *Image moderation:* every uploaded image runs through a content-safety filter (NSFW, violence, copyrighted-character detection) before reaching the peer review queue.

**Multilingual treatment**
- Translatable: stem, labels (DIAGRAM_LABEL), options (PICTORIAL_IDENTIFY), explanation.
- NOT translated: the image itself. (Phase 2: optional 'localised image variants' — e.g. a map with Hindi place names — but these are separate uploaded variants linked to the same artifact.)
- Map-based questions: the map tile layer is locale-aware (place names rendered in selected language where supported by the tile provider).

**Examples**
- NEET Biology HOTSPOT: 'Click on the right ventricle in this heart diagram'.
- CBSE Geography MAP_LOCATION: 'Click on the location of the Tropic of Cancer crossing India'.
- UPSC PICTORIAL: 'Identify this monument' (image of Hampi).
- Civil engineering DIAGRAM_LABEL: 'Label the load-bearing components of this truss'.

### 4.7 Audio & Video Family (flag-gated in v1)

**Types:** `LISTENING_COMP` · `VIDEO_QUESTION`

**Authoring**
- Author uploads audio or video media. Auto-transcoded to web-safe formats. Captions/transcripts auto-generated by AI; author edits and approves.
- LISTENING_COMP: audio + 1-N child questions of any other type. Common in language exams.
- VIDEO_QUESTION: video + a single question that may reference a specific timestamp.
- Authoring UI includes a media player with a 'mark timestamp' tool — author can specify exactly which moment of the media the question refers to.
- Flag-gated by `audio_video_questions_enabled = false` in v1. Authoring UI works locally; submission rejected with 503 FEATURE_DISABLED.

**Evaluation**
- Child questions evaluate via their own handlers — LISTENING_COMP is a composite, like COMPREHENSION_LONG.
- Media playback is part of rendering, not evaluation. The evaluator does not analyse audio/video content; it operates on the student's structured response.
- Flag-gated; no evaluation in v1.

**AI scope**
- *Auto-transcription:* media-to-text via Whisper or equivalent. Author edits the transcript before publish.
- *Generation:* AI generates LISTENING_COMP child questions from a transcript — 'given this 2-minute clip, generate 3 comprehension MCQs covering main idea, detail, inference'.
- *Subtitle generation* in multiple languages (translation of transcript, then re-time-aligned).

**Multilingual treatment**
- Transcript and child questions translated through the standard pipeline.
- Audio/video media itself is NOT auto-translated — Phase 2 may add dubbed audio variants linked to the same artifact.
- Subtitles in target languages always supported when transcript is available.

**Examples**
- Language proficiency test LISTENING: 30-second dialogue + 3 MCQs.
- Music theory VIDEO: 'At 0:42, what chord is being played?' (PICTORIAL_IDENTIFY child).
- Medical training VIDEO: 'In this surgical clip, which step is the surgeon performing at timestamp 1:12?'

### 4.8 Interactive & Gamified Family (flag-gated in v1)

**Types:** `KBC_LIFELINE` · `TIMED_REVEAL` · `ADAPTIVE_DIFFICULTY`

**Authoring**
- KBC_LIFELINE: an MCQ_SINGLE wrapped in lifeline metadata — which lifelines are available (50:50, audience poll, phone-a-friend), what each does to the rendered question.
- TIMED_REVEAL: question reveals additional information at preset intervals; correct answer becomes harder to give as more info is revealed (or easier — author choice).
- ADAPTIVE_DIFFICULTY: question pool of 3-5 versions of the same concept at increasing difficulty; the engine picks which version the student sees based on their prior response in the session.
- All three are constructed atop existing types; the gamification metadata is a wrapper.
- Flag-gated by `interactive_questions_enabled = false` in v1.

**Evaluation**
- Underlying type evaluator runs as normal. The wrapper records which lifelines were used or which difficulty version was served.
- `per_part` includes `lifeline_used: ['50:50']` when present — orchestrator may use this to adjust marks (lifelines worth less), but the content engine remains agnostic to that.

**AI scope**
- AI generates ADAPTIVE_DIFFICULTY pools given a single seed question — produces easier and harder variants automatically.
- AI suggests audience-poll distributions for KBC realism (4 plausible-looking percentages summing to 100, weighted toward the correct answer).

**Multilingual treatment**
- All gamification metadata is translation-agnostic (it's structural).
- Lifeline labels (e.g. 'phone a friend') translate via a fixed UI string bundle, not per-question.

**Examples**
- KBC: 'Who founded the Maurya empire?' with 50:50 lifeline available.
- Geography TIMED_REVEAL: 'Identify this country' starts with just an outline; flag appears at 10s; capital city at 20s.
- Maths ADAPTIVE: 'Solve x² + bx + c = 0' served with progressively harder coefficients based on student accuracy.

---

## 5. AI Strategy — Cross-Type Concerns

AI shows up at four points in the content lifecycle. Each is a separate flag, separate budget, separate quality bar, and separate failure mode.

### 5.1 The Four AI Touchpoints

| Touchpoint | Flag | Description |
|---|---|---|
| **Authoring assistance** | `ai_authoring_enabled` | AI drafts question stems, options, distractors, model answers, rubrics. Author always edits and approves before submit. Drafts marked AI_DRAFT in audit log; never reach review queue without human edit. |
| **Quality checks** | `ai_quality_checks_enabled` | Background checks on every submitted artifact: ambiguity detection, duplicate detection, syllabus tagging accuracy, distractor plausibility. Surfaces warnings to peer reviewer; does not block submission. |
| **Response evaluation** | `ai_evaluation_enabled` | Evaluates SHORT_TEXT, ESSAY, DESCRIPTIVE_LONG, CASE_STUDY responses against rubric. Returns confidence; low-confidence responses auto-routed to human review. |
| **Localisation** | `ai_localisation_enabled` | Translates question payloads from primary language into other supported languages. Always followed by per-language human reviewer approval before publish. |

### 5.2 AI Provider Abstraction

The platform must not be locked to one LLM vendor. All AI calls go through an internal AI Gateway service that abstracts provider choice. Switching from OpenAI to Anthropic to Gemini is a config change, not a code change.

```python
# AI Gateway interface
class AIGateway:
    def generate(prompt, schema, model_hint=None) -> StructuredResult: ...
    def vision_inspect(image_url, prompt, schema) -> StructuredResult: ...
    def evaluate(rubric, model_answer, student_response) -> EvaluationResult: ...
    def translate(text, source_lang, target_lang, glossary=None) -> Translation: ...

# Provider routing config (per touchpoint)
AI_ROUTING = {
    "authoring":   {"primary": "anthropic:claude-3.7-sonnet", "fallback": "openai:gpt-4o"},
    "quality":     {"primary": "anthropic:claude-3.5-haiku",  "fallback": "openai:gpt-4o-mini"},
    "evaluation":  {"primary": "anthropic:claude-3.7-sonnet", "fallback": "openai:gpt-4o"},
    "translation": {"primary": "google:nmt-pro",              "fallback": "anthropic:claude-3.5-sonnet"},
    "vision":      {"primary": "openai:gpt-4o",               "fallback": "anthropic:claude-3.5-sonnet"},
}
```

### 5.3 Structured Output Discipline

Every AI call uses structured output (JSON schema or tool-call). No free-form text into production paths. This rules out a class of failures where the LLM 'almost' returns the right shape and the parser breaks. The Gateway enforces schema validation before any output reaches the calling service.

### 5.4 Prompt Versioning

Every prompt template lives in version control with a semantic version. The artifact stores which prompt version produced any AI assist. Re-evaluation against an updated prompt is possible; comparison studies are run weekly.

### 5.5 Human-in-the-Loop Rules

1. AI never publishes content. Peer reviewer + moderator approval is always required.
2. AI never finalises subjective evaluation when `ai_confidence < 0.75`. Human grader required.
3. AI never finalises a translation. Per-language human reviewer required for first publish (Phase 2 may relax for low-stakes content).
4. AI may finalise quality flags (warnings only, never blocks).

### 5.6 Cost & Rate Controls

| Control | Behaviour |
|---|---|
| Per-creator daily quota | Default 50 AI generations per creator per day; admin-overridable. Exceeded → `quota_reset_at` returned. |
| Per-evaluation cap | Each subjective response evaluated at most twice automatically (initial + one re-evaluation if the rubric changes). Beyond that → manual trigger only. |
| Translation budget | Per-language daily cap aggregate across the platform. Exceeded → translation jobs queue; first-in-first-out with admin escalation. |
| Model fallback | If primary provider returns error or exceeds latency budget (>10s), Gateway retries on fallback provider before failing the call. |
| Audit logging | Every AI call logged: prompt template version, input hash, output hash, latency, cost in tokens. Cost dashboard updated daily. |

---

## 6. Multilingual — Authoring Once, Publishing Many

Indian competitive exams are multilingual by default. UPSC offers question papers in English and Hindi; CBSE supports regional languages. The content engine must let authors write a question once and produce equivalent versions in every supported language without duplicating effort or risking translation drift.

### 6.1 The Translation Lifecycle

```
AUTHOR (writes in primary language, e.g. English)
        │
        ▼
Submit → Peer Review → Moderator → APPROVED (English)
        │
        ▼  (parallel for each enabled target language)
AI Localisation Service translates payload to {Hindi, Tamil, Telugu, ...}
        │
        ▼
Each translation enters its own per-language review queue
        │
        ▼
Per-language reviewer (linguist + subject expert)
  • Confirms intent preserved
  • Confirms cultural context appropriate
  • Confirms answer key still valid for this language
        │
        ▼
Approved per language → student can take quiz in that language

PUBLISHED states are independent: a question may be live in EN and HI
but pending review in TA. The catalog hides un-translated languages.
```

### 6.2 The Translatable-Fields Contract

Every type's handler exposes which fields in its payload are translatable. The Localisation Service walks the payload, sends each translatable field to the AI Gateway with the source and target language, and reassembles the translated payload. Untranslatable fields (numeric values, formula syntax, image URLs, marker coordinates) carry through unchanged.

```python
# MCQ_SINGLE handler exposes:
def translatable_fields(payload):
    return ["stem", "options[*].text", "explanation"]

# DIAGRAM_HOTSPOT handler exposes:
def translatable_fields(payload):
    return ["stem", "hotspots[*].label", "explanation"]
    # NOT translated: image_url, hotspots[*].coords, hotspots[*].is_correct

# ESSAY handler exposes:
def translatable_fields(payload):
    return ["stem", "model_answer", "rubric.criteria[*].text",
            "rubric.criteria[*].keywords[*]"]
```

### 6.3 Glossary & Terminology Management

Subject-specific terminology must translate consistently across the entire question bank. 'Photosynthesis' should always be 'प्रकाश संश्लेषण' in Hindi, never a stylistic variant. The Localisation Service maintains a per-subject glossary that the AI translation prompt always includes.

| Glossary scope | Description |
|---|---|
| **Platform glossary** | Common terms (correct, incorrect, question, option) — fixed UI bundle. |
| **Subject glossary** | Subject terminology curated by domain experts (Biology terms in Hindi, Physics terms in Tamil, etc.). |
| **Exam glossary** | Exam-specific phrasing (e.g. UPSC's standard phrasings for question stems). |
| **Locked translations** | Terms the AI is not allowed to translate (proper nouns, formula notation, scientific names like Homo sapiens). |

### 6.4 What the Reviewer Sees

Per-language reviewer UI shows source and translation side-by-side. Highlighted differences from the AI's confidence-flagged tokens. Reviewer can:
- Approve the translation as-is.
- Edit any field; system re-checks consistency.
- Mark a term as 'add to glossary' for future questions.
- Reject and request a re-translation with a different prompt seed.
- Flag for cultural review (sent to a separate cultural reviewer queue for content involving customs, regional references, or politically sensitive material).

### 6.5 Publish Independence

Each language version of a question is independently publishable. Catalog Service queries 'all published questions where `artifact.status = PUBLISHED AND translation.status = PUBLISHED` for `language = student.preferred_language`'. A question that is approved in English but pending review in Hindi is invisible to Hindi-language students.

*Quiz orchestration handles the case where a quiz is configured in a language and a question lacks that translation: it either falls back to the primary language with a 'this question is not available in your language' notice or excludes the question entirely (configurable per quiz).*

### 6.6 Phase Roll-out

| Phase | Languages | Notes |
|---|---|---|
| **v1 (launch)** | EN, HI | AI translation + human review pipeline live for HI. Reviewer queue staffed. |
| **Phase 2 (3 months)** | EN, HI, TA, TE, BN, MR | Add four major regional languages. Reviewer panels for each. |
| **Phase 3 (12 months)** | EN, HI + 8 more | Add KN, ML, GU, PA, OR, AS, UR, NE. Cultural review formalised. |
| **Future** | International | Global expansion phase — depends on market entry. |

---

## 7. Evaluation Modes — How Each Type Is Judged

Every type belongs to one of four evaluation modes. The mode determines the latency, the failure surface, and the human-resource requirement.

| Mode | Description | Types |
|---|---|---|
| **DETERMINISTIC** | Pure code path. No AI. No human. Latency p99 < 10 ms. Result is final. Re-evaluation always produces the same answer for the same payload + response. | MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ASSERTION_REASON, MULTI_STATEMENT, NUMERIC_INTEGER/DECIMAL/RANGE, FORMULA_INPUT, MATCH, SEQUENCING, CLASSIFICATION, FILL_BLANK_*, CLOZE_PASSAGE, DIAGRAM_HOTSPOT, DIAGRAM_LABEL, MAP_LOCATION, PICTORIAL_IDENTIFY |
| **AI_ASSISTED** | AI evaluates, returns confidence. High-confidence results final. Low-confidence routes to human review. | SHORT_TEXT (high-confidence path) |
| **HYBRID** | AI evaluates first; calibration-sample of responses always reviewed by humans regardless of AI confidence; rubric-driven. | ESSAY, DESCRIPTIVE_LONG, CASE_STUDY (per child), COMPREHENSION_LONG (per child) |
| **HUMAN** | Always human-graded. AI offers suggestions but never finalises. Used when the consequence of error is high (final exams, certifications). | Reserved — used by Quiz/Exam orchestrator setting on a per-test basis. Any HYBRID type can be configured to HUMAN-only for a given test. |

### 7.1 Confidence Thresholds (HYBRID mode)

| Confidence range | Action | Rationale |
|---|---|---|
| ≥ 0.95 | Auto-finalise | AI is very confident; calibration shows < 1% disagreement with human at this level. |
| 0.75 – 0.95 | Sample 5% | Random subsample sent to human for ongoing calibration. |
| < 0.75 | Human required | AI unsure; human grade is the source of truth. |
| AI error | Human required | Provider unreachable, schema validation failed, etc. |

*Calibration: monthly comparison of AI vs human grades on the same responses; thresholds adjusted if disagreement exceeds 5%.*

### 7.2 The Human Grader Workflow

When a Resolution returns `PENDING_HUMAN_REVIEW`, it enters the grading queue. Graders are a separate role with their own interface.

1. Grader picks an item (or system auto-assigns based on language and subject).
2. Grader sees: stem, rubric, model answer, student response, AI's per-criterion judgement (collapsed by default).
3. Grader scores each criterion (or accepts AI's). System computes per_part details.
4. Grader can flag for second-opinion; second grader reviews independently.
5. Final Resolution emitted; orchestrator informed via webhook.
6. Grader's per-criterion decisions feed back into the calibration corpus.

---

## 8. API Surface

### 8.1 Content Engine Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/content/types` | Returns the full type registry, including which families and which evaluation modes. | Bearer |
| GET | `/content/types/{typeId}/payload-schema` | JSON schema for the type's payload — used by the authoring UI. | Bearer |
| GET | `/content/types/{typeId}/translatable-fields` | Lists which payload fields are translatable. | Bearer |
| GET | `/content/exams/{examId}/supported-types` | Per-exam type filter for authoring. | Bearer |
| POST | `/content/questions` | Create a question artifact. payload validated through dispatcher. | Creator |
| POST | `/content/questions/{id}/submit` | Move artifact to peer-review queue. | Creator (owner) |
| GET | `/content/questions/{id}/translations` | List all translation rows for an artifact, with status per language. | Bearer |
| POST | `/content/questions/{id}/translations/{lang}/request` | Trigger AI translation for a language. Async; returns job_id. | Creator (owner) |
| GET | `/content/questions/{id}/translations/{lang}` | Read translation payload + review status. | Bearer |
| POST | `/content/questions/{id}/translations/{lang}/review` | Approve / edit / reject a translation. Reviewer-only. | Reviewer |
| POST | `/content/ai/draft` | Request AI to draft a question given (type_id, topic, difficulty, exam). Returns draft payload, marked AI_DRAFT. | Creator |
| POST | `/content/ai/quality-check` | Run AI quality check on a payload before submit. Returns warnings. | Creator |

### 8.2 Evaluation Service Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/evaluation/evaluate` | Evaluate a single response. Returns Resolution. Sync for DETERMINISTIC; sync with confidence for AI_ASSISTED; sync but may return PENDING_HUMAN_REVIEW for HYBRID. | Service |
| POST | `/evaluation/batch` | Evaluate multiple responses (e.g. on quiz submit). Returns array of Resolutions. | Service |
| GET | `/evaluation/responses/{id}/status` | Poll status of a PENDING_HUMAN_REVIEW response. | Service |
| POST | `/evaluation/responses/{id}/re-evaluate` | Re-run evaluation against current rubric / current AI prompt. | Admin |
| GET | `/grading/queue` | Human grader's queue. Filter by language and subject. | Grader |
| POST | `/grading/responses/{id}/grade` | Grader submits per-criterion judgement. | Grader |

### 8.3 Localisation Service Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/localisation/translate` | Translate text or payload to target language. Internal; called by Content Service. | Service |
| GET | `/localisation/glossary/{subject}/{language}` | Read subject glossary entries for a language. | Bearer |
| POST | `/localisation/glossary/{subject}/{language}` | Admin/reviewer adds glossary term. | Admin |
| GET | `/localisation/jobs/{jobId}` | Status of an async translation job. | Bearer |

---

## 9. Risks & Open Items

| ID | Risk / Issue | Severity | Status |
|---|---|---|---|
| **CE-R1** | AI hallucinates plausible-but-wrong content — author may approve without noticing. | P0 | Mitigation: AI_DRAFT marker forces explicit edit before submit; quality check pass independently verifies. |
| **CE-R2** | Subjective evaluation drift over time as LLM provider updates models — past responses no longer evaluate identically. | P0 | Mitigation: prompt versioning + monthly calibration; re-evaluate flagged responses on prompt change. |
| **CE-R3** | Translation introduces ambiguity — student in Hindi gets a question with two defensible answers. | P0 | Mitigation: per-language reviewer mandatory; cultural review queue for high-context content. |
| **CE-R4** | Glossary drift — subject terms translated inconsistently across question bank. | P1 | Mitigation: locked glossary; AI prompt always includes relevant glossary terms; reviewer 'add to glossary' workflow. |
| **CE-R5** | Subjective grading bias — graders score differently across days, students, demographics. | P1 | Mitigation: anonymised grading (student id hidden); calibration sets; second-grader sampling. |
| **CE-R6** | Cost overrun on AI calls during peak generation periods. | P1 | Mitigation: per-creator quotas; cost dashboard; provider routing with cheaper fallback. |
| **CE-R7** | Map / image storage cost growth. | P2 | Mitigation: S3 Intelligent-Tiering; auto-WebP; CDN caching. |
| **CE-R8** | Audio/video infra not in v1 means LISTENING_COMP is a deferred dependency. | P2 | Status: flag-gated; full design in this catalogue; implementation deferred to Phase 2. |
| **CE-R9** | KBC-style gamification creates engagement but not learning — could conflict with platform's pedagogical positioning. | P2 | Mitigation: gamified types restricted to designated test modes; never appear in practice or adaptive. |
| **CE-OPEN-1** | Should AI translation be allowed to publish low-stakes content (e.g. KBC entertainment) without per-language review? | Open | Tracked for Phase 2 review. |
| **CE-OPEN-2** | Should subjective rubrics be exam-specific or universal? Currently per-question, but exam-wide standard rubrics may reduce author burden. | Open | Awaits product decision. |
| **CE-OPEN-3** | Whether to support cross-language student response (English question, Hindi answer). | Open | Currently NO. May reconsider for accessibility. |

---

## 10. Migration from the Previous Question-Type Spec

This catalogue supersedes the earlier 'Question Types & Resolution Engine' addendum that conflated content concerns with scoring. Migration is non-breaking for existing data; the changes are additive at the schema level and require interface updates in the dispatcher.

1. Existing question artifacts retain their `type_id` and `payload`.
2. The Resolution Service is renamed to Evaluation Service to better reflect its scope. API path `/resolution/*` deprecated; `/evaluation/*` introduced; both supported for one quarter.
3. `scoring_profiles` table is REMOVED from the content engine — migrated to the Quiz/Test Orchestration module unchanged.
4. Evaluation handlers no longer return marks; tests that depended on marks-in-resolution must be updated to call the orchestrator's scoring API.
5. New tables (translations, media, rubrics, evaluation_records, ai_jobs) added without breaking existing rows.
