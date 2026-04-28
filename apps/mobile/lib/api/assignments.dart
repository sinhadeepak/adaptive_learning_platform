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
