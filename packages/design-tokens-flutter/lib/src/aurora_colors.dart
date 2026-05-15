// AuroraColors — Aurora v2 color tokens for Flutter.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §7.1
// Mirrors: packages/design-system/src/tokens.v2.css (web)
//
// Light + dark constructors return the same shape, different values —
// engineering builds each widget once; theme switch is one ThemeData
// rebuild.
//
// Usage:
//   final aurora = Theme.of(context).extension<AuroraColors>()!;
//   Container(color: aurora.brand600)
//
// Aurora gradients ship as `Gradient` (LinearGradient) for use with
// BoxDecoration / ShaderMask / Container.
//
// IMPORTANT: do NOT add new colors to this class without an ADR. The
// brand palette is the contract.

import 'package:flutter/material.dart';

class AuroraColors extends ThemeExtension<AuroraColors> {
  const AuroraColors({
    // Brand spine
    required this.brand50,
    required this.brand100,
    required this.brand500,
    required this.brand600,
    required this.brand700,
    // Semantic — status / mastery
    required this.success50,
    required this.success500,
    required this.success600,
    required this.proficient500,
    required this.proficient600,
    required this.developing50,
    required this.developing500,
    required this.developing600,
    required this.danger50,
    required this.danger500,
    required this.danger600,
    required this.locked500,
    required this.reward50,
    required this.reward500,
    required this.reward600,
    required this.aurora500,
    // Aurora gradients (reserved — AI / celebration / progress)
    required this.auroraAi,
    required this.auroraCelebration,
    required this.auroraProgress,
    required this.auroraAiSoft,
    required this.auroraCelebrationSoft,
    required this.auroraProgressSoft,
    // Subject palette
    required this.subjPhysics,
    required this.subjChemistry,
    required this.subjBiology,
    required this.subjMaths,
    required this.subjEnglish,
    required this.subjHistory,
    required this.subjGeography,
    required this.subjGs,
    required this.subjCs,
    required this.subjHindi,
    // Neutral ramp — 12 steps, low → high contrast
    required this.neutral0,
    required this.neutral50,
    required this.neutral100,
    required this.neutral200,
    required this.neutral300,
    required this.neutral400,
    required this.neutral500,
    required this.neutral600,
    required this.neutral700,
    required this.neutral800,
    required this.neutral900,
    // Mastery scale
    required this.mastery0,
    required this.masteryWeak,
    required this.masteryDev,
    required this.masteryStrong,
    required this.masteryMastered,
  });

  final Color brand50, brand100, brand500, brand600, brand700;
  final Color success50, success500, success600;
  final Color proficient500, proficient600;
  final Color developing50, developing500, developing600;
  final Color danger50, danger500, danger600;
  final Color locked500;
  final Color reward50, reward500, reward600;
  final Color aurora500;

  /// Cyan → violet — reserved for AI surfaces (AI Tutor, AI Insights, ✦ CTAs).
  final Gradient auroraAi;

  /// Amber → pink — reserved for celebration moments (streak milestone,
  /// level-up, mission complete).
  final Gradient auroraCelebration;

  /// Green → cyan — reserved for progress (mastered topic ring, on-track band).
  final Gradient auroraProgress;

  /// Low-emphasis tints of the same gradients, suitable for large surfaces
  /// (card backgrounds, hero strips). 10–12% alpha overlay.
  final Gradient auroraAiSoft, auroraCelebrationSoft, auroraProgressSoft;

  final Color subjPhysics,
      subjChemistry,
      subjBiology,
      subjMaths,
      subjEnglish,
      subjHistory,
      subjGeography,
      subjGs,
      subjCs,
      subjHindi;

  final Color neutral0,
      neutral50,
      neutral100,
      neutral200,
      neutral300,
      neutral400,
      neutral500,
      neutral600,
      neutral700,
      neutral800,
      neutral900;

