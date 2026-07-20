// Phase D — native engagement screens: Bookmarks, Inbox, History
// (replacing the Aurora versions). Real client methods: listBookmarks /
// removeBookmark, inbox / markNotificationRead, sessionHistory.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_bookmarks_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_history_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_inbox_screen.dart';

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

int bookmarkDeletes = 0;
int notifReads = 0;

MockClient _mock() {
  bookmarkDeletes = 0;
  notifReads = 0;
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    // Bookmarks.
    if (path.endsWith('/profile/bookmarks') && req.method == 'GET') {
      return http.Response(
        jsonEncode({
          'items': [
            {
              'userId': 'u1',
              'questionId': 'q1',
              'topicTitle': 'Thermodynamics',
              'stem': 'What is entropy?',
              'note': 'revisit',
              'createdAt': '2026-06-20T00:00:00Z',
            },
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/profile/bookmarks/') && req.method == 'DELETE') {
      bookmarkDeletes++;
      return http.Response('', 204);
    }
    // Inbox.
    if (path == '/notifications/inbox/u1' && req.method == 'GET') {
      return http.Response(
        jsonEncode({
          'unreadCount': 1,
          'items': [
            {
              'id': 'n1',
              'type': 'streak_reminder',
              'channel': 'inapp',
              'payload': {'title': 'Keep your streak alive!'},
              'createdAt': '2026-06-21T00:00:00Z',
            },
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/read') && req.method == 'POST') {
      notifReads++;
      return http.Response('{}', 200);
    }
    // History (/quiz/sessions?userId=).
    if (path == '/quiz/sessions' && req.method == 'GET') {
      return http.Response(
        jsonEncode({
          'userId': 'u1',
          'items': [
            {
              'sessionId': 's1',
              'topicId': 't1',
              'mode': 'PRACTICE',
              'status': 'COMPLETED',
              'targetCount': 10,
              'servedCount': 10,
              'correctCount': 8,
              'startedAt': '2026-06-19T09:00:00Z',
            },
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 500);
  });
}

Future<AuthClient> _loggedIn() async {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: _mock());
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

  testWidgets('Bookmarks renders saved questions + remove drops the row',
      (tester) async {
    final auth = await _loggedIn();
    await tester.pumpWidget(_harness(VidyaBookmarksScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Thermodynamics'), findsOneWidget);
    expect(find.text('What is entropy?'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.bookmark_remove_outlined));
    await tester.pumpAndSettle();
    expect(bookmarkDeletes, 1);
    expect(find.text('What is entropy?'), findsNothing);
  });

  testWidgets('Inbox renders notifications + tap marks read', (tester) async {
    final auth = await _loggedIn();
    await tester.pumpWidget(_harness(VidyaInboxScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Keep your streak alive!'), findsOneWidget);
    expect(find.text('Mark all read'), findsOneWidget);
    await tester.tap(find.text('Keep your streak alive!'));
    await tester.pumpAndSettle();
    expect(notifReads, 1);
  });

  testWidgets('History renders past sessions with score', (tester) async {
    final auth = await _loggedIn();
    await tester.pumpWidget(_harness(VidyaHistoryScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.text('Practice'), findsOneWidget);
    expect(find.text('8/10'), findsOneWidget);
    expect(find.textContaining('completed'), findsOneWidget);
  });
}
