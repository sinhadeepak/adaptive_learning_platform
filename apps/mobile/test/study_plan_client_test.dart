// Tests for the study-plan client (Phase 6 S55 mobile).

import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/study_plan/study_plan_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _planJson = {
  'id': 'pl-1',
  'user_id': 'u-1',
  'week_start': '2026-05-11',
  'target_date': '2026-08-01',
  'daily_minutes_goal': 45,
  'source': 'ai_initial',
  'status': 'active',
  'sessions': [
    {
      'id': 'ps-1',
      'plan_id': 'pl-1',
      'day_offset': 0,
      'slot': 'evening',
      'kind': 'practice_concept',
      'concept_id': 'c-aaa',
      'topic_id': null,
      'expected_minutes': 25,
      'expected_questions': 10,
      'is_required': true,
      'locked_reason': null,
      'status': 'pending',
      'completed_at': null,
      'linked_session_id': null,
      'position': 0,
    },
  ],
};

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('fetchActive', () {
    test('returns PlanFound on 200', () async {
      final auth = _mock((req) async => http.Response(
            jsonEncode(_planJson),
            200,
            headers: {'content-type': 'application/json'},
          ),);
      final out = await StudyPlanClient(auth: auth).fetchActive();
      expect(out, isA<PlanFound>());
      final p = (out as PlanFound).plan;
      expect(p.id, 'pl-1');
      expect(p.sessions, hasLength(1));
      expect(p.sessions.first.isRequired, isTrue);
    });

    test('returns PlanAbsent on 404', () async {
      final auth = _mock(
          (req) async => http.Response('not found', 404),);
      final out = await StudyPlanClient(auth: auth).fetchActive();
      expect(out, isA<PlanAbsent>());
    });

    test('non-2xx/404 throws', () async {
      final auth = _mock((req) async => http.Response('boom', 500));
      expect(
        () => StudyPlanClient(auth: auth).fetchActive(),
        throwsA(isA<Exception>()),
      );
    });
  });

  group('edit', () {
    test('maps blocked response', () async {
      final auth = _mock(
        (req) async => http.Response(
          jsonEncode({
            'edit_id': 'e-1',
            'impact_preview': {'summary': ''},
            'blocked': true,
            'block_reason': 'required sessions stay put',
          }),
          200,
          headers: {'content-type': 'application/json'},
        ),
      );
      final out = await StudyPlanClient(auth: auth).edit(
        'pl-1',
        const EditPayload(kind: EditKind.rest, sessionId: 'ps-1'),
      );
      expect(out.blocked, isTrue);
      expect(out.blockReason, 'required sessions stay put');
    });

    test('maps allowed response with summary', () async {
      final auth = _mock(
        (req) async => http.Response(
          jsonEncode({
            'edit_id': 'e-2',
            'impact_preview': {'summary': 'Moved to tomorrow.'},
            'blocked': false,
            'block_reason': null,
          }),
          200,
        ),
      );
      final out = await StudyPlanClient(auth: auth).edit(
        'pl-1',
        const EditPayload(
          kind: EditKind.postpone,
          sessionId: 'ps-1',
          toDayOffset: 1,
        ),
      );
      expect(out.blocked, isFalse);
      expect(out.summary, 'Moved to tomorrow.');
    });
  });

  group('display helpers', () {
    test('sessionKindLabel maps known + unknown kinds', () {
      expect(sessionKindLabel('practice_concept'),
          'Practice — weak concept',);
      expect(sessionKindLabel('custom_kind'), 'custom_kind');
    });

    test('dayOffsetLabel renders weekday + date', () {
      final out = dayOffsetLabel(2, '2026-05-11');
      expect(out, contains('May 13'));
      expect(out, contains('·'));
    });

    test('dayOffsetLabel falls back on invalid week start', () {
      expect(dayOffsetLabel(0, 'not-a-date'), 'Day 1');
    });
  });

  test('editKindWire maps every enum value', () {
    expect(editKindWire(EditKind.shorten), 'shorten');
    expect(editKindWire(EditKind.regenerate), 'regenerate');
    expect(editKindWire(EditKind.postpone), 'postpone');
    expect(editKindWire(EditKind.split), 'split');
  });
}

AuthClient _mock(MockClientHandler handler) => AuthClient(
      baseUrl: 'http://test',
      storage: const FlutterSecureStorage(),
      httpClient: MockClient(handler),
    );
