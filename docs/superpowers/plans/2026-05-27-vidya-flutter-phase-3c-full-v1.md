# Phase 3c.full v1 — Vidya Practice session (Quick mode)

**Status:** DRAFT — 2026-05-27
**Sequel to:** Phase 3c v1 (Practice tab landing — three mode cards with snackbar stubs).
**Roadmap context:** [Vidya Mobile Design Roadmap](../specs/2026-05-25-vidya-mobile-design-roadmap.md) §Phase 3c.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Why this phase next (not Phase 3f)

The 9-phase roadmap names Phase 3f (offline practice) as the next sequential phase, but Phase 3c shipped only as a **landing** screen — tapping any of the three mode cards (`Quick / Focused / Mock`) currently shows a snackbar:

```dart
'${m.title} session is coming in Phase 3c.full.'
```

So the actual Vidya practice session does not yet exist; offline practice (Phase 3f) is downstream of it. Phase 3c.full closes that gap first.

---

## Goal

Wire the **Quick Practice** card end-to-end:

1. Tap `Quick Practice` → push `VidyaPracticeSessionScreen` (new).
2. Session screen calls `QuizClient.start({mode: 'PRACTICE', count: 10})` on init, then loops `next → answer → next` until the session completes.
3. On completion → push `VidyaPracticeResultScreen` (new, minimal — score + CTA back to Practice tab).
4. The other two mode cards (`Focused`, `Mock`) keep the existing snackbar stub; they ship in v2 (Focused) and v3 (Mock).

The visual chrome mirrors `VidyaScreeningQuizScreen` (Phase 2c + 2f) so users get a consistent quiz UX whether they're in screening or practice.

---

## Out of scope for Phase 3c.full v1 (deferred)

| Deferred to | Item |
|---|---|
| Phase 3c.full v2 | Focused Practice mode card wired (filters by weak topics) |
| Phase 3c.full v3 | Mock Test mode card wired (90-question timed run) |
| Phase 3c.full v2 | θ-live readout card — requires backend exposing `theta_estimate` + `next_q_b` on `/quiz/sessions/next` (analogous to what Phase 2f did for `/screening/{token}/next`) |
| Phase 3c.full v2 | Rich result screen (sub-topic breakdown, mistake patterns, "go to Insights" deep link) |
| Phase 3f | Offline-during-session UX (offline banner, "AI signal unavailable" notice). The existing `QuizOfflineQueue` continues to drain transparently — v1 just doesn't surface its state. |
| Future | Resume-in-progress UI (cold-launching with an unfinished session) |

These exclusions keep v1 the smallest correct slice that proves the wiring works.

---

## File map

**New:**

- `apps/mobile/lib/vidya/screens/vidya_practice_session_screen.dart` — the session quiz loop
- `apps/mobile/lib/vidya/screens/vidya_practice_result_screen.dart` — minimal result page
- `apps/mobile/test/vidya/phase_3c_full_practice_test.dart` — widget tests

**Modified:**

- `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart` — `_onModeTap` for `Quick Practice` pushes the new session screen; the other two modes keep the snackbar (no regression to their existing behaviour)
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — pass `QuizClient` down to `VidyaPracticeScreen` (it currently has no client dependency)
- `apps/mobile/test/vidya/phase_3c_practice_test.dart` — update the `Quick Practice tap` assertion: it now navigates instead of showing a snackbar

---

## VidyaPracticeSessionScreen contract

```dart
class VidyaPracticeSessionScreen extends StatefulWidget {
  final QuizClient client;
  /// Mode passed to QuizClient.start. v1 only uses PRACTICE; later
  /// slices may parameterise on `subjectId` (Focused) or `mode: MOCK`.
  final QuizSessionMode mode;
  final int questionCount;
  /// Called when the session finishes (completed all questions). The
  /// sessionId is needed for the result screen to fetch the summary.
  final void Function(String sessionId) onCompleted;
  final VoidCallback onBack;

  const VidyaPracticeSessionScreen({
    super.key,
    required this.client,
    this.mode = QuizSessionMode.practice,
    this.questionCount = 10,
    required this.onCompleted,
    required this.onBack,
  });
}
```

Stateful so we can hold the active `sessionId`, the current `QuizNext` payload, and the loading/error states across `next → answer → next` cycles.

### Layout

Mirror `VidyaScreeningQuizScreen` chrome closely so visual muscle memory transfers:

