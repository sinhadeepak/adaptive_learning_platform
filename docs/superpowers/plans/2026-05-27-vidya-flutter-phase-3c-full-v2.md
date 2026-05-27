# Phase 3c.full v2 — Focused Practice + rich result screen

**Status:** DRAFT — 2026-05-27
**Sequel to:** Phase 3c.full v1 (Quick Practice end-to-end, shipped) + v1.1 polish (IN_PROGRESS guard + required session params, shipped).
**Roadmap context:** [Vidya Mobile Design Roadmap](../specs/2026-05-25-vidya-mobile-design-roadmap.md) §Phase 3c. v1 plan: [`2026-05-27-vidya-flutter-phase-3c-full-v1.md`](2026-05-27-vidya-flutter-phase-3c-full-v1.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Two deliverables, both extensions of the v1 Quick-Practice wiring:

1. **Wire the Focused Practice mode card.** Tapping `Focused Practice` (currently shows a `coming in Phase 3c.full v2` snackbar) fetches the user's weakest concept via `InsightsClient.fetchSnapshot(userId)` and pushes `VidyaPracticeSessionScreen` against it. Same chrome as Quick; only the `topicId` source differs.

2. **Rich result screen.** Replace the v1 "minimal" `VidyaPracticeResultScreen` (eyebrow + big score + Done) with a richer page that surfaces per-topic correctness from `QuizSessionDetail.items` and adds a deep-link CTA into `VidyaInsightsScreen`.

After v2: Quick + Focused both ship; Mock Test (v3) and θ-live overlay (v4) remain stubbed.

---

## Why these together

Focused Practice on its own would ship behind a snackbar that says "v2." That's now this slice. And the rich result screen is the natural home for the Insights deep-link CTA — once Focused targets a weak topic and the user nails it, the result screen should be the place that says "you fixed Mendelian inheritance · see updated insights →" rather than the bare score we have today.

Bundling avoids two PRs that touch the same `VidyaPracticeResultScreen`.

---

## Out of scope for v2 (deferred)

| Deferred to | Item |
|---|---|
| v3 | Mock Test mode card wired (3-hour timed run, exam blueprint) |
| v4 | θ-live readout card on session screen — requires backend exposing `theta_estimate` + `next_q_b` + `theta_delta_since_start` on `/quiz/sessions/next` |
| Phase 3f | Offline-during-session UX (status row, AI-signal-unavailable notice). The existing `QuizOfflineQueue` already drains transparently. |
| Phase 3c.full v2.1 | Multi-topic Focused (today's v2 picks the single weakest; future v2.1 could push a sequence) |
| Future | Result-screen sharing / social |

---

## Backend asks

**None new.** This v2 strictly composes existing endpoints:

- `GET /insights/snapshot/{userId}` → already returns `weak_concepts: [{ concept_id, ewa, n, decay_severity, decay_days }]`, sorted weakest-first by the backend (verify during Task 1).
- `POST /quiz/sessions/start` → already accepts the `concept_id` (a.k.a. topicId) we'll forward.
- `GET /quiz/sessions/{id}` → already returns `items: [{ topicId, correctIdx, selectedIdx, ... }]` which is enough to compute per-topic correctness client-side.

If the snapshot's `weak_concepts` array is empty (cold-start user with no answered items), Focused Practice must degrade gracefully — see Task 1 acceptance criteria.

---

## File map

**New:**

- `apps/mobile/lib/vidya/screens/vidya_focused_intro_screen.dart` — brief intermediate screen ("Focusing on Mendelian inheritance · your weakest right now"). One Start CTA. Fetches the weak-concepts list once on mount.
- `apps/mobile/test/vidya/phase_3c_full_v2_test.dart` — widget tests for the new Focused flow and the rich result screen extensions.

**Modified:**

- `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart` — replace the `_PracticeModeKind.focused` snackbar branch with a `Navigator.push` to `VidyaFocusedIntroScreen`. Now needs an `InsightsClient` reference (parallel to the existing `QuizClient`).
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — instantiate `InsightsClient(auth: widget.auth)` as a `late final` sibling to `_quizClient`, thread to `VidyaPracticeScreen`.
- `apps/mobile/lib/vidya/screens/vidya_practice_result_screen.dart` — extend with per-topic breakdown section + Insights deep-link CTA.
- `apps/mobile/test/vidya/phase_3c_full_practice_test.dart` — extend existing result-screen tests to cover the new breakdown rendering + deep-link CTA tap.

**Untouched:**

- `VidyaPracticeSessionScreen` (Task 1 file) — no v2 changes; Focused reuses it verbatim.
- `VidyaInsightsScreen` — pure deep-link target; routes already wired.

---

## VidyaFocusedIntroScreen contract

```dart
class VidyaFocusedIntroScreen extends StatefulWidget {
  final QuizClient client;
  final InsightsClient insights;
  final String userId;
  /// Called when the user taps "Start focused session"; receives the
  /// resolved topicId so the session screen can be pushed with the
  /// caller's full callback wiring.
  final void Function(String topicId, String topicLabel) onStart;
  final VoidCallback onBack;

  const VidyaFocusedIntroScreen({
    super.key,
    required this.client,
    required this.insights,
    required this.userId,
    required this.onStart,
    required this.onBack,
  });
}
```

The screen is responsible for fetching the snapshot and resolving the weakest concept's `conceptId` + a human label. Topic label lookup: if the snapshot doesn't carry titles (it doesn't today — only ids), fetch from `/catalog/topics/{topicId}` once. Fall back to "your weakest topic" if catalog fetch fails.

### Layout

```
┌────────────────────────────────────────────┐
│ ✕                                            │  ← AppBar with close
├────────────────────────────────────────────┤
│                                              │
│   FOCUSED PRACTICE                           │  ← eyebrow
│                                              │
│   Mendelian inheritance                      │  ← topic name (large)
│   Your weakest topic right now (EWA 0.32).   │  ← reason
│                                              │
│   We'll serve 10 questions targeting this    │  ← copy
│   concept. Answer carefully — your mastery   │
│   score will update.                         │
│                                              │
│   [        Start focused session        ]    │  ← primary CTA
└────────────────────────────────────────────┘
```

Loading state: two `VidyaSkeletonBlock`s (eyebrow + topic name), no spinner. Empty state (no weak concepts): show "You don't have a weak topic yet — answer 10+ Quick Practice questions first to unlock Focused mode." with a "Back" CTA that pops.

---

## Task 1: `VidyaFocusedIntroScreen` + Focused mode wiring

**Files:**
- New: `apps/mobile/lib/vidya/screens/vidya_focused_intro_screen.dart`
- New: `apps/mobile/test/vidya/phase_3c_full_v2_test.dart`
- Modify: `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart`
- Modify: `apps/mobile/lib/vidya/shell/vidya_main_shell.dart`
- Modify: `apps/mobile/test/vidya/phase_3c_practice_test.dart` (the snackbar assertion for Focused changes to a navigation assertion)

- [ ] **Step 1: Failing widget tests** (`phase_3c_full_v2_test.dart`):

```dart
testWidgets('fetches snapshot on mount and renders weakest topic name',
    (tester) async {
  final insights = _StubInsightsClient(
    snapshot: _snapshot(weakConcepts: [
      _concept(id: 'topic-mendel', ewa: 0.32),
      _concept(id: 'topic-thermo', ewa: 0.41),
    ]),
  );
  final client = _StubQuizClient(); // reuse from phase_3c_full_practice_test
  // Stub catalog fetch to return the topic's title.
  // (Either stub via QuizClient.auth.apiGet or extend _StubQuizClient
  // — pick whichever is least invasive.)
  ...
  expect(find.text('Mendelian inheritance'), findsOneWidget);
  expect(find.textContaining('weakest'), findsOneWidget);
});

testWidgets('empty weak-concepts → empty-state copy + Back CTA', ...);
testWidgets('snapshot fetch error → VidyaBanner + Retry', ...);
testWidgets('Start CTA fires onStart(topicId, topicLabel)', ...);
testWidgets('close ✕ fires onBack', ...);
```

- [ ] **Step 2: Implement `VidyaFocusedIntroScreen`** mirroring `VidyaPracticeResultScreen` lifecycle (initState → `_load()` → fetch snapshot → resolve label → render). Reuse the v1 fetch + error + skeleton patterns.

- [ ] **Step 3: Wire `_PracticeModeKind.focused` in `vidya_practice_screen.dart`** — replace the snackbar branch with a `Navigator.push` to `VidyaFocusedIntroScreen`. The `onStart` callback pushes `VidyaPracticeSessionScreen` with the resolved `topicId`, exactly like Quick does today. On completion → `pushReplacement` to result. On back from intro → `pop`.

- [ ] **Step 4: Thread `InsightsClient` through `VidyaMainShell`** — add `late final _insightsClient = InsightsClient(auth: widget.auth)`. Pass to `VidyaPracticeScreen(client: _quizClient, insights: _insightsClient)`.

- [ ] **Step 5: Update Phase 3c practice test** — the existing "Focused Practice still shows snackbar" test becomes:
```dart
testWidgets('Focused Practice tap navigates to focused intro screen',
    (tester) async {
  await tester.tap(find.text('Focused Practice'));
  await tester.pumpAndSettle();
  expect(find.byType(VidyaFocusedIntroScreen), findsOneWidget);
});
```
Mock Test snackbar test stays unchanged (`coming in Phase 3c.full v3`).

- [ ] **Step 6: All new + updated tests pass.** Verify full mobile suite stays green (target: 452 + new ≈ 458).

- [ ] **Step 7: Commit.**

---

## Task 2: Rich `VidyaPracticeResultScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_practice_result_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_3c_full_practice_test.dart`

- [ ] **Step 1: Failing tests** — append to the existing result-screen group:

```dart
testWidgets('renders per-topic breakdown from items', (tester) async {
  final client = _StubQuizClient(
    sessionResponse: summary(
      correctCount: 7, servedCount: 10, targetCount: 10,
      items: [
        _item(topicId: 't1', correct: true),
        _item(topicId: 't1', correct: false),
        _item(topicId: 't1', correct: true),
        _item(topicId: 't2', correct: true),
        _item(topicId: 't2', correct: true),
        ...
      ],
    ),
  );
  // catalog stub returns titles {'t1': 'Mechanics', 't2': 'Thermo'}
  ...
  expect(find.text('Mechanics'), findsOneWidget);
  expect(find.text('2 / 3'), findsOneWidget); // t1 breakdown
  expect(find.text('Thermo'), findsOneWidget);
  expect(find.text('2 / 2'), findsOneWidget); // t2 breakdown
});

testWidgets('See insights CTA pushes VidyaInsightsScreen', ...);
testWidgets('empty items list → no breakdown section, just score + Done',
    (tester) async {
  // Edge case: session ended before any items (shouldn't happen in
  // production, but degrade gracefully).
  ...
  expect(find.textContaining('breakdown'), findsNothing);
});
```

- [ ] **Step 2: Add a pure helper** for the breakdown computation (testable without mounting the widget):

```dart
/// Groups items by topicId and returns ordered (topicId, correct, total)
/// rows. Topic order: most-attempted first, tie-break alphabetical.
List<({String topicId, int correct, int total})> computeTopicBreakdown(
  List<QuizItemSummary> items,
) {
  ...
}
```

Place this near the bottom of `vidya_practice_result_screen.dart`, file-private. Add a unit-test group for it (no widget pumping):

```dart
group('computeTopicBreakdown', () {
  test('groups items by topicId and counts correct/total', ...);
  test('orders by total descending, then topicId alphabetical', ...);
  test('handles empty list', ...);
});
```

- [ ] **Step 3: Implement the breakdown rendering** — between the big score and Done CTA, add:

```dart
if (_topicBreakdown.isNotEmpty) ...[
  const SizedBox(height: 32),
  Text(
    'BY TOPIC',
    style: TextStyle(
      fontFamily: VidyaFonts.mono,
      fontSize: 11,
      color: v.ink3,
      letterSpacing: 1.5,
    ),
  ),
  const SizedBox(height: 12),
  for (final row in _topicBreakdown) _TopicBreakdownRow(row: row),
],
```

Topic labels come from a single catalog fetch (batch endpoint if it exists, otherwise N parallel fetches; keep this defensive — the screen renders even if label lookup fails by showing the topicId).

- [ ] **Step 4: Add the Insights deep-link CTA** below the breakdown (above or sibling to Done):

```dart
TextButton(
  key: const Key('vidya.practice.result.see-insights'),
  onPressed: () {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => const VidyaInsightsScreen(),
    ));
  },
  child: const Text('See updated insights →'),
),
```

If `VidyaInsightsScreen` takes constructor params (e.g., `auth`), wire them — read its constructor signature first.

- [ ] **Step 5: All tests pass.** Suite target: ≈460.

- [ ] **Step 6: Commit.**

---

## Task 3: Verification gate

- [ ] `flutter analyze` clean on touched files
- [ ] Full mobile suite green
- [ ] APK builds
- [ ] **Manual smoke** (user-driven):
  - PRACTICE tab → Focused Practice → intro screen shows weakest topic name + EWA
  - Start focused session → 10 questions all on that topic
  - Complete → rich result screen shows per-topic breakdown (just the focused topic, in this case)
  - Tap "See updated insights →" → lands on Insights screen
  - Back → returns to result screen (NOT to Practice tab — that's only on Done)
  - Tap Done → back to Practice tab
  - Empty-state smoke: cold-start user with no answered items → Focused intro → "You don't have a weak topic yet" → Back

---

## Risk + mitigations

| Risk | Mitigation |
|---|---|
| `InsightsSnapshot.weakConcepts` may not be sorted weakest-first; backend contract unverified | Task 1 Step 1 — read `services/learning/src/learning/insights/snapshot.py` (or wherever the endpoint lives). If unsorted, sort by EWA ascending client-side. |
| Catalog `/catalog/topics/{id}` may not return a friendly title (could be slug) | Fall back to a humanised conceptId; never block the Start CTA on label resolution. |
| Per-topic breakdown could be misleading when target=1 topic (Focused mode) — the user just sees their one topic twice (in the eyebrow and as "the breakdown") | Acceptable; the breakdown is for Mock + future multi-topic mixes. For Focused, redundant but not wrong. Could hide breakdown when `len(breakdown) == 1` — leave as a v2.1 polish call. |
| `VidyaInsightsScreen` constructor surface unknown — may require `auth` or other context | Read its current signature; add params to the deep-link push as needed. If it requires substantial wiring, defer the CTA to v2.1 and ship breakdown-only in v2. |
| Mid-session offline error on Focused — empty stub responses + no snapshot | Identical to Quick's Phase 3f territory. Don't address here. |

---

## Acceptance summary

- Focused Practice card no longer shows a snackbar; instead pushes intro → session → rich result → Done.
- Rich result screen surfaces per-topic correctness breakdown (skipped when no items).
- "See updated insights →" CTA deep-links to `VidyaInsightsScreen`.
- Quick Practice flow remains unchanged (regression-tested by existing v1 tests).
- Mock Test card still shows snackbar with copy `coming in Phase 3c.full v3`.
- Aurora-shell soft-rollback flag untouched.

---

## What comes after v2

| Plan | Scope |
|---|---|
| Phase 3c.full v3 | Wire Mock Test (90-question timed run, exam-blueprint backed, OMR-style answer-sheet palette on the right rail mirroring web's `MockExam.tsx`). |
| Phase 3c.full v4 | θ-live readout card on session screen. Backend ask: expose `theta_estimate` + `next_q_b` + `theta_delta_since_start` on `/quiz/sessions/next`. |
| Phase 3f | Offline-during-session UX — surface `QuizOfflineQueue` state (Offline status row + "AI signal unavailable" notice). |
| Phase 3g | Aurora deletion sweep — depends on 3a–3f shipping + 1 week prod stability. |
