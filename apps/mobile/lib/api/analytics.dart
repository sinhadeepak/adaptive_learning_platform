// Sprint A2 — student analytics surfacing.
//
// Mobile already calls /analytics/{readiness,streak,mastery,daily-activity}
// from api_client.dart. This file adds the seven student-scoped surfaces
// the mobile app didn't yet read despite the backend exposing them:
//
//   • concept-mastery        — per-concept EWA list (weakest first)
//   • error-patterns         — classified mistake patterns + top topics
//   • peer-percentile        — anonymized cohort comparison
//   • revision               — SM-2 due-today queue
//   • multi-profile          — 9-dim assessment radar substrate
//   • insights snapshot      — composite "My state / What this means / What to do"
//   • time-stats             — per-section time + accuracy aggregates
//
// Models are intentionally lean — we parse only the fields the UI
// actually renders. Backend may add fields without breaking the
// client.

import 'dart:convert';

import '../auth/auth_client.dart';

// ─── Concept mastery ────────────────────────────────────────────────

class ConceptMastery {
  ConceptMastery({
    required this.conceptId,
    required this.ewa,
    required this.n,
    this.lastSeenAt,
  });
  final String conceptId;
  final double ewa;
  final int n;
  final DateTime? lastSeenAt;

  factory ConceptMastery.fromJson(Map<String, dynamic> j) => ConceptMastery(
        conceptId: (j['conceptId'] ?? '') as String,
        ewa: ((j['ewa'] ?? 0) as num).toDouble(),
        n: ((j['n'] ?? 0) as num).toInt(),
        lastSeenAt: j['lastSeenAt'] != null
            ? DateTime.tryParse(j['lastSeenAt'] as String)
            : null,
      );
}

// ─── Error patterns ─────────────────────────────────────────────────

class ErrorPatternTopic {
  ErrorPatternTopic({
    required this.topicId,
    required this.topicTitle,
    required this.count,
  });
  final String topicId;
  final String topicTitle;
  final int count;

  factory ErrorPatternTopic.fromJson(Map<String, dynamic> j) =>
      ErrorPatternTopic(
        topicId: (j['topicId'] ?? '') as String,
        topicTitle: (j['topicTitle'] ?? '') as String,
        count: ((j['count'] ?? 0) as num).toInt(),
      );
}

class ErrorPattern {
  ErrorPattern({
    required this.classification,
    required this.count,
    required this.topTopics,
  });
  final String classification;
  final int count;
  final List<ErrorPatternTopic> topTopics;

