// Unit tests for the insights client (Phase 6 S52 mobile).

import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/insights/insights_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('camelizes a populated snapshot', () async {
    final auth = AuthClient(
      baseUrl: 'http://test',
      storage: const FlutterSecureStorage(),
      httpClient: MockClient((req) async {
        return http.Response(
          jsonEncode({
            'user_id': 'u-1',
            'my_state': {
              'concept_mastery': [
                {
                  'concept_id': 'c-aaa',
                  'ewa': 0.82,
                  'n': 7,
                  'decay_severity': 'fresh',
                  'decay_days': 2,
                },
              ],
              'topic_decay': [],
              'readiness': {'score': 0.62, 'band': 'on_track'},
            },
            'what_this_means': {
              'weak_concepts': [],
              'decay_alerts': [],
            },
            'what_to_do': {
              'missions_today_pending': true,
              'revision_due_today': 3,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final client = InsightsClient(auth: auth);
    final out = await client.fetchSnapshot('u-1');
    expect(out.userId, 'u-1');
    expect(out.conceptMastery, hasLength(1));
    expect(out.conceptMastery.first.conceptId, 'c-aaa');
    expect(out.readiness?.band, ReadinessBand.onTrack);
    expect(out.missionsTodayPending, isTrue);
    expect(out.revisionDueToday, 3);
  });

  test('handles an empty snapshot', () async {
    final auth = AuthClient(
      baseUrl: 'http://test',
      storage: const FlutterSecureStorage(),
      httpClient: MockClient((req) async {
        return http.Response(
          jsonEncode({
            'user_id': 'u-new',
            'my_state': {
              'concept_mastery': [],
              'topic_decay': [],
              'readiness': null,
            },
            'what_this_means': {
              'weak_concepts': [],
              'decay_alerts': [],
            },
            'what_to_do': {
              'missions_today_pending': false,
              'revision_due_today': 0,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final client = InsightsClient(auth: auth);
    final out = await client.fetchSnapshot('u-new');
    expect(out.conceptMastery, isEmpty);
    expect(out.readiness, isNull);
    expect(out.revisionDueToday, 0);
  });

  test('throws on non-200', () async {
    final auth = AuthClient(
      baseUrl: 'http://test',
      storage: const FlutterSecureStorage(),
      httpClient:
          MockClient((req) async => http.Response('boom', 500)),
    );
    final client = InsightsClient(auth: auth);
    expect(
      () => client.fetchSnapshot('u-1'),
      throwsA(isA<Exception>()),
    );
  });

  group('display helpers', () {
    test('readinessBandLabel maps each band', () {
      expect(readinessBandLabel(ReadinessBand.approaching),
          'Approaching target',);
      expect(readinessBandLabel(ReadinessBand.onTrack), 'On track');
      expect(readinessBandLabel(ReadinessBand.behind), 'Behind pace');
      expect(readinessBandLabel(ReadinessBand.atRisk), 'At risk');
    });

    test('decaySeverityLabel maps each severity', () {
      expect(decaySeverityLabel(DecaySeverity.fresh), 'Fresh');
      expect(decaySeverityLabel(DecaySeverity.aging), 'Aging');
      expect(decaySeverityLabel(DecaySeverity.stale), 'Stale');
      expect(decaySeverityLabel(DecaySeverity.critical), 'Critical');
    });
  });
}
