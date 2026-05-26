# Phase 3e v1 — Vidya More tab (minimal)

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 3a.3 (Vidya home complete on the client side).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

---

## Goal

Replace the Phase 3a `VidyaMoreTabPlaceholder` (which currently has only a Sign out button) with a real **More tab v1** containing:

1. **Profile header** — avatar (initial) + firstName + email (read-only; editing comes in Phase 3e.full).
2. **Aurora-shell rollback toggle** — surfaces the `vidya.use_aurora_shell` flag from Phase 3a Task 1 as a real UI switch. Flipping it writes the flag and shows a "Restart app to apply" snackbar.
3. **Sign out** — existing behaviour.

This makes the soft-rollback flag (currently a hidden storage key) into something the user can actually flip from inside the app — useful during the Phase 3a → 3g migration window, and removable in Phase 3g alongside the rest of the Aurora cleanup.

---

## Out of scope for Phase 3e v1 (deferred)

| Deferred to | Item |
|---|---|
| Phase 3e.full | Editable profile (firstName/lastName/avatar upload) |
| Phase 3e.full | Notification preferences |
| Phase 3e.full | Language toggle (EN/हि) |
| Phase 3e.full | Daily goal setting |
| Phase 3e.full | Linked exams + target date |
| Phase 3e.full | Theme mode toggle (needs piping the `VidyaThemeModeNotifier` from `VidyaRootApp` through `VidyaMainShell`) |
| 3a.X | Real notifications screen behind the bell |

The theme toggle is deferred deliberately — it requires plumbing the existing `VidyaThemeModeNotifier` from `_VidyaRootAppState` through `VidyaMainShell` as a constructor param. That's a small but real refactor that's better done together with persona+density toggles in Phase 3e.full.

---

## File map

**New:**
- `apps/mobile/lib/vidya/screens/vidya_more_screen.dart` — the v1 More tab
- `apps/mobile/test/vidya/phase_3e_more_test.dart` — widget tests

