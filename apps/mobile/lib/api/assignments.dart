// Sprint 9 F-2 — mobile educator-assignments client + pure copy helpers.
//
// Mirrors apps/web-student/src/lib/assignments.ts so behaviour is consistent
// across surfaces. The pure helpers (`progressBucket`, `formatDueAt`) live
// here so tests don't need to pump widgets.

import 'dart:convert';

import '../auth/auth_client.dart';

class Assignment {
  Assignment({
    required this.id,
    required this.cohortId,
    required this.title,
    required this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
    this.tenantId,
    this.description,
    this.dueAt,
    this.myCompletedAt,
    this.myCorrectCount,
    this.myTotalCount,
  });

  final String id;
  final String cohortId;
  final String? tenantId;
  final String title;
  final String? description;
  final DateTime? dueAt;
  final DateTime? publishedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? myCompletedAt;
  final int? myCorrectCount;
  final int? myTotalCount;

  factory Assignment.fromJson(Map<String, dynamic> j) {
    DateTime? _dt(dynamic v) =>
        v == null ? null : DateTime.parse(v as String);
    return Assignment(
      id: j['id'] as String,
      cohortId: j['cohortId'] as String,
      tenantId: j['tenantId'] as String?,
      title: j['title'] as String,
      description: j['description'] as String?,
      dueAt: _dt(j['dueAt']),
      publishedAt: _dt(j['publishedAt']),
      createdAt: DateTime.parse(j['createdAt'] as String),
      updatedAt: DateTime.parse(j['updatedAt'] as String),
      myCompletedAt: _dt(j['myCompletedAt']),
      myCorrectCount: (j['myCorrectCount'] as num?)?.toInt(),
      myTotalCount: (j['myTotalCount'] as num?)?.toInt(),
    );
  }
}

class AssignmentQuestion {
  AssignmentQuestion({
    required this.questionId,
    required this.position,
    this.stem,
    this.choices,
  });

  final String questionId;
  final int position;
  final String? stem;
  // Sprint 10 S10-D — choices for inline answer buttons; correct_idx is
  // intentionally absent (server grades on POST /submit).
  final List<String>? choices;

  factory AssignmentQuestion.fromJson(Map<String, dynamic> j) {
    final c = j['choices'];
    return AssignmentQuestion(
      questionId: j['questionId'] as String,
      position: (j['position'] as num).toInt(),
      stem: j['stem'] as String?,
      choices: c is List ? c.map((e) => e.toString()).toList() : null,
    );
  }
}

class SubmitBreakdownEntry {
  SubmitBreakdownEntry({
    required this.questionId,
    required this.position,
    required this.studentAnswer,
    required this.correctAnswer,
    required this.isCorrect,
    this.stem,
    this.explanation,
  });
  final String questionId;
  final int position;
  final int? studentAnswer;
  final int correctAnswer;
  final bool isCorrect;
  // Sprint 11 S11-C — stem + explanation. Explanation is null on
  // correct answers (server policy) and null when the educator didn't
  // author one.
  final String? stem;
  final String? explanation;

  factory SubmitBreakdownEntry.fromJson(Map<String, dynamic> j) =>
      SubmitBreakdownEntry(
        questionId: j['questionId'] as String,
        position: (j['position'] as num).toInt(),
        studentAnswer: (j['studentAnswer'] as num?)?.toInt(),
        correctAnswer: (j['correctAnswer'] as num).toInt(),
        isCorrect: j['isCorrect'] as bool,
        stem: j['stem'] as String?,
        explanation: j['explanation'] as String?,
      );
}

class SubmitResult {
  SubmitResult({
    required this.correctCount,
    required this.totalCount,
    required this.breakdown,
  });
  final int correctCount;
  final int totalCount;
  final List<SubmitBreakdownEntry> breakdown;

