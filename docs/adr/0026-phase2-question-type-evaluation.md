# ADR-0026: Phase 2 question type evaluation semantics + un-gating

- **Status**: proposed
- **Date**: 2026-05-11
- **Deciders**: CTO, Tech Lead, Product Lead, Content Lead
- **Related**: Builds on [ADR-0018](0018-polymorphic-question-types-and-resolution.md) (Type Handler Protocol + Resolution contract) and [ADR-0019](0019-ai-gateway-and-consolidation.md) (AI Gateway used for transcript scoring on LISTENING_COMP / VIDEO_QUESTION). Closes the v1 gate set listed in ADR-0018 §"22 v1 types + 6 gated stubs".

## Context

ADR-0018 shipped 24 v1 question types in Phase 5 (S37–S44). Five types were intentionally left as **GATED stubs** — schema + authoring shell + registry registration exist, but `evaluate()` returns `PENDING_HUMAN_REVIEW` with `prompt_version="feature_disabled:<flag>"` regardless of input:

| Type | Family | Original gate flag |
|---|---|---|
| `LISTENING_COMP` | Audio/Video | `audio_video_questions_enabled` |
| `VIDEO_QUESTION` | Audio/Video | `audio_video_questions_enabled` |
| `KBC_LIFELINE` | Interactive | `interactive_questions_enabled` |
| `TIMED_REVEAL` | Interactive | `interactive_questions_enabled` |
| `ADAPTIVE_DIFFICULTY` | Interactive | `interactive_questions_enabled` |

The gate was correct *at the time* — the underlying evaluation semantics weren't specified, authoring UIs were placeholders, and the student renderer (web + mobile) showed a "Phase 2" stub. Three things have changed:

1. **AI Gateway is live** (S43). Whisper-class transcription + Claude-based open-text scoring are available behind the same provider abstraction the rest of evaluation uses. Audio/Video grading no longer requires bespoke ML infra.
2. **The teacher + student panel audit** (2026-05-11) flagged that students on mobile see `_UnsupportedStub` for 20 of 24 wired types — and zero of the 5 gated types — making the per-surface gap the biggest visible product debt.
3. **All five gated types compose around already-functional inner question types.** KBC + TIMED_REVEAL wrap an `inner_question_id` MCQ_SINGLE; ADAPTIVE_DIFFICULTY picks one of `variants[].question_id`; LISTENING_COMP + VIDEO_QUESTION reference `child_questions[].question_id` (any wired type). The evaluation reduces to: *resolve the inner/served/child question through its existing handler, then wrap/aggregate*.

That last point is decisive. None of the five gated handlers needs new evaluation primitives — they need a **composition rule** plus, for Audio/Video, an AI Gateway hop to score open-text "summarise what you heard" responses.

## Decision

**Un-gate the 5 Phase 2 types by specifying composition semantics on top of existing handlers. Remove `feature_disabled:*` from `evaluate()`. Ship authoring UIs + web renderers + mobile renderers in the same release.**

### Per-type evaluation contract

#### KBC_LIFELINE — DETERMINISTIC, wrapping MCQ_SINGLE

Resolution = the inner question's Resolution, with one adjustment:

- If the student used the `50_50` lifeline, mark the question with `evaluator_metadata.notes = "lifeline_used:50_50"` and **leave status unchanged** (correctness is binary regardless of lifeline).
- If the student used `audience_poll` or `phone_a_friend`, same — record the lifelines in metadata.
- Lifelines do **not** alter the `status`. Marks adjustment (if any) is the orchestrator's concern, per ADR-0018 ("Resolution never carries marks"). Quiz Service applies a scoring-profile penalty.

Concretely:
```
inner_resolution = await get_handler(inner.type_id).evaluate(inner.payload, response.inner_response_payload, lang)
return inner_resolution.with_metadata(notes=f"lifelines_used:{','.join(response.lifelines_used)}")
```

#### TIMED_REVEAL — DETERMINISTIC, wrapping any inner type

Resolution = the inner question's Resolution, plus `evaluator_metadata.notes` records `answered_at_seconds` and which reveal steps had already fired. As with KBC, time-based marks adjustment lives in the orchestrator (configurable per test profile).

Specifically: if `reveals_make_easier=True` and `answered_at_seconds` is **before** the first reveal step's `at_seconds`, the orchestrator may award a "fast-answer bonus" — but the Resolution `status` is purely correctness-based.

