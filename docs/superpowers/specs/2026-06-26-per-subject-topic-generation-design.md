# Per-subject AI topic generation & regeneration

**Date:** 2026-06-26
**Area:** exam-builder (web-admin + services/learning)
**Status:** Approved — ready for implementation plan

## Context

In the admin exam-builder edit screen (`/exams/edit/:id`), optional subjects of an
exam (e.g. the 24 UPSC optional subjects — Anthropology, Botany, …) show **0
topics**, while mandatory subjects (GS papers, CSAT) have full topic lists.

Root cause (from exploration): the AI research flow already generates topics for
**every** subject — mandatory and optional — via pass 2 (`_fill_topics`,
`services/learning/src/learning/exam_builder/routes.py:402`), and Save persists
them regardless of mandatory/pool status. The empty subjects are named
`NEW_SUBJECT_1…24` — the signature of subjects added to the skeleton (or manually
via "+ Add subject") **without an AI topic pass ever running for them**. The only
existing way to fill them is the full-exam **"Re-analyze with AI"**, which
regenerates *all* subjects' topics (24+ LLM calls) and risks churning the
mandatory subjects too. **There is no per-subject topic generation endpoint.**

The user need is twofold and recurring: (1) fill topics for subjects that have
none, and (2) re-sync a subject's topics when the syllabus changes over time
(topics added / modified / removed). This calls for **on-demand, per-subject AI
topic (re)generation** with a delta-merge review — not a whole-exam re-analyze.

Outcome: an admin can generate topics for any single subject in seconds, or fill
all empty subjects in one bulk action, reviewing AI changes as ADDED / MODIFIED /
REMOVED before saving.

## Decisions (locked)

- **Granularity:** per-subject button **and** a top-level "fill all empty
  subjects" bulk action.
- **Regeneration semantics:** delta-merge with diff review (preserve existing
  topic `code`s, ADD new, MODIFY titles, mark REMOVED) — the same review model as
  Re-analyze.
- **Execution:** single subject runs **synchronously** (one fast LLM call); the
  bulk fill runs **asynchronously** via the existing background-job pattern.

## Existing building blocks (reused)

- `_fill_topics(subject)` — `routes.py:402-431`: one `call_structured` against
  `TOPIC_SYSTEM_PROMPT` + `TOPICS_SCHEMA`, delta-seeded with existing topic codes.
- Async job infra: `ai_generation_jobs` table + `job_repo.py`
  (`create/get/complete/fail`), the `BackgroundTasks` worker pattern, and the
  research poller endpoints (`routes.py:474-532`).
- Frontend diff: `apps/web-admin/src/lib/examDiff.ts` — `diffTopics(baseline,
  next)` already yields per-topic `_status` of `added | removed | modified |
  unchanged`, with removed topics re-injected for review.
- Frontend job UX: `useResearchJobs` + `ResearchJobsToaster`.
- Save: `POST /admin/exam-builder/save` already upserts topics
  `ON CONFLICT (subject_id, code)` and soft-deletes published topics absent from
  the proposal (`routes.py:882-951`).
- Catalog topic model: `catalog_schema.topics` with
  `UNIQUE (subject_id, code)` and `is_published`.

## Architecture

### Backend — reusable service + two endpoints

**Service function** (extract from `_fill_topics`): a callable
`generate_topics_for_subject(*, exam_code, exam_name, level, subject_code,
subject_name, existing_topics: list[TopicDraft]) -> list[TopicDraft]`. It builds
the same per-subject prompt (delta-seeded with `existing_topics` to preserve
codes), calls `call_structured`, validates into `TopicDraft[]`, and raises
`ResearchError` on empty/invalid output. The existing `_fill_topics` is
refactored to delegate to it (DRY — single source of the prompt + parse logic).

**Endpoint A — sync, per-subject:**
`POST /admin/exam-builder/subjects/topics`
Body: `{ code (exam), name, level, subject: { code, name }, existing: [{ code,
title }] }` → `200 { topics: [TopicDraft] }`. Guarded by the AI-provider check
(503 when disabled), mirroring `/research`.

**Endpoint B — async, bulk fill-empty:**
`POST /admin/exam-builder/topics/fill-empty`
Body: `{ code, name, level, subjects: [{ code, name, existing: [{code,title}] }]
}` → `202 { jobId }`. Reuses `ai_generation_jobs` discriminated by a new
`prompt_template_id = 'exam_topics_fill'`. The worker runs the subjects
bounded-parallel (same `asyncio.Semaphore(_TOPIC_CONCURRENCY)` pattern) and
writes a result payload `{ subjects: [{ code, topics: [...] , error?: str }] }`.
**Partial-failure tolerant:** a subject whose call fails records a per-subject
`error` and does not abort the batch.
Poller: `GET /admin/exam-builder/topics/fill-empty/{job_id}` →
`{ jobId, status, result?, error? }` (a sibling of the research poller; may share
the job-get repo with a kind filter).

### Frontend (`apps/web-admin/src/pages/ExamBuilder.tsx`)

- **Per-subject row (`SubjectRow`):** add a button labelled `↻ Generate topics`
  when the subject has none, `↻ Regenerate topics` otherwise. On click → call
  Endpoint A → run `diffTopics(subject.topics, aiTopics)` → replace the row's
  topics with the resulting `TopicDiff[]` and render them with the existing
  ADDED / MODIFIED / REMOVED styling + **Keep** affordance already used by the
  Re-analyze review. A spinner + disabled state covers the in-flight call.
- **Top-level action:** a `Fill topics for empty subjects (AI)` button beside
  "Re-analyze with AI". It posts the subjects with 0 topics to Endpoint B, then
  uses the `useResearchJobs`/`ResearchJobsToaster` pattern (extended to the new
  job kind) to track progress; on completion it merges each returned subject's
  topics into the proposal via `diffTopics`, surfacing any per-subject failures
  in the toaster summary ("22/24 filled, 2 failed — retry").

### Data flow & save semantics

Generated topics live in the in-memory `proposal` and persist only on the
existing **"Save exam to catalog"**. Delta-merge preserves topic `code`s so
linked questions don't orphan; ADDED/MODIFIED apply through the existing
`ON CONFLICT` upsert. A topic the admin accepts as REMOVED is dropped from the
proposal before save, so the existing soft-delete retires it. No change to the
save endpoint is required.

## Error handling

- Sync: AI provider disabled → 503 surfaced inline on the row; LLM/validation
  failure → inline error, the subject's existing topics left untouched.
- Bulk: provider disabled → job fails with a clear error; otherwise per-subject
  errors are collected into the result and shown in the toaster, with the
  successful subjects still applied.

## Testing

- **Backend (pytest):** `generate_topics_for_subject` happy path + empty/invalid
  raise (mock `call_structured`); Endpoint A 200 + 503; Endpoint B 202 + poll to
  `completed`; bulk partial-failure (one subject errors, others succeed); the
  refactored `_fill_topics` still produces identical full-exam output.
- **Frontend (vitest):** `diffTopics` is already covered; add tests for the
  regenerate→merge wiring, the button label state (Generate vs Regenerate), and
  the empty-fill merge applying per-subject results with correct diff statuses.

## Out of scope (YAGNI)

- Auto-generating topics when a subject is added manually via "+ Add subject".
- Scheduled / automatic syllabus re-checks.
- Cross-exam topic templates or import.
- Changes to the save endpoint (existing upsert + soft-delete already suffice).
