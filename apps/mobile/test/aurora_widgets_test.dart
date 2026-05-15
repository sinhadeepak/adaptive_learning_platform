// Widget tests for the Wave 2 W2.1 ship.
//
// Focus: the regression that motivated the proper widget library —
// AuroraSectionHeading rendering correctly in BOTH light and dark
// themes (the original AlpSectionHeading hardcoded a dark-theme
// constant and rendered invisibly on light scaffolds).
//
// Also covers the Lumi widgets' persona-prominence gating: Aspirant
// and Learner should hide LumiCompanion on non-AI surfaces unless
// `forceVisible` is set.

import 'package:adaptive_learning_mobile/aurora/lumi_coach.dart';
import 'package:adaptive_learning_mobile/aurora/widgets/widgets.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _pump({
  required Widget child,
  Brightness brightness = Brightness.dark,
  Persona persona = Persona.aspirant,
}) {
  final theme = brightness == Brightness.light
      ? AuroraTheme.light(persona: persona)
      : AuroraTheme.dark(persona: persona);
  return MaterialApp(
    theme: theme,
    home: Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)),
  );
}

void main() {
  group('AuroraSectionHeading', () {
    testWidgets('renders the title in dark theme without exceptions',
        (tester) async {
      await tester.pumpWidget(_pump(
        child: const AuroraSectionHeading('My exams & courses'),
      ),);
      expect(find.text('My exams & courses'), findsOneWidget);
    });

    testWidgets('renders the title in light theme without exceptions',
        (tester) async {
      await tester.pumpWidget(_pump(
        brightness: Brightness.light,
        child: const AuroraSectionHeading('My exams & courses'),
      ),);
      expect(find.text('My exams & courses'), findsOneWidget);
    });

    testWidgets('renders the title in matching color to onSurface',
        (tester) async {
      await tester.pumpWidget(_pump(
        brightness: Brightness.light,
        child: const AuroraSectionHeading('My exams & courses'),
      ),);
      // Resolve the text widget and check its colour resolves to the
      // theme's neutral900 (which is dark in light mode, light in
      // dark mode) — not a hardcoded light constant.
      final ctx = tester.element(find.text('My exams & courses'));
      final colors = Theme.of(ctx).extension<AuroraColors>()!;
      final text = tester.widget<Text>(find.text('My exams & courses'));
      expect(text.style?.color, colors.neutral900,
          reason: 'AuroraSectionHeading must pull from the theme, '
              'not hardcode a colour.',);
    });

    testWidgets('renders count chip when count is provided', (tester) async {
      await tester.pumpWidget(_pump(
        child: const AuroraSectionHeading("Today", count: 3),
      ),);
      expect(find.text("Today"), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
    });

    testWidgets('emits Semantics(header: true) widget', (tester) async {
      await tester.pumpWidget(_pump(
        child: const AuroraSectionHeading('Explore'),
      ),);
      // Verify a Semantics widget with header=true exists in the tree.
      final semanticsWidget = find.byWidgetPredicate(
        (w) => w is Semantics && (w.properties.header ?? false),
      );
      expect(semanticsWidget, findsAtLeastNWidgets(1));
    });
  });

  group('AuroraBanner', () {
    testWidgets('renders title + body for each tone', (tester) async {
      for (final tone in AuroraBannerTone.values) {
        await tester.pumpWidget(_pump(
          child: AuroraBanner(
            title: 'Heads up',
            body: 'Tone: ${tone.name}',
            tone: tone,
          ),
        ),);
        expect(find.text('Heads up'), findsOneWidget);
        expect(find.textContaining('Tone:'), findsOneWidget);
      }
    });
  });

  group('AuroraGradientText', () {
    testWidgets('text node still exposes the underlying string for a11y',
        (tester) async {
      await tester.pumpWidget(_pump(
        child: const AuroraGradientText('Lumi'),
      ),);
      // The Text widget exists; ShaderMask paints over it. Screen-
      // readers see "Lumi" because of the Semantics wrap.
      expect(find.text('Lumi'), findsOneWidget);
      // Verify a Semantics widget with the explicit label is in the tree.
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.label == 'Lumi',
        ),
        findsAtLeastNWidgets(1),
      );
    });

    testWidgets('falls back to brand-600 when enabled=false',
        (tester) async {
      await tester.pumpWidget(_pump(
        child: const AuroraGradientText('Lumi', enabled: false),
      ),);
      final ctx = tester.element(find.text('Lumi'));
      final colors = Theme.of(ctx).extension<AuroraColors>()!;
      final widget = tester.widget<Text>(find.text('Lumi'));
      expect(widget.style?.color, colors.brand600);
    });
  });

  group('LumiCompanion', () {
    Finder lumiSemanticsFinder() => find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.label == 'Lumi',
        );

    testWidgets('hides itself for Learner persona when not forced',
        (tester) async {
      await tester.pumpWidget(_pump(
        persona: Persona.learner,
        child: const LumiCompanion(),
      ),);
      expect(lumiSemanticsFinder(), findsNothing);
    });

    testWidgets('forceVisible overrides persona prominence gate',
        (tester) async {
      await tester.pumpWidget(_pump(
        persona: Persona.learner,
        child: const LumiCompanion(forceVisible: true),
      ),);
      expect(lumiSemanticsFinder(), findsAtLeastNWidgets(1));
    });

    testWidgets('renders for Kid persona by default', (tester) async {
      await tester.pumpWidget(_pump(
        persona: Persona.kid,
        child: const LumiCompanion(),
      ),);
      expect(lumiSemanticsFinder(), findsAtLeastNWidgets(1));
    });
  });

  group('LumiSpeechBubble', () {
    testWidgets('renders Lumi turn content', (tester) async {
      await tester.pumpWidget(_pump(
        child: const LumiSpeechBubble(
          turn: LumiTurn(role: 'lumi', content: 'Hello from Lumi'),
        ),
      ),);
      expect(find.text('Hello from Lumi'), findsOneWidget);
    });

    testWidgets('renders refusal preface when metadata refused=true',
        (tester) async {
      await tester.pumpWidget(_pump(
        child: const LumiSpeechBubble(
          turn: LumiTurn(
            role: 'lumi',
            content: "I can't engage with that.",
            metadata: {'refused': true, 'refused_category': 'profanity'},
          ),
        ),
      ),);
      expect(find.textContaining("can't help"), findsOneWidget);
      expect(find.text("I can't engage with that."), findsOneWidget);
    });

    testWidgets('renders citation chips from metadata', (tester) async {
      await tester.pumpWidget(_pump(
        child: const LumiSpeechBubble(
          turn: LumiTurn(
            role: 'lumi',
            content: 'Per the PIB note…',
            metadata: {
              'citations': [
                {'url': 'https://pib.gov.in/example', 'indexed_at': '2026-05-13'},
              ],
            },
          ),
        ),
      ),);
      // The host is rendered; "·" + date follows.
      expect(find.textContaining('pib.gov.in'), findsOneWidget);
    });
  });
}
