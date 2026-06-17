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
import 'package:adaptive_learning_mobile/vidya/shell/vidya_main_shell_scope.dart';

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
    List<QuizSessionDetail>? sessionResponses,
    Object? sessionError,
  })  : _startResponse = startResponse,
        _nextResponses = List.of(nextResponses),
        _startError = startError,
        _nextError = nextError,
        _answerError = answerError,
        _nextErrors = Map.of(nextErrors ?? const {}),
        _sessionResponse = sessionResponse,
        _sessionResponses =
            sessionResponses != null ? List.of(sessionResponses) : null,
        _sessionError = sessionError,
        super(
          auth: AuthClient(
            baseUrl: 'http://stub',
            httpClient: MockClient((req) async => http.Response('{}', 500)),
          ),
        );

  /// Like the default ctor but lets the test supply its own AuthClient
  /// — needed by Phase 3c.full v2 result-screen tests that mock
  /// /catalog/topics/{id} for the BY TOPIC label resolution path.
  _StubQuizClient.withAuth({
    required AuthClient auth,
    QuizSessionDetail? sessionResponse,
  })  : _startResponse = null,
        _nextResponses = [],
        _startError = null,
        _nextError = null,
        _answerError = null,
        _nextErrors = {},
        _sessionResponse = sessionResponse,
        _sessionResponses = null,
        _sessionError = null,
        super(auth: auth);

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

  /// Phase 3c.full v1.1 — when set, session() pops responses from this
  /// queue (FIFO). Lets a test exercise the IN_PROGRESS → COMPLETED
  /// retry path. Once exhausted we fall back to `_sessionResponse` or
  /// the default COMPLETED stub. `_sessionResponse` is preserved as the
  /// single-response shortcut for backward compat with existing tests.
  final List<QuizSessionDetail>? _sessionResponses;
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
    if (_sessionResponses != null && _sessionResponses.isNotEmpty) {
      return _sessionResponses.removeAt(0);
    }
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
        topicId: 'topic-1',
        userId: 'user-1',
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
        topicId: 'topic-1',
        userId: 'user-1',
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
        topicId: 'topic-1',
        userId: 'user-1',
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
        topicId: 'topic-1',
        userId: 'user-1',
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
        topicId: 'topic-1',
        userId: 'user-1',
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
      int target = 10,
      String status = 'COMPLETED',
    }) =>
        QuizSessionDetail(
          sessionId: 'sess-1',
          userId: 'u-1',
          topicId: 't-1',
          mode: 'PRACTICE',
          strategy: 'random',
          status: status,
          targetCount: target,
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

    testWidgets('early-quit summary uses targetCount as denominator',
        (tester) async {
      // User answered only 5 of the 10 they planned. The result screen
      // must read "3 / 10" (not the misleading "3 / 5") to match what
      // the user saw mid-quiz ("X of 10" throughout).
      final client = _StubQuizClient(
        sessionResponse: summary(correct: 3, served: 5, target: 10),
      );
      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      ),),);
      await tester.pumpAndSettle();
      expect(find.text('3 / 10'), findsOneWidget);
      expect(find.text('3 / 5'), findsNothing);
    });

    testWidgets(
        'IN_PROGRESS summary triggers single retry, then renders (v1.1)',
        (tester) async {
      // Race case from M2: the session screen pushes us here via the
      // sessionDone-409 completion path before the server has finished
      // writing the COMPLETED status. The result screen should retry
      // session() once after 500ms and render the second (COMPLETED)
      // response — not the initial IN_PROGRESS payload.
      final client = _StubQuizClient(
        sessionResponses: [
          summary(
            status: 'IN_PROGRESS',
            correct: 3,
            served: 10,
            target: 10,
          ),
          summary(
            status: 'COMPLETED',
            correct: 3,
            served: 10,
            target: 10,
          ),
        ],
      );

      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      ),),);

      // First fetch returns IN_PROGRESS → screen is still in the
      // retry-delay window and must NOT yet render the score.
      await tester.pump();
      expect(find.text('3 / 10'), findsNothing);

      // Advance past the 500ms retry delay.
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();

      expect(find.text('3 / 10'), findsOneWidget);
      expect(
        client.sessionCalls,
        2,
        reason: 'one initial fetch + one retry on IN_PROGRESS',
      );
    });
  });

  group('VidyaPracticeResultScreen — Phase 3c.full v2 (rich)', () {
    /// Builds a QuizClient whose AuthClient.MockClient handles
    /// /catalog/topics/{id} with the provided label map. Any other
    /// route 500s so accidental network reach is loud.
    _StubQuizClient buildClient({
      required QuizSessionDetail sessionResponse,
      Map<String, String> topicLabels = const {},
    }) {
      final mock = MockClient((req) async {
        final p = req.url.path;
        const prefix = '/catalog/topics/';
        if (p.startsWith(prefix)) {
          final id = p.substring(prefix.length);
          final label = topicLabels[id];
          if (label == null) {
            return http.Response('{}', 404);
          }
          final body =
              '{"id":"$id","subjectId":"s-1","title":"$label","questionCount":50,"tier":"FREE"}';
          return http.Response(body, 200);
        }
        return http.Response('{}', 500);
      });
      final auth = AuthClient(baseUrl: 'http://stub', httpClient: mock);
      final client = _StubQuizClient.withAuth(
        auth: auth,
        sessionResponse: sessionResponse,
      );
      return client;
    }

    QuizItemSummary item({
      required int idx,
      required String topicId,
      required bool isCorrect,
    }) =>
        QuizItemSummary(
          itemIdx: idx,
          questionId: 'q-$idx',
          answered: true,
          isCorrect: isCorrect,
          answerIdx: isCorrect ? 0 : 1,
          correctIdx: 0,
          topicId: topicId,
        );

    QuizSessionDetail summaryWithItems({
      required List<QuizItemSummary> items,
      int target = 5,
      String topicId = 't-1',
    }) {
      var correct = 0;
      for (final it in items) {
        if (it.isCorrect ?? false) correct++;
      }
      return QuizSessionDetail(
        sessionId: 'sess-1',
        userId: 'u-1',
        topicId: topicId,
        mode: 'PRACTICE',
        strategy: 'random',
        status: 'COMPLETED',
        targetCount: target,
        servedCount: items.length,
        correctCount: correct,
        items: items,
      );
    }

    testWidgets('renders per-topic breakdown from items', (tester) async {
      final client = buildClient(
        sessionResponse: summaryWithItems(
          target: 5,
          items: [
            item(idx: 0, topicId: 'mech', isCorrect: true),
            item(idx: 1, topicId: 'mech', isCorrect: false),
            item(idx: 2, topicId: 'mech', isCorrect: true),
            item(idx: 3, topicId: 'thermo', isCorrect: true),
            item(idx: 4, topicId: 'thermo', isCorrect: true),
          ],
          topicId: 'mech',
        ),
        topicLabels: {'mech': 'Mechanics', 'thermo': 'Thermo'},
      );

      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      )));
      await tester.pumpAndSettle();

      // Eyebrow + topic-count rows.
      expect(find.text('BY TOPIC'), findsOneWidget);
      expect(find.text('Mechanics'), findsOneWidget);
      expect(find.text('Thermo'), findsOneWidget);
      // mech: 2 correct of 3 served; thermo: 2 of 2.
      expect(find.text('2 / 3'), findsOneWidget);
      expect(find.text('2 / 2'), findsOneWidget);
    });

    testWidgets(
        'See insights CTA switches the shell to the Insights tab + fires onDone',
        (tester) async {
      // v2 final polish (I1): the CTA no longer pushes a duplicate
      // VidyaInsightsScreen into the Practice tab's navigator. It
      // calls VidyaMainShellScope.switchTo(VidyaShellTab.insights)
      // (canonical pattern, see vidya_home_screen.dart) and then
      // fires onDone() to unwind the Practice navigator stack so the
      // back button doesn't return to this stale result screen.
      final client = buildClient(
        sessionResponse: summaryWithItems(
          target: 2,
          items: [
            item(idx: 0, topicId: 'mech', isCorrect: true),
            item(idx: 1, topicId: 'mech', isCorrect: false),
          ],
          topicId: 'mech',
        ),
        topicLabels: const {'mech': 'Mechanics'},
      );

      VidyaShellTab? switched;
      var doneTaps = 0;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaMainShellScope(
          activeTab: VidyaShellTab.practice,
          switchTo: (t) => switched = t,
          child: VidyaPracticeResultScreen(
            client: client,
            sessionId: 'sess-1',
            onDone: () => doneTaps++,
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(switched, isNull);
      expect(doneTaps, 0);
      await tester.tap(
        find.byKey(const Key('vidya.practice.result.see-insights')),
      );
      await tester.pump();
      // Asserts the new contract: the shell was asked to switch to the
      // Insights tab and the Practice navigator stack was unwound via
      // onDone(). We deliberately do NOT assert find.byType(
      // VidyaInsightsScreen) — the Insights screen lives in the parent
      // shell's IndexedStack, which isn't part of this widget test.
      expect(switched, VidyaShellTab.insights);
      expect(doneTaps, 1);
    });

    testWidgets('empty items list → no breakdown section, just score + Done',
        (tester) async {
      final client = buildClient(
        sessionResponse: QuizSessionDetail(
          sessionId: 'sess-1',
          userId: 'u-1',
          topicId: 't-1',
          mode: 'PRACTICE',
          strategy: 'random',
          status: 'COMPLETED',
          targetCount: 10,
          servedCount: 0,
          correctCount: 0,
          items: const [],
        ),
      );

      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      )));
      await tester.pumpAndSettle();

      expect(find.text('0 / 10'), findsOneWidget);
      expect(find.text('BY TOPIC'), findsNothing);
      expect(find.text('Done'), findsOneWidget);
    });

    testWidgets(
        'single-topic breakdown is suppressed (redundant with big score)',
        (tester) async {
      // Today's PRACTICE sessions always collapse to one topic because
      // backend itemSummary doesn't yet emit per-item topicId. Rendering
      // a single-row breakdown directly under the big score reads as
      // `Mechanics 7 / 10` under `7 / 10` — zero extra info. Suppress.
      final items = List<QuizItemSummary>.generate(
        10,
        (i) => QuizItemSummary(
          itemIdx: i,
          questionId: 'q-$i',
          answered: true,
          topicId: 't-1',
          isCorrect: i < 7,
          answerIdx: 0,
          correctIdx: i < 7 ? 0 : 1,
        ),
      );
      final client = buildClient(
        sessionResponse: QuizSessionDetail(
          sessionId: 'sess-1',
          userId: 'u-1',
          topicId: 't-1',
          mode: 'PRACTICE',
          strategy: 'random',
          status: 'COMPLETED',
          targetCount: 10,
          servedCount: 10,
          correctCount: 7,
          items: items,
        ),
      );

      await tester.pumpWidget(_harness(VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      )));
      await tester.pumpAndSettle();

      // Score + Done still render
      expect(find.text('7 / 10'), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);
      // But the single-row breakdown is suppressed
      expect(find.text('BY TOPIC'), findsNothing);
    });
  });

  group('computeTopicBreakdown (pure)', () {
    QuizItemSummary mk({
      required int idx,
      String? topicId,
      required bool isCorrect,
    }) =>
        QuizItemSummary(
          itemIdx: idx,
          questionId: 'q-$idx',
          answered: true,
          isCorrect: isCorrect,
          answerIdx: isCorrect ? 0 : 1,
          correctIdx: 0,
          topicId: topicId,
        );

    test('groups items by topicId and counts correct/total', () {
      final rows = computeTopicBreakdown([
        mk(idx: 0, topicId: 'mech', isCorrect: true),
        mk(idx: 1, topicId: 'mech', isCorrect: false),
        mk(idx: 2, topicId: 'mech', isCorrect: true),
        mk(idx: 3, topicId: 'thermo', isCorrect: true),
        mk(idx: 4, topicId: 'thermo', isCorrect: true),
      ]);
      expect(rows.length, 2);
      final byId = {for (final r in rows) r.topicId: r};
      expect(byId['mech']!.correct, 2);
      expect(byId['mech']!.total, 3);
      expect(byId['thermo']!.correct, 2);
      expect(byId['thermo']!.total, 2);
    });

    test('orders by total descending, then topicId alphabetical', () {
      final rows = computeTopicBreakdown([
        // 'zeta' has 2, 'alpha' has 2, 'mid' has 1, 'mech' has 3.
        mk(idx: 0, topicId: 'mech', isCorrect: true),
        mk(idx: 1, topicId: 'mech', isCorrect: true),
        mk(idx: 2, topicId: 'mech', isCorrect: false),
        mk(idx: 3, topicId: 'zeta', isCorrect: true),
        mk(idx: 4, topicId: 'zeta', isCorrect: true),
        mk(idx: 5, topicId: 'alpha', isCorrect: false),
        mk(idx: 6, topicId: 'alpha', isCorrect: false),
        mk(idx: 7, topicId: 'mid', isCorrect: true),
      ]);
      // mech (3) > alpha (2, tied) > zeta (2, tied) > mid (1).
      expect(rows.map((r) => r.topicId).toList(),
          ['mech', 'alpha', 'zeta', 'mid']);
    });

    test('handles empty list', () {
      expect(computeTopicBreakdown(const []), isEmpty);
    });
  });
}
