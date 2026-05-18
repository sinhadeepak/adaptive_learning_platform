import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness,
      persona: persona,
      density: density,
    ),
    home: Scaffold(body: child),
  );
}

void main() {
  group('VidyaButton', () {
    testWidgets('renders label and responds to tap', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaButton(label: 'Get started', onPressed: () => taps++),
      ));
      expect(find.text('Get started'), findsOneWidget);
      await tester.tap(find.byType(VidyaButton));
      expect(taps, 1);
    });

    testWidgets('disabled does not call onPressed', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaButton(
            label: 'Disabled', onPressed: () => taps++, disabled: true),
      ));
      await tester.tap(find.byType(VidyaButton));
      expect(taps, 0);
    });

    testWidgets('renders in dark mode without exception', (tester) async {
      await tester.pumpWidget(_harness(
        brightness: Brightness.dark,
        child: VidyaButton(label: 'X', onPressed: () {}),
      ));
      expect(find.byType(VidyaButton), findsOneWidget);
    });

    testWidgets('renders for every persona without exception', (tester) async {
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(
          persona: p,
          child: VidyaButton(label: 'P', onPressed: () {}),
        ));
        expect(find.byType(VidyaButton), findsOneWidget);
      }
    });

    testWidgets('renders for every density without exception', (tester) async {
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(
          density: d,
          child: VidyaButton(label: 'D', onPressed: () {}),
        ));
        expect(find.byType(VidyaButton), findsOneWidget);
      }
    });
  });

  testWidgets('VidyaCard renders child + responds to tap when onTap set',
      (tester) async {
    var taps = 0;
    await tester.pumpWidget(_harness(
      child: VidyaCard(onTap: () => taps++, child: const Text('inside')),
    ));
    expect(find.text('inside'), findsOneWidget);
    await tester.tap(find.byType(VidyaCard));
    expect(taps, 1);
  });

  testWidgets('VidyaCard all tones render', (tester) async {
    for (final t in VidyaCardTone.values) {
      await tester.pumpWidget(_harness(
        child: VidyaCard(tone: t, child: const Text('x')),
      ));
      expect(find.byType(VidyaCard), findsOneWidget);
    }
  });

  testWidgets('VidyaTextField renders label and accepts input', (tester) async {
    final controller = TextEditingController();
    await tester.pumpWidget(_harness(
      child: VidyaTextField(label: 'Email', controller: controller),
    ));
    expect(find.text('EMAIL'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'a@b.c');
    expect(controller.text, 'a@b.c');
  });

  testWidgets('VidyaTextField error state renders error text', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaTextField(label: 'X', error: 'invalid'),
    ));
    expect(find.text('invalid'), findsOneWidget);
  });

  testWidgets('VidyaScaffold renders body', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaScaffold(body: Text('hello')),
    ));
    expect(find.text('hello'), findsOneWidget);
  });

  testWidgets('VidyaAppBar renders title', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaScaffold(
        appBar: VidyaAppBar(title: 'Vidya'),
        body: SizedBox(),
      ),
    ));
    expect(find.text('Vidya'), findsOneWidget);
  });

  testWidgets('VidyaChip toggles tap', (tester) async {
    var taps = 0;
    await tester.pumpWidget(_harness(
      child: VidyaChip(label: 'NEET', onTap: () => taps++),
    ));
    await tester.tap(find.byType(VidyaChip));
    expect(taps, 1);
  });

  testWidgets('VidyaBadge renders label for all tones', (tester) async {
    for (final t in VidyaBadgeTone.values) {
      await tester.pumpWidget(_harness(
        child: VidyaBadge(label: 'B', tone: t),
      ));
      expect(find.text('B'), findsOneWidget);
    }
  });

  testWidgets('VidyaAvatar renders initials', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaAvatar(initials: 'AS'),
    ));
    expect(find.text('AS'), findsOneWidget);
  });

  testWidgets('VidyaSheet renders title and child', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaSheet(title: 'Filters', child: Text('body')),
    ));
    expect(find.text('Filters'), findsOneWidget);
    expect(find.text('body'), findsOneWidget);
  });

  testWidgets('VidyaBanner renders message', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaBanner(
          message: 'Offline mode', tone: VidyaBannerTone.warn),
    ));
    expect(find.text('Offline mode'), findsOneWidget);
  });

  testWidgets('VidyaTag renders label for subject tone', (tester) async {
    await tester.pumpWidget(_harness(
      child:
          const VidyaTag(label: 'Physics', subjectColor: Color(0xFF2F5D8C)),
    ));
    expect(find.text('Physics'), findsOneWidget);
  });

  testWidgets('VidyaAiTag renders label uppercase', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaAiTag(label: 'Recommended now'),
    ));
    expect(find.text('RECOMMENDED NOW'), findsOneWidget);
  });

  testWidgets('VidyaMasteryBar renders label and pct', (tester) async {
    await tester.pumpWidget(_harness(
      child: const VidyaMasteryBar(
        label: 'Kinematics',
        value: 0.85,
        bucket: VidyaMasteryBucket.mastered,
        pct: '85%',
      ),
    ));
    expect(find.text('Kinematics'), findsOneWidget);
    expect(find.text('85%'), findsOneWidget);
  });

  testWidgets('VidyaSparkline renders without exception', (tester) async {
    await tester.pumpWidget(_harness(
      child: const SizedBox(
        width: 200,
        height: 40,
        child: VidyaSparkline(values: [1, 2, 3, 2, 4, 5, 4, 6]),
      ),
    ));
    expect(find.byType(VidyaSparkline), findsOneWidget);
  });
}
