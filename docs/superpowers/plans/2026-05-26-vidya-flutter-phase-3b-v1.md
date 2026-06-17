# Phase 3b v1 — Vidya Study tab (subject list)

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3e v1 (More tab shipped). Per roadmap, replaces Aurora's `ProgressTab` with the Vidya Study screen.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace `VidyaStudyTabPlaceholder` with a real `VidyaStudyScreen` rendering the user's **subject list** for their active exam. Subject-detail screens are explicitly out of scope; tapping a subject in v1 shows a "coming soon" snackbar (defer to Phase 3b.full).

This is the **first real Vidya tab content** outside Home — the user finally sees something domain-specific (their exam's subjects) instead of a placeholder.

---

## Out of scope for Phase 3b v1 (deferred to Phase 3b.full)

- Per-subject mastery rollup (requires `mastery(userId)` join with topics-per-subject — extra fetches)
- Subject detail screen (the existing Aurora `concept_profile_screen.dart` is the legacy stand-in; native Vidya version is 3b.full)
- Topic list inside each subject card
- Chapter / concept hierarchy below topics (Phase 3b.full or later)
- Filtering / sorting subjects
- Pull-to-refresh

---

## Data sources (existing endpoints)

| Need | Endpoint | Returns |
|---|---|---|
| Active exam ID | `api.getProfile()` | `UserProfile.exams[0].examId` |
| Exam name (for screen title) | `api.exams()` | `List<Exam>` — resolve `id → name` |
| Subject list | `api.subjectsForExam(examId)` | `List<Subject>(id, name, topicCount)` |

All three are already used by `MainScaffold._bootstrap()`. No new endpoints.

---

## File map

**New:**
- `apps/mobile/lib/vidya/screens/vidya_study_screen.dart` — the v1 screen
- `apps/mobile/test/vidya/phase_3b_study_test.dart` — widget tests

**Modified:**
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — swap `VidyaStudyTabPlaceholder` for `VidyaStudyScreen`
- `apps/mobile/lib/vidya/screens/vidya_tab_placeholders.dart` — remove `VidyaStudyTabPlaceholder`
- `apps/mobile/test/vidya/phase_3a_shell_test.dart` — the "tapping STUDY shows the study placeholder" test needs updating to assert the real screen (drop the `'COMING SOON'` assertion; keep the byKey assertion)

---

## VidyaStudyScreen contract

```dart
class VidyaStudyScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaStudyScreen({super.key, required this.auth});
}
```

State machine:
```
init → loading → loaded(subjects) | empty(no exam selected) | error
```

Layout:
```
STUDY                              ← eyebrow
NEET                               ← active exam name (display, 32px)

┌────────────────────────────────┐
│ SUBJECT • 14 topics            │
│ Physics                        │
└────────────────────────────────┘

┌────────────────────────────────┐
│ SUBJECT • 17 topics            │
│ Chemistry                      │
└────────────────────────────────┘

…
```

Each subject card uses `VidyaCard` with `InkWell` for tap. Tap shows a snackbar `Subject detail coming in Phase 3b.full`.

---

## Task 1: `VidyaStudyScreen` + tests

- [ ] **Step 1: Failing tests** — `phase_3b_study_test.dart`:

```dart
testWidgets('loading state renders skeleton then content', (tester) async { … });
testWidgets('renders STUDY eyebrow + active exam name', (tester) async {
  // Mock /profile/me → exams: [{examId: 'e1'}]
  // Mock /catalog/exams → [{id:'e1', code:'NEET', name:'NEET UG'}]
  // Mock /catalog/exams/e1/subjects → 2 subjects
  expect(find.text('STUDY'), findsOneWidget);
  expect(find.text('NEET UG'), findsOneWidget);
});

testWidgets('renders each subject as a card with name + topic count',
    (tester) async {
  expect(find.text('Physics'), findsOneWidget);
  expect(find.textContaining('14 topics'), findsOneWidget);
});

testWidgets('tapping a subject shows the deferred snackbar', (tester) async {
  await tester.tap(find.text('Physics'));
  await tester.pump();
  expect(find.textContaining('coming in Phase 3b.full'), findsOneWidget);
});

testWidgets('empty state when user has no exams', (tester) async {
  // Mock /profile/me → exams: []
  expect(find.textContaining('No exam selected'), findsOneWidget);
});

testWidgets('error state when subjects fetch fails', (tester) async { … });
```

- [ ] **Step 2: Implementation skeleton**

```dart
class _StudyData {
  final String examName;
  final List<Subject> subjects;
  const _StudyData({required this.examName, required this.subjects});
}

enum _StudyState { loading, loaded, empty, error }

class _VidyaStudyScreenState extends State<VidyaStudyScreen> {
  _StudyState _state = _StudyState.loading;
  _StudyData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = ApiClient(widget.auth);
      final profile = await api.getProfile();
      final examId = profile?.exams.isNotEmpty == true
          ? profile!.exams.first.examId
          : null;
      if (examId == null) {
        setState(() => _state = _StudyState.empty);
        return;
      }
      // Two parallel fetches.
      final results = await Future.wait<Object>([
        api.exams(),
        api.subjectsForExam(examId),
      ]);
      final exams = results[0] as List<Exam>;
      final subjects = results[1] as List<Subject>;
      final examName = exams.firstWhere(
        (e) => e.id == examId,
        orElse: () => Exam(id: examId, code: '', name: 'Exam'),
      ).name;
      if (!mounted) return;
      setState(() {
        _data = _StudyData(examName: examName, subjects: subjects);
        _state = _StudyState.loaded;
      });
    } catch (_) {
      if (mounted) setState(() => _state = _StudyState.error);
    }
  }
}
```

- [ ] **Step 3: Render each state**: skeleton for loading (re-use `VidyaSkeletonBlock`), subject cards for loaded, friendly text + a "Choose your exam" CTA for empty, retry button for error.
- [ ] **Step 4: Verify tests pass**.
- [ ] **Step 5: Commit**.

---

## Task 2: Wire VidyaMainShell to use VidyaStudyScreen

**Files:**
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart`
- `apps/mobile/lib/vidya/screens/vidya_tab_placeholders.dart` — remove `VidyaStudyTabPlaceholder`
- `apps/mobile/test/vidya/phase_3a_shell_test.dart` — update STUDY tap test (no `'COMING SOON'` text on the real screen)

- [ ] **Step 1: Replace tab content** in vidya_main_shell.dart.
- [ ] **Step 2: Remove `VidyaStudyTabPlaceholder`** from vidya_tab_placeholders.dart.
- [ ] **Step 3: Update Phase 3a shell test** STUDY assertion (drop `'COMING SOON'`, keep byKey).
- [ ] **Step 4: Verify shell + study tests pass**.
- [ ] **Step 5: Commit**.

---

## Task 3: Verification gate

- [ ] Analyze + tests (mobile).
- [ ] APK build.
- [ ] Manual smoke (user-driven): tap STUDY → see subject list for the user's active exam → tap a subject → snackbar.
