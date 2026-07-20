# Retire & delete exams from the admin catalog

**Date:** 2026-06-26
**Area:** exam catalog (web-admin + services/learning)
**Status:** Approved — ready for implementation plan

## Context

The web-admin Exams catalog (`/exams`, `ExamsList.tsx`) lists every exam with a
single row action — "Edit →". There is no way to remove an exam, so test/junk
exams (e.g. "CLASS 7", "Vedic Maths", "JEE Main Test") accumulate with no path
to clean them up.

Exploration findings that shape the design:

- **The platform already models "Retired" exams.** The list has Published /
  Retired / All tabs driven by `exams.is_published`, and the codebase uses
  **soft-delete** (`is_published=FALSE`) everywhere "to keep rows around so
  existing question / mastery FK references stay intact." But there is currently
  **no endpoint to retire an exam itself** — `/save` only retires
  subjects/topics *within* an exam.
- **Hard delete is risky in general.** An exam is referenced cross-service with
  no cascade: `profile_schema.exam_selections` (enrollments, identity),
  per-topic `mastery` (engagement), `educator_assignments`, analytics. Subjects
  have **no** `ON DELETE CASCADE`; pools and `exam_blueprints` **do** cascade.
- **A content-free exam is safe to hard-delete.** With zero authored questions
  and zero blueprints there can be no real practice/mock attempts, so removing
  it orphans nothing meaningful — and these two signals are checkable **entirely
  within the learning service** (no new cross-service endpoints).

## Decisions (locked)

- **Two actions:** **Retire** (soft, reversible, always available) and
  **Delete permanently** (hard, guarded, irreversible).
- **Guard for permanent delete (lean, learning-only):** allowed only when the
  exam has **0 authored questions AND 0 blueprints**. (Cross-service
  enrollment/attempt checks are explicitly out of scope.)
- **Confirmation:** permanent delete requires **typing the exam code**; retire /
  restore use a simple confirm (reversible).

## Existing building blocks (reused)

- Soft-delete pattern (`UPDATE … SET is_published=FALSE … WHERE exam_id=…`) —
  `exam_builder/routes.py` save/retire logic (the subject/topic retire block).
- `_require_admin(principal)` (PLATFORM_ADMIN / INSTITUTION_ADMIN → else 403) —
  `exam_builder/routes.py:53`.
- The list endpoint `GET /admin/exam-builder/exams` and its per-exam count
  subqueries — `exam_builder/routes.py` (`list_exams`).
- Frontend list + Published/Retired/All filter + `ExamListEntry` interface —
  `apps/web-admin/src/pages/ExamsList.tsx`.
- Question-by-exam subquery (`content_schema.questions WHERE topic_id IN (SELECT
  t.id FROM catalog_schema.topics t JOIN catalog_schema.subjects s ON
  t.subject_id=s.id WHERE s.exam_id=…)`) — `content/repositories.py` `list_questions`.

## Architecture

### Backend — three new endpoints (all `_require_admin`, in `exam_builder/routes.py`)

**1. `POST /admin/exam-builder/exams/{exam_id}/retire`**
Soft-delete the exam: `exams.is_published=FALSE`, plus
`subjects.is_published=FALSE` and `topics.is_published=FALSE` for that exam (so
it disappears from students). All rows preserved (no FK breakage). 404 if the
exam doesn't exist. Idempotent. Response: `{exam_id, code, subjects_retired,
topics_retired}`.

**2. `POST /admin/exam-builder/exams/{exam_id}/restore`**
Re-publish: set `is_published=TRUE` on the exam + its subjects + topics. Makes
retire reversible from the Retired tab. 404 if missing. Response: `{exam_id,
code, subjects_restored, topics_restored}`.

**3. `DELETE /admin/exam-builder/exams/{exam_id}`**
Guarded hard delete.
- **Guard:** `question_count` = questions under the exam's topics (query above);
  `blueprint_count` = `SELECT COUNT(*) FROM catalog_schema.exam_blueprints WHERE
  exam_id=…`. If `question_count>0 OR blueprint_count>0` → **HTTP 409**
  `{code:"exam_in_use", questionCount, blueprintCount, message:"Exam has N
  questions and M blueprints — retire it instead."}`.
- **Delete (both counts 0):** one transaction, FK-safe order — `topics` (under
  the exam's subjects) → `subjects` → `subject_pools` → `exam_blueprints` →
  `educator_assignments` (exam_id; no cascade) → `topic_importance_overrides`
  (exam_id) → the `exams` row. Response: `{exam_id, code, subjects_deleted,
  topics_deleted, pools_deleted, blueprints_deleted}`.
- 404 if missing.

### Backend — extend the list endpoint

Add two subqueries to `GET /admin/exam-builder/exams` (mirroring the existing
`subject_count`/`topic_count` subqueries): `question_count` (via the
content-questions-by-exam subquery) and `blueprint_count`. The `ExamListEntry`
response model gains `question_count: int` and `blueprint_count: int`. The UI
uses these to enable/disable permanent-delete without a probe; the DELETE
endpoint remains the authoritative guard.

### Frontend (`apps/web-admin/src/pages/ExamsList.tsx`)

`ExamListEntry` interface gains `question_count` and `blueprint_count`. Per-row
actions, beside "Edit →":
- **Published row:** `Retire` button → simple confirm → `POST …/retire` → refetch.
- **Retired row:** `Restore` button → simple confirm → `POST …/restore` → refetch.
- **`Delete`** (permanent): rendered for every row but **enabled only when
  `question_count===0 && blueprint_count===0`**; otherwise disabled with a
  tooltip ("Has N questions / M blueprints — retire instead"). Clicking opens a
  **type-the-code modal**.

New `ConfirmDeleteModal` component (`apps/web-admin/src/components/`): shows the
exam name + code, a text input, and a Delete button enabled only when the typed
value `=== exam.code`. On confirm → `DELETE …/{id}` → on success refetch; on 409
surface the returned message.

A pure helper `isDeletable(row)` (`question_count===0 && blueprint_count===0`)
lives in `ExamsList.tsx` (or a small `examActions.ts`) so it is unit-testable.

### Data flow & safety

Retire/restore only flip `is_published` — fully reversible, no data loss. Hard
delete is gated server-side AND in the UI; the type-the-code modal is the final
backstop. Because the guard requires zero questions, deleting the exam's topics
cannot orphan any `content_schema.questions` row.

## Error handling

- 403 (non-admin), 404 (unknown exam) on all three endpoints.
- 409 `exam_in_use` on DELETE when questions/blueprints exist → UI shows the
  counts and points to Retire.
- Hard delete is a single transaction (all-or-nothing).
- Retire/restore are idempotent (re-running is a no-op on already-in-state rows).

## Testing

- **Backend (pytest, `services/learning/tests/exam_builder/`):** retire flips
  `is_published=FALSE` on exam + subjects + topics; restore reverses it; DELETE
  returns 409 when the exam has questions or blueprints (assert counts in body);
  DELETE removes the exam + subjects + topics + pools + blueprints when clean
  (assert rows gone); 403 for non-admin; 404 for unknown id.
- **Frontend (vitest):** `isDeletable(row)` true only when both counts are 0;
  the type-code modal enables Delete only when the typed string equals the exam
  code.

## Out of scope (YAGNI)

- Cross-service enrollment (identity) / attempt (quiz) checks — lean guard chosen.
- Cleaning orphaned cross-service rows (none meaningful for a content-free exam).
- Bulk multi-select delete.
- Audit-log entry for deletion (can be a follow-up).
