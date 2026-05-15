// AuroraVoice — persona-aware, locale-aware microcopy library.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §4 + §20.5
//       (Lumi Coaching Model dialogue archetypes).
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0 — Persona system foundation.
//
// The voice library is the single source of truth for user-facing strings
// that flex by persona. The voice shifts materially across personas — what
// Lumi says to a Class V kid ("Yay! You got it! 🎉") is not what Lumi says
// to a UPSC aspirant ("Correct. Solid reasoning."). Hard-coding strings at
// call sites would mix four voices into every screen.
//
// API
// ────
//   final voice = AuroraVoice.of(context);
//   final greeting = voice.greeting(name: session.user.firstName);
//
// `AuroraVoice.of(context)` reads the active persona from the
// `PersonaTheme` extension and the active locale from `Localizations`.
// String keys are methods on [AuroraVoice]; this gives us compile-time
// safety (every key is a known method, with typed arguments).
//
// Locale coverage
// ───────────────
// Wave 2 ships English (en-IN) for all four personas. Hindi (hi-IN)
// translations of the same keys land at W2.12. Tamil / Telugu / Bengali
// land at W3.8. When a locale is missing, the library falls back to
// en-IN with a debug-mode warning so we never render a key-as-string.
//
// Adding a new key
// ────────────────
// 1. Declare the method signature on [AuroraVoice] (e.g.
//    `String greeting({required String name})`).
// 2. Implement it in [_VoiceEn] for all four personas via a
//    `switch (persona)` exhaustive expression — Dart will fail to
//    compile if any persona is missing.
// 3. Add the same method to [_VoiceHi] (and TA/TE/BN as locales land);
//    until then the locale-resolver auto-falls-back to English.
//
// Why methods instead of a map?
// ─────────────────────────────
// Methods give us strong typing on placeholders (no "what type is {count},
// int or String?") and let the compiler check exhaustiveness on persona
// + locale. A `Map<String, Map<Persona, String>>` would let bugs land
// silently when a translator forgets a key.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/material.dart' show Theme;
import 'package:flutter/widgets.dart';

/// Top-level voice handle resolved per-build via
/// `AuroraVoice.of(context)`. Holds the active persona and delegates to
/// the locale-specific implementation.
abstract class AuroraVoice {
  AuroraVoice();

  /// Resolves the right voice for the active persona + locale. Falls
  /// back to `_VoiceEn` when the active locale isn't shipped yet.
  static AuroraVoice of(BuildContext context) {
    final personaTheme = Theme.of(context).extension<PersonaTheme>();
    final persona = personaTheme?.persona ?? Persona.aspirant;
    final locale = Localizations.maybeLocaleOf(context) ?? const Locale('en');
    return _resolve(persona: persona, locale: locale);
  }

  /// Test-friendly factory that bypasses [BuildContext].
  @visibleForTesting
  static AuroraVoice forTest({
    Persona persona = Persona.aspirant,
    Locale locale = const Locale('en'),
  }) =>
      _resolve(persona: persona, locale: locale);

  static AuroraVoice _resolve({
    required Persona persona,
    required Locale locale,
  }) {
    switch (locale.languageCode) {
      case 'en':
        return _VoiceEn(persona);
      case 'hi':
        // Hindi translations land at W2.12; until then, fall back to
        // English so we never render a key-as-string.
        assert(() {
          debugPrint(
            '[AuroraVoice] hi-IN not yet shipped for persona '
            '${persona.id} — falling back to en-IN. (W2.12)',
          );
          return true;
        }());
        return _VoiceEn(persona);
      default:
        return _VoiceEn(persona);
    }
  }

  /// The persona this voice instance is rendering for. Visible so widgets
  /// that branch on persona for layout reasons (not just copy) can read
  /// the same source the voice uses.
  Persona get persona;

  // ── Dialogue archetypes (Lumi Coaching Model §20.5) ────────────────
  //
  // Each method represents one slot. The persona switch inside the
  // implementation chooses the right tone (Encourager / Buddy / Mentor /
  // Coach). Adding a new dialogue slot is: declare here, implement in
  // every locale's class.

  /// Greeting on Home / session start. Uses the user's first name.
  String greeting({required String name});

  /// Lumi's response when the user answers correctly.
  String onCorrect();

  /// Lumi's response when the user answers incorrectly. Tone flexes
  /// hard: Kid gets gentle encouragement; Learner gets a pointer.
  String onWrong();

  /// Lumi's nudge when the user has been idle on a question for >30s.
  String onStuck();

  /// Celebration line for a milestone (streak unlock, badge, certificate).
  String onMilestone({required String milestoneName});

