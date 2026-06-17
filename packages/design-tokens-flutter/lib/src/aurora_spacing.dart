// AuroraSpacing / AuroraRadius / AuroraMotion — Aurora v2 layout tokens
// for Flutter.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §7.3–7.6
//
// Values are dp (Flutter logical pixels). Mobile caps the top end at
// 64 — phones never need 80+. Density layer scales spacing/radius/motion
// via the scalars in AuroraDensity.

import 'package:flutter/material.dart';

class AuroraSpacing extends ThemeExtension<AuroraSpacing> {
  const AuroraSpacing();

  final double s1 = 4;
  final double s2 = 8;
  final double s3 = 12;
  final double s4 = 16;
  final double s5 = 20;
  final double s6 = 24;
  final double s8 = 32;
  final double s10 = 40;
  final double s12 = 48;
  final double s16 = 64;

  /// Returns the spacing scaled by the current density. Pass the density
  /// scalar from [AuroraDensity.spaceScale]; defaults to 1.0 (Aspirant).
  double scaled(double base, [double scale = 1.0]) => base * scale;

  @override
  ThemeExtension<AuroraSpacing> copyWith() => this;
  @override
  ThemeExtension<AuroraSpacing> lerp(
    covariant ThemeExtension<AuroraSpacing>? other,
    double t,
  ) =>
      this;
}

class AuroraRadius extends ThemeExtension<AuroraRadius> {
  const AuroraRadius();

  final double sm = 6;
  final double md = 10;
  final double lg = 14;
  final double xl = 20;
  final double xxl = 28;
  final double pill = 9999;

  /// Common helpers — same shape as web tokens.
  BorderRadius rSm([double scale = 1.0]) =>
      BorderRadius.all(Radius.circular(sm * scale));
  BorderRadius rMd([double scale = 1.0]) =>
      BorderRadius.all(Radius.circular(md * scale));
  BorderRadius rLg([double scale = 1.0]) =>
      BorderRadius.all(Radius.circular(lg * scale));
  BorderRadius rXl([double scale = 1.0]) =>
      BorderRadius.all(Radius.circular(xl * scale));

  @override
  ThemeExtension<AuroraRadius> copyWith() => this;
  @override
  ThemeExtension<AuroraRadius> lerp(
    covariant ThemeExtension<AuroraRadius>? other,
    double t,
  ) =>
      this;
}

class AuroraMotion extends ThemeExtension<AuroraMotion> {
  const AuroraMotion();

  final Duration fast = const Duration(milliseconds: 120);
  final Duration base = const Duration(milliseconds: 220);
  final Duration slow = const Duration(milliseconds: 320);
  final Duration pageScale = const Duration(milliseconds: 280);

  final Curve ease = Curves.easeOutCubic;
  final Curve easeIn = Curves.easeInCubic;

  /// Spring curve used for celebration moments (streak milestone,
  /// level-up). Roughly mass=1, stiffness=240, damping=22 — Flutter's
  /// `Curves.elasticOut` is a close stand-in.
  final Curve spring = Curves.easeOutBack;

  /// Returns a duration scaled by the current density. Pass the scalar
  /// from [AuroraDensity.motionScale]; defaults to 1.0 (Aspirant).
  Duration scaled(Duration d, [double scale = 1.0]) =>
      Duration(milliseconds: (d.inMilliseconds * scale).round());

  @override
  ThemeExtension<AuroraMotion> copyWith() => this;
  @override
  ThemeExtension<AuroraMotion> lerp(
    covariant ThemeExtension<AuroraMotion>? other,
    double t,
  ) =>
      this;
}
