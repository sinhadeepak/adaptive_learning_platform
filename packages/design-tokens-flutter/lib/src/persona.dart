// Persona — the four top-level audience modes Aurora v3 addresses.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §4
//
// This file holds only the enum + stable string id + debug label so it can
// live inside the design-tokens-flutter package alongside the rest of the
// theme types (PersonaTheme, AuroraColors, AuroraTypography). The runtime
// notifier with persistence lives in the app side as it depends on
// flutter_secure_storage.

/// The four top-level audience modes the mobile app addresses.
///
/// Order is meaningful for analytics breakdowns only — there is no
/// implied progression between personas.
enum Persona {
  /// Class V–VIII (10–14). Adventure-map home, audio narration default-on,
  /// stars/badges instead of percentile, required parent layer.
  kid,

  /// Class IX–XII, NEET / JEE prep (14–18). Five-tab nav with peer voice,
  /// streaks + leagues + battles, optional weekly parent digest.
  teen,

  /// UPSC / GATE / CAT / professional exams (20–32). Five-tab exam-prep
  /// nav, crisp data-forward voice, no parent surface.
  aspirant,

  /// Working professional learning new skills — Vedic Maths, Excel, system
  /// design, languages (24–45). Four-tab learning nav, professional voice,
  /// streaks hidden by default, Lumi in Coach mode.
  learner,
}

extension PersonaX on Persona {
  /// Stable string id used by storage + analytics. Never localise.
  String get id => switch (this) {
        Persona.kid => 'kid',
        Persona.teen => 'teen',
        Persona.aspirant => 'aspirant',
        Persona.learner => 'learner',
      };

  /// Human-readable label for Settings / debug surfaces (English only).
  /// Localisation goes through the voice library in the app side.
  String get debugLabel => switch (this) {
        Persona.kid => 'Kid (Class V–VIII)',
        Persona.teen => 'Teen (Class IX–XII, NEET/JEE)',
        Persona.aspirant => 'Aspirant (UPSC / CAT / GATE)',
        Persona.learner => 'Learner (working professional)',
      };

  static Persona? fromId(String? raw) => switch (raw) {
        'kid' => Persona.kid,
        'teen' => Persona.teen,
        'aspirant' => Persona.aspirant,
        'learner' => Persona.learner,
        _ => null,
      };
}
