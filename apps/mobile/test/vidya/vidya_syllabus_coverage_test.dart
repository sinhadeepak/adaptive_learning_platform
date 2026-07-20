// Phase 4 — VidyaSyllabusCoverageScreen tests. Mocks the coverage
// endpoint and asserts the overall headline + subject pills + chapter
// status rows render.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_syllabus_coverage_screen.dart';

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

Future<AuthClient> _auth({Map<String, dynamic>? coverage}) async {
  final mock = MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.contains('/analytics/syllabus-coverage/')) {
      if (coverage == null) return http.Response('{}', 404);
      return http.Response(jsonEncode(coverage), 200,
          headers: {'content-type': 'application/json'});
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

Map<String, dynamic> _coverage() => {
      'examId': 'e1',
      'overallPct': 42,
      'totalTopics': 50,
      'masteredTopics': 21,
      'subjects': [
        {
          'subjectId': 's1',
          'name': 'Physics',
          'totalChapters': 2,
          'coveredChapters': 1,
          'totalTopics': 10,
          'attemptedTopics': 6,
          'masteredTopics': 4,
          'chapters': [
            {
              'chapterId': 'ch1',
              'name': 'Mechanics',
              'totalTopics': 5,
              'attemptedTopics': 5,
              'masteredTopics': 4,
              'avgEwa': 0.72,
              'status': 'mastered',
            },
            {
              'chapterId': 'ch2',
              'name': 'Optics',
              'totalTopics': 5,
              'attemptedTopics': 1,
              'masteredTopics': 0,
              'avgEwa': 0.18,
              'status': 'developing',
            },
          ],
        },
      ],
    };

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('renders overall coverage + subject + chapter statuses',
      (tester) async {
    final auth = await _auth(coverage: _coverage());
    await tester.pumpWidget(
      _harness(VidyaSyllabusCoverageScreen(auth: auth, examId: 'e1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('42%'), findsOneWidget);
    expect(find.textContaining('21/50 topics mastered'), findsOneWidget);
    expect(find.text('Physics'), findsWidgets);
    expect(find.text('Mechanics'), findsOneWidget);
    expect(find.text('Optics'), findsOneWidget);
    expect(find.text('MASTERED'), findsOneWidget);
    expect(find.text('DEVELOPING'), findsOneWidget);
  });

  testWidgets('empty state when the endpoint has no data', (tester) async {
    final auth = await _auth();
    await tester.pumpWidget(
      _harness(VidyaSyllabusCoverageScreen(auth: auth, examId: 'e1')),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No syllabus coverage yet'), findsOneWidget);
  });
}
