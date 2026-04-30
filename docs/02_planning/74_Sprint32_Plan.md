# Sprint 32 — P4-S32: Peer percentile per topic

**Sprint window:** 2026-04-28
**Theme:** Per-(user, topic, exam) percentile rank vs the platform cohort, with anonymity threshold. Closes [GAP-P4-11](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-11--no-peer-percentile-per-topic).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md): aspirants want a benchmarking signal — "you're at the 67th percentile vs JEE 2027 students on Mechanics" — that the platform doesn't surface today. S32 ships the per-topic percentile aggregator + the anonymity-threshold gate (NFR-P4-06).

## Backlog

### S32-A — Pure-function peer-percentile helper

New `engagement/analytics/peer_percentile.py`:

- `compute_peer_percentile(user_ewa, peer_ewas)` → `float | None` — fraction of peers with EWA strictly less than `user_ewa`, scaled to 0–100. Returns `None` when peer list is empty.
- `is_anonymity_threshold_met(peer_count, threshold=30)` → bool — gate that hides percentile when cohort too small (NFR-P4-06).
- `summarise_percentile(user_ewa, peer_ewas, *, threshold=30)` → result dict. Either `{hidden: true, reason: 'cohort_too_small', cohortSize}` or `{hidden: false, percentile, cohortSize, userEwa}`.

Pure functions only.

### S32-B — `peer_percentile_repo.py`

New module:

- `list_peer_ewas(session, exam_id, topic_id, *, exclude_user_id)` — SQL query joining `analytics_schema.mastery` against `catalog_schema.topics + subjects + exams` for the cohort. Excludes the requesting user from the comparison set.
- Read-only — no caching layer in S32 (eviction TTL caching defers to a future stabilisation slot).

### S32-C — Endpoint `GET /analytics/peer-percentile/{user_id}`

Query params: `examId` (required), `topicId` (required). Returns the summary shape from `summarise_percentile`. Hides the result when cohort < 30 (NFR-P4-06).

### S32-D — Topic-detail UI integration

Web-student `TopicDetail.tsx` adds a percentile pill below the existing prereq pill (S26):

- Hidden when `cohort_too_small`.
- "67th percentile (N=230)" rendered token-coloured by performance band (top 10 → green, mid → blue, bottom → amber).

Pure helper `apps/web-student/src/lib/peer_percentile.ts::pillState(percentile, cohortSize)`.

### S32-E — Tests

| File | Tests | Type |
|---|---|---|
| `services/engagement/tests/analytics/test_peer_percentile.py` | 8 | Python unit (each path of summarise_percentile + edge cases) |
| `apps/web-student/src/lib/peer_percentile.test.ts` | 4 | Vitest |

### S32-F — Smoke + closure

Smoke +1 (64). Closure 75. Master phase index updated.

## Out of scope

- Cohort-percentile cache table — repeat-query traffic is low at current scale; revisit if p95 > 200 ms.
- Educator cohort-drill-down per-topic percentile — defers to S33 educator polish.
- Mobile parity — S35.
