// Phase B — VidyaMocksScreen tests. The mock catalog for the active exam:
// available blueprints (start) + taken attempts (history). Blueprints are
// required; attempts degrade to empty on failure.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mock_session_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mocks_screen.dart';

String _sessionJson() => jsonEncode({
      'user': {
        'id': 'u1',
        'email': 'a@b.com',
        'firstName': 'Aarav',
        'lastName': 'L',
        'role': 'STUDENT',
        'onboardingState': 'ONBOARDED',
      },
      'tokens': {
        'accessToken': 'at',
        'refreshToken': 'rt',
        'expiresAt': 9999999999,
      },
    });

MockClient _mock({
  List<Map<String, dynamic>>? blueprints,
  List<Map<String, dynamic>>? attempts,
  bool failBlueprints = false,
}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/catalog/exam-blueprints')) {
      if (failBlueprints) return http.Response('{}', 500);
      return http.Response(
        jsonEncode({
          'items': blueprints ??
              [
                {
                  'id': 'bp1',
                  'examId': 'e1',
                  'name': 'NEET Full Mock 1',
                  'totalQuestions': 180,
                  'totalMinutes': 200,
                  'marksCorrect': 4,
                  'marksNegative': 1.0,
                  'sections': [],
                },
              ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/profile/mock-attempts')) {
      return http.Response(
        jsonEncode({'items': attempts ?? []}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    // Mock session start 500s → session screen settles to its error banner.
    return http.Response('{}', 500);
  });
}

Future<AuthClient> _loggedIn(MockClient mock) async {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('renders available blueprint + empty attempts copy',
      (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(
      VidyaMocksScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('AVAILABLE'), findsOneWidget);
    expect(find.text('NEET Full Mock 1'), findsOneWidget);
    expect(find.textContaining('180 questions'), findsOneWidget);
    expect(find.text('Start mock'), findsOneWidget);
    expect(find.textContaining('No attempts yet'), findsOneWidget);
  });

  testWidgets('renders a taken attempt with score + accuracy', (tester) async {
    final auth = await _loggedIn(_mock(attempts: [
      {
        'id': 'm1',
        'examCode': 'NEET',
        'examName': 'NEET',
        'rawScore': 540,
        'maxMarks': 720,
        'accuracy': 0.82,
        'totalQuestions': 180,
        'nCorrect': 148,
        'nWrong': 30,
        'nUnanswered': 2,
        'createdAt': '2026-05-25T00:00:00Z',
      },
    ]));
    await tester.pumpWidget(_harness(
      VidyaMocksScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();
    expect(find.text('540/720'), findsOneWidget);
    expect(find.text('82% acc'), findsOneWidget);
  });

  testWidgets('Start mock launches the mock session', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(
      VidyaMocksScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start mock'));
    await tester.pumpAndSettle();
    expect(find.byType(VidyaMockSessionScreen), findsOneWidget);
  });

  testWidgets('no published blueprints shows the empty-available copy',
      (tester) async {
    // examBlueprints returns [] on a non-200 (it doesn't throw), so a failed
    // fetch lands on the "no blueprints" empty copy, not an error state.
    final auth = await _loggedIn(_mock(failBlueprints: true));
    await tester.pumpWidget(_harness(
      VidyaMocksScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('No mock blueprints'), findsOneWidget);
  });
}
