// Phase C3 — VidyaRevisionRitualScreen. The 4-stage spaced-repetition
// ritual: recall confidence → 5-Q set → delta/calibration → next-due.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/api/analytics.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_revision_ritual_screen.dart';

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

// Login succeeds; everything the session screen hits 500s so it settles to
// its error banner — enough to assert the session screen was pushed.
MockClient _mock() => MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(_sessionJson(), 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 500);
    });

Future<AuthClient> _loggedIn() async {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: _mock());
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

RevisionItem _item() => RevisionItem(
      topicId: 't1',
      topicTitle: 'Thermodynamics',
      overdueDays: 3,
      intervalDays: 4,
      attemptCount: 2,
    );

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

  testWidgets('recall stage shows confidence options + start CTA',
      (tester) async {
    final auth = await _loggedIn();
    await tester.pumpWidget(_harness(
      VidyaRevisionRitualScreen(auth: auth, item: _item()),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('STEP 1 OF 4'), findsOneWidget);
    expect(find.text('Shaky'), findsOneWidget);
    expect(find.text('OK'), findsOneWidget);
    expect(find.text('Solid'), findsOneWidget);
    expect(find.text('Start the 5-question set'), findsOneWidget);
  });

  testWidgets('starting the set launches the 5-question session',
      (tester) async {
    final auth = await _loggedIn();
    await tester.pumpWidget(_harness(
      VidyaRevisionRitualScreen(auth: auth, item: _item()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Solid')); // pick a confidence
    await tester.tap(find.text('Start the 5-question set'));
    await tester.pumpAndSettle();
    final session = tester.widget<VidyaPracticeSessionScreen>(
      find.byType(VidyaPracticeSessionScreen),
    );
    expect(session.questionCount, 5);
    expect(session.topicId, 't1');
  });
}
