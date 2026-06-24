// Phase C4 — VidyaStudyPlanScreen. Native weekly plan view (day-grouped
// sessions) + generate-when-absent, on the real StudyPlanClient endpoints
// (/plans/active, /plans/generate).

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_study_plan_screen.dart';

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

Map<String, dynamic> _plan() => {
      'id': 'p1',
      'user_id': 'u1',
      'week_start': '2026-06-22',
      'daily_minutes_goal': 60,
      'source': 'ai_initial',
      'status': 'active',
      'sessions': [
        {
          'id': 's1',
          'plan_id': 'p1',
          'day_offset': 0,
          'slot': 'AM',
          'kind': 'practice',
          'expected_minutes': 30,
          'expected_questions': 12,
          'is_required': true,
          'status': 'pending',
          'position': 0,
        },
        {
          'id': 's2',
          'plan_id': 'p1',
          'day_offset': 1,
          'slot': 'PM',
          'kind': 'revision',
          'expected_minutes': 20,
          'expected_questions': 5,
          'is_required': false,
          'status': 'completed',
          'position': 0,
        },
      ],
    };

int generateCount = 0;

MockClient _mock({bool absent = false}) {
  generateCount = 0;
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/plans/active')) {
      if (absent) return http.Response('{}', 404);
      return http.Response(jsonEncode(_plan()), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/plans/generate')) {
      generateCount++;
      return http.Response(jsonEncode(_plan()), 200,
          headers: {'content-type': 'application/json'});
    }
    return http.Response('{}', 404);
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

  testWidgets('renders the active plan grouped by day', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaStudyPlanScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('THIS WEEK'), findsOneWidget);
    expect(find.textContaining('60 min/day goal'), findsOneWidget);
    expect(find.text('DAY 1'), findsOneWidget);
    expect(find.text('DAY 2'), findsOneWidget);
    expect(find.text('Practice'), findsOneWidget);
    expect(find.text('Revision'), findsOneWidget);
    expect(find.text('Regenerate'), findsOneWidget);
  });

  testWidgets('absent plan offers generate, which builds one', (tester) async {
    final auth = await _loggedIn(_mock(absent: true));
    await tester.pumpWidget(_harness(VidyaStudyPlanScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.textContaining('No study plan yet'), findsOneWidget);
    await tester.tap(find.text('Generate my plan'));
    await tester.pumpAndSettle();
    expect(generateCount, 1);
    expect(find.text('THIS WEEK'), findsOneWidget); // plan now shown
    expect(find.text('DAY 1'), findsOneWidget);
  });
}
