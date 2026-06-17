// =============================================================
// VIDYA — DESIGN TOKENS v1.0 · Flutter
// Drop into packages/design-tokens-flutter/lib/src/vidya/
// supersedes alp_design_tokens v1 + Aurora v2
// =============================================================

import 'package:flutter/material.dart';

// =============================================================
// COLORS
// =============================================================
class VidyaColors {
  VidyaColors._();

  // Light surfaces
  static const paperLight   = Color(0xFFFFFFFF);
  static const paper2Light  = Color(0xFFF6F6F8);
  static const cardLight    = Color(0xFFFFFFFF);
  static const ruleLight    = Color(0xFFEEEEF1);
  static const rule2Light   = Color(0xFFDCDCE0);

  // Light ink
  static const inkLight   = Color(0xFF0A0A0F);
  static const ink2Light  = Color(0xFF383841);
  static const ink3Light  = Color(0xFF6E6E78);
  static const ink4Light  = Color(0xFFA8A8B0);

  // Dark surfaces
  static const paperDark   = Color(0xFF0C0F14);
  static const paper2Dark  = Color(0xFF14181F);
  static const cardDark    = Color(0xFF181D26);
  static const ruleDark    = Color(0xFF262B35);
  static const rule2Dark   = Color(0xFF353B47);

  // Dark ink
  static const inkDark   = Color(0xFFF1EEE7);
  static const ink2Dark  = Color(0xFFC7C3BA);
  static const ink3Dark  = Color(0xFF8A8579);
  static const ink4Dark  = Color(0xFF5E5A50);

  // Brand · light
  static const accentLight     = Color(0xFF1F6B4A);
  static const accent2Light    = Color(0xFF144C34);
  static const accentSoftLight = Color(0xFFEDF3EF);
  static const goldLight       = Color(0xFFA88143);
  static const gold2Light      = Color(0xFF7B5C26);
  static const goldSoftLight   = Color(0xFFF5EFE2);

  // Brand · dark
  static const accentDark     = Color(0xFF4FA37A);
  static const accent2Dark    = Color(0xFF6CBE96);
  static const accentSoftDark = Color(0xFF163525);
  static const goldDark       = Color(0xFFD4A560);
  static const gold2Dark      = Color(0xFFE6BB7C);
  static const goldSoftDark   = Color(0xFF2E2516);

  // Status · light
  static const goodLight = accentLight;
  static const warnLight = goldLight;
  static const badLight  = Color(0xFFA83A3A);
  static const infoLight = Color(0xFF2F5D8C);

  static const goodSoftLight = accentSoftLight;
  static const warnSoftLight = goldSoftLight;
  static const badSoftLight  = Color(0xFFF3E4E4);
  static const infoSoftLight = Color(0xFFE5EBF3);

  // Status · dark
  static const goodDark = accentDark;
  static const warnDark = goldDark;
  static const badDark  = Color(0xFFE07A7A);
  static const infoDark = Color(0xFF7DA8D6);

  // Mastery (canonical 5-bucket)
  static const mNoneLight     = Color(0xFFE4E4E8);
  static const mWeakLight     = Color(0xFFA83A3A);
  static const mDevLight      = Color(0xFFA88143);
  static const mStrongLight   = Color(0xFF3B8A5E);
  static const mMasteredLight = Color(0xFF1F6B4A);

  static const mNoneDark     = Color(0xFF353B47);
  static const mWeakDark     = Color(0xFFE07A7A);
  static const mDevDark      = Color(0xFFD4A560);
  static const mStrongDark   = Color(0xFF6CBE96);
  static const mMasteredDark = Color(0xFF4FA37A);

  // Subjects (light)
  static const subjPhysics   = Color(0xFF2F5D8C);
  static const subjChemistry = Color(0xFFA88143);
  static const subjBiology   = Color(0xFF1F6B4A);
  static const subjMaths     = Color(0xFF5B3A8C);
  static const subjEnglish   = Color(0xFFB43A6B);
  static const subjHistory   = Color(0xFF8C5A2F);
  static const subjCs        = Color(0xFF2F5D8C);
  static const subjHindi     = Color(0xFFB43A3A);
}

// =============================================================
// TYPOGRAPHY
// =============================================================
class VidyaFonts {
  VidyaFonts._();
  static const display = 'InstrumentSerif';
  static const ui      = 'Geist';
  static const mono    = 'GeistMono';
}

class VidyaText {
  VidyaText._();

