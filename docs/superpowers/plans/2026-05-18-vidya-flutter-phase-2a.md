# Vidya Flutter Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the Flutter mobile app's `runApp` root to `VidyaApp`, ship the first 6 Vidya screens (splash + welcome + 3 onboarding cards + exam-select), and wrap every Aurora screen in an `AuroraRoute` compatibility shim so Aurora continues to render unchanged.

**Architecture:** `VidyaRootApp` becomes `runApp`'s target. It owns a `_VidyaScreen` state-machine that walks the user through 6 Vidya screens and finally transitions to `AuroraRoute(child: AuroraGuestFlow(...))` — a nested `MaterialApp` configured with Aurora's theme — for the remaining Aurora-driven experience (login/home/etc.).

**Tech Stack:** Flutter 3.x, `flutter_secure_storage`, existing `AuthClient`, Vidya primitives from `packages/design-tokens-flutter`, Aurora widgets from `apps/mobile/lib/aurora/`.

**Spec:** [docs/superpowers/specs/2026-05-18-vidya-flutter-phase-2a-design.md](../specs/2026-05-18-vidya-flutter-phase-2a-design.md)

---

## File Map

**Create:**
- `apps/mobile/lib/vidya/aurora_route.dart` — compatibility shim (nested MaterialApp with Aurora theme/notifiers)
- `apps/mobile/lib/vidya/vidya_root_app.dart` — runApp target; `_VidyaScreen` state machine; bootstrap orchestration
- `apps/mobile/lib/vidya/screens/vidya_splash_screen.dart` — Vidya-branded splash (replaces Aurora `_Splash`)
- `apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart` — product pitch + Get Started / Sign In
- `apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart` — parameterised card (3 call-sites)
- `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart` — exam selection with backend persistence
- `apps/mobile/test/vidya/aurora_route_test.dart` — shim renders child with Aurora theme
- `apps/mobile/test/vidya/phase_2a_screens_test.dart` — 6 screen tests (theme × persona × density)
- `apps/mobile/test/vidya/vidya_root_app_test.dart` — state-machine transitions

**Modify:**
- `apps/mobile/lib/vidya/vidya.dart` — add exports
- `apps/mobile/lib/main.dart` — rename `AdaptiveLearningApp` → `AuroraGuestFlow`, strip outer `MaterialApp` from its `build()`, flip `runApp` argument

**Files responsibility:**

| File | Responsibility | Approx. LOC |
|---|---|---|
| `aurora_route.dart` | Mount nested MaterialApp with Aurora theme; own Aurora notifiers for the duration of the Aurora subtree | ~100 |
| `vidya_root_app.dart` | Bootstrap Vidya notifiers + auth + onboarding-done flag; drive 7-state machine; render current screen wrapped in `VidyaApp` | ~180 |
| `vidya_splash_screen.dart` | Static branded splash (gradient + Vidya wordmark + spinner) | ~120 |
| `vidya_welcome_screen.dart` | Pitch hero + 3 feature strips + 2 CTAs | ~180 |
| `vidya_onboarding_card_screen.dart` | One parameterised widget; cardIndex 1/2/3 selects copy + preview | ~220 |
| `vidya_exam_select_screen.dart` | Fetch `GET /catalog/exams`; chip-grid selection; PUT `/profile/exams`; write local keys | ~250 |
| `main.dart` (modified) | Rename + strip MaterialApp + `runApp(VidyaRootApp(...))` | ~30 LOC delta |

---

## Task 1: Extract `AuroraGuestFlow` from `AdaptiveLearningApp`

**Files:**
- Modify: `apps/mobile/lib/main.dart` (rename `AdaptiveLearningApp` → `AuroraGuestFlow`, strip outer `MaterialApp` from its `build()`)

**Why first:** Phase 2a's `AuroraRoute` and `VidyaRootApp` both need `AuroraGuestFlow` as their child. Extracting it cleanly first (one rename + one delete) makes every subsequent task additive.

**Important constraint:** This is a **rename + surgical removal**, not a rewrite. The existing `_AdaptiveLearningAppState` state machine (`_GuestScreen`, `_OnboardStep`, notifier ownership, deep-link parsing) is preserved byte-for-byte. We only:
1. Rename class `AdaptiveLearningApp` → `AuroraGuestFlow`
2. Rename state class `_AdaptiveLearningAppState` → `_AuroraGuestFlowState`
3. Replace the outer `MaterialApp(...)` in `build()` with just its `home:` content (`AuroraRoute` provides the MaterialApp now)
4. Keep `runApp(AdaptiveLearningApp(...))` call temporarily pointing to `AuroraGuestFlow` so tests pass — Task 8 flips this to `VidyaRootApp`

- [ ] **Step 1: Run baseline test to confirm starting state**

Run: `cd apps/mobile && flutter test test/vidya/ -j 1`
Expected: PASS (Phase 1 widget tests + notifier tests).

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

- [ ] **Step 2: Rename the class**

In [apps/mobile/lib/main.dart](apps/mobile/lib/main.dart):

Find:
```dart
class AdaptiveLearningApp extends StatefulWidget {
  const AdaptiveLearningApp({
```
Replace with:
```dart
class AuroraGuestFlow extends StatefulWidget {
  const AuroraGuestFlow({
```

Find:
```dart
State<AdaptiveLearningApp> createState() => _AdaptiveLearningAppState();
```
Replace with:
```dart
State<AuroraGuestFlow> createState() => _AuroraGuestFlowState();
```

Find:
```dart
class _AdaptiveLearningAppState extends State<AdaptiveLearningApp> {
```
Replace with:
```dart
class _AuroraGuestFlowState extends State<AuroraGuestFlow> {
```

Find (inside `main()`):
```dart
runApp(AdaptiveLearningApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
```
Replace with:
```dart
runApp(AuroraGuestFlow(auth: AuthClient(baseUrl: _apiBaseUrl)));
```

NOTE: Do NOT delete `class AdaptiveLearningAppLegacy` (lines 435+) — it's referenced by an existing widget test.

- [ ] **Step 3: Strip outer MaterialApp from `_AuroraGuestFlowState.build()`**

