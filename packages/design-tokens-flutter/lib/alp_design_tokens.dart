library alp_design_tokens;

// ─── Vidya v1.0 (canonical) ───────────────────────────────────
// Supersedes Aurora v2 + v1 legacy. See docs/02-design/design-system/.
// Provides: VidyaColors, VidyaFonts, VidyaText, VidyaSpacing,
// VidyaRadius, VidyaMotion, VidyaDensity, VidyaPersona,
// VidyaThemeData (ThemeExtension), VidyaTheme (Material factory).
export 'src/vidya/tokens.dart';

// ─── Aurora v2 + v1 (deprecated, migration window only) ───────
// Re-exported so existing components keep compiling during the
// Aurora→Vidya cutover. Scheduled for deletion in design-system
// Phase 5. New code MUST use Vidya tokens above.
export 'src/colors.dart';
export 'src/typography.dart';
export 'src/spacing.dart';
export 'src/shape.dart';
export 'src/elevation.dart';
export 'src/motion.dart';
export 'src/breakpoints.dart';
export 'src/density.dart';

export 'src/aurora_colors.dart';
export 'src/aurora_typography.dart';
export 'src/aurora_spacing.dart';
export 'src/aurora_density.dart';
export 'src/aurora_theme.dart';

export 'src/persona.dart';
export 'src/persona_theme.dart';
