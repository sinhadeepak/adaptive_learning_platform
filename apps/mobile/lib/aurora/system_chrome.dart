// AuroraSystemChrome — centralized control of the OS status bar + nav bar
// styling so the system chrome matches the active Aurora theme.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §9.4
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md Wave 1
//
// Without this, the system status bar can render with light icons on a
// light system bg (effectively invisible) or vice versa. Material handles
// AppBar tinting but not the system bars when there's no AppBar (splash,
// onboarding, full-bleed surfaces).
//
// Usage in apps/mobile/lib/main.dart:
//   AuroraSystemChrome.applyForTheme(ThemeMode.dark);
//   _themeMode.addListener(() {
//     AuroraSystemChrome.applyForTheme(_themeMode.mode);
//   });

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

abstract class AuroraSystemChrome {
  AuroraSystemChrome._();

  // Aurora dark-mode token mirror — kept inline so this helper is self-
  // contained and can be called before any Theme settles.
  static const Color _darkBgBase = Color(0xFF07090F);
  static const Color _lightBgBase = Color(0xFFFAFAFA);

  /// Resolves the right overlay style for the active [ThemeMode] and
  /// applies it globally. Safe to call repeatedly — Flutter no-ops if
  /// the style is unchanged.
  ///
  /// [platformBrightness] should be passed when [mode] is
  /// [ThemeMode.system] so the right style is selected based on the OS
  /// setting; defaults to the binding's current platform brightness.
  static void applyForTheme(
    ThemeMode mode, {
    Brightness? platformBrightness,
  }) {
    final isDark = switch (mode) {
      ThemeMode.dark => true,
      ThemeMode.light => false,
      ThemeMode.system =>
        (platformBrightness ??
                WidgetsBinding.instance.platformDispatcher.platformBrightness) ==
            Brightness.dark,
    };
    final style = isDark ? _darkStyle : _lightStyle;
    SystemChrome.setSystemUIOverlayStyle(style);
  }

  // Dark theme — light icons on dark surfaces. Both the status bar and the
  // navigation bar match the Aurora bgBase so the surfaces flow into the
  // app without a seam.
  static const SystemUiOverlayStyle _darkStyle = SystemUiOverlayStyle(
    statusBarColor: Color(0x00000000), // transparent — Flutter draws under
    statusBarIconBrightness: Brightness.light, // Android
    statusBarBrightness: Brightness.dark, // iOS (semantic: content is dark)
    systemNavigationBarColor: _darkBgBase,
    systemNavigationBarIconBrightness: Brightness.light,
    systemNavigationBarDividerColor: Color(0x00000000),
    systemNavigationBarContrastEnforced: false,
  );

  static const SystemUiOverlayStyle _lightStyle = SystemUiOverlayStyle(
    statusBarColor: Color(0x00000000),
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarColor: _lightBgBase,
    systemNavigationBarIconBrightness: Brightness.dark,
    systemNavigationBarDividerColor: Color(0x00000000),
    systemNavigationBarContrastEnforced: false,
  );
}
