/// Tests for `decodeBadge` (S7) — the pure-function decoder behind every
/// achievement chip on the Profile tab. The 21-kind catalog is too easy
/// to get wrong (typo on a streak threshold, wrong icon for a milestone)
/// to leave as untested string-mashing.

import 'package:flutter_test/flutter_test.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/screens/profile_tab.dart';

Achievement _ach(String kind, [Map<String, dynamic> payload = const {}]) {
  return Achievement(
    id: 'a-${kind.hashCode}',
    kind: kind,
    payload: payload,
    awardedAt: '2026-04-27T10:00:00Z',
  );
}

void main() {
  group('decodeBadge — one-shot kinds', () {
    test('first_session', () {
      final m = decodeBadge(_ach('first_session'));
      expect(m.icon, '🎯');
      expect(m.label, 'First session');
      expect(m.tone, AlpColors.colorBlue);
    });

    test('daily_goal_first', () {
      final m = decodeBadge(_ach('daily_goal_first'));
      expect(m.icon, '✓');
      expect(m.label, 'Daily goal hit');
      expect(m.tone, AlpColors.colorGreen);
    });

    test('mock_first', () {
      final m = decodeBadge(_ach('mock_first'));
      expect(m.icon, '🎓');
      expect(m.label, 'First mock test');
      expect(m.tone, AlpColors.colorPurple);
    });
  });

  group('decodeBadge — streak family (uses payload.days)', () {
    test('streak_3 with days=3', () {
      final m = decodeBadge(_ach('streak_3', {'days': 3}));
      expect(m.icon, '🔥');
      expect(m.label, '3-day streak');
      expect(m.tone, AlpColors.colorAmber);
    });

    test('streak_7 with days=7', () {
      final m = decodeBadge(_ach('streak_7', {'days': 7}));
      expect(m.label, '7-day streak');
    });

    test('streak_365 with days=365', () {
      final m = decodeBadge(_ach('streak_365', {'days': 365}));
      expect(m.label, '365-day streak');
    });

    test('streak_<n> WITHOUT payload.days falls through to generic', () {
      // Defensive: if the analytics emitter ever forgets to include days,
      // we don't render "null-day streak" — we drop to the generic chip.
      final m = decodeBadge(_ach('streak_7'));
      expect(m.icon, '🏆');
      expect(m.label, 'streak 7');
    });
  });

  group('decodeBadge — cumulative families (parsed from kind suffix)', () {
    test('mocks_5', () {
      final m = decodeBadge(_ach('mocks_5'));
      expect(m.icon, '🎓');
      expect(m.label, '5 mock tests');
      expect(m.tone, AlpColors.colorPurple);
    });

    test('mocks_10', () {
      final m = decodeBadge(_ach('mocks_10'));
      expect(m.label, '10 mock tests');
    });

    test('sessions_50', () {
      final m = decodeBadge(_ach('sessions_50'));
      expect(m.icon, '📚');
      expect(m.label, '50 sessions');
      expect(m.tone, AlpColors.colorGreen);
    });

    test('questions_1000', () {
      final m = decodeBadge(_ach('questions_1000'));
      expect(m.icon, '❓');
      expect(m.label, '1000 questions answered');
      expect(m.tone, AlpColors.colorBlue);
    });

    test('mocks_<garbage> falls back to 0 gracefully', () {
      // `int.tryParse` returns null which we coerce to 0, so the chip
      // renders "0 mock tests" rather than crashing.
      final m = decodeBadge(_ach('mocks_xyz'));
      expect(m.label, '0 mock tests');
    });
  });

  group('decodeBadge — fallback', () {
    test('unknown kind decodes to generic trophy with underscore-stripped label', () {
      final m = decodeBadge(_ach('legendary_special_award'));
      expect(m.icon, '🏆');
      expect(m.label, 'legendary special award');
      expect(m.tone, AlpColors.colorBlue);
    });

    test('empty-kind unknown still renders without crashing', () {
      final m = decodeBadge(_ach('unknown'));
      expect(m.icon, '🏆');
      expect(m.label, 'unknown');
    });
  });
}
