# Phase 3a — Vidya shell + Home (the fork point)

**Status:** DRAFT — 2026-05-26
**Sequel to:** Phase 2f (theta-live quiz overlay, shipped). Phase 3a is the migration **fork point** per [`docs/superpowers/specs/2026-05-25-vidya-mobile-design-roadmap.md`](../specs/2026-05-25-vidya-mobile-design-roadmap.md#phase-3a--vidya-shell--home-the-fork-point).

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## Goal

Switch `VidyaRootApp._VidyaScreen.home` from `AuroraRoute(MainScaffold(...))` to a brand-new `VidyaMainShell` containing the 5-tab Vidya bottom nav (Home / Study / Practice / Insights / More). Ship the **foundation only**:

- `VidyaBottomNav` 5-tab primitive in `packages/design-tokens-flutter`.
- `VidyaMainShell` in `apps/mobile/lib/vidya/shell/` that hosts a tab IndexedStack.
- `VidyaHomeScreen` as a **minimal stub** that proves the routing works (greeting + placeholder card; rich content deferred to **Phase 3a.1**).
- Four placeholder tabs (Study / Practice / Insights / More) — each renders a "Coming soon" Vidya card with the existing Aurora screen reachable via `AuroraRoute(...)` as the explicit fallback.
- Soft-rollback flag `vidya.use_aurora_shell` in secure storage — when `'true'` the `home` state still routes to `AuroraRoute(MainScaffold)`. Default-off (`null`/`false` → Vidya shell).

This separation keeps the **irreversible** decision (rebuilding the shell) self-contained from the **additive** decisions (Home card content, Study tab, etc., which are tracked as Phase 3a.1 + 3b–3f in the roadmap).

---

## Out of scope for Phase 3a (deferred to 3a.1 and beyond)

| Deferred to | Item |
|---|---|
| Phase 3a.1 | Rich Home screen content per slide 7: greeting + date + avatar + bell, READINESS card (728/900 + 12-week sparkline), NEXT SESSION card, stats tile row (STREAK / TODAY / MOCKS), TODAY checklist |
| Phase 3a.1 | `GET /home` aggregation endpoint — Phase 3a uses ad-hoc fetches from existing endpoints inside the stub |
| Phase 3b–3f | Real implementations of the 4 placeholder tabs (Study, Practice, Insights, More) |
| Phase 3g | Aurora shell deletion |
| Later | InboxBell-equivalent for Vidya (Phase 3a uses no Timer.periodic at all — see Risk #2 below) |

---

## State machine

No changes to the 18-state machine from Phase 2e. The only delta is what `_VidyaScreen.home` returns from `_currentScreen()`:

**Before (current):**
```dart
case _VidyaScreen.home:
  return AuroraRoute(
    builder: (_) => MainScaffold(auth: widget.auth, onSignOut: _onSignOut),
  );
```

**After (Phase 3a):**
```dart
case _VidyaScreen.home:
  if (_useAuroraShell == true) {
    return AuroraRoute(
      builder: (_) => MainScaffold(auth: widget.auth, onSignOut: _onSignOut),
    );
  }
  return VidyaMainShell(auth: widget.auth, onSignOut: _onSignOut);
```

Where `_useAuroraShell` is bootstrapped from `vidya.use_aurora_shell` in secure storage, in parallel with the existing `_onboardingDoneKey` read.

---

## File map

**New (design-system package):**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_bottom_nav.dart` — 5-tab nav primitive
- `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` — export

**New (mobile app):**
- `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — IndexedStack host + nav wiring
- `apps/mobile/lib/vidya/shell/vidya_main_shell_scope.dart` — `InheritedWidget` for cross-tab navigation (Aurora's `MainScaffoldScope` analogue)
- `apps/mobile/lib/vidya/screens/vidya_home_screen.dart` — minimal stub: greeting card + "Phase 3a.1 builds the rest here" placeholder
- `apps/mobile/lib/vidya/screens/vidya_study_tab_placeholder.dart`
- `apps/mobile/lib/vidya/screens/vidya_practice_tab_placeholder.dart`
- `apps/mobile/lib/vidya/screens/vidya_insights_tab_placeholder.dart`
- `apps/mobile/lib/vidya/screens/vidya_more_tab_placeholder.dart`

**New (tests):**
- `apps/mobile/test/vidya/phase_3a_shell_test.dart` — widget tests for `VidyaBottomNav` + `VidyaMainShell` routing + tab switching
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_bottom_nav_test.dart` — primitive unit tests

**Modified:**
- `apps/mobile/lib/vidya/vidya_root_app.dart` — bootstrap reads `vidya.use_aurora_shell`; `home` case branches on it
- `apps/mobile/test/vidya/vidya_root_app_test.dart` — update tests to assert `VidyaMainShell` (not `MainScaffold`) by default; add a test for the flag round-trip
- `apps/mobile/test/vidya/widgets_test.dart` — non-regression; should be unaffected

---

## Confirmed APIs / locked decisions

- 5 tabs: **Home, Study, Practice, Insights, More**. No Rank tab — Aurora's earned-Rank logic stays inside `MainScaffold` for legacy users; Vidya users see Insights instead.
- Bottom nav uses Material `Icons.*` from the standard set (refining iconography is Phase 3a.1 polish work).
- `vidya.use_aurora_shell` flag values: `'true'` → Aurora shell, anything else (null/`'false'`/missing) → Vidya shell.
- Tab order is fixed in `VidyaShellTab` enum: `home(0), study(1), practice(2), insights(3), more(4)`.
- Placeholder tabs render a Vidya-themed "Coming soon" card with a "View previous version" button that pushes into `AuroraRoute` for the corresponding Aurora tab. Users keep their existing functionality during migration.

---

## Risks (from roadmap, with Phase-3a-specific mitigations)

### Risk #1 — Test regressions (HIGH)

`vidya_root_app_test.dart` currently asserts Aurora's `MainScaffold` behaviour for authenticated users. Two specific tests touch this:
- `'authenticated returning user (ONBOARDED) lands on home (MainScaffold)'`
- `'screening_done == true skips screening — examSelect Continue routes straight to home'`

Both must be updated to assert `VidyaMainShell` is present and `MainScaffold` is NOT. The negative assertion (no `MainScaffold`) is what proves the fork happened.

### Risk #2 — InboxBell-equivalent Timer.periodic (MEDIUM)

`MainScaffold` mounts `InboxBellButton` which runs a 60s `Timer.periodic` — that's why two existing tests use `pump()` instead of `pumpAndSettle()`. **Vidya shell must not introduce equivalent timers.** Phase 3a's stub Home has no notification fetching at all. Phase 3a.1's notification bell, when added, must use a Stream + ValueNotifier or one-shot refresh pattern, not Timer.periodic.

### Risk #3 — Feature-parity gap (MEDIUM)

While 4 tabs are placeholders, users tapping them shouldn't be stranded. The placeholder cards include "View previous version" CTAs that push into Aurora's equivalent tabs via `AuroraRoute`. Banners are Phase 3a.1 polish (the roadmap mentions "We're rebuilding this — Vidya version coming soon").

---

## Task 1: Soft-rollback flag scaffolding

**Files:**
- Modify: `apps/mobile/lib/vidya/vidya_root_app.dart`
- Modify: `apps/mobile/test/vidya/vidya_root_app_test.dart`

- [ ] **Step 1: Failing test** — append to `vidya_root_app_test.dart`:

```dart
testWidgets('vidya.use_aurora_shell == true keeps home on AuroraRoute(MainScaffold)',
    (tester) async {
  FlutterSecureStorage.setMockInitialValues({
    'alp.auth.tokens':
        '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
    'vidya.onboarding_done': 'true',
    'vidya.use_aurora_shell': 'true',
  });
  await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  // VidyaMainShell must NOT be in the tree when flag is on.
  expect(find.byType(VidyaMainShell), findsNothing);
});
```

Expected: FAIL (VidyaMainShell doesn't exist yet — compile error).

- [ ] **Step 2: Add storage key + field**

In `_VidyaRootAppState`, add:

```dart
static const _useAuroraShellKey = 'vidya.use_aurora_shell';
bool? _useAuroraShell;
```

- [ ] **Step 3: Bootstrap reads the flag**

Extend the `Future.wait(...)` in `_bootstrap()`:

```dart
String? onboardingDone;
String? useAuroraShell;
await Future.wait<void>([
  _persona.bootstrap(),
  _density.bootstrap(),
  _themeMode.bootstrap(),
  widget.auth.bootstrap(),
  _storage.read(key: _onboardingDoneKey).then((v) => onboardingDone = v),
  _storage.read(key: _useAuroraShellKey).then((v) => useAuroraShell = v),
]);
```

Then before the final `setState`, set `_useAuroraShell = useAuroraShell == 'true';`.

- [ ] **Step 4: Skip implementation of the `home` branch for now**

The test added in Step 1 will start passing once Tasks 3+4 land. Skip the green phase here — Task 1 leaves the flag plumbing in place and the test as a known-failing item, retired when Task 4 wires it.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/vidya/vidya_root_app.dart apps/mobile/test/vidya/vidya_root_app_test.dart && git commit -m "feat(vidya): soft-rollback flag scaffolding (vidya.use_aurora_shell)"
```

---

## Task 2: `VidyaBottomNav` primitive

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_bottom_nav.dart`
- Modify: `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` (export)
- Create: `packages/design-tokens-flutter/test/vidya/widgets/vidya_bottom_nav_test.dart`

### API

```dart
enum VidyaShellTab { home, study, practice, insights, more }

class VidyaBottomNav extends StatelessWidget {
  final VidyaShellTab active;
  final ValueChanged<VidyaShellTab> onTap;
  const VidyaBottomNav({super.key, required this.active, required this.onTap});
}
```

Visual:
- 68px tall, `theme.paper` background, top border `theme.ink3` at alpha 0.10
- Each item: vertical stack — icon (24) + label (10px mono, letter-spaced)
- Active: `theme.accent` colour; Inactive: `theme.ink3`
- Tap target: full column width (no minimum overlay)

### Tests

- [ ] **Step 1: Failing test** — `vidya_bottom_nav_test.dart`:

```dart
testWidgets('renders 5 tabs labeled HOME / STUDY / PRACTICE / INSIGHTS / MORE',
    (tester) async {
  await tester.pumpWidget(_harness(VidyaBottomNav(
    active: VidyaShellTab.home,
    onTap: (_) {},
  )));
  expect(find.text('HOME'), findsOneWidget);
  expect(find.text('STUDY'), findsOneWidget);
  expect(find.text('PRACTICE'), findsOneWidget);
  expect(find.text('INSIGHTS'), findsOneWidget);
  expect(find.text('MORE'), findsOneWidget);
});

testWidgets('tapping a tab fires onTap with that tab', (tester) async {
  VidyaShellTab? tapped;
  await tester.pumpWidget(_harness(VidyaBottomNav(
    active: VidyaShellTab.home,
    onTap: (t) => tapped = t,
  )));
  await tester.tap(find.text('STUDY'));
  expect(tapped, VidyaShellTab.study);
});

testWidgets('active tab icon uses theme.accent colour', (tester) async {
  // Verify that the Icon widget under the active label is themed with accent.
  // Use find.byKey('vidya.nav.icon.home') + read its colour.
});
```

- [ ] **Step 2: Implementation** — see "Implementation skeleton" below.
- [ ] **Step 3: Add `export 'vidya_bottom_nav.dart';` to `widgets.dart`**.
- [ ] **Step 4: Verify all tests pass**.
- [ ] **Step 5: Commit**.

### Implementation skeleton

```dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaShellTab { home, study, practice, insights, more }

class VidyaBottomNav extends StatelessWidget {
  final VidyaShellTab active;
  final ValueChanged<VidyaShellTab> onTap;

  const VidyaBottomNav({super.key, required this.active, required this.onTap});

  static const _items = <_Spec>[
    _Spec(tab: VidyaShellTab.home, label: 'HOME', icon: Icons.home_outlined),
    _Spec(tab: VidyaShellTab.study, label: 'STUDY', icon: Icons.menu_book_outlined),
    _Spec(tab: VidyaShellTab.practice, label: 'PRACTICE', icon: Icons.bolt_outlined),
    _Spec(tab: VidyaShellTab.insights, label: 'INSIGHTS', icon: Icons.insights_outlined),
    _Spec(tab: VidyaShellTab.more, label: 'MORE', icon: Icons.more_horiz_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      decoration: BoxDecoration(
        color: v.paper,
        border: Border(top: BorderSide(color: v.ink3.withValues(alpha: 0.10))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            children: _items
                .map((s) => Expanded(child: _Item(spec: s, active: active == s.tab, onTap: () => onTap(s.tab))))
                .toList(),
          ),
        ),
      ),
    );
  }
}

class _Spec {
  final VidyaShellTab tab;
  final String label;
  final IconData icon;
  const _Spec({required this.tab, required this.label, required this.icon});
}

class _Item extends StatelessWidget {
  final _Spec spec;
  final bool active;
  final VoidCallback onTap;
  const _Item({required this.spec, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final colour = active ? v.accent : v.ink3;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(spec.icon, size: 24, color: colour, key: Key('vidya.nav.icon.${spec.tab.name}')),
          const SizedBox(height: 4),
          Text(
            spec.label,
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 10,
              color: colour,
              letterSpacing: 1.2,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}
```

---

## Task 3: `VidyaMainShell` + placeholders + Home stub

**Files:**
- Create: `apps/mobile/lib/vidya/shell/vidya_main_shell.dart`
- Create: `apps/mobile/lib/vidya/shell/vidya_main_shell_scope.dart`
- Create: `apps/mobile/lib/vidya/screens/vidya_home_screen.dart`
- Create: 4 placeholder screens (see file map)
- Modify: `apps/mobile/test/vidya/phase_3a_shell_test.dart` (new)

### `VidyaMainShell` API

```dart
class VidyaMainShell extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onSignOut;
  final VidyaShellTab initialTab;
  const VidyaMainShell({
    super.key,
    required this.auth,
    required this.onSignOut,
    this.initialTab = VidyaShellTab.home,
  });
}
```

State holds the active tab + an `IndexedStack` of 5 children. `VidyaMainShellScope` is an `InheritedWidget` exposing `switchTo(VidyaShellTab)` to descendants.

### Tests

- [ ] **Step 1: Failing tests** — `phase_3a_shell_test.dart`:

```dart
testWidgets('mounts on Home tab by default', (tester) async {
  await tester.pumpWidget(_harness(VidyaMainShell(auth: _auth(), onSignOut: () {})));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('vidya.shell.home')), findsOneWidget);
});

testWidgets('tapping STUDY shows the study placeholder', (tester) async {
  await tester.pumpWidget(_harness(VidyaMainShell(auth: _auth(), onSignOut: () {})));
  await tester.pumpAndSettle();
  await tester.tap(find.text('STUDY'));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('vidya.shell.study')), findsOneWidget);
  expect(find.textContaining('Coming soon'), findsOneWidget);
});

