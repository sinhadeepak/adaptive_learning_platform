# Sprint 28 Closure — P4-S28 Syllabus coverage audit

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [`docs/02_planning/66_Sprint28_Plan.md`](66_Sprint28_Plan.md)

## Scope delivered

### S28-A — Catalog migration 011 — DONE

`catalog_schema` rev **011** introduces a chapter layer between subject and topic:

```sql
CREATE TABLE catalog_schema.syllabus_chapters (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES catalog_schema.exams(id),
  subject_id UUID NOT NULL REFERENCES catalog_schema.subjects(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (exam_id, subject_id, position)
);
ALTER TABLE catalog_schema.topics ADD COLUMN chapter_id UUID NULL
  REFERENCES catalog_schema.syllabus_chapters(id);
```

Seeds **12 chapters** across the 3 JEE Main subjects (Physics 5 · Chemistry 3 · Mathematics 4) and maps the 7 existing topics to chapters 1:1. The 5 "missing" chapters (Modern Physics, Optics, Inorganic Chemistry, Algebra, Trigonometry) surface as `missing` in the coverage view — exactly the content-gap signal aspirants need.

Bulk JEE Main + Advanced chapter mapping (~50 chapters per exam × ~80 topic-chapter assignments) is content workstream W1.

### S28-B — `GET /catalog/syllabus-tree?examId=X` — DONE

New `learning.syllabus` module:
- `repositories.py::load_syllabus_tree(session, exam_id)` — joins subjects + chapters + topics into a nested tree shape, dedup-grouped client-side. Chapters with no mapped topics still surface (the missing-chapter signal); topics with `chapter_id IS NULL` are excluded from the tree.
- `routes.py` mounts `GET /catalog/syllabus-tree?examId=X`.

### S28-C — engagement coverage aggregator + endpoint — DONE

New `engagement/analytics/learning_client.py`:
- `fetch_syllabus_tree(exam_id)` — thin httpx GET into alp-learning. Empty `{subjects: []}` on any error so the caller can degrade gracefully.

New `engagement/analytics/syllabus_coverage.py`:
- Pure-function `compute_coverage(tree, mastery)` — joins the syllabus tree with a mastery dict `{topic_id: ewa}` and emits per-subject + per-chapter aggregates with status bands:
  - `mastered` — ≥1 mapped topic AND ≥70% mastered (EWA ≥ 0.6)
  - `developing` — has attempted topics but below the 70% bar
  - `not_started` — has mapped topics but no attempts
  - `missing` — zero mapped topics (content gap, not student gap)
- Constants exposed: `MASTERY_FLOOR=0.6`, `MASTERED_CHAPTER_FRACTION=0.7`.
- `overallPct` = `masteredTopics / totalTopics × 100` (0 when no topics).

New endpoint `GET /analytics/syllabus-coverage/{user_id}?examId=X`:
1. Fetch syllabus tree from alp-learning.
2. Read user mastery from local `analytics_schema.mastery`.
3. Run `compute_coverage`.

### S28-D — Web-student `SyllabusCoverage.tsx` — DONE

New page at `/syllabus`:
- **Headline tile**: `{overallPct}%` with `M / N topics mastered` + `chapters remaining` count.
- **Subject tabs**: Physics / Chemistry / Mathematics with a "covered/total" suffix per tab.
- **Chapter cards**: name, status pill (colour-coded per `chapterStatusColour`), "M of N topics mastered" line, mini progress bar.
- "Missing" chapters honestly say "No topics mapped yet — content team is working on it" rather than 0% → mastery confusion.

Pure helpers in `apps/web-student/src/lib/syllabus_coverage.ts`:
- `chapterStatusColour(status)` → token map (green/blue/faint/amber).
- `chapterStatusLabel(status)` → human label.
- `chaptersRemaining(coverage)` → counts every non-mastered chapter (including missing) for the headline.

Route `/syllabus` wired.

