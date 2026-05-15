// AuroraDensity — three runtime density modes for the mobile app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §6
//
// Same personas as web (Junior / Aspirant / Pro) but mobile-scaled
// scalars (Junior 1.20× space; Pro 0.85× space). Every primitive that
// pads, sizes, or animates reads through `Theme.of(context).extension<AuroraDensity>()`.
//
// Touch target: never below the platform OS floor (iOS 44, Android 48)
// in Junior or Aspirant. Pro mode drops below 48 dp on Android only
// after a one-time user-consent dialog.

import 'package:flutter/material.dart';

enum AuroraDensityMode { junior, aspirant, pro }

extension AuroraDensityModeX on AuroraDensityMode {
  String get id => switch (this) {
        AuroraDensityMode.junior => 'junior',
        AuroraDensityMode.aspirant => 'aspirant',
        AuroraDensityMode.pro => 'pro',
      };

  static AuroraDensityMode? fromId(String? id) => switch (id) {
        'junior' => AuroraDensityMode.junior,
        'aspirant' => AuroraDensityMode.aspirant,
        'pro' => AuroraDensityMode.pro,
        _ => null,
      };

  /// Human-readable label for Settings UI.
  String get label => switch (this) {
        AuroraDensityMode.junior => 'Junior',
        AuroraDensityMode.aspirant => 'Aspirant',
        AuroraDensityMode.pro => 'Pro',
      };
}

class AuroraDensity extends ThemeExtension<AuroraDensity> {
  const AuroraDensity({
    required this.mode,
    required this.spaceScale,
    required this.typeScale,
    required this.radiusScale,
    required this.motionScale,
    required this.touchTarget,
  });

  final AuroraDensityMode mode;

  /// Multiplier applied to AuroraSpacing values.
  final double spaceScale;

  /// Multiplier applied to text sizes.
  final double typeScale;

  /// Multiplier applied to radii.
  final double radiusScale;

  /// Multiplier applied to motion durations.
  final double motionScale;

  /// Minimum touch target in dp (must be ≥ OS platform floor).
  final double touchTarget;

  factory AuroraDensity.junior() => const AuroraDensity(
        mode: AuroraDensityMode.junior,
        spaceScale: 1.20,
        typeScale: 1.10,
        radiusScale: 1.10,
        motionScale: 1.20,
        touchTarget: 48,
      );

  factory AuroraDensity.aspirant() => const AuroraDensity(
        mode: AuroraDensityMode.aspirant,
        spaceScale: 1.00,
        typeScale: 1.00,
        radiusScale: 1.00,
        motionScale: 1.00,
        // 48 dp respects Material; iOS scales down to 44 in the widget
        // layer when Theme.of(context).platform == iOS.
        touchTarget: 48,
      );

  factory AuroraDensity.pro() => const AuroraDensity(
        mode: AuroraDensityMode.pro,
        spaceScale: 0.85,
        typeScale: 0.90,
        radiusScale: 0.85,
        motionScale: 0.70,
        touchTarget: 44,
      );

  factory AuroraDensity.fromMode(AuroraDensityMode mode) => switch (mode) {
        AuroraDensityMode.junior => AuroraDensity.junior(),
        AuroraDensityMode.aspirant => AuroraDensity.aspirant(),
        AuroraDensityMode.pro => AuroraDensity.pro(),
      };

  @override
  ThemeExtension<AuroraDensity> copyWith({
    AuroraDensityMode? mode,
    double? spaceScale,
    double? typeScale,
    double? radiusScale,
    double? motionScale,
    double? touchTarget,
  }) =>
      AuroraDensity(
        mode: mode ?? this.mode,
        spaceScale: spaceScale ?? this.spaceScale,
        typeScale: typeScale ?? this.typeScale,
        radiusScale: radiusScale ?? this.radiusScale,
        motionScale: motionScale ?? this.motionScale,
        touchTarget: touchTarget ?? this.touchTarget,
      );

  @override
  ThemeExtension<AuroraDensity> lerp(
    covariant ThemeExtension<AuroraDensity>? other,
    double t,
  ) {
    if (other is! AuroraDensity) return this;
    return AuroraDensity(
      mode: t < 0.5 ? mode : other.mode,
      spaceScale: lerpDouble(spaceScale, other.spaceScale, t),
      typeScale: lerpDouble(typeScale, other.typeScale, t),
      radiusScale: lerpDouble(radiusScale, other.radiusScale, t),
      motionScale: lerpDouble(motionScale, other.motionScale, t),
      touchTarget: lerpDouble(touchTarget, other.touchTarget, t),
    );
  }
}

double lerpDouble(double a, double b, double t) => a + (b - a) * t;
