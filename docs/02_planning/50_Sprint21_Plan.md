# Sprint 21 — P3-S6 stabilisation + Phase 3 closure

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Pick the highest-value carry-overs from Sprints 19/20 that don't need external creds, ship them, then write the Phase 3 retrospective that gates Phase 3 closure.

## Why this sprint

Per [`docs/02_planning/49_Sprint20_Closure.md`](49_Sprint20_Closure.md), the carry-over backlog into P3-S6 is:

| Carry-over | Cred-blocked? | Justifies P3-S6? |
|---|---|---|
| OpenAI embeddings + pgvector | needs OpenAI key + extension install | no urgent value — heuristic v1 already meaningful |
| lightgbm/sklearn drop-out model | needs ≥10K students × ≥30 days activity | ❌ data not there yet |
| Cross-DB subject_id resolution for bridge recs | no creds; pure code | ⚠️ marginal — recs degrade gracefully today |
| Module/lesson UI in CourseAuthor.tsx | no creds | ✅ biggest UX gap right now |
| Lesson reader UI updates | no creds | ✅ pairs with the editor |
| Cohort-level at-risk educator UI | no creds (API exists from S20) | ✅ educator value |
| Real Stripe Connect / Daily.co | needs creds | ❌ blocked |
| Mobile flows | Phase 3 plan defers | ❌ deferred |
| Aggregate caches on tutor_profiles + courses | no creds | ✅ visible perf + listing UX win |
| Predictive nightly cron | no creds | ⚠️ TTL-on-demand suffices today |

P3-S6 was always positioned as **stabilisation** in the Phase 3 plan ([`21_Phase3_SprintDevelopmentPlan.md`](21_Phase3_SprintDevelopmentPlan.md)). The cut for Sprint 21 picks what visibly improves the platform without external dependencies and what gates Phase 3 closure (the retrospective).

ML upgrades (lightgbm / sklearn / pgvector / embeddings) explicitly defer past P3-S6 — ADR-0010/0011 already established the heuristic v1 plus reserved-hooks pattern. They wait for the data and the training-data volume.

## Backlog

### S21-A — Migration 006: rating aggregate columns

`marketplace_schema` rev **006** adds aggregate cache columns:

- `tutor_profiles.rating_avg REAL NOT NULL DEFAULT 0.0`
- `tutor_profiles.rating_count INTEGER NOT NULL DEFAULT 0`
- `tutor_profiles.last_aggregated_at TIMESTAMPTZ NULL`
- `courses.rating_avg REAL NOT NULL DEFAULT 0.0`
- `courses.rating_count INTEGER NOT NULL DEFAULT 0`
- `courses.last_aggregated_at TIMESTAMPTZ NULL`

These are caches — recomputed inline whenever a rating is inserted or its visibility flips. No async job required.

Backfill on migration: a single `UPDATE` per table seeds existing rows from the rating tables (excluding hidden rows), so listings that were previously computing on the fly start serving from the cache from the first request post-migration.

### S21-B — Backend aggregate maintenance

`services/marketplace/src/marketplace/repositories.py` gains:

- `recompute_tutor_aggregate(conn, tutor_user_id)` — `SELECT avg, count FROM tutor_session_ratings WHERE tutor_user_id = ? AND hidden_at IS NULL`, then UPDATE.
- `recompute_course_aggregate(conn, course_id)` — same shape against `course_ratings`.

Hooks:
- `insert_session_rating` → recompute tutor aggregate.
- `insert_course_rating` → recompute course aggregate.
- `hide_rating` (both kinds) → recompute aggregate.
- `unhide_rating` (both kinds) → recompute aggregate.

Listings (`/marketplace/tutors`, `/marketplace/courses`) read from the cached columns. The "average" computation in `tutor_routes.py` and `course_routes.py` still works — but now reads the cached column instead of computing the aggregate per request.

3 unit tests on the recompute helper (insert → recompute → hide → recompute → unhide → recompute), 1 integration test on the listing endpoint to confirm it serves from cache.

### S21-C — Web-portal CourseAuthor module/lesson editor

`apps/web-portal/src/pages/CourseAuthor.tsx` already exists from Sprint 18. Sprint 19 shipped the backend module/lesson CRUD endpoints + `courseStructure` API namespace but no UI hookup. This sprint adds:

- **Sidebar list of modules** with collapse/expand. Add module button at top.
- **Per-module: ordered list of lessons.** Add lesson button at the bottom of each module.
- **Inline rename + delete** for both modules and lessons.
- **Lesson editor pane** (right side) — title + markdown body. Saves via `PUT /marketplace/courses/:id/lessons/:lessonId`.
- **Drag-to-reorder NOT in scope this sprint** — order is set on creation, edited via a small "↑ ↓" pair if needed (the API already accepts a position field). Drag UX is nice-to-have, not gating.

