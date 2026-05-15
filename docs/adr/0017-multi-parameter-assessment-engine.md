# ADR-0017: Multi-parameter assessment engine

- **Status**: accepted (frontend + backend shipped — see Phase 5/6 commits)
- **Date**: 2026-04-30
- **Deciders**: CTO, Tech Lead, Product Lead, ML Lead
- **Related**: P5-S37 gating ADR. Builds on [ADR-0014](0014-spaced-repetition-scheduling.md) (SM-2 — extended to concept grain), [ADR-0015](0015-calibrated-rank-prediction.md) (cohort percentile — extended per-concept), [ADR-0016](0016-error-pattern-classification.md) (error patterns — tagged to concept_id). Companion: [Multi-Parameter Adaptive Engine Build Plan](../../.claude/plans/gentle-popping-diffie.md).

## Context

ALP's adaptive engine today runs on **one underlying signal**: per-`(user, topic)` EWA mastery (α=0.4) in `services/engagement/src/engagement/analytics/mastery.py`. Every other "assessment" surface — readiness, syllabus coverage (S28), peer percentile (S32), predicted AIR (S31), error patterns (S29), gap analysis (S33) — is a derived rollup of that one number.

This is structurally behind Embibe (which assesses at concept-node grain across multiple cognitive dimensions) and not meaningfully ahead of Allen / Unacademy / PhysicsWallah (topic-grain heuristics labelled "AI"). The platform claims "AI-powered competitive exam preparation" but its assessment layer is one-dimensional.

