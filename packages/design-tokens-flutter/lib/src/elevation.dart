import 'package:flutter/painting.dart';
import 'colors.dart';

class AlpElevation {
  AlpElevation._();

  static const List<BoxShadow> flat = [];

  static const List<BoxShadow> hover = [
    BoxShadow(
      color: Color(0x0F000000), // rgba(0,0,0,0.06) ≈ 0x0F black
      offset: Offset(0, 2),
      blurRadius: 8,
    ),
  ];

  static const List<BoxShadow> dropdown = [
    BoxShadow(
      color: Color(0x1A000000), // rgba(0,0,0,0.10)
      offset: Offset(0, 4),
      blurRadius: 16,
    ),
  ];

  static const List<BoxShadow> focusRing = [
    BoxShadow(
      color: AlpColors.focusRing,
      offset: Offset.zero,
      blurRadius: 0,
      spreadRadius: 3,
    ),
  ];
}
