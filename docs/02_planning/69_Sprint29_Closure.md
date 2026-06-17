# Sprint 29 Closure — P4-S29 Error-pattern classification

**Sprint window:** 2026-04-28
**Plan:** [`docs/02_planning/68_Sprint29_Plan.md`](68_Sprint29_Plan.md)

## Scope delivered

### S29-A — Engagement migration 007 — DONE

`analytics_schema` rev **007** adds `error_classifications` per [ADR-0016](../adr/0016-error-pattern-classification.md):

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

`(session_id, item_idx)` PK + `ON CONFLICT DO UPDATE` makes JetStream redelivery a no-op.

### S29-B — Pure-function classifier — DONE

`engagement/analytics/error_classifier.py` — six-axis taxonomy with priority-ordered rules:
1. `unattempted` — not answered.
2. (correct → not classified).
3. `time_pressure` — `time_spent_ms < 30s` AND `mastery > 0.5`.
4. `silly_mistake` — `mastery > 0.7`.
5. `conceptual_gap` — `mastery < 0.4`.
6. `sign_or_unit_error` — chosen text differs from correct only in sign or unit (sign-flip + small unit-pair allowlist).
7. `formula_error` — fallback.

Pure functions only: `classify_error`, `is_sign_flip`, `is_unit_swap`, `is_sign_or_unit_error`. No DB / HTTP coupling.

### S29-C — `process_session` extension — DONE

Wired into `events.py::_on_session_completed` after `upsert_session_section_stats` (S22). Best-effort try/except so a classifier write doesn't roll back the mastery + section-stats writes above. Per-item iteration over the `items` array (S22 payload extension).

The Quiz NATS payload doesn't carry `chosen_choice_text` / `correct_choice_text` today — the heuristic falls through cleanly when those fields are missing. Choice-text propagation is a follow-up (P5+) under the same ADR.

### S29-D — `error_classifier_repo.py` — DONE

- `upsert_classification(session, …)` — idempotent insert.
- `list_classifications_for_user(session, user_id, since_iso?, limit=1000)` — joins catalog topics for title.
- `aggregate_patterns(rows)` — pure-function rollup: `totals` per tag + `topPatterns` (top-3 topics per tag).

### S29-E — Endpoint — DONE

`GET /analytics/student/{user_id}/error-patterns?since=YYYY-MM-DDTHH:MM:SSZ` returns `{userId, since, totals, topPatterns}`.

### S29-F — Web-student helpers — DONE

`apps/web-student/src/lib/error_patterns.ts`:
- `tagLabel(tag)` → human label.
- `tagColour(tag)` → token colour map.
- `summarisePatterns(rollup)` → filters zero rows + sorts by count desc.

(Full `WeaknessDiagnosis.tsx` panel integration deferred to S33 educator polish — the helpers + endpoint ship now so the consumer surface lands incrementally.)

### S29-G — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/engagement/tests/analytics/test_error_classifier.py` | 16 | Python unit (each tag path + sign/unit heuristic + boundary conditions) | written + verified standalone via `python -c` (full pytest gated on Docker autouse conftest) |
| `apps/web-student/src/lib/error_patterns.test.ts` | 4 | Vitest | 4/4 ✅ |

**Total: 20 new tests.** Plan estimated 14 + 4 = 18; classifier picked up 2 extra boundary tests.

### S29-H — Smoke — DONE

1 new step (61): `GET /analytics/student/{student}/error-patterns` returns shape `{userId, totals, topPatterns}`.

Smoke target: **61 steps**.

## Carry-overs to Sprint 30

| Item | Why deferred |
|---|---|
| `WeaknessDiagnosis.tsx` Pattern panel UI integration | S33 educator polish |
| Choice-text propagation through the Quiz NATS payload | P5+ — needs Quiz Go schema change |
| LLM v2 sub-classifier (formula vs sign vs unit subdivision) | ADR-0016 reserves |
| Mobile parity | S35 |
