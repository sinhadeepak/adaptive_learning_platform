// ThemeModeNotifier — runtime light / dark / system switch for the
// mobile app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §17
//
// Mirrors the web ThemeProvider. Persists to flutter_secure_storage
// under `alp.theme` so the choice survives cold starts. Listens to
// OS-level brightness via WidgetsBindingObserver and rebuilds when
// the user is on `ThemeMode.system`.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ThemeModeNotifier extends ChangeNotifier with WidgetsBindingObserver {
  static const _storageKey = 'alp.theme';
  static const _storage = FlutterSecureStorage();

  // Default to dark until Wave 2 ships the Aurora widget library with
  // first-class light-mode support. 156 legacy widget sites across 37
  // files hardcode dark-theme constants (AlpColors.textPrimary,
  // AlpColors.bgSurface2, …) inline. With ThemeMode.system, devices on
  // light OS picked AuroraTheme.light() → near-white scaffold + near-white
  // text → invisible section headers across 8+ screens.
  ThemeMode _mode = ThemeMode.dark;

  ThemeModeNotifier() {
    WidgetsBinding.instance.addObserver(this);
  }

  ThemeMode get mode => _mode;

  /// Resolves the effective brightness in case callers need the
  /// active palette without rebuilding off `Theme.of(context)`.
  Brightness brightnessFor(BuildContext context) {
    if (_mode == ThemeMode.light) return Brightness.light;
    if (_mode == ThemeMode.dark) return Brightness.dark;
    return MediaQuery.platformBrightnessOf(context);
  }

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = _parse(raw);
    if (loaded != null && loaded != _mode) {
      _mode = loaded;
      notifyListeners();
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(mode));
  }

  @override
  void didChangePlatformBrightness() {
    // When user is on ThemeMode.system, the OS-level toggle should
    // visibly flip the app — notify so MaterialApp re-resolves.
    if (_mode == ThemeMode.system) notifyListeners();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  static ThemeMode? _parse(String? raw) => switch (raw) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        'system' => ThemeMode.system,
        _ => null,
      };

  static String _encode(ThemeMode m) => switch (m) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      };
}
