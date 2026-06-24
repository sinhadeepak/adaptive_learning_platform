// Phase 3d v1 — VidyaInsightsScreen tests. Single fetch (mastery),
// 4 bucket counts derived client-side.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/aurora_route.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_insights_screen.dart';
import 'package:adaptive_learning_mobile/vidya/state/active_exam_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/state/exam_ref.dart';

/// Wraps the screen under a seeded active-exam provider (examId 'e1' — the
/// exam the mocks serve subjects/topics for) so exam-scoped resolution works.
Widget _harness(Widget child, AuthClient auth) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(
        body: VidyaActiveExam(
          notifier: VidyaActiveExamNotifier.seeded(
            auth: auth,
            enrolled: const [ExamRef(examId: 'e1', code: 'neet', name: 'NEET')],
          ),
          child: child,
        ),
      ),
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

// Default catalog: 1 subject ('Physics') with 4 topics matching the
// mastery EWAs below. Pass `catalog: const []` (or null subjects/topics)
// to suppress topic-name resolution and exercise the bucket-only path.
MockClient _insightsMocks({
  List<Map<String, dynamic>>? topics,
  List<Map<String, dynamic>>? subjects,
  Map<String, List<Map<String, dynamic>>>? subjectTopics,
  Map<String, dynamic>? profile,
  bool failMastery = false,
  Map<String, dynamic>? snapshot,
}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.contains('/analytics/insights/') && path.endsWith('/snapshot')) {
      if (snapshot == null) return http.Response('{}', 404);
      return http.Response(jsonEncode(snapshot), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me')) {
      return http.Response(
        jsonEncode(profile ??
            {
              'user': {
                'firstName': 'Aarav',
                'lastName': 'L',
                'email': 'a@b.com',
              },
              'preferences': {'language': 'en'},
              'exams': [
                {'examId': 'e1'}
              ],
            }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/catalog/exams')) {
      return http.Response(
        jsonEncode([
          {'id': 'e1', 'code': 'NEET', 'name': 'NEET UG'},
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/catalog/exams/') && path.endsWith('/subjects')) {
      return http.Response(
        jsonEncode(subjects ??
            [
              {
                'id': 's1',
                'examId': 'e1',
                'name': 'Physics',
                'topicCount': 4,
              },
            ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/catalog/subjects/') && path.endsWith('/topics')) {
      // Extract subjectId from path like '/catalog/subjects/s1/topics'.
      final parts = path.split('/');
      final subjectId = parts[parts.length - 2];
      final lookup = subjectTopics ??
          {
            's1': [
              {
                'id': 't1',
                'subjectId': 's1',
                'title': 'Mechanics',
                'questionCount': 5,
                'tier': 'CORE',
              },
              {
                'id': 't2',
                'subjectId': 's1',
                'title': 'Optics',
                'questionCount': 3,
                'tier': 'CORE',
              },
              {
                'id': 't3',
                'subjectId': 's1',
                'title': 'Thermodynamics',
                'questionCount': 2,
                'tier': 'CORE',
              },
              {
                'id': 't4',
                'subjectId': 's1',
                'title': 'Atomic Physics',
                'questionCount': 0,
                'tier': 'CORE',
              },
            ],
          };
      return http.Response(
        jsonEncode(lookup[subjectId] ?? const []),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/mastery/')) {
      if (failMastery) throw Exception('boom');
      return http.Response(
        jsonEncode({
          'topics': topics ??
              [
                // 1 strong (t1), 1 developing (t2), 1 weak (t3), 1 not-started (t4)
                {'topicId': 't1', 'ewa': 0.80, 'n': 5},
                {'topicId': 't2', 'ewa': 0.50, 'n': 3},
                {'topicId': 't3', 'ewa': 0.20, 'n': 2},
                {'topicId': 't4', 'ewa': 0.00, 'n': 0},
              ],
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
    FlutterSecureStorage.setMockInitialValues({});
  });

  // Phase 3d.full v1 added a FOCUS ON section + the COMING card below
  // it, pushing later children outside the default 800x600 test
  // viewport. ListView lazy-builds, so off-screen children may not
  // even be in the element tree. Bumping the surface lets every test
  // assert on the full screen content without scroll-into-view dances.
  Future<void> _pump(WidgetTester tester, AuthClient auth, Widget child) async {
    await tester.binding.setSurfaceSize(const Size(800, 2400));
    await tester.pumpWidget(_harness(child, auth));
  }

  group('VidyaInsightsScreen — Phase 3d v1', () {
    testWidgets('renders INSIGHTS eyebrow + tagline', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.text('INSIGHTS'), findsOneWidget);
      expect(find.text('Where you stand.'), findsOneWidget);
    });

    testWidgets('renders 4 bucket labels + counts', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.text('STRONG'), findsOneWidget);
      expect(find.text('DEVELOPING'), findsOneWidget);
      expect(find.text('WEAK'), findsOneWidget);
      expect(find.text('NOT STARTED'), findsOneWidget);
      // With the default mocks each bucket = 1 → four "1"s rendered.
      expect(find.text('1'), findsNWidgets(4));
    });

    testWidgets('total topics attempted reflects strong+developing+weak count',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      // 1 strong + 1 developing + 1 weak = 3 attempted (not-started excluded)
      expect(find.textContaining('3 topics attempted'), findsOneWidget);
    });

    testWidgets('DIG DEEPER section lists the analytics deep-dives',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.text('DIG DEEPER'), findsOneWidget);
      expect(find.text('My Analysis'), findsOneWidget);
      expect(find.text('Concept Profile'), findsOneWidget);
      expect(find.text('Diagnostic Deep-Dive'), findsOneWidget);
    });

    testWidgets('tapping a DIG DEEPER row pushes an Aurora analytics route',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Concept Profile'));
      await tester.tap(find.text('Concept Profile'));
      await tester.pumpAndSettle();
      expect(find.byType(AuroraRoute), findsOneWidget);
    });

    testWidgets('renders zones 2 + 3 from the insights snapshot',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks(snapshot: {
        'user_id': 'u1',
        'my_state': {
          'concept_mastery': const [],
          'topic_decay': const [],
          'readiness': {'score': 0.62, 'band': 'on_track'},
        },
        'what_this_means': {
          'weak_concepts': [
            {
              'concept_id': 'c1',
              'ewa': 0.2,
              'n': 3,
              'decay_severity': 'fresh',
              'decay_days': 0,
            },
          ],
          'decay_alerts': [
            {
              'concept_id': 'c2',
              'ewa': 0.5,
              'n': 4,
              'decay_severity': 'critical',
              'decay_days': 20,
            },
          ],
        },
        'what_to_do': {
          'missions_today_pending': true,
          'revision_due_today': 4,
        },
      }));
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.text('WHAT THIS MEANS'), findsOneWidget);
      expect(find.text('WHAT TO DO'), findsOneWidget);
      expect(find.text('1 weak concept'), findsOneWidget);
      expect(find.textContaining('1 critical'), findsOneWidget);
      expect(find.text("Today's mission is pending"), findsOneWidget);
      expect(find.textContaining('4 topics due for revision'), findsOneWidget);
    });

    testWidgets('empty state when mastery list is empty', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks(topics: const []));
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.textContaining('No mastery data yet'), findsOneWidget);
    });

    testWidgets('renders FOCUS ON section with named weak topic',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.text('FOCUS ON'), findsOneWidget);
      // The default mocks have only one ewa>0 weak topic (t3 = Thermodynamics).
      expect(find.text('Thermodynamics'), findsOneWidget);
    });

    testWidgets('FOCUS ON orders by EWA ascending (weakest first)',
        (tester) async {
      // Override mastery so two topics are in the WEAK band with
      // distinct EWAs: t3 = 0.10 (weakest), t2 = 0.25.
      final auth = await _loggedInAuth(_insightsMocks(
        topics: const [
          {'topicId': 't1', 'ewa': 0.80, 'n': 5},
          {'topicId': 't2', 'ewa': 0.25, 'n': 3},
          {'topicId': 't3', 'ewa': 0.10, 'n': 2},
        ],
      ));
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      // Both render but Thermodynamics (t3 = 0.10) must appear above Optics (t2 = 0.25).
      final thermo = tester.getTopLeft(find.text('Thermodynamics'));
      final optics = tester.getTopLeft(find.text('Optics'));
      expect(thermo.dy, lessThan(optics.dy));
    });

    testWidgets('tap FOCUS ON topic pushes VidyaTopicDetailScreen',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Thermodynamics'));
      await tester.pumpAndSettle();
      // 'Practice this topic' is unique to VidyaTopicDetailScreen.
      expect(find.text('Practice this topic'), findsOneWidget);
    });

    testWidgets('FOCUS ON section hidden when no weak topics exist',
        (tester) async {
      // All EWAs in STRONG band → no weak topics to focus on.
      final auth = await _loggedInAuth(_insightsMocks(
        topics: const [
          {'topicId': 't1', 'ewa': 0.90, 'n': 5},
          {'topicId': 't2', 'ewa': 0.85, 'n': 3},
        ],
      ));
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.text('FOCUS ON'), findsNothing);
    });

    testWidgets('error state when mastery fetch fails', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks(failMastery: true));
      await _pump(tester, auth, VidyaInsightsScreen(auth: auth));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