testWidgets('VidyaMainShellScope.switchTo navigates from a descendant',
    (tester) async {
  await tester.pumpWidget(_harness(VidyaMainShell(auth: _auth(), onSignOut: () {})));
  await tester.pumpAndSettle();
  // Find any descendant context; programmatically switch to insights.
  final ctx = tester.element(find.byType(VidyaMainShell));
  VidyaMainShellScope.of(ctx)!.switchTo(VidyaShellTab.insights);
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('vidya.shell.insights')), findsOneWidget);
});
```

- [ ] **Step 2: Implementation skeleton**

```dart
class _VidyaMainShellState extends State<VidyaMainShell> {
  late VidyaShellTab _active = widget.initialTab;

  void _switchTo(VidyaShellTab t) => setState(() => _active = t);

  @override
  Widget build(BuildContext context) {
    final tabs = <Widget>[
      VidyaHomeScreen(auth: widget.auth, key: const Key('vidya.shell.home')),
      const VidyaStudyTabPlaceholder(key: Key('vidya.shell.study')),
      const VidyaPracticeTabPlaceholder(key: Key('vidya.shell.practice')),
      const VidyaInsightsTabPlaceholder(key: Key('vidya.shell.insights')),
      VidyaMoreTabPlaceholder(
        key: const Key('vidya.shell.more'),
        onSignOut: widget.onSignOut,
      ),
    ];
    return VidyaMainShellScope(
      activeTab: _active,
      switchTo: _switchTo,
      child: VidyaScaffold(
        body: IndexedStack(index: _active.index, children: tabs),
        bottomNav: VidyaBottomNav(active: _active, onTap: _switchTo),
      ),
    );
  }
}
```

### `VidyaHomeScreen` (Phase 3a stub)

Renders ONE Vidya card with:
- Eyebrow: `'WELCOME TO VIDYA'`
- Headline (display font): `'Hi, ${user.firstName ?? "there"}.'` — pulled from `widget.auth.user`
- Body (ui font, ink2): `"Your full Home view lands in Phase 3a.1 — readiness, next session, today's checklist."`
- Optional: a "View Aurora home" debug action that toggles `vidya.use_aurora_shell = true` for one tap (handy during smoke testing).

This is intentionally minimal — its job is to prove the routing works, not to satisfy slide 7's design.

### Placeholder screens

All four placeholders share the same shape — a `VidyaCard` with:
- Eyebrow: `'COMING SOON'`
- Headline: tab name (`Study`, `Practice`, `Insights`, `More`)
- Body: `"We're rebuilding this — Vidya version coming soon."`
- `VidyaButton(label: 'View previous version', onPressed: () => /* AuroraRoute push to the equivalent tab */)` — the `more` placeholder additionally exposes Sign out via `onSignOut`.

A single private builder `_PlaceholderCard(label, message, ctaLabel, onCta)` keeps these from being 4 near-identical files internally. (Each public widget class stays distinct for keying + future divergence in Phase 3b–3e.)

- [ ] **Step 3: Verify tests pass**.
- [ ] **Step 4: Commit**.

---

## Task 4: Wire `VidyaRootApp.home` → `VidyaMainShell`

**Files:**
- Modify: `apps/mobile/lib/vidya/vidya_root_app.dart`

- [ ] **Step 1: Add import**

```dart
import 'shell/vidya_main_shell.dart';
```

- [ ] **Step 2: Replace the `home` case**

```dart
case _VidyaScreen.home:
  if (_useAuroraShell == true) {
    return AuroraRoute(
      builder: (_) => MainScaffold(auth: widget.auth, onSignOut: _onSignOut),
    );
  }
  return VidyaMainShell(auth: widget.auth, onSignOut: _onSignOut);
