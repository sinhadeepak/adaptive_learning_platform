// LumiCoach — the AI coaching contract.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §20.5
//       (Lumi Coaching Model — appended in W2.0.7).
//       docs/02-design/content-safety-policy.md §3 (refusal patterns).
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.7.
//
// What this file does
// ───────────────────
// 1. Defines [LumiCoachMode] — the four coaching personas (Encourager /
//    Buddy / Mentor / Coach) that Lumi adopts based on the user's
//    [Persona]. Each mode flexes voice, knowledge depth, hint policy,
//    and refusal posture.
// 2. Provides [HintPolicy] — how many progressive hints the user gets
//    before Lumi shows the worked solution, per mode.
// 3. Provides refusal copy keyed by ([SafetyCategory], [LumiCoachMode]).
//    Together with safety.dart's preflight, this is the client-side
//    half of the safety contract.
// 4. Provides knowledge-boundary helpers — what Lumi says when the
//    model can't confidently answer.
// 5. Declares the wire types ([LumiRequest], [LumiResponse]) +
//    HTTP header constants the (forthcoming) alp-tutor backend will
//    consume. Server-side prompt templates land in a separate sub-wave.
//
// What this file does NOT do
// ──────────────────────────
// - Does not make HTTP calls. Network I/O is the (forthcoming) Lumi UI
//   widget's job.
// - Does not store session context. That lives in lumi_context.dart.
// - Does not emit telemetry. That lives in lumi_telemetry.dart.
// - Does not localise refusal copy beyond English. Hindi / TA / TE / BN
//   land via AuroraVoice in W2.12 / W3.8.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart' show immutable;

import 'safety.dart';

// ── Coaching modes ────────────────────────────────────────────────────

/// The four coaching personalities Lumi adopts. One mode per [Persona].
///
/// Voice, depth, hint policy and refusal posture all flex by mode. The
/// mapping is one-to-one and codified in [LumiCoachModeX.forPersona] so
/// callers never branch on the user-persona directly — they ask for the
/// coach mode and the right contract follows.
enum LumiCoachMode {
  /// Kid (Class V–VIII). Warm, exclamatory, simple vocab, audio-narrated.
  /// Concept-level depth; 3 progressive hints before the answer; never
  /// the full answer on first ask.
  encourager,

  /// Teen (IX–XII, NEET / JEE prep). Cool, peer-tone, mild humour.
  /// JEE-Adv / NEET-PG depth + speed-tricks + common-mistake call-out;
  /// 2 hints then full worked solution.
  buddy,

  /// Aspirant (UPSC / CAT / GATE). Crisp, respectful, data-forward.
  /// Full syllabus depth + standard-reference citations; 1 hint then
  /// guided derivation, never the full answer; for UPSC mains: structure
  /// scaffold but not the content.
  mentor,

  /// Learner (working professional). Professional, peer-of-domain,
  /// productivity-language, time-conscious. Domain-deep with industry
  /// context; 1 hint then the full optimal solution with rationale.
  coach,
}

extension LumiCoachModeX on LumiCoachMode {
  /// Stable string id used in HTTP headers (`X-Lumi-Mode`) and
  /// telemetry payloads. Never localise.
  String get id => switch (this) {
        LumiCoachMode.encourager => 'encourager',
        LumiCoachMode.buddy => 'buddy',
        LumiCoachMode.mentor => 'mentor',
        LumiCoachMode.coach => 'coach',
      };

  /// Human-readable label for Settings + debug surfaces. English only.
  String get debugLabel => switch (this) {
        LumiCoachMode.encourager => 'Encourager (Kid)',
        LumiCoachMode.buddy => 'Buddy (Teen)',
        LumiCoachMode.mentor => 'Mentor (Aspirant)',
        LumiCoachMode.coach => 'Coach (Learner)',
      };

