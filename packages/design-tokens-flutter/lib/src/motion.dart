import 'package:flutter/animation.dart';

class AlpMotion {
  AlpMotion._();

  static const Duration durationInstant = Duration(milliseconds: 80);
  static const Duration durationFast = Duration(milliseconds: 150);
  static const Duration durationBase = Duration(milliseconds: 220);

  /// Cubic-bezier(0.2, 0, 0, 1) matches the web easing token.
  static const Curve easingStandard = Cubic(0.2, 0, 0, 1);
}