```

- [ ] **Step 3: Run all Vidya tests**.
- [ ] **Step 4: Commit**.

---

## Task 5: Update `vidya_root_app_test.dart` for the new shell

**Files:**
- Modify: `apps/mobile/test/vidya/vidya_root_app_test.dart`

Two existing tests break after Task 4 because they (implicitly or explicitly) expect `MainScaffold`. Update assertions:

- `'authenticated returning user (ONBOARDED) lands on home (MainScaffold) — not Vidya welcome'` → rename to `'authenticated returning user lands on VidyaMainShell'`, assert `find.byType(VidyaMainShell)` is present and `find.byType(MainScaffold)` is absent.
- `'screening_done == true skips screening — examSelect Continue routes straight to home'` → same negative assertion on `MainScaffold`; keep `find.textContaining('calibrate')` absent.

The InboxBell-timer workarounds (`pump()` not `pumpAndSettle()`) can be **removed** since `VidyaMainShell` has no Timer.periodic. This is one of the wins of the fork.

- [ ] **Step 1: Update the 2 tests + add the rollback-flag test from Task 1**.
- [ ] **Step 2: Verify all root-app tests pass**.
- [ ] **Step 3: Commit**.

---

## Task 6: Verification gate

- [ ] **Step 1: Run analyze + tests**

```bash
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && \
  flutter analyze lib/vidya test/vidya && flutter test
