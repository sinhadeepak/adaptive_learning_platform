// Readiness band card + decay arrow + revision ritual screen
// (Phase 6 S56 mobile parity).
//
// Mirrors:
//   apps/web-student/src/components/DecayArrow.tsx
//   apps/web-student/src/components/ReadinessBandCard.tsx
//   apps/web-student/src/pages/RevisionRitual.tsx

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import '../insights/insights_client.dart'
    show DecaySeverity, ReadinessBand, readinessBandLabel;
import 'readiness_client.dart';

// ── DecayArrow ──────────────────────────────────────────────────────

class DecayArrow extends StatelessWidget {
  const DecayArrow({
    super.key,
    required this.severity,
    this.decayDays,
  });

  final DecaySeverity severity;
  final int? decayDays;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final color = switch (decayArrowTone(severity)) {
      DecayTone.danger => colors.danger600,
      DecayTone.warning => colors.developing600,
      DecayTone.success => colors.success600,
      DecayTone.neutral => colors.neutral500,
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(decayArrow(severity),
            style: typography.bodySm.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),),
        if (decayDays != null) ...[
          const SizedBox(width: 2),
          Text('${decayDays!}d',
              style: typography.overline.copyWith(color: color),),
        ],
      ],
    );
  }
}

// ── ReadinessBandCard ───────────────────────────────────────────────

class ReadinessBandCard extends StatefulWidget {
  const ReadinessBandCard({
    super.key,
    required this.client,
    required this.userId,
    this.targetScore,
    this.daysToExam,
  });

  final ReadinessClient client;
  final String userId;
  final double? targetScore;
  final int? daysToExam;

  @override
  State<ReadinessBandCard> createState() => _ReadinessBandCardState();
}

class _ReadinessBandCardState extends State<ReadinessBandCard> {
  ReadinessBandResult? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await widget.client.fetchReadinessBand(
        widget.userId,
        targetScore: widget.targetScore,
        daysToExam: widget.daysToExam,
      );
      if (mounted) setState(() => _data = r);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    if (_error != null) {
      return AuroraBanner(
        title: 'Readiness unavailable',
        body: _error,
        tone: AuroraBannerTone.danger,
      );
    }
    final d = _data;
    if (d == null) return const SizedBox.shrink();
    final pct = (d.readinessScore * 100).round();
    final targetPct = (d.targetScore * 100).round();
    final bandColor = switch (d.band) {
      ReadinessBand.approaching => colors.success500,
      ReadinessBand.onTrack => colors.brand500,
      ReadinessBand.behind => colors.developing500,
      ReadinessBand.atRisk => colors.danger500,
    };
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('READINESS BAND',
                        style: typography.overline.copyWith(
                          color: colors.neutral600,
                          letterSpacing: 0.5,
                        ),),
                    Text(readinessBandLabel(d.band),
                        style: typography.h4
                            .copyWith(color: colors.neutral900),),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 4,),
                decoration: BoxDecoration(
                  color: bandColor.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('$pct%',
                    style: typography.h4.copyWith(
                      color: bandColor,
                      fontWeight: FontWeight.w800,
                    ),),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Target $targetPct% · ${d.daysToExam} days to exam',
              style: typography.bodySm
                  .copyWith(color: colors.neutral600),),
          if (d.actions.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final a in d.actions)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
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
          ],
        ],
      ),
    );
  }
}

// ── RevisionRitualScreen — 4-stage flow ─────────────────────────────

enum _Stage { recall, set, delta, next }
enum _Confidence { low, mid, high }

class RevisionRitualScreen extends StatefulWidget {
  const RevisionRitualScreen({
    super.key,
    required this.conceptId,
    this.conceptName,
  });

  final String conceptId;
  final String? conceptName;

  @override
  State<RevisionRitualScreen> createState() =>
      _RevisionRitualScreenState();
}

class _RevisionRitualScreenState extends State<RevisionRitualScreen> {
  _Stage _stage = _Stage.recall;
  _Confidence? _confidence;

  static const _order = [
    _Stage.recall,
    _Stage.set,
    _Stage.delta,
    _Stage.next,
  ];
  static const _labels = {
    _Stage.recall: '1 · Recall',
    _Stage.set: '2 · Set',
    _Stage.delta: '3 · Delta',
    _Stage.next: '4 · Next due',
  };

