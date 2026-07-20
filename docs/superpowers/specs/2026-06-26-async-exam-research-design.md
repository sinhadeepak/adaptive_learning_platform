# Async Exam-Builder Research — Design

**Date:** 2026-06-26
**Status:** Approved (design)
**Service:** alp-learning (`exam_builder` module) + apps/web-admin
**Related:** Phase 5 AI authoring; reuses `ai_generation_jobs` (migration 041)

## Problem

The admin "Add new Exam" screen (`/exams/new` → `POST /admin/exam-builder/research`)
generates an exam structure with an LLM (claude_code). The call is synchronous and
its wall-time scales with exam size:

- A single monolithic LLM call for the whole tree ran past 300s and 504'd.
- Chunking it (skeleton call + one small per-subject topics call, bounded-parallel
  at 4) made the backend **reliable**, but the request is still synchronous: a large
  exam over-decomposes into many subjects (e.g. CBSE Class X → 17 subjects, ~180–225s),
  so a fixed nginx `proxy_read_timeout` can always be exceeded by a big enough exam
  (UPSC-scale, 25+ subjects).

A current stopgap raises the exam-builder nginx timeout to 300s, which covers typical
exams but not the largest. We need a durable fix that is independent of exam size.

## Goal

Turn research into a background job: the admin submits a request, is freed to do other
work anywhere in the admin app, and is notified in the web UI when the draft is ready
to review. No LLM round-trip sits in the HTTP request path, so exam size no longer
matters.

## Non-goals

- No change to provider selection (claude_code via the `ai_providers` chain stays).
- No new job table or migration — reuse `ai_generation_jobs`.
- No cross-service notification wiring (the platform notification/inbox system is
  student/teacher-oriented; out of scope here).
- The `save` endpoint is unchanged.

## Decisions (from brainstorming)

- **Notify mechanism:** in-app poller + toast/badge in the admin shell (~5s latency),
  self-contained in web-admin + learning.
- **Persistence:** server-tracked. The poller asks the server for the requesting
  admin's own active + recently-completed research jobs, so a page refresh or a fresh
  login still shows "generating…" and still delivers the completion toast.
- **Concurrency:** multiple research jobs may run at once; the poller handles a list.

## Architecture

### Backend (alp-learning, `exam_builder/`)

**Job storage** — reuse `content_schema.ai_generation_jobs`, discriminated by
`prompt_template_id = 'exam_research'`. A new `exam_builder/job_repo.py` modeled on
`localisation/job_repo.py`:

- `create_research_job(session, *, request, requested_by) -> job_id`
  - inserts a row `status='pending'`, stores the `ResearchRequest` inputs (so the
    worker and a retry can reconstruct the prompt). Returns the `job_id`.
- `complete_research_job(session, *, job_id, output)` — `status='succeeded'`,
  `output = ExamProposal` JSON, `completed_at = now()`.
- `fail_research_job(session, *, job_id, error)` — `status='failed'`,
  `error_message`, `completed_at = now()`.
- `get_research_job(session, *, job_id)` — one job (status/output/error/timestamps).
- `list_research_jobs(session, *, requested_by)` — that admin's research jobs that are
  active OR completed within a recency window (for the poller).

`requested_by` is the admin's user id (from the JWT principal). Stored on the row so
list/get are scoped per-admin.

**Endpoints** (`exam_builder/routes.py`):

- `POST /admin/exam-builder/research`
  - `_require_admin`; create job; schedule the worker via FastAPI `BackgroundTasks`;
    return `202 { "job_id": ..., "status": "pending" }` immediately.
- `GET /admin/exam-builder/research/{job_id}`
  - `_require_admin`; return `{ status, result?: ExamProposal, error? }`. 404 if the
    job doesn't exist or isn't this admin's research job.
- `GET /admin/exam-builder/research/jobs`
  - `_require_admin`; return the requesting admin's active + recently-completed
    research jobs: `[{ job_id, status, exam_code, exam_name, created_at, completed_at }]`.

