// Phase B — VidyaSearchScreen + ApiClient.search. Debounced query against
// GET /search; topic hits open the native topic detail.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_search_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_topic_detail_screen.dart';

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

MockClient _mock({List<Map<String, dynamic>>? results}) =>
    MockClient((req) async {
      final path = req.url.path;
      if (path.endsWith('/auth/login')) {
        return http.Response(_sessionJson(), 200,
            headers: {'content-type': 'application/json'});
      }
      if (path.endsWith('/search')) {
        return http.Response(
          jsonEncode({
            'results': results ??
                [
                  {
                    'type': 'topic',
                    'id': 't1',
                    'title': 'Thermodynamics',
                    'subtitle': 'Physics',
                  },
                ],
            'total': 1,
            'page': 1,
            'perPage': 20,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.contains('/catalog/topics/')) {
        return http.Response(
          jsonEncode({
            'id': 't1',
            'subjectId': 's1',
            'title': 'Thermodynamics',
            'questionCount': 8,
            'tier': 'CORE',
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

  testWidgets('debounced query renders results', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaSearchScreen(auth: auth)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'thermo');
    // Let the 300ms debounce fire + request settle.
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(find.text('Thermodynamics'), findsOneWidget);
    expect(find.text('TOPIC'), findsOneWidget);
  });

  testWidgets('tapping a topic hit opens topic detail', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaSearchScreen(auth: auth)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'thermo');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thermodynamics'));
    await tester.pumpAndSettle();
    expect(find.byType(VidyaTopicDetailScreen), findsOneWidget);
  });

  testWidgets('empty query shows the hint', (tester) async {
    final auth = await _loggedIn(_mock());
    await tester.pumpWidget(_harness(VidyaSearchScreen(auth: auth)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Search across your syllabus'), findsOneWidget);
  });

  testWidgets('no results copy when search is empty-handed', (tester) async {
    final auth = await _loggedIn(_mock(results: const []));
    await tester.pumpWidget(_harness(VidyaSearchScreen(auth: auth)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(find.textContaining('No results'), findsOneWidget);
  });
}
