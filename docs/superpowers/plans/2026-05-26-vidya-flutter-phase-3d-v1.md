# Phase 3d v1 — Vidya Insights tab landing

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3c v1 (Practice landing shipped). After this, **all 5 Vidya tabs ship real content** — no placeholders remain in the shell.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace `VidyaInsightsTabPlaceholder` with `VidyaInsightsScreen` rendering a **mastery bucket summary** card derived from existing `api.mastery(userId)`. Buckets follow the existing platform convention from `docs/CLAUDE.md`:

| Bucket | EWA range | Token |
|---|---|---|
| STRONG | ≥ 0.70 | `theme.good` |
| DEVELOPING | 0.40–0.69 | `theme.info` |
| WEAK | 0.01–0.39 | `theme.bad` |
| NOT STARTED | 0 | `theme.ink3` |

The screen shows the count in each bucket as four side-by-side stat tiles. Total topics attempted appears as a sub-header.

A second "Coming soon" card previews the Weekly Story carousel + named per-topic breakdowns that 3d.full will ship.

This makes the Vidya shell **structurally complete** — every tab is a real screen.

---

## Out of scope for Phase 3d v1 (deferred to 3d.full)

- Topic-name resolution (needs cross-fetch of `topicsForSubject` per subject; same blocker as Phase 3b.full mastery rollup — fix once, benefit twice)
- Weekly Story carousel (per slide design — celebratory weekly review)
- Time-spent insights (needs `dailyActivity` aggregation across windows)
- Per-subject mastery breakdown
- Trends over time (needs the same weekly snapshots endpoint that Home sparkline needs)
- Pull-to-refresh

---

## Data sources (existing)

| Need | Endpoint | Returns |
|---|---|---|
| Mastery buckets | `api.mastery(userId)` | `List<TopicMastery>(topicId, ewa, n)` |

That's it. Single fetch. The bucket math is client-side.

---

## File map

**New:**
- `apps/mobile/lib/vidya/screens/vidya_insights_screen.dart`
- `apps/mobile/test/vidya/phase_3d_insights_test.dart`

**Modified:**
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — replace `VidyaInsightsTabPlaceholder` with `VidyaInsightsScreen`
- `apps/mobile/lib/vidya/screens/vidya_tab_placeholders.dart` — remove `VidyaInsightsTabPlaceholder` (and **delete the whole file** if the last placeholder is gone — it's a clean win)
- `apps/mobile/test/vidya/phase_3a_shell_test.dart` — update INSIGHTS tap test

---

## Design

```
INSIGHTS                            ← eyebrow
Where you stand.                    ← display, 32px

12 topics attempted                 ← sub-header, mono ink3

┌─STRONG─┐ ┌─DEVELO─┐ ┌─WEAK──┐ ┌─NOT─┐
│   3    │ │   5    │ │   2   │ │  2  │  ← 4 stat tiles
└────────┘ └────────┘ └───────┘ └─────┘

┌─────────────────────────────────────┐
│ COMING IN PHASE 3d.full              │
│ Named per-topic breakdowns, weekly   │
│ story, and time-spent trends.        │
└─────────────────────────────────────┘
```

---

## Task 1: VidyaInsightsScreen + tests

- [ ] **Step 1: Failing tests** — `phase_3d_insights_test.dart`:

```dart
testWidgets('renders INSIGHTS eyebrow + tagline', (tester) async { … });
testWidgets('renders bucket counts derived from mastery EWAs', (tester) async {
  // Mock /analytics/mastery/u1 → 4 topics with EWAs:
  //   0.80 → STRONG, 0.50 → DEVELOPING, 0.20 → WEAK, 0.00 → NOT STARTED
  // (also include n>0 for first 3, n==0 for last)
  expect(find.text('STRONG'), findsOneWidget);
  expect(find.text('1'), findsAtLeastNWidgets(1)); // each bucket = 1
});

testWidgets('total topics attempted header reflects mastery count',
    (tester) async { … });

testWidgets('shows COMING IN PHASE 3d.full card', (tester) async {
  expect(find.text('COMING IN PHASE 3d.full'), findsOneWidget);
});

testWidgets('empty state when mastery list is empty', (tester) async { … });

testWidgets('error state when mastery fetch fails', (tester) async { … });
```

- [ ] **Step 2: Implementation skeleton**

```dart
class _InsightsData {
  final int strong, developing, weak, notStarted;
  final int totalAttempted;
  const _InsightsData({
    required this.strong,
    required this.developing,
    required this.weak,
    required this.notStarted,
    required this.totalAttempted,
  });

  factory _InsightsData.fromMastery(List<TopicMastery> rows) {
    var strong = 0, developing = 0, weak = 0, notStarted = 0;
    for (final r in rows) {
      if (r.ewa >= 0.70) strong++;
      else if (r.ewa >= 0.40) developing++;
      else if (r.ewa > 0) weak++;
      else notStarted++;
    }
    final attempted = strong + developing + weak;
    return _InsightsData(
      strong: strong,
      developing: developing,
      weak: weak,
      notStarted: notStarted,
      totalAttempted: attempted,
    );
  }
}
```

Use the same `_StudyState`-style enum from Phase 3b v1 for loading/loaded/empty/error transitions. Mastery returning an empty list = empty state, not error.

- [ ] **Step 3: Verify tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 2: Wire VidyaMainShell + clean up placeholder file

- [ ] **Step 1: Swap tab content** in vidya_main_shell.dart.
- [ ] **Step 2: Remove `VidyaInsightsTabPlaceholder`** from vidya_tab_placeholders.dart. If `_Placeholder` is the only remaining class, **delete the file entirely** and remove the import from vidya_main_shell.dart (clean wins).
- [ ] **Step 3: Update Phase 3a shell test** INSIGHTS assertion to not look for `'COMING SOON'`.
- [ ] **Step 4: Verify all tests pass**.
- [ ] **Step 5: Commit**.

---

## Task 3: Verification gate — last placeholder retired

- [ ] Analyze + tests (mobile).
- [ ] APK build.
- [ ] Manual smoke (user-driven): tap INSIGHTS → see bucket counts → tap MORE → toggle Aurora shell → restart → verify Aurora is back. Every Vidya tab now shows real content.

After this gate: the Vidya shell is **structurally complete**. The remaining migration work is depth (v1 → full per tab) and the Aurora deletion sweep (Phase 3g).
