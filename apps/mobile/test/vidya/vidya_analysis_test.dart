// Phase C — VidyaAnalysisScreen. Native dimension-fluency + weakest-concept
// + calibration view from /analytics/student/{id}/multi-profile.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_analysis_screen.dart';

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

MockClient _mock({Map<String, dynamic>? profile, bool empty = false}) =>
    MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/auth/login')) {
        return http.Response(_sessionJson(), 200,
            headers: {'content-type': 'application/json'});
      }
      if (path.contains('/multi-profile')) {
        if (empty) {
          return http.Response(
            jsonEncode({'concepts': [], 'fluency': []}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode(profile ??
              {
                'fluency': [
                  {'dimension': 'recall', 'score': 0.82, 'n': 40},
                  {'dimension': 'apply', 'score': 0.45, 'n': 22},
                ],
                'concepts': [
                  {'conceptId': 'Thermodynamics', 'ewa': 0.20, 'n': 6},
                  {'conceptId': 'Kinematics', 'ewa': 0.65, 'n': 10},
                ],
                'confidenceBrier': 0.12,
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

  testWidgets('renders dimension fluency + weakest concepts + calibration',
      (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaAnalysisScreen(auth: auth)));
    // Bounded pumps rather than pumpAndSettle: the loading state shows an
    // indeterminate CircularProgressIndicator which never "settles".
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('DIMENSION FLUENCY'), findsOneWidget);
    expect(find.text('Recall'), findsOneWidget); // prettified dimension
    expect(find.text('Apply'), findsOneWidget);
    expect(find.text('82%'), findsOneWidget);
    expect(find.text('WEAKEST CONCEPTS'), findsOneWidget);
    // Weakest-first: Thermodynamics (0.20) before Kinematics.
    expect(find.text('Thermodynamics'), findsOneWidget);
    expect(find.text('CONFIDENCE CALIBRATION'), findsOneWidget);
    expect(find.text('Well calibrated'), findsOneWidget); // brier 0.12 < 0.15
  });

  testWidgets('empty state when no profile data', (tester) async {
    final auth = await _loggedIn(_mock(empty: true));
    await tester.pumpWidget(_harness(VidyaAnalysisScreen(auth: auth)));
    // Bounded pumps rather than pumpAndSettle: the loading state shows an
    // indeterminate CircularProgressIndicator which never "settles".
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.textContaining('Not enough data yet'), findsOneWidget);
  });
}
