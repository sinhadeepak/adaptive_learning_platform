// Phase 4 — VidyaPyqScreen tests. Mocks subjects + PYQ frequency and
// asserts the chapter-frequency list renders; then the read-only drill
// (questions + reveal answer).

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_pyq_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

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

Future<AuthClient> _auth() async {
  final mock = MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.contains('/catalog/exams/') && path.endsWith('/subjects')) {
      return http.Response(
        jsonEncode([
          {'id': 's1', 'examId': 'e1', 'name': 'Physics', 'topicCount': 4},
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/content/pyqs/frequency')) {
      return http.Response(
        jsonEncode({
          'examId': 'e1',
          'subjectId': 's1',
          'chapters': [
            {
              'topicId': 't1',
              'topicTitle': 'Kinematics',
              'yearCounts': {'2024': 3, '2023': 2},
              'total': 5,
            },
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/content/pyqs')) {
      return http.Response(
        jsonEncode({
          'items': [
            {
              'id': 'q1',
              'topicId': 't1',
              'stem': 'A ball is thrown upward. What is its acceleration?',
              'choices': ['Zero', 'g downward', 'g upward'],
              'correctIdx': 1,
              'examYear': 2024,
              'paperSession': 'Jan S1',
              'language': 'en',
            },
          ],
          'total': 1,
          'page': 1,
          'perPage': 50,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('renders subject pill + chapter frequency', (tester) async {
    final auth = await _auth();
    await tester.pumpWidget(_harness(VidyaPyqScreen(auth: auth, examId: 'e1')));
    await tester.pumpAndSettle();

    expect(find.text('Physics'), findsOneWidget);
    expect(find.text('Kinematics'), findsOneWidget);
    expect(find.text('5'), findsOneWidget); // total appearances
  });

  testWidgets('drilling a chapter shows questions + reveals the answer',
      (tester) async {
    final auth = await _auth();
    await tester.pumpWidget(_harness(VidyaPyqScreen(auth: auth, examId: 'e1')));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Kinematics'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('A ball is thrown upward'),
      findsOneWidget,
    );
    // Answer hidden until revealed.
    expect(find.textContaining('Answer:'), findsNothing);
    await tester.tap(find.text('Reveal answer'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Answer: B'), findsOneWidget);
  });
}