  static TextStyle display2xl(Color c) => TextStyle(
    fontFamily: VidyaFonts.display, fontSize: 128, height: 0.92,
    fontWeight: FontWeight.w400, letterSpacing: -3.84, color: c,
  );
  static TextStyle displayXl(Color c) => TextStyle(
    fontFamily: VidyaFonts.display, fontSize: 88, height: 0.95,
    fontWeight: FontWeight.w400, letterSpacing: -2.2, color: c,
  );
  static TextStyle displayL(Color c) => TextStyle(
    fontFamily: VidyaFonts.display, fontSize: 64, height: 1.0,
    fontWeight: FontWeight.w400, letterSpacing: -1.28, color: c,
  );
  static TextStyle displayM(Color c) => TextStyle(
    fontFamily: VidyaFonts.display, fontSize: 44, height: 1.1,
    fontWeight: FontWeight.w400, letterSpacing: -0.88, color: c,
  );
  static TextStyle displayS(Color c) => TextStyle(
    fontFamily: VidyaFonts.display, fontSize: 28, height: 1.2,
    fontWeight: FontWeight.w400, letterSpacing: -0.42, color: c,
  );
  static TextStyle displayXs(Color c) => TextStyle(
    fontFamily: VidyaFonts.display, fontSize: 20, height: 1.25,
    fontWeight: FontWeight.w400, letterSpacing: -0.2, color: c,
  );

  static TextStyle bodyLg(Color c) => TextStyle(
    fontFamily: VidyaFonts.ui, fontSize: 16, height: 1.6,
    fontWeight: FontWeight.w400, color: c,
  );
  static TextStyle body(Color c) => TextStyle(
    fontFamily: VidyaFonts.ui, fontSize: 14, height: 1.55,
    fontWeight: FontWeight.w400, color: c,
  );
  static TextStyle bodySm(Color c) => TextStyle(
    fontFamily: VidyaFonts.ui, fontSize: 12.5, height: 1.5,
    fontWeight: FontWeight.w400, color: c,
  );
  static TextStyle label(Color c) => TextStyle(
    fontFamily: VidyaFonts.ui, fontSize: 13, height: 1.4,
    fontWeight: FontWeight.w500, color: c,
  );
  static TextStyle overline(Color c) => TextStyle(
    fontFamily: VidyaFonts.mono, fontSize: 10, height: 1.4,
    fontWeight: FontWeight.w500, letterSpacing: 1.0, color: c,
  );
  static TextStyle mono(Color c) => TextStyle(
    fontFamily: VidyaFonts.mono, fontSize: 11, height: 1.5,
    fontWeight: FontWeight.w400, color: c,
  );
}

// =============================================================
// SPACING (4pt grid)
// =============================================================
class VidyaSpacing {
  VidyaSpacing._();
  static const sp1  = 4.0;
  static const sp2  = 8.0;
  static const sp3  = 12.0;
  static const sp4  = 16.0;
  static const sp5  = 20.0;
  static const sp6  = 24.0;
  static const sp8  = 32.0;
  static const sp10 = 40.0;
  static const sp12 = 48.0;
  static const sp16 = 64.0;
  static const sp20 = 80.0;
}

// =============================================================
// RADIUS
// =============================================================
class VidyaRadius {
  VidyaRadius._();
  static const xs   = Radius.circular(4);
  static const sm   = Radius.circular(6);
  static const md   = Radius.circular(10);
  static const lg   = Radius.circular(14);
  static const xl   = Radius.circular(20);
  static const pill = Radius.circular(999);
}

// =============================================================
// MOTION
// =============================================================
class VidyaMotion {
  VidyaMotion._();
  static const fast = Duration(milliseconds: 120);
  static const base = Duration(milliseconds: 180);
  static const slow = Duration(milliseconds: 280);
  static const ease   = Cubic(0.4, 0, 0.2, 1);
  static const spring = Cubic(0.34, 1.56, 0.64, 1);
}

// =============================================================
// DENSITY
// =============================================================
enum VidyaDensity { compact, regular, comfy }

class VidyaDensityValues {
  final double rowH;
  final double cardP;
  final double gap;
  final double fontScale;
  final double touchTarget;

  const VidyaDensityValues({
    required this.rowH,
    required this.cardP,
    required this.gap,
    required this.fontScale,
    required this.touchTarget,
  });

  static const compact = VidyaDensityValues(
    rowH: 36, cardP: 14, gap: 10, fontScale: 0.93, touchTarget: 36,
  );
  static const regular = VidyaDensityValues(
    rowH: 44, cardP: 20, gap: 16, fontScale: 1.0, touchTarget: 44,
  );
  static const comfy = VidyaDensityValues(
    rowH: 52, cardP: 24, gap: 20, fontScale: 1.07, touchTarget: 52,
  );

