// Unit tests for the LumiCoach contract.
//
// Verifies:
//   - LumiCoachMode is exhaustively defined for all 4 Personas.
//   - HintPolicy values match docs/02-design/content-safety-policy.md
//     and master spec §20.5.
//   - Refusal table covers every (SafetyCategory, LumiCoachMode) pair
//     EXCEPT (SafetyCategory.selfHarm, _) which must return null
//     (self-harm routes to the helpline sheet, not a refusal bubble).
//   - LumiCoachContext windowing keeps the last `contextWindow` turns.

import 'package:adaptive_learning_mobile/aurora/lumi_coach.dart';
import 'package:adaptive_learning_mobile/aurora/lumi_context.dart';
import 'package:adaptive_learning_mobile/aurora/safety.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('LumiCoachMode.forPersona', () {
    test('maps Persona.kid to LumiCoachMode.encourager', () {
      expect(LumiCoachModeX.forPersona(Persona.kid),
          LumiCoachMode.encourager,);
    });
    test('maps Persona.teen to LumiCoachMode.buddy', () {
      expect(LumiCoachModeX.forPersona(Persona.teen), LumiCoachMode.buddy);
    });
    test('maps Persona.aspirant to LumiCoachMode.mentor', () {
      expect(
          LumiCoachModeX.forPersona(Persona.aspirant), LumiCoachMode.mentor,);
    });
    test('maps Persona.learner to LumiCoachMode.coach', () {
      expect(LumiCoachModeX.forPersona(Persona.learner), LumiCoachMode.coach);
    });
  });

  group('LumiCoachMode.id', () {
    test('every mode has a stable wire id', () {
      const expected = {
        LumiCoachMode.encourager: 'encourager',
        LumiCoachMode.buddy: 'buddy',
        LumiCoachMode.mentor: 'mentor',
        LumiCoachMode.coach: 'coach',
      };
      for (final mode in LumiCoachMode.values) {
        expect(mode.id, expected[mode]);
      }
    });
  });

  group('HintPolicy', () {
    test('encourager allows 3 hints + reveals full answer', () {
      const p = HintPolicy.encourager;
      expect(p.maxHints, 3);
      expect(p.revealsFullAnswer, true);
    });
    test('buddy allows 2 hints + reveals full answer', () {
      const p = HintPolicy.buddy;
      expect(p.maxHints, 2);
      expect(p.revealsFullAnswer, true);
    });
    test('mentor allows 1 hint + NEVER reveals full answer', () {
      const p = HintPolicy.mentor;
      expect(p.maxHints, 1);
      expect(p.revealsFullAnswer, false,
          reason: 'Aspirants must derive; Mentor scaffolds, never reveals.',);
    });
    test('coach allows 1 hint + reveals full optimal solution', () {
      const p = HintPolicy.coach;
      expect(p.maxHints, 1);
      expect(p.revealsFullAnswer, true);
    });
    test('forMode dispatches every mode', () {
      for (final mode in LumiCoachMode.values) {
        final policy = HintPolicy.forMode(mode);
        expect(policy.maxHints, greaterThanOrEqualTo(1));
        expect(policy.maxHints, lessThanOrEqualTo(3));
      }
    });
  });

  group('lumiRefusalCopy', () {
    test('self-harm always returns null (routes to helpline sheet)', () {
      for (final mode in LumiCoachMode.values) {
        expect(
          lumiRefusalCopy(
              category: SafetyCategory.selfHarm, mode: mode,),
          isNull,
          reason: 'Self-harm must surface the helpline, never a refusal bubble.',
        );
      }
    });

    test('every non-self-harm (category, mode) pair has a non-empty copy',
        () {
      for (final cat in SafetyCategory.values) {
        if (cat == SafetyCategory.selfHarm) continue;
        for (final mode in LumiCoachMode.values) {
          final copy = lumiRefusalCopy(category: cat, mode: mode);
          expect(copy, isNotNull,
              reason: 'Missing refusal copy for ($cat, $mode)',);
          expect(copy!.trim(), isNotEmpty,
              reason: 'Empty refusal copy for ($cat, $mode)',);
        }
      }
    });

    test('mentor political-stance refusal is the neutrality template', () {
      final copy = lumiRefusalCopy(
        category: SafetyCategory.politicalStance,
        mode: LumiCoachMode.mentor,
      );
      expect(copy, contains("don't endorse"));
    });
  });

  group('unsureCopy', () {
    test('every mode returns a non-empty unsure response', () {
      for (final mode in LumiCoachMode.values) {
        expect(unsureCopy(mode).trim(), isNotEmpty);
      }
    });
    test('kLumiConfidenceThreshold is in (0, 1)', () {
      expect(kLumiConfidenceThreshold, greaterThan(0));
      expect(kLumiConfidenceThreshold, lessThan(1));
    });
  });

  group('LumiTurn JSON round-trip', () {
    test('preserves role, content, and metadata', () {
      const turn = LumiTurn(
        role: 'lumi',
        content: 'Test response',
        metadata: {'hint_level': 1, 'confidence': 0.85},
      );
      final encoded = turn.toJson();
      final decoded = LumiTurn.fromJson(encoded);
      expect(decoded.role, turn.role);
      expect(decoded.content, turn.content);
      expect(decoded.metadata['hint_level'], 1);
      expect(decoded.metadata['confidence'], 0.85);
    });
    test('handles empty metadata', () {
      const turn = LumiTurn(role: 'user', content: 'Hi');
      final encoded = turn.toJson();
      // Empty metadata is omitted from JSON to keep payloads tight.
      expect(encoded.containsKey('metadata'), false);
      final decoded = LumiTurn.fromJson(encoded);
      expect(decoded.metadata, isEmpty);
    });
  });

  group('LumiCoachContext windowing', () {
    test('windowedTurns returns all turns when below the cap', () {
      final ctx = LumiCoachContext();
      for (var i = 0; i < 3; i++) {
        ctx.appendUser('msg-$i');
      }
      expect(ctx.windowedTurns.length, 3);
    });

    test('windowedTurns trims to the most recent `contextWindow` turns',
        () {
      final ctx = LumiCoachContext();
      for (var i = 0; i < contextWindow + 5; i++) {
        ctx.appendUser('msg-$i');
      }
      expect(ctx.windowedTurns.length, contextWindow);
      // First windowed turn should be the (contextWindow+5 - contextWindow)
      // = 5th appended message (zero-indexed: 'msg-5').
      expect(ctx.windowedTurns.first.content, 'msg-5');
      expect(ctx.windowedTurns.last.content, 'msg-${contextWindow + 4}');
    });

    test('endSession clears in-memory state but preserves profile', () {
      final ctx = LumiCoachContext()
        ..appendUser('hello')
        ..appendLumi(const LumiTurn(role: 'lumi', content: 'hi'));
      expect(ctx.turns.length, 2);
      ctx.endSession();
      expect(ctx.turns, isEmpty);
      expect(ctx.sessionId, isNull);
      expect(ctx.currentHintLevel, 0);
    });

    test('appendLumi tracks hint_level metadata', () {
      final ctx = LumiCoachContext()
        ..appendLumi(const LumiTurn(
          role: 'lumi',
          content: 'Try thinking about...',
          metadata: {'hint_level': 2},
        ),);
      expect(ctx.currentHintLevel, 2);
    });
  });

  group('LumiProfile JSON round-trip', () {
    test('preserves persona + locale + weak topics + restrictions', () {
      const profile = LumiProfile(
        persona: Persona.teen,
        locale: 'hi-IN',
        weakTopicIds: ['t-1', 't-2', 't-3'],
        recentMilestones: ['m-7day'],
        parentRestrictionTags: ['no_emojis'],
      );
      final encoded = profile.toJson();
      final decoded = LumiProfile.fromJson(encoded);
      expect(decoded.persona, Persona.teen);
      expect(decoded.locale, 'hi-IN');
      expect(decoded.weakTopicIds, ['t-1', 't-2', 't-3']);
      expect(decoded.recentMilestones, ['m-7day']);
      expect(decoded.parentRestrictionTags, ['no_emojis']);
    });

    test('falls back to aspirant + en-IN when JSON is missing fields',
        () {
      final decoded = LumiProfile.fromJson({});
      expect(decoded.persona, Persona.aspirant);
      expect(decoded.locale, 'en-IN');
      expect(decoded.weakTopicIds, isEmpty);
    });
  });

  group('LumiRequest payload shape', () {
    test('toJson omits null fields and emits the mode id', () {
      final req = LumiRequest(
        mode: LumiCoachMode.mentor,
        userMessage: 'Explain DPSP',
        history: const [],
        locale: 'en-IN',
      );
      final json = req.toJson();
      expect(json['mode'], 'mentor');
      expect(json['user_message'], 'Explain DPSP');
      expect(json['locale'], 'en-IN');
      expect(json.containsKey('topic_id'), false);
      expect(json.containsKey('hint_level_requested'), false);
      expect(json.containsKey('session_id'), false);
    });
  });
}
