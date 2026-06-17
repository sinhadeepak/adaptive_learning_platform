import 'package:adaptive_learning_mobile/vidya/density_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/persona_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/theme_mode_notifier.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // flutter_secure_storage uses a platform MethodChannel. In unit tests
  // there's no native side, so mock it to a simple in-memory store.
  final store = <String, String>{};
  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
    switch (call.method) {
      case 'write':
        store[call.arguments['key'] as String] =
            call.arguments['value'] as String;
        return null;
      case 'read':
        return store[call.arguments['key'] as String];
      case 'delete':
        store.remove(call.arguments['key'] as String);
        return null;
      case 'readAll':
        return Map<String, String>.from(store);
      case 'deleteAll':
        store.clear();
        return null;
      case 'containsKey':
        return store.containsKey(call.arguments['key'] as String);
    }
    return null;
  });

  setUp(store.clear);

  group('VidyaPersonaNotifier', () {
    test('default persona is aspirant', () {
      final n = VidyaPersonaNotifier();
      expect(n.persona, VidyaPersona.aspirant);
      expect(n.hasChosen, isFalse);
    });

    test('setPersona changes state and notifies listeners', () async {
      final n = VidyaPersonaNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setPersona(VidyaPersona.pro);
      expect(n.persona, VidyaPersona.pro);
      expect(n.hasChosen, isTrue);
      expect(calls, 1);
    });

    test('setPersona to same value marks chosen but skips notify', () async {
      final n = VidyaPersonaNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setPersona(VidyaPersona.aspirant);
      expect(n.hasChosen, isTrue);
      expect(calls, 0);
    });
  });

  group('VidyaDensityNotifier', () {
    test('default density is regular', () {
      final n = VidyaDensityNotifier();
      expect(n.density, VidyaDensity.regular);
    });

    test('setDensity changes state and notifies', () async {
      final n = VidyaDensityNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setDensity(VidyaDensity.comfy);
      expect(n.density, VidyaDensity.comfy);
      expect(calls, 1);
    });

    test('setDensity to same value does not notify', () async {
      final n = VidyaDensityNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setDensity(VidyaDensity.regular);
      expect(calls, 0);
    });
  });

  group('VidyaThemeModeNotifier', () {
    test('default mode is dark', () {
      final n = VidyaThemeModeNotifier();
      expect(n.mode, ThemeMode.dark);
      n.dispose();
    });

    test('setMode changes and notifies', () async {
      final n = VidyaThemeModeNotifier();
      var calls = 0;
      n.addListener(() => calls++);
      await n.setMode(ThemeMode.light);
      expect(n.mode, ThemeMode.light);
      expect(calls, 1);
      n.dispose();
    });
  });
}
