// AIInsightCard — Aurora-gradient AI surface.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Renders a soft Aurora-AI gradient card (cyan → violet) with the ✦
// glyph + title + body. Three variants:
//   - insight   — what we learned ("You're 14% faster on stoichiometry")
//   - tip       — what to try ("Switch to mixed-set after 5 questions")
//   - moment    — a celebration ("First mastered topic!")
//
// Composes AuroraCard with `tone = auroraAi`. Provides the standard
// "✦ AI insight" pre-header that signals the source to the user.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_card.dart';

enum AIInsightKind { insight, tip, moment }

class AIInsightCard extends StatelessWidget {
  const AIInsightCard({
    super.key,
    required this.title,
    this.body,
    this.kind = AIInsightKind.insight,
    this.action,
    this.onTap,
  });

  final String title;
  final String? body;
  final AIInsightKind kind;

  /// Optional CTA rendered along the bottom (typically an AuroraButton
  /// tertiary).
  final Widget? action;

  /// Optional whole-card tap target. Use for "tap to expand" style.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final tone = kind == AIInsightKind.moment
        ? AuroraCardTone.auroraCelebration
        : AuroraCardTone.auroraAi;

    final glyph = kind == AIInsightKind.moment ? '🎉' : '✦';
    final preheader = switch (kind) {
      AIInsightKind.insight => 'AI insight',
      AIInsightKind.tip => 'AI tip',
      AIInsightKind.moment => 'Moment',
    };

    return AuroraCard(
      tone: tone,
      onTap: onTap,
      semanticLabel: '$preheader. $title',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(glyph,
                  style: typography.label.copyWith(
                    color: colors.aurora500,
                    fontSize: 14,
                  ),),
              SizedBox(width: 4 * density.spaceScale),
              Text(
                preheader,
                style: typography.overline.copyWith(
                  color: colors.aurora500,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          SizedBox(height: 6 * density.spaceScale),
          Text(
            title,
            style: typography.h4.copyWith(color: colors.neutral900),
          ),
          if (body != null) ...[
            SizedBox(height: 6 * density.spaceScale),
            Text(
              body!,
              style: typography.body
                  .copyWith(color: colors.neutral700, height: 1.45),
            ),
          ],
          if (action != null) ...[
            SizedBox(height: 12 * density.spaceScale),
            Align(alignment: Alignment.centerLeft, child: action!),
          ],
        ],
      ),
    );
  }
}
