# Exam-Scoped Practice Screen — Design

**Date:** 2026-06-18
**Branch:** feature/vidya-foundation
**Status:** Approved (design); pending implementation plan

## Summary

The student Practice screen (`apps/web-student/src/pages/Practice.tsx`) currently shows
**global** (all-exam) data — every recommendation, the readiness band, the revision queue, and
the weak-topic lists come from the student's entire attempt history regardless of which exam they
selected. Observed: opening `/practice?examId=<CBSE_9>` still shows NEET Physics topics
(Electrostatics, Mechanics & Waves, Optics) and a seed "Topic 33333333".

This feature scopes the Practice screen to the **selected exam**: recommendations, readiness,
revision, and weak/not-started topics all derive from that exam's topic set.

### Root cause (verified)

- `Practice.tsx` reads `searchParams` but only uses `tab` and `topic` — it **never reads `examId`**.
- Its data calls are all keyed by `user.id` alone: `/analytics/mastery/{user}`,
  `/adaptive/guided-next-steps/{user}`, `/analytics/readiness-band/{user}`,
  `/analytics/revision/{user}`, `/analytics/topic-decay/{user}`.
- None of the engagement analytics endpoints accept an exam/topic filter today.
  `guided-next-steps` (learning) is the exception: it already accepts `?exam=<code>` and scopes via
  `fetch_topic_catalog(exam_code)`.

### Approved decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope source | **URL `examId`**, fallback to the first/primary enrolled exam from `/profile/me` |
| 2 | Cold start | **Show all exam topics as "Not started" (0%)** + a diagnostic CTA |
| 3 | topic-decay | **Dropped** from the exam-scoped Practice screen for v1 |
| 4 | Scoping mechanism | **Server-side** `exam_id` param; engagement resolves the exam→topic-id set via its learning client (cached) — not browser-side filtering |

## Ground truth (verified — do NOT assume otherwise)

- **Hierarchy** (learning DB, `catalog_schema`): `exams` → `subjects (exam_id FK)` → `topics
  (subject_id FK)`. Migration `services/learning/alembic/catalog/versions/001_create_catalog_schema.py`.
- **One-call topic set**: `GET /catalog/exams/{exam_id}/subjects-with-topics`
  (`services/learning/src/learning/catalog/routes.py:500`) returns
  `{examId, topics:[{id,title,subjectId,subjectName,...}]}` for the exam.
- **Analytics endpoints live in the ENGAGEMENT service** (`services/engagement/src/engagement/analytics/routes.py`),
  reading `analytics_schema` (engagement DB):
  - `mastery/{user}` (lines ~31) → `analytics_schema.mastery (user_id, topic_id, ewa, n)`; empty list when none.
  - `readiness-band/{user}` (lines ~799) → `AVG(ewa)` over **all** mastery rows; 0.0 when none.
  - `revision/{user}` (lines ~502) → per-topic SRS due list; merges topic titles via the existing
    `_learning_client.fetch_topics_bulk(topic_ids)`; empty list when none.
  - `topic-decay/{user}` (lines ~686) → keyed by `concept_id` (NOT `topic_id`); empty list when none.
- **guided-next-steps lives in LEARNING** (`services/learning/src/learning/adaptive/routes.py:237`),
  already takes `?exam=<code>` and scopes via `fetch_topic_catalog(exam_code)`
  (`adaptive/study_plan.py`). Cold-start path returns 3 DIAGNOSE steps.
- **Cross-DB**: analytics (engagement DB) cannot JOIN catalog (learning DB). Engagement already
  HTTP-calls learning (`_learning_client`), so it can resolve an exam's topic set over HTTP.
- **Selected-exam source**: `/profile/me` returns `exams:[{examId,...}]`; the sidebar
  (`apps/web-student/src/components/vidya/VidyaShell.tsx`) builds exam tabs linking to `/exams/{id}`.
  Practice is reached at `/practice?examId=<uuid>`.

## Section 1 — Scope source

`Practice.tsx` resolves the **current exam** on load:
1. `examId = searchParams.get("examId")`.
2. If absent, fetch `/profile/me` and use `exams[0].examId` (primary/first enrolled).
3. If the student has no enrolled exams, the page shows a neutral "add an exam" state (existing
   empty behavior) — no scoping applied.

A lightweight exam label/switcher in the page header reflects the current exam; switching updates
the `examId` query param (and re-scopes). The exam's topic set is fetched once via
`GET /catalog/exams/{examId}/subjects-with-topics` and reused for cold-start rendering and titles.

## Section 2 — Backend: exam-scope the analytics endpoints (engagement)

Add an **optional `exam_id` query param** to three endpoints. Absent `exam_id` = current global
behavior (back-compatible).

