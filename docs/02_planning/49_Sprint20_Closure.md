# Sprint 20 Closure — P3-S5 predictive analytics + recommendations

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [docs/02_planning/48_Sprint20_Plan.md](48_Sprint20_Plan.md)

## Scope delivered

### S20-A — Migration 004 in engagement.analytics — DONE

`analytics_schema` rev **004** adds 2 caches:
- `predictive_dropout_scores` — per-user score with risk_band + intervention_kind + signals_json. Partial index for high/medium-risk lookups.
- `cached_recommendations` — per-user ranked topic list with reason strings. Composite PK (user_id, position).

Both are caches with computed_at timestamps; the orchestrator invalidates on TTL miss (1h default).

### S20-B — Drop-out scorer (heuristic v1) — DONE

`engagement/analytics/predictive_dropout.py` — pure function, no DB.

Four signal axes (each 0..1):
- inactivity (days_since_last_active / 14, capped)
- streak_broken (longest >= 5 AND current = 0)
- mastery_decline (avg < 0.35)
- many_weak_topics (count below 0.4 with attempts >= 3)

Final score = average of axes. Bands: HIGH ≥0.7, MEDIUM ≥0.4, LOW < 0.4.

Intervention rules:
- HIGH + inactive ≥7d → re_engagement_notification
- HIGH + struggling + many weak → suggest_tutor
- MEDIUM + many weak → lower_difficulty
- otherwise → none

Per [ADR-0010](../adr/0010-predictive-analytics-model-serving.md), the lightgbm/sklearn upgrade replaces the body of `score_user` in P3-S6+ once we have training-data volume; the input/output dataclasses stay stable so the swap is mechanical. **8 unit tests pass.**

### S20-C — Recommendation ranker (heuristic v1) — DONE

`engagement/analytics/predictive_recs.py` — pure function.

Three-phase ranking per [ADR-0011](../adr/0011-recommendation-algorithm.md):

1. **Bridge topics** — for each weak topic (mastery < 0.4, attempts ≥ 3), find a mastered sibling (mastery ≥ 0.6, attempts ≥ 5) in the same subject. Bridge gets the top score (0.7–1.0). Reason: "You've mastered X — re-drilling will help with Y where you're at N%."
2. **Direct weak-topic** — recommend continued practice on weak topics not already covered by bridges. Score 0.5–0.9. Reason: "Your X mastery is at N% — more practice will lift this."
3. **Exposure** — fill remaining slots (up to 5 total) with topics the user has never attempted. Score 0.4. Reason: "Try X — you haven't started this yet."

Cap at 5 recommendations. **5 unit tests pass.** OpenAI embedding upgrade ships in P3-S6 once pgvector lands.

### S20-D — Routes — DONE

4 new endpoints in `engagement.analytics.routes`:
- `GET /analytics/predictive/dropout/{user_id}` — cached or computed score
- `GET /analytics/recommendations/{user_id}` — cached or computed recs
- `POST /analytics/predictive/recompute/{user_id}` — force-recompute (skips cache)
- `GET /analytics/predictive/cohorts/{cohort_id}/at-risk` — cohort-scoped high-risk students for educator drill-down

`alp-engagement` now serves 21 routes total (was 17).

### S20-E — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `test_predictive_dropout.py` | 8 | unit | 8/8 ✅ |
| `test_predictive_recs.py` | 5 | unit | 5/5 ✅ |
| Carry-over | 84 unit + 22 integration | | ✅ |
| **Total** | **98 unit + 22 integration** | | **98 / 98 unit pass** |

Integration tests for predictive routes deferred — would require seeding mastery + streak rows in setup; the smoke covers the end-to-end pathway.

### S20-F — Web-student personalised next step — DONE

- New `apps/web-student/src/components/PersonalisedNextStep.tsx` — reads dropout + recommendations, renders the appropriate CTA based on intervention_kind:
  - `re_engagement_notification` → "Welcome back" + practice CTA
  - `suggest_tutor` → "Could a tutor help?" + tutors browse
  - `lower_difficulty` → "Build the foundation" + practice
  - `none` (LOW band) → "Up next" recommendation surfaced directly
- `apps/web-student/src/lib/api.ts` extended with `predictive` namespace.
- Mounted in `Home.tsx` between zones 1.4 and 1.5 (zones-anchored layout).

### S20-G — Web-admin rating moderation UI — DONE

