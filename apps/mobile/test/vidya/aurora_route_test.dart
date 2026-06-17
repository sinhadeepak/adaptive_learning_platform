import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/aurora_route.dart';
import 'package:adaptive_learning_mobile/vidya/persona_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/density_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/theme_mode_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/vidya_app.dart';

void main() {
  setUpAll(() {
    FlutterSecureStorage.setMockInitialValues({});
  });
  testWidgets('AuroraRoute renders its child with Aurora theme applied',
      (tester) async {
    final persona = VidyaPersonaNotifier();
    final density = VidyaDensityNotifier();
    final themeMode = VidyaThemeModeNotifier();

    await tester.pumpWidget(VidyaApp(
      persona: persona,
      density: density,
      themeMode: themeMode,
      home: AuroraRoute(
        builder: (ctx) => const Scaffold(body: Text('inside aurora')),
      ),
    ),);
    // Allow AuroraRoute's bootstrap Future.wait to settle.
    await tester.pumpAndSettle();

    expect(find.text('inside aurora'), findsOneWidget);
  });

  testWidgets('AuroraRoute mounts a MaterialApp distinct from VidyaApp\'s',
      (tester) async {
    final persona = VidyaPersonaNotifier();
    final density = VidyaDensityNotifier();
    final themeMode = VidyaThemeModeNotifier();

    await tester.pumpWidget(VidyaApp(
      persona: persona,
      density: density,
      themeMode: themeMode,
      home: AuroraRoute(
        builder: (ctx) => const Scaffold(body: Text('child')),
      ),
    ),);
    await tester.pumpAndSettle();

    // Two MaterialApps in the tree — VidyaApp's outer + AuroraRoute's inner.
    expect(find.byType(MaterialApp), findsNWidgets(2));
  });
}
