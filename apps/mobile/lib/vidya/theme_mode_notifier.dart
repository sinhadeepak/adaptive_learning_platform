// VidyaThemeModeNotifier — runtime light/dark/system theme switch.
// Persists under 'vidya.theme' (separate from Aurora's 'alp.theme').

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VidyaThemeModeNotifier extends ChangeNotifier with WidgetsBindingObserver {
  static const _storageKey = 'vidya.theme';
  static const _storage = FlutterSecureStorage();

  ThemeMode _mode = ThemeMode.dark;

  VidyaThemeModeNotifier() {
    WidgetsBinding.instance.addObserver(this);
  }

  ThemeMode get mode => _mode;

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

  Future<void> setMode(ThemeMode m) async {
    if (m == _mode) return;
    _mode = m;
    notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(m));
  }

  @override
  void didChangePlatformBrightness() {
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
