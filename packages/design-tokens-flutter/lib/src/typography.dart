import 'package:flutter/painting.dart';
import 'colors.dart';

/// Source of truth: docs/ui/01_StudentPortal_Web/00_design-system.css.
/// `Outfit` is the canonical UI font; falls back to system + Roboto.
/// `Space Mono` for code / numerics.
class AlpFontFamily {
  static const String ui = 'Outfit';
  static const String mono = 'SpaceMono';
}

class AlpTextStyles {
  AlpTextStyles._();

  static const TextStyle pageTitle = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 20,
    fontWeight: FontWeight.w600,
    color: AlpColors.textPrimary,
  );

  static const TextStyle sectionHeading = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: AlpColors.textPrimary,
  );

  static const TextStyle subheading = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: AlpColors.textPrimary,
  );

  // Base body is 13px in design-system.css (was 14 in legacy mobile theme).
  static const TextStyle body = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: AlpColors.textSecondary,
  );

  static const TextStyle label = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: AlpColors.textSecondary,
  );

  static const TextStyle hint = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: AlpColors.textMuted,
  );

  static const TextStyle badge = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 11,
    fontWeight: FontWeight.w500,
  );

  static const TextStyle micro = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: AlpColors.textMuted,
  );

  // AI-feature styling — paired with the ◈ glyph at every callsite.
  static const TextStyle aiAccent = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: AlpColors.colorAi,
  );

  static const TextStyle buttonSm = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 12,
    fontWeight: FontWeight.w500,
  );
  static const TextStyle buttonMd = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 13,
    fontWeight: FontWeight.w500,
  );
  static const TextStyle buttonLg = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 14,
    fontWeight: FontWeight.w500,
  );
}
