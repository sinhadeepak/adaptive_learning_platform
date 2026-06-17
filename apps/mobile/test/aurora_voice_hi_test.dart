// Tests for the W2.12 Hindi voice strings.

import 'package:adaptive_learning_mobile/aurora/voice.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AuroraVoice hi-IN resolves', () {
    for (final p in Persona.values) {
      test('persona=${p.id} returns Hindi greeting (Devanagari)', () {
        final voice = AuroraVoice.forTest(
          persona: p,
          locale: const Locale('hi'),
        );
        final greeting = voice.greeting(name: 'Aria');
        // Crude Devanagari check — at least one character in the
        // Devanagari Unicode block (U+0900 to U+097F).
        final hasDevanagari = greeting.runes.any(
          (r) => r >= 0x0900 && r <= 0x097F,
        );
        expect(hasDevanagari, isTrue,
            reason: 'greeting was: $greeting',);
        expect(greeting, contains('Aria'));
      });
    }
  });

  test('onCorrect / onWrong / onStuck render Devanagari', () {
    final v = AuroraVoice.forTest(
      persona: Persona.aspirant,
      locale: const Locale('hi'),
    );
    expect(v.onCorrect(), contains('सही'));
    expect(v.onWrong(), isNotEmpty);
    expect(v.onStuck(), contains('?'));
  });

  test('streakRecovery honors PersonaTheme.streakShameAllowed', () {
    final kid = AuroraVoice.forTest(
      persona: Persona.kid,
      locale: const Locale('hi'),
    );
    expect(kid.streakRecovery(streakDays: 7), isNull);

    final teen = AuroraVoice.forTest(
      persona: Persona.teen,
      locale: const Locale('hi'),
    );
    expect(teen.streakRecovery(streakDays: 7), isNotNull);
    expect(teen.streakRecovery(streakDays: 7), contains('स्ट्रीक'));
  });

  test('milestone interpolates the milestone name', () {
    final v = AuroraVoice.forTest(
      persona: Persona.teen,
      locale: const Locale('hi'),
    );
    final s = v.onMilestone(milestoneName: 'Top 100');
    expect(s, contains('Top 100'));
  });

  test('unknown locale falls back to English', () {
    final v = AuroraVoice.forTest(
      persona: Persona.aspirant,
      locale: const Locale('fr'),
    );
    expect(v.greeting(name: 'Aria'), contains('Welcome back'));
  });
}
