import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/screens/main_scaffold.dart';
import 'package:adaptive_learning_mobile/vidya/shell/vidya_main_shell.dart';
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
    expect(find.text('WELCOME TO VIDYA'), findsOneWidget);
  });

  testWidgets('returning user (onboarding_done == true) lands on AuroraRoute',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues(
        {'vidya.onboarding_done': 'true'});
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    // Welcome NOT visible — AuroraRoute is rendering AuroraGuestFlow.
    expect(find.text('WELCOME TO VIDYA'), findsNothing);
  });

  testWidgets(
      'authenticated returning user (ONBOARDED) lands on VidyaMainShell',
      (tester) async {
    // Seed an authenticated session in secure storage so AuthClient.bootstrap()
    // restores it. Tokens persisted under 'alp.auth.tokens' as JSON.
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
      'vidya.onboarding_done': 'true',
    });
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    // Phase 3a — VidyaMainShell has no Timer.periodic, so pumpAndSettle
    // works without the explicit-pump workaround that MainScaffold needed.
    await tester.pumpAndSettle();
    expect(find.byType(VidyaMainShell), findsOneWidget);
    expect(find.byType(MainScaffold), findsNothing);
    expect(find.text('WELCOME TO VIDYA'), findsNothing);
    expect(find.text('Welcome back.'), findsNothing);
  });

  testWidgets(
      'vidya.use_aurora_shell == true keeps home on AuroraRoute(MainScaffold)',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
      'vidya.onboarding_done': 'true',
      'vidya.use_aurora_shell': 'true',
    });
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    // MainScaffold mounts InboxBell's 60s Timer.periodic which would
    // hang pumpAndSettle — use explicit pump (the legacy pattern).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(VidyaMainShell), findsNothing);
  });

  testWidgets('Welcome → Sign in tapped routes to VidyaLoginScreen',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME TO VIDYA'), findsOneWidget);
    await tester.tap(find.text('I already have an account'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back.'), findsOneWidget);
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

  testWidgets(
      'authenticated user (not ONBOARDED, no screening done) routes examSelect → screeningIntro on Continue',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
    });
    final mock = MockClient((req) async {
      if (req.url.path.endsWith('/catalog/exams')) {
        return http.Response(
          '[{"id":"a-1","code":"NEET","name":"NEET UG"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/profile/exams')) {
        return http.Response('{}', 200);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
    await tester.pumpWidget(VidyaRootApp(auth: auth));
    await tester.pumpAndSettle();
    expect(find.text('NEET UG'), findsOneWidget);
    await tester.tap(find.text('NEET UG'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Continue with NEET'));
    await tester.pumpAndSettle();
    expect(find.textContaining('calibrate'), findsOneWidget);
  });

  testWidgets(
      'screening_done == true skips screening — examSelect Continue routes straight to home',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
      'vidya.screening_done': 'true',
    });
    final mock = MockClient((req) async {
      if (req.url.path.endsWith('/catalog/exams')) {
        return http.Response(
          '[{"id":"a-1","code":"NEET","name":"NEET UG"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/profile/exams')) {
        return http.Response('{}', 200);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
    await tester.pumpWidget(VidyaRootApp(auth: auth));
    await tester.pumpAndSettle();
    await tester.tap(find.text('NEET UG'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Continue with NEET'));
    // Phase 3a — VidyaMainShell has no Timer.periodic, so pumpAndSettle
    // works without the explicit-pump workaround.
    await tester.pumpAndSettle();
    expect(find.textContaining('calibrate'), findsNothing);
    expect(find.byType(VidyaMainShell), findsOneWidget);
  });
}
