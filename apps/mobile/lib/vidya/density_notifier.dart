// VidyaDensityNotifier — runtime compact/regular/comfy density switch.
// Persists under 'vidya.density' (separate from Aurora's 'alp.density').

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VidyaDensityNotifier extends ChangeNotifier {
  static const _storageKey = 'vidya.density';
  static const _storage = FlutterSecureStorage();

  VidyaDensity _density = VidyaDensity.regular;
  VidyaDensity get density => _density;

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = _parse(raw);
    if (loaded != null && loaded != _density) {
      _density = loaded;
      notifyListeners();
    }
  }

  Future<void> setDensity(VidyaDensity d) async {
    if (d == _density) {
      await _storage.write(key: _storageKey, value: _encode(d));
      return;
    }
    _density = d;
    notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(d));
  }

  static VidyaDensity? _parse(String? raw) => switch (raw) {
        'compact' => VidyaDensity.compact,
        'regular' => VidyaDensity.regular,
        'comfy' => VidyaDensity.comfy,
        _ => null,
      };

  static String _encode(VidyaDensity d) => switch (d) {
        VidyaDensity.compact => 'compact',
        VidyaDensity.regular => 'regular',
        VidyaDensity.comfy => 'comfy',
      };
}
