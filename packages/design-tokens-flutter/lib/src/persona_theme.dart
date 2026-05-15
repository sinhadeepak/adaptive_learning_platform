// PersonaTheme — the per-axis flex matrix that lets every Aurora widget
// adapt to the active [Persona] without re-reading the notifier directly.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §4
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.
//
// Lives as a ThemeExtension so widgets read via
//   Theme.of(context).extension<PersonaTheme>()!
// matching the existing AuroraColors / AuroraTypography / AuroraSpacing
// pattern. AuroraTheme.build() takes a Persona and injects the right
// PersonaTheme into the extensions list; PersonaNotifier rebuilds
// MaterialApp on change.
//
// Every axis below is named for what the widget consumes, not for the
// underlying user attribute. e.g. `motionEnergy` (1.20 for Kid → springy
// transitions, 0.90 for Aspirant → composed) rather than "isYoung".

import 'package:flutter/material.dart';

import 'persona.dart';

/// Primary navigation surface for a persona. Drives [PersonaShell].
enum PrimaryNavStyle {
  /// Adventure map. Kid only. Lessons unlock sequentially along an
  /// illustrated path; Lumi guides.
  adventureMap,

  /// Five-tab bottom nav: Home / Practice / Rank / Doubts / Profile.
  /// Teen.
  fiveTabPractice,

  /// Five-tab bottom nav: Home / Plan / Test series / Analysis / Profile.
  /// Aspirant.
  fiveTabExam,

  /// Four-tab bottom nav: Learn / Discover / Library / Profile.
  /// Learner.
  fourTabLearning,
}

/// How prominent Lumi is across the app for this persona.
enum LumiProminence {
  /// Always-on companion: speech bubbles, animated reactions, full-screen
  /// celebration takeovers. Kid.
  alwaysOn,

  /// Frequent: Home greeting card, post-session celebrations, in-quiz
  /// hint affordance. Teen.
  frequent,

  /// AI surfaces only: doubts, current-affairs annotations, mains-essay
  /// feedback. No Home greeting. Aspirant.
  aiSurfacesOnly,

  /// Coach mode only: shows when the learner explicitly asks for guidance
  /// or at lesson-end summaries. No idle presence. Learner.
  coachOnly,
}

/// Whether and how a parent / supervisor surface exists for this persona.
enum ParentSurface {
  /// Hard requirement. Parent unlock numeric gate at first launch +
  /// monthly; parent dashboard accessible via long-press on logo and from
  /// Settings; weekly digest email. Kid.
  required_,

  /// Opt-in. Parent can subscribe to a weekly digest via Settings; no
  /// in-app dashboard. Teen.
  optionalDigest,

  /// No parent surface. Aspirant + Learner.
  none,
}

/// Per-persona flex matrix. Read everywhere via
/// `Theme.of(context).extension<PersonaTheme>()!`.
@immutable
class PersonaTheme extends ThemeExtension<PersonaTheme> {
  const PersonaTheme({
    required this.persona,
    required this.touchTargetFloor,
    required this.typeScale,
    required this.motionEnergy,
    required this.illustrationDensity,
    required this.audioNarrationDefaultOn,
    required this.streakShameAllowed,
    required this.exposeNumericRanks,
    required this.lumiProminence,
    required this.parentSurface,
    required this.primaryNav,
    required this.socialPeerSurface,
    required this.notificationsPerDay,
  });

  /// Which persona this matrix belongs to. Useful for widgets that need to
  /// fork on the discrete value rather than reading individual axes.
  final Persona persona;

  // ── Layout & input ────────────────────────────────────────────────

  /// Minimum dp for any interactive element. Kid 56, Teen 48,
  /// Aspirant 44, Learner 44.
  final double touchTargetFloor;

  /// Multiplier applied to base type sizes (display, h1, body, …).
  /// Kid 1.20, Teen 1.05, Aspirant 1.00, Learner 1.00.
  final double typeScale;

  // ── Motion & illustration ─────────────────────────────────────────

  /// Multiplier applied to motion duration / spring stiffness. >1.0 =
  /// snappier and bouncier (Kid springy 1.20); <1.0 = composed (Aspirant
  /// / Learner 0.90).
  final double motionEnergy;

  /// 0 = minimal (Learner). 1 = Lumi + accents (Teen). 2 = Lumi-prominent
  /// (Aspirant N/A — capped at 1 for AI surfaces). 3 = hero illustration
  /// per screen (Kid).
  final int illustrationDensity;

  // ── Audio & accessibility ─────────────────────────────────────────

  /// Whether [`AuroraNarration`] should auto-narrate instructions on
  /// first display. Kid true; everyone else opt-in via a11y.
  final bool audioNarrationDefaultOn;

  // ── Engagement & gamification ─────────────────────────────────────

  /// May microcopy include light streak-protection nudging
  /// ("Don't lose your 3-day streak")? Off entirely for Learner. Off
  /// for Kid (we reward presence rather than shaming absence). Mild for
  /// Teen / Aspirant.
  final bool streakShameAllowed;

  /// Whether to show raw rank / percentile / accuracy-% numbers in the
  /// UI. False for Kid (stars + badges instead). True elsewhere.
  final bool exposeNumericRanks;

  // ── Lumi the AI companion ─────────────────────────────────────────

  final LumiProminence lumiProminence;

  // ── Parent / supervision ──────────────────────────────────────────

  final ParentSurface parentSurface;

  // ── Navigation & social ───────────────────────────────────────────

  final PrimaryNavStyle primaryNav;

