/// Tests for the streak-in-danger detection (S7) — the day-1-gap check
/// that drives the orange "Don't lose your N-day streak" banner on Home.
///
/// The function must be silent on three boundaries:
///   - already practiced today (gap == 0) — no banner, would be nag
///   - streak already broken (gap > 1) — no banner, fresh-start framing
///     happens via streak.broken inbox notification instead
///   - streak == 0 — no banner, nothing to lose
///
/// Only fires when the gap is exactly 1 day. A regression here either
/// silently nags students who already practiced or fails to remind those
/// at risk of losing their streak.

import 'package:flutter_test/flutter_test.dart';
import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/screens/home_tab.dart';

void main() {
  group('isStreakInDanger', () {
    test('returns false when lastActiveDate is null', () {
      final s = Streak(current: 5, longest: 7, lastActiveDate: null);
      expect(isStreakInDanger(s), isFalse);
    });

    test('returns false when student practiced today (gap = 0)', () {
      final today = DateTime.now();
      final iso = today.toIso8601String().substring(0, 10);
      final s = Streak(current: 5, longest: 7, lastActiveDate: iso);
      expect(isStreakInDanger(s), isFalse);
    });

    test('returns true when last active was yesterday (gap = 1)', () {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      final iso = yesterday.toIso8601String().substring(0, 10);
      final s = Streak(current: 5, longest: 7, lastActiveDate: iso);
      expect(isStreakInDanger(s), isTrue);
    });

    test('returns false when streak already broken (gap = 2)', () {
      final twoDaysAgo = DateTime.now().subtract(const Duration(days: 2));
      final iso = twoDaysAgo.toIso8601String().substring(0, 10);
      final s = Streak(current: 5, longest: 7, lastActiveDate: iso);
      expect(isStreakInDanger(s), isFalse);
    });

    test('returns false when streak already broken (gap = 7)', () {
      final aWeekAgo = DateTime.now().subtract(const Duration(days: 7));
      final iso = aWeekAgo.toIso8601String().substring(0, 10);
      final s = Streak(current: 5, longest: 7, lastActiveDate: iso);
      expect(isStreakInDanger(s), isFalse);
    });

    test('handles malformed date string gracefully', () {
      final s = Streak(current: 5, longest: 7, lastActiveDate: 'not-a-date');
      expect(isStreakInDanger(s), isFalse);
    });

    test('handles empty date string gracefully', () {
      final s = Streak(current: 5, longest: 7, lastActiveDate: '');
      expect(isStreakInDanger(s), isFalse);
    });

    test('full ISO timestamp (with time) parses correctly for yesterday', () {
      // analytics service returns lastActiveDate as YYYY-MM-DD but if a
      // future server change starts emitting full ISO timestamps the
      // function should still bucket by midnight-local-day.
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      final iso = '${yesterday.toIso8601String().substring(0, 10)}T14:30:00Z';
      final s = Streak(current: 5, longest: 7, lastActiveDate: iso);
      expect(isStreakInDanger(s), isTrue);
    });
  });
}
