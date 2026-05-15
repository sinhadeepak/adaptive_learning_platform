// Tests for the readiness + topic-decay client (S56 mobile).

import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/insights/insights_client.dart';
import 'package:adaptive_learning_mobile/readiness/readiness_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('fetchTopicDecay', () {
    test('maps the items array', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async => http.Response(
              jsonEncode({
                'user_id': 'u-1',
                'items': [
                  {
                    'concept_id': 'c-aaa',
                    'ewa': 0.81,
                    'n': 5,
                    'decay_days': 2,
                    'decay_severity': 'fresh',
                  },
                  {
                    'concept_id': 'c-bbb',
                    'ewa': 0.32,
                    'n': 3,
                    'decay_days': 18,
                    'decay_severity': 'critical',
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            ),),
      );
      final out =
          await ReadinessClient(auth: auth).fetchTopicDecay('u-1');
      expect(out, hasLength(2));
      expect(out.first.decaySeverity, DecaySeverity.fresh);
      expect(out.last.decayDays, 18);
    });

    test('missing items array coalesces to empty', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async => http.Response(
              jsonEncode({'user_id': 'u-1'}),
              200,
              headers: {'content-type': 'application/json'},
            ),),
      );
      final out =
          await ReadinessClient(auth: auth).fetchTopicDecay('u-1');
      expect(out, isEmpty);
    });
  });

  group('fetchReadinessBand', () {
    test('maps response + sends query string', () async {
      final calls = <Uri>[];
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async {
          calls.add(req.url);
          return http.Response(
            jsonEncode({
              'user_id': 'u-1',
              'readiness_score': 0.58,
              'target_score': 0.7,
              'days_to_exam': 90,
              'band': 'behind',
              'actions': ['Add 15m daily', 'Run mock test on Sunday'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      final out = await ReadinessClient(auth: auth).fetchReadinessBand(
        'u-1',
        targetScore: 0.7,
        daysToExam: 90,
      );
      expect(out.band, ReadinessBand.behind);
      expect(out.readinessScore, 0.58);
      expect(out.actions, hasLength(2));
      expect(calls.first.query, contains('target_score=0.7'));
      expect(calls.first.query, contains('days_to_exam=90'));
    });
  });

  group('decay helpers', () {
    test('decayArrow maps each severity', () {
      expect(decayArrow(DecaySeverity.fresh), '↑');
      expect(decayArrow(DecaySeverity.aging), '—');
      expect(decayArrow(DecaySeverity.stale), '↓');
      expect(decayArrow(DecaySeverity.critical), '↓');
    });
    test('decayArrowTone maps each severity', () {
      expect(decayArrowTone(DecaySeverity.fresh), DecayTone.success);
      expect(decayArrowTone(DecaySeverity.aging), DecayTone.neutral);
      expect(decayArrowTone(DecaySeverity.stale), DecayTone.warning);
      expect(decayArrowTone(DecaySeverity.critical), DecayTone.danger);
    });
  });
}
