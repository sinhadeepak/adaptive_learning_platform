// AuroraTypography — Aurora v2 type tokens for Flutter.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §7.2
//
// Mobile type scale — slightly tighter maxima than web (display 30 not
// 36, h1 24 not 28) because phones rarely benefit from those sizes.
// Density layer scales these via `AuroraDensity.typeScale`.
//
// Font selection happens at the ThemeData level: system SF Pro on iOS,
// Roboto on Android — both picked up automatically by Flutter's default
// `fontFamily: null` (system). Devanagari falls back to Noto Sans
// Devanagari (bundled via google_fonts) once Phase 5 localisation lands.

import 'package:flutter/material.dart';

class AuroraTypography extends ThemeExtension<AuroraTypography> {
  const AuroraTypography({
    required this.display,
    required this.h1,
    required this.h2,
    required this.h3,
    required this.h4,
    required this.bodyLg,
    required this.body,
    required this.bodySm,
    required this.label,
    required this.overline,
    required this.button,
    required this.mono,
  });

  /// Hero numbers — streak count on Profile, rank on Analysis.
  final TextStyle display;

  /// Page titles.
  final TextStyle h1;

  /// Section headings.
  final TextStyle h2;

  /// Card headings.
  final TextStyle h3;

  /// Subheadings, list group labels.
  final TextStyle h4;

  /// Reading content, lesson body, question stems.
  final TextStyle bodyLg;

  /// Default UI body.
  final TextStyle body;

  /// Secondary info, metadata rows.
  final TextStyle bodySm;

  /// Form labels, captions.
  final TextStyle label;

  /// Eyebrows, column headers — uppercase, tracked.
  final TextStyle overline;

  /// Button labels — 1pt larger than web because mobile uses fingers.
  final TextStyle button;

  /// Numbers, IDs, formula characters — tabular figures.
  final TextStyle mono;

  /// Builds the type scale tinted to the active text color (so the same
  /// styles render readably in light + dark without per-style overrides).
  factory AuroraTypography.from({required Color textPrimary}) {
    return AuroraTypography(
      display: TextStyle(
        fontSize: 30,
        height: 36 / 30,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.02 * 30,
        color: textPrimary,
      ),
      h1: TextStyle(
        fontSize: 24,
        height: 32 / 24,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.015 * 24,
        color: textPrimary,
      ),
      h2: TextStyle(
        fontSize: 20,
        height: 28 / 20,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.01 * 20,
        color: textPrimary,
      ),
      h3: TextStyle(
        fontSize: 17,
        height: 24 / 17,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.005 * 17,
        color: textPrimary,
      ),
      h4: TextStyle(
        fontSize: 15,
        height: 22 / 15,
        fontWeight: FontWeight.w600,
        color: textPrimary,
      ),
      bodyLg: TextStyle(
        fontSize: 16,
        height: 24 / 16,
        fontWeight: FontWeight.w400,
        color: textPrimary,
      ),
      body: TextStyle(
        fontSize: 14,
        height: 22 / 14,
        fontWeight: FontWeight.w400,
        color: textPrimary,
      ),
      bodySm: TextStyle(
        fontSize: 13,
        height: 18 / 13,
        fontWeight: FontWeight.w400,
        color: textPrimary,
      ),
      label: TextStyle(
        fontSize: 12,
        height: 16 / 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.01 * 12,
        color: textPrimary,
      ),
      overline: TextStyle(
        fontSize: 11,
        height: 14 / 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.08 * 11,
        color: textPrimary,
      ),
      button: TextStyle(
        fontSize: 15,
        height: 20 / 15,
        fontWeight: FontWeight.w600,
        color: textPrimary,
      ),
      mono: TextStyle(
        fontFamily: 'monospace',
        fontFamilyFallback: const [
          'SF Mono',
          'Roboto Mono',
          'Menlo',
          'monospace',
        ],
        fontSize: 14,
        height: 20 / 14,
        fontWeight: FontWeight.w500,
        fontFeatures: const [FontFeature.tabularFigures()],
        color: textPrimary,
      ),
    );
  }

  @override
  ThemeExtension<AuroraTypography> copyWith() => this;

  @override
  ThemeExtension<AuroraTypography> lerp(
    covariant ThemeExtension<AuroraTypography>? other,
    double t,
  ) {
    if (other is! AuroraTypography) return this;
    return t < 0.5 ? this : other;
  }
}
