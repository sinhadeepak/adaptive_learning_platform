// RankCard — radial gauge + delta + cohort percentile.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Used on Profile / Analysis. Renders a half-circle gauge with the
// current percentile (or rank) + a Δ pill against last period.
//
// Source attribution: when `percentileSource == "fallback"` (cohort
// size below the anonymity threshold), the gauge softens its band
// and surfaces the "cohort-not-ready" caption — never silently degrades.

import 'dart:math' as math;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_card.dart';

enum RankCardSource { cohort, fallback }

class RankCard extends StatelessWidget {
  const RankCard({
    super.key,
    required this.percentile,
    required this.delta,
    this.source = RankCardSource.cohort,
    this.label = 'Cohort percentile',
    this.note,
  });

  /// Percentile in `[0,100]`. Higher is better.
  final double percentile;

  /// Δ vs last period, e.g. +3.2, -1.0, 0.0.
  final double delta;

  final RankCardSource source;
  final String label;

  /// Optional bottom-line note, e.g. "Up 3 ranks vs last week".
  final String? note;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final pct = percentile.clamp(0, 100);
    final isFallback = source == RankCardSource.fallback;
    final color = isFallback
        ? colors.neutral400
        : (pct >= 80
            ? colors.success600
            : pct >= 50
                ? colors.proficient600
                : colors.developing600);

    return AuroraCard(
      semanticLabel:
          '$label ${pct.round()}. ${_deltaSpoken(delta)}${isFallback ? ' Estimate based on platform peers, cohort not ready.' : ''}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: typography.overline.copyWith(
                    color: colors.neutral600,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              _DeltaPill(delta: delta, colors: colors, typo: typography),
            ],
          ),
          SizedBox(height: 8 * density.spaceScale),
          AspectRatio(
            aspectRatio: 2.0,
            child: CustomPaint(
              painter: _GaugePainter(
                percent: pct.toDouble(),
                color: color,
                track: colors.neutral200,
                muted: isFallback,
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${pct.round()}',
                      style: typography.display.copyWith(
                        color: colors.neutral900,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    Text(
                      'percentile',
                      style: typography.bodySm
                          .copyWith(color: colors.neutral500),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (note != null || isFallback) ...[
            SizedBox(height: 6 * density.spaceScale),
            Text(
              isFallback
                  ? (note ?? 'Estimate — cohort smaller than 30 students.')
                  : note!,
              style: typography.bodySm.copyWith(
                color: isFallback ? colors.neutral500 : colors.neutral700,
                fontStyle:
                    isFallback ? FontStyle.italic : FontStyle.normal,
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _deltaSpoken(double d) {
    if (d == 0) return 'Unchanged.';
    final up = d > 0;
    return '${up ? 'Up' : 'Down'} ${d.abs().toStringAsFixed(1)} points.';
  }
}

class _DeltaPill extends StatelessWidget {
  const _DeltaPill({required this.delta, required this.colors, required this.typo});

  final double delta;
  final AuroraColors colors;
  final AuroraTypography typo;

  @override
  Widget build(BuildContext context) {
    final flat = delta.abs() < 0.05;
    final up = delta > 0;
    final fg = flat
        ? colors.neutral500
        : (up ? colors.success600 : colors.danger600);
    final bg = flat
        ? colors.neutral100
        : (up ? colors.success50 : colors.danger50);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            flat
                ? Icons.horizontal_rule
                : (up ? Icons.arrow_upward : Icons.arrow_downward),
            size: 12,
            color: fg,
          ),
          const SizedBox(width: 2),
          Text(
            flat ? '0' : delta.abs().toStringAsFixed(1),
            style: typo.overline.copyWith(color: fg, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  const _GaugePainter({
    required this.percent,
    required this.color,
    required this.track,
    required this.muted,
  });

  final double percent;
  final Color color;
  final Color track;
  final bool muted;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = 14.0;
    final rect = Rect.fromLTWH(
      stroke / 2,
      stroke / 2,
      size.width - stroke,
      size.height * 2 - stroke,
    );

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = track;
    canvas.drawArc(rect, math.pi, math.pi, false, base);

    final fill = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = muted ? color.withValues(alpha: 0.45) : color;
    final sweep = (percent / 100.0).clamp(0.0, 1.0) * math.pi;
    canvas.drawArc(rect, math.pi, sweep, false, fill);
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.percent != percent || old.color != color || old.muted != muted;
}
