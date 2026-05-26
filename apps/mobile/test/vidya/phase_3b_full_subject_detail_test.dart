// Phase 3b.full v1 — VidyaSubjectDetailScreen tests.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_subject_detail_screen.dart';

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

Subject _physics() => Subject(
      id: 's1',
      examId: 'e1',
      name: 'Physics',
      topicCount: 2,
    );

MockClient _detailMocks({
  List<Map<String, dynamic>>? topics,
  List<Map<String, dynamic>>? masteryTopics,
  bool failTopics = false,
}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.contains('/catalog/subjects/') && path.endsWith('/topics')) {
      if (failTopics) throw Exception('boom');
      return http.Response(
        jsonEncode(topics ??
            [
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
                'title': 'Thermodynamics',
                'questionCount': 7,
                'tier': 'CORE',
              },
            ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/analytics/mastery/')) {
      return http.Response(
        jsonEncode({
          'topics': masteryTopics ??
              [
                // t1 strong (EWA 0.80), t2 weak (EWA 0.20)
                {'topicId': 't1', 'ewa': 0.80, 'n': 5},
                {'topicId': 't2', 'ewa': 0.20, 'n': 2},
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

  group('VidyaSubjectDetailScreen — Phase 3b.full v1', () {
    testWidgets('renders subject name in AppBar', (tester) async {
      final auth = await _loggedInAuth(_detailMocks());
      await tester.pumpWidget(_harness(
        VidyaSubjectDetailScreen(auth: auth, subject: _physics()),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Physics'), findsOneWidget);
    });

    testWidgets('renders topic count sub-header', (tester) async {
      final auth = await _loggedInAuth(_detailMocks());
      await tester.pumpWidget(_harness(
        VidyaSubjectDetailScreen(auth: auth, subject: _physics()),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('2 topics'), findsOneWidget);
    });

    testWidgets('renders each topic with question-count eyebrow + title',
        (tester) async {
      final auth = await _loggedInAuth(_detailMocks());
      await tester.pumpWidget(_harness(
        VidyaSubjectDetailScreen(auth: auth, subject: _physics()),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Mechanics'), findsOneWidget);
      expect(find.text('Thermodynamics'), findsOneWidget);
      expect(find.textContaining('5 questions'), findsOneWidget);
      expect(find.textContaining('7 questions'), findsOneWidget);
    });

    testWidgets('tap topic shows deferred snackbar', (tester) async {
      final auth = await _loggedInAuth(_detailMocks());
      await tester.pumpWidget(_harness(
        VidyaSubjectDetailScreen(auth: auth, subject: _physics()),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mechanics'));
      await tester.pump();
      expect(
          find.textContaining('coming in Phase 3b.full v2'), findsOneWidget);
    });

    testWidgets('empty state when topics list is empty', (tester) async {
      final auth = await _loggedInAuth(_detailMocks(topics: const []));
      await tester.pumpWidget(_harness(
        VidyaSubjectDetailScreen(auth: auth, subject: _physics()),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('No topics yet'), findsOneWidget);
    });

    testWidgets('error state when fetch fails', (tester) async {
      final auth = await _loggedInAuth(_detailMocks(failTopics: true));
      await tester.pumpWidget(_harness(
        VidyaSubjectDetailScreen(auth: auth, subject: _physics()),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
