# ADR-0016: Error-pattern classification taxonomy

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead, Product Lead, Content Lead
- **Related**: P4-S29 gating ADR. Builds on [ADR-0013](0013-time-per-question-analytics.md) (time-per-question). Extends `services/learning/src/learning/adaptive/weakness.py`.

## Context

Wrong answers in `quiz_session_items` carry only `is_correct = false`. The platform cannot tell:

- Was this a **silly mistake** (the student knows it; misclick or careless slip)?
- A **conceptual gap** (the student doesn't know the underlying concept)?
- A **time-pressure error** (rushed; would have got it right with more time)?
- A **formula misapplication** (right concept, wrong formula)?
- A **sign/unit error** (right approach, mechanical mistake)?

Without this taxonomy, weakness diagnosis stays generic ("you're weak in Mechanics") instead of actionable ("you make sign errors when applying Newton's 2nd law in inclined-plane problems — drill these 5").

## Decision

**Adopt a 6-axis error taxonomy with heuristic-v1 classification at submit time. Reserve LLM-v2 path for post-launch refinement.**

### Taxonomy

| Tag | Meaning | v1 heuristic |
|---|---|---|
| `silly_mistake` | Knew it but slipped | mastery > 0.7 AND wrong; time_spent_ms > 30s (i.e., not rushed) |
| `conceptual_gap` | Doesn't know the concept | mastery < 0.4 AND wrong |
| `time_pressure` | Rushed; would have got it right with more time | time_spent_ms < 30s AND mastery > 0.5 |
| `formula_error` | Right concept, wrong formula application | fallback when no other axis matches AND mastery in [0.4, 0.7] |
| `sign_or_unit_error` | Right approach, sign/unit/magnitude mechanical mistake | chosen_choice_text differs from correct only in sign or unit (string-similarity heuristic, see below) |
| `unattempted` | Skipped (vs answered wrong) | answered_at IS NULL when session submitted |

### Sign/unit error heuristic (v1)

```python
def is_sign_or_unit_error(chosen: str, correct: str) -> bool:
    """Detect when a wrong choice is the correct value with sign/magnitude/unit flipped."""
    # Strip whitespace + lowercase
    c = chosen.strip().lower()
    k = correct.strip().lower()
    # Sign flip: "5" vs "-5", "+5" vs "5"
    if c.lstrip("+-") == k.lstrip("+-"):
        return True
    # Unit shift: "5 m" vs "5 cm", "5 kg" vs "5 g" (very limited matching)
    UNIT_PAIRS = {("m","cm"), ("m","mm"), ("kg","g"), ("s","ms"), ("kj","j"), ("mol","mmol")}
    # ... heuristic continues; full implementation in error_classifier.py
```

This is deliberately a v1 heuristic. False positives are acceptable; the diagnostic surface clearly labels the inference as automatic.

### Schema

```sql
ALTER TABLE analytics_schema.processed_session_items
  ADD COLUMN error_classification TEXT NULL
    CHECK (error_classification IN (
      'silly_mistake',
      'conceptual_gap',
      'time_pressure',
      'formula_error',
      'sign_or_unit_error',
      'unattempted'
    ));
```

(If the schema doesn't yet have `processed_session_items`, the classification lives on a new table `error_classifications` keyed on `(session_id, item_idx)`.)

### Surface

- `GET /analytics/student/{user_id}/error-patterns?examId=X&since=YYYY-MM-DD`
  Returns per-tag counts + top-3 example sessions + recommended drills.
- web-student weakness-diagnosis surface gains a "Pattern" panel:
  - "8 silly mistakes this week (mastery > 0.7 but wrong)"
  - "3 sign-or-unit errors in Kinematics — drill these 5"
  - "12 conceptual gaps — start with Newton's Laws"

### LLM-v2 path (reserved for P5)

A reserved LLM call re-classifies edge cases (the v1 falls into `formula_error` fallback for ~30-40% of items; LLM can sub-classify these into "wrong formula chosen", "right formula misapplied", "off-by-factor"). Schema supports this via the same `error_classification` column with extended values gated by a feature flag (`enable_llm_error_v2`).

## Alternatives considered

- **No classification, only count wrong answers** (status quo). *Rejected* — strategic gap audit identified this as a key missing diagnostic; without it, "weakness diagnosis" stays vague.
- **LLM-only classification from day 1**. *Rejected for v1* — every wrong answer triggers an LLM call → cost + latency explosion. Heuristic v1 covers 60-70% of cases; LLM is the surgical refinement.
- **Manual student-tagged classification** ("was this a silly mistake?" prompt after each wrong answer). *Rejected* — friction kills engagement; aspirants don't want post-mortem questionnaires.
- **Per-question metadata** (each question authored with the "common errors" list). *Considered, partially adopted* — content authors can optionally tag the most-common-wrong-answer-rationale on questions; the classifier can override v1 inference when the chosen choice matches a tagged rationale. Defers to content effort; v1 ships without it.

## Consequences

### Positive

- **Weakness diagnosis becomes actionable** — "drill 5 sign-error examples" is concrete; "you're weak in Mechanics" is not.
- **Time-pressure pattern detection** — gives strategy-coaching surface a foundation.
- **Adaptive engine gains a new signal** — recommend more time-pressure drills if that pattern dominates.
- **Heuristic-first keeps LLM cost zero in v1** — gating LLM behind a flag is an established pattern in this codebase (see Sprint 4 AI verticals).

### Negative

- **Heuristic precision is limited** — `formula_error` is the catch-all bucket; many items will land there with low information value.
- **Sign-or-unit heuristic is fragile** — string similarity over choice text won't catch every case. False negatives are acceptable; false positives are mitigated by the conservative match.
- **One additional column on a hot table** — `processed_session_items` gets a TEXT column with CHECK constraint; index storage cost is small.

### Follow-up work

- [ ] Migration in `engagement/alembic/analytics/` — `error_classification` column (P4-S29).
- [ ] Pure-function `classify_error()` helper + 14 unit tests (P4-S29).
- [ ] Sign-or-unit-error heuristic + tests (P4-S29).
- [ ] `process_session()` extension (P4-S29).
- [ ] `/analytics/student/{user_id}/error-patterns` endpoint (P4-S29).
- [ ] web-student weakness-diagnosis "Pattern" panel (P4-S29).
- [ ] Question-author option to tag common-wrong-answer rationale (P4-S29 stretch or P5).
- [ ] LLM-v2 sub-classifier behind feature flag (P5).

## Review

Revisit by **end of Phase 4** or earlier if:

- `formula_error` catch-all exceeds 50% of classifications — heuristic v1 is too coarse; ship LLM-v2 sooner.
- Educators report the Pattern panel as the most-used view — invest in the question-author rationale-tagging path.
- Cohort accuracy distribution shifts (e.g., bulk PYQ ingest changes the difficulty profile) and thresholds need recalibration.
