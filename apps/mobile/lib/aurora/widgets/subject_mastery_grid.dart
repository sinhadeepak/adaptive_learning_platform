// SubjectMasteryGrid — Exam Detail heatmap-card grid.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Groups topics by subject and renders each as a mastery cell. The
// cell color comes from `AuroraColors.masteryForEwa(ewa)` so the
// scale is canonical across rings, bars, and heatmaps.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class SubjectMasteryGroup {
  const SubjectMasteryGroup({
    required this.subject,
    required this.subjectColor,
    required this.topics,
  });

  final String subject;

  /// Use `AuroraColors.subj*` when available; else any color is fine.
  final Color subjectColor;
  final List<MasteryCell> topics;
}

class MasteryCell {
  const MasteryCell({
    required this.title,

    /// EWA in `[0, 1]`. `null` renders an untouched cell.
    required this.ewa,
    this.onTap,
  });

  final String title;
  final double? ewa;
  final VoidCallback? onTap;
}

class SubjectMasteryGrid extends StatelessWidget {
  const SubjectMasteryGrid({
    super.key,
    required this.groups,
    this.columns = 4,
  });

  final List<SubjectMasteryGroup> groups;
  final int columns;

  @override
  Widget build(BuildContext context) {
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final gap = 6.0 * density.spaceScale;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < groups.length; i++) ...[
          _GroupHeader(group: groups[i]),
          SizedBox(height: gap),
          _CellGrid(group: groups[i], columns: columns, gap: gap),
          if (i < groups.length - 1) SizedBox(height: gap * 2.5),
        ],
      ],
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group});
  final SubjectMasteryGroup group;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    final touched =
        group.topics.where((t) => (t.ewa ?? 0) > 0).length;

    return Row(
      children: [
        Container(width: 8, height: 8,
            decoration: BoxDecoration(
                color: group.subjectColor, shape: BoxShape.circle,),),
        const SizedBox(width: 8),
        Text(
          group.subject,
          style: typography.h4.copyWith(color: colors.neutral900),
        ),
        const Spacer(),
        Text(
          '$touched / ${group.topics.length} touched',
          style: typography.overline.copyWith(color: colors.neutral500),
        ),
      ],
    );
  }
}

class _CellGrid extends StatelessWidget {
  const _CellGrid({
    required this.group,
    required this.columns,
    required this.gap,
  });

  final SubjectMasteryGroup group;
  final int columns;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final cells = group.topics;
    final rows = <Widget>[];

    for (var r = 0; r * columns < cells.length; r++) {
      final start = r * columns;
      final end = (start + columns).clamp(0, cells.length);
      rows.add(
        Padding(
          padding: EdgeInsets.only(top: r == 0 ? 0 : gap),
          child: Row(
            children: [
              for (var i = start; i < end; i++) ...[
                if (i > start) SizedBox(width: gap),
                Expanded(child: _Cell(cell: cells[i])),
              ],
              // Pad short rows so cells stay grid-aligned
              for (var i = end - start; i < columns; i++) ...[
                if (i > 0) SizedBox(width: gap),
                const Expanded(child: SizedBox.shrink()),
              ],
            ],
          ),
        ),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.cell});
  final MasteryCell cell;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    final ewa = cell.ewa ?? 0;
    final color = colors.masteryForEwa(ewa);
    final isMastered = ewa >= 0.9;
    final fillBg = isMastered ? null : color.withValues(alpha: 0.18);
    final gradient = isMastered ? colors.masteryMastered : null;
    final textOnFill = isMastered
        ? colors.neutral0
        : (ewa < 0.4 ? colors.neutral800 : colors.neutral900);

    return AspectRatio(
      aspectRatio: 1.1,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: cell.onTap,
          borderRadius:
              BorderRadius.circular(radius.md * density.radiusScale),
          child: Container(
            decoration: BoxDecoration(
              color: fillBg,
              gradient: gradient,
              borderRadius:
                  BorderRadius.circular(radius.md * density.radiusScale),
              border: Border.all(
                color: color.withValues(alpha: 0.45),
                width: 0.8,
              ),
            ),
            padding: EdgeInsets.all(8 * density.spaceScale),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    cell.title,
                    style: typography.bodySm.copyWith(
                      color: textOnFill,
                      fontWeight: FontWeight.w600,
                      height: 1.2,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  cell.ewa == null ? '—' : '${(ewa * 100).round()}%',
                  style: typography.label.copyWith(
                    color: textOnFill,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
