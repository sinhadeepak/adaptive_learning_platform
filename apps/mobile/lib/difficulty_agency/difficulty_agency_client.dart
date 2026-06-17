// Difficulty Agency client (Phase 6 S54 mobile parity).
//
// Mirrors apps/web-student/src/lib/difficulty-agency.ts. Backed by:
//   POST /adaptive/friction/check
//   POST /adaptive/intent/theta-offset
//
// Quiz Go's /quiz/sessions/start now accepts the intentAnchor field
// (wired in the S54-followup commit). Mobile uses the same pre-quiz
// IntentSelector to set it.

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/auth_client.dart';

enum IntentAnchor { match, push, buildConfidence }

String intentAnchorWireValue(IntentAnchor a) => switch (a) {
      IntentAnchor.match => 'match',
      IntentAnchor.push => 'push',
      IntentAnchor.buildConfidence => 'build_confidence',
    };

IntentAnchor intentAnchorFromWire(String s) => switch (s) {
      'push' => IntentAnchor.push,
      'build_confidence' => IntentAnchor.buildConfidence,
      _ => IntentAnchor.match,
    };

const intentLabels = <IntentAnchor, String>{
  IntentAnchor.match: 'Match my level',
  IntentAnchor.push: 'Push me',
  IntentAnchor.buildConfidence: 'Build confidence',
};

const intentGlyphs = <IntentAnchor, String>{
  IntentAnchor.match: '=',
  IntentAnchor.push: '↑',
  IntentAnchor.buildConfidence: '↓',
};

const intentDescriptions = <IntentAnchor, String>{
  IntentAnchor.match:
      'The default. The engine picks items at your current ability — accuracy lands around 60-70%.',
  IntentAnchor.push:
      'Aim above your level. The engine biases items upward by ~0.4 θ̂.',
  IntentAnchor.buildConfidence:
      'Aim below your level. The engine biases items downward by ~0.4 θ̂.',
};

// ─── Friction check ─────────────────────────────────────────────────

enum FrictionReason {
  repeatedWrong,
  fastCorrect,
  longHesitation,
  repeatedSkip,
}

FrictionReason _reasonFrom(String s) => switch (s) {
      'repeated_wrong' => FrictionReason.repeatedWrong,
      'fast_correct' => FrictionReason.fastCorrect,
      'long_hesitation' => FrictionReason.longHesitation,
      'repeated_skip' => FrictionReason.repeatedSkip,
      _ => FrictionReason.repeatedWrong,
    };

String frictionReasonLabel(FrictionReason r) => switch (r) {
      FrictionReason.repeatedWrong => 'Three wrong in a row',
      FrictionReason.fastCorrect => 'Cruising through',
      FrictionReason.longHesitation => 'Long hesitation',
      FrictionReason.repeatedSkip => 'Two skips in a row',
    };

enum FrictionAction { easier, harder, same }

FrictionAction _actionFrom(String s) => switch (s) {
      'easier' => FrictionAction.easier,
      'harder' => FrictionAction.harder,
      _ => FrictionAction.same,
    };

class FrictionItemAttempt {
  const FrictionItemAttempt({
    required this.itemIdx,
    this.isCorrect,
    this.timeSpentMs,
    this.skipped = false,
  });

  final int itemIdx;
  final bool? isCorrect;
  final int? timeSpentMs;
  final bool skipped;

  Map<String, dynamic> toJson() => {
        'item_idx': itemIdx,
        'is_correct': isCorrect,
        'time_spent_ms': timeSpentMs,
        'skipped': skipped,
      };
}

class FrictionTrigger {
  const FrictionTrigger({
    required this.reason,
    required this.suggestedOffset,
    required this.suggestedAction,
    required this.message,
  });

  factory FrictionTrigger.fromJson(Map<String, dynamic> j) =>
      FrictionTrigger(
        reason: _reasonFrom(j['reason'] as String),
        suggestedOffset: (j['suggested_offset'] as num).toDouble(),
        suggestedAction: _actionFrom(j['suggested_action'] as String),
        message: j['message'] as String,
      );

  final FrictionReason reason;
  final double suggestedOffset;
  final FrictionAction suggestedAction;
  final String message;
}