  /// Whether the persona has any peer-presence surface at all (Friends,
  /// Clans, Leaderboards, cohort leaderboard). Kid uses a kid-safe
  /// variant — only friends added via parent-approved QR pair / invite.
  final bool socialPeerSurface;

  /// Default daily push-notification budget. Kid is parent-co-set so the
  /// app-side ceiling is 1; Learner is push-fatigued so 3/week → encoded
  /// as the floor < 1.
  final double notificationsPerDay;

  // ── Canonical matrices per persona ────────────────────────────────

  /// Class V–VIII (10–14).
  factory PersonaTheme.kid() => const PersonaTheme(
        persona: Persona.kid,
        touchTargetFloor: 56,
        typeScale: 1.20,
        motionEnergy: 1.20,
        illustrationDensity: 3,
        audioNarrationDefaultOn: true,
        streakShameAllowed: false,
        exposeNumericRanks: false,
        lumiProminence: LumiProminence.alwaysOn,
        parentSurface: ParentSurface.required_,
        primaryNav: PrimaryNavStyle.adventureMap,
        socialPeerSurface: true, // kid-safe; gated by parent-approved invite
        notificationsPerDay: 1.0,
      );

  /// Class IX–XII, NEET / JEE prep.
  factory PersonaTheme.teen() => const PersonaTheme(
        persona: Persona.teen,
        touchTargetFloor: 48,
        typeScale: 1.05,
        motionEnergy: 1.05,
        illustrationDensity: 1,
        audioNarrationDefaultOn: false,
        streakShameAllowed: true,
        exposeNumericRanks: true,
        lumiProminence: LumiProminence.frequent,
        parentSurface: ParentSurface.optionalDigest,
        primaryNav: PrimaryNavStyle.fiveTabPractice,
        socialPeerSurface: true,
        notificationsPerDay: 2.0,
      );

  /// UPSC / CAT / GATE / professional exams.
  factory PersonaTheme.aspirant() => const PersonaTheme(
        persona: Persona.aspirant,
        touchTargetFloor: 44,
        typeScale: 1.00,
        motionEnergy: 0.90,
        illustrationDensity: 1,
        audioNarrationDefaultOn: false,
        streakShameAllowed: true,
        exposeNumericRanks: true,
        lumiProminence: LumiProminence.aiSurfacesOnly,
        parentSurface: ParentSurface.none,
        primaryNav: PrimaryNavStyle.fiveTabExam,
        socialPeerSurface: true, // limited to test-series cohort leaderboards
        notificationsPerDay: 2.0,
      );

  /// Working professional — Vedic Maths, Excel, system design, languages.
  factory PersonaTheme.learner() => const PersonaTheme(
        persona: Persona.learner,
        touchTargetFloor: 44,
        typeScale: 1.00,
        motionEnergy: 0.90,
        illustrationDensity: 0,
        audioNarrationDefaultOn: false,
        streakShameAllowed: false,
        exposeNumericRanks: true,
        lumiProminence: LumiProminence.coachOnly,
        parentSurface: ParentSurface.none,
        primaryNav: PrimaryNavStyle.fourTabLearning,
        socialPeerSurface: false, // optional study groups land in Wave 6
        notificationsPerDay: 0.43, // ≈ 3/week
      );

  /// Resolves the canonical matrix for a given [Persona].
  factory PersonaTheme.forPersona(Persona p) => switch (p) {
        Persona.kid => PersonaTheme.kid(),
        Persona.teen => PersonaTheme.teen(),
        Persona.aspirant => PersonaTheme.aspirant(),
        Persona.learner => PersonaTheme.learner(),
      };

  // ── ThemeExtension boilerplate ────────────────────────────────────

  @override
  PersonaTheme copyWith({
    Persona? persona,
    double? touchTargetFloor,
    double? typeScale,
    double? motionEnergy,
    int? illustrationDensity,
    bool? audioNarrationDefaultOn,
    bool? streakShameAllowed,
    bool? exposeNumericRanks,
    LumiProminence? lumiProminence,
    ParentSurface? parentSurface,
    PrimaryNavStyle? primaryNav,
    bool? socialPeerSurface,
    double? notificationsPerDay,
  }) {
    return PersonaTheme(
      persona: persona ?? this.persona,
      touchTargetFloor: touchTargetFloor ?? this.touchTargetFloor,
      typeScale: typeScale ?? this.typeScale,
      motionEnergy: motionEnergy ?? this.motionEnergy,
      illustrationDensity: illustrationDensity ?? this.illustrationDensity,
      audioNarrationDefaultOn:
          audioNarrationDefaultOn ?? this.audioNarrationDefaultOn,
      streakShameAllowed: streakShameAllowed ?? this.streakShameAllowed,
      exposeNumericRanks: exposeNumericRanks ?? this.exposeNumericRanks,
      lumiProminence: lumiProminence ?? this.lumiProminence,
      parentSurface: parentSurface ?? this.parentSurface,
      primaryNav: primaryNav ?? this.primaryNav,
      socialPeerSurface: socialPeerSurface ?? this.socialPeerSurface,
      notificationsPerDay: notificationsPerDay ?? this.notificationsPerDay,
    );
  }

  /// Lerp across persona matrices isn't a natural operation — personas are
  /// discrete user-context modes, not a continuous axis. Returning the
  /// destination unchanged is the safest behaviour; tween animations
  /// between personas would feel like a glitch in production.
  @override
  PersonaTheme lerp(ThemeExtension<PersonaTheme>? other, double t) {
    if (other is! PersonaTheme) return this;
    return t < 0.5 ? this : other;
  }
}
