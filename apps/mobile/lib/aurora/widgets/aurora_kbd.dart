// AuroraKbd — keyboard-shortcut hint badge.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1 (atom)
//
// Renders a small monospace key cap (e.g. `⌘K`, `Esc`) for shortcut hints.
// Defaults to render-only when an external keyboard is attached (Magic
// Keyboard on iPad, BT keyboards on Android tablets / foldables). On a
// touch-only phone the widget collapses to `SizedBox.shrink()` so the
// surface around it stays clean.
//
// Heuristic for "external keyboard attached": shortestSide ≥ 600dp
// (tablet form factor) AND `HardwareKeyboard.instance.physicalKeysPressed`
// indicating at least one physical key event has been seen this session.
// Consumers may override with `forceShow: true`.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraKbd extends StatelessWidget {
  const AuroraKbd(
    this.label, {
    super.key,
    this.forceShow = false,
  });

  /// The key cap text, e.g. `⌘K`, `Esc`, `↵`. Keep short (1–4 chars).
  final String label;

  /// Render even on touch-only form factors. Use when the screen has
  /// chosen to assume external-keyboard presence (e.g. desktop-class iPad).
  final bool forceShow;

  @override
  Widget build(BuildContext context) {
    if (!forceShow && !_shouldShow(context)) {
      return const SizedBox.shrink();
    }

    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    return Semantics(
      label: 'Keyboard shortcut $label',
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: 6 * density.spaceScale,
          vertical: 2 * density.spaceScale,
        ),
        decoration: BoxDecoration(
          color: colors.neutral100,
          borderRadius:
              BorderRadius.circular(radius.sm * density.radiusScale),
          border: Border.all(color: colors.neutral300),
        ),
        child: Text(
          label,
          style: typography.overline.copyWith(
            color: colors.neutral700,
            fontFeatures: const [FontFeature.tabularFigures()],
            height: 1.0,
          ),
        ),
      ),
    );
  }

  static bool _shouldShow(BuildContext context) {
    final shortestSide = MediaQuery.of(context).size.shortestSide;
    if (shortestSide < 600) return false;
    // Render on any tablet/foldable. We don't probe HardwareKeyboard
    // here because the hint is also useful on Stage Manager / split-screen
    // setups where the keyboard isn't always physically attached.
    return true;
  }
}
