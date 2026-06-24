// Phase C2 — native Concept Profile + Diagnostic Deep-Dive (replacing the
// Aurora versions). Concept Profile lists concept-mastery (weakest first);
// Diagnostic shows the readiness band + focus actions + weakest concepts.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_concept_profile_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_diagnostic_deep_dive_screen.dart';

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

List<Map<String, dynamic>> _concepts() => [
      {'conceptId': 'Thermodynamics', 'ewa': 0.20, 'n': 6},
      {'conceptId': 'Kinematics', 'ewa': 0.78, 'n': 12},
    ];

MockClient _mock({Map<String, dynamic>? band}) => MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/auth/login')) {
        return http.Response(_sessionJson(), 200,
            headers: {'content-type': 'application/json'});
      }
      if (path.contains('/concept-mastery/')) {
        return http.Response(
          jsonEncode({'concepts': _concepts()}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.contains('/readiness-band/')) {
        return http.Response(
          jsonEncode(band ??
              {
                'readiness_score': 0.55,
                'target_score': 0.80,
                'days_to_exam': 120,
                'band': 'behind',
                'actions': ['Revise Thermodynamics', 'Do a timed mock'],
              }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

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

  testWidgets('Concept Profile lists concepts weakest-first', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaConceptProfileScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.textContaining('CONCEPTS'), findsOneWidget);
    expect(find.text('Thermodynamics'), findsOneWidget);
    expect(find.text('Kinematics'), findsOneWidget);
    expect(find.text('20%'), findsOneWidget); // weakest shown
    expect(find.textContaining('n=6'), findsOneWidget);
  });

  testWidgets('Diagnostic shows readiness band + focus zones + weakest',
      (tester) async {
    final auth = await _loggedIn(_mock());
    await tester
        .pumpWidget(_harness(VidyaDiagnosticDeepDiveScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Behind pace'), findsOneWidget); // band 'behind'
    expect(find.textContaining('120 days to exam'), findsOneWidget);
    expect(find.text('FOCUS ZONES'), findsOneWidget);
    expect(find.text('Revise Thermodynamics'), findsOneWidget);
    expect(find.text('WEAKEST CONCEPTS'), findsOneWidget);
    // 0.55 * 900 ≈ 495 readiness; target 0.80 * 900 = 720.
    expect(find.text('495'), findsOneWidget);
    expect(find.textContaining('target 720'), findsOneWidget);
  });
}
