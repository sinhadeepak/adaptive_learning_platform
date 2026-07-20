// Phase B4 — VidyaSessionDeepDiveScreen + QuizClient.perQuestionTime.
// Drives the real GET /quiz/sessions/{id}/per-question-time contract
// (quiz Go service shape: itemIdx/timeSeconds/isCorrect/sectionId/...).

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_session_deep_dive_screen.dart';

Map<String, dynamic> _item({
  required int idx,
  required double time,
  bool? correct,
  String? section,
}) =>
    {
      'itemIdx': idx,
      'questionId': 'q$idx',
      'sectionId': section,
      'timeSeconds': time,
      'isCorrect': correct,
      'answerIdx': correct == null ? null : 0,
      'correctIdx': 0,
      'difficultyB': 0.1,
      'topicId': 't1',
    };

MockClient _mock(List<Map<String, dynamic>> items) => MockClient((req) async {
      if (req.url.path.endsWith('/per-question-time')) {
        return http.Response(
          jsonEncode({'sessionId': 's1', 'items': items}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

QuizClient _client(MockClient mock) =>
    QuizClient(auth: AuthClient(baseUrl: 'http://test', httpClient: mock));

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  test('perQuestionTime parses the quiz-service contract', () async {
    final client = _client(_mock([
      _item(idx: 0, time: 30, correct: true),
      _item(idx: 1, time: 75, correct: false),
      _item(idx: 2, time: 0, correct: null),
    ]));
    final items = await client.perQuestionTime('s1');
    expect(items, hasLength(3));
    expect(items[0].timeSeconds, 30);
    expect(items[0].isCorrect, true);
    expect(items[1].isCorrect, false);
    expect(items[2].answered, false); // null answerIdx
  });

  testWidgets('renders accuracy + avg + slowest tiles', (tester) async {
    final client = _client(_mock([
      _item(idx: 0, time: 30, correct: true),
      _item(idx: 1, time: 90, correct: false),
    ]));
    await tester.pumpWidget(_harness(
      VidyaSessionDeepDiveScreen(client: client, sessionId: 's1'),
    ));
    await tester.pumpAndSettle();
    expect(find.text('ACCURACY'), findsOneWidget);
    expect(find.text('50%'), findsOneWidget); // 1 of 2 correct
    expect(find.text('TIME PER QUESTION'), findsOneWidget);
    expect(find.text('SLOWEST'), findsOneWidget);
    expect(find.text('1m 30s'), findsOneWidget); // 90s slowest
  });

  testWidgets('section breakdown appears for multi-section sessions',
      (tester) async {
    final client = _client(_mock([
      _item(idx: 0, time: 30, correct: true, section: 'Physics'),
      _item(idx: 1, time: 40, correct: false, section: 'Chemistry'),
    ]));
    await tester.pumpWidget(_harness(
      VidyaSessionDeepDiveScreen(client: client, sessionId: 's1'),
    ));
    await tester.pumpAndSettle();
    expect(find.text('BY SECTION'), findsOneWidget);
    expect(find.text('Physics'), findsOneWidget);
    expect(find.text('Chemistry'), findsOneWidget);
  });

  testWidgets('empty state when no items', (tester) async {
    final client = _client(_mock(const []));
    await tester.pumpWidget(_harness(
      VidyaSessionDeepDiveScreen(client: client, sessionId: 's1'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('No per-question timing'), findsOneWidget);
  });
}
