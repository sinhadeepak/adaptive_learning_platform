library alp_design_tokens;

// v1 legacy tokens (kept for migration window)
export 'src/colors.dart';
export 'src/typography.dart';
export 'src/spacing.dart';
export 'src/shape.dart';
export 'src/elevation.dart';
export 'src/motion.dart';
export 'src/breakpoints.dart';
export 'src/density.dart';

// v2 Aurora — see docs/02-design/design-system-v2-aurora-mobile.md
export 'src/aurora_colors.dart';
export 'src/aurora_typography.dart';
export 'src/aurora_spacing.dart';
export 'src/aurora_density.dart';
export 'src/aurora_theme.dart';

// v3 Aurora — persona system (§4). Pure types only; the runtime
// PersonaNotifier with persistence lives in apps/mobile/lib/aurora/.
export 'src/persona.dart';
export 'src/persona_theme.dart';
