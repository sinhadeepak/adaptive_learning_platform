// MissionCard — Today's Mission hero on Home (Phase 6 UX-25).
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Composes:
//   AuroraProgressRing (mastery delta forecast) +
//   why-picked copy +
//   "Start" CTA
//
// Two variants:
//   - default     — full Aurora-AI surface (cyan/violet)
//   - celebration — switches to aurora-celebration gradient on completion
//                   ("Mission complete · streak +1")

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_button.dart';
import 'aurora_card.dart';
import 'aurora_progress_ring.dart';

enum MissionCardVariant { defaultAi, celebration }

class MissionCard extends StatelessWidget {
  const MissionCard({
    super.key,
    required this.title,
    required this.whyPicked,
    required this.expectedMinutes,
    required this.expectedQuestions,
    required this.onStart,
    this.progress = 0,
    this.variant = MissionCardVariant.defaultAi,
    this.subjectTag,
  });

  final String title;

  /// Caller-rendered string of *why* the mission was picked — the
  /// concept-grain rationale shown verbatim to the student.
  final String whyPicked;
  final int expectedMinutes;
  final int expectedQuestions;
  final VoidCallback onStart;

  /// 0–1 progress within today's mission. 1.0 trips the celebration
  /// variant when caller switches the variant.
  final double progress;

  final MissionCardVariant variant;
  final String? subjectTag;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final isCelebration = variant == MissionCardVariant.celebration;
    final tone = isCelebration
        ? AuroraCardTone.auroraCelebration
        : AuroraCardTone.auroraAi;
    final glyph = isCelebration ? '🎉' : '✦';
    final header = isCelebration ? 'Mission complete' : "Today's Mission";

    return AuroraCard(
      tone: tone,
      padding: AuroraCardPadding.lg,
      semanticLabel:
          "$header. $title. $expectedMinutes minutes, $expectedQuestions questions.",
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(glyph,
                  style: typography.h3.copyWith(color: colors.aurora500),),
              SizedBox(width: 6 * density.spaceScale),
              Text(
                header,
                style: typography.overline.copyWith(
                  color: colors.aurora500,
                  letterSpacing: 0.6,
                ),
              ),
              if (subjectTag != null) ...[
                const Spacer(),
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: 8 * density.spaceScale,
                    vertical: 2 * density.spaceScale,
                  ),
                  decoration: BoxDecoration(
                    color: colors.neutral0.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    subjectTag!,
                    style: typography.overline
                        .copyWith(color: colors.neutral800),
                  ),
                ),
              ],
            ],
          ),
          SizedBox(height: 8 * density.spaceScale),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: typography.h3
                          .copyWith(color: colors.neutral900),
                    ),
                    SizedBox(height: 6 * density.spaceScale),
                    Text(
                      whyPicked,
                      style: typography.body.copyWith(
                        color: colors.neutral700,
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: 12 * density.spaceScale),
              AuroraProgressRing(
                value: progress,
                size: 68,
                thickness: 7,
                tone: isCelebration
                    ? AuroraProgressRingTone.mastered
                    : AuroraProgressRingTone.aurora,
                child: Text(
                  '${(progress * 100).round()}%',
                  style: typography.label.copyWith(
                    color: colors.neutral800,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 14 * density.spaceScale),
          Row(
            children: [
              _Stat(
                icon: Icons.schedule,
                label: '${expectedMinutes}m',
                colors: colors,
                typography: typography,
              ),
              SizedBox(width: 12 * density.spaceScale),
              _Stat(
                icon: Icons.help_outline,
                label: '$expectedQuestions Q',
                colors: colors,
                typography: typography,
              ),
              const Spacer(),
              AuroraButton(
                label: isCelebration ? 'Continue' : 'Start',
                variant: isCelebration
                    ? AuroraButtonVariant.secondary
                    : AuroraButtonVariant.aurora,
                size: AuroraButtonSize.md,
                onPressed: onStart,
                iconRight: const Icon(Icons.arrow_forward, size: 16),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.icon,
    required this.label,
    required this.colors,
    required this.typography,
  });

  final IconData icon;
  final String label;
  final AuroraColors colors;
  final AuroraTypography typography;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: colors.neutral600),
        const SizedBox(width: 4),
        Text(label,
            style: typography.bodySm.copyWith(color: colors.neutral700),),
      ],
    );
  }
}
