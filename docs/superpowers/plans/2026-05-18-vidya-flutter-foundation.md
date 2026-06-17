# Vidya Flutter Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Vidya Flutter foundation — 14 widget primitives + 3 runtime notifiers + `VidyaApp` root — so Phase 2+ screen migrations can begin. No user-facing screens migrate in this phase.

**Architecture:** Side-by-side with Aurora. Widgets live in `packages/design-tokens-flutter/lib/src/vidya/widgets/` (package-resident, reusable). Notifiers live in `apps/mobile/lib/vidya/` (app-resident, touches `flutter_secure_storage`). `MaterialApp` consumes `VidyaTheme.material(...)` driven by three `ChangeNotifier`s merged via `AnimatedBuilder(Listenable.merge([...]))`. Aurora widgets and notifiers stay untouched.

**Tech Stack:** Flutter 3.x · Dart 3 · `flutter_secure_storage` · `flutter_test` · existing `alp_design_tokens` package (already exports `VidyaTheme`, `VidyaThemeData`, `VidyaPersona`, `VidyaDensity`).

**Spec:** [docs/superpowers/specs/2026-05-18-vidya-flutter-foundation-design.md](../specs/2026-05-18-vidya-flutter-foundation-design.md)

---

## File map

**Create (new):**
```
packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_button.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_card.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_text_field.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_scaffold.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_app_bar.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_chip.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_badge.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_avatar.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_sheet.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_banner.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_tag.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_ai_tag.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_mastery_bar.dart
packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_sparkline.dart

apps/mobile/lib/vidya/vidya.dart
apps/mobile/lib/vidya/persona_notifier.dart
apps/mobile/lib/vidya/density_notifier.dart
apps/mobile/lib/vidya/theme_mode_notifier.dart
apps/mobile/lib/vidya/vidya_app.dart

apps/mobile/lib/screens/vidya_gallery_screen.dart
apps/mobile/test/vidya/widgets_test.dart
apps/mobile/test/vidya/notifiers_test.dart
```

**Modify:**
- `packages/design-tokens-flutter/lib/alp_design_tokens.dart` — add one export line for the widgets barrel

---

## Task 1: Scaffold directories + widget barrel

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart`
- Create: `apps/mobile/lib/vidya/vidya.dart`
- Create: `apps/mobile/test/vidya/` (directory)
- Modify: `packages/design-tokens-flutter/lib/alp_design_tokens.dart` (one export added)

- [ ] **Step 1: Create the widgets barrel (empty exports for now)**

```dart
// packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart
// Vidya v1 widget primitives. See ADR-0034 and
// docs/superpowers/specs/2026-05-18-vidya-flutter-foundation-design.md.

export 'vidya_button.dart';
export 'vidya_card.dart';
export 'vidya_text_field.dart';
export 'vidya_scaffold.dart';
export 'vidya_app_bar.dart';
export 'vidya_chip.dart';
export 'vidya_badge.dart';
export 'vidya_avatar.dart';
export 'vidya_sheet.dart';
export 'vidya_banner.dart';
export 'vidya_tag.dart';
export 'vidya_ai_tag.dart';
export 'vidya_mastery_bar.dart';
export 'vidya_sparkline.dart';
```

- [ ] **Step 2: Add the widget export to alp_design_tokens barrel**

Edit `packages/design-tokens-flutter/lib/alp_design_tokens.dart`. After the line `export 'src/vidya/tokens.dart';` add:

```dart
export 'src/vidya/widgets/widgets.dart';
```

- [ ] **Step 3: Create the app-side Vidya barrel**

```dart
// apps/mobile/lib/vidya/vidya.dart
// App-level Vidya plumbing — notifiers + root widget.
// Pure design (widgets + tokens) lives in alp_design_tokens.

export 'persona_notifier.dart';
export 'density_notifier.dart';
export 'theme_mode_notifier.dart';
export 'vidya_app.dart';
```

- [ ] **Step 4: Create test directory + placeholder**

```bash
mkdir -p apps/mobile/test/vidya
```

- [ ] **Step 5: Commit**

Note: at this point the barrel exports point to files that don't exist yet — analyzer will complain. Skip building until Task 2+ lands the referenced files. Commit anyway as a scaffold checkpoint, OR defer this commit until after Task 14. **Defer** — commit Task 1 together with Task 2 to avoid a broken-build commit.

---

## Task 2: VidyaPersonaNotifier

**Files:**
- Create: `apps/mobile/lib/vidya/persona_notifier.dart`
- Test: `apps/mobile/test/vidya/notifiers_test.dart`

- [ ] **Step 1: Write failing test (notifier basics)**

```dart
// apps/mobile/test/vidya/notifiers_test.dart
import 'package:adaptive_learning_mobile/vidya/persona_notifier.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('VidyaPersonaNotifier', () {
    test('default persona is aspirant', () {
      final n = VidyaPersonaNotifier();
      expect(n.persona, VidyaPersona.aspirant);
      expect(n.hasChosen, isFalse);
    });

    test('setPersona changes state and notifies listeners', () async {
      final n = VidyaPersonaNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setPersona(VidyaPersona.pro);
      expect(n.persona, VidyaPersona.pro);
      expect(n.hasChosen, isTrue);
      expect(calls, 1);
    });

    test('setPersona to same value still marks chosen but skips notify', () async {
      final n = VidyaPersonaNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setPersona(VidyaPersona.aspirant);
      expect(n.hasChosen, isTrue);
      expect(calls, 0);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && flutter test test/vidya/notifiers_test.dart
```

Expected: FAIL with "VidyaPersonaNotifier not defined" (file doesn't exist yet).

- [ ] **Step 3: Implement VidyaPersonaNotifier**

```dart
// apps/mobile/lib/vidya/persona_notifier.dart
// VidyaPersonaNotifier — runtime junior/senior/aspirant/pro/lifelong
// persona switch for the Vidya design system.
//
// Mirrors apps/mobile/lib/aurora/persona.dart but persists under a
// separate secure-storage key so Aurora and Vidya can coexist.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VidyaPersonaNotifier extends ChangeNotifier {
  static const _storageKey = 'vidya.persona';
  static const _storage = FlutterSecureStorage();

  VidyaPersona _persona = VidyaPersona.aspirant;
  bool _chosen = false;

  VidyaPersona get persona => _persona;
  bool get hasChosen => _chosen;

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = _parse(raw);
    if (loaded != null) {
      _chosen = true;
      if (loaded != _persona) {
        _persona = loaded;
        notifyListeners();
      }
    }
  }

  Future<void> setPersona(VidyaPersona p) async {
    final changed = p != _persona;
    _chosen = true;
    _persona = p;
    if (changed) notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(p));
  }

  Future<void> reset() async {
    _chosen = false;
    _persona = VidyaPersona.aspirant;
    notifyListeners();
    await _storage.delete(key: _storageKey);
  }

  static VidyaPersona? _parse(String? raw) => switch (raw) {
        'junior'   => VidyaPersona.junior,
        'senior'   => VidyaPersona.senior,
        'aspirant' => VidyaPersona.aspirant,
        'pro'      => VidyaPersona.pro,
        'lifelong' => VidyaPersona.lifelong,
        _ => null,
      };

  static String _encode(VidyaPersona p) => switch (p) {
        VidyaPersona.junior   => 'junior',
        VidyaPersona.senior   => 'senior',
        VidyaPersona.aspirant => 'aspirant',
        VidyaPersona.pro      => 'pro',
        VidyaPersona.lifelong => 'lifelong',
      };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && flutter test test/vidya/notifiers_test.dart
