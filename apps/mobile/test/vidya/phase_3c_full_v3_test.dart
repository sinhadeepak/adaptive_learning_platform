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
}
