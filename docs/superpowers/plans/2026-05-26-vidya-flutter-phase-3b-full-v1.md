# Phase 3b.full v1 — Subject detail screen

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3b v1 (Study subject list shipped).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace the Phase 3b v1 snackbar (`Subject detail for X is coming in Phase 3b.full`) with a real `VidyaSubjectDetailScreen` reachable via `Navigator.push`. The detail screen shows the subject's topic list with per-topic mastery dots (Strong / Developing / Weak / Not Started) — using the same EWA bucketing as `VidyaInsightsScreen`.

This is the first real navigator push inside the Vidya shell, which validates the broader navigation pattern for downstream phases (3c.full's practice session screen, 3d.full's topic detail, etc.).

---

## Out of scope for Phase 3b.full v1 (deferred to Phase 3b.full v2)

- Topic detail screen (concept profile equivalent) — tap topic still snackbars
- Topic-level question count breakdown
- Subject-level mastery rollup (aggregate across topics)
- Last-attempted timestamp per topic
- Filtering by mastery bucket
- "Resume this subject" CTA (needs adaptive engine integration)

---

## Data sources (existing)

| Need | Endpoint | Returns |
|---|---|---|
| Topics in subject | `api.topicsForSubject(subjectId)` | `List<Topic>(id, subjectId, title, questionCount, tier)` |
| Per-topic mastery | `api.mastery(userId)` | `List<TopicMastery>(topicId, ewa, n)` |

Two parallel fetches → join on `topicId`.

---

## File map

**New:**
- `apps/mobile/lib/vidya/screens/vidya_subject_detail_screen.dart`
- `apps/mobile/test/vidya/phase_3b_full_subject_detail_test.dart`

**Modified:**
- `apps/mobile/lib/vidya/screens/vidya_study_screen.dart` — replace snackbar tap with `Navigator.push` to detail screen
- `apps/mobile/test/vidya/phase_3b_study_test.dart` — update "tap subject shows snackbar" test to assert navigation instead

---

## Design

```
[←] PHYSICS                          ← AppBar with back arrow
                                     
14 topics                            ← sub-header (mono, ink3)

┌────────────────────────────────┐
│ ● 5 questions                  │  ← bucket dot + question count eyebrow
│ Mechanics & Kinematics         │  ← topic title (display, 20px)
└────────────────────────────────┘

┌────────────────────────────────┐
│ ● 7 questions                  │
│ Thermodynamics                 │
└────────────────────────────────┘

…
```

Bucket dot colour mirrors `VidyaInsightsScreen`:
- `theme.good` for STRONG (EWA ≥ 0.70)
- `theme.info` for DEVELOPING (0.40–0.69)
- `theme.bad` for WEAK (0.01–0.39)
- `theme.ink3` for NOT STARTED (EWA = 0 or no mastery row)

Tap topic → snackbar `Topic detail coming in Phase 3b.full v2.`.

---

## Task 1: VidyaSubjectDetailScreen + tests

- [ ] **Step 1: Failing tests** — `phase_3b_full_subject_detail_test.dart`:

```dart
testWidgets('renders subject name in AppBar', (tester) async { … });
testWidgets('renders topic count sub-header', (tester) async { … });
testWidgets('renders each topic as a card with bucket dot + title',
    (tester) async {
  // Mock topics → 2 topics; mock mastery with 1 strong + 1 weak
  expect(find.text('Mechanics'), findsOneWidget);
  expect(find.text('Thermodynamics'), findsOneWidget);
});

testWidgets('tap topic shows deferred snackbar', (tester) async {
  await tester.tap(find.text('Mechanics'));
  await tester.pump();
  expect(find.textContaining('coming in Phase 3b.full v2'), findsOneWidget);
});

testWidgets('empty state when topics list is empty', (tester) async { … });
testWidgets('error state when fetch fails', (tester) async { … });
```

- [ ] **Step 2: Implementation skeleton**

```dart
class _SubjectDetailData {
  final List<Topic> topics;
  final Map<String, double> ewaByTopic; // topicId → EWA (0 if missing)
  const _SubjectDetailData({required this.topics, required this.ewaByTopic});
}

class _VidyaSubjectDetailScreenState extends State<VidyaSubjectDetailScreen> {
  _StudyState _state = _StudyState.loading;
  _SubjectDetailData? _data;

  Future<void> _load() async {
    final api = ApiClient(widget.auth);
    final user = widget.auth.user;
    if (user == null) {
      setState(() => _state = _StudyState.empty);
      return;
    }
    try {
      final results = await Future.wait<Object>([
        api.topicsForSubject(widget.subject.id),
        api.mastery(user.id),
      ]);
      final topics = results[0] as List<Topic>;
      final mastery = results[1] as List<TopicMastery>;
      final ewaByTopic = {for (final m in mastery) m.topicId: m.ewa};
      if (topics.isEmpty) {
        setState(() => _state = _StudyState.empty);
        return;
      }
      setState(() {
        _data = _SubjectDetailData(topics: topics, ewaByTopic: ewaByTopic);
        _state = _StudyState.loaded;
      });
    } catch (_) {
      setState(() => _state = _StudyState.error);
    }
  }
}
```

Uses same `_StudyState` enum or its own — pick whatever's cleaner.

- [ ] **Step 3: Bucket-dot helper** lifted from `VidyaInsightsScreen.fromMastery` logic — extract into a small private helper or duplicate the 6 lines (duplication is fine here; abstraction can come when a 3rd screen needs it).
- [ ] **Step 4: Verify tests pass**.
- [ ] **Step 5: Commit**.

---

## Task 2: Update VidyaStudyScreen tap → Navigator.push

- [ ] **Step 1: Update tap handler** in `vidya_study_screen.dart`:

```dart
void _onSubjectTap(Subject s) {
  Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => VidyaSubjectDetailScreen(auth: widget.auth, subject: s),
  ));
}
```

- [ ] **Step 2: Update test** in `phase_3b_study_test.dart` — replace the snackbar assertion with a Navigator-push assertion (or test that the detail screen renders after tap).
- [ ] **Step 3: Verify all study tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 3: Verification gate

- [ ] Analyze + tests.
- [ ] APK build.
- [ ] Manual smoke: STUDY → tap Physics → detail screen with topic list and bucket dots → back arrow → study list.
