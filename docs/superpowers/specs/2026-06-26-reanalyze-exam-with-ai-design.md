# Re-analyze Exam with AI — Design

**Date:** 2026-06-26
**Status:** Approved (design)
**Service:** alp-learning (`exam_builder`) + apps/web-admin
**Builds on:** [2026-06-26-async-exam-research-design.md](2026-06-26-async-exam-research-design.md)

## Problem

Editing an existing exam to reflect a syllabus change means hand-editing
subjects/topics or recreating the exam. There's no way to ask the AI "re-look
at this exam and tell me what to add, drop, or change."

## Goal

A **"Re-analyze with AI"** action on the Edit screen that re-runs research for
an *existing* exam in a structure-aware way, then shows the result as a diff
(ADDED / REMOVED / MODIFIED) on the Review screen, which the admin edits and
saves. `/save` already reconciles into the catalog (upsert by code + soft-retire
missing), so no new persistence logic is needed.

## Decisions (from brainstorming)

- **AI mode:** structure-aware delta — the AI is given the current structure and
  told to preserve codes for unchanged concepts, add new, drop outdated. Makes
  the code-based diff accurate.
- **Apply UX:** edit the merged diff view, then Save. No per-item accept/reject.

## Non-goals

- No version history / change log.
- No fuzzy/title-based matching — diff is by stable `code` (a re-coded concept
  shows as add+remove; acceptable).
- No change to `/save` (it already upserts-by-code and soft-retires).

## Backend (alp-learning `exam_builder`)

`ResearchRequest` gains an optional field:

```
existing: ExistingStructure | None = None
  ExistingStructure = { subjects: [ { code, name, topics: [ { code, title } ] } ] }
```

When `existing` is set, `_generate_proposal` runs in **delta mode**:

- **Skeleton call** prompt includes the current subject list and instructs:
  *"Here is the exam's current subject list. Keep the same `code` for subjects
  that still belong, add subjects now relevant, omit only genuinely outdated
  ones."*
- **Per-subject topics call** — for a subject whose `code` matches a current
  subject, include that subject's current topics and instruct: *"Preserve the
  `code` of topics that still belong; add new; omit outdated."* New subjects get
  the normal (non-delta) topics prompt.

No new endpoint — re-analyze is `POST /research` with `existing` populated. The
job persists it in `request_input` (retry-safe). The job returns a full
`ExamProposal` exactly like a fresh research job; the diff is computed on the
client.

## Frontend (apps/web-admin `ExamBuilder.tsx`)

- **Edit screen:** add a "⟳ Re-analyze with AI" button. On click:
  - POST `/research` with the exam's basics + `existing` = the currently-loaded
    proposal's structure;
  - navigate to `/exams/edit/:id?job=<jobId>` and keep the originally-loaded
    proposal in state as `baseline` for diffing;
  - the existing job poller + global toaster handle "generating" / completion.
- **On job completion:** compute a diff of the new proposal against `baseline`,
  by code:
  - subjects/topics in new but not baseline → **added**
  - in baseline but not new → **removed** (re-injected into the merged list so
    the admin sees them)
  - same code, changed name/title/description → **modified**
- **Merged Review screen:** render badges (added=green, removed=red strikethrough
  "will retire", modified=amber). Removed rows get a **Keep** action that
  re-includes them. All rows stay inline-editable as today.
- **On Save:** drop removed rows the admin didn't Keep from the payload; send the
  rest to `/save` (retires the dropped, upserts the rest).

### Diff state

`ReviewStep` (or a small `useExamDiff` helper) takes `baseline` + `proposal` and
produces a per-code status map plus a merged subjects/topics list (new items in
order, removed items appended within their subject). "Keep" flips a removed row
to kept (kept rows are included on save). Save filters out `removed && !kept`.

## Testing

**Backend**
- `_generate_proposal` in delta mode includes current subjects in the skeleton
  prompt and current topics in the matching subject's topics prompt (assert the
  prompt text / call args via the mocked `call_structured`).
- A re-analyze job (request with `existing`) succeeds and returns a proposal;
  request_input round-trips `existing`.

**Frontend**
- diff helper: added/removed/modified classified correctly by code.
- merged list includes removed baseline items; Save payload excludes
  removed-not-kept and includes kept.

## Files touched

- `services/learning/src/learning/exam_builder/routes.py` — `existing` field +
  delta prompts.
- `services/learning/tests/exam_builder/test_research_jobs.py` — delta-mode tests.
- `apps/web-admin/src/pages/ExamBuilder.tsx` — Re-analyze button, diff, badges,
  Keep, save filter (plus a small `useExamDiff` helper/module).