The strategic gap audit ([`docs/02_planning/52_ExamPrep_Strategic_Gap_Audit.md`](../02_planning/52_ExamPrep_Strategic_Gap_Audit.md)) and the user directive — *"build the engine first to be best-in-industry, then add content"* — together require an assessment substrate that captures the multi-dimensional nature of how a student actually *knows* a concept. Concept mastery alone misses **knowledge depth** (does the student recall the formula but cannot apply it?), **fluency** (do they get it right but slowly?), **confidence calibration** (do they think they know it but they don't?), **transfer** (do they apply it across contexts?), and **retention** (does mastery decay if not revisited?).

Without these dimensions:
- Diagnostic stays generic: *"weak in Mechanics"* instead of *"Newton-2nd-law mastery 0.3, Bloom-Apply 0.2, fluency 1.4× exam-pace target, you're overconfident by 18%"*.
- Mock-test composition stays naive: *"20 questions per topic"* instead of cognitive-demand-weighted blueprint matching.
- Honest signalling — already a real differentiator (S31 `percentileSource`, S32 anonymity threshold) — has no per-dimension surface to extend to.

## Decision

**Adopt a 9-dimension multi-parameter assessment substrate keyed at concept grain. Each dimension has a concrete signal, named storage, and surfacing endpoint.**

### The 9 dimensions

| # | Dimension | Signal | Storage | Surfaced via |
|---|---|---|---|---|
| 1 | Concept mastery | Per-concept EWA (α=0.4) | `analytics_schema.concept_mastery` | `GET /analytics/concept-mastery/{user}` |
| 2 | Knowledge depth (Bloom) | Per-(concept, bloom-level) EWA | `analytics_schema.bloom_mastery` | `GET /analytics/student/{user}/multi-profile` |
| 3 | Fluency | (actual_ms / expected_ms) calibrated, per concept | `analytics_schema.fluency` | profile endpoint |
| 4 | Accuracy patterns | 6-axis classifier (S29) tagged to concept_id | `analytics_schema.error_classifications` | existing endpoint |
| 5 | Retention | SM-2 + EWA-clamp at concept grain (extends S27 / ADR-0014) | `analytics_schema.revision_queue` (FK to concept_id) | existing endpoint |
| 6 | Confidence calibration | (predicted-correctness self-report) vs (actual); Brier score | `analytics_schema.confidence_calibration` | profile endpoint |
| 7 | Transfer ability | Performance on multi-concept-tag items vs single-tag baseline | derived (no new table) | `GET /analytics/transfer/{user}` |
| 8 | Procedural skill | Multi-step problem step-correctness | `analytics_schema.procedure_attempts` + optional `procedural_steps_json` on questions | profile endpoint |
| 9 | Strategic (test-taking) | Mock pacing, marking-for-review, attempt-order — derived from S22 + S25 | derived (no new table) | mock results page |

### Concept-grain substrate

Topics decompose into concepts via a new `catalog_schema.concepts` table (S37). Existing topics seed as `kind='topic_root'` concept rows, reusing their UUID — so existing `topic_id` references resolve as `concept_id` without rewrite. Every question gets one or more `(question_id, concept_id, role)` tags via `content_schema.question_concepts` (S37). The 480 seeded MCQs auto-tag to their topic-root concept.

### Honest-signalling preserved per dimension

Every dimension surfaces `n` (sample size) and a confidence indicator. Brier score for confidence calibration. `cohortSource` already exists at the topic level (S31); extends to concept level. Transfer ability is hidden when fewer than 5 multi-tag items have been attempted. The honest-signalling moat — already differentiating — extends to all 9 dimensions.

### What this is not

- **Not** per-concept IRT θ as the primary mastery signal. With 480 items spread across ~100 concepts post-backfill, 1–5 items per concept is statistical theatre. Per-concept IRT lands later when the bank reaches ~30 items/concept; no sprint claimed.
- **Not** a replacement for the existing topic-EWA path. Topic mastery rows continue to update; concept_mastery runs in addition. Topic-grain endpoints continue to serve. UI components that render at topic grain are auto-rolled-up from concept grain via the topic-as-root-concept backfill.

## Alternatives considered

- **Per-concept IRT θ as primary signal**. *Rejected for v1* — current item bank (480 items / 100 concepts ≈ 1–5 items/concept) cannot calibrate per-concept IRT. EAP estimates would be dominated by priors. Statistical theatre is worse than honest EWA. Revisit when bank reaches ~30 items/concept.
- **Single concept-EWA only (no Bloom / fluency / confidence)**. *Rejected* — misses the dimensions that are competitive differentiators. Embibe matches us on concept mastery + retention; the only path to "best in industry" is to ship the dimensions Embibe doesn't publish (Bloom-depth, error patterns, confidence calibration, transfer).
- **Bayesian Knowledge Tracing (BKT) instead of EWA**. *Rejected for v1* — 4-parameter calibration (init / learn / slip / guess) needs a real cohort to fit. Proposing it pre-launch is premature. BKT is on the long-game research roadmap (no sprint claimed) as an A/B test against EWA once cohort > 10K.
- **Multi-dimensional IRT (M-IRT)**. *Rejected for v1* — too sparse at 480 items. Becomes viable when item bank reaches 5K+ across well-tagged concepts.
- **Skip Bloom-depth, ship the other 8 dimensions only**. *Rejected* — Bloom (Recall / Understand / Apply / Analyse / Evaluate / Create) is the single most actionable additional axis beyond raw mastery. Without it, "you know the formula but cannot apply it" is invisible. The cost is one column on `bloom_mastery` and one tag on each question's `cognitive_demand` JSONB. Tiny cost; large signal.

## Consequences

### Positive

- **Diagnostic depth becomes industry-leading.** Students see a path through their weakness — *"Newton-2nd-law mastery 0.3 because Newton-1st-law (prereq, mastery 0.5) is the gap"* — not just a topic label. ADR-0018 + the diagnostic root-cause walker (S41) compose with this ADR to deliver the path.
- **Five dimensions are differentiators Embibe and others don't publish.** Bloom-depth, accuracy patterns (S29 already shipped), confidence calibration, transfer ability, mastery-clamp retention. After S37–S48 ALP leads on these. Architectural rigour + honest signalling become a moat that doesn't require content lead.
- **Mock-test composition becomes cognitive-demand-aware.** Composition can now be *"5 Recall + 8 Apply + 5 Analyse per concept by exam blueprint weight"* rather than uniform-per-topic. Closer to real exam shape.
- **Course learning is mode-agnostic on the same primitives.** Concept tree adds `ordering_hint` + `assessment_optional` — exam-prep is graph traversal with blueprint weights; course learning is sequential traversal with ordering hints. Same 9 dimensions in both modes. No second engine.
- **Confidence calibration is a metacognitive correction no competitor offers.** Over weeks, the platform shows students *"you say 'sure' but get it wrong 30% of the time on Apply-Mechanics"*. This is the kind of feedback teachers give; the platform now gives it at scale.

### Negative

- **Schema surface grows materially.** 5 new analytics tables (concept_mastery, bloom_mastery, fluency, confidence_calibration, procedure_attempts) and 3 new catalog tables (concepts, concept_edges, skills). All additive with NULL-able defaults; no destructive migrations. The growth is justified by the 9-dimension reach but it's real.
- **process_session fan-out is more complex.** The existing topic-mastery + readiness + error-classifier path becomes a topic-mastery + readiness + error-classifier + concept-mastery + bloom-mastery + fluency + confidence path. Best-effort try/except per existing pattern (S22 / S27 / S29) keeps transient failures from rolling back the load-bearing topic-mastery update. Worth the complexity; rollback discipline holds.
- **Confidence slider adds UX friction.** Per-question confidence input is friction at quiz time. Mitigated: optional, default off, only enabled in modes where calibration is the goal (diagnostic, mock test). UX research (ENG-OAQ-11) decides numeric slider vs ordinal buttons.
- **Per-concept content tagging is a content-team task.** Auto-migration tags everything as topic-root MCQ; richer concept tagging is async content work. Engine works at coarse grain immediately; gets richer as content lands. Acceptable; explicit in the plan's content-team coordination section.

### Follow-up work

- [ ] Migrations: `catalog_schema.concepts` + `concept_edges` + `skills` (P5-S37).
- [ ] Migrations: 5 analytics tables — concept_mastery / bloom_mastery / fluency / confidence_calibration / procedure_attempts (P5-S39).
- [ ] Backfill 24 topics → 24 topic-root concepts; backfill 480 questions → 480 question_concepts rows (P5-S37).
- [ ] Pure-function `update_concept_mastery`, `update_bloom_mastery`, `update_fluency`, `record_confidence` modules (P5-S39).
- [ ] `process_session` fan-out extension with best-effort try/except per dimension (P5-S39).
- [ ] `GET /analytics/concept-mastery/{user_id}` + `/analytics/student/{user_id}/multi-profile` + `/analytics/transfer/{user_id}` endpoints (P5-S39, P5-S41).
- [ ] Confidence slider in front-end (P5-S39); UX decision on slider vs ordinal (ENG-OAQ-11).
- [ ] ConceptProfile.tsx 9-dim radar UI on web-student (P5-S46).
- [ ] Per-concept IRT θ aggregation behind feature flag — gated on item bank ≥ 30/concept (no sprint claimed; long-tail follow-up).
- [ ] BKT-vs-EWA A/B test design — gated on real cohort > 10K (long-game research; no sprint claimed).

## Review

Revisit by **end of P5-S43** (Phase 5 mid-sprint review) or earlier if:

- Per-concept attempt counts cross 30/concept across multiple subjects — per-concept IRT becomes viable; ADR amends to cite the IRT extension as the canonical mastery signal.
- Confidence-calibration adoption is below 20% per quiz session — UX research surfaces low-friction alternatives; ADR amends Bloom-depth and confidence dimension surfacing.
- A real cohort exceeds 10K active students — design BKT-vs-EWA A/B test; ADR amends to capture the experiment design and decision date.
- Honest-signalling regression: any dimension surfaces a number without `n` or `confidence` — ADR violation; fix immediately.