- **New shared helper** `resolve_exam_topic_ids(exam_id) -> set[str]` in engagement: HTTP GET to
  learning `/catalog/exams/{exam_id}/subjects-with-topics`, returns the topic-id set, behind a
  short-TTL in-process cache (exam topic sets are near-static). One place implements
  exam→topics; all scoped endpoints reuse it. On learning-call failure, the endpoint returns
  unscoped data rather than erroring (degrade gracefully) and logs.
- **`/analytics/mastery/{user}?exam_id=`** → `WHERE topic_id = ANY(:ids)`.
- **`/analytics/readiness-band/{user}?exam_id=`** → `AVG(ewa)` over only `topic_id = ANY(:ids)`
  (server-computed; correct for the exam).
- **`/analytics/revision/{user}?exam_id=`** → `WHERE topic_id = ANY(:ids)`.

If the resolved topic set is empty (unknown/empty exam), scoped queries return empty/zero (correct
cold-start), not global data.

## Section 3 — guided-next-steps wiring (learning)

`guided-next-steps` already scopes server-side by `exam` (exam_code). Extend it to **also accept
`exam_id`** (resolve id→code via the catalog: `SELECT code FROM catalog_schema.exams WHERE id=:id`),
so the frontend passes one consistent identifier. Behaviour otherwise unchanged: when scoped, the
cold-start DIAGNOSE steps already target the exam's catalog topics.

## Section 4 — Frontend Practice page

- Resolve `examId` (URL → primary fallback) and thread it into the mastery, readiness-band,
  revision, and guided-next-steps calls (`?exam_id=<uuid>`).
- Fetch the exam's topic set (`subjects-with-topics`) and **merge** it with the scoped mastery so
  the weak/drill lists show **every exam topic** — attempted ones with their %, untouched ones as
  **"Not started" (0%)**.
- **Remove the topic-decay panel** from this screen (delete its state, fetch, and render).
- Add an exam label/switcher in the header reflecting the current exam.
- Preserve all existing behavior for the mistakes tab and session-start (which already sends the
  content language from the translation-delivery work — unchanged here).

## Section 5 — Cold start

For a freshly-selected exam with no attempts:
- Scoped mastery/readiness/revision return empty/0 (Section 2).
- The page still renders **all exam topics as "Not started" (0%)** from the catalog set, ordered to
  be drillable (e.g. by catalog order / subject), each with a one-tap drill start.
- The AI-practice hero is framed as a **diagnostic** for the exam (guided-next-steps cold-start
  path, now exam-scoped).
- Readiness band shows 0% over the exam with the standard "behind / start" actions.

No empty screen; the student always has an exam-specific starting point.

## Section 6 — Error handling & edge cases

- **Learning-call failure during resolution**: engagement logs and returns unscoped data for that
  request (availability over strict scoping); the page still renders.
- **Unknown/!-enrolled examId in URL**: if the exam isn't in the student's `/profile/me` exams,
  fall back to the primary exam (don't scope to an exam they aren't taking).
- **No enrolled exams**: neutral "add an exam" state; no scoping.
- **Back-compat**: every endpoint without `exam_id` behaves exactly as today (other callers
  unaffected).

## Section 7 — Testing

- **Engagement (pytest):**
  - `resolve_exam_topic_ids` returns the learning topic set and caches (one HTTP call for repeated
    requests); degrades to empty/unscoped on learning failure.
  - `mastery?exam_id=` filters to the exam's topics; `readiness-band?exam_id=` averages only exam
    topics; `revision?exam_id=` filters; absent `exam_id` unchanged (regression).
- **Learning (pytest):** `guided-next-steps?exam_id=` resolves id→code and scopes; unknown id
  handled.
- **web-student (vitest):** Practice reads `examId` and falls back to primary; scoped calls carry
  `exam_id`; exam-topic merge renders "Not started" for untouched topics; topic-decay panel removed;
  switching exam re-scopes.

## New API surface (additive)

| Endpoint | Change |
|---|---|
| `GET /analytics/mastery/{user}` | + optional `exam_id` |
| `GET /analytics/readiness-band/{user}` | + optional `exam_id` |
| `GET /analytics/revision/{user}` | + optional `exam_id` |
| `GET /adaptive/guided-next-steps/{user}` | + optional `exam_id` (alongside existing `exam` code) |
| engagement internal | `resolve_exam_topic_ids(exam_id)` helper + TTL cache |

## Out of scope (YAGNI)

- Exam-scoping `topic-decay` (concept-keyed; no clean concept→topic map) — dropped from this screen.
- A persisted "primary exam" flag (use first enrolled as primary).
- Mobile Practice scoping (server-side `exam_id` contract makes it a later, small client change).
- Exam-intel/PYQ-ranked cold-start ordering (catalog order is sufficient for v1).
- Changing the analytics aggregation pipeline or the SRS/EWA model.
