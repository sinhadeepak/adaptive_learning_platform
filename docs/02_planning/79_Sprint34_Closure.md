# Sprint 34 Closure — P4-S34 Reference material integration

**Plan:** [`78_Sprint34_Plan.md`](78_Sprint34_Plan.md)

## Scope delivered

- **Catalog migration 012**: `topic_references` table with kind CHECK constraint (`ncert/textbook/video/derivation/formula_sheet`) + ordered position. Inline seed of ~16 reference entries spanning the 7 seeded JEE topics (placeholder URLs that the W1 content workstream will replace with curated content).
- **Pure-function `learning/syllabus/url_safety.py::is_safe_reference_url`**: rejects javascript/data/file/vbscript/blob/ftp schemes; requires http(s); blocks newline/control char smuggling.
- **`list_topic_references`** in `syllabus/repositories.py`: filters every row through the safety helper before surfacing.
- **`GET /catalog/topics/{topic_id}/references`** endpoint in alp-learning.
- **Web-student helpers `references.ts`**: `groupByKind` (NCERT → Textbook → Derivation → Video → Formula sheet ordering, drops empty buckets, sorts within-kind by position) + label + icon maps.

## Tests

| File | Tests | Status |
|---|---|---|
| `services/learning/tests/syllabus/test_url_safety.py` | 7 | 7/7 ✅ |
| `apps/web-student/src/lib/references.test.ts` | 4 | 4/4 ✅ |

## Smoke

+1 step (66): topic-references endpoint returns ≥1 reference for the seeded Mechanics topic.

## Carry-overs

- TopicDetail.tsx reference panel UI integration → next sprint where it can ship alongside the S26 prereq pill + S32 percentile pill in one consolidated UI pass.
- Bulk content (~150 references for full JEE Physics) → workstream W1.
- Admin UI to author/curate references → post-cutover.
- Per-reference click telemetry → engagement analytics later.
- Mobile parity → S35.
