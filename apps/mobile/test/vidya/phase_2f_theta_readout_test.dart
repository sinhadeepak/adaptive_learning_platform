import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_screening_quiz_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  group('VidyaThetaReadout', () {
    testWidgets('renders nothing when theta is null', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: null,
        previousTheta: null,
        nextQB: null,
        narrative: 'ignored',
      )));
      expect(find.text('LIVE θ READOUT'), findsNothing);
    });

    testWidgets('renders eyebrow, value, next-Q line, narrative when theta present',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: -0.42,
        previousTheta: -0.50,
        nextQB: 0.84,
        narrative: "You're answering above your zone.",
      )));
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      expect(find.textContaining('−0.42'), findsOneWidget);
      expect(find.textContaining('0.84'), findsOneWidget);
      expect(find.textContaining('answering above'), findsOneWidget);
    });

    testWidgets('renders ↑ arrow when theta increased', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: 0.10,
        previousTheta: -0.10,
        nextQB: 0.50,
        narrative: 'up',
      )));
      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    });

    testWidgets('renders ↓ arrow when theta decreased', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: -0.20,
        previousTheta: 0.10,
        nextQB: 0.30,
        narrative: 'down',
      )));
      expect(find.byIcon(Icons.arrow_downward), findsOneWidget);
    });

    testWidgets('no arrow when previousTheta is null (item 1)', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: 0.0,
        previousTheta: null,
        nextQB: 0.50,
        narrative: "Let's see where you stand.",
      )));
      expect(find.byIcon(Icons.arrow_upward), findsNothing);
      expect(find.byIcon(Icons.arrow_downward), findsNothing);
    });

    testWidgets('hides Next Q line when nextQB null but theta present',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: -0.42,
        previousTheta: null,
        nextQB: null,
        narrative: 'n',
      )));
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      expect(find.textContaining('Next Q diff'), findsNothing);
    });
  });

  group('VidyaScreeningQuizScreen — Phase 2f integration', () {
    testWidgets('renders LIVE θ READOUT when backend supplies theta fields',
        (tester) async {
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
              'theta_estimate': 0.0,
              'theta_se': 1.0,
              'next_q_b': 0.30,
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
      await tester.pumpWidget(_harness(VidyaScreeningQuizScreen(
        client: client,
        examCode: 'JEE-MAIN',
        onCompleted: (_) {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      // Item-1 narrative
      expect(find.textContaining("where you stand"), findsOneWidget);
      // b-value tag in metadata row
      expect(find.textContaining('b +0.30'), findsOneWidget);
    });

    testWidgets('readout collapses when backend omits theta fields',
        (tester) async {
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
      await tester.pumpWidget(_harness(VidyaScreeningQuizScreen(
        client: client,
        examCode: 'JEE-MAIN',
        onCompleted: (_) {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('LIVE θ READOUT'), findsNothing);
    });

    testWidgets('X close icon fires onBack', (tester) async {
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
              'stem': 'Q',
              'choices': ['a', 'b', 'c', 'd'],
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
      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaScreeningQuizScreen(
        client: client,
        examCode: 'JEE-MAIN',
        onCompleted: (_) {},
        onBack: () => backTaps++,
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      expect(backTaps, 1);
    });
  });
}
