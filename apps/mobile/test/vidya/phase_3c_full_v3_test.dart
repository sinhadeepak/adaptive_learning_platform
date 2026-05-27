// Phase 3c.full v3 — Task 2: VidyaMockIntroScreen widget tests.
//
// Mirrors the _StubInsightsClient pattern from phase_3c_full_v2_test.dart
// but stubs ApiClient via the `apiOverride` constructor seam on
// VidyaMockIntroScreen (parallel to how VidyaScreeningQuizScreen accepts
// a client override). AuthClient gets a MockClient returning 500s so even
// if the screen short-circuits past the stub it can't hit the wire.
//
// Task 3 will extend this file with VidyaMockSessionScreen coverage; the
// `Phase 3c.full v3` group is therefore the shared home for v3 tests.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mock_intro_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mock_session_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

ExamBlueprint _bp({
  String id = 'bp-1',
  String examId = 'exam-jee-main',
  String name = 'JEE Main 2025 — Paper 1',
  int totalQuestions = 75,
  int totalMinutes = 180,
  int marksCorrect = 4,
  double marksNegative = 1,
  int sectionCount = 3,
}) =>
    ExamBlueprint(
      id: id,
      examId: examId,
      name: name,
      totalQuestions: totalQuestions,
      totalMinutes: totalMinutes,
      marksCorrect: marksCorrect,
      marksNegative: marksNegative,
      sections: List<Map<String, dynamic>>.generate(
        sectionCount,
        (i) => {
          'section_id': 'sec-$i',
          'name': 'Section ${i + 1}',
          'n_questions': (totalQuestions / sectionCount).round(),
          'n_minutes': (totalMinutes / sectionCount).round(),
        },
      ),
      interSectionNavigation: true,
      perSectionTimeLocked: false,
      kind: 'OFFICIAL',
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
    );

/// Stub ApiClient. We need to extend the real class so the screen can
/// invoke `examBlueprints` polymorphically. AuthClient gets a MockClient
/// returning 500s so accidental real-network calls are loud, not silent.
class _StubApiClient extends ApiClient {
  _StubApiClient({
    List<ExamBlueprint>? blueprints,
    Object? blueprintsError,
  })  : _blueprints = blueprints,
        _blueprintsError = blueprintsError,
        super(AuthClient(
          baseUrl: 'http://stub',
          httpClient: MockClient((req) async => http.Response('{}', 500)),
        ));

  List<ExamBlueprint>? _blueprints;
  Object? _blueprintsError;
  int blueprintsCalls = 0;
  String? lastExamId;

  void setBlueprints(List<ExamBlueprint> bps) {
    _blueprints = bps;
  }

  void clearError() {
    _blueprintsError = null;
  }

  @override
  Future<List<ExamBlueprint>> examBlueprints(String examId) async {
    blueprintsCalls++;
    lastExamId = examId;
    if (_blueprintsError != null) throw _blueprintsError!;
    return _blueprints ?? const [];
  }
}

/// Slim QuizClient stub — the mock intro screen only needs `auth` to
/// build its default ApiClient. Tests inject `apiOverride` so this auth
/// instance is never actually exercised, but we still wire it to a
/// 500-MockClient as a safety net.
QuizClient _quizStub() => QuizClient(
      auth: AuthClient(
        baseUrl: 'http://stub',
        httpClient: MockClient((req) async => http.Response('{}', 500)),
      ),
    );