  static VidyaDensityValues of(VidyaDensity d) {
    switch (d) {
      case VidyaDensity.compact: return compact;
      case VidyaDensity.comfy:   return comfy;
      case VidyaDensity.regular: return regular;
    }
  }
}

// =============================================================
// PERSONA
// =============================================================
enum VidyaPersona { junior, senior, aspirant, pro, lifelong }

class VidyaPersonaAccent {
  final Color accent;
  final Color accent2;
  final Color accentSoft;
  const VidyaPersonaAccent(this.accent, this.accent2, this.accentSoft);

  // Light
  static const juniorLight   = VidyaPersonaAccent(Color(0xFFA88143), Color(0xFF7B5C26), Color(0xFFF5EFE2));
  static const seniorLight   = VidyaPersonaAccent(Color(0xFF2F5D8C), Color(0xFF1F4366), Color(0xFFE5EBF3));
  static const aspirantLight = VidyaPersonaAccent(Color(0xFF1F6B4A), Color(0xFF144C34), Color(0xFFEDF3EF));
  static const proLight      = VidyaPersonaAccent(Color(0xFF0A0A0F), Color(0xFF000000), Color(0xFFF0F0F2));
  static const lifelongLight = VidyaPersonaAccent(Color(0xFF3B8A5E), Color(0xFF2A6644), Color(0xFFEDF3EF));

  // Dark
  static const juniorDark   = VidyaPersonaAccent(Color(0xFFD4A560), Color(0xFFE6BB7C), Color(0xFF2E2516));
  static const seniorDark   = VidyaPersonaAccent(Color(0xFF7DA8D6), Color(0xFF9BBEE4), Color(0xFF16243A));
  static const aspirantDark = VidyaPersonaAccent(Color(0xFF4FA37A), Color(0xFF6CBE96), Color(0xFF163525));
  static const proDark      = VidyaPersonaAccent(Color(0xFFF1EEE7), Color(0xFFFFFFFF), Color(0xFF262B35));
  static const lifelongDark = VidyaPersonaAccent(Color(0xFF6CBE96), Color(0xFF88D4B0), Color(0xFF163525));

  static VidyaPersonaAccent of(VidyaPersona p, Brightness b) {
    final isDark = b == Brightness.dark;
    switch (p) {
      case VidyaPersona.junior:   return isDark ? juniorDark   : juniorLight;
      case VidyaPersona.senior:   return isDark ? seniorDark   : seniorLight;
      case VidyaPersona.aspirant: return isDark ? aspirantDark : aspirantLight;
      case VidyaPersona.pro:      return isDark ? proDark      : proLight;
      case VidyaPersona.lifelong: return isDark ? lifelongDark : lifelongLight;
    }
  }
}

// =============================================================
// THEME EXTENSION — VidyaTheme.of(context)
// =============================================================
@immutable
class VidyaThemeData extends ThemeExtension<VidyaThemeData> {
  // Surfaces
  final Color paper;
  final Color paper2;
  final Color card;
  final Color rule;
  final Color rule2;
  // Ink
  final Color ink, ink2, ink3, ink4;
  // Brand
  final Color accent, accent2, accentSoft;
  final Color gold, gold2, goldSoft;
  // Status
  final Color good, warn, bad, info;
  // Mastery
  final Color mNone, mWeak, mDev, mStrong, mMastered;
  // Density
  final VidyaDensityValues density;
  // Persona
  final VidyaPersona persona;

  const VidyaThemeData({
    required this.paper,    required this.paper2,    required this.card,
    required this.rule,     required this.rule2,
    required this.ink,      required this.ink2,      required this.ink3, required this.ink4,
    required this.accent,   required this.accent2,   required this.accentSoft,
    required this.gold,     required this.gold2,     required this.goldSoft,
    required this.good,     required this.warn,      required this.bad,  required this.info,
    required this.mNone,    required this.mWeak,     required this.mDev,
    required this.mStrong,  required this.mMastered,
    required this.density,  required this.persona,
  });

  factory VidyaThemeData.light({
    VidyaPersona persona = VidyaPersona.aspirant,
    VidyaDensity density = VidyaDensity.regular,
  }) {
    final p = VidyaPersonaAccent.of(persona, Brightness.light);
    return VidyaThemeData(
      paper: VidyaColors.paperLight, paper2: VidyaColors.paper2Light, card: VidyaColors.cardLight,
      rule: VidyaColors.ruleLight, rule2: VidyaColors.rule2Light,
      ink: VidyaColors.inkLight, ink2: VidyaColors.ink2Light, ink3: VidyaColors.ink3Light, ink4: VidyaColors.ink4Light,
      accent: p.accent, accent2: p.accent2, accentSoft: p.accentSoft,
      gold: VidyaColors.goldLight, gold2: VidyaColors.gold2Light, goldSoft: VidyaColors.goldSoftLight,
      good: VidyaColors.goodLight, warn: VidyaColors.warnLight, bad: VidyaColors.badLight, info: VidyaColors.infoLight,
      mNone: VidyaColors.mNoneLight, mWeak: VidyaColors.mWeakLight, mDev: VidyaColors.mDevLight,
      mStrong: VidyaColors.mStrongLight, mMastered: VidyaColors.mMasteredLight,
      density: VidyaDensityValues.of(density), persona: persona,
    );
  }

