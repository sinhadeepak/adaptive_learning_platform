// Phase 3a — VidyaMainShell + placeholders + Home stub tests.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/shell/vidya_main_shell.dart';
import 'package:adaptive_learning_mobile/vidya/shell/vidya_main_shell_scope.dart';

AuthClient _auth() => AuthClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async => http.Response('{}', 404)),
    );

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  group('VidyaMainShell', () {
    testWidgets('mounts on Home tab by default', (tester) async {
      await tester.pumpWidget(_harness(VidyaMainShell(
        auth: _auth(),
        onSignOut: () {},
      )));
      await tester.pumpAndSettle();
      // Home tab is keyed; settles to either the loading spinner or the
      // empty-data fallback (no auth.user in this lightweight harness),
      // both of which are acceptable for the "mounts on Home" assertion.
      expect(find.byKey(const Key('vidya.shell.home')), findsOneWidget);
    });

    testWidgets('tapping STUDY shows the study tab', (tester) async {
      await tester.pumpWidget(_harness(VidyaMainShell(
        auth: _auth(),
        onSignOut: () {},
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.text('STUDY'));
      await tester.pumpAndSettle();
      // Phase 3b v1: the Study tab now contains the real VidyaStudyScreen
      // instead of a 'COMING SOON' placeholder. The lightweight harness
      // here has no auth.user, so the screen settles to its empty state
      // — but the key is still present and that's what we assert on.
      expect(find.byKey(const Key('vidya.shell.study')), findsOneWidget);
    });

    testWidgets('tapping INSIGHTS shows the insights tab', (tester) async {
      await tester.pumpWidget(_harness(VidyaMainShell(
        auth: _auth(),
        onSignOut: () {},
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.text('INSIGHTS'));
      await tester.pumpAndSettle();
      // Phase 3d v1: the Insights tab now contains the real
      // VidyaInsightsScreen instead of a 'COMING SOON' placeholder.
      // The lightweight harness has no auth.user, so the screen
      // settles to its empty state — byKey assertion is enough.
      expect(find.byKey(const Key('vidya.shell.insights')), findsOneWidget);
    });

    testWidgets('VidyaMainShellScope.switchTo navigates from a descendant',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaMainShell(
        auth: _auth(),
        onSignOut: () {},
      )));
      await tester.pumpAndSettle();
      // Find a descendant context inside the shell's body.
      final ctx = tester.element(
        find.byKey(const Key('vidya.shell.home')),
      );
      VidyaMainShellScope.of(ctx)!.switchTo(VidyaShellTab.more);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('vidya.shell.more')), findsOneWidget);
    });

    testWidgets('More tab "Sign out" fires onSignOut', (tester) async {
      var signOuts = 0;
      await tester.pumpWidget(_harness(VidyaMainShell(
        auth: _auth(),
        onSignOut: () => signOuts++,
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.text('MORE'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(signOuts, 1);
    });
  });
}
