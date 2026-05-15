// Insights hub client (Phase 6 S52 mobile parity).
//
// Mirrors apps/web-student/src/lib/insights.ts. Backed by the
// alp-engagement aggregator from 9497394:
//   GET /analytics/insights/{user_id}/snapshot
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S52
// ADR:  docs/adr/0020-ux-copilot-scope-and-ia.md

import 'dart:convert';

import '../auth/auth_client.dart';

enum DecaySeverity { fresh, aging, stale, critical }

DecaySeverity _decayFrom(String s) {
  switch (s) {
    case 'fresh':
      return DecaySeverity.fresh;
    case 'aging':
      return DecaySeverity.aging;
    case 'stale':
      return DecaySeverity.stale;
    case 'critical':
      return DecaySeverity.critical;
    default:
      return DecaySeverity.aging;
  }
}

String decaySeverityLabel(DecaySeverity s) => switch (s) {
      DecaySeverity.fresh => 'Fresh',
      DecaySeverity.aging => 'Aging',
      DecaySeverity.stale => 'Stale',
      DecaySeverity.critical => 'Critical',
    };

enum ReadinessBand { approaching, onTrack, behind, atRisk }

ReadinessBand _bandFrom(String s) {
  switch (s) {
    case 'approaching':
      return ReadinessBand.approaching;
    case 'on_track':
      return ReadinessBand.onTrack;
    case 'behind':
      return ReadinessBand.behind;
    case 'at_risk':
      return ReadinessBand.atRisk;
    default:
      return ReadinessBand.onTrack;
  }
}

String readinessBandLabel(ReadinessBand b) => switch (b) {
      ReadinessBand.approaching => 'Approaching target',
      ReadinessBand.onTrack => 'On track',
      ReadinessBand.behind => 'Behind pace',
      ReadinessBand.atRisk => 'At risk',
    };

class ConceptRow {
  const ConceptRow({
    required this.conceptId,
    required this.ewa,
    required this.n,
    required this.decaySeverity,
    required this.decayDays,
  });

  factory ConceptRow.fromJson(Map<String, dynamic> j) => ConceptRow(
        conceptId: j['concept_id'] as String,
        ewa: (j['ewa'] as num).toDouble(),
        n: (j['n'] as num).toInt(),
        decaySeverity: _decayFrom(j['decay_severity'] as String),
        decayDays: (j['decay_days'] as num).toInt(),
      );

  final String conceptId;
  final double ewa;
  final int n;
  final DecaySeverity decaySeverity;
  final int decayDays;
}

class ReadinessSummary {
  const ReadinessSummary({required this.score, required this.band});

  factory ReadinessSummary.fromJson(Map<String, dynamic> j) =>
      ReadinessSummary(
        score: (j['score'] as num).toDouble(),
        band: _bandFrom(j['band'] as String),
      );

  final double score;
  final ReadinessBand band;
}

class InsightsSnapshot {
  const InsightsSnapshot({
    required this.userId,
    required this.conceptMastery,
    required this.topicDecay,
    required this.readiness,
    required this.weakConcepts,
    required this.decayAlerts,
    required this.missionsTodayPending,
    required this.revisionDueToday,
  });

  factory InsightsSnapshot.fromJson(Map<String, dynamic> j) {
    final myState = j['my_state'] as Map<String, dynamic>? ?? const {};
    final what = j['what_this_means'] as Map<String, dynamic>? ?? const {};
    final todo = j['what_to_do'] as Map<String, dynamic>? ?? const {};
    final readinessRaw =
        myState['readiness'] as Map<String, dynamic>?;
    return InsightsSnapshot(
      userId: j['user_id'] as String? ?? '',
      conceptMastery: ((myState['concept_mastery'] as List?) ?? const [])
          .map((e) => ConceptRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      topicDecay: ((myState['topic_decay'] as List?) ?? const [])
          .map((e) => ConceptRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      readiness: readinessRaw == null
          ? null
          : ReadinessSummary.fromJson(readinessRaw),
      weakConcepts: ((what['weak_concepts'] as List?) ?? const [])
          .map((e) => ConceptRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      decayAlerts: ((what['decay_alerts'] as List?) ?? const [])
          .map((e) => ConceptRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      missionsTodayPending:
          todo['missions_today_pending'] as bool? ?? false,
      revisionDueToday:
          ((todo['revision_due_today'] as num?) ?? 0).toInt(),
    );
  }

  final String userId;
  final List<ConceptRow> conceptMastery;
  final List<ConceptRow> topicDecay;
  final ReadinessSummary? readiness;
  final List<ConceptRow> weakConcepts;
  final List<ConceptRow> decayAlerts;
  final bool missionsTodayPending;
  final int revisionDueToday;
}

class InsightsClient {
  InsightsClient({required this.auth});

  final AuthClient auth;

  Future<InsightsSnapshot> fetchSnapshot(String userId) async {
    final r =
        await auth.apiGet('/analytics/insights/$userId/snapshot');
    if (r.statusCode != 200) {
      throw Exception(
          'insights snapshot failed: HTTP ${r.statusCode}',);
    }
    return InsightsSnapshot.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }
}
