/// Flutter uses MediaQuery rather than CSS breakpoints, but we expose the same
/// thresholds so shared code (responsive widgets, feature toggles) can read the
/// same breakpoints as web.
class AlpBreakpoints {
  AlpBreakpoints._();

  static const double xs = 0;
  static const double sm = 480;
  static const double md = 768;
  static const double lg = 1024;
  static const double xl = 1280;
  static const double xxl = 1536;
}
