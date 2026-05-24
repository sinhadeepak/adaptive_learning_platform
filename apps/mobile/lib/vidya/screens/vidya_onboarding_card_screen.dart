// VidyaOnboardingCardScreen — parameterised 3-card onboarding sequence.
// cardIndex 1 = AI adapts, 2 = Readiness, 3 = Guided.
// VidyaFonts.mono == 'GeistMono' (confirmed in tokens.dart).

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

    final (title, body) = switch (cardIndex) {
      1 => (
          'AI that adapts to you',
          'Every question is calibrated live to your current level. Get harder ones as you improve; easier ones when you stall.',
        ),
      2 => (
          'See your readiness, live',
          'A single score, updated every session, that tracks how prepared you actually are — by topic and overall.',
        ),
      _ => (
          'Guided, not generic',
          'We tell you what to study next, why, and how long it should take — so you spend time on what matters.',
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Step counter
                      Text(
                        '$cardIndex of 3',
                        style: TextStyle(
                          fontFamily: VidyaFonts.mono,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 1.5,
                          color: v.ink3,
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Title
                      Text(
                        title,
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 30,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Body text
                      Text(
                        body,
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 15,
                          color: v.ink.withAlpha(166), // 0.65 alpha ≈ 166/255
                          height: 1.55,
                        ),
                      ),
                      const SizedBox(height: 28),
                      // Preview widget — expands to fill remaining space
                      Expanded(
                        child: Center(
                          child: _previewForIndex(cardIndex),
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Continue CTA
                      VidyaButton(
                        label: 'Continue',
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

  Widget _previewForIndex(int index) {
    return switch (index) {
      1 => const _AdaptationPreview(),
      2 => const _ReadinessPreview(),
      _ => const _RecommendationPreview(),
    };
  }
}

// ─── Card 1: Adaptation preview ─────────────────────────────────────────────

class _AdaptationPreview extends StatelessWidget {
  const _AdaptationPreview();

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const VidyaAiTag(label: 'ADAPTIVE ENGINE'),
          const SizedBox(height: 16),
          Text(
            'θ = 0.42 → 0.61',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: v.ink,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Difficulty rises with every correct answer',
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 13,
              color: v.ink3,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Card 2: Readiness preview ───────────────────────────────────────────────

class _ReadinessPreview extends StatelessWidget {
  const _ReadinessPreview();

  @override
  Widget build(BuildContext context) {
    return VidyaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          VidyaMasteryBar(
            label: 'Mechanics',
            value: 0.78,
            bucket: VidyaMasteryBucket.strong,
          ),
          const SizedBox(height: 12),
          VidyaMasteryBar(
            label: 'Thermodynamics',
            value: 0.45,
            bucket: VidyaMasteryBucket.dev,
          ),
          const SizedBox(height: 12),
          VidyaMasteryBar(
            label: 'Calculus',
            value: 0.22,
            bucket: VidyaMasteryBucket.weak,
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 36,
            child: VidyaSparkline(
              values: [0.41, 0.45, 0.52, 0.55, 0.61, 0.66, 0.71],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Card 3: Recommendation preview ─────────────────────────────────────────

class _RecommendationPreview extends StatelessWidget {
  const _RecommendationPreview();

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const VidyaAiTag(label: 'NEXT UP'),
          const SizedBox(height: 12),
          Text(
            'Practice Calculus — 20 min',
            style: TextStyle(
              fontFamily: VidyaFonts.display,
              fontSize: 18,
              fontWeight: FontWeight.w500,
              color: v.ink,
              height: 1.25,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Limits & continuity is your weakest concept. 12 questions calibrated to your level.',
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontSize: 13,
              color: v.ink3,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