```

Expected: 3 PASS.

(The `bootstrap()` path requires secure-storage mocking; deferred to Step from Task 4.)

- [ ] **Step 5: Commit (combined with Task 1 scaffold)**

```bash
git add packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart \
        packages/design-tokens-flutter/lib/alp_design_tokens.dart \
        apps/mobile/lib/vidya/vidya.dart \
        apps/mobile/lib/vidya/persona_notifier.dart \
        apps/mobile/test/vidya/notifiers_test.dart
git commit -m "feat(vidya): scaffold + VidyaPersonaNotifier"
```

---

## Task 3: VidyaDensityNotifier

**Files:**
- Create: `apps/mobile/lib/vidya/density_notifier.dart`
- Test: append to `apps/mobile/test/vidya/notifiers_test.dart`

- [ ] **Step 1: Add failing test**

Append to the existing `notifiers_test.dart`:

```dart
import 'package:adaptive_learning_mobile/vidya/density_notifier.dart';

// ... inside main()
group('VidyaDensityNotifier', () {
  test('default density is regular', () {
    final n = VidyaDensityNotifier();
    expect(n.density, VidyaDensity.regular);
  });

  test('setDensity changes state and notifies', () async {
    final n = VidyaDensityNotifier();
    var calls = 0;
    n.addListener(() => calls++);
    await n.setDensity(VidyaDensity.comfy);
    expect(n.density, VidyaDensity.comfy);
    expect(calls, 1);
  });

  test('setDensity to same value does not notify', () async {
    final n = VidyaDensityNotifier();
    var calls = 0;
    n.addListener(() => calls++);
    await n.setDensity(VidyaDensity.regular);
    expect(calls, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && flutter test test/vidya/notifiers_test.dart
```

Expected: FAIL with "VidyaDensityNotifier not defined".

- [ ] **Step 3: Implement**

```dart
// apps/mobile/lib/vidya/density_notifier.dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VidyaDensityNotifier extends ChangeNotifier {
  static const _storageKey = 'vidya.density';
  static const _storage = FlutterSecureStorage();

  VidyaDensity _density = VidyaDensity.regular;
  VidyaDensity get density => _density;

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = _parse(raw);
    if (loaded != null && loaded != _density) {
      _density = loaded;
      notifyListeners();
    }
  }

  Future<void> setDensity(VidyaDensity d) async {
    if (d == _density) {
      await _storage.write(key: _storageKey, value: _encode(d));
      return;
    }
    _density = d;
    notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(d));
  }

  static VidyaDensity? _parse(String? raw) => switch (raw) {
        'compact' => VidyaDensity.compact,
        'regular' => VidyaDensity.regular,
        'comfy'   => VidyaDensity.comfy,
        _ => null,
      };

  static String _encode(VidyaDensity d) => switch (d) {
        VidyaDensity.compact => 'compact',
        VidyaDensity.regular => 'regular',
        VidyaDensity.comfy   => 'comfy',
      };
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd apps/mobile && flutter test test/vidya/notifiers_test.dart
```

Expected: 6 PASS (3 persona + 3 density).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/vidya/density_notifier.dart apps/mobile/test/vidya/notifiers_test.dart
git commit -m "feat(vidya): VidyaDensityNotifier"
```

---

## Task 4: VidyaThemeModeNotifier

**Files:**
- Create: `apps/mobile/lib/vidya/theme_mode_notifier.dart`
- Test: append to `notifiers_test.dart`

- [ ] **Step 1: Add failing test**

```dart
import 'package:adaptive_learning_mobile/vidya/theme_mode_notifier.dart';
import 'package:flutter/material.dart';

group('VidyaThemeModeNotifier', () {
  test('default mode is dark', () {
    final n = VidyaThemeModeNotifier();
    expect(n.mode, ThemeMode.dark);
    n.dispose();
  });

  test('setMode changes and notifies', () async {
    final n = VidyaThemeModeNotifier();
    var calls = 0;
    n.addListener(() => calls++);
    await n.setMode(ThemeMode.light);
    expect(n.mode, ThemeMode.light);
    expect(calls, 1);
    n.dispose();
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd apps/mobile && flutter test test/vidya/notifiers_test.dart
```

- [ ] **Step 3: Implement**

```dart
// apps/mobile/lib/vidya/theme_mode_notifier.dart
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VidyaThemeModeNotifier extends ChangeNotifier with WidgetsBindingObserver {
  static const _storageKey = 'vidya.theme';
  static const _storage = FlutterSecureStorage();

  ThemeMode _mode = ThemeMode.dark;

  VidyaThemeModeNotifier() {
    WidgetsBinding.instance.addObserver(this);
  }

  ThemeMode get mode => _mode;

  Brightness brightnessFor(BuildContext context) {
    if (_mode == ThemeMode.light) return Brightness.light;
    if (_mode == ThemeMode.dark)  return Brightness.dark;
    return MediaQuery.platformBrightnessOf(context);
  }

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = _parse(raw);
    if (loaded != null && loaded != _mode) {
      _mode = loaded;
      notifyListeners();
    }
  }

  Future<void> setMode(ThemeMode m) async {
    if (m == _mode) return;
    _mode = m;
    notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(m));
  }

  @override
  void didChangePlatformBrightness() {
    if (_mode == ThemeMode.system) notifyListeners();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  static ThemeMode? _parse(String? raw) => switch (raw) {
        'light'  => ThemeMode.light,
        'dark'   => ThemeMode.dark,
        'system' => ThemeMode.system,
        _ => null,
      };

  static String _encode(ThemeMode m) => switch (m) {
        ThemeMode.light  => 'light',
        ThemeMode.dark   => 'dark',
        ThemeMode.system => 'system',
      };
}
```

- [ ] **Step 4: Run, verify pass**

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/vidya/theme_mode_notifier.dart apps/mobile/test/vidya/notifiers_test.dart
git commit -m "feat(vidya): VidyaThemeModeNotifier"
```

---

## Task 5: VidyaApp root widget

**Files:**
- Create: `apps/mobile/lib/vidya/vidya_app.dart`

No failing-test-first here — `VidyaApp` is integration glue. Widget tests live with each primitive; an integration test would require a full app harness. We verify by reading the code carefully and the gallery screen exercising it at the end.

- [ ] **Step 1: Implement VidyaApp**

```dart
// apps/mobile/lib/vidya/vidya_app.dart
// Root widget for Vidya-themed Flutter pages. Wires three notifiers
// (persona, density, themeMode) into MaterialApp via a merged
// Listenable so any change triggers a single rebuild.
//
// NOTE: not yet wired into main.dart. Phase 2 onboarding swap does that.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'density_notifier.dart';
import 'persona_notifier.dart';
import 'theme_mode_notifier.dart';

class VidyaApp extends StatelessWidget {
  final VidyaPersonaNotifier persona;
  final VidyaDensityNotifier density;
  final VidyaThemeModeNotifier themeMode;
  final Widget home;
  final Map<String, WidgetBuilder>? routes;
  final String? initialRoute;
  final String title;

  const VidyaApp({
    super.key,
    required this.persona,
    required this.density,
    required this.themeMode,
    required this.home,
    this.routes,
    this.initialRoute,
    this.title = 'Vidya',
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([persona, density, themeMode]),
      builder: (context, _) => MaterialApp(
        title: title,
        debugShowCheckedModeBanner: false,
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: persona.persona,
          density: density.density,
        ),
        darkTheme: VidyaTheme.material(
          brightness: Brightness.dark,
          persona: persona.persona,
          density: density.density,
        ),
        themeMode: themeMode.mode,
        home: home,
        routes: routes ?? const {},
        initialRoute: initialRoute,
      ),
    );
  }
}
```

- [ ] **Step 2: Run analyzer to confirm no errors**

```bash
cd apps/mobile && flutter analyze lib/vidya/
```

Expected: 0 issues.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/vidya/vidya_app.dart
git commit -m "feat(vidya): VidyaApp root widget"
```

---

## Task 6: VidyaButton (first widget — establishes pattern)

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_button.dart`
- Test: `apps/mobile/test/vidya/widgets_test.dart`

- [ ] **Step 1: Write failing widget test**

```dart
// apps/mobile/test/vidya/widgets_test.dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness, persona: persona, density: density,
    ),
    home: Scaffold(body: child),
  );
}