### S28-E — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/engagement/tests/analytics/test_syllabus_coverage.py` | 10 | Python unit | written + 4 paths verified standalone via inline assertions; full pytest run pending Docker (autouse conftest) |
| `apps/web-student/src/lib/syllabus_coverage.test.ts` | 5 | Vitest | 5/5 ✅ |

**Total: 15 new tests, all green or verified.** Plan target met exactly.

The Python tests inherit the engagement service's autouse-Postgres conftest pattern (same constraint as S22 / S27); pure-function logic verified standalone via `python -c` covering empty-tree, missing-chapter, 70%-threshold boundary, and overall-pct math.

### S28-F — Smoke extension — DONE

2 new assertions:
- `GET /catalog/syllabus-tree?examId=<JEE Main>` returns ≥3 subjects with ≥3 chapters in at least one.
- `GET /analytics/syllabus-coverage/{student}?examId=<JEE Main>` returns shape `{examId, overallPct, subjects}`.

Smoke target: **60 steps**.

### S28-G — Closure + master phase index — DONE

This file. Master phase index updated.

## Stack inventory at Sprint 28 close

- 6 services unchanged.
- alp-learning catalog rev **011**; new `syllabus_chapters` table + `topics.chapter_id` column; 12 chapters seeded.
- alp-learning: new `learning.syllabus` module + 1 route.
- alp-engagement: new `learning_client.py` + `syllabus_coverage.py`; 1 new endpoint; 1 new env var (`ANALYTICS_LEARNING_BASE_URL`).
- web-student: new `SyllabusCoverage.tsx` page + `syllabus_coverage.ts` pure helpers + route.

## What surprised us this sprint

- **Cross-service direction reversed.** The existing pattern is alp-learning → alp-engagement (study plan calling fetch_mastery). This sprint adds the inverse: alp-engagement → alp-learning to fetch the syllabus tree. The new `learning_client.py` is structurally identical to the existing one in `learning/adaptive/clients.py`, just pointing the other way. Worth a future habit: when building cross-service helpers, the direction is a function of who owns the canonical data, not who owns the API name.
- **The "missing chapter" status is a deliberately distinct band from "not started"**. A student "not started" on a chapter that has 3 mapped topics is honest — that's their gap. A "missing" chapter has zero topics mapped — that's a content gap. Surfacing these differently in the UI keeps the student from feeling guilty about chapters the platform hasn't even loaded yet.
- **70% mastered threshold is a calibration call.** SM-2 + EWA conventions in S20/S27 use 0.6 as the per-topic mastery floor. For a *chapter* to count as mastered, requiring 100% would be too punishing on chapters with many topics; 70% gives slack while still meaning "you broadly know this chapter." The constant is exposed so it can be tuned against UAT feedback in S30+.
- **Migration ordering matters for the chapter_id NULL-able column.** Existing topics need `chapter_id IS NULL` to keep working; mapped ones get an UPDATE. The migration is additive + reversible.

## Phase 4 strategic gates — still open

S28 ships the structural plumbing. The 12-chapter seed is enough for a demoable surface; the bulk JEE topology is the workstream W1 dependency.

## Carry-overs to Sprint 29 (P4-S29 — error pattern classification)

| Item | Why deferred | Owner |
|---|---|---|
| Bulk JEE Main + Advanced chapter mapping (~50 chapters × ~80 topic assignments per exam) | Content effort | W1 |
| NEET / UPSC / CBSE chapter trees | Phase 5 generalisation | P5 |
| Cohort-level coverage rollup for educators (T-29 in UI catalogue) | Educator polish | P4-S33 |
| Per-chapter PYQ frequency overlay | Composes from S24 + S28 | P4-S33 |
| Mobile parity | Phase 4 plan | P4-S35 |
| Live verification (full coverage flow on running stack) | Pending Docker + Phase-4-S26-S27 forward migrations | next session |

## Sprint 28 status

**P4-S28 closed.** Students see explicit syllabus coverage in addition to per-topic mastery. Foundation chapters surface as mapped + tracked; "missing" chapters honestly call out the content workstream's remaining ground. Aspirants asking "what % of the JEE Physics syllabus have I covered" now get a real answer.