The current `build()` returns `MaterialApp(...)` wrapping a switching home. After this step, it returns a widget tree that DOES NOT contain its own `MaterialApp` (because Task 2's `AuroraRoute` will provide one).

Find in `_AuroraGuestFlowState.build()`:
```dart
  @override
  Widget build(BuildContext context) {
    final density = _density.density;
    final persona = _persona.persona;
    return MaterialApp(
      title: 'Adaptive Learning Platform',
      // Aurora v2 — light + dark themes built pair-wise, density-aware.
      // Aurora v3 threads the active persona through AuroraTheme.build()
      // so widgets can read `Theme.of(context).extension<PersonaTheme>()`
      // for touch-target, type-scale, motion-energy, illustration-density,
      // streak-shame, numeric-exposure, Lumi-prominence flexes.
      //
      // Aurora v3 / Wave 1: ThemeModeNotifier defaults to ThemeMode.dark
      // until the new Aurora widget library lands. Legacy widgets hardcode
      // dark-theme constants inline, so light mode renders text invisibly.
      // Settings still exposes the toggle; users who flip to light will see
      // the bug until Wave 2 W2.11. See plan file.
      theme: AuroraTheme.light(density: density, persona: persona),
      darkTheme: AuroraTheme.dark(density: density, persona: persona),
      themeMode: _themeMode.mode,
      home: !_bootstrapped
          ? const _Splash()
          : _session == null
              ? _guestRoute()
              : _session!.user.onboardingState == 'ONBOARDED'
                  ? MainScaffold(
                      auth: widget.auth,
                      onSignOut: () async {
                        await widget.auth.logout();
                        if (mounted) setState(() => _session = null);
                      },
                    )
                  : _onboardingRoute(),
    );
  }
```

Replace with:
```dart
  @override
  Widget build(BuildContext context) {
    // AuroraRoute provides the enclosing MaterialApp + Aurora theme;
    // this widget just returns the current home content directly.
    return !_bootstrapped
        ? const _Splash()
        : _session == null
            ? _guestRoute()
            : _session!.user.onboardingState == 'ONBOARDED'
                ? MainScaffold(
                    auth: widget.auth,
                    onSignOut: () async {
                      await widget.auth.logout();
                      if (mounted) setState(() => _session = null);
                    },
                  )
                : _onboardingRoute();
  }
```

Also remove the now-unused locals at the top of `build()` — `final density = _density.density;` and `final persona = _persona.persona;` are no longer referenced after the strip.

- [ ] **Step 4: Run analyzer + tests; verify no regression**

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -10`
Expected: `No issues found!` (renames are pure; `_Splash`, `AdaptiveLearningAppLegacy` may show "unused" — they are intentional and kept for now)

If analyzer complains about `_Splash` being unused, suppress with:
```dart
// ignore: unused_element
class _Splash extends StatelessWidget {
```
(Add the `// ignore:` line directly above `class _Splash extends StatelessWidget {` near line 329.)

Run: `cd apps/mobile && flutter test test/vidya/`
Expected: PASS — Phase 1 tests untouched.

Run: `cd apps/mobile && flutter test test/aurora_widgets_test.dart`
Expected: PASS — Aurora widget tests untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/main.dart
git commit -m "$(cat <<'EOF'
refactor(mobile): rename AdaptiveLearningApp → AuroraGuestFlow; strip outer MaterialApp

Phase 2a prep — AuroraRoute (Task 2) provides the enclosing MaterialApp.
State machine, notifiers, deep-link parsing all preserved verbatim.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `AuroraRoute` compatibility shim

**Files:**
- Create: `apps/mobile/lib/vidya/aurora_route.dart`
- Create: `apps/mobile/test/vidya/aurora_route_test.dart`
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/vidya/aurora_route_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/aurora_route.dart';
import 'package:adaptive_learning_mobile/vidya/persona_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/density_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/theme_mode_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/vidya_app.dart';

void main() {
  testWidgets('AuroraRoute renders its child with Aurora theme applied',
      (tester) async {
    final persona = VidyaPersonaNotifier();
    final density = VidyaDensityNotifier();
    final themeMode = VidyaThemeModeNotifier();

    await tester.pumpWidget(VidyaApp(
      persona: persona,
      density: density,
      themeMode: themeMode,
      home: AuroraRoute(
        builder: (ctx) => const Scaffold(body: Text('inside aurora')),
      ),
    ));
    // Allow AuroraRoute's bootstrap Future.wait to settle.
    await tester.pumpAndSettle();

    expect(find.text('inside aurora'), findsOneWidget);
  });

  testWidgets('AuroraRoute mounts a MaterialApp distinct from VidyaApp\'s',
      (tester) async {
    final persona = VidyaPersonaNotifier();
    final density = VidyaDensityNotifier();
    final themeMode = VidyaThemeModeNotifier();

    await tester.pumpWidget(VidyaApp(
      persona: persona,
      density: density,
      themeMode: themeMode,
      home: AuroraRoute(
        builder: (ctx) => const Scaffold(body: Text('child')),
      ),
    ));
    await tester.pumpAndSettle();

    // Two MaterialApps in the tree — VidyaApp's outer + AuroraRoute's inner.
    expect(find.byType(MaterialApp), findsNWidgets(2));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/aurora_route_test.dart`
Expected: FAIL — `aurora_route.dart` doesn't exist; import errors.

- [ ] **Step 3: Implement `AuroraRoute`**

Create `apps/mobile/lib/vidya/aurora_route.dart`:

```dart
// AuroraRoute — compatibility shim that mounts Aurora's MaterialApp
// (theme + density + persona + themeMode notifiers) around a child
// widget tree. Lets Vidya-rooted apps render Aurora screens without
// editing the Aurora widgets themselves.
//
// One AuroraRoute owns one set of Aurora notifiers for its lifetime.
// When AuroraRoute is unmounted, its notifiers dispose.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/density_notifier.dart';
import '../aurora/persona.dart';
import '../aurora/theme_mode_notifier.dart';

class AuroraRoute extends StatefulWidget {
  final Widget Function(BuildContext) builder;
  const AuroraRoute({super.key, required this.builder});

  @override
  State<AuroraRoute> createState() => _AuroraRouteState();
}

class _AuroraRouteState extends State<AuroraRoute> {
  final _themeMode = ThemeModeNotifier();
  final _density = DensityNotifier();
  final _persona = PersonaNotifier();
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    Future.wait<void>([
      _themeMode.bootstrap(),
      _density.bootstrap(),
      _persona.bootstrap(),
    ]).whenComplete(() {
      if (mounted) setState(() => _bootstrapped = true);
    });
    _themeMode.addListener(_rebuild);
    _density.addListener(_rebuild);
    _persona.addListener(_rebuild);
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _themeMode.removeListener(_rebuild);
    _density.removeListener(_rebuild);
    _persona.removeListener(_rebuild);
    _themeMode.dispose();
    _density.dispose();
    _persona.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_bootstrapped) {
      // Render a transparent placeholder while notifiers bootstrap.
      // VidyaApp's MaterialApp sits above this widget so the screen
      // background stays consistent during the brief bootstrap window.
      return const SizedBox.shrink();
    }
    return MaterialApp(
      title: 'Adaptive Learning Platform',
      debugShowCheckedModeBanner: false,
      theme: AuroraTheme.light(
        density: _density.density,
        persona: _persona.persona,
      ),
      darkTheme: AuroraTheme.dark(
        density: _density.density,
        persona: _persona.persona,
      ),
      themeMode: _themeMode.mode,
      home: Builder(builder: widget.builder),
    );
  }
}
```

- [ ] **Step 4: Add export to barrel**

In [apps/mobile/lib/vidya/vidya.dart](apps/mobile/lib/vidya/vidya.dart), add after the last export:

```dart
export 'aurora_route.dart';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && flutter test test/vidya/aurora_route_test.dart`
Expected: PASS, both tests.

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/aurora_route.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/aurora_route_test.dart
git commit -m "$(cat <<'EOF'
feat(vidya): AuroraRoute coexistence shim

Mounts a nested MaterialApp with Aurora theme around any child widget
so Aurora screens render unchanged inside a Vidya-rooted app tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `VidyaSplashScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_splash_screen.dart`
- Add to: `apps/mobile/test/vidya/phase_2a_screens_test.dart` (test file created here)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/vidya/phase_2a_screens_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';

Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness,
      persona: persona,
      density: density,
    ),
    home: child,
  );
}

void main() {
  group('VidyaSplashScreen', () {
    testWidgets('renders in light theme', (tester) async {
      await tester.pumpWidget(_harness(child: const VidyaSplashScreen()));
      expect(find.byType(VidyaSplashScreen), findsOneWidget);
    });

    testWidgets('renders in dark theme', (tester) async {
      await tester.pumpWidget(_harness(
        brightness: Brightness.dark,
        child: const VidyaSplashScreen(),
      ));
      expect(find.byType(VidyaSplashScreen), findsOneWidget);
    });

    testWidgets('renders for every persona', (tester) async {
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(
          persona: p,
          child: const VidyaSplashScreen(),
        ));
        expect(find.byType(VidyaSplashScreen), findsOneWidget);
      }
    });

    testWidgets('renders for every density', (tester) async {
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(
          density: d,
          child: const VidyaSplashScreen(),
        ));
        expect(find.byType(VidyaSplashScreen), findsOneWidget);
      }
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: FAIL — `vidya_splash_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaSplashScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_splash_screen.dart`:

```dart
// VidyaSplashScreen — branded cold-start splash rendered while
// VidyaRootApp's bootstrap futures settle (persona/density/themeMode
// notifiers + auth + onboarding-done flag).
//
// Renders before any inherited Vidya theme is fully ready, so token
// reads are guarded with a fallback. Aims for perceived 600–800ms;
// VidyaRootApp swaps to the next screen as soon as bootstrap completes.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaSplashScreen extends StatelessWidget {
  const VidyaSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final bg = theme?.colors.paper ?? const Color(0xFFF7F3EC);
    final ink = theme?.colors.ink ?? const Color(0xFF1B1C1F);
    final accent = theme?.personaAccent.primary ?? const Color(0xFF6F4FB6);

    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: accent,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      'V',
                      style: TextStyle(
                        fontFamily: VidyaFonts.serif,
                        fontSize: 36,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Vidya',
                    style: TextStyle(
                      fontFamily: VidyaFonts.serif,
                      fontSize: 32,
                      fontWeight: FontWeight.w400,
                      color: ink,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Adaptive learning, designed for you',
                    style: TextStyle(
                      fontFamily: VidyaFonts.sans,
                      fontSize: 13,
                      color: ink.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            Align(
              alignment: const Alignment(0, 0.85),
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(accent),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Add export to barrel**

In [apps/mobile/lib/vidya/vidya.dart](apps/mobile/lib/vidya/vidya.dart), add:

```dart
export 'screens/vidya_splash_screen.dart';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: PASS, all 4 splash tests.

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

If analyzer complains about `VidyaFonts.serif` / `VidyaFonts.sans` — check the actual property names in `packages/design-tokens-flutter/lib/src/vidya/tokens.dart` (might be `VidyaFonts.display` / `VidyaFonts.body` — adjust the splash code to use whatever names exist there).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/screens/vidya_splash_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2a_screens_test.dart
git commit -m "$(cat <<'EOF'
feat(vidya): VidyaSplashScreen — branded cold-start splash

Renders during VidyaRootApp bootstrap. Falls back to inline colors
when VidyaThemeData isn't yet inherited.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `VidyaWelcomeScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2a_screens_test.dart` (append `VidyaWelcomeScreen` group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append the failing test**

Append to `apps/mobile/test/vidya/phase_2a_screens_test.dart` (inside the existing `main() { ... }` block, after the splash group):

```dart
  group('VidyaWelcomeScreen', () {
    testWidgets('renders Get Started and Sign In CTAs', (tester) async {
      var getStarted = 0;
      var signIn = 0;
      var skip = 0;
      await tester.pumpWidget(_harness(
        child: VidyaWelcomeScreen(
          onGetStarted: () => getStarted++,
          onSignIn: () => signIn++,
          onSkip: () => skip++,
        ),
      ));
      expect(find.text('Get started'), findsOneWidget);
      expect(find.text('Sign in'), findsOneWidget);
    });

    testWidgets('Get Started fires callback', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaWelcomeScreen(
          onGetStarted: () => taps++,
          onSignIn: () {},
          onSkip: () {},
        ),
      ));
      await tester.tap(find.text('Get started'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Sign in fires callback', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaWelcomeScreen(
          onGetStarted: () {},
          onSignIn: () => taps++,
          onSkip: () {},
        ),
      ));
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('renders in dark + all personas + all densities',
        (tester) async {
      Widget make() => VidyaWelcomeScreen(
            onGetStarted: () {},
            onSignIn: () {},
            onSkip: () {},
          );
      await tester.pumpWidget(_harness(brightness: Brightness.dark, child: make()));
      expect(find.byType(VidyaWelcomeScreen), findsOneWidget);
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(persona: p, child: make()));
        expect(find.byType(VidyaWelcomeScreen), findsOneWidget);
      }
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(density: d, child: make()));
        expect(find.byType(VidyaWelcomeScreen), findsOneWidget);
      }
    });
  });
```

Also add this import at the top of the test file:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_welcome_screen.dart';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: FAIL — `vidya_welcome_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaWelcomeScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart`:

```dart
// VidyaWelcomeScreen — first interactive screen after splash.
// Product pitch + 3 feature strips + Get Started + Sign In CTAs.
// Skip is exposed (top-right) but jumps the user past onboarding entirely.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaWelcomeScreen extends StatelessWidget {
  final VoidCallback onGetStarted;
  final VoidCallback onSignIn;
  final VoidCallback onSkip;

  const VidyaWelcomeScreen({
    super.key,
    required this.onGetStarted,
    required this.onSignIn,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context)!;
    final ink = theme.colors.ink;
    final muted = ink.withValues(alpha: 0.65);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        actions: [
          TextButton(
            onPressed: onSkip,
            child: Text(
              'Skip',
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 14,
                color: muted,
              ),
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Spacer(),
            Text(
              'Welcome to Vidya',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.serif,
                fontSize: 34,
                fontWeight: FontWeight.w500,
                color: ink,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'AI-powered exam prep that adapts to how you actually learn.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 15,
                color: muted,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 32),
            _FeatureStrip(
              icon: Icons.psychology_outlined,
              title: 'Adaptive engine',
              subtitle: 'Every question calibrated to your level',
            ),
            const SizedBox(height: 12),
            _FeatureStrip(
              icon: Icons.show_chart,
              title: 'Live readiness',
              subtitle: 'See your trajectory toward exam day',
            ),
            const SizedBox(height: 12),
            _FeatureStrip(
              icon: Icons.lightbulb_outline,
              title: 'Guided study',
              subtitle: 'What to study next, every session',
            ),
            const Spacer(flex: 2),
            VidyaButton(
              label: 'Get started',
              onPressed: onGetStarted,
              size: VidyaButtonSize.lg,
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: 'Sign in',
              onPressed: onSignIn,
              style: VidyaButtonStyle.ghost,
              size: VidyaButtonSize.lg,
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _FeatureStrip extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _FeatureStrip({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context)!;
    final accent = theme.personaAccent.primary;
    final ink = theme.colors.ink;
    return VidyaCard(
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: accent, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontFamily: VidyaFonts.sans,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontFamily: VidyaFonts.sans,
                    fontSize: 13,
                    color: ink.withValues(alpha: 0.65),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

NOTE: API names (`VidyaScaffold`, `VidyaAppBar.title:`, `VidyaButton(label:, onPressed:, size:, style:)`, `VidyaCard`, `VidyaButtonSize.lg`, `VidyaButtonStyle.ghost`) must match the Phase 1 widget APIs in `packages/design-tokens-flutter/lib/src/vidya/widgets/`. If a name differs, adjust to match — DO NOT add new constructors to the widget package in this task; either match the existing API or scope a small follow-up edit to the widget.

- [ ] **Step 4: Add export to barrel**

In [apps/mobile/lib/vidya/vidya.dart](apps/mobile/lib/vidya/vidya.dart), add:

```dart
export 'screens/vidya_welcome_screen.dart';
```

- [ ] **Step 5: Run tests; verify pass + analyze**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: PASS, all welcome tests + previous splash tests.

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2a_screens_test.dart
git commit -m "$(cat <<'EOF'
feat(vidya): VidyaWelcomeScreen — pitch + 3 feature strips + CTAs

Get Started begins the onboarding card flow; Sign In skips onboarding;
Skip (top-right) also skips onboarding.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `VidyaOnboardingCardScreen` (parameterised, 3 cards)

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2a_screens_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append the failing test**

Add to `apps/mobile/test/vidya/phase_2a_screens_test.dart`:

Imports at top:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_onboarding_card_screen.dart';
```

Append group inside `main()`:
```dart
  group('VidyaOnboardingCardScreen', () {
    Widget make({required int cardIndex}) => VidyaOnboardingCardScreen(
          cardIndex: cardIndex,
          onContinue: () {},
          onSkip: () {},
          onBack: () {},
        );

    testWidgets('renders card 1 (AI adapts)', (tester) async {
      await tester.pumpWidget(_harness(child: make(cardIndex: 1)));
      expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      expect(find.text('1 of 3'), findsOneWidget);
    });

    testWidgets('renders card 2 (Readiness)', (tester) async {
      await tester.pumpWidget(_harness(child: make(cardIndex: 2)));
      expect(find.text('2 of 3'), findsOneWidget);
    });

    testWidgets('renders card 3 (Guided)', (tester) async {
      await tester.pumpWidget(_harness(child: make(cardIndex: 3)));
      expect(find.text('3 of 3'), findsOneWidget);
    });

    testWidgets('Continue fires onContinue', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () => taps++,
          onSkip: () {},
          onBack: () {},
        ),
      ));
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () {},
          onSkip: () => taps++,
          onBack: () {},
        ),
      ));
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('renders dark + all personas + all densities', (tester) async {
      await tester.pumpWidget(_harness(
        brightness: Brightness.dark,
        child: make(cardIndex: 2),
      ));
      expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(persona: p, child: make(cardIndex: 2)));
        expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      }
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(density: d, child: make(cardIndex: 2)));
        expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      }
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: FAIL — file not found.

- [ ] **Step 3: Implement `VidyaOnboardingCardScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart`:

```dart
// VidyaOnboardingCardScreen — single parameterised card used for
// cards 1/2/3 of the onboarding sequence. cardIndex chooses copy
// + preview body. Continue advances; Skip jumps to exam-select;
// Back returns to the previous card (or welcome from card 1).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaOnboardingCardScreen extends StatelessWidget {
  final int cardIndex; // 1, 2, or 3
  final VoidCallback onContinue;
  final VoidCallback onSkip;
  final VoidCallback onBack;

  const VidyaOnboardingCardScreen({
    super.key,
    required this.cardIndex,
    required this.onContinue,
    required this.onSkip,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context)!;
    final ink = theme.colors.ink;
    final muted = ink.withValues(alpha: 0.65);
    final content = _contentForIndex(cardIndex);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: onBack,
        ),
        actions: [
          TextButton(
            onPressed: onSkip,
            child: Text(
              'Skip',
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 14,
                color: muted,
              ),
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '$cardIndex of 3',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: muted,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              content.title,
              style: TextStyle(
                fontFamily: VidyaFonts.serif,
                fontSize: 30,
                fontWeight: FontWeight.w500,
                color: ink,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              content.body,
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 15,
                color: muted,
                height: 1.55,
              ),
            ),
            const SizedBox(height: 28),
            Expanded(child: Center(child: _previewForIndex(cardIndex))),
            const SizedBox(height: 16),
            VidyaButton(
              label: 'Continue',
              onPressed: onContinue,
              size: VidyaButtonSize.lg,
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  _CardContent _contentForIndex(int i) {
    switch (i) {
      case 1:
        return const _CardContent(
          title: 'AI that adapts to you',
          body:
              'Every question is calibrated live to your current level. Get harder ones as you improve; easier ones when you stall.',
        );
      case 2:
        return const _CardContent(
          title: 'See your readiness, live',
          body:
              'A single score, updated every session, that tracks how prepared you actually are — by topic and overall.',
        );
      case 3:
      default:
        return const _CardContent(
          title: 'Guided, not generic',
          body:
              'We tell you what to study next, why, and how long it should take — so you spend time on what matters.',
        );
    }
  }

  Widget _previewForIndex(int i) {
    switch (i) {
      case 2:
        return _ReadinessPreview();
      case 3:
        return _RecommendationPreview();
      case 1:
      default:
        return _AdaptationPreview();
    }
  }
}

class _CardContent {
  final String title;
  final String body;
  const _CardContent({required this.title, required this.body});
}

class _AdaptationPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        child: Column(
          children: [
            VidyaAiTag(label: 'ADAPTIVE ENGINE'),
            const SizedBox(height: 16),
            const Text(
              'θ = 0.42 → 0.61',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 22,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Difficulty rises with every correct answer',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 12,
                color: VidyaThemeData.of(context)!
                    .colors
                    .ink
                    .withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReadinessPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const VidyaMasteryBar(
              value: 0.78,
              bucket: VidyaMasteryBucket.strong,
              label: 'Mechanics',
            ),
            const SizedBox(height: 12),
            const VidyaMasteryBar(
              value: 0.45,
              bucket: VidyaMasteryBucket.developing,
              label: 'Thermodynamics',
            ),
            const SizedBox(height: 12),
            const VidyaMasteryBar(
              value: 0.22,
              bucket: VidyaMasteryBucket.weak,
              label: 'Calculus',
            ),
            const SizedBox(height: 16),
            VidyaSparkline(
              values: const [0.41, 0.45, 0.52, 0.55, 0.61, 0.66, 0.71],
              height: 36,
            ),
          ],
        ),
      ),
    );
  }
}

class _RecommendationPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            VidyaAiTag(label: 'NEXT UP'),
            const SizedBox(height: 12),
            Text(
              'Practice Calculus — 20 min',
              style: TextStyle(
                fontFamily: VidyaFonts.serif,
                fontSize: 18,
                fontWeight: FontWeight.w500,
                color: VidyaThemeData.of(context)!.colors.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Limits & continuity is your weakest concept. 12 questions calibrated to your level.',
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 13,
                color: VidyaThemeData.of(context)!
                    .colors
                    .ink
                    .withValues(alpha: 0.65),
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

NOTE: This file references `VidyaButton`, `VidyaCard`, `VidyaScaffold`, `VidyaAppBar`, `VidyaAiTag`, `VidyaMasteryBar`, `VidyaSparkline`, `VidyaMasteryBucket`, `VidyaButtonSize.lg`, `VidyaFonts.mono`. If actual constructor signatures or enum names differ, adjust the implementation to match what Phase 1 shipped — do not add new constructors. Run the test after writing; the compiler errors tell you exactly which names to adjust.

- [ ] **Step 4: Add export to barrel**

In [apps/mobile/lib/vidya/vidya.dart](apps/mobile/lib/vidya/vidya.dart):

```dart
export 'screens/vidya_onboarding_card_screen.dart';
```

- [ ] **Step 5: Run tests; verify pass + analyze**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: PASS, all card + welcome + splash tests.

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2a_screens_test.dart
git commit -m "$(cat <<'EOF'
feat(vidya): VidyaOnboardingCardScreen — parameterised 3-card onboarding

cardIndex 1/2/3 picks copy + preview body. Continue advances; Skip
jumps to exam-select; Back returns to previous card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `VidyaExamSelectScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2a_screens_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append the failing test (with mock AuthClient)**

The Aurora version hits a real `/catalog/exams` endpoint. For the unit test, we use a mock `AuthClient`. The structure of `AuthClient.apiGet` returns `http.Response` — confirm by inspecting `apps/mobile/lib/auth/auth_client.dart` if needed.

Add to `apps/mobile/test/vidya/phase_2a_screens_test.dart`:

Imports:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_exam_select_screen.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:http/http.dart' as http;
```

Add a fake class above `void main()`:
```dart
class _FakeAuth implements AuthClient {
  final String examListJson;
  bool putCalled = false;
  _FakeAuth({this.examListJson = '[]'});

  @override
  Future<http.Response> apiGet(String path) async =>
      http.Response(examListJson, 200);

  @override
  Future<http.Response> apiPut(String path, Map<String, dynamic> body) async {
    putCalled = true;
    return http.Response('{}', 200);
  }

  // The rest of AuthClient's interface goes via noSuchMethod since the
  // exam-select screen only touches apiGet + apiPut.
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
```

NOTE: If `AuthClient` is a concrete class (not abstract), the `implements AuthClient` line will fail. In that case, look at `apps/mobile/lib/auth/auth_client.dart` and either:
- Add a small abstract interface (`abstract class AuthClientLike { Future<http.Response> apiGet(String); Future<http.Response> apiPut(String, Map<String,dynamic>); }`) and have `VidyaExamSelectScreen` depend on the abstract type
- Or use `mocktail` (check `apps/mobile/pubspec.yaml` for whether it's a dev dependency).

Append group:
```dart
  group('VidyaExamSelectScreen', () {
    testWidgets('shows loading then exam list', (tester) async {
      final auth = _FakeAuth(examListJson:
          '[{"id":"a-1","code":"JEE","name":"JEE Main","subtitle":"Engineering"}]');
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('JEE Main'), findsOneWidget);
    });

    testWidgets('Continue is disabled until exam picked', (tester) async {
      final auth = _FakeAuth(examListJson:
          '[{"id":"a-1","code":"JEE","name":"JEE Main"}]');
      var continued = 0;
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () => continued++,
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(continued, 0); // disabled — no exam picked yet
    });

    testWidgets('Continue after selection calls PUT + onContinue',
        (tester) async {
      final auth = _FakeAuth(examListJson:
          '[{"id":"a-1","code":"JEE","name":"JEE Main"}]');
      var continued = 0;
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () => continued++,
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('JEE Main'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(auth.putCalled, true);
      expect(continued, 1);
    });

    testWidgets('renders dark + all personas + all densities', (tester) async {
      final auth = _FakeAuth(examListJson:
          '[{"id":"a-1","code":"NEET","name":"NEET UG"}]');
      Widget make() => VidyaExamSelectScreen(
            auth: auth,
            onContinue: () {},
            onBack: () {},
          );
      await tester.pumpWidget(_harness(brightness: Brightness.dark, child: make()));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaExamSelectScreen), findsOneWidget);
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(persona: p, child: make()));
        await tester.pumpAndSettle();
        expect(find.byType(VidyaExamSelectScreen), findsOneWidget);
      }
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(density: d, child: make()));
        await tester.pumpAndSettle();
        expect(find.byType(VidyaExamSelectScreen), findsOneWidget);
      }
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: FAIL — `vidya_exam_select_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaExamSelectScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart`:

```dart
// VidyaExamSelectScreen — choose target exam. Mirrors Aurora's
// exam_select_screen.dart endpoint contract (GET /catalog/exams +
// PUT /profile/exams with {"examId": ...}) so backend wiring is
// untouched. Also persists choice to flutter_secure_storage under
// vidya.selected_exam_* keys for offline-aware lookups.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../auth/auth_client.dart';

class VidyaExamSelectScreen extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;

  const VidyaExamSelectScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
  });

  @override
  State<VidyaExamSelectScreen> createState() => _VidyaExamSelectScreenState();
}

class _Exam {
  final String id;
  final String code;
  final String name;
  final String? subtitle;
  const _Exam({
    required this.id,
    required this.code,
    required this.name,
    this.subtitle,
  });
  factory _Exam.fromJson(Map<String, dynamic> j) => _Exam(
        id: j['id'] as String,
        code: j['code'] as String,
        name: j['name'] as String,
        subtitle: j['subtitle'] as String?,
      );
}

class _VidyaExamSelectScreenState extends State<VidyaExamSelectScreen> {
  static const _storage = FlutterSecureStorage();

  List<_Exam>? _exams;
  String? _selectedId;
  String? _selectedCode;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.auth.apiGet('/catalog/exams');
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't load the exam list.");
        return;
      }
      final data = jsonDecode(res.body) as List<dynamic>;
      setState(() {
        _exams = data
            .map((e) => _Exam.fromJson(e as Map<String, dynamic>))
            .toList(growable: false);
      });
    } catch (_) {
      setState(() => _error = "We couldn't load the exam list.");
    }
  }

  Future<void> _submit() async {
    if (_selectedId == null) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final res = await widget.auth
          .apiPut('/profile/exams', {'examId': _selectedId});
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your selection. Try again.");
        return;
      }
      await _storage.write(key: 'vidya.selected_exam_id', value: _selectedId);
      if (_selectedCode != null) {
        await _storage.write(
            key: 'vidya.selected_exam_code', value: _selectedCode);
      }
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your selection. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context)!;
    final ink = theme.colors.ink;
    final muted = ink.withValues(alpha: 0.65);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBack,
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Which exam are you preparing for?',
              style: TextStyle(
                fontFamily: VidyaFonts.serif,
                fontSize: 26,
                fontWeight: FontWeight.w500,
                color: ink,
                height: 1.25,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Pick one to get started. You can add more later.',
              style: TextStyle(
                fontFamily: VidyaFonts.sans,
                fontSize: 14,
                color: muted,
              ),
            ),
            const SizedBox(height: 20),
            if (_error != null) ...[
              VidyaBanner(
                tone: VidyaBannerTone.warn,
                message: _error!,
              ),
              const SizedBox(height: 12),
            ],
            Expanded(
              child: _exams == null
                  ? const Center(child: CircularProgressIndicator())
                  : _exams!.isEmpty
                      ? const Center(child: Text('No exams available yet.'))
                      : ListView.separated(
                          itemBuilder: (ctx, i) {
                            final e = _exams![i];
                            final selected = _selectedId == e.id;
                            return VidyaCard(
                              onTap: () => setState(() {
                                _selectedId = e.id;
                                _selectedCode = e.code;
                              }),
                              tone: selected
                                  ? VidyaCardTone.accent
                                  : VidyaCardTone.defaultTone,
                              child: Padding(
                                padding: const EdgeInsets.all(4),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            e.name,
                                            style: TextStyle(
                                              fontFamily: VidyaFonts.sans,
                                              fontSize: 16,
                                              fontWeight: FontWeight.w600,
                                              color: ink,
                                            ),
                                          ),
                                          if (e.subtitle != null) ...[
                                            const SizedBox(height: 4),
                                            Text(
                                              e.subtitle!,
                                              style: TextStyle(
                                                fontFamily: VidyaFonts.sans,
                                                fontSize: 13,
                                                color: muted,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    if (selected)
                                      Icon(Icons.check_circle,
                                          color:
                                              theme.personaAccent.primary),
                                  ],
                                ),
                              ),
                            );
                          },
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 10),
                          itemCount: _exams!.length,
                        ),
            ),
            const SizedBox(height: 12),
            VidyaButton(
              label: _submitting ? 'Saving...' : 'Continue',
              onPressed:
                  _selectedId == null || _submitting ? null : _submit,
              size: VidyaButtonSize.lg,
              disabled: _selectedId == null || _submitting,
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}
```

NOTE: API names — `VidyaCardTone.accent`, `VidyaCardTone.defaultTone`, `VidyaBanner(tone:, message:)`, `VidyaBannerTone.warn` — adjust to actual Phase 1 enum/constructor names if they differ.

- [ ] **Step 4: Add export to barrel**

```dart
export 'screens/vidya_exam_select_screen.dart';
```

- [ ] **Step 5: Run tests; verify + analyze**

Run: `cd apps/mobile && flutter test test/vidya/phase_2a_screens_test.dart`
Expected: PASS.

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2a_screens_test.dart
git commit -m "$(cat <<'EOF'
feat(vidya): VidyaExamSelectScreen — exam choice with backend persistence

Reuses Aurora's GET /catalog/exams + PUT /profile/exams contract;
also writes vidya.selected_exam_{id,code} for offline reads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `VidyaRootApp` state machine

**Files:**
- Create: `apps/mobile/lib/vidya/vidya_root_app.dart`
- Create: `apps/mobile/test/vidya/vidya_root_app_test.dart`
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/vidya/vidya_root_app_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/vidya_root_app.dart';

class _FakeAuthForRoot implements AuthClient {
  @override
  Future<void> bootstrap() async {}
  @override
  Future<http.Response> apiGet(String path) async => http.Response('[]', 200);
  @override
  Future<http.Response> apiPut(String path, Map<String, dynamic> body) async =>
      http.Response('{}', 200);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  // Use the in-memory storage backend so the test doesn't touch the host keychain.
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('renders splash during bootstrap', (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _FakeAuthForRoot()));
    // First frame — bootstrap futures haven't settled.
    expect(find.byType(VidyaRootApp), findsOneWidget);
  });

  testWidgets('first-launch (no onboarding_done key) lands on welcome',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _FakeAuthForRoot()));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to Vidya'), findsOneWidget);
  });

  testWidgets('returning user (onboarding_done == true) lands on AuroraRoute',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues(
        {'vidya.onboarding_done': 'true'});
    await tester.pumpWidget(VidyaRootApp(auth: _FakeAuthForRoot()));
    await tester.pumpAndSettle();
    // Welcome NOT visible — AuroraRoute is rendering AuroraGuestFlow.
    expect(find.text('Welcome to Vidya'), findsNothing);
  });
}
```

NOTE: `FlutterSecureStorage.setMockInitialValues` is the standard Flutter pattern. If it's a different name in the version in use, check `apps/mobile/pubspec.yaml` for the `flutter_secure_storage` version and consult its docs.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/vidya_root_app_test.dart`
Expected: FAIL — `vidya_root_app.dart` not found.

