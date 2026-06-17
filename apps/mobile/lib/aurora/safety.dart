// AuroraSafety — client-side content safety pipeline.
//
// Spec: docs/02-design/content-safety-policy.md
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.5.
//
// What this file does
// ───────────────────
// 1. Provides the [SafetyCategory] taxonomy that L1/L2 filters classify
//    text into.
// 2. Runs a fast client-side preflight on user input before any network
//    call — catches the highest-confidence cases (self-harm keyword
//    triggers, obvious profanity, PII regex matches) and surfaces the
//    appropriate UX immediately. The server-side enforcement layer is
//    authoritative; client-side is latency optimisation.
// 3. Carries the official helpline data ([SelfHarmHelpline]) so the
//    in-app helpline sheet ([AuroraSafetyHelplineSheet]) is decoupled
//    from network availability — helpline must surface even when the
//    server is unreachable.
//
// What this file does NOT do
// ──────────────────────────
// - Does not call Perspective API or OpenAI Moderation. Those are the
//   server's job and live in `alp-tutor` (W2.0.5 backend).
// - Does not store any reported / flagged content locally. Reports go
//   straight to the server-side moderator queue.
// - Does not log user input text to any persistent store. The whole
//   point of the safety layer is to limit exposure of sensitive
//   content.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart' show debugPrint, immutable;

/// Coarse classification taxonomy for a piece of user-submitted content.
/// One [SafetyCategory] per check; multiple checks may concurrently
/// match a single piece of text — the most severe wins.
enum SafetyCategory {
  /// Self-harm or suicidal ideation. Highest severity. Triggers the
  /// helpline-sheet escalation flow and locks the AI session.
  selfHarm,

  /// Profanity, slurs, hate speech.
  profanity,

  /// Sexual content. Always blocked.
  sexual,

  /// Violence, threats, harassment.
  violence,

  /// Doxxing or PII request — phone, address, email, Aadhaar, PAN
  /// pattern.
  pii,

  /// Exam-cheating signals during a live test window. Detected
  /// server-side; client doesn't try.
  examCheating,

  /// Political stance solicitation (Aspirant only).
  politicalStance,

  /// Illegal activity — drug purchase, weapon acquisition, piracy.
  illegal,

  /// Out-of-syllabus query that Lumi can't help with under the
  /// current persona's coaching contract.
  outOfSyllabus,
}

/// Severity ladder used to break ties when multiple categories match.
extension SafetyCategorySeverity on SafetyCategory {
  /// 0 (low) … 10 (catastrophic). Higher wins.
  int get severity => switch (this) {
        SafetyCategory.selfHarm => 10,
        SafetyCategory.sexual => 9,
        SafetyCategory.violence => 8,
        SafetyCategory.illegal => 7,
        SafetyCategory.pii => 6,
        SafetyCategory.profanity => 5,
        SafetyCategory.examCheating => 4,
        SafetyCategory.politicalStance => 3,
        SafetyCategory.outOfSyllabus => 1,
      };

  /// Stable string id for analytics + server payloads.
  String get id => switch (this) {
        SafetyCategory.selfHarm => 'self_harm',
        SafetyCategory.profanity => 'profanity',
        SafetyCategory.sexual => 'sexual',
        SafetyCategory.violence => 'violence',
        SafetyCategory.pii => 'pii',
        SafetyCategory.examCheating => 'exam_cheating',
        SafetyCategory.politicalStance => 'political_stance',
        SafetyCategory.illegal => 'illegal',
        SafetyCategory.outOfSyllabus => 'out_of_syllabus',
      };
}

/// Result of running [AuroraSafety.preflight] on a piece of input.
/// Holds zero or more matched categories with their confidence scores
/// and the dominant category (highest severity × confidence) — UI
/// surfaces the dominant category's refusal pattern.
@immutable
class SafetyVerdict {
  const SafetyVerdict({
    required this.matches,
    required this.dominant,
  });

  /// All categories triggered by the client-side preflight. Each
  /// confidence is on [0.0, 1.0]. Empty when input is clean.
  final Map<SafetyCategory, double> matches;

  /// The category whose response the UI should follow, or `null`
  /// when [matches] is empty. Picked by max severity, with confidence
  /// as a tiebreaker.
  final SafetyCategory? dominant;

