// Phase 3a.1 — Vidya home content tests. Mocks the 5 endpoints
// VidyaHomeScreen calls (profile, readiness, streak, dailyActivity,
// mockAttempts) and asserts on the rendered cards. Drives a real
// AuthClient.login() flow to populate auth.user before pumping the
// screen — same pattern as phase_2b_auth_screens_test.dart.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_home_screen.dart';
import 'package:adaptive_learning_mobile/vidya/shell/vidya_main_shell_scope.dart';

Widget _harness(Widget child, {VidyaMainShellScope? scope}) {
  Widget wrapped = child;
  if (scope != null) {
    wrapped = VidyaMainShellScope(
      activeTab: scope.activeTab,
      switchTo: scope.switchTo,
      child: wrapped,
    );
  }
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: Brightness.light,
      persona: VidyaPersona.aspirant,
      density: VidyaDensity.regular,
    ),
    home: Scaffold(body: wrapped),
  );
}

String _sessionJson({String firstName = 'Aarav'}) => jsonEncode({
      'user': {
        'id': 'u1',
        'email': 'a@b.com',
        'firstName': firstName,
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

// Build a MockClient that serves: /auth/login + the 5 home endpoints
// with the supplied values. Each home endpoint is independently
// overridable so error-path tests can throw selectively.
MockClient _homeMocks({
  double? readiness = 0.728,
  int? streak = 12,
  int? questionsToday = 3,
  int mockCount = 14,
  String firstName = 'Aarav',
  bool failReadiness = false,
}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(firstName: firstName), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me')) {
      return http.Response(
        jsonEncode({
          'user': {
            'firstName': firstName,
            'lastName': 'L',
            'email': 'a@b.com',
          },
          'preferences': {'language': 'en'},
          'exams': [],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/readiness')) {
      // Throw inside the responder so api.readiness() rejects and
      // the screen's .catchError((_) => null) path is exercised.
      if (failReadiness) throw Exception('boom');
      return http.Response(
        jsonEncode({'score': readiness ?? 0.0, 'nTopics': 6}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/streak')) {
      return http.Response(
        jsonEncode({
          'currentStreak': streak ?? 0,
          'longestStreak': streak ?? 0,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/daily-activity')) {
      return http.Response(
        jsonEncode({
          'activity': [
            {
              'date': '2026-05-26',
              'sessions': 1,
              'questions': questionsToday ?? 0,
              'minutes': 12,
            }
          ]
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/profile/mock-attempts')) {
      return http.Response(
        jsonEncode({
          'items': List.generate(
              mockCount,
              (i) => {
                    'id': 'm$i',
                    'examCode': 'NEET',
                    'examName': 'NEET',
                    'rawScore': 0,
                    'maxMarks': 720,
                    'accuracy': 0.5,
                    'totalQuestions': 180,
                    'nCorrect': 90,
                    'nWrong': 90,
                    'nUnanswered': 0,
                    'createdAt': '2026-05-25T00:00:00Z',
                  })
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 404);
  });
}

Future<AuthClient> _loggedInAuth(MockClient mock) async {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

void main() {
  setUp(() {
    // Without this, the secure-storage platform channel that AuthClient
    // calls during _persist (after login) hangs the test indefinitely.
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('VidyaHomeScreen — Phase 3a.1', () {
    testWidgets('renders greeting with firstName once loaded', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(firstName: 'Aarav'));
      await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('Hi, Aarav.'), findsOneWidget);
    });

    testWidgets('readiness card scales 0.728 -> "655 / 900"', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(readiness: 0.728));
      await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('READINESS'), findsOneWidget);
      // 0.728 * 900 = 655.2 -> rounded to 655
      expect(find.text('655 / 900'), findsOneWidget);
    });

    testWidgets('stats row shows STREAK / TODAY / MOCKS values', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(
        streak: 12,
        questionsToday: 3,
        mockCount: 14,
      ));
      await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('STREAK'), findsOneWidget);
      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('MOCKS'), findsOneWidget);
      expect(find.text('12 d'), findsOneWidget);
      expect(find.text('3 / 5'), findsOneWidget);
      expect(find.text('14'), findsOneWidget);
    });

    testWidgets('next session Start practice routes via VidyaMainShellScope',
        (tester) async {
      final auth = await _loggedInAuth(_homeMocks());
      VidyaShellTab? switched;
      final scope = VidyaMainShellScope(
        activeTab: VidyaShellTab.home,
        switchTo: (t) => switched = t,
        child: const SizedBox(),
      );
      await tester.pumpWidget(_harness(
        VidyaHomeScreen(auth: auth),
        scope: scope,
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Start practice'));
      await tester.pumpAndSettle();
      expect(switched, VidyaShellTab.practice);
    });

    testWidgets('readiness fetch failure keeps other cards', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(failReadiness: true));
      await tester.pumpWidget(_harness(VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      // Readiness shows em-dash placeholder
      expect(find.text('— / 900'), findsOneWidget);
      // Stats row still renders
      expect(find.text('STREAK'), findsOneWidget);
    });
  });
}
