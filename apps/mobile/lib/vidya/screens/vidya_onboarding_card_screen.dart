// VidyaOnboardingCardScreen — parameterised 3-card onboarding sequence.
// cardIndex 1 = Adaptive engine (sigmoid illustration with YOU marker)
// cardIndex 2 = Readiness score (radial dial 728/900)
// cardIndex 3 = Daily plan (topic allocation bars)

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaOnboardingCardScreen extends StatelessWidget {
  final int cardIndex;
  final VoidCallback onContinue;
  final VoidCallback onSkip;
  final VoidCallback onBack;

  const VidyaOnboardingCardScreen({
    super.key,
    required this.cardIndex,
    required this.onContinue,
    required this.onSkip,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    final spec = switch (cardIndex) {
      1 => _CardSpec(
          eyebrow: 'ADAPTIVE ENGINE · 3-PL IRT',
          title: 'Every question, tuned to you.',
          body:
              'Our engine reads your ability after every answer and serves '
              'the next question at your edge — not too easy, never '
              'frustrating.',
          ctaLabel: 'Continue',
        ),
      2 => _CardSpec(
          eyebrow: 'READINESS SCORE',
          title: 'One number, every day.',
          body:
              'Your live readiness — out of 900. The same algorithm exam '
              'boards use to estimate your final rank.',
          ctaLabel: 'Continue',
        ),
      _ => _CardSpec(
          eyebrow: 'DAILY PLAN',
          title: 'The shortest path to your rank.',
          body:
              'We pick the topics that move your score the most, today. '
              'No guesswork. No filler. Just signal.',
          ctaLabel: 'Begin',
        ),
    };

    return VidyaScaffold(
      appBar: VidyaAppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: onBack,
        ),
        actions: [
          TextButton(
            onPressed: onSkip,
            child: Text(
              'Skip',
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink3,
              ),
            ),
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '$cardIndex / 3',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 1.5,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 240,
                        child: _PreviewForIndex(cardIndex: cardIndex),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        spec.eyebrow,
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.8,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        spec.title,
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 26,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        spec.body,
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 14,
                          color: v.ink.withAlpha(166),
                          height: 1.55,
                        ),
                      ),
                      const Spacer(),
                      VidyaButton(
                        label: spec.ctaLabel,
                        onPressed: onContinue,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CardSpec {
  final String eyebrow;
  final String title;
  final String body;
  final String ctaLabel;
  const _CardSpec({
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.ctaLabel,
  });
}

class _PreviewForIndex extends StatelessWidget {
  final int cardIndex;
  const _PreviewForIndex({required this.cardIndex});

  @override
  Widget build(BuildContext context) {
    switch (cardIndex) {
      case 1:
        return const _Card1Preview();
      case 2:
        return const _Card2Preview();
      default:
        return const _Card3Preview();
    }
  }
}

class _Card1Preview extends StatelessWidget {
  const _Card1Preview();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 8),
      child: VidyaSigmoidIllustration(
        theta: 0.79,
        pAtTheta: 0.74,
      ),
    );
  }
}

class _Card2Preview extends StatelessWidget {
  const _Card2Preview();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: SizedBox(
        width: 220,
        height: 220,
        child: VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 728,
          max: 900,
        ),
      ),
    );
  }
}

class _Card3Preview extends StatelessWidget {
  const _Card3Preview();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const VidyaTopicAllocationBar(
            items: [
              VidyaTopicAllocation(
                name: 'Thermodynamics',
                percent: 62,
                accent: true,
              ),
              VidyaTopicAllocation(name: 'Organic chemistry', percent: 24),
              VidyaTopicAllocation(name: 'Cell biology', percent: 14),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            "THIS WEEK'S ALLOCATION",
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.6,
              color: VidyaThemeData.of(context).ink3,
            ),
          ),
        ],
      ),
    );
  }
}