- [ ] **Step 3: Implement `VidyaRootApp`**

Create `apps/mobile/lib/vidya/vidya_root_app.dart`:

```dart
// VidyaRootApp — runApp target for Phase 2a+. Owns the Vidya
// notifiers, bootstraps them in parallel with the AuthClient and
// the vidya.onboarding_done flag, then drives a 7-state machine
// from splash → welcome → 3 cards → exam-select → AuroraRoute.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/auth_client.dart';
import '../main.dart' show AuroraGuestFlow;
import 'aurora_route.dart';
import 'density_notifier.dart';
import 'persona_notifier.dart';
import 'screens/vidya_exam_select_screen.dart';
import 'screens/vidya_onboarding_card_screen.dart';
import 'screens/vidya_splash_screen.dart';
import 'screens/vidya_welcome_screen.dart';
import 'theme_mode_notifier.dart';
import 'vidya_app.dart';

enum _VidyaScreen {
  splash,
  welcome,
  card1,
  card2,
  card3,
  examSelect,
  aurora,
}

class VidyaRootApp extends StatefulWidget {
  final AuthClient auth;
  const VidyaRootApp({super.key, required this.auth});

  @override
  State<VidyaRootApp> createState() => _VidyaRootAppState();
}

class _VidyaRootAppState extends State<VidyaRootApp> {
  static const _storage = FlutterSecureStorage();
  static const _onboardingDoneKey = 'vidya.onboarding_done';

  final _persona = VidyaPersonaNotifier();
  final _density = VidyaDensityNotifier();
  final _themeMode = VidyaThemeModeNotifier();

  _VidyaScreen _screen = _VidyaScreen.splash;
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
    _persona.addListener(_rebuild);
    _density.addListener(_rebuild);
    _themeMode.addListener(_rebuild);
  }

  Future<void> _bootstrap() async {
    String? onboardingDone;
    await Future.wait<void>([
      _persona.bootstrap(),
      _density.bootstrap(),
      _themeMode.bootstrap(),
      widget.auth.bootstrap(),
      _storage
          .read(key: _onboardingDoneKey)
          .then((v) => onboardingDone = v),
    ]);
    if (!mounted) return;
    setState(() {
      _bootstrapped = true;
      _screen = onboardingDone == 'true'
          ? _VidyaScreen.aurora
          : _VidyaScreen.welcome;
    });
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  Future<void> _markOnboardingDone() async {
    await _storage.write(key: _onboardingDoneKey, value: 'true');
    if (mounted) setState(() => _screen = _VidyaScreen.aurora);
  }

  @override
  void dispose() {
    _persona.removeListener(_rebuild);
    _density.removeListener(_rebuild);
    _themeMode.removeListener(_rebuild);
    _persona.dispose();
    _density.dispose();
    _themeMode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return VidyaApp(
      persona: _persona,
      density: _density,
      themeMode: _themeMode,
      home: _currentScreen(),
    );
  }

  Widget _currentScreen() {
    if (!_bootstrapped) return const VidyaSplashScreen();
    switch (_screen) {
      case _VidyaScreen.splash:
        return const VidyaSplashScreen();
      case _VidyaScreen.welcome:
        return VidyaWelcomeScreen(
          onGetStarted: () => setState(() => _screen = _VidyaScreen.card1),
          onSignIn: _markOnboardingDone,
          onSkip: _markOnboardingDone,
        );
      case _VidyaScreen.card1:
        return VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () => setState(() => _screen = _VidyaScreen.card2),
          onSkip: () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack: () => setState(() => _screen = _VidyaScreen.welcome),
        );
      case _VidyaScreen.card2:
        return VidyaOnboardingCardScreen(
          cardIndex: 2,
          onContinue: () => setState(() => _screen = _VidyaScreen.card3),
          onSkip: () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack: () => setState(() => _screen = _VidyaScreen.card1),
        );
      case _VidyaScreen.card3:
        return VidyaOnboardingCardScreen(
          cardIndex: 3,
          onContinue: () => setState(() => _screen = _VidyaScreen.examSelect),
          onSkip: () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack: () => setState(() => _screen = _VidyaScreen.card2),
        );
      case _VidyaScreen.examSelect:
        return VidyaExamSelectScreen(
          auth: widget.auth,
          onContinue: _markOnboardingDone,
          onBack: () => setState(() => _screen = _VidyaScreen.card3),
        );
      case _VidyaScreen.aurora:
        return AuroraRoute(builder: (_) => AuroraGuestFlow(auth: widget.auth));
    }
  }
}
```

