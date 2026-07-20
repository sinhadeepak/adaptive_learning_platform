// Phase B — VidyaMyTestsScreen. The student's authored + AI-suggested
// tests, each launchable; own tests retire via DELETE /mine/{id}.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mock_session_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_my_tests_screen.dart';

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

Map<String, dynamic> _bp(String id, String name, String kind) => {
      'id': id,
      'examId': 'e1',
      'name': name,
      'totalQuestions': 10,
      'totalMinutes': 12,
      'marksCorrect': 4,
      'marksNegative': 1.0,
      'sections': [],
      'kind': kind,
    };

int deleteCount = 0;

MockClient _mock({
  List<Map<String, dynamic>>? mine,
  List<Map<String, dynamic>>? suggested,
}) {
  deleteCount = 0;
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/exam-blueprints/mine')) {
      if (req.method == 'DELETE') {
        deleteCount++;
        return http.Response('', 204);
      }
      return http.Response(
        jsonEncode({
          'items': mine ?? [_bp('bp1', 'My Custom Test', 'CUSTOM')]
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/exam-blueprints/mine/')) {
      // DELETE /mine/{id}
      deleteCount++;
      return http.Response('', 204);
    }
    if (path.endsWith('/ai-suggested/active')) {
      return http.Response(
        jsonEncode({
          'items':
              suggested ?? [_bp('bp2', 'AI Weak-areas Test', 'AI_SUGGESTED')],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 500); // session start
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

  testWidgets('renders own + AI-suggested tests', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaMyTestsScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('YOUR TESTS'), findsOneWidget);
    expect(find.text('My Custom Test'), findsOneWidget);
    expect(find.text('AI-SUGGESTED'), findsOneWidget);
    expect(find.text('AI Weak-areas Test'), findsOneWidget);
  });

  testWidgets('Start launches the mock session', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaMyTestsScreen(auth: auth)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start').first);
    await tester.pumpAndSettle();
    expect(find.byType(VidyaMockSessionScreen), findsOneWidget);
  });

  testWidgets('delete retires an own test and removes the row', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaMyTestsScreen(auth: auth)));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    expect(deleteCount, 1);
    expect(find.text('My Custom Test'), findsNothing);
  });

  testWidgets('empty copy when no tests', (tester) async {
    final auth = await _loggedIn(_mock(mine: const [], suggested: const []));
    await tester.pumpWidget(_harness(VidyaMyTestsScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.textContaining('No saved tests yet'), findsOneWidget);
    expect(find.textContaining('No AI-suggested tests'), findsOneWidget);
  });
}