  /// Single canonical mastery scale used wherever EWA is rendered (rings,
  /// bars, heatmap cells, badges). See [masteryForEwa] for bucket mapping.
  final Color mastery0, masteryWeak, masteryDev, masteryStrong;

  /// Gradient — mastered topics light up with the aurora-progress gradient.
  final Gradient masteryMastered;

  // ───────────────────────────────────────────────────────────────────────
  // Light theme — identical to web tokens.v2.css :root
  // ───────────────────────────────────────────────────────────────────────
  factory AuroraColors.light() => const AuroraColors(
        brand50: Color(0xFFF4F4FE),
        brand100: Color(0xFFEBEBFB),
        brand500: Color(0xFF7B7BE0),
        brand600: Color(0xFF5B5BD6),
        brand700: Color(0xFF4949B8),
        success50: Color(0xFFECFDF5),
        success500: Color(0xFF22C55E),
        success600: Color(0xFF16A34A),
        proficient500: Color(0xFF06B6D4),
        proficient600: Color(0xFF0891B2),
        developing50: Color(0xFFFFFBEB),
        developing500: Color(0xFFF59E0B),
        developing600: Color(0xFFD97706),
        danger50: Color(0xFFFEF2F2),
        danger500: Color(0xFFEF4444),
        danger600: Color(0xFFDC2626),
        locked500: Color(0xFF94A3B8),
        reward50: Color(0xFFFFF7ED),
        reward500: Color(0xFFF97316),
        reward600: Color(0xFFEA580C),
        aurora500: Color(0xFF7C3AED),
        auroraAi: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF06B6D4), Color(0xFF7C3AED)],
        ),
        auroraCelebration: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFF59E0B), Color(0xFFEC4899)],
        ),
        auroraProgress: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF22C55E), Color(0xFF06B6D4)],
        ),
        auroraAiSoft: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x1A06B6D4), Color(0x1A7C3AED)],
        ),
        auroraCelebrationSoft: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x1AF59E0B), Color(0x1AEC4899)],
        ),
        auroraProgressSoft: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x1A22C55E), Color(0x1A06B6D4)],
        ),
        subjPhysics: Color(0xFF0EA5E9),
        subjChemistry: Color(0xFFF97316),
        subjBiology: Color(0xFF10B981),
        subjMaths: Color(0xFF8B5CF6),
        subjEnglish: Color(0xFFEC4899),
        subjHistory: Color(0xFFA16207),
        subjGeography: Color(0xFF0D9488),
        subjGs: Color(0xFF6366F1),
        subjCs: Color(0xFF3B82F6),
        subjHindi: Color(0xFFDC2626),
        neutral0: Color(0xFFFFFFFF),
        neutral50: Color(0xFFF8FAFC),
        neutral100: Color(0xFFF1F5F9),
        neutral200: Color(0xFFE2E8F0),
        neutral300: Color(0xFFCBD5E1),
        neutral400: Color(0xFF94A3B8),
        neutral500: Color(0xFF64748B),
        neutral600: Color(0xFF475569),
        neutral700: Color(0xFF334155),
        neutral800: Color(0xFF1E293B),
        neutral900: Color(0xFF0F172A),
        mastery0: Color(0xFFE2E8F0), // = neutral200
        masteryWeak: Color(0xFFDC2626), // = danger600
        masteryDev: Color(0xFFD97706), // = developing600
        masteryStrong: Color(0xFF16A34A), // = success600
        masteryMastered: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF22C55E), Color(0xFF06B6D4)],
        ),
      );

  // ───────────────────────────────────────────────────────────────────────
  // Dark theme — pair-wise designed, NOT inverted.
  // Brand + semantic lift +5–15% lightness; neutral ramp flipped.
  // ───────────────────────────────────────────────────────────────────────
  factory AuroraColors.dark() => const AuroraColors(
        brand50: Color(0xFF1B1B36),
        brand100: Color(0xFF2A2A4A),
        brand500: Color(0xFF9A9AEC),
        brand600: Color(0xFF7C7CE8),
        brand700: Color(0xFF6262D6),
        success50: Color(0xFF14302A),
        success500: Color(0xFF34D399),
        success600: Color(0xFF22C55E),
        proficient500: Color(0xFF22D3EE),
        proficient600: Color(0xFF06B6D4),
        developing50: Color(0xFF3B2A12),
        developing500: Color(0xFFFBBF24),
        developing600: Color(0xFFF59E0B),
        danger50: Color(0xFF38181C),
        danger500: Color(0xFFF87171),
        danger600: Color(0xFFEF4444),
        locked500: Color(0xFF6B7280),
        reward50: Color(0xFF3A2410),
        reward500: Color(0xFFFB923C),
        reward600: Color(0xFFF97316),
        aurora500: Color(0xFFA78BFA),
        auroraAi: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF22D4EE), Color(0xFFA78BFA)],
        ),
        auroraCelebration: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFBBF24), Color(0xFFF472B6)],
        ),
        auroraProgress: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF4ADE80), Color(0xFF22D4EE)],
        ),
        auroraAiSoft: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x1F22D4EE), Color(0x1FA78BFA)],
        ),
        auroraCelebrationSoft: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x1FFBBF24), Color(0x1FF472B6)],
        ),
        auroraProgressSoft: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x1F4ADE80), Color(0x1F22D4EE)],
        ),
        // Subjects — +5–10% lightness so they stay vivid on dark surfaces
        subjPhysics: Color(0xFF38BDF8),
        subjChemistry: Color(0xFFFB923C),
        subjBiology: Color(0xFF34D399),
        subjMaths: Color(0xFFA78BFA),
        subjEnglish: Color(0xFFF472B6),
        subjHistory: Color(0xFFCA8A04),
        subjGeography: Color(0xFF14B8A6),
        subjGs: Color(0xFF818CF8),
        subjCs: Color(0xFF60A5FA),
        subjHindi: Color(0xFFF87171),
        // Neutrals — flipped lightness
        neutral0: Color(0xFF07090F),
        neutral50: Color(0xFF0C1422),
        neutral100: Color(0xFF131C30),
        neutral200: Color(0xFF1B2844),
        neutral300: Color(0xFF243352),
        neutral400: Color(0xFF3B486A),
        neutral500: Color(0xFF56638A),
        neutral600: Color(0xFF7D8BA9),
        neutral700: Color(0xFFA8B4CC),
        neutral800: Color(0xFFD4DCEC),
        neutral900: Color(0xFFEEF2FF),
        mastery0: Color(0xFF1B2844), // = neutral200 (dark)
        masteryWeak: Color(0xFFF87171),
        masteryDev: Color(0xFFFBBF24),
        masteryStrong: Color(0xFF22C55E),
        masteryMastered: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF4ADE80), Color(0xFF22D4EE)],
        ),
      );

  /// Buckets an EWA value in `[0, 1]` to a mastery color from this palette.
  /// Mirrors the bucketing in `docs/CLAUDE.md` and the web `bucketForEwa`.
  Color masteryForEwa(double ewa) {
    if (ewa <= 0) return mastery0;
    if (ewa < 0.4) return masteryWeak;
    if (ewa < 0.7) return masteryDev;
    if (ewa < 0.9) return masteryStrong;
    // Mastered — caller should use the gradient via `masteryMastered`.
    return masteryStrong;
  }

  @override
  ThemeExtension<AuroraColors> copyWith() => this;

  @override
  ThemeExtension<AuroraColors> lerp(
    covariant ThemeExtension<AuroraColors>? other,
    double t,
  ) {
    if (other is! AuroraColors) return this;
    // Aurora doesn't animate between themes — the theme switch is a
    // crossfade owned by MaterialApp. Returning the target end-state is
    // the cleanest approach; lerp() exists only to satisfy the contract.
    return t < 0.5 ? this : other;
  }
}
