# Phase 3b.full v2 — Topic detail screen

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3b.full v1 (Subject detail screen + Navigator.push pattern shipped).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace the Phase 3b.full v1 snackbar (`Topic detail for X is coming...`) with a real `VidyaTopicDetailScreen`. Second-level Navigator push inside the Vidya shell — Study tab → Subject detail → Topic detail. Stateless because the parent already has the `Topic` object and the EWA from its `_DetailData.ewaByTopic` map; pass them through as constructor params, zero fetches.

Adds two affordances on the topic detail page:
- **Practice this topic** button → snackbars until Phase 3c.full v1 wires real session start
- A **Concept summary** placeholder card explaining what 3b.full v3 will bring (concept tree, prerequisite map, common pitfalls)

---

## Out of scope for Phase 3b.full v2 (deferred to v3)

- Concept hierarchy below topics (concept profile equivalent)
- Topic-specific question history
- "Last attempted" timestamp / streak per topic
- Prerequisite map visualisation
- Real Practice-this-topic session (depends on Phase 3c.full v1)

---

## File map

**New:**
- `apps/mobile/lib/vidya/screens/vidya_topic_detail_screen.dart`
- `apps/mobile/test/vidya/phase_3b_full_topic_detail_test.dart`

**Modified:**
- `apps/mobile/lib/vidya/screens/vidya_subject_detail_screen.dart` — replace snackbar with Navigator.push to topic detail (pass `Topic` + EWA)
- `apps/mobile/test/vidya/phase_3b_full_subject_detail_test.dart` — update "tap topic" test to assert navigation rather than snackbar

---

## VidyaTopicDetailScreen contract

```dart
class VidyaTopicDetailScreen extends StatelessWidget {
  final Topic topic;
  final double ewa;
  const VidyaTopicDetailScreen({
    super.key,
    required this.topic,
    required this.ewa,
  });
}
```

Zero state, zero fetches. Renders:

```
[←] MECHANICS                       ← AppBar with back arrow
                                     
DEVELOPING • 0.52                   ← bucket label + EWA (mono, ink3)

Mechanics                            ← display 32px
14 questions in this topic           ← body, ink2

┌──────────────────────────────────┐
│ [Practice this topic]            │  ← VidyaButton md, accent
└──────────────────────────────────┘

┌─────────────────────────────────────┐
│ COMING IN PHASE 3b.full v3           │
│ Concept tree, prerequisite map, and  │
│ common pitfalls for this topic.      │
└─────────────────────────────────────┘
```

Bucket label rules mirror Insights / Subject detail:
- `ewa >= 0.70` → "STRONG"
- `ewa >= 0.40` → "DEVELOPING"
- `ewa > 0` → "WEAK"
- `ewa == 0` → "NOT STARTED"

---

## Task 1: VidyaTopicDetailScreen + tests

- [ ] **Step 1: Failing tests** — `phase_3b_full_topic_detail_test.dart`:

```dart
testWidgets('renders topic title in AppBar', (tester) async { … });
testWidgets('renders bucket label + EWA value sub-header', (tester) async {
  // For ewa=0.52 → 'DEVELOPING • 0.52'
});
testWidgets('renders title + question count', (tester) async { … });
testWidgets('Practice this topic shows the deferred snackbar', (tester) async {
  await tester.tap(find.text('Practice this topic'));
  await tester.pump();
  expect(find.textContaining('coming in Phase 3c.full'), findsOneWidget);
});
testWidgets('shows COMING IN PHASE 3b.full v3 placeholder', (tester) async {
  expect(find.text('COMING IN PHASE 3b.full v3'), findsOneWidget);
});
```

- [ ] **Step 2: Implementation** — stateless screen, `VidyaScaffold` + `VidyaAppBar` (mirroring subject detail), bucket helper duplicated inline (4th use — abstract when 5th appears).
- [ ] **Step 3: Verify tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 2: Update VidyaSubjectDetailScreen tap → Navigator.push

- [ ] **Step 1: Update tap handler** in `vidya_subject_detail_screen.dart`:

```dart
void _onTopicTap(Topic t) {
  final ewa = _data?.ewaByTopic[t.id] ?? 0.0;
  Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => VidyaTopicDetailScreen(topic: t, ewa: ewa),
  ));
}
```

- [ ] **Step 2: Update test** — `phase_3b_full_subject_detail_test.dart` "tap topic" test asserts push happened (e.g., the topic title appears in the topic-detail layout) rather than snackbar.
- [ ] **Step 3: Verify all tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 3: Verification gate

- [ ] Analyze + tests.
- [ ] APK build.
- [ ] Manual smoke: STUDY → Physics → Mechanics → see topic detail → back arrow → Physics → back arrow → STUDY.