**Modified:**
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — replace `VidyaMoreTabPlaceholder` with `VidyaMoreScreen` (still passes `onSignOut`)
- `apps/mobile/lib/vidya/screens/vidya_tab_placeholders.dart` — remove `VidyaMoreTabPlaceholder` (or keep with deprecation note; for v1 just remove since it's only referenced once)
- `apps/mobile/test/vidya/phase_3a_shell_test.dart` — update the "Sign out fires onSignOut" assertion if its text/widget changed

---

## VidyaMoreScreen contract

```dart
class VidyaMoreScreen extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onSignOut;
  const VidyaMoreScreen({super.key, required this.auth, required this.onSignOut});
}
```

Stateful so the Aurora-shell toggle can re-read its initial value from secure storage and reflect mid-session flips. Otherwise the screen is a passive list — no fetches.

### Layout

```
┌───────────────────────────────────────────┐
│ MORE                                       │  ← eyebrow (mono, ink3, letter-spaced)
│                                            │
│ ┌─Profile header card─────────────────┐  │
│ │  [A]  Aarav                          │  │  ← avatar (40) + firstName + email
│ │       a@b.com                        │  │
│ └─────────────────────────────────────┘   │
│                                            │
│ DEVELOPER                                  │  ← section eyebrow
│ ┌─────────────────────────────────────┐   │
│ │ Use Aurora shell      [○ ◉]         │  │  ← Switch widget
│ │ Switches the post-auth shell back   │  │  ← help text
│ │ to the legacy Aurora bottom-nav.     │   │
│ │ Restart app to apply.                │   │
│ └─────────────────────────────────────┘   │
│                                            │
│ ACCOUNT                                    │
│ ┌─Sign out────────────────────────────┐   │
│ │ Sign out                       [→]   │  │  ← tap row
│ └─────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

The 3 sections use `_Section(eyebrow, child)` for consistent spacing.

---

## Task 1: `VidyaMoreScreen`

- [ ] **Step 1: Failing tests** — `phase_3e_more_test.dart`:

```dart
testWidgets('renders profile header with firstName + email', (tester) async {
  final auth = await _loggedInAuth(...);
  await tester.pumpWidget(_harness(VidyaMoreScreen(auth: auth, onSignOut: () {})));
  await tester.pumpAndSettle();
  expect(find.text('Aarav'), findsOneWidget);
  expect(find.text('a@b.com'), findsOneWidget);
  expect(find.text('A'), findsOneWidget); // avatar initial
});

testWidgets('Aurora-shell switch reflects existing flag value', (tester) async {
  FlutterSecureStorage.setMockInitialValues({'vidya.use_aurora_shell': 'true'});
  final auth = await _loggedInAuth(...);
  await tester.pumpWidget(_harness(VidyaMoreScreen(auth: auth, onSignOut: () {})));
  await tester.pumpAndSettle();
  final sw = tester.widget<Switch>(find.byType(Switch));
  expect(sw.value, isTrue);
});

testWidgets('flipping Aurora-shell switch writes the storage key', (tester) async {
  FlutterSecureStorage.setMockInitialValues({}); // flag absent
  final auth = await _loggedInAuth(...);
  await tester.pumpWidget(_harness(VidyaMoreScreen(auth: auth, onSignOut: () {})));
  await tester.pumpAndSettle();
  await tester.tap(find.byType(Switch));
  await tester.pumpAndSettle();
  const storage = FlutterSecureStorage();
  expect(await storage.read(key: 'vidya.use_aurora_shell'), 'true');
});

testWidgets('Sign out row fires onSignOut', (tester) async {
  var signOuts = 0;
  await tester.pumpWidget(_harness(VidyaMoreScreen(
    auth: await _loggedInAuth(...),
    onSignOut: () => signOuts++,
  )));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Sign out'));
  await tester.pumpAndSettle();
  expect(signOuts, 1);
});
```

- [ ] **Step 2: Implementation skeleton**

```dart
class _VidyaMoreScreenState extends State<VidyaMoreScreen> {
  static const _storage = FlutterSecureStorage();
  static const _useAuroraShellKey = 'vidya.use_aurora_shell';
  bool _useAuroraShell = false;

  @override
  void initState() {
    super.initState();
    _loadFlag();
  }

  Future<void> _loadFlag() async {
    final v = await _storage.read(key: _useAuroraShellKey);
    if (!mounted) return;
    setState(() => _useAuroraShell = v == 'true');
  }

  Future<void> _toggleAuroraShell(bool next) async {
    await _storage.write(
      key: _useAuroraShellKey,
      value: next ? 'true' : 'false',
    );
    if (!mounted) return;
    setState(() => _useAuroraShell = next);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Restart app to apply.')),
    );
  }

  @override
  Widget build(BuildContext context) { … }
}
```

- [ ] **Step 3: Verify all tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 2: Wire `VidyaMainShell` to use `VidyaMoreScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/shell/vidya_main_shell.dart`
- Modify: `apps/mobile/lib/vidya/screens/vidya_tab_placeholders.dart` — drop `VidyaMoreTabPlaceholder`
- Modify: `apps/mobile/test/vidya/phase_3a_shell_test.dart` — the "Sign out fires onSignOut" test still works (still has a "Sign out" button)

- [ ] **Step 1: Replace tab content**

In `vidya_main_shell.dart`, replace:
```dart
Container(
  key: const Key('vidya.shell.more'),
  child: VidyaMoreTabPlaceholder(onSignOut: widget.onSignOut),
),
```
with:
```dart
Container(
  key: const Key('vidya.shell.more'),
  child: VidyaMoreScreen(auth: widget.auth, onSignOut: widget.onSignOut),
),
```

- [ ] **Step 2: Remove `VidyaMoreTabPlaceholder`** from `vidya_tab_placeholders.dart`. The Study / Practice / Insights placeholders stay until Phases 3b–3d ship.
- [ ] **Step 3: Verify Phase 3a shell tests** still pass — the "Sign out fires onSignOut" test should now interact with the real More screen.
- [ ] **Step 4: Commit**.

---

## Task 3: Verification gate

- [ ] Analyze + tests (mobile).
- [ ] APK build.
- [ ] Manual smoke (user-driven): tap MORE → see profile + Aurora toggle + Sign out. Flip the toggle → snackbar appears. Cold restart → confirms shell switched.
