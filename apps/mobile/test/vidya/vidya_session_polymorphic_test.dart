// Phase 1 — proves the Vidya practice session screen routes non-MCQ
// question types through PolymorphicRenderer and submits a structured
// `responsePayload` (not a positional `answerIdx`). This is the
// behavioral change that fixes the headline bug where all 23 non-MCQ
// types collapsed to broken/empty radios on the live track.

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

/// Stub that serves one item then completes, capturing the answer call.
class _StubQuizClient extends QuizClient {
  _StubQuizClient(this._first)
      : super(
          auth: AuthClient(
            baseUrl: 'http://stub',
            httpClient: MockClient((req) async => http.Response('{}', 500)),
          ),
        );

  final QuizItem _first;
  bool _served = false;
  int? lastAnswerIdx;
  Map<String, dynamic>? lastResponsePayload;

  @override
  Future<QuizSessionStart> start({
    required String topicId,
    required String userId,
    String mode = 'PRACTICE',
    Map<String, dynamic> extraFields = const {},
  }) async =>
      QuizSessionStart(
        sessionId: 'sess-1',
        strategy: 'random',
        mode: mode,
        expiresAt: DateTime.now().add(const Duration(minutes: 15)),
      );

  @override
  Future<QuizNext> next(String sessionId) async {
    if (!_served) {
      _served = true;
      return QuizNext(
        sessionId: sessionId,
        status: 'IN_PROGRESS',
        done: false,
        item: _first,
      );
    }
    return QuizNext(sessionId: sessionId, status: 'COMPLETED', done: true);
  }

  @override
  Future<QuizAnswer> answer(
    String sessionId, {
    required int itemIdx,
    required int answerIdx,
    Map<String, dynamic>? responsePayload,
  }) async {
    lastAnswerIdx = answerIdx;
    lastResponsePayload = responsePayload;
    return QuizAnswer(
      sessionId: sessionId,
      itemIdx: itemIdx,
      isCorrect: true,
      correctIdx: 0,
      servedCount: 1,
      correctCount: 1,
    );
  }
}

void main() {
  testWidgets(
    'non-MCQ item renders via PolymorphicRenderer and submits a responsePayload',
    (tester) async {
      final item = QuizItem(
        itemIdx: 0,
        questionId: 'q-poly',
        stem: 'Select all that apply.',
        choices: const [], // non-MCQ items carry no positional choices
        questionType: 'MCQ_MULTI',
        payload: const {
          'stem': 'Select all that apply.',
          'options': [
            {'id': 'A', 'text': 'Alpha'},
            {'id': 'B', 'text': 'Bravo'},
          ],
        },
      );
      final client = _StubQuizClient(item);
      var completed = false;

      final widget = _harness(
        VidyaPracticeSessionScreen(
          client: client,
          topicId: 't-1',
          userId: 'u-1',
          onCompleted: (_) => completed = true,
          onBack: () {},
        ),
      );
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      // The renderer (not the lettered-choice MCQ list) is on screen:
      // its option labels come from payload.options.
      expect(find.text('Alpha'), findsOneWidget);
      expect(find.text('Bravo'), findsOneWidget);

      // Pick an option — the renderer emits {selected_ids:[...]} which the
      // screen holds as the response payload.
      await tester.tap(find.text('Alpha'));
      await tester.pump();

      // Submit.
      await tester.tap(find.byKey(const Key('vidya.practice.session.submit')));
      await tester.pumpAndSettle();

      // The structured payload was forwarded; answerIdx is the inert 0.
      expect(client.lastResponsePayload, isNotNull);
      expect(client.lastResponsePayload!['selected_ids'], contains('A'));
      expect(client.lastAnswerIdx, 0);
      expect(completed, isTrue);
    },
  );
}
