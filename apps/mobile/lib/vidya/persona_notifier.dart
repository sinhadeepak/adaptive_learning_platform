// VidyaPersonaNotifier — runtime junior/senior/aspirant/pro/lifelong
// persona switch for the Vidya design system.
//
// Mirrors apps/mobile/lib/aurora/persona.dart but persists under a
// separate secure-storage key so Aurora and Vidya can coexist.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VidyaPersonaNotifier extends ChangeNotifier {
  static const _storageKey = 'vidya.persona';
  static const _storage = FlutterSecureStorage();

  VidyaPersona _persona = VidyaPersona.aspirant;
  bool _chosen = false;

  VidyaPersona get persona => _persona;
  bool get hasChosen => _chosen;

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = _parse(raw);
    if (loaded != null) {
      _chosen = true;
      if (loaded != _persona) {
        _persona = loaded;
        notifyListeners();
      }
    }
  }

  Future<void> setPersona(VidyaPersona p) async {
    final changed = p != _persona;
    _chosen = true;
    _persona = p;
    if (changed) notifyListeners();
    await _storage.write(key: _storageKey, value: _encode(p));
  }

  Future<void> reset() async {
    _chosen = false;
    _persona = VidyaPersona.aspirant;
    notifyListeners();
    await _storage.delete(key: _storageKey);
  }

  static VidyaPersona? _parse(String? raw) => switch (raw) {
        'junior' => VidyaPersona.junior,
        'senior' => VidyaPersona.senior,
        'aspirant' => VidyaPersona.aspirant,
        'pro' => VidyaPersona.pro,
        'lifelong' => VidyaPersona.lifelong,
        _ => null,
      };

  static String _encode(VidyaPersona p) => switch (p) {
        VidyaPersona.junior => 'junior',
        VidyaPersona.senior => 'senior',
        VidyaPersona.aspirant => 'aspirant',
        VidyaPersona.pro => 'pro',
        VidyaPersona.lifelong => 'lifelong',
      };
}