void main() {
  group('VidyaButton', () {
    testWidgets('renders label and responds to tap', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaButton(
          label: 'Get started',
          onPressed: () => taps++,
        ),
      ));
      expect(find.text('Get started'), findsOneWidget);
      await tester.tap(find.byType(VidyaButton));
      expect(taps, 1);
    });

    testWidgets('disabled does not call onPressed', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaButton(
          label: 'Disabled',
          onPressed: () => taps++,
          disabled: true,
        ),
      ));
      await tester.tap(find.byType(VidyaButton));
      expect(taps, 0);
    });

    testWidgets('renders in dark mode without exception', (tester) async {
      await tester.pumpWidget(_harness(
        brightness: Brightness.dark,
        child: VidyaButton(label: 'X', onPressed: () {}),
      ));
      expect(find.byType(VidyaButton), findsOneWidget);
    });

    testWidgets('renders for every persona without exception', (tester) async {
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(
          persona: p,
          child: VidyaButton(label: 'P', onPressed: () {}),
        ));
        expect(find.byType(VidyaButton), findsOneWidget);
      }
    });

    testWidgets('renders for every density without exception', (tester) async {
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(
          density: d,
          child: VidyaButton(label: 'D', onPressed: () {}),
        ));
        expect(find.byType(VidyaButton), findsOneWidget);
      }
    });
  });
}
```

- [ ] **Step 2: Run, verify fail**

```bash
cd apps/mobile && flutter test test/vidya/widgets_test.dart
```

Expected: FAIL with "VidyaButton not defined".

- [ ] **Step 3: Implement VidyaButton**

```dart
// packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_button.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaButtonStyle { primary, secondary, ghost }
enum VidyaButtonSize { sm, md, lg }

class VidyaButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final VidyaButtonStyle style;
  final VidyaButtonSize size;
  final IconData? leadingIcon;
  final IconData? trailingIcon;
  final bool loading;
  final bool disabled;
  final bool fullWidth;

  const VidyaButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.style = VidyaButtonStyle.primary,
    this.size = VidyaButtonSize.md,
    this.leadingIcon,
    this.trailingIcon,
    this.loading = false,
    this.disabled = false,
    this.fullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final isEnabled = !disabled && !loading && onPressed != null;

    final (bg, fg, border) = switch (style) {
      VidyaButtonStyle.primary   => (v.accent,      v.paper, null),
      VidyaButtonStyle.secondary => (v.accentSoft,  v.accent, null),
      VidyaButtonStyle.ghost     => (Colors.transparent, v.accent, v.rule2),
    };

    final (h, padH, fontSize) = switch (size) {
      VidyaButtonSize.sm => (36.0, 14.0, 13.0),
      VidyaButtonSize.md => (v.density.touchTarget, 20.0, 14.5),
      VidyaButtonSize.lg => (v.density.touchTarget + 8, 24.0, 16.0),
    };

    final content = loading
        ? SizedBox(
            width: fontSize,
            height: fontSize,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(fg),
            ),
          )
        : Row(
            mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (leadingIcon != null) ...[
                Icon(leadingIcon, size: fontSize + 2, color: fg),
                const SizedBox(width: 8),
              ],
              Text(label, style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: fontSize,
                fontWeight: FontWeight.w500,
                color: fg,
                height: 1.2,
              )),
              if (trailingIcon != null) ...[
                const SizedBox(width: 8),
                Icon(trailingIcon, size: fontSize + 2, color: fg),
              ],
            ],
          );

    return Opacity(
      opacity: isEnabled ? 1.0 : 0.55,
      child: Material(
        color: bg,
        borderRadius: const BorderRadius.all(VidyaRadius.md),
        child: InkWell(
          onTap: isEnabled ? onPressed : null,
          borderRadius: const BorderRadius.all(VidyaRadius.md),
          child: Container(
            height: h,
            padding: EdgeInsets.symmetric(horizontal: padH),
            decoration: border != null
                ? BoxDecoration(
                    border: Border.all(color: border),
                    borderRadius: const BorderRadius.all(VidyaRadius.md),
                  )
                : null,
            alignment: Alignment.center,
            child: content,
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
cd apps/mobile && flutter test test/vidya/widgets_test.dart
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_button.dart \
        apps/mobile/test/vidya/widgets_test.dart
git commit -m "feat(vidya): VidyaButton primitive"
```

---

## Tasks 7–19: Remaining 13 widgets (uniform pattern)

Each widget follows the same TDD pattern as Task 6:

1. **Test:** append 1-3 widget tests to `widgets_test.dart` checking render + dark mode + all personas + all densities (where state-dependent variants exist, also test the variants).
2. **Run:** `flutter test test/vidya/widgets_test.dart` → fail.
3. **Implement:** in `packages/design-tokens-flutter/lib/src/vidya/widgets/<name>.dart`.
4. **Run:** pass.
5. **Commit:** `feat(vidya): Vidya<X> primitive`.

Widget implementations follow. Each is a single self-contained file under `packages/design-tokens-flutter/lib/src/vidya/widgets/`.

### Task 7: VidyaCard

**Test additions:**
```dart
testWidgets('VidyaCard renders child + responds to tap when onTap set', (tester) async {
  var taps = 0;
  await tester.pumpWidget(_harness(
    child: VidyaCard(onTap: () => taps++, child: const Text('inside')),
  ));
  expect(find.text('inside'), findsOneWidget);
  await tester.tap(find.byType(VidyaCard));
  expect(taps, 1);
});

testWidgets('VidyaCard all tones render', (tester) async {
  for (final t in VidyaCardTone.values) {
    await tester.pumpWidget(_harness(
      child: VidyaCard(tone: t, child: const Text('x')),
    ));
    expect(find.byType(VidyaCard), findsOneWidget);
  }
});
```

**Implementation:**
```dart
// vidya_card.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaCardTone { defaultTone, muted, accent, dark }

class VidyaCard extends StatelessWidget {
  final Widget child;
  final VidyaCardTone tone;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final BorderRadius borderRadius;

  const VidyaCard({
    super.key,
    required this.child,
    this.tone = VidyaCardTone.defaultTone,
    this.padding,
    this.onTap,
    this.borderRadius = const BorderRadius.all(VidyaRadius.lg),
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final (bg, fg) = switch (tone) {
      VidyaCardTone.defaultTone => (v.card, v.ink),
      VidyaCardTone.muted       => (v.paper2, v.ink2),
      VidyaCardTone.accent      => (v.accentSoft, v.ink),
      VidyaCardTone.dark        => (const Color(0xFF0C0F14), const Color(0xFFF1EEE7)),
    };
    final pad = padding ?? EdgeInsets.all(v.density.cardP);

    final body = DefaultTextStyle.merge(
      style: TextStyle(color: fg, fontFamily: VidyaFonts.ui),
      child: Padding(padding: pad, child: child),
    );

    final card = Material(
      color: bg,
      borderRadius: borderRadius,
      child: tone == VidyaCardTone.defaultTone
          ? Container(
              decoration: BoxDecoration(
                borderRadius: borderRadius,
                border: Border.all(color: v.rule, width: 1),
              ),
              child: body,
            )
          : body,
    );

    if (onTap == null) return card;
    return InkWell(
      onTap: onTap,
      borderRadius: borderRadius,
      child: card,
    );
  }
}
```

### Task 8: VidyaTextField

**Test:**
```dart
testWidgets('VidyaTextField renders label and accepts input', (tester) async {
  final controller = TextEditingController();
  await tester.pumpWidget(_harness(
    child: VidyaTextField(label: 'Email', controller: controller),
  ));
  expect(find.text('Email'), findsOneWidget);
  await tester.enterText(find.byType(TextField), 'a@b.c');
  expect(controller.text, 'a@b.c');
});

testWidgets('VidyaTextField error state renders error text', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaTextField(label: 'X', error: 'invalid'),
  ));
  expect(find.text('invalid'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_text_field.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaTextField extends StatelessWidget {
  final String label;
  final String? hint;
  final String? helper;
  final String? error;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final IconData? prefixIcon;
  final IconData? suffixIcon;
  final VoidCallback? onSuffixTap;
  final bool obscure;
  final bool enabled;
  final TextInputType? keyboardType;
  final int? maxLines;

  const VidyaTextField({
    super.key,
    required this.label,
    this.hint,
    this.helper,
    this.error,
    this.controller,
    this.onChanged,
    this.prefixIcon,
    this.suffixIcon,
    this.onSuffixTap,
    this.obscure = false,
    this.enabled = true,
    this.keyboardType,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final hasError = error != null && error!.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          style: VidyaText.overline(v.ink3),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          onChanged: onChanged,
          obscureText: obscure,
          enabled: enabled,
          keyboardType: keyboardType,
          maxLines: obscure ? 1 : maxLines,
          style: VidyaText.body(v.ink),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: VidyaText.body(v.ink4),
            filled: true,
            fillColor: v.paper2,
            prefixIcon: prefixIcon == null ? null : Icon(prefixIcon, color: v.ink3, size: 18),
            suffixIcon: suffixIcon == null
                ? null
                : IconButton(
                    icon: Icon(suffixIcon, color: v.ink3, size: 18),
                    onPressed: onSuffixTap,
                  ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: const BorderRadius.all(VidyaRadius.md),
              borderSide: BorderSide(color: v.rule),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: const BorderRadius.all(VidyaRadius.md),
              borderSide: BorderSide(color: hasError ? v.bad : v.rule),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: const BorderRadius.all(VidyaRadius.md),
              borderSide: BorderSide(color: hasError ? v.bad : v.accent, width: 1.5),
            ),
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: 6),
          Text(error!, style: VidyaText.bodySm(v.bad)),
        ] else if (helper != null) ...[
          const SizedBox(height: 6),
          Text(helper!, style: VidyaText.bodySm(v.ink3)),
        ],
      ],
    );
  }
}
```

### Task 9: VidyaScaffold

**Test:**
```dart
testWidgets('VidyaScaffold renders body', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaScaffold(body: Text('hello')),
  ));
  expect(find.text('hello'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_scaffold.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Widget? floatingActionButton;
  final bool safeArea;
  final EdgeInsetsGeometry? padding;

  const VidyaScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.bottomNavigationBar,
    this.floatingActionButton,
    this.safeArea = true,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    Widget content = body;
    if (padding != null) content = Padding(padding: padding!, child: content);
    if (safeArea) content = SafeArea(child: content);
    return Scaffold(
      backgroundColor: v.paper,
      appBar: appBar,
      bottomNavigationBar: bottomNavigationBar,
      floatingActionButton: floatingActionButton,
      body: content,
    );
  }
}
```

### Task 10: VidyaAppBar

**Test:**
```dart
testWidgets('VidyaAppBar renders title', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaScaffold(
      appBar: VidyaAppBar(title: 'Vidya'),
      body: SizedBox(),
    ),
  ));
  expect(find.text('Vidya'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_app_bar.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final Widget? leading;
  final List<Widget>? actions;
  final bool centerTitle;
  final bool serif;

  const VidyaAppBar({
    super.key,
    this.title,
    this.leading,
    this.actions,
    this.centerTitle = false,
    this.serif = false,
  });

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return AppBar(
      backgroundColor: v.paper,
      surfaceTintColor: v.paper,
      foregroundColor: v.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: centerTitle,
      leading: leading,
      title: title == null
          ? null
          : Text(
              title!,
              style: serif
                  ? VidyaText.displayXs(v.ink)
                  : TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                    ),
            ),
      actions: actions,
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Container(color: v.rule, height: 1),
      ),
    );
  }
}
```

### Task 11: VidyaChip

**Test:**
```dart
testWidgets('VidyaChip toggles selection on tap', (tester) async {
  var taps = 0;
  await tester.pumpWidget(_harness(
    child: VidyaChip(label: 'NEET', onTap: () => taps++),
  ));
  await tester.tap(find.byType(VidyaChip));
  expect(taps, 1);
});
```

**Implementation:**
```dart
// vidya_chip.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaChipTone { neutral, accent }

class VidyaChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? leadingIcon;
  final VidyaChipTone tone;

  const VidyaChip({
    super.key,
    required this.label,
    this.selected = false,
    this.onTap,
    this.leadingIcon,
    this.tone = VidyaChipTone.neutral,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final Color bg, fg, border;
    if (selected) {
      bg = v.accentSoft;
      fg = v.accent;
      border = v.accent;
    } else if (tone == VidyaChipTone.accent) {
      bg = v.accentSoft;
      fg = v.accent;
      border = v.accentSoft;
    } else {
      bg = v.paper2;
      fg = v.ink2;
      border = v.rule;
    }
    return Material(
      color: bg,
      borderRadius: const BorderRadius.all(VidyaRadius.pill),
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(VidyaRadius.pill),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.all(VidyaRadius.pill),
            border: Border.all(color: border, width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leadingIcon != null) ...[
                Icon(leadingIcon, size: 14, color: fg),
                const SizedBox(width: 6),
              ],
              Text(label, style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 13,
                color: fg,
                fontWeight: FontWeight.w500,
              )),
            ],
          ),
        ),
      ),
    );
  }
}
```

### Task 12: VidyaBadge

**Test:**
```dart
testWidgets('VidyaBadge renders label for all tones', (tester) async {
  for (final t in VidyaBadgeTone.values) {
    await tester.pumpWidget(_harness(
      child: VidyaBadge(label: 'B', tone: t),
    ));
    expect(find.text('B'), findsOneWidget);
  }
});
```

**Implementation:**
```dart
// vidya_badge.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaBadgeTone { neutral, good, warn, bad, info }

class VidyaBadge extends StatelessWidget {
  final String label;
  final VidyaBadgeTone tone;

