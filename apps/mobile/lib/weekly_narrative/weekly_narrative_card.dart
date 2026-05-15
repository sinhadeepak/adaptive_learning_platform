// WeeklyNarrativeCard — Phase 6 S53 mobile parity.
//
// Mirrors apps/web-student/src/components/WeeklyNarrativeCard.tsx.
// Renders the 5-section narrative (improved / slipping / hidden_pattern
// / forecast / week_ahead) inside an Aurora card.
//
// Each section with a `data_link` shows a "Why am I seeing this?"
// label routing to a Phase-5 surface. When data_link is null the
// link is omitted — never fake the source.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import 'weekly_narrative_client.dart';

class WeeklyNarrativeCard extends StatelessWidget {
  const WeeklyNarrativeCard({super.key, required this.record});

  final NarrativeRecord record;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final n = record.narrative;
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('✦',
                  style: typography.h3.copyWith(color: colors.aurora500),),
              const SizedBox(width: 6),
              Text('Weekly narrative',
                  style: typography.h4
                      .copyWith(color: colors.neutral900),),
              const SizedBox(width: 10),
              Text(formatWeekRange(record.weekStart),
                  style: typography.bodySm
                      .copyWith(color: colors.neutral600),),
              const Spacer(),
              AuroraTag(
                label: record.source == 'ai' ? 'AI' : 'Heuristic',
                tone: record.source == 'ai'
                    ? AuroraTagTone.brand
                    : AuroraTagTone.warning,
                variant: AuroraTagVariant.soft,
              ),
            ],
          ),
          if (record.isDelta && record.deltaTrigger != null) ...[
            const SizedBox(height: 4),
            Text('Δ Mid-week update — ${record.deltaTrigger}',
                style: typography.overline
                    .copyWith(color: colors.developing600),),
          ],
          const SizedBox(height: 12),
          _SectionRow(
              eyebrow: 'Improved',
              tone: _SectionTone.success,
              section: n.improved,),
          _SectionRow(
              eyebrow: 'Slipping',
              tone: _SectionTone.warning,
              section: n.slipping,),
          _SectionRow(
              eyebrow: 'Hidden pattern',
              tone: _SectionTone.info,
              section: n.hiddenPattern,),
          _SectionRow(
              eyebrow: 'Forecast',
              tone: _SectionTone.info,
              section: n.forecast,),
          _WeekAheadRow(section: n.weekAhead),
        ],
      ),
    );
  }
}

enum _SectionTone { success, warning, info, aurora }

class _SectionRow extends StatelessWidget {
  const _SectionRow({
    required this.eyebrow,
    required this.tone,
    required this.section,
  });

  final String eyebrow;
  final _SectionTone tone;
  final NarrativeSection section;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final accent = switch (tone) {
      _SectionTone.success => colors.success500,
      _SectionTone.warning => colors.developing500,
      _SectionTone.info => colors.brand500,
      _SectionTone.aurora => colors.aurora500,
    };
    final link = parseDataLink(section.dataLink);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: colors.neutral0,
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: accent, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(eyebrow.toUpperCase(),
              style: typography.overline.copyWith(
                color: colors.neutral600,
                letterSpacing: 0.5,
              ),),
          const SizedBox(height: 4),
          Text(section.text,
              style: typography.body
                  .copyWith(color: colors.neutral900, height: 1.45),),
          if (link != null) ...[
            const SizedBox(height: 4),
            Text('${link.label} →',
                style: typography.overline.copyWith(
                  color: colors.aurora500,
                  fontWeight: FontWeight.w600,
                ),),
          ],
        ],
      ),
    );
  }
}

class _WeekAheadRow extends StatelessWidget {
  const _WeekAheadRow({required this.section});
  final WeekAheadSection section;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: colors.neutral0,
        borderRadius: BorderRadius.circular(8),
        border: Border(
            left: BorderSide(color: colors.aurora500, width: 3),),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('WEEK AHEAD',
              style: typography.overline.copyWith(
                color: colors.neutral600,
                letterSpacing: 0.5,
              ),),
          const SizedBox(height: 4),
          Text(section.text,
              style: typography.body
                  .copyWith(color: colors.neutral900, height: 1.45),),
          if (section.actions.isNotEmpty) ...[
            const SizedBox(height: 6),
            ...section.actions.map(
              (a) => Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('▸ ',
                        style: typography.bodySm
                            .copyWith(color: colors.aurora500),),
                    Expanded(
                      child: Text(a,
                          style: typography.bodySm
                              .copyWith(color: colors.neutral700),),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class WeeklyNarrativeEmpty extends StatelessWidget {
  const WeeklyNarrativeEmpty({
    super.key,
    this.onGenerate,
    this.generating = false,
    this.error,
  });

  final VoidCallback? onGenerate;
  final bool generating;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('✦',
                  style: typography.h3.copyWith(color: colors.aurora500),),
              const SizedBox(width: 6),
              Text('Weekly narrative',
                  style: typography.h4
                      .copyWith(color: colors.neutral900),),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            error ??
                "We haven't written your weekly narrative yet. It's a 90-second interpretation of your numbers — what improved, what's slipping, and one thing to focus on next week.",
            style: typography.body
                .copyWith(color: colors.neutral700, height: 1.5),
          ),
          if (onGenerate != null && error == null) ...[
            const SizedBox(height: 12),
            AuroraButton(
              label: generating ? 'Generating…' : 'Generate narrative',
              variant: AuroraButtonVariant.aurora,
              size: AuroraButtonSize.md,
              loading: generating,
              onPressed: generating ? null : onGenerate,
            ),
          ],
        ],
      ),
    );
  }
}
