// Tests for Task 8: content-language preference + session-start helper.
//
// Covers:
//   1. UserProfile.fromJson parses contentLanguage from preferences.
//   2. contentLanguage defaults to 'en' when absent from the response.
//   3. contentLanguageField() returns {'language': code} when set.
//   4. contentLanguageField() returns {} when profile fetch fails.
//   5. updatePreferences PATCH payload includes contentLanguage when
//      updateContentLanguage is called.

import 'dart:convert';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/content_language_helper.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Minimal /profile/me response body with a given contentLanguage.
String _profileResponse(String? contentLanguage) {
  final prefs = <String, dynamic>{
    'language': 'en',
    'dailyGoalMinutes': 60,
  };
  if (contentLanguage != null) prefs['contentLanguage'] = contentLanguage;
  return jsonEncode({
    'user': {'id': 'u-1', 'email': 'a@b.com', 'firstName': 'A', 'lastName': 'B'},
    'preferences': prefs,
    'exams': [],
  });
}

void main() {
  setUpAll(() => FlutterSecureStorage.setMockInitialValues({}));

  // Reset the module-level cache before each test to ensure isolation.
  setUp(resetContentLanguageCache);

  group('UserProfile.fromJson', () {
    test('parses contentLanguage from preferences', () {
      final j = jsonDecode(_profileResponse('hi')) as Map<String, dynamic>;
      final p = UserProfile.fromJson(j);
      expect(p.contentLanguage, 'hi');
    });

    test('defaults contentLanguage to en when key is absent', () {
      final j = jsonDecode(_profileResponse(null)) as Map<String, dynamic>;
      final p = UserProfile.fromJson(j);
      expect(p.contentLanguage, 'en');
    });

    test('accepts all supported content language codes', () {
      for (final code in ['en', 'hi', 'ta', 'te', 'bn', 'mr']) {
        final j = jsonDecode(_profileResponse(code)) as Map<String, dynamic>;
        final p = UserProfile.fromJson(j);
        expect(p.contentLanguage, code,
            reason: 'Expected contentLanguage "$code" to round-trip');
      }
    });
  });

  group('contentLanguageField helper', () {
    test('returns {language: hi} when profile has contentLanguage hi', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async => http.Response(
              _profileResponse('hi'),
              200,
              headers: {'content-type': 'application/json'},
            )),
      );
      final api = ApiClient(auth);
      final field = await contentLanguageField(api);
      expect(field, {'language': 'hi'});
    });

    test('returns {} when profile fetch returns non-200', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((_) async => http.Response('{}', 500)),
      );
      final api = ApiClient(auth);
      final field = await contentLanguageField(api);
      expect(field, isEmpty);
    });

    test('caches the result — only one network call per app session', () async {
      var calls = 0;
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/profile/me')) calls++;
          return http.Response(
            _profileResponse('ta'),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      final api = ApiClient(auth);
      await contentLanguageField(api);
      await contentLanguageField(api); // second call — must not hit network
      expect(calls, 1);
    });
  });

  group('ApiClient.updateContentLanguage', () {
    test('PATCHes /profile/preferences with {contentLanguage: lang}', () async {
      final bodies = <String>[];
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async {
          if (req.method == 'PATCH' &&
              req.url.path.endsWith('/profile/preferences')) {
            bodies.add(req.body);
            return http.Response(
              _profileResponse('ta'),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      final api = ApiClient(auth);
      final result = await api.updateContentLanguage('ta');
      expect(result, isNotNull);
      expect(result!.contentLanguage, 'ta');
      expect(bodies, hasLength(1));
      final decoded = jsonDecode(bodies.first) as Map<String, dynamic>;
      expect(decoded['contentLanguage'], 'ta');
      // Must NOT include unrelated keys (separate call pattern).
      expect(decoded.containsKey('language'), isFalse);
      expect(decoded.containsKey('dailyGoalMinutes'), isFalse);
    });
  });
}
