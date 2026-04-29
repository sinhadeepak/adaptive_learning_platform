# Sprint 29 — P4-S29: Error-pattern classification

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Wrong answers gain a diagnostic taxonomy. Closes [GAP-P4-09](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-09--no-error-pattern-classification).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md) and [ADR-0016](../adr/0016-error-pattern-classification.md): without classification, "weakness diagnosis" stays generic ("you're weak in Mechanics") instead of actionable ("you make sign errors in inclined-plane problems — drill these 5"). S29 ships the heuristic-v1 classifier + the surface that turns it into a coaching signal.

## Backlog

### S29-A — Engagement migration 007: `error_classifications`

`analytics_schema` rev **007** adds a per-item classification table:

```sql
CREATE TABLE analytics_schema.error_classifications (
  session_id  UUID NOT NULL,
  item_idx    SMALLINT NOT NULL,
  user_id     UUID NOT NULL,
  topic_id    UUID NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN (
    'silly_mistake','conceptual_gap','time_pressure',
    'formula_error','sign_or_unit_error','unattempted'
  )),
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, item_idx)
);
CREATE INDEX idx_error_class_user ON analytics_schema.error_classifications (user_id, topic_id);
```

Keyed on `(session_id, item_idx)` so re-applying on a JetStream redelivery is a no-op via `ON CONFLICT … DO NOTHING`.

### S29-B — Pure-function classifier

New `engagement/analytics/error_classifier.py` per ADR-0016:

```python
def classify_error(
    *,
    is_correct: bool,
    answered: bool,
    time_spent_ms: int | None,
    mastery_ewa: float,
    chosen_choice_text: str,
    correct_choice_text: str,
) -> str  # one of the 6 axes
```

Decision rules (in priority order):
- `unattempted` if `answered is False`
- (skip when `is_correct is True`)
- `time_pressure` if `time_spent_ms < 30000` AND `mastery_ewa > 0.5`
- `silly_mistake` if `mastery_ewa > 0.7`
- `conceptual_gap` if `mastery_ewa < 0.4`
- `sign_or_unit_error` via `_is_sign_or_unit_error(chosen, correct)` heuristic
- `formula_error` (fallback)

Plus pure helper `_is_sign_or_unit_error(chosen, correct)` — sign-flip detection (`"5"` vs `"-5"`) + lightweight unit-pair list.

### S29-C — Wire into `process_session`

Extend `process_session` to classify each wrong/unanswered item from the items array (already populated since S22) and upsert into `error_classifications`. Best-effort (try/except) — a classification failure must not roll back the mastery update.

### S29-D — Endpoint `GET /analytics/student/{user_id}/error-patterns`

Returns:

```json
{
  "userId": "...",
  "since": "2026-03-01",
  "totals": {"silly_mistake": 8, "conceptual_gap": 12, ...},
  "topPatterns": [
    {"classification": "conceptual_gap", "count": 12,
     "topTopics": [{"topicId": "...", "topicTitle": "Mechanics", "count": 5}]}
  ]
}
```

### S29-E — Web-student "Pattern" panel

Extend `WeaknessDiagnosis.tsx` with a Pattern panel sourced from the new endpoint. Pure helper `apps/web-student/src/lib/error_patterns.ts::summarisePatterns(rollup)` for the display logic.

### S29-F — Tests

| File | Tests | Type |
|---|---|---|
| `services/engagement/tests/analytics/test_error_classifier.py` | 14 | Python unit (each classification path + sign/unit heuristic + edge cases) |
| `apps/web-student/src/lib/error_patterns.test.ts` | 4 | Vitest |

### S29-G — Smoke + closure

1 new smoke step (61). Closure doc 69. Master phase index updated.

## Out of scope

- LLM v2 sub-classifier (ADR-0016 reserves it; gate behind feature flag).
- Question-author "common wrong-answer rationale" tagging (P5).
- Mobile parity (S35).
