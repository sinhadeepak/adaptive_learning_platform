// AuroraTheme — builds the canonical Aurora `ThemeData` for the mobile
// app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §7 + §17
//
// Usage in apps/mobile/lib/main.dart:
//   MaterialApp(
//     theme:      AuroraTheme.light(density: density),
//     darkTheme:  AuroraTheme.dark(density: density),
//     themeMode:  themeMode,  // from ThemeModeNotifier
//     ...
//   )
//
// Every Aurora widget reads via `Theme.of(context).extension<X>()!`.
// Material 3 surface tinting is enabled; ColorScheme is seeded from
// brand-600 so any non-Aurora widget that falls through to Material
// defaults still picks up the brand.

import 'package:flutter/material.dart';

import 'aurora_colors.dart';
import 'aurora_density.dart';
import 'aurora_spacing.dart';
import 'aurora_typography.dart';
import 'persona.dart';
import 'persona_theme.dart';

abstract class AuroraTheme {
  AuroraTheme._();

  static ThemeData light({AuroraDensity? density, Persona? persona}) => _build(
        brightness: Brightness.light,
        density: density,
        persona: persona,
      );

  static ThemeData dark({AuroraDensity? density, Persona? persona}) => _build(
        brightness: Brightness.dark,
        density: density,
        persona: persona,
      );

  static ThemeData _build({
    required Brightness brightness,
    AuroraDensity? density,
    Persona? persona,
  }) {
    final colors = brightness == Brightness.light
        ? AuroraColors.light()
        : AuroraColors.dark();
    final den = density ?? AuroraDensity.aspirant();
    final personaTheme = PersonaTheme.forPersona(persona ?? Persona.aspirant);
    final typography = AuroraTypography.from(textPrimary: colors.neutral900);

    final scheme = ColorScheme.fromSeed(
      seedColor: colors.brand600,
      brightness: brightness,
    ).copyWith(
      primary: colors.brand600,
      onPrimary: colors.neutral0,
      surface: colors.neutral50,
      onSurface: colors.neutral900,
      surfaceContainerLowest: colors.neutral0,
      surfaceContainerLow: colors.neutral50,
      surfaceContainer: colors.neutral100,
      surfaceContainerHigh: colors.neutral200,
      surfaceContainerHighest: colors.neutral300,
      outline: colors.neutral300,
      outlineVariant: colors.neutral200,
      error: colors.danger600,
      onError: colors.neutral0,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: colors.neutral50,
      canvasColor: colors.neutral50,
      cardColor: colors.neutral0,
      dividerColor: colors.neutral200,
      // Text theme uses Aurora typography mapped to Material 3 slots.
      textTheme: TextTheme(
        displayLarge: typography.display,
        displayMedium: typography.display,
        displaySmall: typography.h1,
        headlineLarge: typography.h1,
        headlineMedium: typography.h2,
        headlineSmall: typography.h2,
        titleLarge: typography.h3,
        titleMedium: typography.h4,
        titleSmall: typography.label,
        bodyLarge: typography.bodyLg,
        bodyMedium: typography.body,
        bodySmall: typography.bodySm,
        labelLarge: typography.button,
        labelMedium: typography.label,
        labelSmall: typography.overline,
      ),
      // Density-aware visualDensity. VisualDensity ranges roughly -3..3.
      // We translate our scalars (0.85..1.20) into a small range that
      // makes Material's built-in widgets reflow gracefully.
      visualDensity: switch (den.mode) {
        AuroraDensityMode.junior =>
          const VisualDensity(horizontal: 1, vertical: 1),
        AuroraDensityMode.aspirant => VisualDensity.standard,
        AuroraDensityMode.pro => VisualDensity.compact,
      },
      // Material 3 component theming
      appBarTheme: AppBarTheme(
        backgroundColor: colors.neutral0,
        foregroundColor: colors.neutral900,
        elevation: 0,
        scrolledUnderElevation: 1,
        surfaceTintColor: colors.brand600,
        titleTextStyle: typography.h3,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.neutral0,
        surfaceTintColor: colors.brand600,
        elevation: 0,
        indicatorColor: colors.brand100,
        labelTextStyle: WidgetStatePropertyAll(typography.overline),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colors.brand600,
          foregroundColor: colors.neutral0,
          textStyle: typography.button,
          minimumSize: Size(0, den.touchTarget),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10 * den.radiusScale),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.brand600,
          side: BorderSide(color: colors.neutral300),
          textStyle: typography.button,
          minimumSize: Size(0, den.touchTarget),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10 * den.radiusScale),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors.brand600,
          textStyle: typography.button,
          minimumSize: Size(0, den.touchTarget),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.neutral0,
        contentPadding: EdgeInsets.symmetric(
          horizontal: 12 * den.spaceScale,
          vertical: 10 * den.spaceScale,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10 * den.radiusScale),
          borderSide: BorderSide(color: colors.neutral300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10 * den.radiusScale),
          borderSide: BorderSide(color: colors.neutral300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10 * den.radiusScale),
          borderSide: BorderSide(color: colors.brand500, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10 * den.radiusScale),
          borderSide: BorderSide(color: colors.danger500),
        ),
        labelStyle: typography.label.copyWith(color: colors.neutral700),
        hintStyle: typography.body.copyWith(color: colors.neutral400),
        helperStyle: typography.bodySm.copyWith(color: colors.neutral500),
        errorStyle: typography.bodySm.copyWith(color: colors.danger600),
      ),
      cardTheme: CardThemeData(
        color: colors.neutral0,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14 * den.radiusScale),
          side: BorderSide(color: colors.neutral200),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.neutral0,
        elevation: 6,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20 * den.radiusScale),
        ),
        titleTextStyle: typography.h3,
        contentTextStyle: typography.body,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.neutral0,
        elevation: 6,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(20 * den.radiusScale),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: colors.neutral900,
        contentTextStyle: typography.body.copyWith(color: colors.neutral0),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10 * den.radiusScale),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return colors.neutral0;
          return colors.neutral500;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return colors.brand600;
          return colors.neutral300;
        }),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return colors.brand600;
          return colors.neutral0;
        }),
        side: BorderSide(color: colors.neutral400, width: 1.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6 * den.radiusScale),
        ),
      ),
      // Hand the Aurora extensions through. Every Aurora widget reads
      // through `Theme.of(context).extension<X>()!`.
      extensions: [
        colors,
        typography,
        const AuroraSpacing(),
        const AuroraRadius(),
        const AuroraMotion(),
        den,
        personaTheme,
      ],
    );
  }
}