#### ADAPTIVE_DIFFICULTY — DETERMINISTIC, wrapping the served variant

The engine logs which variant was actually served in `response.served_question_id`. The handler:

1. Verifies `served_question_id ∈ {v.question_id for v in payload.variants}` (else `INCORRECT` + `prompt_version="invalid_variant"`).
2. Resolves the served variant through its inner type handler.
3. Returns that Resolution unchanged. `evaluator_metadata.notes = f"served_difficulty:{level}"`.

#### LISTENING_COMP — HYBRID, child-aggregating

Composite parent over `child_questions: list[AudioVideoChildReference]`. For each child:

1. Resolve through the child's own handler with its own response payload (lifted from `response.children[].response_payload` by child `question_id`).
2. Aggregate children into a parent Resolution: `status = ALL_CORRECT? CORRECT : ANY_CORRECT? PARTIAL_CORRECT : INCORRECT`. `matched_count = sum(c.matched_count)`; `total_count = sum(c.total_count)`.
3. `evaluation_mode = HYBRID` because at least one child may itself be HYBRID (e.g. a SHORT_TEXT child); else `DETERMINISTIC`.

If `response.children` is missing for any `child_question_id`, that child gets `UNATTEMPTED`. No transcript scoring at the parent level — the transcript is *content the student listens to*, not something they author. The handler returns the audio file's URL + transcript via `render_payload` for the player.

#### VIDEO_QUESTION — same as LISTENING_COMP

Identical composition. Differs only in media kind (`video` vs `audio`) and that `transcript` is optional on the payload (caption may be auto-generated by Gateway).

### Why this isn't a heavyweight ML build

- Three of the five (KBC, TIMED_REVEAL, ADAPTIVE_DIFFICULTY) are pure composition — zero new evaluator code. The existing handler returns the inner Resolution with metadata updates.
- LISTENING_COMP + VIDEO_QUESTION fan-out to child handlers using the same composite pattern CASE_STUDY + COMPREHENSION_LONG already use today (S42). The new code is one shared `_aggregate_children` helper, not five new evaluators.
- No model training, no kappa monitoring, no auto-pause logic specific to these types. Existing AI Gateway routing handles any AI_ASSISTED child (a SHORT_TEXT inside a LISTENING_COMP, etc.).

### Authoring + rendering contract

**Teacher panel (`apps/web-portal`)** — Phase 2 placeholder cards in `MultiTypeAuthor.tsx` get replaced by real authoring forms:

- KBC_LIFELINE: pick existing MCQ_SINGLE from question bank + toggle which lifelines available + (if `audience_poll` enabled) distribution editor.
- TIMED_REVEAL: pick inner question + ordered list of `(at_seconds, additional_info)` reveal steps.
- ADAPTIVE_DIFFICULTY: pick 2–5 existing questions, assign distinct difficulty levels 1–5, pick starting difficulty.
- LISTENING_COMP / VIDEO_QUESTION: upload media (via existing `content_media` route) + transcript + ordered list of existing child questions.

**Student web (`apps/web-student/src/components/renderers`)** — five new renderer modules:

- `InteractiveRenderer.tsx`: KBC + TIMED_REVEAL + ADAPTIVE_DIFFICULTY. Each delegates to the inner type's renderer (recursive `<QuestionRenderer>` call), wrapping with lifeline buttons / reveal timer / difficulty hint.
- `AudioVideoRenderer.tsx`: LISTENING_COMP + VIDEO_QUESTION. HTML5 `<audio>` / `<video>` element + `<QuestionRenderer>` per child.

**Mobile (`apps/mobile/lib/quiz/polymorphic_renderer.dart`)** — five new widgets following the same recursive pattern. Audio/video uses `audioplayers` / `video_player` packages; the inner/child question recursion calls back into `PolymorphicRenderer.build()`.

### Storage

No schema migration. Phase 2 payloads already validate against `payloads.py`; only `evaluate()` changes. The `audio_video_questions_enabled` and `interactive_questions_enabled` feature flags are kept around (set to ON by default in `infra/feature_flags.yaml`) so a per-tenant emergency disable is still possible — but the handler no longer short-circuits on them.

## Alternatives considered

