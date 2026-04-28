// Sprint 9 F-2 — mobile assignment helper tests.

import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/api/assignments.dart';

Assignment _a({
  String? dueAt,
  String? completedAt,
  int? correct,
  int? total,
}) {
  return Assignment.fromJson({
    'id': 'a-1',
    'cohortId': 'c-1',
    'tenantId': null,
    'title': 'Test',
    'description': 'Desc',
    'createdBy': 't-1',
    'dueAt': dueAt,
    'publishedAt': '2026-04-28T00:00:00Z',
    'createdAt': '2026-04-28T00:00:00Z',
    'updatedAt': '2026-04-28T00:00:00Z',
    'myCompletedAt': completedAt,
    'myCorrectCount': correct,
    'myTotalCount': total,
  });
}

void main() {
  group('progressBucket', () {
    test('completed when myCompletedAt set', () {
      final a = _a(
        dueAt: '2026-04-30T00:00:00Z',
        completedAt: '2026-04-29T00:00:00Z',
      );
      expect(progressBucket(a, DateTime.utc(2026, 5, 15)),
          ProgressBucket.completed);
    });

    test('overdue when dueAt is past and not completed', () {
      final a = _a(dueAt: '2026-04-15T00:00:00Z');
      expect(
          progressBucket(a, DateTime.utc(2026, 4, 28)), ProgressBucket.overdue);
    });

    test('dueSoon when within 24h', () {
      final a = _a(dueAt: '2026-04-29T05:00:00Z');
      expect(progressBucket(a, DateTime.utc(2026, 4, 28, 18)),
          ProgressBucket.dueSoon);
    });

    test('open when no due date', () {
      final a = _a();
      expect(progressBucket(a, DateTime.utc(2026, 4, 28)), ProgressBucket.open);
    });

    test('open when due > 24h away', () {
      final a = _a(dueAt: '2026-05-10T00:00:00Z');
      expect(progressBucket(a, DateTime.utc(2026, 4, 28)), ProgressBucket.open);
    });
  });

  group('formatDueAt', () {
    test('empty when no dueAt', () {
      expect(formatDueAt(_a(), DateTime.utc(2026, 4, 28)), '');
    });

    test('"Due today" when within 24h', () {
      final a = _a(dueAt: '2026-04-28T22:00:00Z');
      expect(formatDueAt(a, DateTime.utc(2026, 4, 28, 8)), 'Due today');
    });

    test('"Due tomorrow" when 24-48h away', () {
      final a = _a(dueAt: '2026-04-29T22:00:00Z');
      expect(formatDueAt(a, DateTime.utc(2026, 4, 28, 8)), 'Due tomorrow');
    });

    test('"Due in Nd" further out', () {
      final a = _a(dueAt: '2026-05-05T00:00:00Z');
      expect(formatDueAt(a, DateTime.utc(2026, 4, 28)), 'Due in 7d');
    });

    test('"Overdue (yesterday)" 1 day past', () {
      final a = _a(dueAt: '2026-04-27T08:00:00Z');
      expect(formatDueAt(a, DateTime.utc(2026, 4, 28, 8)),
          'Overdue (yesterday)');
    });

    test('"Overdue (Nd ago)" further past', () {
      final a = _a(dueAt: '2026-04-20T00:00:00Z');
      expect(formatDueAt(a, DateTime.utc(2026, 4, 28)), 'Overdue (8d ago)');
    });

    test('completed always uses "Due <date>" framing', () {
      final a = _a(
        dueAt: '2026-04-25T00:00:00Z',
        completedAt: '2026-04-26T10:00:00Z',
      );
      final got = formatDueAt(a, DateTime.utc(2026, 4, 28));
      expect(got, startsWith('Due '));
      expect(got.contains('Overdue'), isFalse);
    });
  });

  group('Assignment.fromJson', () {
    test('parses null optional fields', () {
      final a = _a();
      expect(a.dueAt, isNull);
      expect(a.myCompletedAt, isNull);
      expect(a.myCorrectCount, isNull);
    });

    test('parses populated optional fields', () {
      final a = _a(
        dueAt: '2026-05-01T00:00:00Z',
        completedAt: '2026-04-30T18:00:00Z',
        correct: 4,
        total: 5,
      );
      expect(a.dueAt, DateTime.utc(2026, 5, 1));
      expect(a.myCorrectCount, 4);
      expect(a.myTotalCount, 5);
    });
  });
}
