// StreakChip — daily-streak indicator with popover.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Renders a small flame + count chip suitable for the AppBar. Tapping
// it shows a popover (caller-controlled via `onTap`) with the streak
// history; this widget owns only the chip appearance.
//
// Tone progresses with streak length to reward longer streaks:
//   1–6  → developing-amber
//   7–29 → reward-orange
//   30+  → aurora gradient

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class StreakChip extends StatelessWidget {
  const StreakChip({
    super.key,
    required this.count,
    this.onTap,
    this.compact = false,
  });

  final int count;
  final VoidCallback? onTap;

  /// When true, drops the label text and renders just the flame + count.
  /// Used in tight AppBar trailing slots.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final isGradient = count >= 30;
    final tier = count <= 0
        ? colors.neutral400
        : count < 7
            ? colors.developing600
            : (count < 30 ? colors.reward600 : colors.reward500);

    final bg = isGradient ? null : colors.reward50;
    final gradient = isGradient ? colors.auroraCelebrationSoft : null;

    final content = Padding(
      padding: EdgeInsets.symmetric(
        horizontal: 10 * density.spaceScale,
        vertical: 4 * density.spaceScale,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.local_fire_department, size: 16, color: tier),
          SizedBox(width: 4 * density.spaceScale),
          Text(
            '$count',
            style: typography.label.copyWith(
              color: tier,
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          if (!compact) ...[
            SizedBox(width: 4 * density.spaceScale),
            Text(
              count == 1 ? 'day' : 'days',
              style: typography.bodySm.copyWith(color: tier),
            ),
          ],
        ],
      ),
    );

    return Semantics(
      button: onTap != null,
      label: count <= 0
          ? 'No streak yet'
          : 'Streak $count ${count == 1 ? 'day' : 'days'}',
      child: Material(
        color: bg,
        borderRadius:
            BorderRadius.circular(radius.pill),
        child: InkWell(
          onTap: onTap == null
              ? null
              : () {
                  HapticFeedback.lightImpact();
                  onTap!();
                },
          borderRadius:
              BorderRadius.circular(radius.pill),
          child: Container(
            decoration: BoxDecoration(
              gradient: gradient,
              borderRadius: BorderRadius.circular(radius.pill),
              border: Border.all(
                color: tier.withValues(alpha: 0.30),
              ),
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}