  const VidyaBadge({super.key, required this.label, this.tone = VidyaBadgeTone.neutral});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final (bg, fg) = switch (tone) {
      VidyaBadgeTone.neutral => (v.paper2, v.ink2),
      VidyaBadgeTone.good    => (v.accentSoft, v.accent),
      VidyaBadgeTone.warn    => (v.goldSoft, v.gold2),
      VidyaBadgeTone.bad     => (v.bad.withOpacity(0.12), v.bad),
      VidyaBadgeTone.info    => (v.info.withOpacity(0.12), v.info),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(VidyaRadius.sm),
      ),
      child: Text(label, style: TextStyle(
        fontFamily: VidyaFonts.mono,
        fontSize: 10.5,
        fontWeight: FontWeight.w500,
        color: fg,
        letterSpacing: 0.5,
      )),
    );
  }
}
```

### Task 13: VidyaAvatar

**Test:**
```dart
testWidgets('VidyaAvatar renders initials', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaAvatar(initials: 'AS'),
  ));
  expect(find.text('AS'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_avatar.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaAvatar extends StatelessWidget {
  final String initials;
  final String? imageUrl;
  final double size;

  const VidyaAvatar({
    super.key,
    required this.initials,
    this.imageUrl,
    this.size = 36,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: v.accentSoft,
        shape: BoxShape.circle,
        image: imageUrl != null
            ? DecorationImage(image: NetworkImage(imageUrl!), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: imageUrl != null
          ? null
          : Text(
              initials,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: size * 0.38,
                fontWeight: FontWeight.w600,
                color: v.accent,
              ),
            ),
    );
  }
}
```

### Task 14: VidyaSheet

**Test:**
```dart
testWidgets('VidyaSheet renders title and child', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaSheet(title: 'Filters', child: Text('body')),
  ));
  expect(find.text('Filters'), findsOneWidget);
  expect(find.text('body'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_sheet.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaSheet extends StatelessWidget {
  final String? title;
  final Widget child;
  final EdgeInsetsGeometry? padding;

  const VidyaSheet({super.key, this.title, required this.child, this.padding});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      decoration: BoxDecoration(
        color: v.card,
        borderRadius: const BorderRadius.vertical(top: VidyaRadius.xl),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: padding ?? EdgeInsets.all(v.density.cardP),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: v.rule2,
                    borderRadius: const BorderRadius.all(VidyaRadius.pill),
                  ),
                ),
              ),
              if (title != null) ...[
                const SizedBox(height: 16),
                Text(title!, style: VidyaText.displayXs(v.ink)),
              ],
              const SizedBox(height: 16),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
```

### Task 15: VidyaBanner

**Test:**
```dart
testWidgets('VidyaBanner renders message and respects tone', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaBanner(message: 'Offline mode', tone: VidyaBannerTone.warn),
  ));
  expect(find.text('Offline mode'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_banner.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaBannerTone { neutral, good, warn, bad, info }

class VidyaBanner extends StatelessWidget {
  final String message;
  final VidyaBannerTone tone;
  final IconData? leadingIcon;
  final Widget? action;

  const VidyaBanner({
    super.key,
    required this.message,
    this.tone = VidyaBannerTone.neutral,
    this.leadingIcon,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final (bg, fg) = switch (tone) {
      VidyaBannerTone.neutral => (v.paper2, v.ink2),
      VidyaBannerTone.good    => (v.accentSoft, v.accent2),
      VidyaBannerTone.warn    => (v.goldSoft, v.gold2),
      VidyaBannerTone.bad     => (v.bad.withOpacity(0.12), v.bad),
      VidyaBannerTone.info    => (v.info.withOpacity(0.12), v.info),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(VidyaRadius.md),
      ),
      child: Row(
        children: [
          if (leadingIcon != null) ...[
            Icon(leadingIcon, size: 16, color: fg),
            const SizedBox(width: 10),
          ],
          Expanded(child: Text(message, style: VidyaText.bodySm(fg))),
          if (action != null) ...[
            const SizedBox(width: 10),
            action!,
          ],
        ],
      ),
    );
  }
}
```

### Task 16: VidyaTag

**Test:**
```dart
testWidgets('VidyaTag renders label for subject tone', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaTag(label: 'Physics', subjectColor: Color(0xFF2F5D8C)),
  ));
  expect(find.text('Physics'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_tag.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaTag extends StatelessWidget {
  final String label;
  final Color? subjectColor;
  final Color? bucketColor;

  const VidyaTag({
    super.key,
    required this.label,
    this.subjectColor,
    this.bucketColor,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final dot = subjectColor ?? bucketColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: v.paper2,
        borderRadius: const BorderRadius.all(VidyaRadius.sm),
        border: Border.all(color: v.rule),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot != null) ...[
            Container(width: 6, height: 6, decoration: BoxDecoration(
              color: dot, shape: BoxShape.circle,
            )),
            const SizedBox(width: 6),
          ],
          Text(label, style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 12,
            color: v.ink2,
            fontWeight: FontWeight.w500,
          )),
        ],
      ),
    );
  }
}
```

### Task 17: VidyaAiTag (the gold dot — only place gold is used)

**Test:**
```dart
testWidgets('VidyaAiTag renders label in uppercase with gold dot', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaAiTag(label: 'Recommended now'),
  ));
  expect(find.text('RECOMMENDED NOW'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_ai_tag.dart
// The ONLY place gold is used as a primary color in the system.
// See ADR-0034 §4.
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaAiTag extends StatelessWidget {
  final String label;
  const VidyaAiTag({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6, height: 6,
          decoration: BoxDecoration(color: v.gold, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 10.5,
            fontWeight: FontWeight.w500,
            letterSpacing: 1.2,
            color: v.gold2,
          ),
        ),
      ],
    );
  }
}
```

### Task 18: VidyaMasteryBar

**Test:**
```dart
testWidgets('VidyaMasteryBar renders label and pct', (tester) async {
  await tester.pumpWidget(_harness(
    child: const VidyaMasteryBar(
      label: 'Kinematics',
      value: 0.85,
      bucket: VidyaMasteryBucket.mastered,
      pct: '85%',
    ),
  ));
  expect(find.text('Kinematics'), findsOneWidget);
  expect(find.text('85%'), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_mastery_bar.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaMasteryBucket { none, weak, dev, strong, mastered }

class VidyaMasteryBar extends StatelessWidget {
  final String label;
  final double value;            // 0..1
  final VidyaMasteryBucket bucket;
  final String? pct;
  final Color? leadingDotColor;

  const VidyaMasteryBar({
    super.key,
    required this.label,
    required this.value,
    required this.bucket,
    this.pct,
    this.leadingDotColor,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final fillColor = switch (bucket) {
      VidyaMasteryBucket.none     => v.mNone,
      VidyaMasteryBucket.weak     => v.mWeak,
      VidyaMasteryBucket.dev      => v.mDev,
      VidyaMasteryBucket.strong   => v.mStrong,
      VidyaMasteryBucket.mastered => v.mMastered,
    };
    final v01 = value.clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (leadingDotColor != null) ...[
              Container(width: 6, height: 6, decoration: BoxDecoration(
                color: leadingDotColor, shape: BoxShape.circle,
              )),
              const SizedBox(width: 8),
            ],
            Expanded(child: Text(label, style: VidyaText.body(v.ink))),
            if (pct != null) Text(pct!, style: VidyaText.mono(v.ink3)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: const BorderRadius.all(VidyaRadius.pill),
          child: Stack(
            children: [
              Container(height: 5, color: v.mNone),
              FractionallySizedBox(
                widthFactor: v01,
                child: Container(height: 5, color: fillColor),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
```

### Task 19: VidyaSparkline

**Test:**
```dart
testWidgets('VidyaSparkline renders without exception for a simple series', (tester) async {
  await tester.pumpWidget(_harness(
    child: const SizedBox(
      width: 200, height: 40,
      child: VidyaSparkline(values: [1, 2, 3, 2, 4, 5, 4, 6]),
    ),
  ));
  expect(find.byType(VidyaSparkline), findsOneWidget);
});
```

**Implementation:**
```dart
// vidya_sparkline.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaSparkline extends StatelessWidget {
  final List<double> values;
  final double strokeWidth;
  final Color? color;
  final Color? endDotColor;

  const VidyaSparkline({
    super.key,
    required this.values,
    this.strokeWidth = 1.5,
    this.color,
    this.endDotColor,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return CustomPaint(
      painter: _SparkPainter(
        values: values,
        stroke: color ?? v.accent,
        strokeWidth: strokeWidth,
        endDot: endDotColor,
      ),
      child: const SizedBox.expand(),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> values;
  final Color stroke;
  final double strokeWidth;
  final Color? endDot;

  _SparkPainter({
    required this.values,
    required this.stroke,
    required this.strokeWidth,
    required this.endDot,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final lo = values.reduce((a, b) => a < b ? a : b);
    final hi = values.reduce((a, b) => a > b ? a : b);
    final range = (hi - lo) == 0 ? 1.0 : (hi - lo);
    final dx = size.width / (values.length - 1);
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = size.height - ((values[i] - lo) / range) * size.height;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = stroke
        ..strokeWidth = strokeWidth
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    if (endDot != null) {
      final lastX = (values.length - 1) * dx;
      final lastY = size.height - ((values.last - lo) / range) * size.height;
      canvas.drawCircle(Offset(lastX, lastY), strokeWidth + 1.2, Paint()..color = endDot!);
    }
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) =>
      old.values != values || old.stroke != stroke || old.endDot != endDot;
}
```

For each of Tasks 7–19: after implementation runs and tests pass, commit:

```bash
git add packages/design-tokens-flutter/lib/src/vidya/widgets/<file>.dart \
        apps/mobile/test/vidya/widgets_test.dart
git commit -m "feat(vidya): Vidya<X> primitive"
```

---

## Task 20: VidyaGalleryScreen (debug visual sanity)

**Files:**
- Create: `apps/mobile/lib/screens/vidya_gallery_screen.dart`

**Purpose:** A screen that renders one of each primitive, theme/persona/density togglable, so a human can eyeball the foundation in a running app. Reachable behind a `kEnableVidyaGallery` const flag — not added to user-facing nav.

- [ ] **Step 1: Implement gallery screen**

```dart
// apps/mobile/lib/screens/vidya_gallery_screen.dart
// Debug-only visual sanity screen for the Vidya foundation.
// Phase 1: not wired into user nav. Reach it manually from
// vidya_app.dart via a temporary route during development.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../vidya/density_notifier.dart';
import '../vidya/persona_notifier.dart';
import '../vidya/theme_mode_notifier.dart';

class VidyaGalleryScreen extends StatefulWidget {
  final VidyaPersonaNotifier persona;
  final VidyaDensityNotifier density;
  final VidyaThemeModeNotifier themeMode;
  const VidyaGalleryScreen({
    super.key,
    required this.persona,
    required this.density,
    required this.themeMode,
  });

  @override
  State<VidyaGalleryScreen> createState() => _VidyaGalleryScreenState();
}

class _VidyaGalleryScreenState extends State<VidyaGalleryScreen> {
  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: const VidyaAppBar(title: 'Vidya gallery', serif: true),
      padding: EdgeInsets.all(v.density.cardP),
      body: ListView(
        children: [
          _section('Tokens · live', _tokensPreview(v)),
          _section('Controls', _controls()),
          _section('Buttons', Row(children: [
            VidyaButton(label: 'Primary',   onPressed: () {}),
            const SizedBox(width: 8),
            VidyaButton(label: 'Secondary', style: VidyaButtonStyle.secondary, onPressed: () {}),
            const SizedBox(width: 8),
            VidyaButton(label: 'Ghost',     style: VidyaButtonStyle.ghost,     onPressed: () {}),
          ])),
          _section('TextField', const VidyaTextField(label: 'Email', hint: 'you@vidya.app')),
          _section('Card · default', VidyaCard(child: Text('Default card', style: VidyaText.body(v.ink)))),
          _section('Card · dark',    VidyaCard(tone: VidyaCardTone.dark, child: const Text('Dark card', style: TextStyle(color: Colors.white)))),
          _section('Chip',  Row(children: [
            VidyaChip(label: 'NEET', selected: true, onTap: () {}),
            const SizedBox(width: 6),
            VidyaChip(label: 'JEE',  onTap: () {}),
          ])),
          _section('Badge',  Row(children: const [
            VidyaBadge(label: 'GOOD',    tone: VidyaBadgeTone.good),  SizedBox(width: 6),
            VidyaBadge(label: 'WARN',    tone: VidyaBadgeTone.warn),  SizedBox(width: 6),
            VidyaBadge(label: 'BAD',     tone: VidyaBadgeTone.bad),   SizedBox(width: 6),
            VidyaBadge(label: 'INFO',    tone: VidyaBadgeTone.info),
          ])),
          _section('Avatar',  const VidyaAvatar(initials: 'AS')),
          _section('Banner',  const VidyaBanner(message: 'Offline · 4 days of practice cached', tone: VidyaBannerTone.warn)),
          _section('Tag',     const VidyaTag(label: 'Physics · Thermo', subjectColor: Color(0xFF2F5D8C))),
          _section('AI tag',  const VidyaAiTag(label: 'Recommended now')),
          _section('Mastery', const VidyaMasteryBar(
            label: 'Kinematics', value: 0.85, bucket: VidyaMasteryBucket.mastered, pct: '85%',
          )),
          _section('Sparkline', SizedBox(
            width: 200, height: 40,
            child: VidyaSparkline(values: const [1, 2, 4, 3, 5, 4, 6, 7]),
          )),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _section(String title, Widget child) {
    final v = VidyaThemeData.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(), style: VidyaText.overline(v.ink3)),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _tokensPreview(VidyaThemeData v) => Wrap(spacing: 8, runSpacing: 8, children: [
    _swatch('paper', v.paper, v.ink),
    _swatch('paper2', v.paper2, v.ink),
    _swatch('accent', v.accent, v.paper),
    _swatch('gold', v.gold, v.paper),
    _swatch('good', v.good, v.paper),
    _swatch('warn', v.warn, v.paper),
    _swatch('bad',  v.bad,  v.paper),
    _swatch('info', v.info, v.paper),
  ]);

  Widget _swatch(String name, Color bg, Color fg) => Container(
    width: 72, height: 36,
    color: bg,
    alignment: Alignment.center,
    child: Text(name, style: TextStyle(color: fg, fontFamily: VidyaFonts.mono, fontSize: 10)),
  );

  Widget _controls() => Wrap(spacing: 12, runSpacing: 8, children: [
    DropdownButton<ThemeMode>(
      value: widget.themeMode.mode,
      onChanged: (m) => m == null ? null : widget.themeMode.setMode(m),
      items: const [
        DropdownMenuItem(value: ThemeMode.light,  child: Text('light')),
        DropdownMenuItem(value: ThemeMode.dark,   child: Text('dark')),
        DropdownMenuItem(value: ThemeMode.system, child: Text('system')),
      ],
    ),
    DropdownButton<VidyaPersona>(
      value: widget.persona.persona,
      onChanged: (p) => p == null ? null : widget.persona.setPersona(p),
      items: VidyaPersona.values
          .map((p) => DropdownMenuItem(value: p, child: Text(p.name)))
          .toList(),
    ),
    DropdownButton<VidyaDensity>(
      value: widget.density.density,
      onChanged: (d) => d == null ? null : widget.density.setDensity(d),
      items: VidyaDensity.values
          .map((d) => DropdownMenuItem(value: d, child: Text(d.name)))
          .toList(),
    ),
  ]);
}
```

- [ ] **Step 2: Analyze**

```bash
cd apps/mobile && flutter analyze lib/screens/vidya_gallery_screen.dart
```

Expected: 0 issues.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/screens/vidya_gallery_screen.dart
git commit -m "feat(vidya): VidyaGalleryScreen (debug-only)"
```

---

## Task 21: Final verification

- [ ] **Step 1: Full analyze**

```bash
cd packages/design-tokens-flutter && flutter analyze
cd apps/mobile && flutter analyze
```

Expected: 0 issues from both. Fix any new analyzer warnings before proceeding.

- [ ] **Step 2: Full test pass**

```bash
cd apps/mobile && flutter test test/vidya/
```

Expected: notifier tests (≈8) + widget tests (≈25+ across the 14 widgets) all pass.

- [ ] **Step 3: Debug build sanity (optional — may be slow)**

```bash
cd apps/mobile && flutter build apk --debug
```

Expected: build succeeds. If the local environment can't build Android (no SDK), skip with a note and rely on analyze + test.

- [ ] **Step 4: Pre-existing Aurora regression check**

```bash
cd apps/mobile && flutter test  # full suite
```

Expected: Aurora widget tests still pass; nothing new fails outside Vidya.

- [ ] **Step 5: Final commit / housekeeping**

If any straggler files (e.g., a missed export), commit them under `chore(vidya): post-foundation cleanup`. Then stop — Phase 1 complete.

---

## Self-review notes

- **Spec coverage:** every spec §6 file path appears in the file map above. §7 widget catalog has one task per primitive. §8 plumbing → Task 5. §9 acceptance criteria → Task 21.
- **Placeholder scan:** no TBDs or "implement later" — every step shows full code.
- **Type consistency:** `VidyaButton(label:, onPressed:, style:, size:, leadingIcon:, trailingIcon:, loading:, disabled:, fullWidth:)` matches Task 6 test usage; `VidyaCard(child:, tone:, padding:, onTap:, borderRadius:)` matches Task 7; `VidyaPersonaNotifier.persona/hasChosen/setPersona/reset/bootstrap` matches tests in Task 2.
- **Out of scope honored:** no `main.dart` swap, no Aurora edits, gallery debug-only, no bridge between Aurora/Vidya persona enums.
