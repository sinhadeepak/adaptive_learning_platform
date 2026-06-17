// VidyaApp — root widget that wires three Vidya notifiers
// (persona, density, themeMode) into MaterialApp via a merged
// Listenable. Any notifier change triggers a single rebuild.
//
// NOTE: not yet wired into main.dart. Phase 2 onboarding swap does that.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'density_notifier.dart';
import 'persona_notifier.dart';
import 'theme_mode_notifier.dart';

class VidyaApp extends StatelessWidget {
  final VidyaPersonaNotifier persona;
  final VidyaDensityNotifier density;
  final VidyaThemeModeNotifier themeMode;
  final Widget home;
  final Map<String, WidgetBuilder>? routes;
  final String? initialRoute;
  final String title;

  const VidyaApp({
    super.key,
    required this.persona,
    required this.density,
    required this.themeMode,
    required this.home,
    this.routes,
    this.initialRoute,
    this.title = 'Vidya',
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([persona, density, themeMode]),
      builder: (context, _) => MaterialApp(
        title: title,
        debugShowCheckedModeBanner: false,
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: persona.persona,
          density: density.density,
        ),
        darkTheme: VidyaTheme.material(
          brightness: Brightness.dark,
          persona: persona.persona,
          density: density.density,
        ),
        themeMode: themeMode.mode,
        home: home,
        routes: routes ?? const {},
        initialRoute: initialRoute,
      ),
    );
  }
}
