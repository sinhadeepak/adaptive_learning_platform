// TopicCard — catalog / topic-recommendation tile.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Compact card showing a topic's name, subject color flag, mastery
// ring, and (optionally) a small status tag (locked, new, due, etc.).
// Used in catalog browse, topic recommendations, and revision lists.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_card.dart';
import 'aurora_progress_ring.dart';
import 'aurora_tag.dart';

class TopicCard extends StatelessWidget {
  const TopicCard({
    super.key,
    required this.title,
    required this.subject,
    this.subjectColor,
    this.ewa,
    this.status,
    this.statusTone,
    this.onTap,
  });

  final String title;
  final String subject;
  final Color? subjectColor;

  /// EWA mastery in `[0,1]`; null renders an empty progress track.
  final double? ewa;

  final String? status;
  final AuroraTagTone? statusTone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final flag = subjectColor ?? colors.brand500;
    final masteryTone = ewa == null
        ? AuroraProgressRingTone.neutral
        : (ewa! < 0.4
            ? AuroraProgressRingTone.weak
            : ewa! < 0.7
                ? AuroraProgressRingTone.developing
                : (ewa! < 0.9
                    ? AuroraProgressRingTone.strong
                    : AuroraProgressRingTone.mastered));

    return AuroraCard(
      onTap: onTap,
      semanticLabel:
          '$subject. $title.${ewa != null ? ' Mastery ${(ewa! * 100).round()}%.' : ''}',
      child: Row(
        children: [
          Container(
            width: 4,
            height: 44,
            decoration: BoxDecoration(
              color: flag,
              borderRadius:
                  BorderRadius.circular(radius.sm * density.radiusScale),
            ),
          ),
          SizedBox(width: 12 * density.spaceScale),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  subject,
                  style: typography.overline.copyWith(
                    color: flag,
                    letterSpacing: 0.4,
                  ),
                ),
                SizedBox(height: 2 * density.spaceScale),
                Text(
                  title,
                  style: typography.h4
                      .copyWith(color: colors.neutral900),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (status != null) ...[
                  SizedBox(height: 6 * density.spaceScale),
                  AuroraTag(
                    label: status!,
                    tone: statusTone ?? AuroraTagTone.neutral,
                  ),
                ],
              ],
            ),
          ),
          SizedBox(width: 12 * density.spaceScale),
          AuroraProgressRing(
            value: ewa ?? 0,
            size: 44,
            thickness: 4,
            tone: masteryTone,
            child: Text(
              ewa == null ? '—' : '${(ewa! * 100).round()}',
              style: typography.label.copyWith(
                color: colors.neutral800,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
