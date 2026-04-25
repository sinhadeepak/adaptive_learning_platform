import 'package:flutter/painting.dart';

/// Mirror of packages/design-system/src/tokens/colors.ts.
/// Placeholder values — Designer locks in Sprint 0 Day 5.
class AlpColors {
  AlpColors._();

  // Brand + interactive
  static const Color brandPrimary = Color(0xFF2563EB);
  static const Color brandPrimaryHover = Color(0xFF1D4ED8);
  static const Color brandSecondary = Color(0xFF0F172A);
  static const Color brandTint = Color(0xFFEFF6FF);
  static const Color focusRing = Color(0xFFBFDBFE);

  // Semantic — foreground / background pairs
  static const Color successFg = Color(0xFF16A34A);
  static const Color successBg = Color(0xFFDCFCE7);
  static const Color warningFg = Color(0xFFD97706);
  static const Color warningBg = Color(0xFFFEF3C7);
  static const Color dangerFg = Color(0xFFDC2626);
  static const Color dangerBg = Color(0xFFFEE2E2);
  static const Color infoFg = Color(0xFF2563EB);
  static const Color infoBg = Color(0xFFDBEAFE);

  // Surfaces
  static const Color surfacePrimary = Color(0xFFFFFFFF);
  static const Color surfaceSecondary = Color(0xFFF8FAFC);
  static const Color surfaceTertiary = Color(0xFFF1F5F9);

  // Borders
  static const Color borderDefault = Color(0xFFE2E8F0);
  static const Color borderStrong = Color(0xFFCBD5E1);

  // Text
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF475569);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color textDisabled = Color(0xFFCBD5E1);
}