  /// "Don't lose your streak" recovery prompt. Returns null when the
  /// active persona's [PersonaTheme.streakShameAllowed] is false — voices
  /// must respect that flag or onboarding consent is violated.
  String? streakRecovery({required int streakDays});

  /// Farewell on session end. Returns the streak count, the persona tone
  /// applied to "see you tomorrow".
  String farewell({required int streakDays});

  /// CTA label for the primary "start" button on Home. Kid sees
  /// "Continue your adventure"; Aspirant sees "Resume plan".
  String primaryCtaLabel();

  /// Loading-state placeholder used in skeleton rows. Different from a
  /// raw "Loading…" because the Kid voice frames it as Lumi action
  /// ("Lumi is fetching that…").
  String loadingPlaceholder();
}

// ── English voice (en-IN) ─────────────────────────────────────────────
//
// Lives in the same file as the abstract class so persona-coverage is
// reviewable at a glance. When the file grows beyond ~600 LOC we'll
// split per-locale (W2.12).

class _VoiceEn extends AuroraVoice {
  _VoiceEn(this._persona);
  final Persona _persona;

  @override
  Persona get persona => _persona;

  @override
  String greeting({required String name}) => switch (_persona) {
        Persona.kid =>
          'Hi $name! Lumi has been waiting to learn with you today 🌟',
        Persona.teen => 'Hey $name 👋 Ready for today\'s set?',
        Persona.aspirant =>
          'Welcome back, $name. Today\'s focus is queued up.',
        Persona.learner =>
          'Welcome back, $name. Pick up where you left off?',
      };

  @override
  String onCorrect() => switch (_persona) {
        Persona.kid => 'AMAZING! ⭐ You got it!',
        Persona.teen => 'Boom. Nailed it.',
        Persona.aspirant => 'Correct. Solid reasoning.',
        Persona.learner => 'Correct.',
      };

  @override
  String onWrong() => switch (_persona) {
        Persona.kid => 'Oops — no worries, let\'s look again 💪',
        Persona.teen => 'Close — try once more, you\'re nearly there.',
        Persona.aspirant => 'Not quite. Notice the constraint at step 2?',
        Persona.learner =>
          'Not optimal — the cleaner approach uses a different pattern.',
      };

  @override
  String onStuck() => switch (_persona) {
        Persona.kid => 'Need a friendly hint? 💡',
        Persona.teen => 'Want a hint?',
        Persona.aspirant => 'Want me to surface the relevant rule?',
        Persona.learner => 'Want me to walk through the approach?',
      };

  @override
  String onMilestone({required String milestoneName}) => switch (_persona) {
        Persona.kid =>
          '🎉🌟✨ You unlocked $milestoneName! Lumi is SO proud!',
        Persona.teen => '$milestoneName unlocked. You\'re cooking.',
        Persona.aspirant =>
          'Milestone: $milestoneName. Pace is on for your target.',
        Persona.learner =>
          '$milestoneName earned — shareable on LinkedIn.',
      };

  @override
  String? streakRecovery({required int streakDays}) {
    // Honour the PersonaTheme.streakShameAllowed flag at the voice
    // layer — even if a screen accidentally calls this for Kid /
    // Learner, we return null so the screen can render an empty state.
    final allowed = switch (_persona) {
      Persona.kid => false,
      Persona.teen => true,
      Persona.aspirant => true,
      Persona.learner => false,
    };
    if (!allowed) return null;
    return switch (_persona) {
      Persona.teen =>
        'Your $streakDays-day streak is wobbling — 5 quick questions to save it?',
      Persona.aspirant =>
        '$streakDays-day streak is at risk. Resume now to keep it.',
      // Unreachable because of the allowed-check above, but a `switch
      // (Persona)` expression must be exhaustive.
      Persona.kid || Persona.learner => null,
    };
  }

  @override
  String farewell({required int streakDays}) => switch (_persona) {
        Persona.kid => 'Bye for now, friend! ⭐ See you tomorrow 💜',
        Persona.teen => 'Done. $streakDays-day streak. Catch you tomorrow.',
        Persona.aspirant =>
          'Session logged. $streakDays-day streak. Plan refreshed.',
        Persona.learner =>
          'Session saved — resume any time. Progress added.',
      };

  @override
  String primaryCtaLabel() => switch (_persona) {
        Persona.kid => 'Continue your adventure',
        Persona.teen => 'Start 5-min power-up',
        Persona.aspirant => 'Resume today\'s plan',
        Persona.learner => 'Continue learning',
      };

  @override
  String loadingPlaceholder() => switch (_persona) {
        Persona.kid => 'Lumi is fetching that…',
        Persona.teen => 'Loading…',
        Persona.aspirant => 'Loading…',
        Persona.learner => 'Loading…',
      };
}
