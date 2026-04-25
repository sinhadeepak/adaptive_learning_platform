import 'package:flutter/painting.dart';
import 'colors.dart';

/// Typeface is TBD (Designer locks in Sprint 0). `-apple-system` / `Roboto` fall back.
class AlpFontFamily {
  static const String ui = 'Inter';
  static const String mono = 'JetBrainsMono';
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

  static const TextStyle body = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 14,
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

  static const TextStyle buttonSm = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 12,
    fontWeight: FontWeight.w500,
  );
  static const TextStyle buttonMd = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 14,
    fontWeight: FontWeight.w500,
  );
  static const TextStyle buttonLg = TextStyle(
    fontFamily: AlpFontFamily.ui,
    fontSize: 16,
    fontWeight: FontWeight.w500,
  );
}
