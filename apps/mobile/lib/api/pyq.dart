// PYQ (Previous-Year-Questions) client — mirrors web PYQDrill.tsx.
// Routes go through the learning service via the gateway's /content
// proxy:
//   GET /content/pyqs/frequency?examId=&subjectId=   → chapter frequency
//   GET /content/pyqs?topicId=&year=&perPage=         → questions
//
// PYQ is a read-only drill on web (browse + reveal answer); there is no
// PYQ quiz-session mode server-side, so the mobile screen mirrors that.

import 'dart:convert';

import '../auth/auth_client.dart';

class PyqClient {
  PyqClient(this.auth);
  final AuthClient auth;

  /// Per-chapter PYQ frequency for an exam (optionally one subject),
  /// ordered by total appearances descending.
  Future<PyqFrequency?> frequency({
    required String examId,
    String? subjectId,
  }) async {
    final q = StringBuffer('/content/pyqs/frequency?examId=$examId');
    if (subjectId != null && subjectId.isNotEmpty) {
      q.write('&subjectId=$subjectId');
    }
    final r = await auth.apiGet(q.toString());
    if (r.statusCode != 200) return null;
    return PyqFrequency.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  /// PYQ questions for a topic, optionally filtered by year.
  Future<PyqList> list(
    String topicId, {
    int? year,
    int perPage = 50,
  }) async {
    final q = StringBuffer('/content/pyqs?topicId=$topicId&perPage=$perPage');
    if (year != null) q.write('&year=$year');
    final r = await auth.apiGet(q.toString());
    if (r.statusCode != 200) {
      return const PyqList(items: [], total: 0, page: 1, perPage: 50);
    }
    return PyqList.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }
}

class PyqChapterFreq {
  PyqChapterFreq({
    required this.topicId,
    required this.topicTitle,
    required this.yearCounts,
    required this.total,
  });
  final String topicId;
  final String topicTitle;
  // year → count. JSON object keys arrive as strings; parsed to int.
  final Map<int, int> yearCounts;
  final int total;

  factory PyqChapterFreq.fromJson(Map<String, dynamic> j) {
    final raw = (j['yearCounts'] as Map?) ?? const {};
    final counts = <int, int>{};
    raw.forEach((k, v) {
      final year = int.tryParse(k.toString());
      if (year != null) counts[year] = (v as num).toInt();
    });
    return PyqChapterFreq(
      topicId: (j['topicId'] ?? '') as String,
      topicTitle: (j['topicTitle'] ?? '') as String,
      yearCounts: counts,
      total: ((j['total'] ?? 0) as num).toInt(),
    );
  }

  /// Years present, newest first.
  List<int> get years => yearCounts.keys.toList()..sort((a, b) => b - a);
}

class PyqFrequency {
  PyqFrequency({
    required this.examId,
    required this.subjectId,
    required this.chapters,
  });
  final String examId;
  final String? subjectId;
  final List<PyqChapterFreq> chapters;

  factory PyqFrequency.fromJson(Map<String, dynamic> j) => PyqFrequency(
        examId: (j['examId'] ?? '') as String,
        subjectId: j['subjectId'] as String?,
        chapters: ((j['chapters'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(PyqChapterFreq.fromJson)
            .toList(),
      );
}

class PyqQuestion {
  PyqQuestion({
    required this.id,
    required this.topicId,
    required this.stem,
    required this.choices,
    required this.correctIdx,
    this.examYear,
    this.paperSession,
    this.language = 'en',
  });
  final String id;
  final String topicId;
  final String stem;
  final List<String> choices;
  final int correctIdx;
  final int? examYear;
  final String? paperSession;
  final String language;

  factory PyqQuestion.fromJson(Map<String, dynamic> j) => PyqQuestion(
        id: (j['id'] ?? '') as String,
        topicId: (j['topicId'] ?? '') as String,
        stem: (j['stem'] ?? '') as String,
        choices: ((j['choices'] as List?) ?? const []).cast<String>(),
        correctIdx: ((j['correctIdx'] ?? -1) as num).toInt(),
        examYear: (j['examYear'] as num?)?.toInt(),
        paperSession: j['paperSession'] as String?,
        language: (j['language'] ?? 'en') as String,
      );
}

class PyqList {
  const PyqList({
    required this.items,
    required this.total,
    required this.page,
    required this.perPage,
  });
  final List<PyqQuestion> items;
  final int total;
  final int page;
  final int perPage;

  factory PyqList.fromJson(Map<String, dynamic> j) => PyqList(
        items: ((j['items'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(PyqQuestion.fromJson)
            .toList(),
        total: ((j['total'] ?? 0) as num).toInt(),
        page: ((j['page'] ?? 1) as num).toInt(),
        perPage: ((j['perPage'] ?? 50) as num).toInt(),
      );
}
