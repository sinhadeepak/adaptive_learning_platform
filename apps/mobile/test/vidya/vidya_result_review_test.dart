// Phase 2 — per-question review + KPI row on the Vidya result screen.
//
// Asserts the new results fidelity: a KPI row (Correct/Wrong/Skipped/
// Accuracy) derived from item summaries, a "REVIEW QUESTIONS" list with
// per-item status chips, and a tap-through drawer showing the full stem
// + chosen-vs-correct choices.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_result_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

class _StubQuizClient extends QuizClient {
  _StubQuizClient(this._detail)
      : super(
          auth: AuthClient(
            baseUrl: 'http://stub',
            httpClient: MockClient((req) async => http.Response('{}', 500)),
          ),
        );
  final QuizSessionDetail _detail;

  @override
  Future<QuizSessionDetail> session(String sessionId) async => _detail;
}

QuizSessionDetail _detailWithMixedItems() => QuizSessionDetail(
      sessionId: 'sess-1',
      userId: 'u-1',
      topicId: 't-1',
      mode: 'PRACTICE',
      strategy: 'random',
      status: 'COMPLETED',
      targetCount: 3,
      servedCount: 2,
      correctCount: 1,
      items: [
        QuizItemSummary(
          itemIdx: 0,
          questionId: 'q0',
          answered: true,
          isCorrect: true,
          answerIdx: 1,
          correctIdx: 1,
          stem: 'What is the capital of France?',
          choices: const ['Berlin', 'Paris', 'Rome'],
          explanation: 'Paris is the capital of France.',
        ),
        QuizItemSummary(
          itemIdx: 1,
          questionId: 'q1',
          answered: true,
          isCorrect: false,
          answerIdx: 0,
          correctIdx: 2,
          stem: 'Which gas do plants absorb?',
          choices: const ['Oxygen', 'Nitrogen', 'Carbon dioxide'],
        ),
        QuizItemSummary(
          itemIdx: 2,
          questionId: 'q2',
          answered: false,
          stem: 'Skipped question stem.',
        ),
      ],
    );

void main() {
  testWidgets('KPI row + review list render from item summaries',
      (tester) async {
    final client = _StubQuizClient(_detailWithMixedItems());
    final widget = _harness(
      VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      ),
    );
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    // KPI row labels.
    expect(find.text('Correct'), findsOneWidget);
    expect(find.text('Wrong'), findsOneWidget);
    expect(find.text('Skipped'), findsOneWidget);
    expect(find.text('Accuracy'), findsOneWidget);

    // Review section + per-item status chips.
    expect(find.text('REVIEW QUESTIONS'), findsOneWidget);
    expect(find.text('CORRECT'), findsOneWidget);
    expect(find.text('WRONG'), findsOneWidget);
    expect(find.text('SKIPPED'), findsOneWidget);
  });

  testWidgets('tapping a review row opens the drawer with full stem + choices',
      (tester) async {
    final client = _StubQuizClient(_detailWithMixedItems());
    final widget = _harness(
      VidyaPracticeResultScreen(
        client: client,
        sessionId: 'sess-1',
        onDone: () {},
      ),
    );
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    // Open the wrong-answer item's drawer.
    await tester.tap(find.text('Which gas do plants absorb?'));
    await tester.pumpAndSettle();

    // Drawer shows the choices with letters; the explanation is absent
    // for this item (none provided), so just assert the choice text.
    expect(find.text('Carbon dioxide'), findsWidgets);
    expect(find.text('Close'), findsOneWidget);
  });
}