class IntentOffset {
  const IntentOffset({
    required this.intentAnchor,
    required this.offset,
    required this.effectiveTheta,
  });

  factory IntentOffset.fromJson(Map<String, dynamic> j) => IntentOffset(
        intentAnchor:
            intentAnchorFromWire(j['intent_anchor'] as String),
        offset: (j['offset'] as num).toDouble(),
        effectiveTheta: (j['effective_theta'] as num).toDouble(),
      );

  final IntentAnchor intentAnchor;
  final double offset;
  final double effectiveTheta;
}

class DifficultyAgencyClient {
  DifficultyAgencyClient({required this.auth});

  final AuthClient auth;

  Future<FrictionTrigger?> checkFriction(
    List<FrictionItemAttempt> history,
    int? lastFrictionAtIdx,
  ) async {
    final body = {
      'history': history.map((e) => e.toJson()).toList(),
      'last_friction_at_idx': lastFrictionAtIdx,
    };
    final r = await auth.apiPost('/adaptive/friction/check', body);
    if (r.statusCode != 200) {
      throw Exception('friction check failed: HTTP ${r.statusCode}');
    }
    final raw = jsonDecode(r.body) as Map<String, dynamic>;
    final trig = raw['trigger'];
    if (trig == null) return null;
    return FrictionTrigger.fromJson(trig as Map<String, dynamic>);
  }

  Future<IntentOffset> previewIntentOffset(
    IntentAnchor anchor, {
    double thetaHat = 0,
  }) async {
    final r = await auth.apiPost('/adaptive/intent/theta-offset', {
      'intent_anchor': intentAnchorWireValue(anchor),
      'theta_hat': thetaHat,
    });
    if (r.statusCode != 200) {
      throw Exception('intent offset failed: HTTP ${r.statusCode}');
    }
    return IntentOffset.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>,);
  }
}

// ─── localStorage helpers (FlutterSecureStorage) ────────────────────

const _intentKeyPrefix = 'quiz.intent.v1.';
const _adaptsSeenKey = 'quiz.adapt_explainer.seen.v1';

Future<IntentAnchor?> loadIntentForTopic(
  String topicId, {
  FlutterSecureStorage? storage,
}) async {
  final s = storage ?? const FlutterSecureStorage();
  final raw = await s.read(key: '$_intentKeyPrefix$topicId');
  if (raw == null) return null;
  switch (raw) {
    case 'match':
      return IntentAnchor.match;
    case 'push':
      return IntentAnchor.push;
    case 'build_confidence':
      return IntentAnchor.buildConfidence;
  }
  return null;
}

Future<void> saveIntentForTopic(
  String topicId,
  IntentAnchor anchor, {
  FlutterSecureStorage? storage,
}) async {
  final s = storage ?? const FlutterSecureStorage();
  await s.write(
      key: '$_intentKeyPrefix$topicId',
      value: intentAnchorWireValue(anchor),);
}

Future<bool> hasSeenAdaptsExplainer({
  FlutterSecureStorage? storage,
}) async {
  final s = storage ?? const FlutterSecureStorage();
  return (await s.read(key: _adaptsSeenKey)) == '1';
}

Future<void> markAdaptsExplainerSeen({
  FlutterSecureStorage? storage,
}) async {
  final s = storage ?? const FlutterSecureStorage();
  await s.write(key: _adaptsSeenKey, value: '1');
}

// ─── Calibration PATCH ──────────────────────────────────────────────

enum CalibrationFeedback { tooEasy, right, tooHard }

String calibrationWireValue(CalibrationFeedback f) => switch (f) {
      CalibrationFeedback.tooEasy => 'too_easy',
      CalibrationFeedback.right => 'right',
      CalibrationFeedback.tooHard => 'too_hard',
    };

extension CalibrationPatch on DifficultyAgencyClient {
  Future<void> patchCalibration(
    String sessionId,
    CalibrationFeedback feedback,
  ) async {
    final r = await auth.apiPatch(
      '/quiz/sessions/$sessionId/calibration',
      {'feedback': calibrationWireValue(feedback)},
    );
    if (r.statusCode != 200) {
      throw Exception('calibration PATCH failed: HTTP ${r.statusCode}');
    }
  }
}