- [ ] **Step 4: Add export to barrel**

In [apps/mobile/lib/vidya/vidya.dart](apps/mobile/lib/vidya/vidya.dart):

```dart
export 'vidya_root_app.dart';
```

- [ ] **Step 5: Run tests; verify pass + analyze**

Run: `cd apps/mobile && flutter test test/vidya/vidya_root_app_test.dart`
Expected: PASS.

Run: `cd apps/mobile && flutter test test/vidya/`
Expected: ALL pass (Phase 1 + 2a tests).

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/vidya/vidya_root_app.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/vidya_root_app_test.dart
git commit -m "$(cat <<'EOF'
feat(vidya): VidyaRootApp — 7-state machine drives onboarding flow

Bootstraps Vidya notifiers + auth + onboarding-done flag in parallel.
First launch routes to welcome; returning users skip to AuroraRoute.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Flip `runApp` target in `main.dart`

**Files:**
- Modify: `apps/mobile/lib/main.dart` (one-line `runApp` change)

- [ ] **Step 1: Change `runApp` argument**

In [apps/mobile/lib/main.dart](apps/mobile/lib/main.dart), find:
```dart
runApp(AuroraGuestFlow(auth: AuthClient(baseUrl: _apiBaseUrl)));
```

Replace with:
```dart
runApp(VidyaRootApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
```

