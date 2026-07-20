# Historical tests & results on the student exam dashboard

**Date:** 2026-06-26
**App:** `apps/web-student`
**Status:** Approved — ready for implementation plan

## Problem

On the student exam dashboard (`ExamDetail.tsx`), there is no real way to view
historical tests and their results, so a student cannot review past mistakes or
get more detail from this screen.

Two concrete gaps were found during exploration:

1. **The dashboard's "Recent attempts" is fake.** The "Mock tests" card renders a
   synthetic sparkline produced by `deriveMockHistory()` (a stub that fabricates a
   monotonically improving 6-point series from the readiness score). It links
   nowhere useful for reviewing an attempt.
2. **The real History page is buried.** A fully-built `History` page (`/history`)
   already fetches real data and deep-links every attempt to its review screen,
   but it is only reachable from the small avatar dropdown at the bottom of the
   sidebar — not the main navigation.

The review/result screens themselves already exist and work
(`/mock/result?attemptId=…`, `/quiz/:id/result`, `/sessions/:id/deep-dive`), so
this work is **surfacing + real-data wiring**, not building review UI from scratch.

## Decisions (locked)

- **Scope:** Dashboard section + nav surfacing. (No History redesign, no new
  backend endpoints.)
- **Content of the dashboard section:** Mocks **and** practice, in one unified
  recent-activity list.
- **Exam scope:** All exams (not filtered to the currently-viewed exam).

## Existing building blocks

Real endpoints already consumed by `History.tsx`:

- `GET /api/v1/profile/mock-attempts` → mock attempts. Shape (per History):
  `{ id, mockId, examCode, examName, rawScore, maxMarks, accuracy,
  totalQuestions, nCorrect, nWrong, nUnanswered, percentile, projectedRank,
  confidence, createdAt }`.
- `GET /api/v1/quiz/sessions?userId=<id>&limit=<n>` → practice/mock sessions.
  Shape: `{ sessionId, topicId, mode: "PRACTICE"|"MOCK", strategy,
  status: "IN_PROGRESS"|"SUBMITTED"|"EXPIRED", targetCount, servedCount,
  correctCount, startedAt, submittedAt }`.

Deep-link conventions (from History):

- Mock attempt → `/mock/result?attemptId=<id>`
- Practice session, submitted/expired → `/quiz/<sessionId>/result`
- Practice session, in progress → `/quiz/<sessionId>`

## Architecture

### New module: `apps/web-student/src/lib/recentActivity.ts`

Single source of truth that fetches both endpoints and normalizes them into a
unified, sortable list. Keeps fetch/normalize/merge logic out of the page so it
is unit-testable and reusable.

Normalized row:

```ts
export type RecentTestKind = "mock" | "practice";

export interface RecentTest {
  id: string;                 // attemptId or sessionId
  kind: RecentTestKind;
  title: string;              // e.g. "NEET full mock" / topic title / "Practice"
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  scoreLabel: string | null;  // e.g. "612 / 720" for mocks
  accuracyPct: number | null; // 0–100
  when: string;               // ISO timestamp used for sorting (createdAt/startedAt)
  href: string;               // deep-link to the review/result/resume screen
}
```

Pure helpers (exported for testing):

- `normalizeMockAttempt(a): RecentTest` — `kind: "mock"`, `scoreLabel`
  = `${rawScore} / ${maxMarks}`, `accuracyPct` from `accuracy`, `href`
  = `/mock/result?attemptId=${id}`, `status: "SUBMITTED"`, `when = createdAt`.
- `normalizePracticeSession(s): RecentTest` — `kind: "practice"`, `accuracyPct`
  from `correctCount/servedCount`, `href` per status convention, `when = startedAt`.
- `mergeRecent(mocks, sessions, limit): RecentTest[]` — **dedup rule:** include
  mock attempts as the authoritative source for scored mocks, and from
  `quiz/sessions` include only rows with `mode === "PRACTICE"` (drop
  `mode === "MOCK"` to avoid double-counting). Concatenate, sort by `when` desc,
  slice to `limit`.

Async fetcher:

- `fetchRecentTests(userId, { limit }): Promise<RecentTest[]>` — runs both
  fetches via `auth.fetch`, tolerates either failing independently (a failed
  fetch contributes an empty list rather than throwing), returns the merged list.

Topic-title resolution for practice rows reuses the existing approach (the page
already has topic metadata available, or rows fall back to a generic
"Practice" / `Topic #<short-id>` label — no new lookups required for the
dashboard's small slice).

### `ExamDetail.tsx` changes

- Delete `deriveMockHistory()` and stop deriving `mockScores` from readiness.
- Load real data via `fetchRecentTests(userId, { limit: 5 })` in an effect
  (offline-tolerant, mirroring the sidebar's pattern).
- Rename the card heading from the implicit mock-only "Recent attempts" to
  **"Recent tests"**; render up to 5 unified rows. Each row is clickable
  (role="button" + keydown, matching History) showing: kind ("Mock"/"Practice"),
  title, score/accuracy, relative time, and a "Review →" affordance; clicking
  navigates to `row.href`.
- The 4-stat strip (Latest / Best / Avg / Tests taken) is computed from the
  **real mock rows** (those with a numeric score). When there are no mocks, hide
  the strip.
- Empty state: when the merged list is empty, show a short prompt (e.g. "No tests
  yet — start a mock or a practice session") instead of a fake sparkline.
- Keep the existing "All tests →" link (`/mocks`) and the "Start mock" button.
- The `MockTestSparkline` synthetic chart is removed from this card. (Component
  itself may remain in the codebase if used elsewhere; if unused after this
  change, delete it.)

### `VidyaShell.tsx` changes

- Add `{ href: "/history", label: "History", icon: <IconClock /> }` to the
  **Progress** nav group (alongside My analysis / Insights / Syllabus / Rank
  predictor).
- Remove the now-redundant History entry from the avatar dropdown
  (Search / Saved / History / Profile / Settings → Search / Saved / Profile /
  Settings).

## Error handling

Each fetch is wrapped; an individual failure degrades to an empty contribution
so the card always renders (consistent with the sidebar's offline-tolerant
fetch). Loading uses the existing skeleton convention already present on the
page. No new error surfaces are introduced.

## Testing

Unit tests for `recentActivity.ts` (Vitest, matching `examDiff.test.ts` style):

- `normalizeMockAttempt` / `normalizePracticeSession` produce correct
  `scoreLabel`, `accuracyPct`, `status`, and `href` (incl. in-progress →
  `/quiz/:id` vs submitted → `/quiz/:id/result`).
- `mergeRecent` drops `mode === "MOCK"` sessions (dedup), sorts by `when` desc,
  and respects `limit`.
- Accuracy edge cases: zero answered → `accuracyPct` null (no divide-by-zero).

The dashboard change is presentational over the tested lib; no new page-level
tests required beyond a smoke render if convenient.

## Out of scope (YAGNI)

- No new backend endpoints.
- No redesign of the History page.
- No exam-scoped filtering on the dashboard (all-exams chosen).
- No per-mistake breakdown beyond what existing review pages already show.