```

Expected: 0 errors / 0 warnings; all mobile tests pass.

- [ ] **Step 2: Build APK**

```bash
flutter build apk --debug
```

Expected: `✓ Built build/app/outputs/flutter-apk/app-debug.apk`.

- [ ] **Step 3: Manual smoke (user-driven, not part of CI)**

1. Install APK on device; log in as a returning user with `vidya.onboarding_done = true`.
2. Confirm landing on `VidyaMainShell` (5-tab nav with HOME / STUDY / PRACTICE / INSIGHTS / MORE labels).
3. Tap each non-Home tab → see "Coming soon" card → tap "View previous version" → confirm Aurora's screen appears.
4. From More, set the rollback flag (e.g., via a debug action or `adb shell run-as ... write the secure-store key`) and cold-restart. Confirm Aurora's `MainScaffold` is back.
5. Clear the flag; cold-restart. Confirm Vidya shell is back.

---

## Phase 3a.1 — rich Home content (deferred)

Tracked here so the deferral is explicit. After Phase 3a ships, **Phase 3a.1** builds the full Home screen content per slide 7:

- Greeting card with date + avatar + bell.
- NEET READINESS card with the 12-week sparkline (re-use `VidyaSparkline`) + delta pill.
- NEXT SESSION card pulling from existing `/recommendations/next_session` endpoint (or equivalent).
- Stats tile row (STREAK / TODAY / MOCKS) — wire to `/analytics/streak` + `/analytics/today`.
- TODAY checklist — wire to `/analytics/today_plan` or aggregate locally.
- Backend ask: unified `GET /home` endpoint for cold-start latency. Phase 3a.1 plan will define the shape.

Phase 3a.1 is additive and does not change `VidyaRootApp` routing — only `VidyaHomeScreen` internals.

---

## Self-Review Notes (against roadmap)

- 5-tab Vidya bottom nav: HOME / STUDY / PRACTICE / INSIGHTS / MORE — Task 2 ✓
- `VidyaMainShell` analogous to `MainScaffold` — Task 3 ✓
- Home tab fully built (slide 7): **DEFERRED to Phase 3a.1** (explicit, in scope notes)
- Stub other 4 tabs — Task 3 ✓
- Soft-rollback flag `vidya.use_aurora_shell` — Task 1 ✓
- Root-app tests updated — Task 5 ✓
- No `Timer.periodic` (avoids InboxBell test gotcha) — Task 3 ✓
- Placeholder tabs route to Aurora via `AuroraRoute` (preserves UX during migration) — Task 3 ✓
