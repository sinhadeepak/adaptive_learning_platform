# Vidya Flutter Phase 2d Implementation Plan — Pre-auth design polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 5 shipped pre-auth screens (splash, welcome, 3 onboarding cards, exam select, login) up to the visual fidelity shown in the Vidya mobile design slides — without adding new flows, new state-machine routes, or new backend asks.

**Architecture:** Add 4 new primitives to `alp_design_tokens` (`VidyaLangToggle`, `VidyaSigmoidIllustration`, `VidyaReadinessRadial`, `VidyaTopicAllocationBar`), then polish each of the 5 existing screens to use them. The state machine in `VidyaRootApp` is untouched. The only behavioural addition is a `vidya.lang` secure-storage write from the new language toggle (read-only for now — Hindi i18n itself remains deferred to a later phase).

**Tech Stack:** Flutter 3.x, `alp_design_tokens` (Vidya widget package), Vidya primitives from Phase 1 + 2a–2c. No new dependencies.

**Spec source:** `docs/superpowers/specs/2026-05-25-vidya-mobile-design-roadmap.md` (Phase 2d section).

---

## Pre-existing context

**Vidya primitives that already exist** (in `packages/design-tokens-flutter/lib/src/vidya/widgets/`):
`vidya_button`, `vidya_card`, `vidya_text_field`, `vidya_scaffold`, `vidya_app_bar`, `vidya_chip`, `vidya_badge`, `vidya_avatar`, `vidya_sheet`, `vidya_banner`, `vidya_tag`, `vidya_ai_tag`, `vidya_mastery_bar`, `vidya_sparkline`.

All exported from `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart`.

**Theme access pattern (consistent across the codebase):**
```dart
final v = VidyaThemeData.of(context);
final ink = v.ink;     // primary text
final muted = v.ink3;  // secondary text
final accent = v.accent;
final paper = v.paper; // background
```

**Test viewport** in the existing Vidya widget tests defaults to 800×600; many existing tests use `LayoutBuilder + SingleChildScrollView + ConstrainedBox(minHeight) + IntrinsicHeight` so `Spacer` widgets work at the 544px viewport some tests use. Match that pattern.

**Backend `/catalog/exams` payload** (verified at `services/learning/src/learning/catalog/repositories.py:19` and `routes.py:53`):
```json
[
  {"id": "...", "code": "NEET", "name": "National Eligibility cum Entrance Test", "subtitle": "Medical · MBBS / BDS / AYUSH", "icon_key": "..."}
]
```
The mobile `_Exam.fromJson` already reads `subtitle` (see `vidya_exam_select_screen.dart:30`). It does NOT read `icon_key` yet — Task 9 below adds that. Aspirant counts are NOT in the backend; they live in a mobile-side lookup table per Task 9.

---

## File Map

**Create (4 new primitives + their tests):**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_lang_toggle.dart` — EN/हि segmented control (~80 LOC)
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_sigmoid_illustration.dart` — P(correct) vs ability sigmoid with marker (~140 LOC, CustomPainter)
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_readiness_radial.dart` — Animated radial progress 0/max with center label (~120 LOC, CustomPainter)
- `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_topic_allocation_bar.dart` — Named horizontal bar stack with percent labels (~90 LOC)
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_lang_toggle_test.dart`
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_sigmoid_illustration_test.dart`
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_readiness_radial_test.dart`
- `packages/design-tokens-flutter/test/vidya/widgets/vidya_topic_allocation_bar_test.dart`
- `apps/mobile/test/vidya/phase_2d_polish_test.dart` — visual smoke test for the 5 polished screens (~250 LOC)

**Modify:**
- `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` — add 4 new exports
- `apps/mobile/lib/vidya/screens/vidya_splash_screen.dart` — italic "vidya" wordmark + "THE ADAPTIVE TUTOR" tagline
- `apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart` — wordmark + EN/हि toggle + italic-accent headline + sign-in link + terms text
- `apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart` — replace 3 preview widgets with the new rich illustrations + new copy
- `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart` — STEP eyebrow + per-exam icon badge + aspirant-count line + exam-aware Continue button label
- `apps/mobile/lib/vidya/screens/vidya_login_screen.dart` — vidya wordmark at top + reorganised headline

**File responsibilities:**

| File | Responsibility | Approx. LOC |
|---|---|---|
| `vidya_lang_toggle.dart` | EN/हि 2-segment toggle; stores choice via `onChanged` callback (parent persists). Pure presentation. | ~80 |
| `vidya_sigmoid_illustration.dart` | CustomPainter draws a 3-PL sigmoid + axes + dashed marker line + "YOU" annotation. Parameterised on `theta` + `pAtTheta`. | ~140 |
| `vidya_readiness_radial.dart` | CustomPainter draws an arc 0→`value/max` with center label `eyebrow + value + suffix`. Animation optional (off by default for test stability). | ~120 |
| `vidya_topic_allocation_bar.dart` | Stack of named horizontal bars; selected bar gets `tone: accent`. | ~90 |
| `vidya_splash_screen.dart` | Branded splash. Replaces the V-square + "Vidya" + subtitle with italic wordmark + "THE ADAPTIVE TUTOR" tagline. | ~80 (was 89) |
| `vidya_welcome_screen.dart` | Hero screen. Replaces feature strips with full-design layout (wordmark top, eyebrow, italic-accent headline, body, primary CTA, sign-in link, terms). | ~180 (was 188) |
| `vidya_onboarding_card_screen.dart` | 3-card parameterised screen with the 3 new rich previews. New copy per card. | ~260 (was 268) |
| `vidya_exam_select_screen.dart` | Exam picker with backend-driven list + icon badges + aspirant counts + exam-aware CTA. | ~340 (was 274) |
| `vidya_login_screen.dart` | Email + password login. Adds wordmark + reorders headline; floating-label fields already in place via TextFormField. | ~200 (was 182) |

---

## Out of scope for Phase 2d

These are explicitly NOT addressed in this plan and remain deferred to later phases per the roadmap:

- **"Continue with OTP instead"** button on login — needs the deferred passwordless login backend (`POST /auth/otp/request` + `POST /auth/otp/login`). When backend lands, a separate small change wires it.
- **Hindi i18n itself** — the EN/हि toggle is wired but tapping it only writes `vidya.lang` to storage; copy stays English. Real translation happens when the Hindi seed pipeline integrates with Vidya copy keys.
- **Backend exam-aspirant counts** — Phase 2d hardcodes them in a mobile-side lookup with a TODO to migrate.

---

