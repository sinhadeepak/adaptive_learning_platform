/// Tests for the inbox summary copy on mobile (S7) — the human-readable
/// row text the bell drops the student into.
///
/// Two failure modes the tests guard:
///  1. **Wrong type → wrong copy.** Each notification kind has bespoke
///     framing; falling through to the generic fallback would surface
///     raw type strings like "streak.milestone" to the student.
///  2. **Missing payload field → crash or "null".** Many payloads are
///     emitted by different services (analytics, doubts, adaptive-engine),
///     so the summary must degrade gracefully when a key is missing.

import 'package:flutter_test/flutter_test.dart';
import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/screens/inbox_screen.dart';

InboxItem _item(String type, Map<String, dynamic> payload, {String? readAt}) {
  return InboxItem(
    id: 'id-1',
    type: type,
    channel: 'inbox',
    payload: payload,
    createdAt: '2026-04-27T18:00:00Z',
    readAt: readAt,
  );
}

void main() {
  group('InboxItem.unread', () {
    test('readAt null → unread', () {
      final n = _item('quiz.completed', {}, readAt: null);
      expect(n.unread, isTrue);
    });

    test('readAt present → read', () {
      final n = _item('quiz.completed', {}, readAt: '2026-04-27T18:30:00Z');
      expect(n.unread, isFalse);
    });
  });

  group('inboxSummary', () {
    test('quiz.completed renders score percentage', () {
      final n = _item('quiz.completed', {'score': 0.8});
      expect(inboxSummary(n), contains('80% accuracy'));
    });

    test('quiz.completed without score still renders', () {
      final n = _item('quiz.completed', {});
      expect(inboxSummary(n), contains('Practice session'));
    });

    test('streak.milestone renders day count', () {
      final n = _item('streak.milestone', {'days': 7});
      expect(inboxSummary(n), contains('7-day streak'));
      expect(inboxSummary(n), contains('🔥'));
    });

    test('streak.broken renders previous streak with positive framing', () {
      final n = _item('streak.broken', {'previousStreak': 14});
      final s = inboxSummary(n);
      expect(s, contains('14-day'));
      expect(s, contains('back')); // "you're back" — re-engagement framing
      expect(s.toLowerCase(), contains('fresh'));
    });

    test('streak.broken without previous count still renders graceful copy', () {
      final n = _item('streak.broken', {});
      expect(inboxSummary(n), contains('Streak reset'));
    });

    test('goal.reached renders goal minutes', () {
      final n = _item('goal.reached', {'goalMinutes': 90});
      expect(inboxSummary(n), contains('90 minutes'));
      expect(inboxSummary(n), contains('✓'));
    });

    test('mock.completed renders exam name + accuracy + projected rank', () {
      final n = _item('mock.completed', {
        'examCode': 'NEET',
        'examName': 'NEET (UG) — Quick Mock',
        'scorePct': 65,
        'projectedRank': 12500,
      });
      final s = inboxSummary(n);
      expect(s, contains('NEET (UG)'));
      expect(s, contains('65% accuracy'));
      expect(s, contains('12500')); // projected AIR
    });

    test('mock.completed falls back to examCode when examName missing', () {
      final n = _item('mock.completed', {'examCode': 'JEE', 'scorePct': 50});
      expect(inboxSummary(n), contains('JEE'));
    });

    test('doubt.answered has stable copy', () {
      final n = _item('doubt.answered', {'doubtId': 'd-1'});
      expect(inboxSummary(n), contains('replied'));
    });

    test('achievement.unlocked decodes streak_<n> kind', () {
      final n = _item('achievement.unlocked', {'kind': 'streak_30', 'days': 30});
      final s = inboxSummary(n);
      expect(s, contains('30-day streak'));
      expect(s, contains('🏆'));
    });

    test('achievement.unlocked decodes first_session kind', () {
      final n = _item('achievement.unlocked', {'kind': 'first_session'});
      expect(inboxSummary(n), contains('First session'));
    });

    test('achievement.unlocked decodes mock_first kind', () {
      final n = _item('achievement.unlocked', {'kind': 'mock_first'});
      expect(inboxSummary(n), contains('First mock'));
    });

    test('achievement.unlocked unknown kind gracefully renders', () {
      final n = _item('achievement.unlocked', {'kind': 'made_up_badge'});
      final s = inboxSummary(n);
      expect(s, contains('Achievement'));
      // Underscores should be replaced with spaces for readability.
      expect(s, contains('made up badge'));
    });

    test('unknown type gracefully falls through (no crash, no "null")', () {
      final n = _item('foo.bar.baz', {});
      final s = inboxSummary(n);
      expect(s, isNot(contains('null')));
      expect(s, isNotEmpty);
    });
  });
}
