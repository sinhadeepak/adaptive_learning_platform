// VidyaHomeScreen tests (Phase 4 rich home). Mocks the endpoints the
// home calls per active exam — profile (+enrolled exams), catalog exams,
// readiness, streak, daily-activity, mock-attempts, guided-next-steps,
// and the IGS today-plan — then asserts on the rendered cards. Drives a
// real AuthClient.login() flow to populate auth.user.

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
import 'package:adaptive_learning_mobile/vidya/state/active_exam_notifier.dart';

Widget _harness(AuthClient auth, Widget child, {VidyaMainShellScope? scope}) {
  Widget wrapped = child;
  if (scope != null) {
    wrapped = VidyaMainShellScope(
      activeTab: scope.activeTab,
      switchTo: scope.switchTo,
      child: wrapped,
    );
  }
  // Home reads the active exam from the app-wide spine. Drive a real
  // notifier off the same mock (profile + catalog) so the enrolled-exam
  // list under test resolves exactly as the shell would resolve it.
  wrapped = VidyaActiveExam(
    notifier: VidyaActiveExamNotifier(auth)..load(),
    child: wrapped,
  );
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

// Serves /auth/login + the home endpoints. `exams` controls the enrolled
// list; `guidedSteps`/`planActions` let plan/next-best tests vary content.
MockClient _homeMocks({
  double? readiness = 0.728,
  int? streak = 12,
  int? questionsToday = 3,
  int mockCount = 14,
  int unreadCount = 0,
  String firstName = 'Aarav',
  bool failReadiness = false,
  List<Map<String, dynamic>>? exams,
  List<Map<String, dynamic>>? guidedSteps,
  List<Map<String, dynamic>>? planActions,
}) {
  final enrolled = exams ??
      [
        {'examId': 'e-neet', 'targetDate': null},
      ];
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(firstName: firstName), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me')) {
      return http.Response(
        jsonEncode({
          'user': {'firstName': firstName, 'lastName': 'L', 'email': 'a@b.com'},
          'preferences': {'language': 'en'},
          'exams': enrolled,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/catalog/exams')) {
      return http.Response(
        jsonEncode([
          {'id': 'e-neet', 'code': 'NEET', 'name': 'NEET'},
          {'id': 'e-cbse', 'code': 'CBSE_9', 'name': 'CBSE 9'},
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/readiness')) {
      if (failReadiness) throw Exception('boom');
      return http.Response(
        jsonEncode({'score': readiness ?? 0.0, 'nTopics': 6}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/streak')) {
      return http.Response(
        jsonEncode(
            {'currentStreak': streak ?? 0, 'longestStreak': streak ?? 0}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/daily-activity')) {
      // Dated "today" so the home's questions-today (derived from today's
      // entry) matches; the home now requests an 84-day window.
      final t = DateTime.now();
      final todayStr = '${t.year}-${t.month.toString().padLeft(2, '0')}-'
          '${t.day.toString().padLeft(2, '0')}';
      return http.Response(
        jsonEncode({
          'activity': [
            {
              'date': todayStr,
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
    if (path.contains('/adaptive/guided-next-steps')) {
      return http.Response(
        jsonEncode({'headline': 'Do this next', 'steps': guidedSteps ?? []}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/today-plan')) {
      return http.Response(
        jsonEncode({
          'user_id': 'u1',
          'exam_id': 'e-neet',
          'total_minutes': 40,
          'plan': planActions ?? [],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/notifications/inbox/') &&
        path.endsWith('/unread-count')) {
      return http.Response(
        jsonEncode({'unreadCount': unreadCount}),
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
    // subjects/topics (topic-title resolution) degrade to 404 -> {} titles.
    return http.Response('{}', 404);
  });
}

Future<AuthClient> _loggedInAuth(MockClient mock) async {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('VidyaHomeScreen', () {
    testWidgets('renders greeting with firstName once loaded', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(firstName: 'Aarav'));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('Hi, Aarav.'), findsOneWidget);
    });

    testWidgets('readiness hero scales 0.728 -> 655 (per active exam)',
        (tester) async {
      final auth = await _loggedInAuth(_homeMocks(readiness: 0.728));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.textContaining('READINESS'), findsOneWidget);
      // 0.728 * 900 = 655.2 -> 655; hero renders score + "/ 900" separately.
      expect(find.text('655'), findsOneWidget);
      expect(find.text('/ 900'), findsOneWidget);
    });

    testWidgets('exam switcher shows when enrolled in 2+ exams',
        (tester) async {
      final auth = await _loggedInAuth(_homeMocks(exams: [
        {'examId': 'e-neet', 'targetDate': null},
        {'examId': 'e-cbse', 'targetDate': null},
      ]));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('NEET'), findsWidgets);
      expect(find.text('CBSE 9'), findsOneWidget);
    });

    testWidgets('stats row shows STREAK / TODAY / MOCKS values',
        (tester) async {
      final auth = await _loggedInAuth(_homeMocks(
        streak: 12,
        questionsToday: 3,
        mockCount: 14,
      ));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('STREAK'), findsOneWidget);
      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('MOCKS'), findsOneWidget);
      expect(find.text('12 d'), findsOneWidget);
      expect(find.text('3 / 5'), findsOneWidget);
      expect(find.text('14'), findsOneWidget);
    });

    testWidgets("today's plan renders IGS actions with done counter",
        (tester) async {
      // The plan card is the last ListView child — give the test a tall
      // surface so it builds without scrolling.
      await tester.binding.setSurfaceSize(const Size(900, 2200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final auth = await _loggedInAuth(_homeMocks(planActions: [
        {
          'action_kind': 'PRACTICE',
          'concept_id': null,
          'blueprint_id': null,
          'question_count': 10,
          'expected_minutes': 15,
          'score': 0.9,
          'rank': 1,
          'rationale': ['weakest topic'],
          'expected_marks_gained': 4,
        },
        {
          'action_kind': 'MOCK',
          'concept_id': null,
          'blueprint_id': 'b1',
          'question_count': null,
          'expected_minutes': 90,
          'score': 0.7,
          'rank': 2,
          'rationale': ['exam sim'],
          'expected_marks_gained': 8,
        },
      ]));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text("TODAY'S PLAN"), findsOneWidget);
      expect(find.text('0/2 done'), findsOneWidget);
      expect(find.text('Practice · 10 Qs'), findsOneWidget);
      expect(find.text('Mock test'), findsOneWidget);
      // Toggle the first item done.
      await tester.tap(find.text('Practice · 10 Qs'));
      await tester.pumpAndSettle();
      expect(find.text('1/2 done'), findsOneWidget);
    });

    testWidgets('next-best Start practice routes to Practice tab (no topic)',
        (tester) async {
      // No guided steps -> fallback CTA -> switch to Practice tab.
      final auth = await _loggedInAuth(_homeMocks(guidedSteps: []));
      VidyaShellTab? switched;
      final scope = VidyaMainShellScope(
        activeTab: VidyaShellTab.home,
        switchTo: (t) => switched = t,
        child: const SizedBox(),
      );
      await tester.pumpWidget(_harness(
        auth,
        VidyaHomeScreen(auth: auth),
        scope: scope,
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Start practice'));
      await tester.pumpAndSettle();
      expect(switched, VidyaShellTab.practice);
    });

    testWidgets('header renders initials avatar from firstName',
        (tester) async {
      final auth = await _loggedInAuth(_homeMocks(firstName: 'Aarav'));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('A'), findsOneWidget);
    });

    testWidgets('bell shows unread badge when count > 0', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(unreadCount: 3));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
    });

    testWidgets('no skeleton placeholders visible once data lands',
        (tester) async {
      final auth = await _loggedInAuth(_homeMocks());
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaSkeletonBlock), findsNothing);
      expect(find.text('Hi, Aarav.'), findsOneWidget);
    });

    testWidgets('readiness fetch failure keeps other cards', (tester) async {
      final auth = await _loggedInAuth(_homeMocks(failReadiness: true));
      await tester.pumpWidget(_harness(auth, VidyaHomeScreen(auth: auth)));
      await tester.pumpAndSettle();
      // Hero shows em-dash score; stats row still renders.
      expect(find.text('—'), findsOneWidget);
      expect(find.text('STREAK'), findsOneWidget);
    });
  });
}
