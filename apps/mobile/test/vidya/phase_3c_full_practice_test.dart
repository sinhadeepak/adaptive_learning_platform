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
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_result_screen.dart';
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
    Map<int, Object>? nextErrors,
    QuizSessionDetail? sessionResponse,
    Object? sessionError,
  })  : _startResponse = startResponse,
        _nextResponses = List.of(nextResponses),
        _startError = startError,
        _nextError = nextError,
        _answerError = answerError,
        _nextErrors = Map.of(nextErrors ?? const {}),
        _sessionResponse = sessionResponse,
        _sessionError = sessionError,
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

  /// Map of {1-indexed call number → error to throw on that next() call}.
  /// Lets a test inject a transient failure mid-session without taking
  /// down every subsequent fetch.
  final Map<int, Object> _nextErrors;

  final QuizSessionDetail? _sessionResponse;
  Object? _sessionError;

  int startCalls = 0;
  int nextCalls = 0;
  int answerCalls = 0;
  int sessionCalls = 0;
  int? lastAnswerIdx;
  String? lastSessionId;

  /// Last topicId/userId echoed through start() — lets tests assert the
  /// screen's constructor params actually flow to the wire call (guards
  /// against a future Task 3 wiring regression where they get silently
  /// swapped back to empty strings).
  String? lastStartTopicId;
  String? lastStartUserId;

  /// Test hook — clear a one-shot error so a Retry path can succeed.
  void clearStartError() {
    _startError = null;
  }

  void clearNextError() {
    _nextError = null;
  }

  /// Test hook — clear a one-shot session() error so Retry can succeed.
  void clearSessionError() {
    _sessionError = null;
  }

  @override
  Future<QuizSessionStart> start({
    required String topicId,
    required String userId,
    String mode = 'PRACTICE',
  }) async {
    startCalls++;
    lastStartTopicId = topicId;
    lastStartUserId = userId;
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
    // Per-call error injection takes precedence over the sticky _nextError.
    final perCall = _nextErrors.remove(nextCalls);
    if (perCall != null) throw perCall;
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

  @override
  Future<QuizSessionDetail> session(String sessionId) async {
    sessionCalls++;
    lastSessionId = sessionId;
    if (_sessionError != null) throw _sessionError!;
    return _sessionResponse ??
        QuizSessionDetail(
          sessionId: sessionId,
          userId: 'u-1',
          topicId: 't-1',
          mode: 'PRACTICE',
          strategy: 'random',
          status: 'COMPLETED',
          targetCount: 10,
          servedCount: 10,
          correctCount: 0,
          items: const [],
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
        topicId: 't-1',
        userId: 'u-1',
        onCompleted: (_) {},
        onBack: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('What is 2+2?'), findsOneWidget);
      expect(find.text('1 of 10'), findsOneWidget);
      expect(client.startCalls, 1);
      expect(client.nextCalls, 1);
      // Constructor params must flow to the wire call — guards against a
      // future Task 3 wiring change silently swapping them to ''.
      expect(client.lastStartTopicId, 't-1');
      expect(client.lastStartUserId, 'u-1');
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

    testWidgets('mid-session error → retry calls next, not start',
        (tester) async {
      // Set up: start succeeds → next call #1 returns Q1 → after the user
      // answers, next call #2 throws (transient) → Retry triggers next
      // call #3 which returns Q2. Crucially `start()` must only ever be
      // called once — _retry() must take the `_sessionId != null` branch
      // and re-enter via _fetchNext, not _start.
      final client = _StubQuizClient(
        nextResponses: [
          _q(idx: 0, stem: 'Q1 stem', choices: ['choice-a', 'choice-b', 'choice-c', 'choice-d']),
          _q(idx: 1, stem: 'Q2 stem', choices: ['choice-a', 'choice-b', 'choice-c', 'choice-d']),
        ],
        // The 2nd next() call (after the answer submit) throws; #1 and #3
        // pop from _nextResponses normally.
        nextErrors: {
          2: const QuizError('transient', QuizErrorCode.unknown),
        },
      );

      await tester.pumpWidget(_harness(VidyaPracticeSessionScreen(
        client: client,
        onCompleted: (_) {},
        onBack: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('Q1 stem'), findsOneWidget);
      expect(client.startCalls, 1);
      expect(client.nextCalls, 1);

      // Submit an answer → triggers the 2nd next() which throws → banner.
      await tester.tap(find.text('choice-b'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.practice.session.submit')));
      await tester.pumpAndSettle();

      expect(find.textContaining('transient'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      // The throwing call still counted.
      expect(client.nextCalls, 2);
      // start() must NOT have been re-called by the failing next().
      expect(client.startCalls, 1);

      // Tap Retry → _retry() should take the `_sessionId != null` branch
      // and call _fetchNext, NOT _start. Q2 should render.
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(client.startCalls, 1, reason: 'Retry must not re-invoke start()');
      expect(client.nextCalls, 3, reason: 'Retry should advance via next()');
      expect(find.text('Q2 stem'), findsOneWidget);
      expect(find.text('2 of 10'), findsOneWidget);
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

  group('VidyaPracticeResultScreen — Phase 3c.full v1', () {
    QuizSessionDetail summary({
      int correct = 7,
      int served = 10,
    }) =>
        QuizSessionDetail(
          sessionId: 'sess-1',
          userId: 'u-1',
          topicId: 't-1',
          mode: 'PRACTICE',
          strategy: 'random',
          status: 'COMPLETED',
          targetCount: 10,
          servedCount: served,
          correctCount: correct,
          items: const [],
        );

    testWidgets('renders score from fetched session summary',
        (tester) async {
      final client = _StubQuizClient(
        sessionResponse: summary(correct: 7, served: 10),
      );
      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('7 / 10'), findsOneWidget);
      expect(find.text('PRACTICE COMPLETE'), findsOneWidget);
      expect(client.sessionCalls, 1);
      expect(client.lastSessionId, 'sess-1');
    });

    testWidgets('Done CTA fires onDone', (tester) async {
      final client = _StubQuizClient(
        sessionResponse: summary(correct: 4, served: 10),
      );
      var doneTaps = 0;
      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () => doneTaps++,
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('4 / 10'), findsOneWidget);
      await tester.tap(find.text('Done'));
      await tester.pump();
      expect(doneTaps, 1);
    });

    testWidgets('fetch error shows VidyaBanner + Retry recovers',
        (tester) async {
      final client = _StubQuizClient(
        sessionResponse: summary(correct: 9, served: 10),
        sessionError: const QuizError(
          'Could not load session (500).',
          QuizErrorCode.unknown,
        ),
      );
      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);

      // Clear the error and tap Retry — the screen should call session()
      // again and render the score.
      client.clearSessionError();
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('9 / 10'), findsOneWidget);
      expect(client.sessionCalls, 2);
    });
  });
}