  factory VidyaThemeData.dark({
    VidyaPersona persona = VidyaPersona.aspirant,
    VidyaDensity density = VidyaDensity.regular,
  }) {
    final p = VidyaPersonaAccent.of(persona, Brightness.dark);
    return VidyaThemeData(
      paper: VidyaColors.paperDark, paper2: VidyaColors.paper2Dark, card: VidyaColors.cardDark,
      rule: VidyaColors.ruleDark, rule2: VidyaColors.rule2Dark,
      ink: VidyaColors.inkDark, ink2: VidyaColors.ink2Dark, ink3: VidyaColors.ink3Dark, ink4: VidyaColors.ink4Dark,
      accent: p.accent, accent2: p.accent2, accentSoft: p.accentSoft,
      gold: VidyaColors.goldDark, gold2: VidyaColors.gold2Dark, goldSoft: VidyaColors.goldSoftDark,
      good: VidyaColors.goodDark, warn: VidyaColors.warnDark, bad: VidyaColors.badDark, info: VidyaColors.infoDark,
      mNone: VidyaColors.mNoneDark, mWeak: VidyaColors.mWeakDark, mDev: VidyaColors.mDevDark,
      mStrong: VidyaColors.mStrongDark, mMastered: VidyaColors.mMasteredDark,
      density: VidyaDensityValues.of(density), persona: persona,
    );
  }

  static VidyaThemeData of(BuildContext context) =>
      Theme.of(context).extension<VidyaThemeData>()!;

  @override
  VidyaThemeData copyWith({Color? paper, Color? accent, VidyaPersona? persona, VidyaDensity? density}) =>
      VidyaThemeData(
        paper: paper ?? this.paper, paper2: paper2, card: card, rule: rule, rule2: rule2,
        ink: ink, ink2: ink2, ink3: ink3, ink4: ink4,
        accent: accent ?? this.accent, accent2: accent2, accentSoft: accentSoft,
        gold: gold, gold2: gold2, goldSoft: goldSoft,
        good: good, warn: warn, bad: bad, info: info,
        mNone: mNone, mWeak: mWeak, mDev: mDev, mStrong: mStrong, mMastered: mMastered,
        density: density != null ? VidyaDensityValues.of(density) : this.density,
        persona: persona ?? this.persona,
      );

  @override
  VidyaThemeData lerp(ThemeExtension<VidyaThemeData>? other, double t) => this;
}

// =============================================================
// Material ThemeData factory — drop into MaterialApp
// =============================================================
class VidyaTheme {
  VidyaTheme._();

  static ThemeData material({
    Brightness brightness = Brightness.light,
    VidyaPersona persona = VidyaPersona.aspirant,
    VidyaDensity density = VidyaDensity.regular,
  }) {
    final v = brightness == Brightness.dark
      ? VidyaThemeData.dark(persona: persona, density: density)
      : VidyaThemeData.light(persona: persona, density: density);

    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: v.paper,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: v.accent,    onPrimary: v.paper,
        secondary: v.gold,    onSecondary: v.ink,
        error: v.bad,         onError: v.paper,
        surface: v.card,      onSurface: v.ink,
        background: v.paper,  onBackground: v.ink,
      ),
      extensions: [v],
      textTheme: TextTheme(
        displayLarge:  VidyaText.displayXl(v.ink),
        displayMedium: VidyaText.displayL(v.ink),
        displaySmall:  VidyaText.displayM(v.ink),
        headlineLarge: VidyaText.displayM(v.ink),
        headlineMedium:VidyaText.displayS(v.ink),
        headlineSmall: VidyaText.displayXs(v.ink),
        titleLarge:    VidyaText.displayXs(v.ink),
        titleMedium:   VidyaText.label(v.ink),
        bodyLarge:     VidyaText.bodyLg(v.ink2),
        bodyMedium:    VidyaText.body(v.ink2),
        bodySmall:     VidyaText.bodySm(v.ink3),
        labelLarge:    VidyaText.label(v.ink),
        labelMedium:   VidyaText.overline(v.ink3),
        labelSmall:    VidyaText.mono(v.ink3),
      ),
    );
  }
}
