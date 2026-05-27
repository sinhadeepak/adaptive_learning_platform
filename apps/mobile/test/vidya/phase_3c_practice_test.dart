// Phase 3c v1 — VidyaPracticeScreen landing tests. Phase 3c.full v1
// extended the screen to thread a QuizClient through; Quick now
// navigates into VidyaPracticeSessionScreen instead of snackbar-ing.
// Focused + Mock keep their snackbar stub (v2/v3 work).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';

AuthClient _auth() => AuthClient(
      baseUrl: 'http://test',
      // Anything Practice-session hits (start, next, …) is stubbed to
      // 500 so the session screen renders its error banner — enough
      // for byType-based navigation assertions.
      httpClient: MockClient((req) async => http.Response('{}', 500)),
    );

QuizClient _stub() => QuizClient(auth: _auth());

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  group('VidyaPracticeScreen — Phase 3c v1', () {
    testWidgets('renders PRACTICE eyebrow + tagline', (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub())));
      await tester.pumpAndSettle();
      expect(find.text('PRACTICE'), findsOneWidget);
      expect(find.text('Sharpen your edge.'), findsOneWidget);
    });

    testWidgets('renders three mode cards with name + duration eyebrow',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub())));
      await tester.pumpAndSettle();
      expect(find.text('Quick Practice'), findsOneWidget);
      expect(find.text('Focused Practice'), findsOneWidget);
      expect(find.text('Mock Test'), findsOneWidget);
      expect(find.textContaining('QUICK'), findsOneWidget);
      expect(find.textContaining('FOCUSED'), findsOneWidget);
      expect(find.textContaining('MOCK'), findsOneWidget);
    });

    testWidgets('Quick Practice tap navigates to session screen',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Quick Practice'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaPracticeSessionScreen), findsOneWidget);
    });

    testWidgets('Focused Practice tap shows the v2 deferred snackbar',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Focused Practice'));
      await tester.pump();
      expect(
        find.textContaining('coming in Phase 3c.full v2'),
        findsOneWidget,
      );
    });

    testWidgets('Mock Test tap shows the v2 deferred snackbar',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mock Test'));
      await tester.pump();
      expect(
        find.textContaining('coming in Phase 3c.full v2'),
        findsOneWidget,
      );
    });
  });
}
