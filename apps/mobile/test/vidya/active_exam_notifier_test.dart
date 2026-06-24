// Phase A — the app-wide multi-exam spine.
//
// Covers VidyaActiveExamNotifier (resolve enrolled ⨝ catalog, honour the
// persisted selection, switch + persist) and the two switcher presentations
// (VidyaExamPill / VidyaExamChips) that read it. This is the regression
// guard for "switch once → every exam-scoped screen re-scopes".

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/state/active_exam_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/state/exam_ref.dart';
import 'package:adaptive_learning_mobile/vidya/widgets/vidya_exam_switcher.dart';

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

/// Mock serving login + profile (enrolled exams) + catalog (code/name).
MockClient _mock({required List<Map<String, dynamic>> enrolled}) {
  return MockClient((req) async {
    final path = req.url.path;
    if (path.endsWith('/auth/login')) {
      return http.Response(_sessionJson(), 200,
          headers: {'content-type': 'application/json'});
    }
    if (path.endsWith('/profile/me')) {
      return http.Response(
        jsonEncode({
          'user': {'firstName': 'Aarav', 'lastName': 'L', 'email': 'a@b.com'},
          'preferences': {'language': 'en'},
          'exams': enrolled,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
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
    return http.Response('{}', 404);
  });
}

Future<AuthClient> _loggedIn(MockClient mock) async {
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
  await auth.login(email: 'a@b.com', password: 'pw');
  return auth;
}

Widget _host(VidyaActiveExamNotifier n, Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(
        body: VidyaActiveExam(notifier: n, child: child),
      ),
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('VidyaActiveExamNotifier', () {
    test('resolves enrolled ⨝ catalog and defaults active to the primary',
        () async {
      final auth = await _loggedIn(_mock(enrolled: [
        {'examId': 'e-neet', 'targetDate': null},
        {'examId': 'e-jee', 'targetDate': null},
      ]));
      final n = VidyaActiveExamNotifier(auth);
      await n.load();
      expect(n.enrolled.map((e) => e.examId), ['e-neet', 'e-jee']);
      expect(n.active?.examId, 'e-neet');
      expect(n.active?.code, 'NEET');
      expect(n.hasMultiple, isTrue);
    });

    test('drops enrolled exams the catalog does not know about', () async {
      final auth = await _loggedIn(_mock(enrolled: [
        {'examId': 'e-neet', 'targetDate': null},
        {'examId': 'e-unknown', 'targetDate': null},
      ]));
      final n = VidyaActiveExamNotifier(auth);
      await n.load();
      expect(n.enrolled.map((e) => e.examId), ['e-neet']);
      expect(n.hasMultiple, isFalse);
    });

    test('select switches the active exam and persists it', () async {
      final auth = await _loggedIn(_mock(enrolled: [
        {'examId': 'e-neet', 'targetDate': null},
        {'examId': 'e-jee', 'targetDate': null},
      ]));
      final n = VidyaActiveExamNotifier(auth);
      await n.load();
      var notified = 0;
      n.addListener(() => notified++);
      await n.select('e-jee');
      expect(n.active?.examId, 'e-jee');
      expect(notified, 1);
      const storage = FlutterSecureStorage();
      expect(
        await storage.read(key: VidyaActiveExamNotifier.storageKey),
        'e-jee',
      );
    });

    test('honours a previously persisted selection on load', () async {
      FlutterSecureStorage.setMockInitialValues(
        {VidyaActiveExamNotifier.storageKey: 'e-jee'},
      );
      final auth = await _loggedIn(_mock(enrolled: [
        {'examId': 'e-neet', 'targetDate': null},
        {'examId': 'e-jee', 'targetDate': null},
      ]));
      final n = VidyaActiveExamNotifier(auth);
      await n.load();
      expect(n.active?.examId, 'e-jee');
    });

    test('no enrolled exams → null active', () async {
      final auth = await _loggedIn(_mock(enrolled: const []));
      final n = VidyaActiveExamNotifier(auth);
      await n.load();
      expect(n.active, isNull);
      expect(n.enrolled, isEmpty);
    });
  });

  group('switcher widgets', () {
    testWidgets('VidyaExamPill shows the active code; sheet switches exam',
        (tester) async {
      final auth = await _loggedIn(_mock(enrolled: [
        {'examId': 'e-neet', 'targetDate': null},
        {'examId': 'e-jee', 'targetDate': null},
      ]));
      final n = VidyaActiveExamNotifier.seeded(
        auth: auth,
        enrolled: const [
          ExamRef(examId: 'e-neet', code: 'NEET', name: 'NEET UG'),
          ExamRef(examId: 'e-jee', code: 'JEE', name: 'JEE Main'),
        ],
      );
      await tester.pumpWidget(_host(n, const VidyaExamPill()));
      await tester.pumpAndSettle();
      expect(find.text('NEET'), findsOneWidget);

      await tester.tap(find.byType(VidyaExamPill));
      await tester.pumpAndSettle();
      // Sheet lists both exams by name.
      expect(find.text('JEE Main'), findsOneWidget);
      await tester.tap(find.text('JEE Main'));
      await tester.pumpAndSettle();
      expect(n.active?.examId, 'e-jee');
      expect(find.text('JEE'), findsOneWidget); // pill now shows JEE
    });

    testWidgets('VidyaExamChips hidden for a single exam', (tester) async {
      final auth = await _loggedIn(_mock(enrolled: const []));
      final n = VidyaActiveExamNotifier.seeded(
        auth: auth,
        enrolled: const [ExamRef(examId: 'e-neet', code: 'NEET', name: 'NEET')],
      );
      await tester.pumpWidget(_host(n, const VidyaExamChips()));
      await tester.pumpAndSettle();
      expect(find.text('NEET'), findsNothing);
    });
  });
}
