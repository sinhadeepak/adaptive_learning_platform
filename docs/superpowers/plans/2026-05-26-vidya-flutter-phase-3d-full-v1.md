# Phase 3d.full v1 — Insights: named FOCUS ON topics

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3d v1 (bucket-summary Insights shipped). Phase 3b.full v2 (topic detail screen shipped).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Resolve the explicit deferral from Phase 3d v1: topic-name resolution. The bucket counts are informative but not actionable — "you have 2 weak topics" doesn't tell the user *which* topics to focus on. Phase 3d.full v1 adds a **FOCUS ON** section below the bucket grid listing the user's **3 weakest topics with non-zero EWA**, each tappable to push the existing `VidyaTopicDetailScreen`.

The Navigator pattern landed in 3b.full reuses cleanly here — the Insights screen pushes the same topic detail surface as the Study tab.

---

## Out of scope for Phase 3d.full v1 (deferred to v2)

- Weekly Story carousel (the celebratory weekly review the roadmap mentions)
- Time-spent insights (`dailyActivity` aggregation across windows)
- Per-subject mastery breakdown
- Trends-over-time line (waits for the weekly readiness snapshots endpoint)
- "Strong topics" section (counterpart to FOCUS ON)
- Filtering by subject

---

## Data sources (existing)

| Need | Endpoint | Returns |
|---|---|---|
| Mastery | `api.mastery(userId)` | `List<TopicMastery>` |
| Active exam ID | `api.getProfile()` | `UserProfile.exams[0].examId` |
| Subjects for that exam | `api.subjectsForExam(examId)` | `List<Subject>` |
| Topics in each subject | `api.topicsForSubject(subjectId)` | `List<Topic>` (per subject) |

Fan-out: 1 mastery + 1 profile + 1 exams catalog + N topicsForSubject calls (N = subject count for the active exam, typically 2–3). Runs in parallel via `Future.wait`.

The resulting joined map: `topicId → Topic`. Combined with mastery, we sort topics by EWA ascending, filter for `ewa > 0`, take the first 3 → FOCUS ON list.

---

## File map

**Modified:**
- `apps/mobile/lib/vidya/screens/vidya_insights_screen.dart` — extend `_load()` to fetch topics catalog, add `_InsightsData.focusOn`, render the FOCUS ON section
- `apps/mobile/test/vidya/phase_3d_insights_test.dart` — add tests for the FOCUS ON section (presence, ordering, navigation)

No new files; this is a content addition to an existing screen.

---

## VidyaInsightsScreen — new data + UI

```dart
class _InsightsData {
  final int strong, developing, weak, notStarted, totalAttempted;
  // Phase 3d.full v1
  final List<_FocusTopic> focusOn; // weakest-first, ewa > 0, up to 3
  …
}

class _FocusTopic {
  final Topic topic;
  final double ewa;
  const _FocusTopic({required this.topic, required this.ewa});
}
```

Layout addition (below the bucket grid, above the COMING IN PHASE 3d.full card):

```
FOCUS ON                            ← section eyebrow
3 weakest topics with progress

┌────────────────────────────────┐
│ ● WEAK • 0.18                  │
│ Thermodynamics                 │
└────────────────────────────────┘

┌────────────────────────────────┐
│ ● WEAK • 0.22                  │
│ Organic Chemistry              │
└────────────────────────────────┘

…
```

Each card uses the same shape as `VidyaSubjectDetailScreen`'s `_TopicCard` — bucket dot + label/EWA eyebrow + topic title. Tap pushes `VidyaTopicDetailScreen(topic: t.topic, ewa: t.ewa)`.

When `focusOn` is empty (everyone has EWA == 0), the section is hidden.

---

## Task 1: Extend _load + render FOCUS ON

- [ ] **Step 1: Failing tests** — `phase_3d_insights_test.dart`:

```dart
testWidgets('renders FOCUS ON section when weak topics exist',
    (tester) async {
  // Mock mastery → 3 topics: 0.18 weak, 0.22 weak, 0.50 dev
  // Mock catalog → topicId→title resolution for all 3
  expect(find.text('FOCUS ON'), findsOneWidget);
  // First two (the WEAK band) should render named
  expect(find.text('Thermodynamics'), findsOneWidget);
  expect(find.text('Organic Chemistry'), findsOneWidget);
});

testWidgets('FOCUS ON ordered by EWA ascending', (tester) async { … });

testWidgets('FOCUS ON tap pushes VidyaTopicDetailScreen', (tester) async {
  await tester.tap(find.text('Thermodynamics'));
  await tester.pumpAndSettle();
  expect(find.text('Practice this topic'), findsOneWidget);
});

testWidgets('FOCUS ON hidden when all EWAs are 0', (tester) async { … });
```

- [ ] **Step 2: Extend `_load()`** to fetch profile → exams catalog → subjects → all topics-for-subjects in parallel, build a `topicId → Topic` map, then attach `focusOn` to `_InsightsData`. Failures to enrich names degrade silently — fall back to the bucket summary alone.

- [ ] **Step 3: Render FOCUS ON section** after the bucket grid. Reuse the existing dot + eyebrow pattern.

- [ ] **Step 4: Verify all insights tests pass** (existing 6 still green + new FOCUS ON tests).

- [ ] **Step 5: Commit**.

---

## Task 2: Wire FOCUS ON tap → VidyaTopicDetailScreen

Already covered in Task 1's Navigator.push, but called out as a discrete step in the plan because it depends on Phase 3b.full v2's topic detail screen. No additional code in Task 2 — the tests just assert it works.

---

## Task 3: Verification gate

- [ ] Analyze + tests.
- [ ] APK build.
- [ ] Manual smoke: INSIGHTS → see bucket counts + FOCUS ON → tap a weak topic → see topic detail → back arrow → Insights.