  bool get isBlocked => dominant != null;
}

/// Static helpline data — pre-bundled so the helpline sheet can render
/// without a network round-trip even when the user is offline.
@immutable
class SelfHarmHelpline {
  const SelfHarmHelpline({
    required this.name,
    required this.phone,
    required this.hours,
    required this.country,
    this.whatsapp,
    this.url,
  });

  /// Display name. Always English (the helpline org's own brand).
  final String name;

  /// `tel:` URI dialer payload. International format with country code.
  final String phone;

  /// Localised hours string. Falls back to English when the active
  /// locale isn't translated yet.
  final String hours;

  /// ISO 3166 alpha-2 (e.g. "IN", "US"). Helps the sheet pick the
  /// right set based on the user's geo or self-declared country.
  final String country;

  /// Optional WhatsApp `https://wa.me/<intl_number>` URL.
  final String? whatsapp;

  /// Optional homepage / chat URL.
  final String? url;
}

/// Curated list of helplines, surfaced by [AuroraSafetyHelplineSheet]
/// after a self-harm trigger. Order is presentation order in the UI.
const List<SelfHarmHelpline> selfHarmHelplines = [
  SelfHarmHelpline(
    name: 'iCall (India)',
    phone: 'tel:+919152987821',
    hours: '10 AM – 8 PM, Mon – Sat',
    country: 'IN',
    whatsapp: 'https://wa.me/919152987821',
    url: 'https://icallhelpline.org',
  ),
  SelfHarmHelpline(
    name: 'Vandrevala Foundation (India)',
    phone: 'tel:+918602662345',
    hours: '24 / 7',
    country: 'IN',
    url: 'https://www.vandrevalafoundation.com',
  ),
  SelfHarmHelpline(
    name: 'AASRA (India)',
    phone: 'tel:+919820466726',
    hours: '24 / 7',
    country: 'IN',
    url: 'https://www.aasra.info',
  ),
  SelfHarmHelpline(
    name: 'Find a helpline (international)',
    phone: '',
    hours: 'Various',
    country: 'XX', // worldwide directory
    url: 'https://findahelpline.com',
  ),
];

/// Client-side safety pipeline. All methods are pure / sync where
/// possible; the async ones never raise — they return a clean
/// [SafetyVerdict] (with an `outOfSyllabus` fallback) on any error.
abstract class AuroraSafety {
  AuroraSafety._();

  // ── L1 input preflight ────────────────────────────────────────────

  /// Runs the **client-side** L1 input filter on [input] for the given
  /// [persona]. This is best-effort latency optimisation — the
  /// server-side filter is authoritative. Returns a [SafetyVerdict]
  /// that the caller should consult **before** firing a network call.
  ///
  /// Specifically, callers SHOULD:
  ///   - If `verdict.dominant == SafetyCategory.selfHarm`, push the
  ///     helpline sheet IMMEDIATELY and DO NOT send the input to the
  ///     server.
  ///   - For any other blocking category, surface the persona's
  ///     refusal copy and either skip the network call or send the
  ///     input with a `client_block=<category>` header (server still
  ///     enforces — this header is telemetry, not authorisation).
  ///
  /// The preflight uses keyword + regex matching only — it does not
  /// load any model. Intentionally tuned high-precision / lower-
  /// recall: anything the client misses gets caught server-side.
  static SafetyVerdict preflightInput({
    required String input,
    required Persona persona,
  }) {
    final lower = input.toLowerCase();
    final matches = <SafetyCategory, double>{};

    // Self-harm — highest-precision keyword preflight. Server-side
    // classifier is the authoritative path; this only catches the
    // most explicit phrasings.
    for (final phrase in _selfHarmKeywords) {
      if (lower.contains(phrase)) {
        matches[SafetyCategory.selfHarm] = 0.95;
        break;
      }
    }

    // PII — Indian phone, email, Aadhaar pattern, PAN pattern.
    if (_phoneIN.hasMatch(input) ||
        _email.hasMatch(input) ||
        _aadhaar.hasMatch(input) ||
        _pan.hasMatch(input)) {
      matches[SafetyCategory.pii] =
          (matches[SafetyCategory.pii] ?? 0).clamp(0.85, 1.0);
    }

    // Profanity — token match on common slurs / explicit terms.
    // The list intentionally lives at runtime constant; the full
    // server-side list is curated by Trust & Safety and not duplicated
    // here.
    for (final tok in _highConfidenceProfanity) {
      if (lower.contains(tok)) {
        matches[SafetyCategory.profanity] = 0.90;
        break;
      }
    }

    // Pick the dominant category by severity, with confidence as tie-
    // breaker. (severity * 100 + (confidence * 10).round()).
    SafetyCategory? dominant;
    var best = -1;
    matches.forEach((cat, conf) {
      final score = cat.severity * 100 + (conf * 10).round();
      if (score > best) {
        best = score;
        dominant = cat;
      }
    });

    final verdict = SafetyVerdict(matches: matches, dominant: dominant);
    if (verdict.isBlocked) {
      // Persona is part of the analytics envelope; logged here to
      // assist with false-positive review. Plaintext input is never
      // logged — only the matched categories + confidence.
      debugPrint(
        '[AuroraSafety] preflight blocked '
        'persona=${persona.id} '
        'dominant=${dominant?.id} '
        'matches=${matches.map((k, v) => MapEntry(k.id, v))}',
      );
    }
    return verdict;
  }

