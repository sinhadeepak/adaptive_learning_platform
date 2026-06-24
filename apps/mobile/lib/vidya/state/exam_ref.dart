// ExamRef — one enrolled exam/track, joined from the user's profile
// (examId + targetDate) and the catalog (code + name). This is the unit
// the app-wide active-exam spine (VidyaActiveExamNotifier) cycles, so
// every exam-scoped screen reads the same shape rather than re-joining
// profile.exams ⨝ catalog itself.

import '../../api/api_client.dart';

class ExamRef {
  final String examId;
  final String code;
  final String name;
  final DateTime? targetDate;

  const ExamRef({
    required this.examId,
    required this.code,
    required this.name,
    this.targetDate,
  });

  /// Whole days from now until the exam (null when no target set; may be
  /// negative if the date has passed). Used by the switcher countdown.
  int? get daysToTarget {
    final t = targetDate;
    if (t == null) return null;
    final now = DateTime.now();
    return DateTime(t.year, t.month, t.day)
        .difference(DateTime(now.year, now.month, now.day))
        .inDays;
  }

  /// Join the user's enrolled exams (UserExam: examId + targetDate) with the
  /// catalog (Exam: code + name), dropping any enrolled exam the catalog
  /// doesn't know about. Order follows profile.exams (first = primary).
  static List<ExamRef> join(List<UserExam> enrolled, List<Exam> catalog) {
    final byId = {for (final e in catalog) e.id: e};
    return <ExamRef>[
      for (final ue in enrolled)
        if (byId[ue.examId] != null)
          ExamRef(
            examId: ue.examId,
            code: byId[ue.examId]!.code,
            name: byId[ue.examId]!.name,
            targetDate: ue.targetDate,
          ),
    ];
  }

  @override
  bool operator ==(Object other) =>
      other is ExamRef &&
      other.examId == examId &&
      other.code == code &&
      other.name == name &&
      other.targetDate == targetDate;

  @override
  int get hashCode => Object.hash(examId, code, name, targetDate);
}
