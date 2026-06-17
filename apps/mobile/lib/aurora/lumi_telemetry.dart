// LumiTelemetry — Lumi-specific telemetry event names + thin emit
// helper.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §31
//       (Analytics taxonomy — appended in Wave 2 W2.4).
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.7.
//
// What this file does
// ───────────────────
// 1. Names every Lumi-relevant analytics event as a `const` so call
//    sites can't typo the wire string.
// 2. Exposes a single [LumiTelemetry.emit] entry point that batches
//    metadata (persona, coach mode, session id) into the payload.
// 3. Until the analytics backbone lands (a separate sub-wave), it
//    delegates to a debug-mode `debugPrint`. Wiring this to Segment /
//    Amplitude / a custom collector is a one-line swap of the
//    [_dispatch] hook.
//
// Privacy
// ───────
// Lumi event payloads MUST NOT include the user's message content or
// any moderator-flagged content. Only category + score + counts. This
// is the DPDP §6 minimisation contract.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart' show debugPrint;

import 'lumi_coach.dart';
import 'safety.dart';

abstract class LumiEvents {
  LumiEvents._();

  // ── Lifecycle ──────────────────────────────────────────────────
  /// Lumi session opened (first turn or warm-resume).
  static const String sessionStarted = 'lumi_session_started';

  /// Lumi session ended (user navigated away, screen disposed,
  /// safety_session_locked, …).
  static const String sessionEnded = 'lumi_session_ended';

  // ── Per-turn ───────────────────────────────────────────────────
  /// A user message was sent to Lumi (server received).
  static const String messageSent = 'lumi_message_sent';

  /// A Lumi response was rendered to the user.
  static const String messageReceived = 'lumi_message_received';

  /// A hint was rendered. `hint_level` int prop is required.
  static const String hintGiven = 'lumi_hint_given';

  /// A Lumi refusal bubble was rendered (safety category triggered).
  /// `category` required; never includes message text.
  static const String refused = 'lumi_refused';

  /// A celebration was triggered (milestone unlock, streak save,
  /// certificate earned). `milestone_id` required.
  static const String celebrationTriggered = 'lumi_celebration_triggered';

  /// Self-harm flag fired and helpline sheet was shown. Server is the
  /// authoritative source of this event; the client also emits in case
  /// the client-side preflight caught it before the network.
  static const String selfHarmTriggered = 'safety_self_harm_triggered';

  /// User submitted an abuse report from a Lumi message.
  static const String userReportSubmitted = 'abuse_report_submitted';

  // ── Knowledge boundaries ───────────────────────────────────────
  /// Lumi answered with the "I'm not sure" fallback because model
  /// confidence was below [kLumiConfidenceThreshold].
  static const String confidenceFallback = 'lumi_confidence_fallback';

  /// User pushed past the hint policy (e.g. requested a 4th hint when
  /// max is 3). Surfaces UX-tuning data, not an error.
  static const String hintPolicyExceeded = 'lumi_hint_policy_exceeded';
}

/// Thin emit facade. Until the analytics backbone lands, this is a
/// debug-mode logger; swap [_dispatch] to wire Segment / Amplitude /
/// the custom collector.
abstract class LumiTelemetry {
  LumiTelemetry._();

  /// Emits a Lumi-tagged event. The standard envelope (persona +
  /// coach mode + session id + locale) is auto-attached so call sites
  /// only supply the event-specific props.
  static void emit({
    required String name,
    required Persona persona,
    required String locale,
    String? sessionId,
    Map<String, dynamic> props = const {},
  }) {
    final mode = LumiCoachModeX.forPersona(persona);
    final payload = <String, dynamic>{
      'event': name,
      'persona': persona.id,
      'coach_mode': mode.id,
      'locale': locale,
      if (sessionId != null) 'session_id': sessionId,
      ...props,
    };
    _dispatch(payload);
  }

  /// Convenience emitter for refusal events. Enforces the no-content
  /// contract — only the safety category + dominant-confidence are in
  /// the payload, never user text.
  static void emitRefusal({
    required Persona persona,
    required String locale,
    String? sessionId,
    required SafetyCategory category,
    required double confidence,
  }) {
    emit(
      name: LumiEvents.refused,
      persona: persona,
      locale: locale,
      sessionId: sessionId,
      props: {
        'category': category.id,
        'confidence': double.parse(confidence.toStringAsFixed(2)),
      },
    );
  }

  static void _dispatch(Map<String, dynamic> payload) {
    // TODO(W2.4 analytics backbone): swap for the real analytics
    // collector once the Segment / Amplitude / custom pipeline lands.
    // The payload shape here is intentionally identical to what the
    // collector will accept — see master spec §31 analytics taxonomy.
    assert(() {
      debugPrint('[LumiTelemetry] $payload');
      return true;
    }());
  }
}
