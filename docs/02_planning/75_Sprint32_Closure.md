# Sprint 32 Closure — P4-S32 Peer percentile per topic

**Plan:** [`74_Sprint32_Plan.md`](74_Sprint32_Plan.md)

## Scope delivered

- **Pure-function `engagement/analytics/peer_percentile.py`**: `compute_peer_percentile`, `is_anonymity_threshold_met`, `summarise_percentile`. Strict-below percentile; cohort < 30 hides the result with reason `cohort_too_small` per NFR-P4-06.
- **`peer_percentile_repo.py`**: `list_peer_ewas` (cross-schema join into catalog for exam scoping; excludes the requesting user) + `get_user_topic_ewa`.
- **`GET /analytics/peer-percentile/{user_id}?examId=&topicId=`**: returns `{userId, examId, topicId, hidden, percentile?, cohortSize, ...}`. Cold-start case (user has no mastery on the topic) → `hidden:true, reason:"user_has_no_mastery"`.
- **Web-student helpers `peer_percentile.ts`**: `bandFor` (top/high/mid/low) + `pillState` (hidden/visible mapping with ordinal label).

## Tests

| File | Tests | Status |
|---|---|---|
| `services/engagement/tests/analytics/test_peer_percentile.py` | 8 | Verified standalone via `python -c` |
| `apps/web-student/src/lib/peer_percentile.test.ts` | 4 | 4/4 ✅ |

## Smoke

+1 step (peer-percentile shape assertion) → smoke target 64.

## Carry-overs

- TopicDetail.tsx pill render integration → S33 polish (helpers ship now; UI integration follows the same pattern as S26 prereq pill).
- Educator cohort-drill-down per-topic percentile → S33.
- TTL-cached materialised view for hot topics → revisit if p95 > 200 ms.
- Mobile parity → S35.
