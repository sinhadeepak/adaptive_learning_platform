// Phase C4 — VidyaPortfolioScreen. Current-vs-optimal allocation per yield
// bucket + reallocation hint, on the PCE portfolio endpoint.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_portfolio_screen.dart';

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

MockClient _mock({List<Map<String, dynamic>>? buckets}) =>
    MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/auth/login')) {
        return http.Response(_sessionJson(), 200,
            headers: {'content-type': 'application/json'});
      }
      if (path.contains('/portfolio')) {
        return http.Response(
          jsonEncode({
            'userId': 'u1',
            'examId': 'e1',
            'buckets': buckets ??
                [
                  {
                    'bucket': 'High',
                    'currentMasteryShare': 0.30,
                    'optimalShare': 0.55,
                    'delta': 0.25,
                  },
                  {
                    'bucket': 'Low',
                    'currentMasteryShare': 0.50,
                    'optimalShare': 0.20,
                    'delta': -0.30,
                  },
                ],
            'reallocationHint':
                "Shift effort toward the High-yield bucket — you're "
                    'under-invested there by 25%.',
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

  testWidgets('renders current-vs-optimal buckets + hint', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(
      VidyaPortfolioScreen(auth: auth, examId: 'e1'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('CURRENT vs OPTIMAL'), findsOneWidget);
    expect(find.text('High-yield'), findsOneWidget);
    expect(find.text('Low-yield'), findsOneWidget);
    // High bucket: current 30%, optimal 55%, delta +25%.
    expect(find.text('30%'), findsOneWidget);
    expect(find.text('55%'), findsOneWidget);
    expect(find.text('Δ +25%'), findsOneWidget);
    expect(find.textContaining('Shift effort toward the High'), findsOneWidget);
  });

  testWidgets('empty state when no buckets', (tester) async {
    final auth = await _loggedIn(_mock(buckets: const []));
    await tester.pumpWidget(_harness(
      VidyaPortfolioScreen(auth: auth, examId: 'e1'),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('No allocation data yet'), findsOneWidget);
  });
}
