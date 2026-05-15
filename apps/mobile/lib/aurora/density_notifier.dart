// DensityNotifier — runtime Junior / Aspirant / Pro density switch
// for the mobile app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §6
//
// Persists to flutter_secure_storage under `alp.density`. Default is
// Aspirant (the broadest segment — NEET / JEE / UPSC / Class 11–12).
// Onboarding may seed a different default per exam profile but that
// happens server-side via profile preferences and flows through to
// `setMode()` here.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DensityNotifier extends ChangeNotifier {
  static const _storageKey = 'alp.density';
  static const _storage = FlutterSecureStorage();

  AuroraDensityMode _mode = AuroraDensityMode.aspirant;

  AuroraDensityMode get mode => _mode;
  AuroraDensity get density => AuroraDensity.fromMode(_mode);

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = AuroraDensityModeX.fromId(raw);
    if (loaded != null && loaded != _mode) {
      _mode = loaded;
      notifyListeners();
    }
  }

  Future<void> setMode(AuroraDensityMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
    await _storage.write(key: _storageKey, value: mode.id);
  }
}
