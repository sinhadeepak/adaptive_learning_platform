// Phase 4 — VidyaRevisionScreen tests. Drives a login + a mocked
// /analytics/revision/{userId} response so the SM-2 queue renders, and
// the empty-state path when nothing is due.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_revision_screen.dart';

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

Future<AuthClient> _auth(List<Map<String, dynamic>> revisionItems) async {
  final mock = MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.contains('/analytics/revision/')) {
      return http.Response(
        jsonEncode({'items': revisionItems}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('renders due revision items with topic + Revise now CTA',
      (tester) async {
    final auth = await _auth([
      {
        'topicId': 't1',
        'topicTitle': 'Thermodynamics',
        'overdueDays': 3,
        'intervalDays': 7,
        'attemptCount': 2,
      },
    ]);
    await tester.pumpWidget(_harness(VidyaRevisionScreen(auth: auth)));
    await tester.pumpAndSettle();

    expect(find.text('DUE FOR REVIEW'), findsOneWidget);
    expect(find.text('Thermodynamics'), findsOneWidget);
    expect(find.text('3d overdue'), findsOneWidget);
    expect(find.text('Revise now'), findsOneWidget);
  });

  testWidgets('shows all-caught-up empty state when nothing is due',
      (tester) async {
    final auth = await _auth(const []);
    await tester.pumpWidget(_harness(VidyaRevisionScreen(auth: auth)));
    await tester.pumpAndSettle();

    expect(find.textContaining("all caught up"), findsOneWidget);
  });
}
