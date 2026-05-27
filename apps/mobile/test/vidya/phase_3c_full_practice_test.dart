// Phase 3c.full v1 — Task 1: VidyaPracticeSessionScreen widget tests.
// Mirrors the _StubScreeningClient pattern from phase_2c_screening_test.dart
// but stubs QuizClient (concrete class — we extend it and override the
// network-facing methods so the screen never hits a real socket).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

/// Builds a QuizNext payload carrying one question (the screen treats
/// `done=false` + a non-null item as "render this question").
QuizNext _q({
  required int idx,
  required String stem,
  required List<String> choices,
}) {
  return QuizNext(
    sessionId: 'sess-1',
    status: 'IN_PROGRESS',
    done: false,
    item: QuizItem(
      itemIdx: idx,
      questionId: 'q-$idx',
      stem: stem,
      choices: choices,
    ),
  );
}

QuizNext _complete() => QuizNext(
      sessionId: 'sess-1',
      status: 'COMPLETED',
      done: true,
    );

/// A stub QuizClient that extends the real class so the screen treats
/// it polymorphically. The constructor passes a dummy AuthClient — the
/// stub overrides every network-facing method, so AuthClient is never
/// actually called.
class _StubQuizClient extends QuizClient {
  _StubQuizClient({
    QuizSessionStart? startResponse,
    List<QuizNext> nextResponses = const [],
    Object? startError,
    Object? nextError,
    Object? answerError,
  })  : _startResponse = startResponse,
        _nextResponses = List.of(nextResponses),
        _startError = startError,
        _nextError = nextError,
        _answerError = answerError,
        super(
          auth: AuthClient(
            baseUrl: 'http://stub',
            httpClient: MockClient((req) async => http.Response('{}', 500)),
          ),
        );

  final QuizSessionStart? _startResponse;
  final List<QuizNext> _nextResponses;
  Object? _startError;
  Object? _nextError;
  final Object? _answerError;

  int startCalls = 0;
  int nextCalls = 0;
  int answerCalls = 0;
  int? lastAnswerIdx;

  /// Test hook — clear a one-shot error so a Retry path can succeed.
  void clearStartError() {
    _startError = null;
  }

  void clearNextError() {
    _nextError = null;
  }

  @override
  Future<QuizSessionStart> start({
    required String topicId,
    required String userId,
    String mode = 'PRACTICE',
  }) async {
    startCalls++;
    if (_startError != null) throw _startError!;
    return _startResponse ??
        QuizSessionStart(
          sessionId: 'sess-1',
          strategy: 'random',
          mode: mode,
          expiresAt: DateTime.now().add(const Duration(minutes: 15)),
        );
  }

  @override
  Future<QuizNext> next(String sessionId) async {
    nextCalls++;
    if (_nextError != null) throw _nextError!;
    if (_nextResponses.isEmpty) return _complete();
    return _nextResponses.removeAt(0);
  }

  @override
  Future<QuizAnswer> answer(
    String sessionId, {
    required int itemIdx,
    required int answerIdx,
    Map<String, dynamic>? responsePayload,
  }) async {
    answerCalls++;
    lastAnswerIdx = answerIdx;
    final err = _answerError;
    if (err != null) throw err;
    return QuizAnswer(
      sessionId: sessionId,
      itemIdx: itemIdx,
      isCorrect: true,
      correctIdx: answerIdx,
      servedCount: answerCalls,
      correctCount: answerCalls,
    );
  }
}

void main() {
  group('VidyaPracticeSessionScreen — Phase 3c.full v1', () {
    testWidgets('starts a session on mount and shows first question',
        (tester) async {
      final client = _StubQuizClient(
        nextResponses: [
          _q(idx: 0, stem: 'What is 2+2?', choices: ['3', '4', '5', '6']),
        ],
      );
      await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
        client: client,
        onCompleted: (_) {},
        onBack: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('What is 2+2?'), findsOneWidget);
      expect(find.text('1 of 10'), findsOneWidget);
      expect(client.startCalls, 1);
      expect(client.nextCalls, 1);
    });

    testWidgets('answer + next advances to next question', (tester) async {
      final client = _StubQuizClient(
        nextResponses: [
          _q(idx: 0, stem: 'Q1?', choices: ['choice-a', 'choice-b', 'choice-c', 'choice-d']),
          _q(idx: 1, stem: 'Q2?', choices: ['choice-a', 'choice-b', 'choice-c', 'choice-d']),
        ],
      );
      await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
        client: client,
        onCompleted: (_) {},
        onBack: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('Q1?'), findsOneWidget);
      await tester.tap(find.text('choice-b'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.practice.session.submit')));
      await tester.pumpAndSettle();
      expect(find.text('Q2?'), findsOneWidget);
      expect(client.answerCalls, 1);
      expect(client.lastAnswerIdx, 1);
      expect(find.text('2 of 10'), findsOneWidget);
    });

    testWidgets('completion fires onCompleted with sessionId', (tester) async {
      final client = _StubQuizClient(
        nextResponses: [
          _q(idx: 0, stem: 'Last?', choices: ['choice-a', 'choice-b', 'choice-c', 'choice-d']),
          _complete(),
        ],
      );
      String? completedSession;
      await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
        client: client,
        onCompleted: (sid) => completedSession = sid,
        onBack: () {},
      ),),);

      await tester.pumpAndSettle();
      await tester.tap(find.text('choice-a'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.practice.session.submit')));
      await tester.pumpAndSettle();
      expect(completedSession, 'sess-1');
    });

    testWidgets('network error shows VidyaBanner + Retry', (tester) async {
      final client = _StubQuizClient(
        startError: const QuizError(
          'Could not start quiz (500).',
          QuizErrorCode.unknown,
        ),
      );
      await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
        client: client,
        onCompleted: (_) {},
        onBack: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't start"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);

      // Clear the error and tap Retry — the screen should call start again
      // and recover to the first question.
      client.clearStartError();
      // Queue up a question for the recovered run.
      client._nextResponses.add(
        _q(idx: 0, stem: 'Recovered?', choices: ['A', 'B', 'C', 'D']),
      );
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Recovered?'), findsOneWidget);
      expect(client.startCalls, 2);
    });

    testWidgets('close (✕) fires onBack', (tester) async {
      final client = _StubQuizClient(
        nextResponses: [
          _q(idx: 0, stem: 'Q?', choices: ['A', 'B', 'C', 'D']),
        ],
      );
      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
        client: client,
        onCompleted: (_) {},
        onBack: () => backTaps++,
      ),),);
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      expect(backTaps, 1);
    });
  });
}