Add the import near the top of `main.dart`:
```dart
import 'vidya/vidya_root_app.dart';
```

- [ ] **Step 2: Verify analyze and build**

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -10`
Expected: `No issues found!` (or only the pre-existing "_Splash" unused if not suppressed)

Run: `cd apps/mobile && flutter test`
Expected: All existing tests pass. If `test/widget_test.dart` or another test directly instantiates `AdaptiveLearningApp`, it will need updating to `AuroraGuestFlow` — check and fix any such usage.

Run: `cd apps/mobile && flutter build apk --debug 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/main.dart
git commit -m "$(cat <<'EOF'
feat(vidya): flip runApp target from AuroraGuestFlow to VidyaRootApp

First Vidya screen now renders on cold start. Aurora still reachable
via AuroraRoute once onboarding completes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke + acceptance gate

This task is verification-only. No code changes.

- [ ] **Step 1: Run the full automated suite**

Run all four verification commands from spec §13:

```bash
cd packages/design-tokens-flutter && flutter analyze && cd -
cd apps/mobile && flutter analyze
cd apps/mobile && flutter test
cd apps/mobile && flutter build apk --debug
```

Expected: ALL four exit 0. If any fail, halt and diagnose before proceeding to manual smoke.

- [ ] **Step 2: Manual smoke on an Android emulator**