  factory ErrorPattern.fromJson(Map<String, dynamic> j) => ErrorPattern(
        classification: (j['classification'] ?? '') as String,
        count: ((j['count'] ?? 0) as num).toInt(),
        topTopics: ((j['topTopics'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ErrorPatternTopic.fromJson)
            .toList(),
      );
}

class ErrorPatternsRollup {
  ErrorPatternsRollup({required this.totals, required this.topPatterns});
  final Map<String, int> totals;
  final List<ErrorPattern> topPatterns;

  factory ErrorPatternsRollup.fromJson(Map<String, dynamic> j) {
    final raw = (j['totals'] as Map?) ?? const {};
    final totals = <String, int>{};
    raw.forEach((k, v) {
      totals[k.toString()] = ((v ?? 0) as num).toInt();
    });
    return ErrorPatternsRollup(
      totals: totals,
      topPatterns: ((j['topPatterns'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(ErrorPattern.fromJson)
          .toList(),
    );
  }
}

// ─── Peer percentile ────────────────────────────────────────────────

class PeerPercentile {
  PeerPercentile({
    required this.hidden,
    required this.cohortSize,
    this.percentile,
    this.userEwa,
    this.reason,
  });
  final bool hidden;
  final int cohortSize;
  final double? percentile;
  final double? userEwa;
  final String? reason;

  factory PeerPercentile.fromJson(Map<String, dynamic> j) => PeerPercentile(
        hidden: (j['hidden'] ?? false) as bool,
        cohortSize: ((j['cohortSize'] ?? 0) as num).toInt(),
        percentile: (j['percentile'] as num?)?.toDouble(),
        userEwa: (j['userEwa'] as num?)?.toDouble(),
        reason: j['reason'] as String?,
      );
}

// ─── Revision queue ─────────────────────────────────────────────────

class RevisionItem {
  RevisionItem({
    required this.topicId,
    required this.topicTitle,
    required this.overdueDays,
    this.dueAt,
    this.intervalDays,
    this.attemptCount,
  });
  final String topicId;
  final String topicTitle;
  final int overdueDays;
  final DateTime? dueAt;
  final int? intervalDays;
  final int? attemptCount;

  factory RevisionItem.fromJson(Map<String, dynamic> j) => RevisionItem(
        topicId: (j['topicId'] ?? '') as String,
        topicTitle: (j['topicTitle'] ?? '') as String,
        overdueDays: ((j['overdueDays'] ?? 0) as num).toInt(),
        dueAt: j['dueAt'] != null
            ? DateTime.tryParse(j['dueAt'] as String)
            : null,
        intervalDays: (j['intervalDays'] as num?)?.toInt(),
        attemptCount: (j['attemptCount'] as num?)?.toInt(),
      );
}

// ─── Multi-profile (9-dim radar) ────────────────────────────────────

class FluencyRow {
  FluencyRow({required this.dimension, required this.score, required this.n});
  final String dimension;
  final double score;
  final int n;

  factory FluencyRow.fromJson(Map<String, dynamic> j) => FluencyRow(
        dimension: (j['dimension'] ?? j['conceptId'] ?? '') as String,
        score: ((j['score'] ?? j['ewa'] ?? 0) as num).toDouble(),
        n: ((j['n'] ?? 0) as num).toInt(),
      );
}

class MultiProfile {
  MultiProfile({
    required this.concepts,
    required this.fluency,
    this.confidenceBrier,
  });
  final List<ConceptMastery> concepts;
  final List<FluencyRow> fluency;
  final double? confidenceBrier;

  factory MultiProfile.fromJson(Map<String, dynamic> j) => MultiProfile(
        concepts: ((j['concepts'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(ConceptMastery.fromJson)
            .toList(),
        fluency: ((j['fluency'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(FluencyRow.fromJson)
            .toList(),
        confidenceBrier: (j['confidenceBrier'] as num?)?.toDouble(),
      );
}

// ─── Insights snapshot ──────────────────────────────────────────────

// The insights endpoint is verbose (3 pillars × N items each). We
// parse only the headline fields each pillar exposes; the UI shows
// up to 3 bullets per pillar.

class InsightsSnapshot {
  InsightsSnapshot({
    required this.myState,
    required this.whatThisMeans,
    required this.whatToDo,
  });
  // Each pillar is a list of one-line strings the UI renders as
  // bullets. The backend ships richer structured rows; we collapse to
  // text snippets so the mobile card stays calm.
  final List<String> myState;
  final List<String> whatThisMeans;
  final List<String> whatToDo;

  factory InsightsSnapshot.fromJson(Map<String, dynamic> j) {
    final ms = j['my_state'] as Map<String, dynamic>?;
    final wtm = j['what_this_means'] as Map<String, dynamic>?;
    final wtd = j['what_to_do'] as Map<String, dynamic>?;
    return InsightsSnapshot(
      myState: _flattenSnippets(ms),
      whatThisMeans: _flattenSnippets(wtm),
      whatToDo: _flattenSnippets(wtd),
    );
  }

  // Crawl the (potentially nested) pillar map and pull out short
  // human-readable strings. Backend structure varies sub-field by
  // sub-field — this stays defensive so a schema tweak doesn't
  // break the mobile card.
  static List<String> _flattenSnippets(Map<String, dynamic>? m) {
    if (m == null) return const [];
    final out = <String>[];
    void visit(dynamic v) {
      if (v is String) {
        final s = v.trim();
        if (s.isNotEmpty && s.length < 200) out.add(s);
      } else if (v is List) {
        for (final el in v) {
          visit(el);
        }
      } else if (v is Map) {
        // Common one-liner field names across all pillars.
        for (final key in const [
          'summary',
          'message',
          'headline',
          'label',
          'title',
          'caption',
          'recommendation',
        ]) {
          if (v[key] is String) {
            final s = (v[key] as String).trim();
            if (s.isNotEmpty && s.length < 200) {
              out.add(s);
            }
          }
        }
      }
    }
    m.values.forEach(visit);
    // De-duplicate while preserving order.
    final seen = <String>{};
    return out.where((s) => seen.add(s)).take(3).toList();
  }
}

// ─── Time-stats (per-section accuracy + minutes) ────────────────────

class TimeStatRow {
  TimeStatRow({
    required this.sectionId,
    required this.servedCount,
    required this.correctCount,
    required this.totalTimeMs,
    required this.accuracy,
  });
  final String sectionId;
  final int servedCount;
  final int correctCount;
  final int totalTimeMs;
  final double accuracy;

  factory TimeStatRow.fromJson(Map<String, dynamic> j) => TimeStatRow(
        sectionId: (j['sectionId'] ?? '') as String,
        servedCount: ((j['servedCount'] ?? 0) as num).toInt(),
        correctCount: ((j['correctCount'] ?? 0) as num).toInt(),
        totalTimeMs: ((j['totalTimeMs'] ?? 0) as num).toInt(),
        accuracy: ((j['accuracy'] ?? 0) as num).toDouble(),
      );
}

// ─── Client ─────────────────────────────────────────────────────────

class AnalyticsClient {
  AnalyticsClient(this.auth);
  final AuthClient auth;

  Future<List<ConceptMastery>> conceptMastery(String userId) async {
    final r = await auth.apiGet('/analytics/concept-mastery/$userId');
    if (r.statusCode != 200) return const [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return ((j['concepts'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ConceptMastery.fromJson)
        .toList();
  }

  Future<ErrorPatternsRollup?> errorPatterns(String userId) async {
    final r = await auth.apiGet('/analytics/student/$userId/error-patterns');
    if (r.statusCode != 200) return null;
    return ErrorPatternsRollup.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<PeerPercentile?> peerPercentile({
    required String userId,
    required String examId,
    required String topicId,
  }) async {
    final r = await auth.apiGet(
      '/analytics/peer-percentile/$userId?examId=$examId&topicId=$topicId',
    );
    if (r.statusCode != 200) return null;
    return PeerPercentile.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<List<RevisionItem>> revisionDue(String userId,
      {int limit = 10}) async {
    final r = await auth.apiGet('/analytics/revision/$userId?limit=$limit');
    if (r.statusCode != 200) return const [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return ((j['items'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(RevisionItem.fromJson)
        .toList();
  }

  Future<MultiProfile?> multiProfile(String userId) async {
    final r = await auth.apiGet('/analytics/student/$userId/multi-profile');
    if (r.statusCode != 200) return null;
    return MultiProfile.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<InsightsSnapshot?> insightsSnapshot(String userId) async {
    final r = await auth.apiGet('/analytics/insights/$userId/snapshot');
    if (r.statusCode != 200) return null;
    return InsightsSnapshot.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<List<TimeStatRow>> timeStats(String userId) async {
    final r = await auth.apiGet('/analytics/student/$userId/time-stats');
    if (r.statusCode != 200) return const [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return ((j['sections'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(TimeStatRow.fromJson)
        .toList();
  }

  // Sprint A7 — student opts in to share their real-exam outcome.
  // Drives the platform-admin outcome correlation chart. All fields
  // optional except examCode; the UI dialog only collects what the
  // student is comfortable sharing. Returns true on success.
  Future<bool> reportRealExamOutcome({
    required String userId,
    required String examCode,
    double? realScore,
    int? realRank,
    String? admittedTo,
  }) async {
    final r = await auth.apiPost(
      '/analytics/real-exam-outcomes/$userId',
      {
        'exam_code': examCode,
        if (realScore != null) 'real_score': realScore,
        if (realRank != null) 'real_rank': realRank,
        if (admittedTo != null && admittedTo.trim().isNotEmpty)
          'admitted_to': admittedTo.trim(),
      },
    );
    return r.statusCode >= 200 && r.statusCode < 300;
  }

  /// Syllabus coverage matrix for an exam — per-subject / per-chapter
  /// attempted + mastered counts and a coverage status. Mirrors web's
  /// `/api/v1/analytics/syllabus-coverage/{userId}?examId=`.
  Future<SyllabusCoverage?> syllabusCoverage(
    String userId, {
    required String examId,
  }) async {
    final r = await auth.apiGet(
      '/analytics/syllabus-coverage/$userId?examId=$examId',
    );
    if (r.statusCode != 200) return null;
    return SyllabusCoverage.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }
}

// ─── Syllabus coverage ──────────────────────────────────────────────

class SyllabusCoverage {
  SyllabusCoverage({
    required this.examId,
    required this.overallPct,
    required this.totalTopics,
    required this.masteredTopics,
    required this.subjects,
  });
  final String examId;
  final int overallPct;
  final int totalTopics;
  final int masteredTopics;
  final List<CoverageSubject> subjects;

  factory SyllabusCoverage.fromJson(Map<String, dynamic> j) => SyllabusCoverage(
        examId: (j['examId'] ?? '') as String,
        overallPct: ((j['overallPct'] ?? 0) as num).toInt(),
        totalTopics: ((j['totalTopics'] ?? 0) as num).toInt(),
        masteredTopics: ((j['masteredTopics'] ?? 0) as num).toInt(),
        subjects: ((j['subjects'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(CoverageSubject.fromJson)
            .toList(),
      );
}

class CoverageSubject {
  CoverageSubject({
    required this.subjectId,
    required this.name,
    required this.totalChapters,
    required this.coveredChapters,
    required this.totalTopics,
    required this.attemptedTopics,
    required this.masteredTopics,
    required this.chapters,
  });
  final String subjectId;
  final String name;
  final int totalChapters;
  final int coveredChapters;
  final int totalTopics;
  final int attemptedTopics;
  final int masteredTopics;
  final List<CoverageChapter> chapters;

  factory CoverageSubject.fromJson(Map<String, dynamic> j) => CoverageSubject(
        subjectId: (j['subjectId'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        totalChapters: ((j['totalChapters'] ?? 0) as num).toInt(),
        coveredChapters: ((j['coveredChapters'] ?? 0) as num).toInt(),
        totalTopics: ((j['totalTopics'] ?? 0) as num).toInt(),
        attemptedTopics: ((j['attemptedTopics'] ?? 0) as num).toInt(),
        masteredTopics: ((j['masteredTopics'] ?? 0) as num).toInt(),
        chapters: ((j['chapters'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(CoverageChapter.fromJson)
            .toList(),
      );
}

class CoverageChapter {
  CoverageChapter({
    required this.chapterId,
    required this.name,
    required this.totalTopics,
    required this.attemptedTopics,
    required this.masteredTopics,
    required this.avgEwa,
    required this.status,
  });
  final String chapterId;
  final String name;
  final int totalTopics;
  final int attemptedTopics;
  final int masteredTopics;
  final double avgEwa;
  // 'mastered' | 'developing' | 'not_started' | 'missing'
  final String status;

  factory CoverageChapter.fromJson(Map<String, dynamic> j) => CoverageChapter(
        chapterId: (j['chapterId'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        totalTopics: ((j['totalTopics'] ?? 0) as num).toInt(),
        attemptedTopics: ((j['attemptedTopics'] ?? 0) as num).toInt(),
        masteredTopics: ((j['masteredTopics'] ?? 0) as num).toInt(),
        avgEwa: ((j['avgEwa'] ?? 0) as num).toDouble(),
        status: (j['status'] ?? 'not_started') as String,
      );
}
