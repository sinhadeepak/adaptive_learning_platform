# Phase 3c.full v3 — Mock Test (minimal slice)

**Status:** DRAFT — 2026-05-27
**Sequel to:** Phase 3c.full v2 (Focused mode + rich result, shipped 2026-05-27).
**Roadmap context:** [Vidya Mobile Design Roadmap](../specs/2026-05-25-vidya-mobile-design-roadmap.md) §Phase 3c. v1 plan: [`2026-05-27-vidya-flutter-phase-3c-full-v1.md`](2026-05-27-vidya-flutter-phase-3c-full-v1.md). v2 plan: [`2026-05-27-vidya-flutter-phase-3c-full-v2.md`](2026-05-27-vidya-flutter-phase-3c-full-v2.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Wire the **Mock Test** mode card end-to-end as a minimal slice:

1. Tap `Mock Test` → `VidyaMockIntroScreen` (new) shows the user's exam's first available blueprint (name, item count, total minutes, marking scheme).
2. Start → `VidyaMockSessionScreen` (new) — separate from the Quick/Focused session screen because Mock has different chrome (real countdown timer, section indicator, variable question count from blueprint).
3. Complete → `VidyaPracticeResultScreen` (existing, reused verbatim).
4. Mock card snackbar copy updates from `coming in Phase 3c.full v2` to `coming in Phase 3c.full v3.1` for any deferred state — actually, since this v3 ships Mock wiring, the snackbar branch is removed entirely.

After v3.v1: Quick + Focused + Mock all live end-to-end. The session screen variants are intentionally separate to keep each one's chrome cohesive.

---

## Why a separate `VidyaMockSessionScreen` (not a flag on the existing session screen)

Three reasons the chrome materially differs and justifies a sibling screen:

1. **Real countdown timer.** Quick/Focused use a decorative timer (re-renders on setState, no `Timer.periodic`) because the screening pattern avoided the `pumpAndSettle` deadlock. A 3-hour mock needs a real ticking timer — tests pump explicit durations rather than `pumpAndSettle`. Mixing the two patterns in one screen invites confusion.
2. **Section indicator + variable question count.** Quick is always 10 questions, no section. Mock has 75 / 90 / 54 questions across 1–3 sections depending on blueprint. The progress display is `'Question X of Y · Section <name>'` instead of `'X of 10'`.
3. **Future palette + section nav (v3.2).** The OMR-style palette and section-jump nav are Mock-only. Putting them on a shared screen behind feature flags becomes unwieldy.

Quick/Focused continue to use `VidyaPracticeSessionScreen` unchanged.

---

## Out of scope for v3.v1 (deferred)

| Deferred to | Item |
|---|---|
| v3.v2 | OMR-style sticky palette (5-col grid, color-coded per cell) — matches web `MockExam.tsx` |
| v3.v2 | Inter-section navigation + per-section counts strip |
| v3.v3 | Pause / resume mid-mock |
| v3.v3 | Auto-submit on timer expiry (today the user must manually submit) |
| v3.v3 | 5-min "time running out" warning |
| v3.v3 | Mark-for-review queue |
| Phase 3c.full v4 | θ-live readout (not applicable to MOCK_BLUEPRINT mode anyway — adaptive engine doesn't drive question selection in mock) |
| Future | Blueprint picker UI (today: auto-select the first blueprint for the user's exam) |
| Future | Multi-attempt support (`attemptIdx` is hardcoded to 0; the server supports re-attempts at different seeds) |

---

## Backend asks

**None new.** v3.v1 composes existing endpoints:

- `GET /catalog/exam-blueprints?examId=<id>` → returns `{ examId, items: [{ id, name, ... }] }`
- `POST /quiz/sessions/from-blueprint` → returns the rich `fromBlueprintResponse` shape (`sessionId`, `blueprintName`, `itemCount`, `totalMinutes`, `marksCorrect`, `marksNegative`, `short`, `sections: [...]`, etc.) — see `services/quiz/internal/server/sessions.go:521-558`
- `GET /quiz/sessions/{id}/next` → unchanged (questions pre-served by composer; `next` walks them in `position` order)
- `POST /quiz/sessions/{id}/answers` → unchanged
- `GET /quiz/sessions/{id}` → unchanged (result screen fetches this)

User's `examId` source: read from `User.examId` (or equivalent on `AuthClient.user`). Today the seeded test user has a default exam; production gates this via onboarding. **If the user has no examId, v3.v1 surfaces an empty-state** ("Mock tests unlock once you've selected your exam in onboarding.") instead of crashing.

---

## File map

**New:**

- `apps/mobile/lib/vidya/screens/vidya_mock_intro_screen.dart` — intro: fetch blueprints, render first one's metadata + Start CTA
- `apps/mobile/lib/vidya/screens/vidya_mock_session_screen.dart` — Mock session: real timer, section indicator at top, linear question flow
- `apps/mobile/test/vidya/phase_3c_full_v3_test.dart` — widget tests for the two new screens

**Modified:**

- `apps/mobile/lib/quiz/quiz_client.dart` — add `startFromBlueprint({blueprintId, userId, attemptIdx})` method; add `QuizSessionStartFromBlueprint` model with the rich response shape
- `apps/mobile/lib/api/api_client.dart` — add `examBlueprints(String examId)` method + `ExamBlueprint` model (if doesn't already exist; check first)
- `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart` — wire `_PracticeModeKind.mock` to push `VidyaMockIntroScreen` (analogous to Focused wiring). Remove the snackbar branch for `.mock`.
- `apps/mobile/test/vidya/phase_3c_practice_test.dart` — replace "Mock Test still shows snackbar" assertion with "Mock tap navigates to intro screen"

**Untouched:**

- `VidyaPracticeSessionScreen` (Quick/Focused) — Mock uses its own session screen
- `VidyaPracticeResultScreen` — reused as-is for Mock completion
- `VidyaFocusedIntroScreen` — sibling pattern; Mock intro is parallel but distinct (different metadata)
- `VidyaMainShell` — `_quizClient` and `_insightsClient` already threaded; no new client needed (ApiClient for blueprint fetch is constructed inline like in v2)

---

## VidyaMockIntroScreen contract

```dart
class VidyaMockIntroScreen extends StatefulWidget {
  final QuizClient client;
  final String userId;
  final String examId;
  /// Called when the user taps "Start mock test"; receives the
  /// blueprint id + name + total minutes + item count so the session
  /// screen can configure its chrome.
  final void Function({
    required String blueprintId,
    required String blueprintName,
    required int itemCount,
    required int totalMinutes,
  }) onStart;
  final VoidCallback onBack;

  const VidyaMockIntroScreen({
    super.key,
    required this.client,
    required this.userId,
    required this.examId,
    required this.onStart,
    required this.onBack,
  });
}
```

### Layout

```
✕
MOCK TEST                       ← eyebrow

JEE Main 2025 — Paper 1         ← blueprint name (large)

75 questions · 180 minutes
+4 / −1 marking · 3 sections

This is a full-length timed mock. Once you start, the
timer keeps running. Submit when you're done.

[ Start mock test ]
```

Loading: two `VidyaSkeletonBlock`s (eyebrow + name).
Empty (no blueprints for examId, or no examId on user): "Mock tests unlock once we have blueprints for your exam. Try Quick or Focused practice for now." + Back CTA.
Error: `VidyaBanner` with Retry.

---

## VidyaMockSessionScreen contract

```dart
class VidyaMockSessionScreen extends StatefulWidget {
  final QuizClient client;
  final String blueprintId;
  final String blueprintName;
  final String userId;
  final int itemCount;
  final int totalMinutes;
  /// Called when the session finishes (user submits or last question
  /// answered). Receives sessionId so the result screen can fetch.
  final void Function(String sessionId) onCompleted;
  final VoidCallback onBack;

  const VidyaMockSessionScreen({
    super.key,
    required this.client,
    required this.blueprintId,
    required this.blueprintName,
    required this.userId,
    required this.itemCount,
    required this.totalMinutes,
    required this.onCompleted,
    required this.onBack,
  });
}
```

### Layout

```
✕    JEE Main 2025 — Paper 1     02:54:12   ← AppBar: close, blueprint name, real countdown
─────────────────────────────────────────
[Section: Physics]                  3 / 75  ← section indicator + progress
─────────────────────────────────────────
A piston compresses an ideal gas... (stem)

◯ A. ...
◯ B. ...
◯ C. ...
◯ D. ...

[      Submit answer      ]
```

Timer is REAL: a `Timer.periodic(Duration(seconds: 1))` counts down `totalMinutes * 60` seconds. Tests use `tester.pump(Duration(...))` to advance — no `pumpAndSettle` (it would block on the periodic timer).

When timer reaches 0:0:0, the v3.v1 behavior is to **show a banner "Time's up — please submit"** but do NOT auto-submit. Auto-submit + manual-submit refinement land in v3.v3.

Section indicator: derive from `QuizNext.item` — the per-item `sectionId` (or fall back to "Section 1" if absent today). Section name lookup from the session-start response's `sections[]`.

---

## Task 1: `QuizClient.startFromBlueprint` + `ApiClient.examBlueprints`

**Files:**
- Modify: `apps/mobile/lib/quiz/quiz_client.dart`
- Modify: `apps/mobile/lib/api/api_client.dart` (if `examBlueprints` doesn't already exist)

- [ ] **Step 1: Read existing `QuizClient.start` and `ApiClient.exams`** to understand the conventions (request shape, error handling, model class shape).

- [ ] **Step 2: Add `QuizSessionStartFromBlueprint` model** in `quiz_client.dart`, mirroring `QuizSessionStart` but with the additional fields:

```dart
class QuizSessionStartFromBlueprint {
  final String sessionId;
  final String blueprintId;
  final String blueprintName;
  final String mode;       // always 'MOCK_BLUEPRINT'
  final String status;
  final DateTime expiresAt;
  final int itemCount;
  final int totalMinutes;
  final int marksCorrect;
  final double marksNegative;
  final bool short;
  final bool interSectionNavigation;
  final bool perSectionTimeLocked;
  final List<MockSection> sections;
  // ...fromJson...
}

class MockSection {
  final String sectionId;
  final String name;
  final int nRequested;
  final int nComposed;
  final bool short;
  // ...
}
```

- [ ] **Step 3: Add `startFromBlueprint(...)` method** that POSTs to `/quiz/sessions/from-blueprint` and parses the response. Error handling:
  - 404 `blueprint_not_found` → `QuizError('No mock blueprint found.', QuizErrorCode.unknown)`
  - 422 `empty_paper` → `QuizError('No questions available for this mock yet.', QuizErrorCode.emptyTopic)` (or a new code)
  - other non-2xx → generic error

- [ ] **Step 4: Add `ExamBlueprint` model + `ApiClient.examBlueprints(String examId)` method** — GET `/catalog/exam-blueprints?examId={id}`, parse `{ examId, items: [...] }` into `List<ExamBlueprint>`. Each `ExamBlueprint` has: `id, name, ` plus whatever the backend returns (read `services/learning/src/learning/exam_blueprints/routes.py:50` and the repo to confirm fields).

- [ ] **Step 5: Unit tests** for both new methods — extend `quiz_client_test.dart` (or wherever existing tests live) to assert the request shape + response parsing. If no existing test file, skip unit tests (the screen tests cover it via stubs).

- [ ] **Step 6: Commit.**

---

## Task 2: `VidyaMockIntroScreen`

**Files:**
- New: `apps/mobile/lib/vidya/screens/vidya_mock_intro_screen.dart`
- New: `apps/mobile/test/vidya/phase_3c_full_v3_test.dart` (skeleton — Task 3 extends)

- [ ] **Step 1: Failing widget tests** (5):

```dart
testWidgets('fetches blueprints on mount and renders first blueprint metadata',
    (tester) async {
  // Stub api.examBlueprints to return [{ id: 'bp-1', name: 'JEE Main 2025 — Paper 1', itemCount: 75, totalMinutes: 180, ... }]
  // Pump, assert blueprint name + "75 questions · 180 minutes" copy.
});

testWidgets('empty blueprints → empty-state copy + Back CTA', ...);

testWidgets('blueprint fetch error → VidyaBanner + Retry', ...);

testWidgets('Start CTA fires onStart with blueprint metadata', ...);

testWidgets('close ✕ fires onBack', ...);
```

Use a `_StubApiClient` (extends real `ApiClient`) for the `examBlueprints` call. Inject responses + errors as needed.

- [ ] **Step 2: Implement `VidyaMockIntroScreen`** mirroring `VidyaFocusedIntroScreen` lifecycle: `initState → _load() → fetch blueprints → setState`. Render loading skeleton → success → empty / error.

- [ ] **Step 3: All 5 tests pass.**

- [ ] **Step 4: Commit.**

---

## Task 3: `VidyaMockSessionScreen` + wire Mock Practice card

**Files:**
- New: `apps/mobile/lib/vidya/screens/vidya_mock_session_screen.dart`
- Modify: `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_3c_practice_test.dart`
- Extend: `apps/mobile/test/vidya/phase_3c_full_v3_test.dart`

- [ ] **Step 1: Failing widget tests** for `VidyaMockSessionScreen` (6):

```dart
testWidgets('starts session from blueprint on mount and shows Q1', ...);

testWidgets('countdown timer ticks down by 1 second', (tester) async {
  // Stub startFromBlueprint → totalMinutes=3 → screen shows "03:00".
  // tester.pump(Duration(seconds: 1)) → "02:59".
  // tester.pump(Duration(seconds: 1)) → "02:58".
});

testWidgets('timer expiry shows "Time's up" banner (no auto-submit)', ...);

testWidgets('progress shows Question X of Y · Section <name>', ...);

testWidgets('answer + next advances to next question', ...);

testWidgets('completion fires onCompleted with sessionId', ...);
```

Use a `_StubQuizClient` extending the real class — extend with `startFromBlueprintResponse`/`startFromBlueprintError` injection + `startFromBlueprintCalls` counter. Mirror the pattern from v1+v2 stubs.

- [ ] **Step 2: Implement `VidyaMockSessionScreen`** with:
  - `initState` → `client.startFromBlueprint(blueprintId, userId, attemptIdx=0)` → store `_session`, fetch first `next`
  - `Timer.periodic(Duration(seconds: 1))` → decrements `_remainingSeconds`. On 0, render the "Time's up" banner above the choices.
  - Section name lookup: from `_session.sections` matching the current question's `sectionId`. Fall back to `'Section 1'` if absent.
  - Answer flow: same as Quick/Focused (`answer` → `next`). On completion → `widget.onCompleted(sessionId)`.
  - On close (✕): show a confirm dialog "Exit mock? Your progress will be lost." → confirm pops, cancel stays. (Quick/Focused don't have this confirm because losing 10 questions is cheap; losing 75 is not.)
  - Real timer means `dispose()` must cancel the timer to prevent memory leaks.

- [ ] **Step 3: Wire `_PracticeModeKind.mock`** in `vidya_practice_screen.dart`:

```dart
case _PracticeModeKind.mock:
  final examId = client.auth.user?.examId;
  if (examId == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Pick your exam in onboarding to unlock mock tests.')),
    );
    return;
  }
  Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => VidyaMockIntroScreen(
      client: client,
      userId: client.auth.user!.id,
      examId: examId,
      onStart: ({
        required blueprintId,
        required blueprintName,
        required itemCount,
        required totalMinutes,
      }) {
        Navigator.of(context).pushReplacement(MaterialPageRoute(
          builder: (_) => VidyaMockSessionScreen(
            client: client,
            blueprintId: blueprintId,
            blueprintName: blueprintName,
            userId: client.auth.user!.id,
            itemCount: itemCount,
            totalMinutes: totalMinutes,
            onCompleted: (sessionId) {
              Navigator.of(context).pushReplacement(MaterialPageRoute(
                builder: (_) => VidyaPracticeResultScreen(
                  client: client,
                  sessionId: sessionId,
                  onDone: () => Navigator.of(context).pop(),
                ),
              ));
            },
            onBack: () => Navigator.of(context).pop(),
          ),
        ));
      },
      onBack: () => Navigator.of(context).pop(),
    ),
  ));
```

- [ ] **Step 4: Update `phase_3c_practice_test.dart`** — the existing "Mock Test still shows snackbar" test becomes:

```dart
testWidgets('Mock Test tap navigates to mock intro screen (when examId set)',
    (tester) async {
  // Stub AuthClient.user.examId = 'exam-jee-main'
  await tester.tap(find.text('Mock Test'));
  await tester.pumpAndSettle();
  expect(find.byType(VidyaMockIntroScreen), findsOneWidget);
});

testWidgets('Mock Test tap shows onboarding nudge when examId is null',
    (tester) async {
  // Stub AuthClient.user.examId = null
  await tester.tap(find.text('Mock Test'));
  await tester.pumpAndSettle();
  expect(find.textContaining('Pick your exam in onboarding'), findsOneWidget);
});
```

- [ ] **Step 5: All tests pass.** Target: ~470 mobile suite (was 464; +6 from this slice, +N from any new unit tests).

- [ ] **Step 6: Commit.**

---

## Task 4: Verification gate

- [ ] `flutter analyze` clean on touched files
- [ ] Full mobile suite green
- [ ] APK builds
- [ ] **Manual smoke** (user-driven):
  - PRACTICE tab → Mock Test → intro shows JEE Main 2025 metadata
  - Start mock test → session screen with real ticking timer + section indicator
  - Answer a few questions → progress increments
  - Wait until timer hits zero (or fast-forward via debug) → "Time's up" banner appears, but no auto-submit
  - Tap ✕ → confirm dialog → confirm exits to Practice landing
  - Restart, complete all 75 (or 5 — exit early for smoke) → result screen
  - Edge case: user without examId → Mock tap → onboarding nudge snackbar

---

## Risk + mitigations

| Risk | Mitigation |
|---|---|
| Backend `/catalog/exam-blueprints?examId=...` may return empty list (content gap) | Empty-state UX renders cleanly; no crash. |
| `from-blueprint` returns `422 empty_paper` (composer can't fill any section) | Surface as VidyaBanner with the honest message "No questions available for this mock yet." plus Retry. |
| Real `Timer.periodic` breaks `pumpAndSettle()` in tests | Use `tester.pump(Duration(...))` explicitly. Document in test file header. |
| Mock sessions are long-lived; user might background app for hours and timer pauses | v3.v1 accepts this — server's `expiresAt` is the authoritative deadline; local timer is decoration after backgrounding. v3.v3 considers a proper sync model. |
| `AuthClient.user.examId` field may not exist | Read the User class first. If absent, the Mock card surfaces an onboarding-nudge snackbar and we treat it as a known gap until profile carries the exam selection. |
| Question stem rendering for math/symbolic content (Mock includes more variety than Practice) | Reuse the existing `polymorphic_renderer.dart` if Quick/Focused does. If not, fall back to plain Text — acceptable for v3.v1 since most mock questions are MCQ-text-only. |
| `attemptIdx` hardcoded to 0 → user can't retry a mock with different seed | Acceptable for v3.v1; v3.v2+ can add a retry CTA. |

---

## Acceptance summary

- Mock Test card no longer shows snackbar (or only shows the onboarding-nudge variant); instead pushes intro → session → result.
- Real countdown timer ticks every second; expires gracefully with banner.
- Exit confirm dialog protects against accidental ✕.
- Quick + Focused flows unchanged (regression-tested by existing tests).
- Aurora-shell soft-rollback flag untouched.
- No backend changes shipped in this slice.

---

## What comes after v3.v1

| Plan | Scope |
|---|---|
| Phase 3c.full v3.v2 | OMR-style sticky palette (5-col grid color-coded per cell) + inter-section navigation + per-section counts strip. Mirrors web's `MockExam.tsx`. |
| Phase 3c.full v3.v3 | Pause/resume mid-mock, auto-submit on timer expiry, 5-min "time running out" warning, mark-for-review queue. |
| Phase 3c.full v3.v4 | Blueprint picker UI (today: auto-select first; v3.v4 lets the user choose between Paper 1 / Paper 2 / etc.) + multi-attempt support. |
| Phase 3c.full v4 | θ-live overlay — though arguably not applicable to MOCK_BLUEPRINT mode since adaptive engine doesn't drive selection there. Probably ends up Quick + Focused only. |
| Phase 3f | Offline-during-session UX. Mock + Offline together is gnarly (long sessions, mid-session disconnect) — Phase 3f explicitly addresses this. |
| Phase 3g | Aurora deletion sweep — depends on 3a–3f shipping + 1wk prod stability. Aurora's `mock_test_screen.dart` and `mock_result_screen.dart` are deleted then. |
