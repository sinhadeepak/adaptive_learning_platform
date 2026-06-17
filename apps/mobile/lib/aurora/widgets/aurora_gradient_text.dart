// AuroraGradientText — Aurora v2 atom.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.1
//
// Renders text with a gradient fill (default: the Aurora AI gradient,
// cyan → violet). Reserved for hero moments — Lumi's name in the
// onboarding "Meet Lumi" beat, brand wordmarks on splash, milestone
// celebration headlines, AI-surface accents. Do NOT use for body
// copy or routine UI text.
//
// Why a separate widget?
// ──────────────────────
// Flutter's gradient text is one `ShaderMask` deep. Doing it inline
// every time means inconsistent shader stops, inconsistent fallback
// behaviour when the system can't render shaders (rare, but happens
// on very old Android), and inconsistent semantics. This widget
// centralises:
//   - the canonical Aurora AI gradient
//   - automatic fallback to the brand-600 solid colour when
//     `enabled` is false (Reduce Motion / a11y override)
//   - exposed `Semantics(label: text)` so screen-readers still read
//     the underlying string, not the shader

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class AuroraGradientText extends StatelessWidget {
  const AuroraGradientText(
    this.text, {
    super.key,
    this.style,
    this.gradient,
    this.textAlign,
    this.maxLines,
    this.enabled = true,
  });

  /// The text to render. Required.
  final String text;

  /// Override the base typography. Colour from this style is ignored —
  /// the gradient supplies the colour. Use it to set size / weight /
  /// spacing.
  final TextStyle? style;

  /// Override the Aurora AI gradient. Pass an `AuroraColors`-derived
  /// gradient (e.g. `colors.auroraCelebration`) for celebration
  /// moments.
  final Gradient? gradient;

  final TextAlign? textAlign;
  final int? maxLines;

  /// When false, renders the text in `colors.brand600` solid. Used
  /// for the Reduce Motion / dynamic-type-overflow fallback path.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final base =
        style ?? typography.h2.copyWith(fontWeight: FontWeight.w800);

    if (!enabled) {
      return Semantics(
        label: text,
        child: Text(
          text,
          textAlign: textAlign,
          maxLines: maxLines,
          overflow: maxLines == null ? null : TextOverflow.ellipsis,
          style: base.copyWith(color: colors.brand600),
        ),
      );
    }

    final shader = gradient ?? colors.auroraAi;
    return Semantics(
      label: text,
      child: ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (rect) => shader.createShader(rect),
        child: Text(
          text,
          textAlign: textAlign,
          maxLines: maxLines,
          overflow: maxLines == null ? null : TextOverflow.ellipsis,
          // White inside the shader; ShaderMask repaints with the
          // gradient. ShaderMask treats opaque white as 1.0 alpha for
          // BlendMode.srcIn so the gradient renders at full intensity.
          style: base.copyWith(color: Colors.white),
        ),
      ),
    );
  }
}
