import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';

ScreeningClient _makeClient(MockClient mock, {AuthClient? auth}) {
  return ScreeningClient(
    baseUrl: 'http://test',
    httpClient: mock,
    auth: auth ??
        AuthClient(baseUrl: 'http://test', httpClient: mock),
  );
}

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('ScreeningClient', () {
    test('start posts exam_code+language and returns ScreeningStart',
        (() async {
      String? capturedBody;
      final mock = MockClient((req) async {
        capturedBody = req.body;
        return http.Response(
          jsonEncode({'token': 'tok-1', 'target_count': 12, 'exam_code': 'JEE-MAIN'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final c = _makeClient(mock);
      final r = await c.start(examCode: 'JEE-MAIN', language: 'en');
      expect(r.token, 'tok-1');
      expect(r.targetCount, 12);
      expect(r.examCode, 'JEE-MAIN');
      expect(jsonDecode(capturedBody!), {'exam_code': 'JEE-MAIN', 'language': 'en'});
    }));

    test('next returns ScreeningQuestion on 200', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({
              'item_idx': 0,
              'total': 12,
              'stem': 'What is 2+2?',
              'choices': ['3', '4', '5', '6'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final q = await c.next('tok-1');
      expect(q, isA<ScreeningQuestion>());
      expect((q as ScreeningQuestion).stem, 'What is 2+2?');
      expect(q.choices, ['3', '4', '5', '6']);
    });

    test('next returns ScreeningComplete on 409 {code: complete}', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
            409,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final r = await c.next('tok-1');
      expect(r, isA<ScreeningComplete>());
    });

    test('answer posts {item_idx, answer_idx} and returns on 204', () async {
      Map<String, dynamic>? capturedBody;
      final mock = MockClient((req) async {
        capturedBody = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response('', 204);
      });
      final c = _makeClient(mock);
      await c.answer('tok-1', itemIdx: 0, answerIdx: 2);
      expect(capturedBody, {'item_idx': 0, 'answer_idx': 2});
    });

    test('reveal returns ScreeningReveal payload', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({
              'score_pct': 75.0,
              'correct': 9,
              'total': 12,
              'topic_breakdown': [
                {'topic_id': 't-1', 'correct': 2, 'total': 3},
                {'topic_id': 't-2', 'correct': 1, 'total': 4},
              ],
              'readiness_seed': 0.75,
            }),
            200,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final r = await c.reveal('tok-1');
      expect(r.scorePct, 75.0);
      expect(r.correct, 9);
      expect(r.total, 12);
      expect(r.readinessSeed, 0.75);
      expect(r.topicBreakdown.length, 2);
      expect(r.topicBreakdown.first.topicId, 't-1');
    });

    test('persist hits POST /screening/{token}/persist via auth.apiPost',
        () async {
      String? capturedPath;
      final mock = MockClient((req) async {
        capturedPath = req.url.path;
        return http.Response(
          jsonEncode({'persisted': true, 'attempt_id': 'a-1'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final c = _makeClient(mock, auth: auth);
      final r = await c.persist('tok-1');
      expect(r.persisted, true);
      expect(r.attemptId, 'a-1');
      expect(capturedPath, '/screening/tok-1/persist');
    });

    test('diagnosticComplete hits POST /profile/me/diagnostic-complete',
        () async {
      String? capturedPath;
      final mock = MockClient((req) async {
        capturedPath = req.url.path;
        return http.Response('', 204);
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final c = _makeClient(mock, auth: auth);
      await c.diagnosticComplete();
      expect(capturedPath, '/profile/me/diagnostic-complete');
    });
  });
}
