# Unified Multi-Exam Dashboard — Design

**Date:** 2026-07-07
**Branch:** feature/vidya-foundation
**Scope:** web-student `/home` (Master Dashboard). Web only; mobile deferred.

## Problem

The student `/home` is a *unified* dashboard, but two of its surfaces assume a
single exam:

1. The **hero readiness card** shows one exam's readiness (`NEET Readiness · 473/900`).
   A student enrolled in multiple exams (e.g. NEET + UPSC_CSE + CBSE_9) sees only
   the first exam's number.
2. The **"Jump in" `QuickActions` row** (AI practice / Mock tests / Study map /
   Ask Vidya / Study materials) is a set of generic launchers that are *not
   contextual* — they don't reflect which exam needs attention or what is due.

Additionally, the existing multi-exam fork (`enrolledCatalog.length >= 2` →
`MultiTrackBody` "N pursuits in motion") **is not firing** for a 3-exam student —
they land in the single-exam Master Dashboard body instead. Root cause: the
`enrolledCatalog` list (catalog exams filtered by the profile's enrolled examIds)
comes back with < 2 entries, so the fork condition is never met.

## Goals

- Hero → **per-exam readiness carousel** (one slide per enrolled exam).
- Replace the `QuickActions` row on `/home` with **per-exam attention cards**:
  one card per exam surfacing readiness, days-to-exam, weakest topic, and
  mistakes-due / revision-due counts, each deep-linking into that exam.
- Fix multi-exam detection so *all* enrolled exams surface.
- No schema changes; reuse existing analytics primitives.

## Non-Goals

- No mobile changes (parity handled later).
- No change to `QuickActions` where it is used on exam-scoped pages
  (ExamDetail, etc.) — only its `/home` usage is replaced.
- Not reworking the `MultiTrackBody` "N pursuits" component itself — it is simply
  **bypassed for the home route** (decision confirmed with user).

## Key Technical Facts (verified)

- Readiness is stored **only** with `scope="GLOBAL"` (one row per user) —
  `processing.py` calls `upsert_readiness(scope="GLOBAL")`. There is **no**
  per-exam readiness row today.
- `readiness_from_mastery(rows)` is a **pure function** over mastery rows.
- Per-exam scoping already exists via `resolve_exam_topic_ids(exam_id)` (returns
  the topic-id set for an exam), used by:
  - `GET /analytics/mastery/{id}?exam_id=…`
  - `GET /analytics/revision/{id}?exam_id=…`
- Mistake rows (`analytics_schema.mistakes`) carry `topic_id`; per-exam mistake
  counts derive from `topic_id ∈ resolve_exam_topic_ids(examId)` (topic-set based,
  robust — does not depend on the mistakes' own `exam_id` column being populated).

**Consequence:** per-exam readiness + weakest topic + due-counts are all
derivable by filtering existing mastery / revision / mistakes data through the
exam's topic set. A single consolidated endpoint can return everything the two
new components need in one round-trip.

## Design

### A. Exam list (foundation + detection fix)

Derive the enrolled-exam list on `/home` from `/profile/me` (`exams[]` →
`{ examId, targetDate }`) merged with `/catalog/exams` for `code` / `name`.
This is the data spine for both new components. Where a catalog lookup for an
enrolled examId fails, still render the exam using its `examId` / any available
code (degrade gracefully rather than dropping it — this is the current bug's
failure mode). The redesigned Master Dashboard is the unified home for **all**
students (0, 1, or N exams); the `MultiTrackBody` fork is removed from the home
route.

### B. Backend — one consolidated endpoint (engagement)

`GET /analytics/multi-exam-summary/{user_id}?examIds=a,b,c`

Guarded by `require_owner`. For each requested examId:

1. `topic_ids = resolve_exam_topic_ids(examId)`
2. `masteryRows = list_user_mastery(user_id) filtered to topic_ids`
3. `readinessScore = readiness_from_mastery(masteryRows)`
4. `weakest = min-EWA row with n >= 3` (nullable)
5. `mistakesDue = count of due mistakes with topic_id ∈ topic_ids`
6. `revisionDue = count of due revision-queue rows with topic_id ∈ topic_ids`

Response:

```json
{
  "userId": "…",
  "exams": [
    {
      "examId": "…",
      "readinessScore": 0.53,
      "nTopics": 42,
      "weakestTopicId": "…",
      "weakestEwa": 0.31,
      "mistakesDue": 4,
      "revisionDue": 2
    }
  ]
}
```

`examIds` is capped (e.g. ≤ 12) to bound the loop. Unknown / empty exams return a
zeroed entry (score 0, nulls) so the UI renders an empty state, not a 404.

**Pure core:** the per-exam roll-up (readiness + weakest + counts from injected
row lists) is a pure function tested with fake row inputs; the route is a thin
adapter that fetches rows and calls it. Pytest coverage:
- readiness matches `readiness_from_mastery` for the filtered set
- weakest ignores n < 3
- due-counts respect the topic-set boundary (topic outside the set not counted)
- `require_owner` (401 no token / 403 other user)

### C. Frontend — two components (web-student)

**`ReadinessCarousel`** — replaces the `.vidya-hero` section.
- One slide per enrolled exam: `<code> Readiness`, score `/900`, θ hint,
  days-to-exam countdown (from the exam's `targetDate`), and week delta.
- Manual navigation: dots + prev/next arrows + horizontal swipe. **No
  auto-rotate** (a readiness number is read, not glanced).
- Exactly one exam → a single static slide, visually identical to today's hero.
- Zero exams → the existing "practice 10 more questions" empty state.

**`ExamAttentionCards`** — replaces the `QuickActions` usage on `/home`.
- One card per enrolled exam:
  - header: exam code + name
  - readiness mini (score /900) + days-to-exam
  - weakest-topic chip (title resolved via `/catalog/topics/{id}`, existing pattern)
  - counts: `N mistakes due`, `N revision due` (green "all clear ✓" when both 0)
  - primary CTA deep-linking into that exam: Resume/Practice scoped by `examId`
    (`/practice?examId=…&topic=<weakest>`), plus a secondary link (e.g. Study map).
- Section header: `Needs attention · across your N exams`.
- Loading skeleton per card while the summary resolves.

Both components take plain props (exam list + summary map) and are pure/presentational
so they can be unit-tested without network. A `.test.tsx` peer covers render of
counts, empty state, and CTA hrefs (repo convention).

### D. Home wiring

`Home.tsx`:
- Build the enrolled-exam list (A).
- Fetch `multi-exam-summary` once for those examIds.
- Render `ReadinessCarousel` in place of `.vidya-hero`; keep NBA + Today's plan
  columns in the top grid.
- Render `ExamAttentionCards` in place of `<QuickActions>`.
- Remove the `enrolledCatalog.length >= 2 → MultiTrackBody` early return from the
  home route.
- Keep KPI tiles + mastery-by-subject table + activity heatmap unchanged.

### E. Scope guard

`QuickActions` remains imported/used by exam-scoped pages. Only the `/home`
import is removed. Grep-verify no other regressions.

## Data Flow

```
profile/me ─┐
            ├─► enrolled exams [{examId, targetDate}]
catalog/exams ┘        │
                       ├─► GET /analytics/multi-exam-summary?examIds=…
                       │        └─► per-exam {readiness, weakest, mistakesDue, revisionDue}
                       ▼
        ReadinessCarousel   +   ExamAttentionCards
```

## Error Handling

- Summary fetch fails → components render from the exam list alone (readiness/counts
  show `—`); dashboard never blanks.
- Per-exam catalog/topic lookups fail → fall back to ids/placeholder, exam still shows.
- Endpoint caps `examIds` length; zeroed entries for unknown exams.

## Testing

- Backend: pure roll-up unit tests + route tests (owner guard, topic-set boundary).
- Frontend: `ReadinessCarousel.test.tsx` + `ExamAttentionCards.test.tsx`
  (render, empty state, CTA hrefs). Existing Home tests updated for the new layout.
- Manual: log in as the 3-exam student → carousel shows NEET/UPSC/CBSE slides →
  attention cards show per-exam due counts → CTA lands on exam-scoped practice.

## Rollout

Engagement service (new endpoint) rebuilt + redeployed; web-student rebuilt +
container recreated (no vite hot-reload locally). No migration.