```
┌────────────────────────────────────────────┐
│ ✕   PRACTICE · Quick      3 of 10   12:48  │  ← AppBar: close X, eyebrow, progress, timer
├────────────────────────────────────────────┤
│ [4 marks]  [b · 0.71]  [Physics · Thermo]  │  ← metadata pill row
│                                              │
│ A piston compresses an ideal gas...          │  ← question stem
│                                              │
│ ◯ A. ...                                     │
│ ◯ B. ...                                     │
│ ◯ C. ...                                     │
│ ◯ D. ...                                     │
│                                              │
│ ┌─θ readout card (deferred to v2)─────────┐ │
│ │  (this slot is reserved; renders nothing │ │
│ │  in v1)                                  │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│           [    Submit answer    ]            │
└────────────────────────────────────────────┘
```

Timer is decorative (same convention as `VidyaScreeningQuizScreen` — re-renders on `setState`, no `Timer.periodic` to avoid the `pumpAndSettle` deadlock).

---

## Task 1: `VidyaPracticeSessionScreen` — happy-path quiz loop

**Files:**
- New: `apps/mobile/lib/vidya/screens/vidya_practice_session_screen.dart`
- New: `apps/mobile/test/vidya/phase_3c_full_practice_test.dart`

- [ ] **Step 1: Failing widget tests** — `phase_3c_full_practice_test.dart`:

  ```dart
  testWidgets('starts a session on mount and shows first question',
      (tester) async {
    final client = _StubQuizClient(
      onStart: () => QuizSessionStart(sessionId: 'sess-1', ...),
      questions: [_q(stem: 'What is 2+2?', choices: ['3','4','5','6']) ],
    );
    await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
      client: client,
      onCompleted: (_) {},
      onBack: () {},
    )));
    await tester.pumpAndSettle();
    expect(find.text('What is 2+2?'), findsOneWidget);
    expect(find.text('1 of 10'), findsOneWidget);
  });

  testWidgets('answer + next advances to next question', ...);

  testWidgets('completion fires onCompleted with sessionId', ...);

  testWidgets('network error shows VidyaBanner + Retry', ...);

  testWidgets('close (✕) fires onBack', ...);
  ```

  Use a `_StubQuizClient` that records calls and returns canned payloads —
  same pattern as `_StubScreeningClient` in `phase_2c_screening_test.dart`.

- [ ] **Step 2: Implement** `VidyaPracticeSessionScreen`:
  - `initState`: call `client.start(...)`, store `sessionId`, fetch first `next`.
  - On `Submit answer` tap: call `client.answer(sessionId, itemIdx, selectedIdx)`, then `client.next(sessionId)`. If `next` returns "session complete", call `widget.onCompleted(sessionId)`.
  - Errors surface in a `VidyaBanner` with a Retry CTA (reuse the pattern from `VidyaScreeningQuizScreen._error`).
  - Close (`✕`) calls `widget.onBack` (caller decides — usually `Navigator.pop`).

- [ ] **Step 3: All 5 widget tests pass.**

- [ ] **Step 4: Commit.**

---

## Task 2: `VidyaPracticeResultScreen` — minimal score page

**Files:**
- New: `apps/mobile/lib/vidya/screens/vidya_practice_result_screen.dart`

This is intentionally barebones — the rich result UI lands in v2. Goal here is just to close the loop so the user has somewhere to land after the last question.

- [ ] **Step 1: Failing tests** — add to `phase_3c_full_practice_test.dart`:

  ```dart
  testWidgets('renders score from fetched session summary', (tester) async {
    final client = _StubQuizClient(
      summary: QuizSession(sessionId: 'sess-1', score: 7, total: 10, ...),
    );
    await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
      client: client,
      sessionId: 'sess-1',
      onDone: () {},
    )));
    await tester.pumpAndSettle();
    expect(find.text('7 / 10'), findsOneWidget);
  });

  testWidgets('Done CTA fires onDone', ...);
  ```

- [ ] **Step 2: Implement** `VidyaPracticeResultScreen`:
  - On init: `client.session(sessionId)` → fetch the summary.
  - Renders eyebrow `PRACTICE COMPLETE`, big score `${score} / ${total}`, single CTA `Done` → `onDone`.
  - No subtopic breakdown, no Insights deep link (both deferred to v2).

- [ ] **Step 3: Tests pass.**

- [ ] **Step 4: Commit.**

---