  /// Canonical persona → coach-mode mapping.
  static LumiCoachMode forPersona(Persona p) => switch (p) {
        Persona.kid => LumiCoachMode.encourager,
        Persona.teen => LumiCoachMode.buddy,
        Persona.aspirant => LumiCoachMode.mentor,
        Persona.learner => LumiCoachMode.coach,
      };
}

/// HTTP header key the (forthcoming) `alp-tutor` service inspects to
/// pick the right prompt template. Constant lives here so both the
/// client transport layer and the server-side dispatcher agree on the
/// exact spelling.
const String xLumiModeHeader = 'X-Lumi-Mode';

// ── Hint policy ───────────────────────────────────────────────────────

/// Maximum number of progressive hints Lumi will give before showing
/// the worked solution (or — for Mentor + answer-writing — refusing to
/// show the full answer at all).
///
/// Encourager: 3 hints → guided walkthrough.
/// Buddy:      2 hints → full worked solution + alternate methods.
/// Mentor:     1 hint  → guided derivation; never the full answer.
/// Coach:      1 hint  → full optimal solution with rationale.
@immutable
class HintPolicy {
  const HintPolicy({
    required this.maxHints,
    required this.revealsFullAnswer,
  });

  /// Number of progressive hints before [revealsFullAnswer] kicks in
  /// (or before Lumi refuses to go further for Mentor).
  final int maxHints;

  /// Whether Lumi ultimately reveals the full worked answer once
  /// [maxHints] is reached. False for Mentor — UPSC aspirants must
  /// derive the answer themselves; Mentor walks the structure, not the
  /// content.
  final bool revealsFullAnswer;

  static const HintPolicy encourager =
      HintPolicy(maxHints: 3, revealsFullAnswer: true);
  static const HintPolicy buddy =
      HintPolicy(maxHints: 2, revealsFullAnswer: true);
  static const HintPolicy mentor =
      HintPolicy(maxHints: 1, revealsFullAnswer: false);
  static const HintPolicy coach =
      HintPolicy(maxHints: 1, revealsFullAnswer: true);

  static HintPolicy forMode(LumiCoachMode mode) => switch (mode) {
        LumiCoachMode.encourager => encourager,
        LumiCoachMode.buddy => buddy,
        LumiCoachMode.mentor => mentor,
        LumiCoachMode.coach => coach,
      };
}

// ── Refusal templates ────────────────────────────────────────────────
//
// Keyed by ([SafetyCategory], [LumiCoachMode]). The voice copy here
// matches docs/02-design/content-safety-policy.md §3 exactly so that a
// safety auditor reading the policy can grep this file and find the
// same strings, byte-for-byte.

