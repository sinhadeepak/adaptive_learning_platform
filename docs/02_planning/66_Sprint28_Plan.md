# Sprint 28 — P4-S28: Syllabus coverage audit

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Aspirants see explicit, exam-syllabus-tagged coverage instead of just per-topic mastery. Closes [GAP-P4-07](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-07--no-syllabus-coverage-audit).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md) S28: "you've covered N% of the JEE Physics syllabus, missing chapters X, Y, Z" is the second-most anxiety-driving surface for aspirants (after time management). The platform tracks per-topic mastery already; what's missing is the **chapter** layer that aggregates topics into the exam syllabus tree the student studies against.

## Backlog

### S28-A — Catalog migration 011: `syllabus_chapters` + `chapter_id` on topics

`catalog_schema` rev **011** adds a chapter layer between subject and topic:

```sql
CREATE TABLE catalog_schema.syllabus_chapters (
  id          UUID PRIMARY KEY,
  exam_id     UUID NOT NULL REFERENCES catalog_schema.exams(id),
  subject_id  UUID NOT NULL REFERENCES catalog_schema.subjects(id),
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  UNIQUE (exam_id, subject_id, position)
);

ALTER TABLE catalog_schema.topics
    ADD COLUMN chapter_id UUID NULL REFERENCES catalog_schema.syllabus_chapters(id);

CREATE INDEX idx_topics_chapter ON catalog_schema.topics (chapter_id) WHERE chapter_id IS NOT NULL;
```

`chapter_id` is NULL-able; existing topics keep working. Migration 011 also seeds a small but realistic chapter map for the 3 JEE Main subjects:

| Subject | Chapters seeded |
|---|---|
| Physics | Mechanics (MECH topic) · Thermodynamics (THERMO topic) · Electrostatics (ELEC topic) · Modern Physics (no topic yet — surfaces as "missing") · Optics (no topic yet) |
| Chemistry | Physical Chemistry (PCHEM) · Organic Chemistry (OCHEM) · Inorganic Chemistry (no topic yet) |
| Mathematics | Calculus (CALC) · Coordinate Geometry (COORD) · Algebra (no topic yet) · Trigonometry (no topic yet) |

That's 12 chapters across 3 subjects with 7 of them mapped to existing topics. The other 5 represent the "missing chapters" signal — exactly the call-out aspirants ask for.

### S28-B — `GET /catalog/syllabus-tree?examId=X` endpoint

In alp-learning. Returns the full tree:

```json
{
  "examId": "...",
  "subjects": [
    {
      "subjectId": "...",
      "name": "Physics",
      "chapters": [
        {
          "chapterId": "...",
          "name": "Mechanics",
          "topics": [{"topicId": "...", "title": "Mechanics", "questionCount": 20}]
        },
        {
          "chapterId": "...",
          "name": "Modern Physics",
          "topics": []
        }
      ]
    }
  ]
}
```

Read-only. Backed by `learning.syllabus.repositories.load_syllabus_tree(exam_id)`.

### S28-C — engagement: coverage aggregator + endpoint

New `engagement/analytics/syllabus_coverage.py`:

- `compute_coverage(tree, mastery)` — pure function. Takes the syllabus tree + mastery dict `{topic_id: ewa}`. Returns:
  ```json
  {
    "examId": "...",
    "overallPct": 67,
    "subjects": [
      {
        "subjectId": "...", "name": "Physics",
        "totalChapters": 5, "coveredChapters": 3,
        "totalTopics": 5, "attemptedTopics": 3, "masteredTopics": 1,
        "chapters": [
          {"chapterId": "...", "name": "Mechanics",
           "totalTopics": 1, "attemptedTopics": 1, "masteredTopics": 1,
           "avgEwa": 0.72, "status": "mastered"},
          {"chapterId": "...", "name": "Modern Physics",
           "totalTopics": 0, "attemptedTopics": 0, "masteredTopics": 0,
           "avgEwa": 0, "status": "missing"}
        ]
      }
    ]
  }
  ```

  Status bands per chapter:
  - `mastered` — ≥70% of mapped topics have EWA ≥ 0.6 (and ≥ 1 mapped topic)
  - `developing` — has attempted topics but fewer than 70% mastered
  - `not_started` — has mapped topics but no attempts
  - `missing` — chapter has zero mapped topics (content gap, not student gap)

  `overallPct` = `masteredTopics / totalTopics × 100` (0 when no topics).

New `engagement/analytics/learning_client.py` — thin HTTP client that fetches `/catalog/syllabus-tree?examId=X` from alp-learning. Mirrors the existing alp-learning → alp-engagement pattern (same library, opposite direction).

New endpoint `GET /analytics/syllabus-coverage/{user_id}?examId=X` in `engagement.analytics.routes`:

1. Fetch syllabus tree from alp-learning.
2. Read user mastery from local `analytics_schema.mastery`.
3. Run `compute_coverage`.
4. Return.

### S28-D — Web-student `SyllabusCoverage.tsx`

New page at `/syllabus`:

- Header: exam selector (defaults to JEE Main) + headline ("JEE Main: 28% covered, 7 chapters remaining").
- Subject tabs (Physics / Chemistry / Mathematics).
- Per-chapter card: name, status pill, "M of N topics mastered" + mini progress bar.
- Click-through: tapping a chapter expands a topic list with mastery pills (sourced from existing /analytics/mastery).

Pure helper at `apps/web-student/src/lib/syllabus_coverage.ts`:
- `chapterStatusColour(status)` → token map.
- `totalTopicCount(coverage)` / `totalMastered(coverage)` summary helpers.

Route `/syllabus`.

### S28-E — Tests

| File | Tests | Type |
|---|---|---|
| `services/engagement/tests/analytics/test_syllabus_coverage.py` | 10 | Python unit (pure compute_coverage across status bands + edge cases) |
| `apps/web-student/src/lib/syllabus_coverage.test.ts` | 5 | Vitest |

### S28-F — Smoke extension

1 new assertion (step 60):
- `GET /analytics/syllabus-coverage/{student}?examId=<JEE Main>` returns shape `{examId, overallPct, subjects: [...]}`.

Smoke target: **60 steps**.

### S28-G — Closure + master phase index

`docs/02_planning/67_Sprint28_Closure.md`. Master index updated.

## Out of scope

- **Bulk JEE Main + Advanced chapter mapping (~50 chapters per exam, ~80 topic-chapter assignments)** — content workstream W1.
- **NEET / UPSC / CBSE chapter trees** — Phase 5 generalisation; the engine + UI are exam-agnostic.
- **Cohort-level coverage rollup for educators** — was on the W1 list under T-29 in the UI catalogue; defers to S33 educator polish.
- **Per-chapter PYQ frequency overlay** ("you've covered Mechanics but it has 6 PYQs you haven't seen") — composable from S24 + S28 surfaces; defers to S33.
- **Mobile parity** — S35.

## Definition of done

- Catalog migration 011 applied; 12 chapters seeded; 7 existing topics mapped.
- `/catalog/syllabus-tree?examId=X` endpoint serves the full tree.
- engagement `learning_client.py` + `syllabus_coverage.py` ship.
- `/analytics/syllabus-coverage/{user_id}?examId=X` endpoint serves the coverage view.
- Web-student `SyllabusCoverage.tsx` renders subject tabs + chapter cards.
- 15 new tests green (10 Python + 5 TS).
- `make smoke` 60/60.
- Sprint 28 closure doc + master phase index updated.