  void _advance() {
    final i = _order.indexOf(_stage);
    if (i < _order.length - 1) {
      setState(() => _stage = _order[i + 1]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final name = widget.conceptName ?? 'this concept';
    return AuroraScaffold(
      appBar: const AuroraAppBar(title: 'Revision ritual'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final s in _order)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4,),
                  decoration: BoxDecoration(
                    color: s == _stage
                        ? colors.aurora500.withValues(alpha: 0.18)
                        : colors.neutral100,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: s == _stage
                          ? colors.aurora500
                          : colors.neutral200,
                    ),
                  ),
                  child: Text(_labels[s]!,
                      style: typography.overline.copyWith(
                        color: s == _stage
                            ? colors.aurora500
                            : colors.neutral600,
                      ),),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text(name,
              style: typography.h2
                  .copyWith(color: colors.neutral900),),
          const SizedBox(height: 12),
          if (_stage == _Stage.recall) _recallCard(name),
          if (_stage == _Stage.set) _setCard(name),
          if (_stage == _Stage.delta) _deltaCard(name),
          if (_stage == _Stage.next) _nextCard(name),
        ],
      ),
    );
  }

  Widget _recallCard(String name) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('How confident are you right now?',
              style: typography.h4
                  .copyWith(color: colors.neutral900),),
          const SizedBox(height: 6),
          Text(
            'Tap a level before you see the questions. We compare your gut against the actual delta so calibration stays honest.',
            style: typography.bodySm
                .copyWith(color: colors.neutral600, height: 1.5),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final c in _Confidence.values) ...[
                Expanded(
                  child: _ConfButton(
                    confidence: c,
                    active: _confidence == c,
                    onTap: () => setState(() => _confidence = c),
                  ),
                ),
                if (c != _Confidence.high) const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 14),
          AuroraButton(
            label: 'Start the 5-question set →',
            variant: AuroraButtonVariant.aurora,
            size: AuroraButtonSize.md,
            fullWidth: true,
            onPressed: _confidence == null ? null : _advance,
          ),
        ],
      ),
    );
  }

  Widget _setCard(String name) {
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('5 retrieval questions', style: typography.h4),
          const SizedBox(height: 6),
          Text(
            'Short, no-skip set focused on $name. The session feeds mastery the same way a practice round does.',
            style: typography.bodySm,
          ),
          const SizedBox(height: 14),
          AuroraButton(
            label: 'Simulate complete (demo) →',
            variant: AuroraButtonVariant.primary,
            size: AuroraButtonSize.md,
            fullWidth: true,
            onPressed: _advance,
          ),
        ],
      ),
    );
  }

  Widget _deltaCard(String name) {
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final confLabel = switch (_confidence) {
      _Confidence.low => 'Shaky',
      _Confidence.mid => 'OK',
      _Confidence.high => 'Solid',
      null => '—',
    };
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Mastery delta', style: typography.h4),
          const SizedBox(height: 6),
          Text(
            'Mastery for $name will update on the next batch ingest. Calibration vs. your "$confLabel" recall lands in the weekly narrative.',
            style: typography.bodySm,
          ),
          const SizedBox(height: 14),
          AuroraButton(
            label: 'See next due →',
            variant: AuroraButtonVariant.primary,
            size: AuroraButtonSize.md,
            fullWidth: true,
            onPressed: _advance,
          ),
        ],
      ),
    );
  }

  Widget _nextCard(String name) {
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Locked in', style: typography.h4),
          const SizedBox(height: 6),
          Text(
            'SM-2 will surface $name again when the spacing schedule says retention is starting to slip.',
            style: typography.bodySm,
          ),
        ],
      ),
    );
  }
}

class _ConfButton extends StatelessWidget {
  const _ConfButton({
    required this.confidence,
    required this.active,
    required this.onTap,
  });

  final _Confidence confidence;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final glyph = switch (confidence) {
      _Confidence.low => '◌',
      _Confidence.mid => '◐',
      _Confidence.high => '●',
    };
    final label = switch (confidence) {
      _Confidence.low => 'Shaky',
      _Confidence.mid => 'OK',
      _Confidence.high => 'Solid',
    };
    return Material(
      color: active
          ? colors.aurora500.withValues(alpha: 0.12)
          : colors.neutral0,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            border: Border.all(
              color: active ? colors.aurora500 : colors.neutral200,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(glyph,
                  style: typography.h3
                      .copyWith(color: colors.aurora500),),
              const SizedBox(height: 4),
              Text(label,
                  style: typography.bodySm.copyWith(
                    color: colors.neutral900,
                    fontWeight: FontWeight.w600,
                  ),),
            ],
          ),
        ),
      ),
    );
  }
}
