// VidyaScreeningIntroScreen — pre-quiz framing.
// First-time users see this after exam-select but before being dropped
// into MainScaffold. Start kicks off the 12-item adaptive screening;
// Skip bypasses it locally (the user can re-take it from Settings).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaScreeningIntroScreen extends StatelessWidget {
  final VoidCallback onStart;
  final VoidCallback onSkip;

  const VidyaScreeningIntroScreen({
    super.key,
    required this.onStart,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 32),
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.compass_calibration_outlined,
                        color: accent, size: 32),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    "Let's calibrate to your level",
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 30,
                      fontWeight: FontWeight.w500,
                      color: ink,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'A quick 12-question check-in so every practice session '
                    'is dialled to your actual level — not too easy, not '
                    'too hard.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      color: muted,
                      height: 1.55,
                    ),
                  ),
                  const SizedBox(height: 32),
                  _Tip(
                    icon: Icons.timer_outlined,
                    text: 'Takes ~5 minutes',
                  ),
                  const SizedBox(height: 12),
                  _Tip(
                    icon: Icons.lightbulb_outline,
                    text: 'Adaptive — gets easier or harder as you go',
                  ),
                  const SizedBox(height: 12),
                  _Tip(
                    icon: Icons.bar_chart,
                    text: 'Seeds your readiness score',
                  ),
                  const Spacer(),
                  VidyaButton(
                    key: const Key('vidya.screening.intro.start'),
                    label: 'Start diagnostic',
                    onPressed: onStart,
                    size: VidyaButtonSize.lg,
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      onPressed: onSkip,
                      child: const Text('Skip for now'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _Tip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Tip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final muted = theme.ink3;
    final accent = theme.accent;
    return Row(children: [
      Icon(icon, color: accent, size: 20),
      const SizedBox(width: 12),
      Expanded(
        child: Text(
          text,
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: muted,
          ),
        ),
      ),
    ]);
  }
}
