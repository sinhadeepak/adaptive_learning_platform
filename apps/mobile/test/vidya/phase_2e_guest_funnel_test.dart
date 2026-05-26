import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_guest_screening_result_screen.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_guest_screening_intro_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_exam_select_screen.dart';
import 'package:adaptive_learning_mobile/vidya/vidya_root_app.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  group('VidyaGuestScreeningIntroScreen', () {
    testWidgets('renders eyebrow + headline + info rows + CTAs',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () {},
        onSkip: () {},
      )));
      expect(find.text('5-MINUTE SCREENING'), findsOneWidget);
      expect(find.text('See where you stand. Before signing up.'),
          findsOneWidget);
      expect(find.textContaining('15 adaptive questions'), findsOneWidget);
      expect(find.text('Time'), findsOneWidget);
      expect(find.text('Questions'), findsOneWidget);
      expect(find.text("You'll get"), findsOneWidget);
      expect(find.text('Privacy'), findsOneWidget);
      expect(find.byKey(const Key('vidya.guest.intro.start')), findsOneWidget);
      expect(find.byKey(const Key('vidya.guest.intro.skip')), findsOneWidget);
    });

    testWidgets('Start fires onStart', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () => taps++,
        onSkip: () {},
      )));
      await tester.tap(find.byKey(const Key('vidya.guest.intro.start')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () {},
        onSkip: () => taps++,
      )));
      await tester.tap(find.byKey(const Key('vidya.guest.intro.skip')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });

  group('VidyaGuestScreeningResultScreen', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    ScreeningClient _client(MockClient mock) => ScreeningClient(
          baseUrl: 'http://test',
          httpClient: mock,
          auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
        );

    testWidgets('renders dark hero card with score + projection after reveal',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 53.0,
              'correct': 8,
              'total': 15,
              'topic_breakdown': [
                {'topic_id': 't-mech', 'correct': 1, 'total': 5},
                {'topic_id': 't-thermo', 'correct': 3, 'total': 5},
                {'topic_id': 't-calc', 'correct': 4, 'total': 5},
              ],
              'readiness_seed': 0.53,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-1',
          onSignUp: (_) {},
          onSignIn: () {},
        ),
      ));
      await tester.pumpAndSettle();
      // Score badge in the dark hero — readiness is computed mobile-side.
      // Formula: max(0, round(score_pct * 9 + 100)) clamped to [0, 900].
      // 53% → 53*9 + 100 = 577.
      expect(find.text('577'), findsOneWidget);
      expect(find.text('/ 900'), findsOneWidget);
      // Projection: "WITH VIDYA, IN 12 WEEKS ~XXX".
      expect(find.textContaining('WITH VIDYA, IN 12 WEEKS'), findsOneWidget);
      // Sign-up gate text mentions weak topics from breakdown.
      expect(find.textContaining('weak topics'), findsOneWidget);
    });

    testWidgets('Sign up free fires onSignUp with the guestToken',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 60.0,
              'correct': 9,
              'total': 15,
              'topic_breakdown': [],
              'readiness_seed': 0.6,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      String? capturedToken;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-2',
          onSignUp: (t) => capturedToken = t,
          onSignIn: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.guest.result.signup')));
      await tester.pumpAndSettle();
      expect(capturedToken, 'tok-2');
    });

    testWidgets('I already have an account fires onSignIn',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 40.0,
              'correct': 6,
              'total': 15,
              'topic_breakdown': [],
              'readiness_seed': 0.4,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      var taps = 0;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-3',
          onSignUp: (_) {},
          onSignIn: () => taps++,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.guest.result.signin')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('reveal failure surfaces banner', (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response('{}', 500);
        }
        return http.Response('{}', 404);
      });
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-4',
          onSignUp: (_) {},
          onSignIn: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
    });
  });

  group('VidyaExamSelectScreen (guest mode)', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    testWidgets('guest mode: Continue writes storage + fires onContinue, no /profile/exams call',
        (tester) async {
      final profileCalls = <String>[];
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (req.url.path.endsWith('/profile/exams')) {
            profileCalls.add(req.url.path);
            return http.Response('{}', 200);
          }
          return http.Response('{}', 404);
        }),
      );
      var continueCalls = 0;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () => continueCalls++,
          onBack: () {},
          mode: ExamSelectMode.guest,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      expect(continueCalls, 1);
      expect(profileCalls, isEmpty);
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'vidya.selected_exam_code'), 'NEET');
    });

    testWidgets('authed mode (default): Continue still PUTs /profile/exams',
        (tester) async {
      final profileCalls = <String>[];
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (req.url.path.endsWith('/profile/exams')) {
            profileCalls.add(req.url.path);
            return http.Response('{}', 200);
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      expect(profileCalls.length, 1);
    });
  });

  group('VidyaRootApp guest funnel routing', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    testWidgets('card3 Begin routes to guestExamSelect (not register)',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_RootHarness(auth: auth));
      await tester.pumpAndSettle();
      // Welcome → Get Started → card 1
      await tester.tap(find.textContaining("Get started"));
      await tester.pumpAndSettle();
      // card 1 → Continue → card 2
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      // card 2 → Continue → card 3
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      // card 3 → Begin → guestExamSelect
      await tester.tap(find.text('Begin').first);
      await tester.pumpAndSettle();
      // We should land on exam-select (STEP 1 / 3 eyebrow visible)
      expect(find.textContaining('STEP 1'), findsOneWidget);
      expect(find.text('Choose your exam'), findsOneWidget);
      expect(find.text('National Eligibility Test'), findsOneWidget);
    });

    testWidgets('guest funnel happy path lands on guestScreeningIntro after exam pick',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_RootHarness(auth: auth));
      await tester.pumpAndSettle();
      // Drive through the cards quickly
      await tester.tap(find.textContaining("Get started"));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Begin').first);
      await tester.pumpAndSettle();
      // Exam select → pick NEET → Continue → guest screening intro
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      // Guest screening intro headline visible
      expect(find.text('5-MINUTE SCREENING'), findsOneWidget);
      expect(find.text('See where you stand. Before signing up.'),
          findsOneWidget);
    });

    testWidgets('guestScreeningIntro Skip routes to register',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_RootHarness(auth: auth));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining("Get started"));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Begin').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      // Now on guest screening intro — tap Skip
      await tester.tap(find.byKey(const Key('vidya.guest.intro.skip')));
      await tester.pumpAndSettle();
      // Register screen — heuristic check: the screen renders the
      // 'Create account' label (headline + submit button both match).
      expect(find.textContaining('Create account'), findsAtLeastNWidgets(1));
    });
  });
}

class _RootHarness extends StatelessWidget {
  final AuthClient auth;
  const _RootHarness({required this.auth});

  @override
  Widget build(BuildContext context) {
    return VidyaRootApp(auth: auth);
  }
}