Pure-helper extracted: `nextPosition(items)` — returns max position + 1 or 1 if empty. 2 unit tests.

### S21-D — Web-student CourseRead module/lesson navigation

`apps/web-student/src/pages/CourseRead.tsx` (shipped in S18 with a flat content_md) gains:

- Reads `GET /marketplace/courses/:id/structure` (already exposed in S19).
- If the course has modules: render a left sidebar with the module → lesson tree, click-to-navigate.
- If the course has only the legacy `content_md` body (no modules): render the body verbatim (preserves backward-compat).
- Progress indicator: lesson `i of N` rendered client-side from the structure response (per-lesson completion tracking is a v2 feature gated on a backend table that doesn't exist yet — explicitly out of scope this sprint).

### S21-E — Web-portal cohort at-risk page

`apps/web-portal/src/pages/CohortAtRisk.tsx` — new. Consumes the existing `GET /analytics/predictive/cohorts/:cohort_id/at-risk` endpoint that S20 shipped without a UI.

- Educator picks a cohort from the dropdown (uses existing `cohorts.list()` from `web-portal/src/lib/api.ts`).
- Page lists at-risk students with `risk_band` badge + `intervention_kind` label + `signals_json` summary ("inactive 8 days, 4 weak topics").
- Click-through to existing student drill-down page (S13).

Adds `predictive` namespace in web-portal's `api.ts` (mirroring the web-student one from S20).

### S21-F — Phase 3 retrospective

`docs/02_planning/22_Phase3_Retrospective.md` — mirrors the structure of [`22_Phase2_Retrospective.md`](22_Phase2_Retrospective.md):

- What Phase 3 was supposed to be (per [21_Phase3_SprintDevelopmentPlan.md](21_Phase3_SprintDevelopmentPlan.md))
- What Phase 3 actually was (Sprints 15–21 = P3-S0..S6)
- What shipped (table per sprint)
- What slipped (real Stripe Connect/Daily.co, ML upgrades, mobile flows)
- What surprised us
- Numbers
- Inputs to AWS staging cutover (the deferred final-cutover sprint)

This doc gates Phase 3 closure. Once it lands, all Phase 1+2+3 sprints are formally closed and the only remaining sprint in the index is the deferred staging cutover — which stays AWS-blocked until creds arrive.

### S21-G — Tests + smoke

| File | Tests | Type |
|---|---|---|
| `services/marketplace/tests/test_repositories.py` (new helper test) | 3 | unit |
| `services/marketplace/tests/test_aggregate_listing.py` | 1 | integration |

Smoke extension: 4 new assertions:
- Submit a course rating, then the course listing shows non-zero `ratingAvg` and `ratingCount`.
- Hide it; aggregate updates back toward zero.
- Cohort at-risk endpoint returns shape `{ cohortId, atRisk: [...] }` (was tested S20 by direct call; now smoke-asserts the cohort flow).
- Course structure endpoint returns the modules+lessons array.

Smoke target: **50 steps**.

### S21-H — Closure + master index

`docs/02_planning/51_Sprint21_Closure.md`. Master index updated. Phase 3 column flips to ✅ all 6 sprints closed.

## Out of scope

- **OpenAI embedding upgrade for recommendations** — heuristic v1 is meaningful; embeddings remain reserved for when we have the data + key.
- **lightgbm / sklearn drop-out model** — needs ≥10K students × ≥30 days activity.
- **pgvector extension** — needed for embedding similarity at scale; deferred.
- **Cross-DB subject_id resolution for bridge recs** — recs degrade gracefully without it; bigger code change than fits this sprint.
- **Drag-to-reorder modules/lessons** — UX nice-to-have, not gating.
- **Predictive nightly cron** — TTL-on-demand sufficient at current load.
- **Mobile flows** — Phase 3 plan defers throughout.
- **Real Stripe Connect / Daily.co wiring** — pending creds.
- **AWS staging deploy** — separate sprint, AWS-blocked.

## Definition of done

- marketplace migration 006 applied; tutor_profiles + courses have rating aggregate columns; backfill completed cleanly.
- Aggregate maintenance hooks active in repositories; 4 new tests green (3 unit + 1 integration).
- web-portal CourseAuthor renders module/lesson editor; pure-helper `nextPosition` has 2 unit tests.
- web-student CourseRead navigates the module/lesson tree; legacy content_md body still renders for unstructured courses.
- web-portal CohortAtRisk page consumes the existing predictive endpoint and renders the educator drill-down.
- Phase 3 retrospective written.
- `make smoke` 50/50.
- Sprint 21 closure doc + master index updated; Phase 3 row marks ✅ all 6 sprints closed.
