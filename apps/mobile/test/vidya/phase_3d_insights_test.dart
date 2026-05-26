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
import 'package:adaptive_learning_mobile/vidya/screens/vidya_insights_screen.dart';

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

MockClient _insightsMocks({
  List<Map<String, dynamic>>? topics,
  bool failMastery = false,
}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.contains('/analytics/mastery/')) {
      if (failMastery) throw Exception('boom');
      return http.Response(
        jsonEncode({
          'topics': topics ??
              [
                // 1 strong, 1 developing, 1 weak, 1 not-started (n=0)
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

  group('VidyaInsightsScreen — Phase 3d v1', () {
    testWidgets('renders INSIGHTS eyebrow + tagline', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await tester.pumpWidget(_harness(VidyaInsightsScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('INSIGHTS'), findsOneWidget);
      expect(find.text('Where you stand.'), findsOneWidget);
    });

    testWidgets('renders 4 bucket labels + counts', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await tester.pumpWidget(_harness(VidyaInsightsScreen(auth: auth)));
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
      await tester.pumpWidget(_harness(VidyaInsightsScreen(auth: auth)));
      await tester.pumpAndSettle();
      // 1 strong + 1 developing + 1 weak = 3 attempted (not-started excluded)
      expect(find.textContaining('3 topics attempted'), findsOneWidget);
    });

    testWidgets('shows COMING IN PHASE 3d.full preview card',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks());
      await tester.pumpWidget(_harness(VidyaInsightsScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.text('COMING IN PHASE 3d.full'), findsOneWidget);
    });

    testWidgets('empty state when mastery list is empty',
        (tester) async {
      final auth = await _loggedInAuth(_insightsMocks(topics: const []));
      await tester.pumpWidget(_harness(VidyaInsightsScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.textContaining('No mastery data yet'), findsOneWidget);
    });

    testWidgets('error state when mastery fetch fails', (tester) async {
      final auth = await _loggedInAuth(_insightsMocks(failMastery: true));
      await tester.pumpWidget(_harness(VidyaInsightsScreen(auth: auth)));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
