// Readiness + topic-decay client (Phase 6 S56 mobile parity).
//
// Mirrors apps/web-student/src/lib/readiness.ts. Backed by d4ec8d0:
//   GET /analytics/topic-decay/{user_id}
//   GET /analytics/readiness-band/{user_id}?target_score=&days_to_exam=

import 'dart:convert';

import '../auth/auth_client.dart';
import '../insights/insights_client.dart' show DecaySeverity, ReadinessBand;

class DecayedConcept {
  const DecayedConcept({
    required this.conceptId,
    required this.ewa,
    required this.n,
    required this.decayDays,
    required this.decaySeverity,
  });

  factory DecayedConcept.fromJson(Map<String, dynamic> j) =>
      DecayedConcept(
        conceptId: j['concept_id'] as String,
        ewa: (j['ewa'] as num).toDouble(),
        n: (j['n'] as num).toInt(),
        decayDays: (j['decay_days'] as num).toInt(),
        decaySeverity: _decayFrom(j['decay_severity'] as String),
      );

  final String conceptId;
  final double ewa;
  final int n;
  final int decayDays;
  final DecaySeverity decaySeverity;
}

class ReadinessBandResult {
  const ReadinessBandResult({
    required this.readinessScore,
    required this.targetScore,
    required this.daysToExam,
    required this.band,
    required this.actions,
  });

  factory ReadinessBandResult.fromJson(Map<String, dynamic> j) =>
      ReadinessBandResult(
        readinessScore: (j['readiness_score'] as num).toDouble(),
        targetScore: (j['target_score'] as num).toDouble(),
        daysToExam: (j['days_to_exam'] as num).toInt(),
        band: _bandFrom(j['band'] as String),
        actions: ((j['actions'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
      );

  final double readinessScore;
  final double targetScore;
  final int daysToExam;
  final ReadinessBand band;
  final List<String> actions;
}

class ReadinessClient {
  ReadinessClient({required this.auth});
  final AuthClient auth;

  Future<List<DecayedConcept>> fetchTopicDecay(String userId) async {
    final r = await auth.apiGet('/analytics/topic-decay/$userId');
    if (r.statusCode != 200) {
      throw Exception('topic decay fetch failed: HTTP ${r.statusCode}');
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    return ((body['items'] as List?) ?? const [])
        .map((e) => DecayedConcept.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ReadinessBandResult> fetchReadinessBand(
    String userId, {
    double? targetScore,
    int? daysToExam,
  }) async {
    final qs = <String>[];
    if (targetScore != null) qs.add('target_score=$targetScore');
    if (daysToExam != null) qs.add('days_to_exam=$daysToExam');
    final url = '/analytics/readiness-band/$userId'
        '${qs.isEmpty ? '' : '?${qs.join('&')}'}';
    final r = await auth.apiGet(url);
    if (r.statusCode != 200) {
      throw Exception('readiness band fetch failed: HTTP ${r.statusCode}');
    }
    return ReadinessBandResult.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>,);
  }
}

// ─── Display helpers ────────────────────────────────────────────────

DecaySeverity _decayFrom(String s) => switch (s) {
      'fresh' => DecaySeverity.fresh,
      'aging' => DecaySeverity.aging,
      'stale' => DecaySeverity.stale,
      'critical' => DecaySeverity.critical,
      _ => DecaySeverity.aging,
    };

ReadinessBand _bandFrom(String s) => switch (s) {
      'approaching' => ReadinessBand.approaching,
      'on_track' => ReadinessBand.onTrack,
      'behind' => ReadinessBand.behind,
      'at_risk' => ReadinessBand.atRisk,
      _ => ReadinessBand.onTrack,
    };

/// ↓ for fading, ↑ for fresh, — for steady.
String decayArrow(DecaySeverity s) => switch (s) {
      DecaySeverity.critical || DecaySeverity.stale => '↓',
      DecaySeverity.fresh => '↑',
      DecaySeverity.aging => '—',
    };

enum DecayTone { danger, warning, success, neutral }

DecayTone decayArrowTone(DecaySeverity s) => switch (s) {
      DecaySeverity.critical => DecayTone.danger,
      DecaySeverity.stale => DecayTone.warning,
      DecaySeverity.aging => DecayTone.neutral,
      DecaySeverity.fresh => DecayTone.success,
    };