  factory SubmitResult.fromJson(Map<String, dynamic> j) => SubmitResult(
        correctCount: (j['correctCount'] as num).toInt(),
        totalCount: (j['totalCount'] as num).toInt(),
        breakdown: (j['breakdown'] as List<dynamic>)
            .map((e) =>
                SubmitBreakdownEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class AssignmentsClient {
  AssignmentsClient(this.auth);
  final AuthClient auth;

  Future<List<Assignment>> mine() async {
    final r = await auth.apiGet('/content/assignments?mine=true');
    if (r.statusCode != 200) {
      throw Exception('Failed to load assignments (${r.statusCode})');
    }
    final list = jsonDecode(r.body) as List<dynamic>;
    return list
        .map((j) => Assignment.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Assignment> get(String id) async {
    final r = await auth.apiGet('/content/assignments/$id');
    if (r.statusCode != 200) {
      throw Exception('Failed to load assignment (${r.statusCode})');
    }
    return Assignment.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<List<AssignmentQuestion>> questions(String id) async {
    final r = await auth.apiGet('/content/assignments/$id/questions');
    if (r.statusCode != 200) {
      throw Exception('Failed to load questions (${r.statusCode})');
    }
    final list = jsonDecode(r.body) as List<dynamic>;
    return list
        .map((j) => AssignmentQuestion.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> recordProgress(
    String id, {
    required int correctCount,
    required int totalCount,
  }) async {
    final r = await auth.apiPost('/content/assignments/$id/progress', {
      'correctCount': correctCount,
      'totalCount': totalCount,
    });
    if (r.statusCode != 200) {
      throw Exception('Failed to record progress (${r.statusCode})');
    }
  }

  /// Sprint 10 S10-D — server-graded submission. Replaces the manual
  /// type-the-score flow from Sprint 9.
  Future<SubmitResult> submit(
    String id, {
    required Map<String, int> answers,
  }) async {
    final r = await auth.apiPost('/content/assignments/$id/submit', {
      'answers': answers,
    });
    if (r.statusCode != 200) {
      throw Exception('Submit failed (${r.statusCode})');
    }
    return SubmitResult.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  /// Sprint 12 S12-D — start an ASSIGNMENT-mode Quiz session pinned to
  /// the educator's question list. Returns the sessionId; caller pushes
  /// the QuizScreen with that id. On submit, Quiz publishes
  /// quiz.session.completed and Content's subscriber mirrors the score
  /// into assignment_progress.
  Future<QuizFromAssignment> startAsQuiz(
    String assignmentId, {
    required String userId,
  }) async {
    final r = await auth.apiPost('/quiz/sessions/from-assignment', {
      'assignmentId': assignmentId,
      'userId': userId,
    });
    if (r.statusCode != 201) {
      throw Exception('Could not start quiz (${r.statusCode})');
    }
    return QuizFromAssignment.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }
}

class QuizFromAssignment {
  QuizFromAssignment({
    required this.sessionId,
    required this.assignmentId,
    required this.itemCount,
  });
  final String sessionId;
  final String assignmentId;
  final int itemCount;

  factory QuizFromAssignment.fromJson(Map<String, dynamic> j) =>
      QuizFromAssignment(
        sessionId: j['sessionId'] as String,
        assignmentId: j['assignmentId'] as String,
        itemCount: (j['itemCount'] as num).toInt(),
      );
}

enum ProgressBucket { completed, overdue, dueSoon, open }

ProgressBucket progressBucket(Assignment a, [DateTime? now]) {
  final n = now ?? DateTime.now();
  if (a.myCompletedAt != null) return ProgressBucket.completed;
  if (a.dueAt == null) return ProgressBucket.open;
  if (a.dueAt!.isBefore(n)) return ProgressBucket.overdue;
  if (a.dueAt!.difference(n).inHours < 24) return ProgressBucket.dueSoon;
  return ProgressBucket.open;
}

/// Human-readable due-date copy. Returns "" when there's no due date.
/// Mirrors the web `formatDueAt()` so the two surfaces stay consistent.
String formatDueAt(Assignment a, [DateTime? now]) {
  if (a.dueAt == null) return '';
  final n = now ?? DateTime.now();
  final due = a.dueAt!;
  final diff = due.difference(n);
  if (a.myCompletedAt != null) {
    final y = due.year.toString().padLeft(4, '0');
    final m = due.month.toString().padLeft(2, '0');
    final d = due.day.toString().padLeft(2, '0');
    return 'Due $y-$m-$d';
  }
  if (diff.isNegative) {
    final days = (-diff.inHours / 24).ceil();
    return days == 1 ? 'Overdue (yesterday)' : 'Overdue (${days}d ago)';
  }
  if (diff.inHours < 24) return 'Due today';
  if (diff.inHours < 48) return 'Due tomorrow';
  final days = (diff.inHours / 24).ceil();
  return 'Due in ${days}d';
}