  // ── L2 output check (client-side defense-in-depth) ────────────────

  /// Defensive sweep applied to AI-generated text before it's rendered
  /// to the user. The server-side L2 filter is authoritative; this
  /// only catches PII leaks the server may have missed.
  ///
  /// Returns the original text on clean output; a redacted version
  /// when PII patterns are found. Detection logs a debug warning.
  static String redactPiiInOutput(String text) {
    var out = text;
    if (_phoneIN.hasMatch(out)) {
      out = out.replaceAll(_phoneIN, '[redacted]');
      _warnPiiLeak('phone');
    }
    if (_email.hasMatch(out)) {
      out = out.replaceAll(_email, '[redacted]');
      _warnPiiLeak('email');
    }
    if (_aadhaar.hasMatch(out)) {
      out = out.replaceAll(_aadhaar, '[redacted]');
      _warnPiiLeak('aadhaar');
    }
    if (_pan.hasMatch(out)) {
      out = out.replaceAll(_pan, '[redacted]');
      _warnPiiLeak('pan');
    }
    return out;
  }

  static void _warnPiiLeak(String kind) {
    assert(() {
      debugPrint(
        '[AuroraSafety] redacted $kind from model output — '
        'server-side L2 filter should have caught this. Investigate.',
      );
      return true;
    }());
  }
}

// ── Keyword + regex banks ────────────────────────────────────────────
//
// These are intentionally minimal — high-precision triggers only. The
// server-side classifier (Perspective / OpenAI Moderation / custom)
// has full coverage; we don't duplicate it on-device.

const _selfHarmKeywords = <String>[
  'kill myself',
  'kms',
  'want to die',
  'end it all',
  'end my life',
  'no reason to live',
  // Devanagari + Hinglish — minimal coverage for the highest-frequency
  // forms. Full list curated by Trust & Safety + linguistic reviewer.
  'mujhe marna hai',
  'maut chahiye',
];

const _highConfidenceProfanity = <String>[
  // Intentionally not included here as an inline constant set; the
  // build pulls a curated list at compile time from
  // `apps/mobile/lib/aurora/safety_lexicon.dart` (gitignored, sourced
  // from Trust & Safety). For Wave 2 W2.0.5 we ship the empty default
  // so the build is reproducible without the proprietary lexicon —
  // server-side filter remains the enforcement layer.
];

// Indian mobile pattern: optional +91 / 91 prefix, then 6/7/8/9 + 9
// more digits. Matches loose pasting (with spaces / dashes).
final RegExp _phoneIN = RegExp(r'(?:\+?91[-\s]?)?[6789]\d{9}');

// Email — pragmatic regex, not strict RFC.
final RegExp _email =
    RegExp(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}');

// Aadhaar — 12 digits, optionally split by spaces.
final RegExp _aadhaar = RegExp(r'\b\d{4}\s?\d{4}\s?\d{4}\b');

// PAN — 5 letters + 4 digits + 1 letter.
final RegExp _pan = RegExp(r'\b[A-Z]{5}\d{4}[A-Z]\b');
