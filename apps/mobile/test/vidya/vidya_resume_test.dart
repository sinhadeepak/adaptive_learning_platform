// Phase B (deferred item) — pause/resume for practice sessions.
//
// Leaving a session persists it as IN_PROGRESS server-side; the Practice
// landing's "Continue where you left off" banner lists those (GET
// /quiz/sessions) and resumes them (the session screen skips start() and
// continues from /next). No backend change needed; mocks are excluded
// (timed).

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/insights/insights_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';

AuthClient _authWithUser(MockClient mock) {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  auth.setUser(User(
    id: 'u-1',
    email: 't@example.com',
    firstName: 'T',
    lastName: 'U',
    role: 'STUDENT',
    onboardingState: 'COMPLETE',
  ));
  return auth;
}

MockClient _mock({List<Map<String, dynamic>>? sessions}) =>
    MockClient((req) async {
      final path = req.url.path;
      if (path == '/quiz/sessions') {
        return http.Response(
          jsonEncode({
            'userId': 'u-1',
            'items': sessions ??
                [
                  {
                    'sessionId': 'sess-1',
                    'topicId': 't1',
                    'mode': 'PRACTICE',
                    'status': 'IN_PROGRESS',
                    'targetCount': 10,
                    'servedCount': 4,
                  },
                ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      // /next etc. 500 → resumed session screen settles to its error banner,
      // but the screen (what we assert) is present.
      return http.Response('{}', 500);
    });

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('resume banner lists an in-progress practice session',
      (tester) async {
    final auth = _authWithUser(_mock());
    await tester.pumpWidget(_harness(VidyaPracticeScreen(
      client: QuizClient(auth: auth),
      insights: InsightsClient(auth: auth),
    )));
    await tester.pumpAndSettle();
    expect(find.text('CONTINUE WHERE YOU LEFT OFF'), findsOneWidget);
    expect(find.textContaining('4 / 10 answered'), findsOneWidget);
    expect(find.text('Resume'), findsOneWidget);
  });

  testWidgets('tapping Resume re-enters the session screen', (tester) async {
    final auth = _authWithUser(_mock());
    await tester.pumpWidget(_harness(VidyaPracticeScreen(
      client: QuizClient(auth: auth),
      insights: InsightsClient(auth: auth),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resume'));
    await tester.pumpAndSettle();
    expect(find.byType(VidyaPracticeSessionScreen), findsOneWidget);
  });

  testWidgets('no banner when there are no in-progress sessions',
      (tester) async {
    final auth = _authWithUser(_mock(sessions: const []));
    await tester.pumpWidget(_harness(VidyaPracticeScreen(
      client: QuizClient(auth: auth),
      insights: InsightsClient(auth: auth),
    )));
    await tester.pumpAndSettle();
    expect(find.text('CONTINUE WHERE YOU LEFT OFF'), findsNothing);
  });

  testWidgets('completed/mock sessions are not offered for resume',
      (tester) async {
    final auth = _authWithUser(_mock(sessions: [
      {
        'sessionId': 's-done',
        'topicId': 't1',
        'mode': 'PRACTICE',
        'status': 'COMPLETED',
        'targetCount': 10,
        'servedCount': 10,
      },
      {
        'sessionId': 's-mock',
        'topicId': 't2',
        'mode': 'MOCK',
        'status': 'IN_PROGRESS',
        'targetCount': 180,
        'servedCount': 20,
      },
    ]));
    await tester.pumpWidget(_harness(VidyaPracticeScreen(
      client: QuizClient(auth: auth),
      insights: InsightsClient(auth: auth),
    )));
    await tester.pumpAndSettle();
    expect(find.text('CONTINUE WHERE YOU LEFT OFF'), findsNothing);
  });
}