void main() {
  group('VidyaMockIntroScreen — Phase 3c.full v3', () {
    testWidgets(
        'fetches blueprints on mount and renders first blueprint metadata',
        (tester) async {
      final api = _StubApiClient(blueprints: [
        _bp(),
        _bp(id: 'bp-2', name: 'JEE Main 2025 — Paper 2'),
      ]);

      await tester.pumpWidget(_harness(VidyaMockIntroScreen(
        client: _quizStub(),
        userId: 'u-1',
        examId: 'exam-jee-main',
        apiOverride: api,
        onStart: ({
          required String blueprintId,
          required String blueprintName,
          required int itemCount,
          required int totalMinutes,
        }) {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();

      expect(api.blueprintsCalls, 1);
      expect(api.lastExamId, 'exam-jee-main');
      expect(find.text('MOCK TEST'), findsOneWidget);
      expect(find.text('JEE Main 2025 — Paper 1'), findsOneWidget);
      expect(find.text('75 questions · 180 minutes'), findsOneWidget);
      expect(
        find.text('+4 / −1 marking · 3 sections'),
        findsOneWidget,
      );
      expect(find.text('Start mock test'), findsOneWidget);
    });

    testWidgets('empty blueprints → empty-state copy + Back CTA',
        (tester) async {
      final api = _StubApiClient(blueprints: const []);

      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaMockIntroScreen(
        client: _quizStub(),
        userId: 'u-1',
        examId: 'exam-jee-main',
        apiOverride: api,
        onStart: ({
          required String blueprintId,
          required String blueprintName,
          required int itemCount,
          required int totalMinutes,
        }) {},
        onBack: () => backTaps++,
      )));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Mock tests unlock'),
        findsOneWidget,
      );
      expect(find.text('Start mock test'), findsNothing);
      await tester.tap(find.text('Back'));
      await tester.pump();
      expect(backTaps, 1);
    });

    testWidgets('blueprint fetch error → VidyaBanner + Retry', (tester) async {
      final api = _StubApiClient(blueprintsError: Exception('boom'));

      await tester.pumpWidget(_harness(VidyaMockIntroScreen(
        client: _quizStub(),
        userId: 'u-1',
        examId: 'exam-jee-main',
        apiOverride: api,
        onStart: ({
          required String blueprintId,
          required String blueprintName,
          required int itemCount,
          required int totalMinutes,
        }) {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();

      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(api.blueprintsCalls, 1);

      api.clearError();
      api.setBlueprints([_bp()]);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.text('JEE Main 2025 — Paper 1'), findsOneWidget);
      expect(api.blueprintsCalls, 2);
    });

    testWidgets('Start CTA fires onStart with blueprint metadata',
        (tester) async {
      final api = _StubApiClient(blueprints: [_bp()]);

      String? startedId;
      String? startedName;
      int? startedItemCount;
      int? startedMinutes;
      await tester.pumpWidget(_harness(VidyaMockIntroScreen(
        client: _quizStub(),
        userId: 'u-1',
        examId: 'exam-jee-main',
        apiOverride: api,
        onStart: ({
          required String blueprintId,
          required String blueprintName,
          required int itemCount,
          required int totalMinutes,
        }) {
          startedId = blueprintId;
          startedName = blueprintName;
          startedItemCount = itemCount;
          startedMinutes = totalMinutes;
        },
        onBack: () {},
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start mock test'));
      await tester.pump();

      expect(startedId, 'bp-1');
      expect(startedName, 'JEE Main 2025 — Paper 1');
      expect(startedItemCount, 75);
      expect(startedMinutes, 180);
    });

    testWidgets('close (✕) fires onBack', (tester) async {
      final api = _StubApiClient(blueprints: [_bp()]);

      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaMockIntroScreen(
        client: _quizStub(),
        userId: 'u-1',
        examId: 'exam-jee-main',
        apiOverride: api,
        onStart: ({
          required String blueprintId,
          required String blueprintName,
          required int itemCount,
          required int totalMinutes,
        }) {},
        onBack: () => backTaps++,
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      expect(backTaps, 1);
    });
  });

  group('VidyaMockSessionScreen — Phase 3c.full v3', () {
    testWidgets('starts session from blueprint on mount and shows Q1',
        (tester) async {
      final qc = _StubQuizClient(
        sections: const [
          ('sec-phys', 'Physics', 2),
          ('sec-chem', 'Chemistry', 1),
        ],
        items: [
          _qItem(0, 'Q1 stem', const ['alpha', 'beta', 'gamma', 'delta']),
          _qItem(1, 'Q2 stem', const ['alpha', 'beta', 'gamma', 'delta']),
          _qItem(2, 'Q3 stem', const ['alpha', 'beta', 'gamma', 'delta']),
        ],
      );

      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE Main 2025 — Paper 1',
        userId: 'u-1',
        itemCount: 3,
        totalMinutes: 3,
        onCompleted: (_) {},
        onBack: () {},
      )));
      // pump twice so start + next both complete.
      await tester.pump();
      await tester.pump();

      expect(qc.startCalls, 1);
      expect(qc.lastBlueprintId, 'bp-1');
      expect(find.text('JEE Main 2025 — Paper 1'), findsOneWidget);
      expect(find.text('Q1 stem'), findsOneWidget);
      expect(find.text('Question 1 of 3'), findsOneWidget);
      expect(find.text('Section: Physics'), findsOneWidget);

      // Drain the screen so the periodic timer doesn't leak across tests.
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('countdown timer ticks down by 1 second', (tester) async {
      final qc = _StubQuizClient(
        sections: const [('sec-phys', 'Physics', 3)],
        items: [_qItem(0, 'Q1', const ['alpha', 'beta', 'gamma', 'delta'])],
      );

      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE',
        userId: 'u-1',
        itemCount: 3,
        totalMinutes: 3,
        onCompleted: (_) {},
        onBack: () {},
      )));
      await tester.pump();
      await tester.pump();

      // Initial countdown should read 03:00:00. Pump one second twice
      // and assert the seconds tick down deterministically.
      expect(find.text('00:03:00'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('00:02:59'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('00:02:58'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('timer expiry shows "Time\'s up" banner (no auto-submit)',
        (tester) async {
      final qc = _StubQuizClient(
        sections: const [('sec-a', 'Section A', 1)],
        items: [_qItem(0, 'Q1', const ['alpha', 'beta', 'gamma', 'delta'])],
      );

      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE',
        userId: 'u-1',
        itemCount: 1,
        // 1 minute so the test can advance the clock to expiry quickly.
        totalMinutes: 1,
        onCompleted: (_) {},
        onBack: () {},
      )));
      await tester.pump();
      await tester.pump();

      // Advance 60 seconds — the timer should hit 0 and surface the
      // banner without auto-submitting (the question stem stays).
      await tester.pump(const Duration(seconds: 60));
      expect(find.text('00:00:00'), findsOneWidget);
      expect(find.textContaining("Time's up"), findsOneWidget);
      expect(find.text('Q1'), findsOneWidget);
      expect(qc.submitCalls, 0);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('progress shows Question X of Y · Section <name>',
        (tester) async {
      final qc = _StubQuizClient(
        sections: const [
          ('sec-phys', 'Physics', 1),
          ('sec-chem', 'Chemistry', 1),
        ],
        items: [
          _qItem(0, 'Q1', const ['alpha', 'beta', 'gamma', 'delta']),
          _qItem(1, 'Q2', const ['alpha', 'beta', 'gamma', 'delta']),
        ],
      );

      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE',
        userId: 'u-1',
        itemCount: 2,
        totalMinutes: 3,
        onCompleted: (_) {},
        onBack: () {},
      )));
      await tester.pump();
      await tester.pump();

      expect(find.text('Question 1 of 2'), findsOneWidget);
      expect(find.text('Section: Physics'), findsOneWidget);

      // Answer Q1 → advance to Q2 → progress + section should update.
      await tester.tap(find.text('alpha'));
      await tester.pump();
      await tester.tap(find.text('Submit answer'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Question 2 of 2'), findsOneWidget);
      expect(find.text('Section: Chemistry'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('answer + next advances to next question', (tester) async {
      final qc = _StubQuizClient(
        sections: const [('sec-a', 'Section A', 2)],
        items: [
          _qItem(0, 'Q1 stem', const ['alpha', 'beta', 'gamma', 'delta']),
          _qItem(1, 'Q2 stem', const ['alpha', 'beta', 'gamma', 'delta']),
        ],
      );

      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE',
        userId: 'u-1',
        itemCount: 2,
        totalMinutes: 3,
        onCompleted: (_) {},
        onBack: () {},
      )));
      await tester.pump();
      await tester.pump();

      expect(find.text('Q1 stem'), findsOneWidget);

      await tester.tap(find.text('beta'));
      await tester.pump();
      await tester.tap(find.text('Submit answer'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Q1 stem'), findsNothing);
      expect(find.text('Q2 stem'), findsOneWidget);
      expect(qc.answerCalls, 1);
      expect(qc.lastAnswerIdx, 1);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('completion fires onCompleted with sessionId', (tester) async {
      final qc = _StubQuizClient(
        sessionId: 'sess-99',
        sections: const [('sec-a', 'Section A', 1)],
        items: [
          _qItem(0, 'Only Q', const ['alpha', 'beta', 'gamma', 'delta']),
        ],
      );

      String? completedId;
      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE',
        userId: 'u-1',
        itemCount: 1,
        totalMinutes: 3,
        onCompleted: (sid) => completedId = sid,
        onBack: () {},
      )));
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('alpha'));
      await tester.pump();
      await tester.tap(find.text('Submit answer'));
      await tester.pump();
      await tester.pump();

      expect(completedId, 'sess-99');

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('close (✕) → confirm dialog → Exit fires onBack',
        (tester) async {
      final qc = _StubQuizClient(
        sections: const [('sec-a', 'Section A', 1)],
        items: [_qItem(0, 'Q1', const ['alpha', 'beta', 'gamma', 'delta'])],
      );

      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaMockSessionScreen(
        client: qc,
        blueprintId: 'bp-1',
        blueprintName: 'JEE',
        userId: 'u-1',
        itemCount: 1,
        totalMinutes: 3,
        onCompleted: (_) {},
        onBack: () => backTaps++,
      )));
      await tester.pump();
      await tester.pump();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      expect(find.text('Exit mock test?'), findsOneWidget);

      // Cancel keeps us in the session.
      await tester.tap(find.text('Cancel'));
      await tester.pump();
      expect(backTaps, 0);
      expect(find.text('Q1'), findsOneWidget);

      // Re-open and confirm Exit this time.
      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      await tester.tap(find.text('Exit'));
      await tester.pump();
      expect(backTaps, 1);

      await tester.pumpWidget(const SizedBox());
    });
  });
}

QuizItem _qItem(int idx, String stem, List<String> choices) => QuizItem(
      itemIdx: idx,
      questionId: 'q-$idx',
      stem: stem,
      choices: choices,
    );

/// Stub QuizClient for the Mock session screen. Records calls and serves
/// canned `startFromBlueprint` / `next` / `answer` responses without
/// hitting the wire.
class _StubQuizClient extends QuizClient {
  _StubQuizClient({
    String sessionId = 'sess-1',
    required List<(String, String, int)> sections, // (id, name, nComposed)
    required List<QuizItem> items,
  })  : _sessionId = sessionId,
        _sections = sections,
        _items = items,
        super(
          auth: AuthClient(
            baseUrl: 'http://stub',
            httpClient: MockClient((req) async => http.Response('{}', 500)),
          ),
        );

  final String _sessionId;
  final List<(String, String, int)> _sections;
  final List<QuizItem> _items;
  int _nextIdx = 0;

  int startCalls = 0;
  int answerCalls = 0;
  int submitCalls = 0;
  String? lastBlueprintId;
  int? lastAnswerIdx;

  @override
  Future<QuizSessionStartFromBlueprint> startFromBlueprint({
    required String blueprintId,
    required String userId,
    int attemptIdx = 0,
  }) async {
    startCalls++;
    lastBlueprintId = blueprintId;
    return QuizSessionStartFromBlueprint(
      sessionId: _sessionId,
      blueprintId: blueprintId,
      blueprintName: 'stub',
      mode: 'MOCK_BLUEPRINT',
      status: 'IN_PROGRESS',
      expiresAt: DateTime.now().add(const Duration(hours: 3)),
      itemCount: _items.length,
      totalMinutes: 3,
      marksCorrect: 4,
      marksNegative: 1,
      short: false,
      interSectionNavigation: true,
      perSectionTimeLocked: false,
      sections: _sections
          .map((s) => MockBlueprintSection(
                sectionId: s.$1,
                name: s.$2,
                nRequested: s.$3,
                nComposed: s.$3,
                short: false,
              ))
          .toList(),
    );
  }

  @override
  Future<QuizNext> next(String sessionId) async {
    if (_nextIdx >= _items.length) {
      return QuizNext(sessionId: sessionId, status: 'DONE', done: true);
    }
    final item = _items[_nextIdx];
    _nextIdx += 1;
    return QuizNext(
      sessionId: sessionId,
      status: 'IN_PROGRESS',
      done: false,
      item: item,
    );
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
    return QuizAnswer(
      sessionId: sessionId,
      itemIdx: itemIdx,
      isCorrect: false,
      correctIdx: 0,
      servedCount: _nextIdx,
      correctCount: 0,
    );
  }

  @override
  Future<QuizSession> submit(String sessionId) async {
    submitCalls++;
    return QuizSession(
      sessionId: sessionId,
      status: 'DONE',
      servedCount: _nextIdx,
      correctCount: 0,
      score: 0,
    );
  }
}