## Task 3: Wire `VidyaPracticeScreen` Quick card → session → result

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_practice_screen.dart`
- Modify: `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` (thread `QuizClient` through to Practice tab)
- Modify: `apps/mobile/test/vidya/phase_3c_practice_test.dart` (update Quick-tap assertion)

- [ ] **Step 1: Thread `QuizClient` into `VidyaPracticeScreen`**:

  `VidyaPracticeScreen` becomes:
  ```dart
  class VidyaPracticeScreen extends StatelessWidget {
    final QuizClient client;
    const VidyaPracticeScreen({super.key, required this.client});
    ...
  }
  ```

  In `VidyaMainShell`, instantiate (or accept) a `QuizClient` and pass it
  to the Practice tab Container. Use the same `auth` instance the shell
  already has, since `QuizClient` takes an `AuthClient` in its
  constructor.

- [ ] **Step 2: Replace `_onModeTap` for Quick Practice**:

  ```dart
  void _onModeTap(BuildContext context, _Mode m) {
    if (m.title == 'Quick Practice') {
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => VidyaPracticeSessionScreen(
          client: client,
          mode: QuizSessionMode.practice,
          questionCount: 10,
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
      return;
    }
    // Focused + Mock keep the snackbar stub.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${m.title} session is coming in Phase 3c.full v2.')),
    );
  }
  ```

  (Note: snackbar copy updated from `Phase 3c.full` to `Phase 3c.full v2` since v1 ships Quick.)

- [ ] **Step 3: Update Phase 3c test** for the new Quick behaviour:

  ```dart
  testWidgets('Quick Practice tap navigates to session screen',
      (tester) async {
    await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub)));
    await tester.tap(find.text('Quick Practice'));
    await tester.pumpAndSettle();
    expect(find.byType(VidyaPracticeSessionScreen), findsOneWidget);
  });

  testWidgets('Focused Practice still shows snackbar', ...);
  testWidgets('Mock Test still shows snackbar', ...);
  ```

- [ ] **Step 4: Commit.**

---

## Task 4: Verification gate

- [ ] `flutter analyze` clean on `apps/mobile/`.
- [ ] All mobile tests pass: `flutter test` (target: existing 347+5+2+5 ≈ 359/359 passing).
- [ ] APK builds: `flutter build apk --debug` (no new errors vs current main).
- [ ] **Manual smoke** (user-driven on a real device or emulator):
  - Tap PRACTICE tab → Quick Practice card.
  - Answer 10 questions (any choices).
  - Verify Result screen shows `X / 10` (matches actual correct count).
  - Tap Done → back to Practice landing.
  - Tap Focused Practice → snackbar (no navigation).
  - Tap Mock Test → snackbar (no navigation).
  - Tap Quick → mid-session ✕ → returns to Practice landing without crashing.

---

## Risk + mitigations

| Risk | Mitigation |
|---|---|
| `QuizClient.start` API surface for `mode: PRACTICE` may differ from screening (start takes a different signature). | Read `quiz_client.dart` line 12 (`Future<QuizSessionStart> start({...})`) during Task 1 Step 1 before writing tests. If the signature doesn't expose what we need, the plan changes to "thin wrapper helper" — note in the commit. |
| Existing Phase 3c test assertion `Quick Practice → snackbar 'coming in Phase 3c.full'` will break. | Step 3 of Task 3 explicitly replaces that assertion. CI is the safety net. |
| `VidyaMainShell` doesn't currently take a `QuizClient` — adding it changes the shell constructor. | Either: (a) accept the breaking change in `_VidyaRootAppState` (single caller, easy fix), or (b) construct `QuizClient` lazily inside Practice tab from the existing `auth` instance. Option (b) is slightly less testable but ships without touching shell. Pick whichever the implementer finds cleaner at Step 1 of Task 3. |
| User taps ✕ mid-quiz — answers already given are lost (no resume in v1). | Out-of-scope for v1. Document in commit message. Will be addressed when offline-resume lands in Phase 3f. |

---

## Acceptance summary

- Quick Practice flows end-to-end: tap card → answer 10 questions → see score → back to Practice tab.
- Focused + Mock are unchanged (still snackbar).
- All existing tests pass + new ones added.
- APK builds.
- Aurora-shell soft-rollback flag remains functional (we didn't touch `VidyaMainShell.home` case beyond threading `QuizClient`).

---

## What comes after v1

| Plan | Scope |
|---|---|
| Phase 3c.full v2 | Wire Focused Practice (filters by weak topics from analytics). Also: rich result screen with subtopic breakdown + Insights deep link. |
| Phase 3c.full v3 | Wire Mock Test (90-question timed, exam-blueprint backed). Sticky bottom palette like web `MockExam.tsx`. |
| Phase 3c.full v4 | θ-live readout card on session screen. Backend ask: expose `theta_estimate` + `next_q_b` + `theta_delta_since_start` on `/quiz/sessions/next` response. |
| Phase 3f | Offline-during-session UX — surface `QuizOfflineQueue` state ("Offline · saved to sync queue" status row + "AI signal unavailable offline" notice). The queue already exists at `apps/mobile/lib/quiz/quiz_offline_queue.dart` — this phase wraps the Vidya chrome around its existing behaviour. |
| Phase 3g | Aurora deletion sweep — depends on 3a–3f shipping + 1 week of prod stability. |
