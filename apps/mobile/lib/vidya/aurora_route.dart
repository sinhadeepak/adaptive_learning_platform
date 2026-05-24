// AuroraRoute — compatibility shim that mounts Aurora's MaterialApp
// (theme + density + persona + themeMode notifiers) around a child
// widget tree. Lets Vidya-rooted apps render Aurora screens without
// editing the Aurora widgets themselves.
//
// One AuroraRoute owns one set of Aurora notifiers for its lifetime.
// When AuroraRoute is unmounted, its notifiers dispose.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/density_notifier.dart';
import '../aurora/persona.dart';
import '../aurora/theme_mode_notifier.dart';

class AuroraRoute extends StatefulWidget {
  final Widget Function(BuildContext) builder;
  const AuroraRoute({super.key, required this.builder});

  @override
  State<AuroraRoute> createState() => _AuroraRouteState();
}

class _AuroraRouteState extends State<AuroraRoute> {
  final _themeMode = ThemeModeNotifier();
  final _density = DensityNotifier();
  final _persona = PersonaNotifier();
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    Future.wait<void>([
      _themeMode.bootstrap(),
      _density.bootstrap(),
      _persona.bootstrap(),
    ]).whenComplete(() {
      if (mounted) setState(() => _bootstrapped = true);
    });
    _themeMode.addListener(_rebuild);
    _density.addListener(_rebuild);
    _persona.addListener(_rebuild);
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _themeMode.removeListener(_rebuild);
    _density.removeListener(_rebuild);
    _persona.removeListener(_rebuild);
    _themeMode.dispose();
    _density.dispose();
    _persona.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_bootstrapped) {
      // Render a transparent placeholder while notifiers bootstrap.
      // VidyaApp's MaterialApp sits above this widget so the screen
      // background stays consistent during the brief bootstrap window.
      return const SizedBox.shrink();
    }
    return MaterialApp(
      title: 'Adaptive Learning Platform',
      debugShowCheckedModeBanner: false,
      theme: AuroraTheme.light(
        density: _density.density,
        persona: _persona.persona,
      ),
      darkTheme: AuroraTheme.dark(
        density: _density.density,
        persona: _persona.persona,
      ),
      themeMode: _themeMode.mode,
      home: Builder(builder: widget.builder),
    );
  }
}
