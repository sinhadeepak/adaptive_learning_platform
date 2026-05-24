// VidyaWelcomeScreen — first interactive screen after splash.
// Product pitch + 3 feature strips + Get Started + Sign In CTAs.
// Skip is exposed (top-right) but jumps the user past onboarding entirely.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaWelcomeScreen extends StatelessWidget {
  final VoidCallback onGetStarted;
  final VoidCallback onSignIn;
  final VoidCallback onSkip;

  const VidyaWelcomeScreen({
    super.key,
    required this.onGetStarted,
    required this.onSignIn,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
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
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 32),
                      // Hero
                      Text(
                        'Welcome to Vidya',
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 34,
                          fontWeight: FontWeight.w500,
                          color: v.ink,
                          height: 1.15,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'AI-powered exam prep that adapts to how you actually learn.',
                        style: TextStyle(
                          fontFamily: VidyaFonts.ui,
                          fontSize: 15,
                          color: v.ink3,
                          height: 1.5,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      // Feature strips
                      const _FeatureStrip(
                        icon: Icons.psychology_outlined,
                        title: 'Adaptive engine',
                        subtitle: 'Every question calibrated to your level',
                      ),
                      const SizedBox(height: 12),
                      const _FeatureStrip(
                        icon: Icons.show_chart,
                        title: 'Live readiness',
                        subtitle: 'See your trajectory toward exam day',
                      ),
                      const SizedBox(height: 12),
                      const _FeatureStrip(
                        icon: Icons.lightbulb_outline,
                        title: 'Guided study',
                        subtitle: 'What to study next, every session',
                      ),
                      // Push CTAs to bottom
                      const Spacer(),
                      VidyaButton(
                        label: 'Get started',
                        onPressed: onGetStarted,
                        style: VidyaButtonStyle.primary,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                      ),
                      const SizedBox(height: 12),
                      VidyaButton(
                        label: 'Sign in',
                        onPressed: onSignIn,
                        style: VidyaButtonStyle.ghost,
                        size: VidyaButtonSize.lg,
                        fullWidth: true,
                      ),
                      const SizedBox(height: 16),
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

class _FeatureStrip extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _FeatureStrip({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tileColor = v.accent.withAlpha(31); // 0.12 alpha ≈ 31 out of 255

    return VidyaCard(
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: tileColor,
              borderRadius: const BorderRadius.all(VidyaRadius.md),
            ),
            child: Icon(
              icon,
              color: v.accent,
              size: 20,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 13,
                    color: v.ink3,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
