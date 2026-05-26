// Phase 3b v1 — VidyaStudyScreen tests.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_study_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
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

// Build a MockClient that lets each path be overridden. Default: NEET
// is the active exam with 2 subjects (Physics 14 topics, Chemistry 17).
MockClient _studyMocks({
  List<Map<String, dynamic>>? exams,
  List<Map<String, dynamic>>? userExams,
  List<Map<String, dynamic>>? subjects,
  bool failSubjects = false,
}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me')) {
      return http.Response(
        jsonEncode({
          'user': {
            'firstName': 'Aarav',
            'lastName': 'L',
            'email': 'a@b.com',
          },
          'preferences': {'language': 'en'},
          'exams': userExams ?? [{'examId': 'e1'}],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/catalog/exams')) {
      return http.Response(
        jsonEncode(exams ??
            [
              {'id': 'e1', 'code': 'NEET', 'name': 'NEET UG'},
            ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/catalog/exams/') && path.endsWith('/subjects')) {
      if (failSubjects) throw Exception('boom');
      return http.Response(
        jsonEncode(subjects ??
            [
              {
                'id': 's1',
                'examId': 'e1',
                'name': 'Physics',
                'topicCount': 14,
              },
              {
                'id': 's2',
                'examId': 'e1',
                'name': 'Chemistry',
                'topicCount': 17,
              },
            ]),
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

  group('VidyaStudyScreen — Phase 3b v1', () {
    testWidgets('renders STUDY eyebrow + active exam name', (tester) async {
      final auth = await _loggedInAuth(_studyMocks());
      await tester.pumpWidget(_harness(VidyaStudyScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('STUDY'), findsOneWidget);
      expect(find.text('NEET UG'), findsOneWidget);
    });

    testWidgets('renders each subject as a card with name + topic count',
        (tester) async {
      final auth = await _loggedInAuth(_studyMocks());
      await tester.pumpWidget(_harness(VidyaStudyScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('Physics'), findsOneWidget);
      expect(find.text('Chemistry'), findsOneWidget);
      expect(find.textContaining('14 topics'), findsOneWidget);
      expect(find.textContaining('17 topics'), findsOneWidget);
    });

    testWidgets('tapping a subject pushes VidyaSubjectDetailScreen',
        (tester) async {
      final auth = await _loggedInAuth(_studyMocks());
      await tester.pumpWidget(_harness(VidyaStudyScreen(auth: auth)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Physics'));
      await tester.pumpAndSettle();
      // Subject detail's '<N> topics' sub-header is unique to that
      // screen — its presence proves the push happened. (The default
      // _studyMocks doesn't stub topicsForSubject, so the detail
      // screen settles to its error state; the AppBar title 'Physics'
      // still proves we're on the detail route.)
      expect(find.text('Physics'), findsAtLeastNWidgets(1));
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('empty state when user has no exams', (tester) async {
      final auth = await _loggedInAuth(_studyMocks(userExams: const []));
      await tester.pumpWidget(_harness(VidyaStudyScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.textContaining('No exam selected'), findsOneWidget);
    });

    testWidgets('error state when subjects fetch fails', (tester) async {
      final auth = await _loggedInAuth(_studyMocks(failSubjects: true));
      await tester.pumpWidget(_harness(VidyaStudyScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
