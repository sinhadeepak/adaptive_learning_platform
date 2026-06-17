// AuroraPlanRow — single row of today's study plan (spec §8.4 DailyPlanCard).
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Renamed from DailyPlanCard to avoid collision with the legacy
// IGS-connected `lib/widgets/daily_plan_card.dart`. That widget owns the
// whole plan + WS stream; AuroraPlanRow renders ONE row of a plan as a
// pure presentational card. Used on Home below the MissionCard and
// inside the constrained plan editor:
//   [icon] Topic title          ⏱ 20m
//          Subject · Practice   [DONE / NOW / NEXT]
//
// Status:
//   - upcoming → neutral tag
//   - now      → brand-filled solid tag
//   - done     → success soft tag (with checkmark icon)
//   - skipped  → developing-amber soft tag

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_card.dart';
import 'aurora_tag.dart';

enum DailyPlanStatus { upcoming, now, done, skipped }

class AuroraPlanRow extends StatelessWidget {
  const AuroraPlanRow({
    super.key,
    required this.title,
    required this.subject,
    required this.kind,
    required this.minutes,
    this.status = DailyPlanStatus.upcoming,
    this.onTap,
  });

  final String title;
  final String subject;

  /// Short label: "Practice" / "Revision" / "Mock" / "Theory".
  final String kind;

  final int minutes;
  final DailyPlanStatus status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final palette = _statusPalette(status, colors);

    return AuroraCard(
      onTap: onTap,
      semanticLabel:
          '$kind · $subject · $title · $minutes minutes · ${_statusLabel(status)}',
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.bg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(_iconFor(kind), color: palette.fg, size: 18),
          ),
          SizedBox(width: 12 * density.spaceScale),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: typography.body.copyWith(
                    color: colors.neutral900,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                SizedBox(height: 2 * density.spaceScale),
                Row(
                  children: [
                    Text(
                      subject,
                      style: typography.bodySm
                          .copyWith(color: colors.neutral600),
                    ),
                    Text('  ·  ',
                        style: typography.bodySm
                            .copyWith(color: colors.neutral400),),
                    Text(
                      kind,
                      style: typography.bodySm
                          .copyWith(color: colors.neutral600),
                    ),
                  ],
                ),
              ],
            ),
          ),
          SizedBox(width: 8 * density.spaceScale),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.schedule, size: 14, color: colors.neutral500),
                  const SizedBox(width: 2),
                  Text(
                    '${minutes}m',
                    style: typography.bodySm
                        .copyWith(color: colors.neutral600),
                  ),
                ],
              ),
              SizedBox(height: 6 * density.spaceScale),
              AuroraTag(
                label: _statusLabel(status),
                tone: palette.tone,
                variant: status == DailyPlanStatus.now
                    ? AuroraTagVariant.solid
                    : AuroraTagVariant.soft,
                iconLeft: status == DailyPlanStatus.done
                    ? const Icon(Icons.check, size: 12)
                    : null,
              ),
            ],
          ),
        ],
      ),
    );
  }

  static IconData _iconFor(String kind) {
    final k = kind.toLowerCase();
    if (k.contains('mock')) return Icons.timer;
    if (k.contains('revis')) return Icons.replay;
    if (k.contains('theory') || k.contains('learn')) return Icons.menu_book;
    return Icons.bolt; // practice / default
  }

  static String _statusLabel(DailyPlanStatus s) => switch (s) {
        DailyPlanStatus.upcoming => 'Next',
        DailyPlanStatus.now => 'Now',
        DailyPlanStatus.done => 'Done',
        DailyPlanStatus.skipped => 'Skipped',
      };

  static _StatusPalette _statusPalette(
    DailyPlanStatus s,
    AuroraColors c,
  ) {
    switch (s) {
      case DailyPlanStatus.upcoming:
        return _StatusPalette(
          bg: c.neutral100,
          fg: c.neutral600,
          tone: AuroraTagTone.neutral,
        );
      case DailyPlanStatus.now:
        return _StatusPalette(
          bg: c.brand100,
          fg: c.brand700,
          tone: AuroraTagTone.brand,
        );
      case DailyPlanStatus.done:
        return _StatusPalette(
          bg: c.success50,
          fg: c.success600,
          tone: AuroraTagTone.success,
        );
      case DailyPlanStatus.skipped:
        return _StatusPalette(
          bg: c.developing50,
          fg: c.developing600,
          tone: AuroraTagTone.warning,
        );
    }
  }
}

class _StatusPalette {
  const _StatusPalette({
    required this.bg,
    required this.fg,
    required this.tone,
  });
  final Color bg;
  final Color fg;
  final AuroraTagTone tone;
}
