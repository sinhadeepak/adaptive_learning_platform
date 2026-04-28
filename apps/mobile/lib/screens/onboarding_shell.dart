import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

/// Shared chrome for the 4 onboarding steps. Mirrors web-student's OnboardingShell.tsx.
class OnboardingShell extends StatelessWidget {
  const OnboardingShell({
    super.key,
    required this.step,
    required this.title,
    required this.children,
    this.description,
    this.onBack,
  });

  final int step; // 1..4
  final String title;
  final String? description;
  final List<Widget> children;
  final VoidCallback? onBack;

  static const _labels = ['Exam', 'Language', 'Target', 'Goal'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.surfaceSecondary,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AlpSpacing.s4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Container(
                padding: const EdgeInsets.all(AlpSpacing.s6),
                decoration: BoxDecoration(
                  color: AlpColors.surfacePrimary,
                  borderRadius: BorderRadius.circular(AlpRadius.card),
                  border: Border.all(color: AlpColors.borderDefault),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (onBack != null)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: onBack,
                          style: TextButton.styleFrom(padding: EdgeInsets.zero),
                          child: const Text('‹ Back'),
                        ),
                      ),
                    _Stepper(currentStep: step),
                    const SizedBox(height: AlpSpacing.s2),
                    Text(
                      'Step $step of 4 — ${_labels[step - 1]}',
                      style: AlpTextStyles.hint,
                    ),
                    const SizedBox(height: AlpSpacing.s5),
                    Text(title, style: AlpTextStyles.pageTitle),
                    if (description != null) ...[
                      const SizedBox(height: AlpSpacing.s2),
                      Text(description!, style: AlpTextStyles.body),
                    ],
                    const SizedBox(height: AlpSpacing.s5),
                    ...children,
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.currentStep});
  final int currentStep;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 1; i <= 4; i++) ...[
          _Dot(state: _stateFor(i)),
          if (i < 4)
            Expanded(
              child: Container(
                height: 2,
                color: i < currentStep ? AlpColors.successFg : AlpColors.borderDefault,
                margin: const EdgeInsets.symmetric(horizontal: AlpSpacing.s1),
              ),
            ),
        ],
      ],
    );
  }

  _DotState _stateFor(int i) {
    if (i < currentStep) return _DotState.complete;
    if (i == currentStep) return _DotState.active;
    return _DotState.pending;
  }
}

enum _DotState { complete, active, pending }

class _Dot extends StatelessWidget {
  const _Dot({required this.state});
  final _DotState state;

  @override
  Widget build(BuildContext context) {
    final ({Color bg, Color fg, Widget child}) style = switch (state) {
      _DotState.complete => (
          bg: AlpColors.successBg,
          fg: AlpColors.successFg,
          child: const Icon(Icons.check, size: 16, color: AlpColors.successFg),
        ),
      _DotState.active => (
          bg: AlpColors.brandPrimary,
          fg: AlpColors.surfacePrimary,
          child: const SizedBox.shrink(),
        ),
      _DotState.pending => (
          bg: AlpColors.surfaceTertiary,
          fg: AlpColors.textMuted,
          child: const SizedBox.shrink(),
        ),
    };
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(color: style.bg, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: style.child,
    );
  }
}
