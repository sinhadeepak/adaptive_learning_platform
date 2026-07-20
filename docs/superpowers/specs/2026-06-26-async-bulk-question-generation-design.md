# Async + Chunked Bulk Question Generation — Design

**Date:** 2026-06-26
**Status:** Approved (design)
**Service:** alp-learning (`ai_authoring`) + apps/web-portal
**Builds on:** [2026-06-26-async-exam-research-design.md](2026-06-26-async-exam-research-design.md)

## Problem

The educator "Generate questions with AI" panel (`POST /content/ai/bulk-draft`)
fans out `count` parallel LLM drafts synchronously and returns them inline. For
large counts the request outlives the proxy timeout, so authors can't reliably
generate more than ~10 at once. They want 100–200+ in one go.

## Goal

Make bulk generation a background job that chunks the work, accumulates drafts,
and notifies the author when the whole batch is done — they review (Save all /
Save selected) afterwards. Targets 100–300 questions per job.

## Decisions (from brainstorming)

- **Quota:** bulk jobs are exempt from the per-creator daily authoring cap. This
  already holds — `quotas.check` only enforces the per-creator/day limit when
  `creator_id` is truthy ([quotas.py:98](../../services/learning/src/learning/ai_gateway/quotas.py)),
  and the bulk path passes `creator_id=None`. Only the platform 200/min rate
  applies; chunked bounded concurrency stays under it. **No quota code change.**
- **Review UX:** on completion, load all drafts into the existing results list
  with the existing Save all / Save selected actions.

## Non-goals

- No new quota system; no auto-save (review stays explicit).
- No change to the per-item `draft_question` / Gateway path or guardrails.

## Backend (alp-learning `ai_authoring`)

- New `ai_authoring/job_repo.py` over `content_schema.ai_generation_jobs`
  (`prompt_template_id='bulk_questions'`, `requested_by`-scoped) — mirrors
  `exam_builder/job_repo.py`. Reuses migration 044 columns. No new migration.
- `POST /content/ai/bulk-draft-job`
  - validate; cap `count` at **300**; `create_bulk_job(request_input, requested_by)`;
    schedule `BackgroundTasks`; return `202 { jobId, status: "pending" }`.
- Worker `run_bulk_draft_job(job_id, req, requested_by)`
  - split `range(count)` into **chunks of 12**; for each chunk run the existing
    per-item generation (`draft_question` via the Gateway, `creator_id=None`,
    bounded by `MAX_PARALLEL_DRAFTS`); accumulate `BulkDraftItem`s; on completion
    write `{ items, requested, succeeded }` to the job `output`. Per-item failures
    are captured (as today), never fail the whole job.
- `GET /content/ai/bulk-draft-job/{job_id}` → `{ status, result?: {items, requested,
  succeeded}, error? }`, scoped to `requested_by`.
- `GET /content/ai/bulk-draft-jobs` → the requesting author's active + recently
  completed bulk jobs (poller): `[{ jobId, status, topic, count, createdAt, completedAt }]`.

`requested_by` is the author's user id from the JWT principal.

## Frontend (apps/web-portal)

- **`BulkAIGenerator`**: "Generate N" → `POST /content/ai/bulk-draft-job` → store
  jobId; show "Generating N in the background — you can leave this page". Poll the
  job; on completion load `result.items` into the existing results list (per-item
  Use/edit + the existing **Save all / Save selected**). Raise the `count` max
  from 100 to 300.
- **`useDraftJobs`** poller + **`DraftJobsToaster`** mounted in `AppShell`
  (mirrors web-admin's `useResearchJobs` / `ResearchJobsToaster`): polls
  `/content/ai/bulk-draft-jobs`, localStorage-dedupes completions, toasts
  "✓ N questions ready → Review" (and "failed → Retry"). Review routes back to
  the Author screen with the job's results.

## Testing

**Backend**
- `POST /bulk-draft-job` returns 202 + jobId; `count` capped at 300.
- Worker chunks the work and accumulates all items (mock `draft_question`):
  a count spanning multiple chunks yields that many items in `output`.
- `GET /bulk-draft-job/{id}` returns items; 404 for another author's job.
- `GET /bulk-draft-jobs` scoped to requester.

**Frontend**
- poller toasts once per completed job (localStorage dedupe).
- BulkAIGenerator loads job items into the results list on completion.

## Files touched

- `services/learning/src/learning/ai_authoring/routes.py` — job endpoints + worker.
- `services/learning/src/learning/ai_authoring/job_repo.py` — new.
- `services/learning/tests/ai_authoring/…` — job lifecycle tests.
- `apps/web-portal/src/components/BulkAIGenerator.tsx` — async submit + poll + load.
- `apps/web-portal/src/lib/useDraftJobs.ts` + `components/DraftJobsToaster.tsx` — new.
- `apps/web-portal/src/components/AppShell.tsx` — mount the toaster.
