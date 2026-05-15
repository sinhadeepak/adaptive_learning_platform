// HomeAuroraHero — Aurora v2 home-screen hero composition.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §13.4
//
// Composes greeting + status strip (StatCards horizontally scrollable)
// + AIInsightCard for the most-recent recommendation, in the layout
// proven by the web Home rewrite (S4.5).
//
// Drop-in for any HomeScreen — caller supplies the data model and
// callbacks. No API code lives here; this is presentation only.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'widgets.dart';

class HomeHeroData {
  const HomeHeroData({
    required this.greeting,
    required this.firstName,
    this.examName,
    this.daysToExam,
    this.streak = 0,
    this.readinessPct,
    this.topicsTracked = 0,
    this.todayMinutes = 0,
    this.aiInsightHeadline,
    this.aiInsightDescription,
  });

  final String greeting;
  final String firstName;
  final String? examName;
  final int? daysToExam;
  final int streak;
  final int? readinessPct;
  final int topicsTracked;
  final int todayMinutes;
  final String? aiInsightHeadline;
  final String? aiInsightDescription;
}

class HomeAuroraHero extends StatelessWidget {
  const HomeAuroraHero({
    super.key,
    required this.data,
    this.onAiInsightTap,
  });

  final HomeHeroData data;

  /// Tapped when the user picks the AI insight action. Typically routes
  /// to a focused practice round on the weakest topic.
  final VoidCallback? onAiInsightTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final spacing = Theme.of(context).extension<AuroraSpacing>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final sub = data.examName == null
        ? "Let's get you set up with your first exam."
        : '${data.examName}'
            '${data.daysToExam != null ? ' · ${data.daysToExam} days to exam' : ''}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Greeting
        Padding(
          padding: EdgeInsets.fromLTRB(
            spacing.s4 * density.spaceScale,
            spacing.s2 * density.spaceScale,
            spacing.s4 * density.spaceScale,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RichText(
                text: TextSpan(
                  style: typography.h1.copyWith(color: colors.neutral900),
                  children: [
                    TextSpan(text: '${data.greeting}, '),
                    TextSpan(
                      text: data.firstName,
                      style: TextStyle(color: colors.brand600),
                    ),
                    const TextSpan(text: ' 👋'),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Text(
                sub,
                style: typography.body.copyWith(color: colors.neutral600),
              ),
            ],
          ),
        ),

        SizedBox(height: spacing.s4 * density.spaceScale),

        // Status strip — horizontal scroll so it never wraps to multi-row on
        // narrow phones. Each StatCard mirrors the web design exactly.
        SizedBox(
          height: 92,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(
              horizontal: spacing.s4 * density.spaceScale,
            ),
            children: [
              _StatChip(
                label: 'Streak',
                value: data.streak.toString(),
                icon: const Text('🔥'),
                tone: _StatTone.reward,
              ),
              SizedBox(width: spacing.s2 * density.spaceScale),
              _StatChip(
                label: 'Readiness',
                value: data.readinessPct == null
                    ? '—'
                    : '${data.readinessPct}%',
                tone: data.readinessPct == null
                    ? _StatTone.neutral
                    : data.readinessPct! >= 70
                        ? _StatTone.success
                        : data.readinessPct! >= 40
                            ? _StatTone.warning
                            : _StatTone.danger,
              ),
              SizedBox(width: spacing.s2 * density.spaceScale),
              _StatChip(
                label: 'Topics',
                value: data.topicsTracked.toString(),
                tone: _StatTone.brand,
              ),
              SizedBox(width: spacing.s2 * density.spaceScale),
              _StatChip(
                label: 'Today',
                value: '${data.todayMinutes}m',
                tone: _StatTone.neutral,
              ),
            ],
          ),
        ),

        // AI insight — only when the upstream picked the weakest topic.
        if (data.aiInsightHeadline != null) ...[
          SizedBox(height: spacing.s4 * density.spaceScale),
          Padding(
            padding: EdgeInsets.symmetric(
              horizontal: spacing.s4 * density.spaceScale,
            ),
            child: AuroraCard(
              tone: AuroraCardTone.auroraAi,
              padding: AuroraCardPadding.md,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('✦', style: TextStyle(color: colors.aurora500)),
                      const SizedBox(width: 6),
                      Text(
                        'AI INSIGHT',
                        style: typography.overline.copyWith(
                          color: colors.aurora500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    data.aiInsightHeadline!,
                    style: typography.h4.copyWith(color: colors.neutral900),
                  ),
                  if (data.aiInsightDescription != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      data.aiInsightDescription!,
                      style:
                          typography.body.copyWith(color: colors.neutral700),
                    ),
                  ],
                  if (onAiInsightTap != null) ...[
                    const SizedBox(height: 12),
                    AuroraButton(
                      label: 'Start a 10-min drill',
                      variant: AuroraButtonVariant.aurora,
                      onPressed: onAiInsightTap,
                      iconLeft: const Text('✦'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

enum _StatTone { neutral, brand, success, warning, danger, reward }

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.tone,
    this.icon,
  });

  final String label;
  final String value;
  final _StatTone tone;
  final Widget? icon;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final valueColor = switch (tone) {
      _StatTone.brand => colors.brand600,
      _StatTone.success => colors.success600,
      _StatTone.warning => colors.developing600,
      _StatTone.danger => colors.danger600,
      _StatTone.reward => colors.reward500,
      _StatTone.neutral => colors.neutral900,
    };
    return SizedBox(
      width: 130,
      child: AuroraCard(
        padding: AuroraCardPadding.sm,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                if (icon != null) ...[icon!, const SizedBox(width: 4)],
                Text(
                  label.toUpperCase(),
                  style: typography.overline.copyWith(
                    color: colors.neutral500,
                  ),
                ),
              ],
            ),
            Text(
              value,
              style: typography.h2.copyWith(
                color: valueColor,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
