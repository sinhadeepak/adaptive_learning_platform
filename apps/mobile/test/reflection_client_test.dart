// Tests for reflection + recovery + low-bandwidth clients (S57 mobile).

import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/reflection/reflection_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

AuthClient _mock(MockClientHandler handler) => AuthClient(
      baseUrl: 'http://test',
      storage: const FlutterSecureStorage(),
      httpClient: MockClient(handler),
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('postReflection', () {
    test('returns the id from a 201 response', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode({'id': 'r-1'}),
            201,
            headers: {'content-type': 'application/json'},
          ),);
      final id = await ReflectionClient(auth: auth).postReflection(
        userId: 'u-1',
        trigger: ReflectionTrigger.session,
        triggerArtifactId: 'sid-1',
        response: 'Tripped on units',
        commitment: 'Drill formula sheet tomorrow',
      );
      expect(id, 'r-1');
    });

    test('non-201 throws', () async {
      final auth =
          _mock((req) async => http.Response('boom', 500));
      expect(
        () => ReflectionClient(auth: auth).postReflection(
            userId: 'u', trigger: ReflectionTrigger.session,),
        throwsA(isA<Exception>()),
      );
    });
  });

  group('listCommitments', () {
    test('maps array response', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode([
              {
                'id': 'r-1',
                'trigger': 'session',
                'prompt_id': 'default_prompt',
                'commitment': 'Drill Newton',
                'commitment_due_at': '2026-05-20T00:00:00Z',
                'commitment_status': 'pending',
                'occurred_at': '2026-05-13T08:00:00Z',
                'last_check_in_at': null,
              },
            ]),
            200,
            headers: {'content-type': 'application/json'},
          ),);
      final out =
          await ReflectionClient(auth: auth).listCommitments('u-1');
      expect(out, hasLength(1));
      expect(out.first.status, CommitmentStatus.pending);
    });

    test('maps { items } object response', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode({'items': []}),
            200,
            headers: {'content-type': 'application/json'},
          ),);
      final out =
          await ReflectionClient(auth: auth).listCommitments('u-1');
      expect(out, isEmpty);
    });
  });

  test('checkIn returns the new status', () async {
    final auth = _mock((req) async => http.Response(
          jsonEncode({'commitment_status': 'kept'}),
          200,
          headers: {'content-type': 'application/json'},
        ),);
    final out = await ReflectionClient(auth: auth)
        .checkIn('r-1', kept: true, note: 'Done at 7am');
    expect(out, CommitmentStatus.kept);
  });

  group('RecoveryClient', () {
    test('found maps to camelCase', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode({
              'proposal': {
                'id': 'rec-1',
                'plan_id': 'pl-1',
                'triggered_at': '2026-05-14T18:00:00Z',
                'missed_session_ids': ['ps-1', 'ps-2'],
                'catch_up_payload': {'kind': 'consolidated'},
                'rationale': '2 sessions missed this week',
                'expected_minutes': 35,
                'status': 'pending',
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          ),);
      final out = await RecoveryClient(auth: auth).fetchActive();
      expect(out, isA<RecoveryFound>());
      final p = (out as RecoveryFound).proposal;
      expect(p.missedSessionIds, ['ps-1', 'ps-2']);
      expect(p.expectedMinutes, 35);
    });

    test('absent when proposal is null', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode({'proposal': null}),
            200,
            headers: {'content-type': 'application/json'},
          ),);
      final out = await RecoveryClient(auth: auth).fetchActive();
      expect(out, isA<RecoveryAbsent>());
    });

    test('accept returns new status', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode({'status': 'accepted'}),
            200,
            headers: {'content-type': 'application/json'},
          ),);
      expect(await RecoveryClient(auth: auth).accept('rec-1'),
          RecoveryStatus.accepted,);
    });
  });

  group('low-bandwidth prefs', () {
    test('defaults are all false', () async {
      final p = await loadLowBandwidthPrefs();
      expect(p.reducedAnimations, isFalse);
      expect(p.prefetchOff, isFalse);
      expect(p.imagesLite, isFalse);
    });

    test('save + load round-trips', () async {
      const next = LowBandwidthPrefs(
        reducedAnimations: true,
        prefetchOff: false,
        imagesLite: true,
      );
      await saveLowBandwidthPrefs(next);
      final loaded = await loadLowBandwidthPrefs();
      expect(loaded.reducedAnimations, isTrue);
      expect(loaded.imagesLite, isTrue);
    });
  });
}