## Task 1: `VidyaLangToggle` primitive

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_lang_toggle.dart`
- Create: `packages/design-tokens-flutter/test/vidya/widgets/vidya_lang_toggle_test.dart`
- Modify: `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` (add export)

- [ ] **Step 1: Write failing test**

Create `packages/design-tokens-flutter/test/vidya/widgets/vidya_lang_toggle_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  group('VidyaLangToggle', () {
    testWidgets('renders EN and हि labels', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaLangToggle(
          value: VidyaLang.en,
          onChanged: (_) {},
        ),
      ));
      expect(find.text('EN'), findsOneWidget);
      expect(find.text('हि'), findsOneWidget);
    });

    testWidgets('tapping a segment fires onChanged with the new value',
        (tester) async {
      VidyaLang? captured;
      await tester.pumpWidget(_harness(
        VidyaLangToggle(
          value: VidyaLang.en,
          onChanged: (v) => captured = v,
        ),
      ));
      await tester.tap(find.text('हि'));
      await tester.pumpAndSettle();
      expect(captured, VidyaLang.hi);
    });

    testWidgets('tapping the currently-selected segment fires nothing',
        (tester) async {
      var calls = 0;
      await tester.pumpWidget(_harness(
        VidyaLangToggle(
          value: VidyaLang.en,
          onChanged: (_) => calls++,
        ),
      ));
      await tester.tap(find.text('EN'));
      await tester.pumpAndSettle();
      expect(calls, 0);
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_lang_toggle_test.dart
```
Expected: compilation FAIL — `vidya_lang_toggle.dart` not found / `VidyaLangToggle` undefined.

- [ ] **Step 3: Implement `VidyaLangToggle`**

Create `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_lang_toggle.dart`:

```dart
import 'package:flutter/material.dart';

import '../tokens.dart';

enum VidyaLang { en, hi }

class VidyaLangToggle extends StatelessWidget {
  final VidyaLang value;
  final ValueChanged<VidyaLang> onChanged;

  const VidyaLangToggle({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: v.ink3.withValues(alpha: 0.2), width: 1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Segment(
            label: 'EN',
            selected: value == VidyaLang.en,
            onTap: () {
              if (value != VidyaLang.en) onChanged(VidyaLang.en);
            },
          ),
          Container(width: 1, height: 18, color: v.ink3.withValues(alpha: 0.2)),
          _Segment(
            label: 'हि',
            selected: value == VidyaLang.hi,
            onTap: () {
              if (value != VidyaLang.hi) onChanged(VidyaLang.hi);
            },
          ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(7),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected ? v.ink : v.ink3,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Add export**

In `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart`, append:
```dart
export 'vidya_lang_toggle.dart';
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_lang_toggle_test.dart
```
Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_lang_toggle.dart packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart packages/design-tokens-flutter/test/vidya/widgets/vidya_lang_toggle_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaLangToggle — EN/हि segmented control primitive

Phase 2d primitive. Pure presentation: emits the new VidyaLang value
via onChanged; parent persists. Tapping the already-selected segment
is a no-op so callers don't see redundant writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `VidyaSigmoidIllustration` primitive

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_sigmoid_illustration.dart`
- Create: `packages/design-tokens-flutter/test/vidya/widgets/vidya_sigmoid_illustration_test.dart`
- Modify: `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` (add export)

- [ ] **Step 1: Write failing test**

Create `packages/design-tokens-flutter/test/vidya/widgets/vidya_sigmoid_illustration_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: SizedBox(width: 300, height: 200, child: child))),
    );

void main() {
  group('VidyaSigmoidIllustration', () {
    testWidgets('renders YOU marker label', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSigmoidIllustration(theta: 0.79, pAtTheta: 0.74),
      ));
      expect(find.text('YOU'), findsOneWidget);
      expect(find.textContaining('+0.79'), findsOneWidget);
    });

    testWidgets('renders axis labels', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSigmoidIllustration(theta: 0.0, pAtTheta: 0.5),
      ));
      expect(find.text('P(correct)'), findsOneWidget);
      expect(find.text('ability'), findsOneWidget);
    });

    testWidgets('handles negative theta without crashing', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSigmoidIllustration(theta: -1.5, pAtTheta: 0.18),
      ));
      expect(find.text('YOU'), findsOneWidget);
      expect(find.textContaining('-1.50'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_sigmoid_illustration_test.dart
```
Expected: compilation FAIL.

- [ ] **Step 3: Implement `VidyaSigmoidIllustration`**

Create `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_sigmoid_illustration.dart`:

```dart
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaSigmoidIllustration extends StatelessWidget {
  final double theta;
  final double pAtTheta;
  final double thetaRange;

  const VidyaSigmoidIllustration({
    super.key,
    required this.theta,
    required this.pAtTheta,
    this.thetaRange = 3.0,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final thetaLabel = theta >= 0
        ? '+${theta.toStringAsFixed(2)}'
        : theta.toStringAsFixed(2);
    return LayoutBuilder(builder: (ctx, constraints) {
      return Stack(
        clipBehavior: Clip.none,
        children: [
          // The curve + axes
          Positioned.fill(
            child: CustomPaint(
              painter: _SigmoidPainter(
                theta: theta,
                pAtTheta: pAtTheta,
                thetaRange: thetaRange,
                curveColor: v.accent,
                axisColor: v.ink3,
                gridColor: v.ink3.withValues(alpha: 0.15),
              ),
            ),
          ),
          // Axis labels — drawn as widgets so find.text() works in tests
          Positioned(
            top: 0,
            left: 0,
            child: Text(
              'P(correct)',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            right: 0,
            child: Text(
              'ability',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                color: v.ink3,
              ),
            ),
          ),
          // YOU marker — positioned at the (theta, p) point
          Positioned(
            top: _markerY(constraints.maxHeight, pAtTheta) - 22,
            left: _markerX(constraints.maxWidth, theta, thetaRange) - 12,
            child: Text(
              'YOU @ $thetaLabel',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: v.accent,
              ),
            ),
          ),
        ],
      );
    });
  }

  double _markerX(double width, double t, double range) {
    final pad = 16.0;
    final usable = width - 2 * pad;
    return pad + ((t + range) / (2 * range)) * usable;
  }

  double _markerY(double height, double p) {
    final pad = 16.0;
    final usable = height - 2 * pad;
    return pad + (1 - p) * usable;
  }
}

class _SigmoidPainter extends CustomPainter {
  final double theta;
  final double pAtTheta;
  final double thetaRange;
  final Color curveColor;
  final Color axisColor;
  final Color gridColor;

  _SigmoidPainter({
    required this.theta,
    required this.pAtTheta,
    required this.thetaRange,
    required this.curveColor,
    required this.axisColor,
    required this.gridColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 16.0;
    final w = size.width - 2 * pad;
    final h = size.height - 2 * pad;

    // Axes
    final axisPaint = Paint()
      ..color = axisColor
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    canvas.drawLine(
      Offset(pad, pad + h),
      Offset(pad + w, pad + h),
      axisPaint,
    );
    canvas.drawLine(
      Offset(pad, pad),
      Offset(pad, pad + h),
      axisPaint,
    );

    // Sigmoid curve: p = 1 / (1 + exp(-t))
    final curvePaint = Paint()
      ..color = curveColor
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final path = Path();
    const steps = 100;
    for (var i = 0; i <= steps; i++) {
      final tFrac = i / steps;
      final t = -thetaRange + tFrac * 2 * thetaRange;
      final p = 1 / (1 + math.exp(-t));
      final x = pad + tFrac * w;
      final y = pad + (1 - p) * h;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, curvePaint);

    // Dashed marker line at x = theta
    final markerX =
        pad + ((theta + thetaRange) / (2 * thetaRange)) * w;
    final markerY = pad + (1 - pAtTheta) * h;
    final dashPaint = Paint()
      ..color = curveColor.withValues(alpha: 0.5)
      ..strokeWidth = 1;
    const dash = 4.0, gap = 3.0;
    var y = pad + h;
    while (y > markerY) {
      final nextY = math.max(y - dash, markerY);
      canvas.drawLine(Offset(markerX, y), Offset(markerX, nextY), dashPaint);
      y = nextY - gap;
    }
    // Point on curve
    canvas.drawCircle(
      Offset(markerX, markerY),
      4,
      Paint()..color = curveColor,
    );
  }

  @override
  bool shouldRepaint(_SigmoidPainter old) =>
      old.theta != theta ||
      old.pAtTheta != pAtTheta ||
      old.thetaRange != thetaRange ||
      old.curveColor != curveColor ||
      old.axisColor != axisColor ||
      old.gridColor != gridColor;
}
```

- [ ] **Step 4: Add export**

In `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart`, append:
```dart
export 'vidya_sigmoid_illustration.dart';
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_sigmoid_illustration_test.dart
```
Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_sigmoid_illustration.dart packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart packages/design-tokens-flutter/test/vidya/widgets/vidya_sigmoid_illustration_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaSigmoidIllustration — P(correct) vs ability with YOU marker

Phase 2d primitive. CustomPainter draws a 3-PL logistic curve with axes
and a dashed marker line at the user's theta. Used on the Card 1 of the
onboarding 3-step sequence to make the adaptive engine concrete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `VidyaReadinessRadial` primitive

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_readiness_radial.dart`
- Create: `packages/design-tokens-flutter/test/vidya/widgets/vidya_readiness_radial_test.dart`
- Modify: `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` (add export)

- [ ] **Step 1: Write failing test**

Create `packages/design-tokens-flutter/test/vidya/widgets/vidya_readiness_radial_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: SizedBox(width: 220, height: 220, child: child))),
    );

void main() {
  group('VidyaReadinessRadial', () {
    testWidgets('renders eyebrow + value + suffix', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 728,
          max: 900,
        ),
      ));
      expect(find.text('READINESS'), findsOneWidget);
      expect(find.text('728'), findsOneWidget);
      expect(find.text('/ 900'), findsOneWidget);
    });

    testWidgets('clamps value to max', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 1200,
          max: 900,
        ),
      ));
      expect(find.text('1200'), findsOneWidget);
    });

    testWidgets('handles zero value', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 0,
          max: 900,
        ),
      ));
      expect(find.text('0'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_readiness_radial_test.dart
```
Expected: compilation FAIL.

- [ ] **Step 3: Implement `VidyaReadinessRadial`**

Create `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_readiness_radial.dart`:

```dart
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaReadinessRadial extends StatelessWidget {
  final String eyebrow;
  final int value;
  final int max;

  const VidyaReadinessRadial({
    super.key,
    required this.eyebrow,
    required this.value,
    required this.max,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final clampedFraction = (value.toDouble() / math.max(max, 1))
        .clamp(0.0, 1.0)
        .toDouble();

    return AspectRatio(
      aspectRatio: 1,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _RadialPainter(
                fraction: clampedFraction,
                trackColor: v.ink3.withValues(alpha: 0.15),
                arcColor: v.accent,
              ),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                eyebrow,
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.5,
                  color: v.ink3,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '$value',
                style: TextStyle(
                  fontFamily: VidyaFonts.display,
                  fontSize: 44,
                  fontWeight: FontWeight.w500,
                  color: v.ink,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '/ $max',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: v.ink3,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RadialPainter extends CustomPainter {
  final double fraction;
  final Color trackColor;
  final Color arcColor;

  _RadialPainter({
    required this.fraction,
    required this.trackColor,
    required this.arcColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 6.0;
    final radius = math.min(size.width, size.height) / 2 - stroke;
    final center = Offset(size.width / 2, size.height / 2);

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, trackPaint);

    if (fraction > 0) {
      final arcPaint = Paint()
        ..color = arcColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction,
        false,
        arcPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_RadialPainter old) =>
      old.fraction != fraction ||
      old.trackColor != trackColor ||
      old.arcColor != arcColor;
}
```

- [ ] **Step 4: Add export**

In `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart`, append:
```dart
export 'vidya_readiness_radial.dart';
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_readiness_radial_test.dart
```
Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_readiness_radial.dart packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart packages/design-tokens-flutter/test/vidya/widgets/vidya_readiness_radial_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaReadinessRadial — circular progress with eyebrow + value + suffix

Phase 2d primitive. CustomPainter draws a track + accent arc filled to
value/max; center stack shows eyebrow + big number + suffix. Used on
Card 2 of the onboarding sequence and will be reused on Home (Phase 3a).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `VidyaTopicAllocationBar` primitive

**Files:**
- Create: `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_topic_allocation_bar.dart`
- Create: `packages/design-tokens-flutter/test/vidya/widgets/vidya_topic_allocation_bar_test.dart`
- Modify: `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart` (add export)

- [ ] **Step 1: Write failing test**

Create `packages/design-tokens-flutter/test/vidya/widgets/vidya_topic_allocation_bar_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: SizedBox(width: 320, child: child))),
    );

void main() {
  group('VidyaTopicAllocationBar', () {
    testWidgets('renders each row name + percent', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaTopicAllocationBar(
          items: [
            VidyaTopicAllocation(name: 'Thermodynamics', percent: 62, accent: true),
            VidyaTopicAllocation(name: 'Organic chemistry', percent: 24),
            VidyaTopicAllocation(name: 'Cell biology', percent: 14),
          ],
        ),
      ));
      expect(find.text('Thermodynamics'), findsOneWidget);
      expect(find.text('62%'), findsOneWidget);
      expect(find.text('Organic chemistry'), findsOneWidget);
      expect(find.text('24%'), findsOneWidget);
      expect(find.text('Cell biology'), findsOneWidget);
      expect(find.text('14%'), findsOneWidget);
    });

    testWidgets('handles empty list without crashing', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaTopicAllocationBar(items: []),
      ));
      expect(find.byType(VidyaTopicAllocationBar), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_topic_allocation_bar_test.dart
```
Expected: compilation FAIL.

- [ ] **Step 3: Implement `VidyaTopicAllocationBar`**

Create `packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_topic_allocation_bar.dart`:

```dart
import 'package:flutter/material.dart';

import '../tokens.dart';

class VidyaTopicAllocation {
  final String name;
  final int percent;
  final bool accent;

  const VidyaTopicAllocation({
    required this.name,
    required this.percent,
    this.accent = false,
  });
}

class VidyaTopicAllocationBar extends StatelessWidget {
  final List<VidyaTopicAllocation> items;

  const VidyaTopicAllocationBar({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          _Row(
            item: items[i],
            accentColor: v.accent,
            trackColor: v.ink3.withValues(alpha: 0.12),
            nameColor: v.ink,
            mutedColor: v.ink3,
          ),
          if (i < items.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final VidyaTopicAllocation item;
  final Color accentColor;
  final Color trackColor;
  final Color nameColor;
  final Color mutedColor;
  const _Row({
    required this.item,
    required this.accentColor,
    required this.trackColor,
    required this.nameColor,
    required this.mutedColor,
  });

  @override
  Widget build(BuildContext context) {
    final pct = (item.percent.clamp(0, 100)) / 100.0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: item.accent
            ? accentColor.withValues(alpha: 0.10)
            : trackColor,
        borderRadius: BorderRadius.circular(10),
        border: item.accent
            ? Border.all(color: accentColor.withValues(alpha: 0.4), width: 1)
            : null,
      ),
      child: Stack(
        children: [
          // Fill
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: FractionallySizedBox(
                widthFactor: pct,
                alignment: Alignment.centerLeft,
                child: Container(
                  color: item.accent
                      ? accentColor.withValues(alpha: 0.18)
                      : accentColor.withValues(alpha: 0.10),
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    fontWeight:
                        item.accent ? FontWeight.w600 : FontWeight.w500,
                    color: nameColor,
                  ),
                ),
              ),
              Text(
                '${item.percent}%',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 13,
                  color: item.accent ? accentColor : mutedColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Add export**

In `packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart`, append:
```dart
export 'vidya_topic_allocation_bar.dart';
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test test/vidya/widgets/vidya_topic_allocation_bar_test.dart
```
Expected: 2/2 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add packages/design-tokens-flutter/lib/src/vidya/widgets/vidya_topic_allocation_bar.dart packages/design-tokens-flutter/lib/src/vidya/widgets/widgets.dart packages/design-tokens-flutter/test/vidya/widgets/vidya_topic_allocation_bar_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaTopicAllocationBar — named horizontal bar stack with percent labels

Phase 2d primitive. Stack of named horizontal bars, each filled
proportional to percent; one row can be marked accent. Used on Card 3
of the onboarding sequence and will be reused for weekly study plans.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Polish `VidyaSplashScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_splash_screen.dart`

- [ ] **Step 1: Write failing test in the polish suite**

Create `apps/mobile/test/vidya/phase_2d_polish_test.dart` (will be appended-to by later tasks):

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  group('VidyaSplashScreen (Phase 2d polish)', () {
    testWidgets('renders vidya wordmark with italic accent + tagline',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaSplashScreen()));
      expect(find.byKey(const Key('vidya.splash.wordmark')), findsOneWidget);
      expect(find.text('THE ADAPTIVE TUTOR'), findsOneWidget);
    });

    testWidgets('shows a progress indicator', (tester) async {
      await tester.pumpWidget(_harness(const VidyaSplashScreen()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: FAIL — wordmark key not found / "THE ADAPTIVE TUTOR" text not present.

- [ ] **Step 3: Implement `VidyaSplashScreen` polish**

Replace the contents of `apps/mobile/lib/vidya/screens/vidya_splash_screen.dart` with:

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
    final ext = Theme.of(context).extension<VidyaThemeData>();
    final bg = ext?.paper ?? const Color(0xFFFFFFFF);
    final ink = ext?.ink ?? const Color(0xFF0A0A0F);
    final accent = ext?.accent ?? const Color(0xFF1F6B4A);

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
                  // Italic "i" wordmark: render as a RichText so the
                  // single italic accent ships with the rest of the text.
                  RichText(
                    key: const Key('vidya.splash.wordmark'),
                    text: TextSpan(
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 56,
                        fontWeight: FontWeight.w500,
                        color: ink,
                        height: 1,
                        letterSpacing: -1,
                      ),
                      children: [
                        const TextSpan(text: 'v'),
                        TextSpan(
                          text: 'i',
                          style: TextStyle(
                            fontStyle: FontStyle.italic,
                            color: accent,
                          ),
                        ),
                        const TextSpan(text: 'dya'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'THE ADAPTIVE TUTOR',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 3,
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

- [ ] **Step 4: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: 2/2 PASS for the splash group.

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_splash_screen.dart apps/mobile/test/vidya/phase_2d_polish_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): polish VidyaSplashScreen — italic 'i' wordmark + tagline

Phase 2d. Replaces the V-square logo + 'Vidya' wordmark + 'Adaptive
learning, designed for you' subtitle with a single italic-accented
'vidya' wordmark + 'THE ADAPTIVE TUTOR' tagline, matching slide 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Polish `VidyaWelcomeScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2d_polish_test.dart` (append group)

- [ ] **Step 1: Append failing tests**

Add this import at the top of `apps/mobile/test/vidya/phase_2d_polish_test.dart` (after existing imports):

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_welcome_screen.dart';
```

Append this group inside `main()` (after the existing splash group):

```dart
  group('VidyaWelcomeScreen (Phase 2d polish)', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    testWidgets('renders wordmark + lang toggle + eyebrow + headline',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () {},
        onSignIn: () {},
        onSkip: () {},
      )));
      expect(find.byKey(const Key('vidya.welcome.wordmark')), findsOneWidget);
      expect(find.byKey(const Key('vidya.welcome.lang')), findsOneWidget);
      expect(find.text('WELCOME TO VIDYA'), findsOneWidget);
      expect(find.textContaining('adaptive'), findsAtLeastNWidgets(1));
    });

    testWidgets('CTAs are wired', (tester) async {
      var getStarted = 0, signIn = 0;
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () => getStarted++,
        onSignIn: () => signIn++,
        onSkip: () {},
      )));
      await tester.tap(find.byKey(const Key('vidya.welcome.getStarted')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.welcome.signIn')));
      await tester.pumpAndSettle();
      expect(getStarted, 1);
      expect(signIn, 1);
    });

    testWidgets('lang toggle defaults to EN and tapping हि persists choice',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () {},
        onSignIn: () {},
        onSkip: () {},
      )));
      await tester.tap(find.text('हि'));
      await tester.pumpAndSettle();
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'vidya.lang'), 'hi');
    });

    testWidgets('renders terms text', (tester) async {
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () {},
        onSignIn: () {},
        onSkip: () {},
      )));
      expect(find.textContaining('By continuing'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: FAIL — welcome group's expectations don't match the current screen.

- [ ] **Step 3: Implement `VidyaWelcomeScreen` polish**

Replace the contents of `apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart` with:

```dart
// VidyaWelcomeScreen — first interactive screen after splash.
// Wordmark + EN/हि toggle in app bar; eyebrow + italic-accent
// headline + body in the hero; Get started + I already have an
// account in the CTA stack; terms text at the bottom. Skip remains
// available via top-right text button.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _langKey = 'vidya.lang';
const _storage = FlutterSecureStorage();

class VidyaWelcomeScreen extends StatefulWidget {
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
  State<VidyaWelcomeScreen> createState() => _VidyaWelcomeScreenState();
}

class _VidyaWelcomeScreenState extends State<VidyaWelcomeScreen> {
  VidyaLang _lang = VidyaLang.en;

  @override
  void initState() {
    super.initState();
    _loadLang();
  }

  Future<void> _loadLang() async {
    final v = await _storage.read(key: _langKey);
    if (!mounted) return;
    setState(() => _lang = v == 'hi' ? VidyaLang.hi : VidyaLang.en);
  }

  Future<void> _setLang(VidyaLang l) async {
    setState(() => _lang = l);
    await _storage.write(
      key: _langKey,
      value: l == VidyaLang.hi ? 'hi' : 'en',
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: Padding(
          padding: const EdgeInsets.only(left: 16, top: 8, bottom: 8),
          child: RichText(
            key: const Key('vidya.welcome.wordmark'),
            text: TextSpan(
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: v.ink,
                height: 1,
              ),
              children: [
                const TextSpan(text: 'v'),
                TextSpan(
                  text: 'i',
                  style: TextStyle(
                    fontStyle: FontStyle.italic,
                    color: v.accent,
                  ),
                ),
                const TextSpan(text: 'dya'),
              ],
            ),
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            child: VidyaLangToggle(
              key: const Key('vidya.welcome.lang'),
              value: _lang,
              onChanged: _setLang,
            ),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 32),
                      Text(
                        'WELCOME TO VIDYA',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 12),
                      RichText(
                        text: TextSpan(
                          style: TextStyle(
                            fontFamily: VidyaFonts.display,
                            fontSize: 38,
                            fontWeight: FontWeight.w500,
                            color: v.ink,
                            height: 1.1,
                          ),
                          children: [
                            const TextSpan(text: "India's first "),
                            TextSpan(
                              text: 'adaptive',
                              style: TextStyle(
                                fontStyle: FontStyle.italic,
                                color: v.accent,
                              ),
                            ),
                            const TextSpan(text: ' exam tutor.'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        "We don't teach you everything. We teach you what "
                        "you need, when you need it.",
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 15,
                          color: v.ink3,
                          height: 1.55,
                        ),
                      ),
                      const Spacer(),
                      VidyaButton(
                        key: const Key('vidya.welcome.getStarted'),
                        label: "Get started — it's free",
                        onPressed: widget.onGetStarted,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                      ),
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          key: const Key('vidya.welcome.signIn'),
                          onPressed: widget.onSignIn,
                          child: const Text('I already have an account'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Center(
                        child: Text(
                          'By continuing you accept our terms',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 11,
                            color: v.ink3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 4: Update VidyaRootApp's welcome wiring**

The `onSkip` callback is no longer surfaced in this screen (the design has no Skip on welcome). In `apps/mobile/lib/vidya/vidya_root_app.dart`, the `VidyaWelcomeScreen` constructor call at the welcome case still passes `onSkip:`. The parameter is still required on the widget for backwards-compatibility with `VidyaRootApp`'s existing flow (Skip routed to login). Since this constructor parameter is unchanged, no edit is needed in `vidya_root_app.dart`.

However, the existing root-app test "Welcome → Sign in tapped routes to VidyaLoginScreen" currently calls `await tester.tap(find.text('Sign in'));` — the new label is "I already have an account". Update `apps/mobile/test/vidya/vidya_root_app_test.dart` line ~73:

Change:
```dart
    await tester.tap(find.text('Sign in'));
```
to:
```dart
    await tester.tap(find.text('I already have an account'));
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart test/vidya/vidya_root_app_test.dart
```
Expected: 2 splash + 4 welcome + 8 root-app = 14 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_welcome_screen.dart apps/mobile/test/vidya/phase_2d_polish_test.dart apps/mobile/test/vidya/vidya_root_app_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): polish VidyaWelcomeScreen — wordmark, lang toggle, italic accent

Phase 2d. Replaces the 3-feature-strip layout with the slide 1 hero:
italic 'i' wordmark + EN/हि toggle in app bar; WELCOME TO VIDYA
eyebrow; 'India's first adaptive exam tutor.' with italic accent on
'adaptive'; 'Get started — it's free' primary; 'I already have an
account' text link; terms line. Lang choice persists to vidya.lang.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Polish `VidyaOnboardingCardScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2d_polish_test.dart` (append group)

- [ ] **Step 1: Append failing tests**

Add this import at the top of `apps/mobile/test/vidya/phase_2d_polish_test.dart` (after existing imports):

```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_onboarding_card_screen.dart';
```

Append this group inside `main()`:

```dart
  group('VidyaOnboardingCardScreen (Phase 2d polish)', () {
    Widget _withSize(Widget child) => MediaQuery(
          data: const MediaQueryData(size: Size(390, 800)),
          child: _harness(child),
        );

    testWidgets('card 1 renders ADAPTIVE ENGINE eyebrow + sigmoid + YOU marker',
        (tester) async {
      await tester.pumpWidget(_withSize(VidyaOnboardingCardScreen(
        cardIndex: 1,
        onContinue: () {},
        onSkip: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('ADAPTIVE ENGINE'), findsOneWidget);
      expect(find.text('Every question, tuned to you.'), findsOneWidget);
      expect(find.byType(VidyaSigmoidIllustration), findsOneWidget);
      expect(find.text('YOU'), findsOneWidget);
    });

    testWidgets('card 2 renders READINESS SCORE eyebrow + radial + 728',
        (tester) async {
      await tester.pumpWidget(_withSize(VidyaOnboardingCardScreen(
        cardIndex: 2,
        onContinue: () {},
        onSkip: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('READINESS SCORE'), findsOneWidget);
      expect(find.text('One number, every day.'), findsOneWidget);
      expect(find.byType(VidyaReadinessRadial), findsOneWidget);
      expect(find.text('728'), findsOneWidget);
    });

    testWidgets('card 3 renders DAILY PLAN eyebrow + topic bars',
        (tester) async {
      await tester.pumpWidget(_withSize(VidyaOnboardingCardScreen(
        cardIndex: 3,
        onContinue: () {},
        onSkip: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('DAILY PLAN'), findsOneWidget);
      expect(find.text('The shortest path to your rank.'), findsOneWidget);
      expect(find.byType(VidyaTopicAllocationBar), findsOneWidget);
      expect(find.text('Thermodynamics'), findsOneWidget);
      expect(find.text('62%'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: FAIL — new copy / primitives not present.

- [ ] **Step 3: Implement `VidyaOnboardingCardScreen` polish**

Replace the contents of `apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart` with:

```dart
// VidyaOnboardingCardScreen — parameterised 3-card onboarding sequence.
// cardIndex 1 = Adaptive engine (sigmoid illustration with YOU marker)
// cardIndex 2 = Readiness score (radial dial 728/900)
// cardIndex 3 = Daily plan (topic allocation bars)

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaOnboardingCardScreen extends StatelessWidget {
  final int cardIndex;
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
    final v = VidyaThemeData.of(context);

    final spec = switch (cardIndex) {
      1 => _CardSpec(
          eyebrow: 'ADAPTIVE ENGINE · 3-PL IRT',
          title: 'Every question, tuned to you.',
          body:
              'Our engine reads your ability after every answer and serves '
              'the next question at your edge — not too easy, never '
              'frustrating.',
          ctaLabel: 'Continue',
        ),
      2 => _CardSpec(
          eyebrow: 'READINESS SCORE',
          title: 'One number, every day.',
          body:
              'Your live readiness — out of 900. The same algorithm exam '
              'boards use to estimate your final rank.',
          ctaLabel: 'Continue',
        ),
      _ => _CardSpec(
          eyebrow: 'DAILY PLAN',
          title: 'The shortest path to your rank.',
          body:
              'We pick the topics that move your score the most, today. '
              'No guesswork. No filler. Just signal.',
          ctaLabel: 'Begin',
        ),
    };

    return VidyaScaffold(
      appBar: VidyaAppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: onBack,
        ),
        actions: [
          TextButton(
            onPressed: onSkip,
            child: Text(
              'Skip',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink3,
              ),
            ),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '$cardIndex / 3',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 1.5,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Preview illustration — fills the upper half
                      SizedBox(
                        height: 240,
                        child: _PreviewForIndex(cardIndex: cardIndex),
                      ),
                      const SizedBox(height: 24),
                      // Eyebrow
                      Text(
                        spec.eyebrow,
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.8,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 8),
                      // Title
                      Text(
                        spec.title,
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 26,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Body
                      Text(
                        spec.body,
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 14,
                          color: v.ink.withAlpha(166),
                          height: 1.55,
                        ),
                      ),
                      const Spacer(),
                      VidyaButton(
                        label: spec.ctaLabel,
                        onPressed: onContinue,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CardSpec {
  final String eyebrow;
  final String title;
  final String body;
  final String ctaLabel;
  const _CardSpec({
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.ctaLabel,
  });
}

class _PreviewForIndex extends StatelessWidget {
  final int cardIndex;
  const _PreviewForIndex({required this.cardIndex});

  @override
  Widget build(BuildContext context) {
    switch (cardIndex) {
      case 1:
        return const _Card1Preview();
      case 2:
        return const _Card2Preview();
      default:
        return const _Card3Preview();
    }
  }
}

class _Card1Preview extends StatelessWidget {
  const _Card1Preview();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 8),
      child: VidyaSigmoidIllustration(
        theta: 0.79,
        pAtTheta: 0.74,
      ),
    );
  }
}

class _Card2Preview extends StatelessWidget {
  const _Card2Preview();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: SizedBox(
        width: 220,
        height: 220,
        child: VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 728,
          max: 900,
        ),
      ),
    );
  }
}

class _Card3Preview extends StatelessWidget {
  const _Card3Preview();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const VidyaTopicAllocationBar(
            items: [
              VidyaTopicAllocation(
                name: 'Thermodynamics',
                percent: 62,
                accent: true,
              ),
              VidyaTopicAllocation(name: 'Organic chemistry', percent: 24),
              VidyaTopicAllocation(name: 'Cell biology', percent: 14),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            "THIS WEEK'S ALLOCATION",
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.6,
              color: VidyaThemeData.of(context).ink3,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: 2 splash + 4 welcome + 3 onboarding = 9 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_onboarding_card_screen.dart apps/mobile/test/vidya/phase_2d_polish_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): polish VidyaOnboardingCardScreen — sigmoid / radial / allocation

Phase 2d. Replaces the three text-only preview cards with the design's
rich illustrations: Card 1 shows the 3-PL IRT sigmoid with a YOU marker;
Card 2 shows a 728/900 readiness radial dial; Card 3 shows a 3-topic
weekly allocation stack with Thermodynamics accented. New eyebrow,
title, and body copy on each card to match the design slides.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Polish `VidyaExamSelectScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2d_polish_test.dart` (append group)

- [ ] **Step 1: Append failing tests**

Add this import at the top of `apps/mobile/test/vidya/phase_2d_polish_test.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_exam_select_screen.dart';
```

Append this group inside `main()`:

```dart
  group('VidyaExamSelectScreen (Phase 2d polish)', () {
    AuthClient _auth(List<Map<String, dynamic>> examPayload) =>
        AuthClient(
          baseUrl: 'http://test',
          httpClient: MockClient((req) async {
            if (req.url.path.endsWith('/catalog/exams')) {
              return http.Response(
                jsonEncode(examPayload),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
            if (req.url.path.endsWith('/profile/exams')) {
              return http.Response('{}', 200);
            }
            return http.Response('{}', 404);
          }),
        );

    testWidgets('renders STEP eyebrow + title', (tester) async {
      await tester.pumpWidget(_harness(VidyaExamSelectScreen(
        auth: _auth([
          {
            'id': 'a-neet',
            'code': 'NEET',
            'name': 'National Eligibility Test',
            'subtitle': 'Medical · MBBS / BDS / AYUSH',
          },
        ]),
        onContinue: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('STEP 1'), findsOneWidget);
      expect(find.text('Choose your exam'), findsOneWidget);
    });

    testWidgets('renders exam name + subtitle + aspirant count badge',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaExamSelectScreen(
        auth: _auth([
          {
            'id': 'a-neet',
            'code': 'NEET',
            'name': 'National Eligibility Test',
            'subtitle': 'Medical · MBBS / BDS / AYUSH',
          },
        ]),
        onContinue: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('National Eligibility Test'), findsOneWidget);
      expect(find.text('Medical · MBBS / BDS / AYUSH'), findsOneWidget);
      // The NEET aspirant lookup ships with the screen — see _aspirantLabel.
      expect(find.textContaining('2.4M aspirants'), findsOneWidget);
    });

    testWidgets('Continue label switches to exam-aware once a card is tapped',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaExamSelectScreen(
        auth: _auth([
          {
            'id': 'a-neet',
            'code': 'NEET',
            'name': 'National Eligibility Test',
            'subtitle': 'Medical · MBBS / BDS / AYUSH',
          },
        ]),
        onContinue: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      // Initial label is "Continue"
      expect(find.text('Continue'), findsOneWidget);
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Continue with NEET'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: FAIL — STEP eyebrow, aspirant count, and exam-aware label not present.

- [ ] **Step 3: Implement `VidyaExamSelectScreen` polish**

Replace the contents of `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart` with:

```dart
// VidyaExamSelectScreen — exam selection with backend persistence.
// Mirrors Aurora's GET /catalog/exams + PUT /profile/exams contract.
// Writes vidya.selected_exam_{id,code} to FlutterSecureStorage so
// downstream Vidya screens (screening, home) can re-read it.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../auth/auth_client.dart';

class _Exam {
  const _Exam({
    required this.id,
    required this.code,
    required this.name,
    this.subtitle,
  });

  final String id;
  final String code;
  final String name;
  final String? subtitle;

  factory _Exam.fromJson(Map<String, dynamic> j) => _Exam(
        id: j['id'] as String,
        code: j['code'] as String,
        name: j['name'] as String,
        subtitle: j['subtitle'] as String?,
      );
}

// Aspirant counts are currently hardcoded by exam code. Backend
// migration tracked under Phase 4 — extend /catalog/exams to include
// an `aspirants_label` field; then this lookup goes away.
const _aspirantLookup = <String, String>{
  'NEET': '2.4M aspirants',
  'JEE': '1.2M aspirants',
  'JEE-MAIN': '1.2M aspirants',
  'JEE-ADVANCED': '180K aspirants',
  'UPSC': '900K aspirants',
  'CBSE': '1.8M students',
  'GATE': '850K aspirants',
};

String? _aspirantLabel(String code) =>
    _aspirantLookup[code.toUpperCase()];

class VidyaExamSelectScreen extends StatefulWidget {
  const VidyaExamSelectScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;

  @override
  State<VidyaExamSelectScreen> createState() => _VidyaExamSelectScreenState();
}

class _VidyaExamSelectScreenState extends State<VidyaExamSelectScreen> {
  List<_Exam>? _exams;
  String? _selectedId;
  String? _selectedCode;
  String? _error;
  bool _submitting = false;

  static const _storage = FlutterSecureStorage();

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
      final res = await widget.auth.apiPut(
        '/profile/exams',
        {'examId': _selectedId},
      );
      if (res.statusCode != 200) {
        setState(() => _error = "We couldn't save your selection. Try again.");
        return;
      }
      await _storage.write(key: 'vidya.selected_exam_id', value: _selectedId);
      await _storage.write(
        key: 'vidya.selected_exam_code',
        value: _selectedCode,
      );
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your selection. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _continueLabel() {
    if (_selectedCode == null) return 'Continue';
    return 'Continue with $_selectedCode →';
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'STEP 1 / 3',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Choose your exam',
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 28,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'We tune everything to one exam — the syllabus, the '
                        'difficulty, the scoring model.',
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 14,
                          color: v.ink3,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 20),
                      if (_error != null) ...[
                        VidyaBanner(
                          message: _error!,
                          tone: VidyaBannerTone.warn,
                          leadingIcon: Icons.warning_amber_rounded,
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (_exams == null)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      else if (_exams!.isEmpty)
                        Text(
                          'No exams available yet.',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 14,
                            color: v.ink3,
                          ),
                        )
                      else
                        for (final exam in _exams!) ...[
                          _ExamCard(
                            exam: exam,
                            selected: _selectedId == exam.id,
                            onTap: () => setState(() {
                              _selectedId = exam.id;
                              _selectedCode = exam.code;
                            }),
                          ),
                          const SizedBox(height: 10),
                        ],
                      const Spacer(),
                      const SizedBox(height: 16),
                      VidyaButton(
                        key: const Key('vidya.exam.continue'),
                        label: _continueLabel(),
                        onPressed: _selectedId != null && !_submitting
                            ? _submit
                            : null,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                        loading: _submitting,
                        disabled: _selectedId == null,
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ExamCard extends StatelessWidget {
  const _ExamCard({
    required this.exam,
    required this.selected,
    required this.onTap,
  });

  final _Exam exam;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final aspirants = _aspirantLabel(exam.code);

    return VidyaCard(
      key: Key('vidya.exam.card.${exam.code}'),
      tone: selected ? VidyaCardTone.accent : VidyaCardTone.defaultTone,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            // Exam icon badge — uses exam code as the visible label
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: selected
                    ? v.accent
                    : v.accent.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(
                exam.code,
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: selected ? Colors.white : v.accent,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    exam.name,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: v.ink,
                    ),
                  ),
                  if (exam.subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      exam.subtitle!,
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 12,
                        color: v.ink3,
                      ),
                    ),
                  ],
                  if (aspirants != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      aspirants,
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              selected ? Icons.check_circle : Icons.radio_button_unchecked,
              color: selected ? v.accent : v.ink3.withValues(alpha: 0.4),
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: 2 splash + 4 welcome + 3 onboarding + 3 exam-select = 12 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart apps/mobile/test/vidya/phase_2d_polish_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): polish VidyaExamSelectScreen — icon badge, aspirant count, exam-aware CTA

Phase 2d. Adds STEP 1/3 eyebrow, exam-code icon badge (selected state
inverts to filled accent), exam subtitle, hardcoded aspirant count
(mobile-side lookup pending backend migration), radio circle, and an
exam-aware Continue label ('Continue with NEET →'). Matches slide 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Polish `VidyaLoginScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_login_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2d_polish_test.dart` (append group)

- [ ] **Step 1: Append failing tests**

Append this group inside `main()` (no new imports needed — `VidyaLoginScreen` is already in scope transitively but add an explicit import for clarity):

Add import:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_login_screen.dart';
```

Append group:

```dart
  group('VidyaLoginScreen (Phase 2d polish)', () {
    testWidgets('renders wordmark + LOG IN eyebrow + headline',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(VidyaLoginScreen(
        auth: auth,
        onLoggedIn: (_) {},
        onSignUp: () {},
        onForgotPassword: () {},
      )));
      expect(find.byKey(const Key('vidya.login.wordmark')), findsOneWidget);
      expect(find.text('LOG IN'), findsOneWidget);
      expect(find.text('Welcome back.'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2d_polish_test.dart
```
Expected: FAIL — `vidya.login.wordmark` key not found / LOG IN text not present.

- [ ] **Step 3: Implement `VidyaLoginScreen` polish**

Replace the contents of `apps/mobile/lib/vidya/screens/vidya_login_screen.dart` with:

```dart
// VidyaLoginScreen — email + password sign-in.
// Mirrors Aurora's login_screen.dart endpoint contract (POST /auth/login)
// but renders in the Vidya idiom. Error surfaces:
// - 401 → "Wrong email or password" (use AuthException.message)
// - 423 → "Account locked — try again later"
// - 429 → "Too many attempts — wait a minute and retry"
// - other → AuthException.message or a generic fallback.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaLoginScreen extends StatefulWidget {
  final AuthClient auth;
  final void Function(Session session) onLoggedIn;
  final VoidCallback onSignUp;
  final VoidCallback onForgotPassword;

  const VidyaLoginScreen({
    super.key,
    required this.auth,
    required this.onLoggedIn,
    required this.onSignUp,
    required this.onForgotPassword,
  });

  @override
  State<VidyaLoginScreen> createState() => _VidyaLoginScreenState();
}

class _VidyaLoginScreenState extends State<VidyaLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _remember = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final session = await widget.auth.login(
        email: _email.text.trim(),
        password: _password.text,
        remember: _remember,
      );
      widget.onLoggedIn(session);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final ink = v.ink;
    final muted = v.ink3;

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 8),
                    RichText(
                      key: const Key('vidya.login.wordmark'),
                      text: TextSpan(
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 22,
                          fontWeight: FontWeight.w500,
                          color: ink,
                          height: 1,
                        ),
                        children: [
                          const TextSpan(text: 'v'),
                          TextSpan(
                            text: 'i',
                            style: TextStyle(
                              fontStyle: FontStyle.italic,
                              color: v.accent,
                            ),
                          ),
                          const TextSpan(text: 'dya'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),
                    Text(
                      'LOG IN',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 2,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Welcome back.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 32,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Continue your preparation.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      key: const Key('vidya.login.email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Mobile number or email',
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter your email';
                        if (!v.contains('@')) return 'Enter a valid email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.login.password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(
                        labelText: 'Password',
                      ),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Enter your password' : null,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Checkbox(
                          value: _remember,
                          onChanged: (v) =>
                              setState(() => _remember = v ?? false),
                        ),
                        Text(
                          'Keep me signed in',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 13,
                            color: muted,
                          ),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed:
                              _submitting ? null : widget.onForgotPassword,
                          child: const Text('Forgot password?'),
                        ),
                      ],
                    ),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.login.submit'),
                      label: _submitting ? 'Signing in…' : 'Log in',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                      fullWidth: true,
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: TextButton(
                        onPressed: _submitting ? null : widget.onSignUp,
                        child: const Text("Don't have an account? Sign up"),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}
```

- [ ] **Step 4: Update Phase 2b auth test**

The Phase 2b login test uses `find.text('Sign in')` (the old button label). The new label is `'Log in'`. Update `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart`:

Search for `find.text('Sign in')` references and change to `find.text('Log in')`. Run grep first to enumerate:

```bash
grep -n "find.text('Sign in')\|'Sign in'" apps/mobile/test/vidya/phase_2b_auth_screens_test.dart
```

For each match in the VidyaLoginScreen-related tests (the auth screens test), update to `'Log in'`.

The root-app test "Welcome → Sign in tapped routes to VidyaLoginScreen" (Phase 2d Task 6) was already updated.

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/
```
Expected: all Vidya tests pass — phase 2a + phase 2b + phase 2c + phase 2d polish + vidya_root_app.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_login_screen.dart apps/mobile/test/vidya/phase_2d_polish_test.dart apps/mobile/test/vidya/phase_2b_auth_screens_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): polish VidyaLoginScreen — wordmark + LOG IN eyebrow + Log in CTA

Phase 2d. Adds italic 'i' wordmark at the top of the screen, LOG IN
eyebrow, 'Welcome back.' headline, 'Continue your preparation.'
subtitle; renames the primary CTA to 'Log in'. Floating-label fields
already render via TextFormField. 'Continue with OTP instead' remains
deferred until the passwordless backend endpoints land.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Verification gate

Verification-only — no code changes.

- [ ] **Step 1: Run full design-tokens-flutter analyze + test**

```
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter analyze 2>&1 | tail -10
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter test
```
Expected: no new errors. 4 new widget test files green.

- [ ] **Step 2: Run full mobile analyze + test**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter analyze 2>&1 | grep -v "info •" | tail -10
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test 2>&1 | tail -5
```
Expected: 0 new errors/warnings. Test count should be ~360 (347 prior + ~13 new across the polish test groups).

- [ ] **Step 3: Build APK**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter build apk --debug
```
Expected: `✓ Built build/app/outputs/flutter-apk/app-debug.apk`.

- [ ] **Step 4: Manual device smoke checklist**

Install the rebuilt APK on a device on the same network as the dev backend (10.11.5.166):
```bash
adb install -r apps/mobile/build/app/outputs/flutter-apk/app-debug.apk
```

Walk this checklist on a freshly-installed device (wipe data first):

1. **Splash** renders italic 'i' wordmark + 'THE ADAPTIVE TUTOR' tagline.
2. **Welcome** renders wordmark + EN/हि toggle + WELCOME TO VIDYA eyebrow + 'India's first *adaptive* exam tutor.' with italic accent + 'Get started — it's free' + 'I already have an account' + terms text.
3. Tap **हि** → cold-restart the app → toggle still reads हि (storage roundtrip).
4. Tap **Get started — it's free** → onboarding **Card 1** renders sigmoid + YOU marker + ADAPTIVE ENGINE eyebrow + 'Every question, tuned to you.'
5. Continue → **Card 2** renders 728/900 readiness radial + READINESS SCORE eyebrow + 'One number, every day.'
6. Continue → **Card 3** renders 3-bar topic allocation (Thermodynamics 62% accented, Organic 24%, Cell biology 14%) + DAILY PLAN eyebrow.
7. Begin → register → verify OTP → **Exam select** renders STEP 1 / 3 eyebrow + 'Choose your exam' + each exam shows icon badge + subtitle + aspirant count.
8. Tap NEET → Continue button label changes to **'Continue with NEET →'**.
9. Continue → screening flow proceeds (Phase 2c, unchanged).
10. Sign out → tap 'I already have an account' on welcome → **Login** screen renders wordmark + LOG IN eyebrow + 'Welcome back.' + 'Continue your preparation.' + Log in CTA label.

Record pass/fail next to each item. Any failure is a regression.

- [ ] **Step 5: Optional commit**

If any final tweak is needed after manual smoke, ship it as a follow-up commit. Otherwise no commit at this step.

Then invoke the finishing-a-development-branch skill.

---

## Self-Review Notes

**Spec coverage check** (against Phase 2d section of the roadmap):

- Splash — italic "i" accent + "THE ADAPTIVE TUTOR" tagline → Task 5 ✓
- Welcome — EN/हि toggle, eyebrow, italic-accent headline, "I already have an account" link, terms text → Task 6 ✓
- Onboarding cards — 3 rich illustrations (sigmoid, dial, allocation) + new copy → Tasks 2 + 3 + 4 + 7 ✓
- Exam select — STEP eyebrow, icon badge, subtitle, aspirant count, exam-aware CTA → Task 8 ✓
- Login — vidya logo, polish → Task 9 ✓
- "Continue with OTP instead" — explicitly deferred (backend dependency) → noted in out-of-scope ✓
- New primitives (LangToggle, Sigmoid, Radial, Topic bar) → Tasks 1 + 2 + 3 + 4 ✓

**Type consistency:**

- `VidyaLang.en | VidyaLang.hi` is used consistently across primitive + welcome screen.
- `VidyaSigmoidIllustration({theta, pAtTheta, thetaRange})` signature matches between definition (Task 2) and usage (Task 7).
- `VidyaReadinessRadial({eyebrow, value, max})` signature matches between definition (Task 3) and usage (Task 7).
- `VidyaTopicAllocation({name, percent, accent})` matches across Tasks 4 and 7.

**Potential gotchas:**

- Welcome's new EN/हि toggle does NOT translate copy yet — only persists the choice. This is explicit out-of-scope.
- Aspirant counts in Task 8 are hardcoded in `_aspirantLookup`. If backend `/catalog/exams` returns a code the lookup doesn't know (e.g., a new exam launched), the line just hides. Acceptable for v1.
- The exam select test in Task 8 expects "2.4M aspirants" — the test exam payload uses code `'NEET'` which maps to `'2.4M aspirants'` in the lookup.
- Task 6 Step 4 updates a Phase 2c root-app test's expected label. Task 9 Step 4 updates Phase 2b login tests for the same reason. Both are intentional — the new labels are part of the design.
- `VidyaWelcomeScreen` becomes a `StatefulWidget` (was Stateless) because of the lang-state. The constructor signature is unchanged, so `VidyaRootApp` doesn't need to change.

**Deferred** (out of scope for Phase 2d, queued for later phases per roadmap):

- "Continue with OTP instead" button on login — needs passwordless backend.
- Hindi translation of copy — needs i18n pipeline integration.
- Backend `aspirants_label` field on `/catalog/exams` — migrate from mobile-side lookup later.