**Worker** — the existing chunked generation (skeleton call + bounded-parallel
per-subject topics, assemble `ExamProposal`, run pool/mandatory cross-checks) moves
into a worker coroutine `run_research_job(session_factory, job_id)`:

- Opens its own DB session(s) (BackgroundTasks run after the response is sent, so it
  must not use the request session).
- On success → `complete_research_job`; on any handled error / `None` from the
  provider chain / validation failure → `fail_research_job` with a readable message.
- Cross-checks that previously raised HTTP errors become `fail_research_job` reasons.

### Frontend (apps/web-admin)

- **`useResearchJobs` poller** mounted once in the AdminShell:
  - polls `GET /research/jobs` every ~5s (only while there are active jobs, or always
    at a slow cadence — implementation detail);
  - keeps a localStorage set of already-toasted `job_id`s to fire each completion toast
    exactly once across refreshes;
  - on a newly-`succeeded` job → success toast + badge "‹exam› draft ready → Review";
    on `failed` → error toast with a **Retry** action (re-POSTs research with the same
    inputs).
- **Toast/badge component** — small, self-contained (admin has none today).
- **`ExamBuilder.tsx`**:
  - submit → `POST /research` → store `job_id`; show "Draft is generating in the
    background — you can leave this page." (the wizard no longer blocks on step 2).
  - the **Review AI draft** step loads the proposal via `GET /research/{job_id}` and
    renders it exactly as today; clicking the completion toast routes here for the
    relevant job (e.g. `/exams/new?job=<id>`).

## Data flow

```
Admin clicks "Research with AI"
  → POST /admin/exam-builder/research
      → create_research_job(status=pending)            [ai_generation_jobs row]
      → BackgroundTasks: run_research_job(job_id)
      → 202 {job_id}                                    (returns immediately)
  ... admin navigates freely ...
  run_research_job (background):
      skeleton call → per-subject topics (parallel ≤4) → assemble ExamProposal
      → complete_research_job(output) | fail_research_job(error)
  AdminShell useResearchJobs poller (~5s):
      GET /research/jobs → sees job succeeded
      → toast "‹exam› draft ready → Review" (once)
  Admin clicks toast → /exams/new?job=<id>
      → GET /research/{job_id} → render Review AI draft step
```

## Error handling

- **Job failure** (provider returned nothing, invalid skeleton/topics, cross-check
  violation): `status='failed'` + message; poller shows an error toast with Retry.
- **Backend restart / cancellation mid-job**: the row is left `pending`. `get`/`list`
  treat a job `pending` beyond a staleness cutoff (e.g. created >10 min ago) as failed
  ("generation timed out — please retry"), so the UI never polls forever.
- **No AI provider enabled**: job fails immediately with the existing
  "no provider enabled" message (same copy as today's 503).

## Testing

**Backend**
- `POST /research` returns 202 + job_id and creates a `pending` row.
- `run_research_job` writes `output` on success (LLM calls mocked) and `error_message`
  on a forced failure.
- `GET /research/{job_id}` returns status/result; 404 for another admin's job.
- `GET /research/jobs` lists only the requesting admin's research jobs; respects the
  recency window; stale `pending` reported as failed.

**Frontend**
- Poller fires a completion toast exactly once per `succeeded` job (localStorage
  dedupe across a simulated refresh).
- Review step loads and renders a proposal by job_id.

## Rollout / cleanup

- Once async is in, revert the nginx exam-builder `proxy_read_timeout` back toward the
  default — the research POST returns in milliseconds; only the (small) `save` call
  remains synchronous on that route.
- Keep the chunked generation (it's what makes the worker reliable).

## Files touched

- `services/learning/src/learning/exam_builder/routes.py` — endpoints become
  enqueue/get/list; worker extracted.
- `services/learning/src/learning/exam_builder/job_repo.py` — **new** (modeled on
  `localisation/job_repo.py`).
- `services/learning/tests/exam_builder/…` — job lifecycle tests.
- `apps/web-admin/src/` — `useResearchJobs` poller, toast/badge component,
  `ExamBuilder.tsx` flow change.
- `apps/web-admin/nginx.conf` — revert exam-builder timeout after cutover.