/// English refusal copy. Returns `null` for the [SafetyCategory.selfHarm]
/// case because self-harm is never a refusal — it triggers the helpline
/// escalation flow (see safety_self_harm_sheet.dart). Callers MUST check
/// for that category separately before consulting this table.
String? lumiRefusalCopy({
  required SafetyCategory category,
  required LumiCoachMode mode,
}) {
  if (category == SafetyCategory.selfHarm) {
    // Self-harm uses the helpline sheet, not a refusal bubble. Callers
    // must route to [AuroraSafetyHelplineSheet] before consulting this
    // table. Returning null here is the contract that enforces it.
    return null;
  }

  return switch ((category, mode)) {
    // ── Profanity ────────────────────────────────────────────────
    (SafetyCategory.profanity, LumiCoachMode.encourager) =>
      "Let's keep our words kind — try asking again? 💜",
    (SafetyCategory.profanity, LumiCoachMode.buddy) =>
      "Hey — let's keep it clean. Try rephrasing?",
    (SafetyCategory.profanity, LumiCoachMode.mentor) =>
      'Please rephrase without the language.',
    (SafetyCategory.profanity, LumiCoachMode.coach) =>
      'Please rephrase.',

    // ── Sexual content ──────────────────────────────────────────
    (SafetyCategory.sexual, LumiCoachMode.encourager) =>
      "I can't talk about that. Want to do a math question instead? 🌟",
    (SafetyCategory.sexual, LumiCoachMode.buddy) =>
      "Not a topic I'll go into. Try another question.",
    (SafetyCategory.sexual, LumiCoachMode.mentor) =>
      "I can't engage with that topic.",
    (SafetyCategory.sexual, LumiCoachMode.coach) =>
      "I can't engage with that topic.",

    // ── Violence / threats ──────────────────────────────────────
    (SafetyCategory.violence, LumiCoachMode.encourager) =>
      "Let's keep things friendly. What are you working on? 💜",
    (SafetyCategory.violence, LumiCoachMode.buddy) =>
      "Not a topic I'll go into.",
    (SafetyCategory.violence, LumiCoachMode.mentor) =>
      "I can't engage with that topic.",
    (SafetyCategory.violence, LumiCoachMode.coach) =>
      "I can't engage with that topic.",

    // ── PII (doxxing / contact-info request) ────────────────────
    (SafetyCategory.pii, LumiCoachMode.encourager) =>
      "I don't share phone numbers or addresses.",
    (SafetyCategory.pii, LumiCoachMode.buddy) =>
      "I can't share contact info.",
    (SafetyCategory.pii, LumiCoachMode.mentor) =>
      "I won't share contact details.",
    (SafetyCategory.pii, LumiCoachMode.coach) =>
      "I won't share contact details.",

    // ── Exam cheating during live test ──────────────────────────
    (SafetyCategory.examCheating, LumiCoachMode.encourager) =>
      "Lumi can't help during a live test — see you after! 💪",
    (SafetyCategory.examCheating, LumiCoachMode.buddy) =>
      "Can't help during a live test. Catch me after.",
    (SafetyCategory.examCheating, LumiCoachMode.mentor) =>
      'Cannot assist during an active test window.',
    (SafetyCategory.examCheating, LumiCoachMode.coach) =>
      'Cannot assist during an active test window.',

    // ── Political stance solicitation (Aspirant only — others n/a) ─
    (SafetyCategory.politicalStance, LumiCoachMode.mentor) =>
      "I summarise positions; I don't endorse one. Want sources for both sides?",
    (SafetyCategory.politicalStance, _) =>
      // For Kid / Teen / Learner, treat as out-of-scope.
      "That's outside what Lumi covers here.",

    // ── Illegal activity ────────────────────────────────────────
    (SafetyCategory.illegal, LumiCoachMode.encourager) =>
      "That's not something I can help with.",
    (SafetyCategory.illegal, LumiCoachMode.buddy) =>
      "Can't help with that.",
    (SafetyCategory.illegal, LumiCoachMode.mentor) =>
      "I can't engage with that.",
    (SafetyCategory.illegal, LumiCoachMode.coach) =>
      "I can't engage with that.",

    // ── Out-of-syllabus ─────────────────────────────────────────
    (SafetyCategory.outOfSyllabus, LumiCoachMode.encourager) =>
      "That's outside what I know — let's stick to your map?",
    (SafetyCategory.outOfSyllabus, LumiCoachMode.buddy) =>
      'Outside the syllabus — want me to find related?',
    (SafetyCategory.outOfSyllabus, LumiCoachMode.mentor) =>
      'Out of syllabus scope. Want a related concept?',
    (SafetyCategory.outOfSyllabus, LumiCoachMode.coach) =>
      'Outside the course. Useful to cover anyway?',

    // selfHarm handled above; this is unreachable but exhaustive.
    (SafetyCategory.selfHarm, _) => null,
  };
}

// ── Knowledge-boundary helpers ───────────────────────────────────────

/// Confidence threshold for factual claims. When the model's
/// self-evaluated confidence is below this, Lumi falls back to an
/// [unsureCopy] response instead of asserting the claim. Used by the
/// server-side L2 output filter; surfaced here so the client knows the
/// same threshold for any local model calls (Wave 6+).
const double kLumiConfidenceThreshold = 0.7;

