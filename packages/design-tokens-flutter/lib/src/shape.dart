/// Radii from docs/ui/01_StudentPortal_Web/00_design-system.css:
///   --radius-sm: 6, --radius-md: 9, --radius-lg: 13, --radius-xl: 16, --radius-full
class AlpRadius {
  AlpRadius._();

  static const double input = 9; // --radius-md
  static const double button = 9;
  static const double card = 13; // --radius-lg
  static const double panel = 13;
  static const double modal = 16; // --radius-xl
  static const double pill = 9999;
  static const double checkbox = 6; // --radius-sm
  static const double codeChip = 6;

  /// Avatar uses `BoxDecoration(shape: BoxShape.circle)` in Flutter; no radius constant needed.
}
