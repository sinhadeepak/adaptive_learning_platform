// Phase 3e v1 — VidyaMoreScreen tests. Drives a real AuthClient.login()
// flow so the Profile header has a User to render.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_more_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

String _sessionJson({String firstName = 'Aarav', String email = 'a@b.com'}) =>
    jsonEncode({
      'user': {
        'id': 'u1',
        'email': email,
        'firstName': firstName,
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

Future<AuthClient> _loggedInAuth({
  String firstName = 'Aarav',
  String email = 'a@b.com',
}) async {
  final mock = MockClient((req) async {
    if (req.url.path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(firstName: firstName, email: email), 200,
          headers: {'content-type': 'application/json'});
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: email, password: 'pw');
  return auth;
}

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('VidyaMoreScreen', () {
    testWidgets('renders profile header with firstName + email + initial avatar',
        (tester) async {
      final auth = await _loggedInAuth(firstName: 'Aarav', email: 'a@b.com');
      await tester.pumpWidget(_harness(
        VidyaMoreScreen(auth: auth, onSignOut: () {}),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Aarav'), findsOneWidget);
      expect(find.text('a@b.com'), findsOneWidget);
      expect(find.text('A'), findsOneWidget);
    });

    testWidgets('Aurora-shell switch reflects existing flag value',
        (tester) async {
      FlutterSecureStorage.setMockInitialValues(
          {'vidya.use_aurora_shell': 'true'});
      final auth = await _loggedInAuth();
      await tester.pumpWidget(_harness(
        VidyaMoreScreen(auth: auth, onSignOut: () {}),
      ));
      await tester.pumpAndSettle();
      final sw = tester.widget<Switch>(find.byType(Switch));
      expect(sw.value, isTrue);
    });

    testWidgets('flipping Aurora-shell switch writes the storage key',
        (tester) async {
      final auth = await _loggedInAuth();
      await tester.pumpWidget(_harness(
        VidyaMoreScreen(auth: auth, onSignOut: () {}),
      ));
      await tester.pumpAndSettle();
      // Initial state — flag absent → switch off.
      expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'vidya.use_aurora_shell'), 'true');
      expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
    });

    testWidgets('toggling shows the "Restart app to apply" snackbar',
        (tester) async {
      final auth = await _loggedInAuth();
      await tester.pumpWidget(_harness(
        VidyaMoreScreen(auth: auth, onSignOut: () {}),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch));
      await tester.pump(); // surface the snackbar
      expect(find.text('Restart app to apply.'), findsOneWidget);
    });

    testWidgets('Sign out row fires onSignOut', (tester) async {
      var signOuts = 0;
      final auth = await _loggedInAuth();
      await tester.pumpWidget(_harness(
        VidyaMoreScreen(auth: auth, onSignOut: () => signOuts++),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(signOuts, 1);
    });
  });
}
