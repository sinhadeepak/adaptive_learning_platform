// Unit tests for QuizOfflineQueue (Phase 6 S51, UX-32 v0).
//
// Uses the queue's injectable in-memory store so we don't hit the real
// flutter_secure_storage in tests. Also exercises drain() with a fake
// QuizClient that fails the first N calls.

import 'dart:async';
import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_offline_queue.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _sessionA = 'sess-a';
const _sessionB = 'sess-b';

void main() {
  group('QuizOfflineQueue (in-memory)', () {
    test('load returns empty when nothing queued', () async {
      final q = QuizOfflineQueue(memoryStore: {});
      expect(await q.load(_sessionA), isEmpty);
    });

    test('enqueue + load round-trips a PendingAnswer', () async {
      final store = <String, String>{};
      final q = QuizOfflineQueue(memoryStore: store);

      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 0,
        answerIdx: 2,
        queuedAtMs: 1700000000,
      ),);

      final loaded = await q.load(_sessionA);
      expect(loaded, hasLength(1));
      expect(loaded.first.itemIdx, 0);
      expect(loaded.first.answerIdx, 2);
      // And the second session is independent.
      expect(await q.load(_sessionB), isEmpty);
    });

    test('responsePayload survives the round-trip', () async {
      final q = QuizOfflineQueue(memoryStore: {});
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 7,
        answerIdx: 0,
        queuedAtMs: 1,
        responsePayload: {'answer': 9.81, 'units': 'm/s^2'},
      ),);
      final loaded = await q.load(_sessionA);
      expect(loaded.first.responsePayload, {
        'answer': 9.81,
        'units': 'm/s^2',
      });
    });

    test('remove deletes by itemIdx and clears the blob when empty',
        () async {
      final store = <String, String>{};
      final q = QuizOfflineQueue(memoryStore: store);
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 1,
        answerIdx: 0,
        queuedAtMs: 1,
      ),);
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 2,
        answerIdx: 1,
        queuedAtMs: 2,
      ),);

      await q.remove(_sessionA, 1);
      var loaded = await q.load(_sessionA);
      expect(loaded.map((e) => e.itemIdx).toList(), [2]);

      await q.remove(_sessionA, 2);
      loaded = await q.load(_sessionA);
      expect(loaded, isEmpty);
      expect(store.containsKey('quiz.offline_queue.v1.$_sessionA'), isFalse);
    });

    test('clear wipes a single session', () async {
      final store = <String, String>{};
      final q = QuizOfflineQueue(memoryStore: store);
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 0,
        answerIdx: 0,
        queuedAtMs: 1,
      ),);
      await q.enqueue(PendingAnswer(
        sessionId: _sessionB,
        itemIdx: 0,
        answerIdx: 0,
        queuedAtMs: 1,
      ),);
      await q.clear(_sessionA);
      expect(await q.load(_sessionA), isEmpty);
      expect(await q.load(_sessionB), hasLength(1));
    });

    test('load tolerates a corrupted blob and clears it', () async {
      final store = <String, String>{
        'quiz.offline_queue.v1.$_sessionA': '{not-json',
      };
      final q = QuizOfflineQueue(memoryStore: store);
      expect(await q.load(_sessionA), isEmpty);
      expect(store, isEmpty);
    });
  });

  group('QuizOfflineQueue.drain', () {
    test('replays every queued answer when the server is reachable',
        () async {
      final calls = <Map<String, dynamic>>[];
      final mockHttp = MockClient((req) async {
        if (req.url.path.contains('/answers')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          calls.add(body);
          return http.Response(
            jsonEncode({
              'sessionId': _sessionA,
              'itemIdx': body['itemIdx'],
              'isCorrect': true,
              'correctIdx': 0,
              'servedCount': 1 + calls.length,
              'correctCount': calls.length,
            }),
            200,
          );
        }
        return http.Response('not found', 404);
      });
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: mockHttp,
      );
      final client = QuizClient(auth: auth);
      final q = QuizOfflineQueue(memoryStore: {});
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 0,
        answerIdx: 1,
        queuedAtMs: 1,
      ),);
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 1,
        answerIdx: 2,
        queuedAtMs: 2,
      ),);

      final replayed = await q.drain(client, _sessionA);

      expect(replayed, 2);
      expect(calls.map((c) => c['itemIdx']).toList(), [0, 1]);
      expect(await q.load(_sessionA), isEmpty);
    });

    test('stops at the first failure and leaves remaining entries',
        () async {
      var calls = 0;
      final mockHttp = MockClient((req) async {
        if (req.url.path.contains('/answers')) {
          calls++;
          if (calls == 1) {
            return http.Response(
              jsonEncode({
                'sessionId': _sessionA,
                'itemIdx': 0,
                'isCorrect': true,
                'correctIdx': 0,
                'servedCount': 1,
                'correctCount': 1,
              }),
              200,
            );
          }
          // Simulate offline / transient failure.
          throw const SocketExceptionMock();
        }
        return http.Response('not found', 404);
      });
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: mockHttp,
      );
      final client = QuizClient(auth: auth);
      final q = QuizOfflineQueue(memoryStore: {});
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 0,
        answerIdx: 1,
        queuedAtMs: 1,
      ),);
      await q.enqueue(PendingAnswer(
        sessionId: _sessionA,
        itemIdx: 1,
        answerIdx: 2,
        queuedAtMs: 2,
      ),);

      final replayed = await q.drain(client, _sessionA);

      // Only the first replay succeeded; the second remained in the queue.
      expect(replayed, 1);
      final remaining = await q.load(_sessionA);
      expect(remaining, hasLength(1));
      expect(remaining.first.itemIdx, 1);
    });
  });
}

class SocketExceptionMock implements Exception {
  const SocketExceptionMock();
}