/// Copy Lumi uses when confidence is below threshold. Tone matches the
/// coach mode but the core message is consistent: don't bluff.
String unsureCopy(LumiCoachMode mode) => switch (mode) {
      LumiCoachMode.encourager =>
        "Hmm — I'm not sure! Let's look in your book together? 🌟",
      LumiCoachMode.buddy =>
        "I'm not 100% on that — check the chapter and come back?",
      LumiCoachMode.mentor =>
        "I'm not sure; the relevant reference is below. Confirm before relying on it.",
      LumiCoachMode.coach =>
        "I'm not certain — here's the closest authoritative source.",
    };

// ── Wire types ───────────────────────────────────────────────────────

/// A single turn in a Lumi conversation. `role` is either 'user' or
/// 'lumi'. `metadata` carries hint-level, confidence, citations, and
/// safety-event markers from the server. Designed to round-trip through
/// JSON without surprises.
@immutable
class LumiTurn {
  const LumiTurn({
    required this.role,
    required this.content,
    this.metadata = const {},
  });

  /// `'user'` or `'lumi'`.
  final String role;

  /// Plain-text content. Markdown is allowed but never HTML.
  final String content;

  /// Server-attached metadata. Known keys:
  ///   - `hint_level`: int (0 = no hint shown, 1..N = progressive)
  ///   - `confidence`: double 0..1
  ///   - `citations`: List<Map<String,String>> (`url`, `indexed_at`)
  ///   - `refused`: bool — true when this is a refusal bubble
  ///   - `refused_category`: SafetyCategory.id
  ///   - `redacted`: bool — true when output PII was redacted client-side
  final Map<String, dynamic> metadata;

  Map<String, dynamic> toJson() => {
        'role': role,
        'content': content,
        if (metadata.isNotEmpty) 'metadata': metadata,
      };

  factory LumiTurn.fromJson(Map<String, dynamic> json) => LumiTurn(
        role: json['role'] as String,
        content: json['content'] as String,
        metadata: (json['metadata'] as Map?)?.cast<String, dynamic>() ??
            const {},
      );
}

/// Payload the client sends to `alp-tutor`. `mode` is the coach mode,
/// `history` is the last N turns from the session context (capped by
/// LumiCoachContext.contextWindow), `locale` is the user's active locale
/// for response language.
@immutable
class LumiRequest {
  const LumiRequest({
    required this.mode,
    required this.userMessage,
    required this.history,
    required this.locale,
    this.topicId,
    this.hintLevelRequested,
    this.sessionId,
  });

  final LumiCoachMode mode;
  final String userMessage;
  final List<LumiTurn> history;
  final String locale; // e.g. 'en-IN', 'hi-IN'
  final String? topicId;

  /// 0 = no hint, 1..N = progressive. Must be ≤ HintPolicy.maxHints
  /// for the mode. The server enforces; the client respects.
  final int? hintLevelRequested;

  /// Stable session id (UUID v4) for multi-turn tracking + telemetry.
  /// New per cold-start; persists for the in-session lifetime.
  final String? sessionId;

  Map<String, dynamic> toJson() => {
        'mode': mode.id,
        'user_message': userMessage,
        'history': history.map((t) => t.toJson()).toList(),
        'locale': locale,
        if (topicId != null) 'topic_id': topicId,
        if (hintLevelRequested != null)
          'hint_level_requested': hintLevelRequested,
        if (sessionId != null) 'session_id': sessionId,
      };
}

/// Response from `alp-tutor`. `lumi` is the single turn rendered to the
/// user; `usage` is the (optional) token-accounting payload the server
/// can attach for cost telemetry.
@immutable
class LumiResponse {
  const LumiResponse({
    required this.lumi,
    this.usage = const {},
  });

  final LumiTurn lumi;
  final Map<String, dynamic> usage;

  factory LumiResponse.fromJson(Map<String, dynamic> json) => LumiResponse(
        lumi: LumiTurn.fromJson(json['lumi'] as Map<String, dynamic>),
        usage:
            (json['usage'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
}