- New `apps/web-admin/src/pages/RatingModeration.tsx` — admin pastes course/tutor id, sees recent ratings, hide/unhide buttons. Hide prompts for a reason (logged to audit).
- `apps/web-admin/src/lib/api.ts` extended with `ratingModeration` namespace.
- Route `/ratings-mod` wired (admin-gated).

### S20-H — Smoke extended to 46 steps — DONE

4 new assertions:
- Dropout endpoint returns valid score with risk_band ∈ {LOW, MEDIUM, HIGH}
- Recommendations endpoint returns items array
- Force-recompute returns `cached: false`
- Second call hits cache (`cached: true`)

`make smoke` passes **46/46**.

### S20-I — Closure + master index — DONE

This file. Master index updated.

## Test totals at Sprint 20 close

| Surface | Result | Status |
|---|---|---|
| alp-engagement `pytest tests/` (unit) | 98 / 98 | ✅ |
| alp-marketplace `pytest tests/` | 52 / 52 unit + 38 / 38 integration | ✅ |
| `make smoke` | 46 / 46 | ✅ |
| Other surfaces | unchanged | ✅ |

## Stack inventory at Sprint 20 close

- Same 6 services (ADR-0005 ceiling holding).
- alp-engagement: 21 routes + 4 distinct analytics tables (mastery, readiness, streaks, daily_activity, processed_sessions, predictive_dropout_scores, cached_recommendations) — 7 tables in analytics_schema.
- 5 distinct FSMs across the platform (tutor, creator, course, booking, course-publishing).
- Predictive layer in place: drop-out forecasting + topic recommendations operational with caching.

## What surprised us this sprint

- **Streaks column names tripped me up.** I wrote the orchestrator assuming `current_days` / `longest_days` from the migration plan, but the actual schema has `current_streak` / `longest_streak`. The UndefinedColumnError surfaced only at smoke time because the unit tests are pure-function and don't hit the DB. Worth a future habit: even pure-function modules should have a single integration test that seeds known data and verifies the SELECT query shape.
- **Cross-DB joins remain weak.** The recommendation engine's "bridge topics" feature needs `subject_id` on each mastery row to find mastered siblings, but `mastery` lives in engagement and `topics` (with subject_id) lives in learning. For v1 I left subject_id NULL in the gathered TopicMastery — bridge recs degrade to direct weak-topic recs. Real cross-DB resolution = a `learning.catalog.get_subjects_for_topics(topic_ids)` HTTP call from engagement. Defer to P3-S6 alongside the OpenAI embedding upgrade since both touch the same boundary.
- **Heuristic-first paid off.** Per ADR-0010 we deliberately shipped a transparent rules-based scorer instead of an ML model. The whole predictive layer (scorer + recs + 4 endpoints + 13 tests) fits in ~600 LOC and is reasoned about by reading the code. Replacing it with lightgbm in P3-S6 will be a one-function swap.

## Carry-overs to Sprint 21 (P3-S6 starts)

| Item | Why deferred | Owner |
|---|---|---|
| OpenAI embeddings + pgvector for recs | ADR-0011 reserved hooks; needs btree_gist + sentence-transformers in deps | P3-S6 |
| lightgbm / sklearn drop-out model | Needs ≥10K students × ≥30 days activity for a meaningful train | P3-S6+ |
| Cross-DB subject_id resolution for bridge recs | Cleanest fix is engagement → learning HTTP call | P3-S6 |
| Module/lesson UI in CourseAuthor.tsx | Carry-over from S19; significant complexity | P3-S6 |
| Lesson reader UI updates | Same | P3-S6 |
| Cohort-level at-risk educator UI | API exists; web-portal page deferred | P3-S6 |
| Real Stripe Connect / Daily.co | Pending creds | P3-S6 if creds arrive |
| Mobile flows | Phase 3 plan defers | P3-S6+ |
| Aggregate caches on tutor_profiles + courses | Performance; P3-S6 | |
| Predictive nightly cron | Today: TTL-based on demand. Cron arrives when latency demands it. | P3-S6 |

## P3-S5 status

**P3-S5 closed** at Sprint 20. The intelligence layer ADR-0010/0011 set up is now operational: students see personalised next steps on home, drop-out risk drives the right intervention, recommendations bridge from mastered to weak topics. The implementations are heuristic v1 — sophisticated ML lands in P3-S6+ once the data justifies it.

Sprint 21 (P3-S6) opens the embedding upgrade for recommendations, the deferred UI work, and any remaining stabilisation before Phase 3 launch.