- **Keep gated, ship only Track A (mobile parity for the 24 wired types).** *Rejected* — the 5 gated types are blocking the "all 29 supported end-to-end" goal the audit surfaced. KBC + TIMED_REVEAL + ADAPTIVE_DIFFICULTY are essentially free (no new eval logic). Half-shipping leaves the parity gap visible.
- **Drop the gated types from the registry entirely.** *Rejected* — they're declared in ADR-0018 as v1 scope; CBSE class-7 KBC mode and JEE-Adv adaptive practice are committed roadmap items. Dropping forces a future re-introduce with the same composition rules we're writing today.
- **Build LISTENING_COMP/VIDEO_QUESTION as standalone graders with bespoke transcription.** *Rejected* — duplicates the AI Gateway. The composite-of-children pattern reuses every existing handler unchanged; transcript is metadata, not a scored field.
- **Wait for human-loop UX to be re-designed before un-gating.** *Rejected* — the existing `PENDING_HUMAN_REVIEW` path already handles low-confidence subjective children. Audio/Video doesn't introduce a new human-review shape.

## Consequences

### Positive

- **All 29 types are end-to-end functional in one release.** Teacher creates → student renders (web + mobile) → handler grades → Resolution flows to Quiz orchestrator. No silent fallbacks to human queue for these five.
- **Composition pattern reused, not invented.** Same `_aggregate_children` reducer as CASE_STUDY + COMPREHENSION_LONG. Same `<QuestionRenderer>` recursion as composite renderers. No new abstractions.
- **Per-tenant gating preserved.** Feature flags remain in place; default ON, but per-tenant override possible (e.g. an institution that doesn't want KBC gamification can disable). The handler no longer hard-codes the feature-disabled path.

### Negative

- **Adds two Flutter dependencies** (`audioplayers`, `video_player`) and one web map dependency footprint, plus an `image_picker` already in pubspec. Minor — these are mainstream packages, audited.
- **Mobile binary size +~1.5MB** for video_player codecs on Android. Acceptable for the use-case; deferred-load not needed.
- **Composite recursion depth** — a LISTENING_COMP could in principle nest a CASE_STUDY child which nests another composite. We cap recursion at depth 2 in `_aggregate_children` and reject deeper payloads at `author_validate()`. Practical content always fits.
- **ADAPTIVE_DIFFICULTY engine selection logic** lives outside the handler (in Quiz orchestration — which variant to serve). The handler only verifies the served variant is in the payload's pool and grades it; the *selection policy* (IRT-based vs streak-based) is a separate concern, deferred to a future ADR if/when content demand emerges.

### Follow-up work

- [ ] Flip handlers: `audio_video/handlers.py` + `interactive/handlers.py` evaluate() bodies replaced with composition logic (this release).
- [ ] Add `_aggregate_children` helper in `learning/types/base_handler.py` (extracted from existing composite handler code).
- [ ] Replace 5 Phase-2-placeholder forms in `apps/web-portal/src/pages/MultiTypeAuthor.tsx` with real authoring forms.
- [ ] Replace 5 placeholder cards in `apps/web-student/src/components/renderers/index.tsx` with `InteractiveRenderer` + `AudioVideoRenderer` modules.
- [ ] Add 5 new mobile widgets to `apps/mobile/lib/quiz/polymorphic_renderer.dart`; pin `audioplayers`, `video_player`, `flutter_map` in `pubspec.yaml`.
- [ ] Mobile parity (Track A) — port the 15 still-stubbed renderers (MCQ_MULTI, Numeric range/formula, Matching×3, Fill-in×3, Composite×2, Visual×4) to Flutter alongside this work.
- [ ] Handler tests: composition correctness (KBC + lifelines metadata; TIMED_REVEAL + answered_at; ADAPTIVE_DIFFICULTY served-variant validation; LISTENING_COMP + VIDEO_QUESTION aggregate-of-children).

## Review

Revisit by end of the sprint that ships this if any of the following:

- Composite recursion depth limit (2) proves too tight for a real content batch — relax to 3 with explicit `author_validate()` rejection at 4+.
- LISTENING_COMP / VIDEO_QUESTION transcript fidelity matters for grading (it doesn't today — transcript is *played to student*; if a future "summarise what you heard" question expands into the parent payload, revisit).
- ADAPTIVE_DIFFICULTY variant selection grows beyond "Quiz picks" into "handler picks" — surface a `select_variant(history)` Protocol method, ADR-0026 amends.
