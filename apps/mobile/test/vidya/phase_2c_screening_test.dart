import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_intro_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_quiz_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_result_screen.dart';

ScreeningClient _makeClient(MockClient mock, {AuthClient? auth}) {
  return ScreeningClient(
    baseUrl: 'http://test',
    httpClient: mock,
    auth: auth ??
        AuthClient(baseUrl: 'http://test', httpClient: mock),
  );
}

Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness,
      persona: persona,
      density: density,
    ),
    home: child,
  );
}

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('ScreeningClient', () {
    test('start posts exam_code+language and returns ScreeningStart',
        (() async {
      String? capturedBody;
      final mock = MockClient((req) async {
        capturedBody = req.body;
        return http.Response(
          jsonEncode({'token': 'tok-1', 'target_count': 12, 'exam_code': 'JEE-MAIN'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final c = _makeClient(mock);
      final r = await c.start(examCode: 'JEE-MAIN', language: 'en');
      expect(r.token, 'tok-1');
      expect(r.targetCount, 12);
      expect(r.examCode, 'JEE-MAIN');
      expect(jsonDecode(capturedBody!), {'exam_code': 'JEE-MAIN', 'language': 'en'});
    }));

    test('next returns ScreeningQuestion on 200', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({
              'item_idx': 0,
              'total': 12,
              'stem': 'What is 2+2?',
              'choices': ['3', '4', '5', '6'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final q = await c.next('tok-1');
      expect(q, isA<ScreeningQuestion>());
      expect((q as ScreeningQuestion).stem, 'What is 2+2?');
      expect(q.choices, ['3', '4', '5', '6']);
    });

    test('next returns ScreeningComplete on 409 {code: complete}', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
            409,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final r = await c.next('tok-1');
      expect(r, isA<ScreeningComplete>());
    });

    test('answer posts {item_idx, answer_idx} and returns on 204', () async {
      Map<String, dynamic>? capturedBody;
      final mock = MockClient((req) async {
        capturedBody = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response('', 204);
      });
      final c = _makeClient(mock);
      await c.answer('tok-1', itemIdx: 0, answerIdx: 2);
      expect(capturedBody, {'item_idx': 0, 'answer_idx': 2});
    });

    test('reveal returns ScreeningReveal payload', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({
              'score_pct': 75.0,
              'correct': 9,
              'total': 12,
              'topic_breakdown': [
                {'topic_id': 't-1', 'correct': 2, 'total': 3},
                {'topic_id': 't-2', 'correct': 1, 'total': 4},
              ],
              'readiness_seed': 0.75,
            }),
            200,
            headers: {'content-type': 'application/json'},
          ));
      final c = _makeClient(mock);
      final r = await c.reveal('tok-1');
      expect(r.scorePct, 75.0);
      expect(r.correct, 9);
      expect(r.total, 12);
      expect(r.readinessSeed, 0.75);
      expect(r.topicBreakdown.length, 2);
      expect(r.topicBreakdown.first.topicId, 't-1');
    });

    test('persist hits POST /screening/{token}/persist via auth.apiPost',
        () async {
      String? capturedPath;
      final mock = MockClient((req) async {
        capturedPath = req.url.path;
        return http.Response(
          jsonEncode({'persisted': true, 'attempt_id': 'a-1'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final c = _makeClient(mock, auth: auth);
      final r = await c.persist('tok-1');
      expect(r.persisted, true);
      expect(r.attemptId, 'a-1');
      expect(capturedPath, '/screening/tok-1/persist');
    });

    test('diagnosticComplete hits POST /profile/me/diagnostic-complete',
        () async {
      String? capturedPath;
      final mock = MockClient((req) async {
        capturedPath = req.url.path;
        return http.Response('', 204);
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final c = _makeClient(mock, auth: auth);
      await c.diagnosticComplete();
      expect(capturedPath, '/profile/me/diagnostic-complete');
    });
  });

  group('VidyaScreeningIntroScreen', () {
    testWidgets('renders title + Start CTA + Skip', (tester) async {
      await tester.pumpWidget(_harness(
        child: VidyaScreeningIntroScreen(
          onStart: () {},
          onSkip: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.screening.intro.start')), findsOneWidget);
      expect(find.text('Skip for now'), findsOneWidget);
      expect(find.textContaining('calibrate'), findsOneWidget);
    });

    testWidgets('Start fires onStart', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningIntroScreen(
          onStart: () => taps++,
          onSkip: () {},
        ),
      ));
      await tester.tap(find.byKey(const Key('vidya.screening.intro.start')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningIntroScreen(
          onStart: () {},
          onSkip: () => taps++,
        ),
      ));
      await tester.tap(find.text('Skip for now'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });

  group('VidyaScreeningQuizScreen', () {
    testWidgets('renders first question after start', (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({'token': 'tok-1', 'target_count': 2, 'exam_code': 'JEE-MAIN'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.url.path.endsWith('/next')) {
          return http.Response(
            jsonEncode({
              'item_idx': 0,
              'total': 2,
              'stem': 'What is 2+2?',
              'choices': ['3', '4', '5', '6'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (_) {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('What is 2+2?'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      expect(find.text('Question 1 of 2'), findsOneWidget);
    });

    testWidgets('selecting a choice + tapping Submit advances to next',
        (tester) async {
      final stems = ['Q1?', 'Q2?'];
      var nextCalls = 0;
      var answerCalls = 0;
      final mock = MockClient((req) async {
        final path = req.url.path;
        if (path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({'token': 'tok-1', 'target_count': 2, 'exam_code': 'JEE-MAIN'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.endsWith('/next')) {
          final idx = nextCalls;
          nextCalls++;
          if (idx >= stems.length) {
            return http.Response(
              jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
              409,
            );
          }
          return http.Response(
            jsonEncode({
              'item_idx': idx,
              'total': stems.length,
              'stem': stems[idx],
              'choices': ['A', 'B', 'C', 'D'],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.endsWith('/answer')) {
          answerCalls++;
          return http.Response('', 204);
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (_) {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Q1?'), findsOneWidget);
      await tester.tap(find.text('B'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.screening.quiz.submit')));
      await tester.pumpAndSettle();
      expect(find.text('Q2?'), findsOneWidget);
      expect(answerCalls, 1);
    });

    testWidgets('when next returns complete, fires onCompleted(token)',
        (tester) async {
      var nextCalls = 0;
      final mock = MockClient((req) async {
        final path = req.url.path;
        if (path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({'token': 'tok-final', 'target_count': 1, 'exam_code': 'JEE-MAIN'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (path.endsWith('/next')) {
          final idx = nextCalls;
          nextCalls++;
          if (idx == 0) {
            return http.Response(
              jsonEncode({
                'item_idx': 0, 'total': 1, 'stem': 'Q?', 'choices': ['A', 'B', 'C', 'D'],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            jsonEncode({'detail': {'code': 'complete', 'message': 'done'}}),
            409,
          );
        }
        if (path.endsWith('/answer')) return http.Response('', 204);
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      String? capturedToken;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (t) => capturedToken = t,
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('A'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.screening.quiz.submit')));
      await tester.pumpAndSettle();
      expect(capturedToken, 'tok-final');
    });

    testWidgets('503 unavailable surfaces banner with Skip CTA',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/screening/start')) {
          return http.Response(
            jsonEncode({
              'detail': {
                'code': 'screening_unavailable',
                'message': 'Not enough published questions to seed a screening test for this exam yet.',
              }
            }),
            503,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      var backTaps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningQuizScreen(
          client: client,
          examCode: 'JEE-MAIN',
          onCompleted: (_) {},
          onBack: () => backTaps++,
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('Not enough published questions'), findsOneWidget);
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(backTaps, 1);
    });
  });

  group('VidyaScreeningResultScreen', () {
    testWidgets('renders score + topic breakdown after reveal',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 75.0,
              'correct': 9,
              'total': 12,
              'topic_breakdown': [
                {'topic_id': 't-mech', 'correct': 1, 'total': 4},
                {'topic_id': 't-thermo', 'correct': 3, 'total': 4},
                {'topic_id': 't-calc', 'correct': 5, 'total': 4},
              ],
              'readiness_seed': 0.75,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningResultScreen(
          client: client,
          token: 'tok-1',
          onCompleted: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('75%'), findsOneWidget);
      expect(find.textContaining('9 of 12'), findsOneWidget);
    });

    testWidgets('Save & continue calls persist + diagnosticComplete + onCompleted',
        (tester) async {
      var persistCalled = false;
      var fsmCalled = false;
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 50.0,
              'correct': 6,
              'total': 12,
              'topic_breakdown': [],
              'readiness_seed': 0.5,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.url.path.endsWith('/persist')) {
          persistCalled = true;
          return http.Response(
            jsonEncode({'persisted': true, 'attempt_id': 'a-1'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.url.path.endsWith('/diagnostic-complete')) {
          fsmCalled = true;
          return http.Response('', 204);
        }
        return http.Response('{}', 404);
      });
      final auth = AuthClient(baseUrl: 'http://test', httpClient: mock);
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: auth,
      );
      var done = 0;
      await tester.pumpWidget(_harness(
        child: VidyaScreeningResultScreen(
          client: client,
          token: 'tok-1',
          onCompleted: () => done++,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.screening.result.continue')));
      await tester.pumpAndSettle();
      expect(persistCalled, true);
      expect(fsmCalled, true);
      expect(done, 1);
    });

    testWidgets('reveal failure surfaces banner', (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response('{}', 500);
        }
        return http.Response('{}', 404);
      });
      final client = ScreeningClient(
        baseUrl: 'http://test',
        httpClient: mock,
        auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
      );
      await tester.pumpWidget(_harness(
        child: VidyaScreeningResultScreen(
          client: client,
          token: 'tok-1',
          onCompleted: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
    });
  });
}
