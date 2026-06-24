// Phase B — VidyaTestBuilderScreen + ApiClient.createCustomBlueprint.
// Drives the real POST /catalog/exam-blueprints/custom contract: pick
// subject → topic → difficulty → count, author a CUSTOM blueprint, then
// launch it as a mock session.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mock_session_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_test_builder_screen.dart';

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

/// Captures the last custom-blueprint POST body so the test can assert the
/// composed payload.
Map<String, dynamic>? lastCustomBody;

MockClient _mock({bool failCustom = false}) {
  lastCustomBody = null;
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.contains('/catalog/exams/') && path.endsWith('/subjects')) {
      return http.Response(
        jsonEncode([
          {'id': 's1', 'examId': 'e1', 'name': 'Physics', 'topicCount': 2},
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/catalog/subjects/') && path.endsWith('/topics')) {
      return http.Response(
        jsonEncode([
          {
            'id': 't1',
            'subjectId': 's1',
            'title': 'Mechanics',
            'questionCount': 12,
            'tier': 'CORE',
          },
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/catalog/exam-blueprints/custom')) {
      if (failCustom) {
        return http.Response(
          jsonEncode({
            'detail': {'code': 'invalid_blueprint', 'message': 'No questions'},
          }),
          422,
          headers: {'content-type': 'application/json'},
        );
      }
      lastCustomBody = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(
        jsonEncode({'id': 'bp-custom-1'}),
        201,
        headers: {'content-type': 'application/json'},
      );
    }
    // Session start (from-blueprint) 500s → session screen error banner.
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

Future<void> _pickSubjectAndTopic(WidgetTester tester) async {
  // Subject dropdown.
  await tester.tap(find.text('Choose a subject'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Physics').last);
  await tester.pumpAndSettle();
  // Topic dropdown (now enabled + populated).
  await tester.tap(find.text('Choose a topic'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Mechanics').last);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('build & start composes a custom blueprint and launches it',
      (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(
      VidyaTestBuilderScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();

    await _pickSubjectAndTopic(tester);
    // Pick a non-default count (20) and difficulty (Hard).
    await tester.tap(find.text('20'));
    await tester.tap(find.text('Hard'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Build & start'));
    await tester.pumpAndSettle();

    // Composed payload reached the backend.
    expect(lastCustomBody, isNotNull);
    expect(lastCustomBody!['exam_id'], 'e1');
    final section = (lastCustomBody!['sections'] as List).first as Map;
    expect(section['topic_ids'], ['t1']);
    expect(section['n_questions'], 20);
    expect(section['difficulty_band'], 'hard');

    // Launched the mock session for the new blueprint.
    expect(find.byType(VidyaMockSessionScreen), findsOneWidget);
  });

  testWidgets('build button disabled until a topic is chosen', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(
      VidyaTestBuilderScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();
    final btn = tester.widget<VidyaButton>(
      find.ancestor(
        of: find.text('Build & start'),
        matching: find.byType(VidyaButton),
      ),
    );
    expect(btn.onPressed, isNull); // disabled
  });

  testWidgets('surfaces the backend 422 message', (tester) async {
    final auth = await _loggedIn(_mock(failCustom: true));
    await tester.pumpWidget(_harness(
      VidyaTestBuilderScreen(auth: auth, examId: 'e1', examName: 'NEET'),
    ));
    await tester.pumpAndSettle();
    await _pickSubjectAndTopic(tester);
    await tester.tap(find.text('Build & start'));
    await tester.pumpAndSettle();
    expect(find.text('No questions'), findsOneWidget);
    expect(find.byType(VidyaMockSessionScreen), findsNothing);
  });
}
