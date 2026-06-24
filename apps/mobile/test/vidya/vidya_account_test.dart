// Phase D — native account/engagement screens: Edit profile, Notification
// preferences, Assignments (replacing the Aurora versions).

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_assignments_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_edit_profile_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_notification_prefs_screen.dart';

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

String _profileJson({Map<String, dynamic>? notif}) => jsonEncode({
      'user': {'firstName': 'Aarav', 'lastName': 'Lal', 'email': 'a@b.com'},
      'preferences': {'language': 'en'},
      'notificationPrefs': notif ?? {'quiz.completed': false},
      'exams': [],
    });

int patchProfile = 0;
int patchNotif = 0;
Map<String, dynamic>? lastNotifBody;

MockClient _mock({List<Map<String, dynamic>>? assignments}) {
  patchProfile = 0;
  patchNotif = 0;
  lastNotifBody = null;
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me') && req.method == 'GET') {
      return http.Response(_profileJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me') && req.method == 'PATCH') {
      patchProfile++;
      return http.Response(_profileJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/notification-prefs')) {
      patchNotif++;
      lastNotifBody = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(_profileJson(notif: {'quiz.completed': true}), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/content/assignments')) {
      return http.Response(
        jsonEncode(assignments ??
            [
              {
                'id': 'a1',
                'cohortId': 'c1',
                'title': 'Week 1 — Kinematics',
                'description': '10 questions on motion',
                'dueAt': '2026-07-01T00:00:00Z',
                'publishedAt': '2026-06-20T00:00:00Z',
                'createdAt': '2026-06-20T00:00:00Z',
                'updatedAt': '2026-06-20T00:00:00Z',
              },
            ]),
        200,
        headers: {'content-type': 'application/json'},
      );
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

  testWidgets('Edit profile loads names and saves', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaEditProfileScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Aarav'), findsOneWidget); // first name loaded
    expect(find.text('Lal'), findsOneWidget); // last name loaded
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
    expect(patchProfile, 1);
    expect(find.text('Saved.'), findsOneWidget);
  });

  testWidgets('Notification prefs renders kinds + toggle persists',
      (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaNotificationPrefsScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Practice results'), findsOneWidget);
    expect(find.text('Mock test results'), findsOneWidget);
    // quiz.completed seeded muted (false) → its switch is off; flip the
    // first switch.
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(patchNotif, 1);
    expect(lastNotifBody?['prefs'], isA<Map>());
  });

  testWidgets('Assignments lists work with due + Start', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaAssignmentsScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Week 1 — Kinematics'), findsOneWidget);
    expect(find.textContaining('Due Jul 1'), findsOneWidget);
    expect(find.text('Start'), findsOneWidget);
  });
}