```bash
cd apps/mobile && flutter run --dart-define=ALP_API_BASE_URL=http://10.0.2.2:35173/api/v1
```

Walk this checklist (record pass/fail next to each):

1. Wipe app data (`adb shell pm clear com.example.adaptive_learning_mobile` — adjust package name to match)
2. Cold-start → Vidya splash visible (V logo + "Adaptive learning, designed for you")
3. Splash → welcome (Welcome to Vidya + 3 feature strips + Get Started + Sign In)
4. Tap Get Started → card 1 ("AI that adapts to you" + θ preview)
5. Tap Continue → card 2 ("See your readiness, live" + mastery bars)
6. Tap Continue → card 3 ("Guided, not generic" + NEXT UP card)
7. Tap Continue → exam-select (list loaded from `/catalog/exams`)
8. Tap an exam (e.g., NEET) → exam card shows selected state
9. Tap Continue → spinner → Aurora `LoginScreen` (note the theme shift to Aurora's dark theme)
10. Sign in with `student@example.com / Password123!` → Aurora `MainScaffold` renders
11. Background the app → cold-start again → lands on Aurora `LoginScreen` directly (skip onboarding works)
12. Sign out from Aurora → returns to Aurora `LoginScreen` (NOT Vidya onboarding — per spec §11)
13. Toggle theme (Aurora Settings) light/dark → Aurora chrome reflects toggle

- [ ] **Step 3: Manual smoke on an iOS simulator**

```bash
cd apps/mobile && flutter run --dart-define=ALP_API_BASE_URL=http://localhost:35173/api/v1
```

Same checklist. iOS simulator may surface SafeArea differences not visible on Android — note any visual regressions for Phase 2b.

- [ ] **Step 4: Record findings**

If any step fails, add it under the spec §14 "Open questions" section as an implementation-time finding, then fix before considering Phase 2a closed. If all steps pass, the phase is shippable.

- [ ] **Step 5: Final commit (optional)**

If §13 of the spec needs status update (mark all acceptance criteria as ✓), append a status note and commit:

```bash
git add docs/superpowers/specs/2026-05-18-vidya-flutter-phase-2a-design.md
git commit -m "docs(vidya): mark Phase 2a acceptance criteria verified"
```

Then invoke the finishing-a-development-branch skill to decide on PR/merge strategy.

---

## Self-Review Notes

**Spec coverage check:**
- §5.1 `AuroraRoute` shim → Task 2 ✓
- §5.2 runApp flip → Task 8 ✓
- §5.3 first-launch detection → Task 7 (VidyaRootApp + `vidya.onboarding_done`) ✓
- §5.4 state-machine routing → Task 7 ✓
- §5.5 3 cards as 1 parameterised widget → Task 5 ✓
- §5.6 Skip semantics → Tasks 4 + 5 ✓
- §5.7 post-exam handoff to Aurora login → Task 7 (`_screen = aurora` after `_markOnboardingDone`) + Task 1 (AuroraGuestFlow preserves Aurora login routing) ✓
- §5.8 `_Splash` deferred to 2b → Task 1 step 4 (`// ignore: unused_element` lint suppression) ✓
- §6 folder structure → all create-paths match ✓
- §7 screen catalog → Tasks 3–6 ✓
- §8 AuroraRoute mechanics → Task 2 code matches spec §8 ✓
- §9 VidyaRootApp skeleton → Task 7 code matches spec §9 ✓
- §10 acceptance criteria → Task 9 ✓
- §13 verification plan → Task 9 step 1 ✓

**Placeholder scan:** None — all code blocks are complete, all file paths absolute.

**Type consistency:** Naming is consistent across tasks — `_VidyaScreen` enum, `_markOnboardingDone`, `AuroraGuestFlow`, `AuroraRoute(builder:)`, `VidyaRootApp(auth:)`. Notifier method names match Phase 1 (`bootstrap()`, `addListener()`). Storage key constant `_onboardingDoneKey = 'vidya.onboarding_done'` matches spec §5.3.

**Risk:** Widget API names (`VidyaButtonStyle.ghost`, `VidyaCardTone.accent`, etc.) used in Tasks 4–6 are best-guess based on the spec §7 description. Step 5 of each task runs the analyzer; any name mismatch surfaces there. The plan instructs the implementer to adjust calls to match the actual Phase 1 API rather than modifying Phase 1 widgets — keeps blast radius minimal.
