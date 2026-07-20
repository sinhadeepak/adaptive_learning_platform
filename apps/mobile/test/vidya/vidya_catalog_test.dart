// Phase B (deferred item) — VidyaCatalogScreen. Browse all exams + enrol
// (PUT /profile/exams). Gives the switcher's "Add exam" a destination.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_catalog_screen.dart';

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

int putCount = 0;

MockClient _mock({List<Map<String, dynamic>>? enrolled}) {
  putCount = 0;
  final exams = enrolled ??
      [
        {'examId': 'e-neet', 'targetDate': null},
      ];
  String profileJson() => jsonEncode({
        'user': {'firstName': 'Aarav', 'lastName': 'L', 'email': 'a@b.com'},
        'preferences': {'language': 'en'},
        'exams': exams,
      });
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/catalog/exams')) {
      return http.Response(
        jsonEncode([
          {'id': 'e-neet', 'code': 'NEET', 'name': 'NEET UG'},
          {'id': 'e-jee', 'code': 'JEE', 'name': 'JEE Main'},
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/profile/exams') && req.method == 'PUT') {
      putCount++;
      return http.Response(profileJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me')) {
      return http.Response(profileJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    return http.Response('{}', 404);
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

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('lists exams with enrolled badge + add button', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaCatalogScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('NEET UG'), findsOneWidget);
    expect(find.text('JEE Main'), findsOneWidget);
    expect(find.text('Enrolled'), findsOneWidget); // NEET enrolled
    expect(find.text('Add'), findsOneWidget); // JEE not enrolled
  });

  testWidgets('add enrols the exam and fires onExamAdded', (tester) async {
    var added = 0;
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(
      VidyaCatalogScreen(auth: auth, onExamAdded: () => added++),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(putCount, 1);
    expect(added, 1);
    // JEE now shows the enrolled badge → two "Enrolled" chips.
    expect(find.text('Enrolled'), findsNWidgets(2));
    expect(find.text('Add'), findsNothing);
  });
}
