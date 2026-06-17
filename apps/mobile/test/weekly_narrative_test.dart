// Tests for the weekly-narrative client + parseDataLink (S53 mobile).

import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/weekly_narrative/weekly_narrative_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('fetchCurrent', () {
    test('returns NarrativeFound when narrative is present', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async {
          return http.Response(
            jsonEncode({
              'id': 'n-1',
              'user_id': 'u-1',
              'week_start': '2026-05-11',
              'narrative': {
                'improved': {'text': 'You went from 58 to 71 on Newton 3.', 'data_link': 'concept_mastery_delta:newton-3:0.58→0.71'},
                'slipping': {'text': 'Stoichiometry decayed.'},
                'hidden_pattern': {'text': 'Faster mornings.'},
                'forecast': {'text': 'Trajectory holds.'},
                'week_ahead': {'text': 'Focus on three things.', 'actions': ['Drill Newton 3', 'Take a 30-min mock']},
              },
              'source': 'ai',
              'model': 'gpt-4o-mini',
              'prompt_template_id': 'weekly_narrative',
              'prompt_template_version': '1.0.0',
              'is_delta': false,
              'delta_trigger': null,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      final out = await WeeklyNarrativeClient(auth: auth).fetchCurrent('u-1');
      expect(out, isA<NarrativeFound>());
      final r = (out as NarrativeFound).record;
      expect(r.source, 'ai');
      expect(r.narrative.improved.text, contains('Newton 3'));
      expect(r.narrative.weekAhead.actions, hasLength(2));
    });

    test('returns NarrativeAbsent when narrative is null', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async {
          return http.Response(
            jsonEncode({'narrative': null, 'reason': 'not_generated_yet'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      final out = await WeeklyNarrativeClient(auth: auth).fetchCurrent('u-1');
      expect(out, isA<NarrativeAbsent>());
      expect((out as NarrativeAbsent).reason, 'not_generated_yet');
    });
  });

  group('parseDataLink', () {
    test('returns null for null / empty / whitespace', () {
      expect(parseDataLink(null), isNull);
      expect(parseDataLink(''), isNull);
      expect(parseDataLink('   '), isNull);
    });

    test('routes concept_mastery_delta', () {
      final p = parseDataLink('concept_mastery_delta:newton-3:0.58→0.71');
      expect(p!.source, 'concept_mastery_delta');
      expect(p.key, 'newton-3');
      expect(p.value, '0.58→0.71');
      expect(p.label, 'See concept profile');
    });

    test('unknown source falls back to Open insights', () {
      final p = parseDataLink('brand_new_signal:foo:bar');
      expect(p!.label, 'Open insights');
    });

    test('composite value with embedded colons stays intact', () {
      final p = parseDataLink('time_distribution:morning:14:00-09:00');
      expect(p!.value, '14:00-09:00');
    });
  });

  group('formatWeekRange', () {
    test('renders Mon→Sun range', () {
      final out = formatWeekRange('2026-05-11');
      expect(out, contains('May 11'));
      expect(out, contains('May 17'));
    });
    test('invalid date passes through', () {
      expect(formatWeekRange('not-a-date'), 'not-a-date');
    });
  });
}
