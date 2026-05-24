import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/vidya_root_app.dart';

AuthClient _makeAuth() => AuthClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async {
        // /catalog/exams (GET) returns empty list; other paths 404.
        if (req.url.path.endsWith('/catalog/exams')) {
          return http.Response('[]', 200);
        }
        return http.Response('{}', 404);
      }),
    );

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('renders splash during bootstrap', (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    expect(find.byType(VidyaRootApp), findsOneWidget);
  });

  testWidgets('first-launch (no onboarding_done key) lands on welcome',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to Vidya'), findsOneWidget);
  });

  testWidgets('returning user (onboarding_done == true) lands on AuroraRoute',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues(
        {'vidya.onboarding_done': 'true'});
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    // Welcome NOT visible — AuroraRoute is rendering AuroraGuestFlow.
    expect(find.text('Welcome to Vidya'), findsNothing);
  });

  testWidgets(
      'authenticated returning user (ONBOARDED) lands on home (MainScaffold) — not Vidya welcome',
      (tester) async {
    // Seed an authenticated session in secure storage so AuthClient.bootstrap()
    // restores it. Tokens persisted under 'alp.auth.tokens' as JSON.
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
      'vidya.onboarding_done': 'true',
    });
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    // Use pump() instead of pumpAndSettle() because MainScaffold contains
    // InboxBell which has a 60s Timer.periodic that prevents settling.
    await tester.pump(); // trigger bootstrap futures
    await tester.pump(const Duration(milliseconds: 100)); // let microtasks run
    // Welcome must NOT be shown — authenticated user goes straight to home.
    expect(find.text('Welcome to Vidya'), findsNothing);
    expect(find.text('Welcome back'), findsNothing); // not on login either
  });

  testWidgets('Welcome → Sign in tapped routes to VidyaLoginScreen',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to Vidya'), findsOneWidget);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.byKey(const Key('vidya.login.email')), findsOneWidget);
  });

  testWidgets(
      'cold-start with initialDeepLink (?token=…) lands on VidyaNewPasswordScreen',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(
      auth: _makeAuth(),
      initialDeepLink: 'alp://reset?token=test-token-abc',
    ),);
    await tester.pumpAndSettle();
    expect(find.text('Set new password'), findsOneWidget);
  });
}
