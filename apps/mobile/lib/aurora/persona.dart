// PersonaNotifier — runtime Kid / Teen / Aspirant / Learner persona switch
// for the mobile app.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §4 (Aurora v3)
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0 — Persona system foundation.
//
// The [Persona] enum and the matching [PersonaTheme] extension live inside
// the design-tokens-flutter package (they're pure types injected into
// `AuroraTheme.build()`); this file holds the app-side runtime: persistence
// to flutter_secure_storage, default resolution, and the ChangeNotifier
// that MaterialApp listens to.
//
// Default: aspirant — the broadest existing user segment until onboarding
// resolves a different choice. Changing the default mid-life would
// silently re-skin the app for existing users, which is why onboarding
// writes the value explicitly and we only fall back to aspirant when
// nothing is set.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists and broadcasts the active [Persona]. Mirrors the structural
/// pattern of `ThemeModeNotifier` + `DensityNotifier` so MaterialApp can
/// rebuild on change.
class PersonaNotifier extends ChangeNotifier {
  static const _storageKey = 'alp.persona';
  static const _storage = FlutterSecureStorage();

  Persona _persona = Persona.aspirant;

  Persona get persona => _persona;

  /// Whether the user has ever explicitly chosen a persona (vs. the
  /// silent aspirant default). Used by onboarding to decide whether to
  /// show the persona-select beat.
  bool _chosen = false;
  bool get hasChosen => _chosen;

  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    final loaded = PersonaX.fromId(raw);
    if (loaded != null) {
      _chosen = true;
      if (loaded != _persona) {
        _persona = loaded;
        notifyListeners();
      }
    }
  }

  Future<void> setPersona(Persona p) async {
    _chosen = true;
    final changed = p != _persona;
    _persona = p;
    if (changed) notifyListeners();
    await _storage.write(key: _storageKey, value: p.id);
  }

  /// Debug-only escape hatch for the "Preview onboarding" flow and tests.
  /// Wipes the stored choice; on next bootstrap the user is back to the
  /// aspirant default + `hasChosen=false` (so onboarding re-asks).
  Future<void> resetForOnboarding() async {
    _chosen = false;
    _persona = Persona.aspirant;
    notifyListeners();
    await _storage.delete(key: _storageKey);
  }
}
