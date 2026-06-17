// ReadinessTrajectoryChart — Analysis line chart.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Plots readiness score (0–100) over time. The spec mentions `fl_chart`
// but to avoid adding a third-party dep without an ADR, this ships a
// CustomPainter line chart. Mirrors the web `AnalysisTrajectoryChart`
// visual contract: line + filled area + endpoint dot + last-value
// label, target band rendered as horizontal dashed line.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_card.dart';

class TrajectoryPoint {
  const TrajectoryPoint(this.date, this.readiness);
  final DateTime date;
  final double readiness; // 0–100
}

class ReadinessTrajectoryChart extends StatelessWidget {
  const ReadinessTrajectoryChart({
    super.key,
    required this.points,
    this.target,
    this.title = 'Readiness trajectory',
    this.height = 180,
  });

  final List<TrajectoryPoint> points;

  /// Optional target line in `[0,100]`; renders as dashed band.
  final double? target;
  final String title;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    if (points.isEmpty) {
      return AuroraCard(
        child: SizedBox(
          height: height,
          child: Center(
            child: Text(
              'Not enough data yet — take a few more sessions to see your trajectory.',
              style: typography.bodySm
                  .copyWith(color: colors.neutral500),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final last = points.last.readiness;
    final first = points.first.readiness;
    final delta = last - first;
    final deltaColor =
        delta.abs() < 0.5 ? colors.neutral500 : (delta > 0 ? colors.success600 : colors.danger600);

    return AuroraCard(
      semanticLabel:
          '$title. ${points.length} points. Latest ${last.round()}. ${delta >= 0 ? 'Up' : 'Down'} ${delta.abs().toStringAsFixed(1)} since start.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(title,
                    style: typography.h4
                        .copyWith(color: colors.neutral900),),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${last.round()}',
                    style: typography.h3.copyWith(
                      color: colors.neutral900,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    delta == 0
                        ? Icons.horizontal_rule
                        : (delta > 0
                            ? Icons.arrow_upward
                            : Icons.arrow_downward),
                    size: 14,
                    color: deltaColor,
                  ),
                  Text(
                    delta.abs().toStringAsFixed(1),
                    style: typography.bodySm.copyWith(
                      color: deltaColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
          SizedBox(height: 12 * density.spaceScale),
          SizedBox(
            height: height,
            child: LayoutBuilder(
              builder: (_, c) => CustomPaint(
                size: Size(c.maxWidth, c.maxHeight),
                painter: _TrajectoryPainter(
                  points: points,
                  target: target,
                  lineColor: colors.brand600,
                  fill: colors.brand600.withValues(alpha: 0.12),
                  axis: colors.neutral200,
                  target0Color: colors.success500,
                  endpoint: colors.brand700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrajectoryPainter extends CustomPainter {
  const _TrajectoryPainter({
    required this.points,
    required this.target,
    required this.lineColor,
    required this.fill,
    required this.axis,
    required this.target0Color,
    required this.endpoint,
  });

  final List<TrajectoryPoint> points;
  final double? target;
  final Color lineColor;
  final Color fill;
  final Color axis;
  final Color target0Color;
  final Color endpoint;

  @override
  void paint(Canvas canvas, Size size) {
    const yMin = 0.0, yMax = 100.0;
    const padL = 4.0, padR = 4.0, padT = 6.0, padB = 6.0;
    final innerW = size.width - padL - padR;
    final innerH = size.height - padT - padB;

    // Horizontal gridlines at 25, 50, 75
    final grid = Paint()
      ..color = axis
      ..strokeWidth = 0.6;
    for (final g in const [25, 50, 75]) {
      final y = padT + innerH * (1 - g / yMax);
      canvas.drawLine(Offset(padL, y), Offset(size.width - padR, y), grid);
    }

    // Coordinates for each point: x by index, y by value.
    final n = points.length;
    Offset toScreen(int i, double v) {
      final x = padL + (n == 1 ? innerW / 2 : innerW * (i / (n - 1)));
      final y = padT + innerH * (1 - (v.clamp(yMin, yMax) - yMin) / (yMax - yMin));
      return Offset(x, y);
    }

    // Line + filled area
    final path = Path();
    final fillPath = Path()..moveTo(padL, padT + innerH);
    for (var i = 0; i < n; i++) {
      final p = toScreen(i, points[i].readiness);
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
        fillPath.lineTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
        fillPath.lineTo(p.dx, p.dy);
      }
    }
    fillPath.lineTo(size.width - padR, padT + innerH);
    fillPath.close();

    canvas.drawPath(fillPath, Paint()..color = fill);
    canvas.drawPath(
      path,
      Paint()
        ..color = lineColor
        ..strokeWidth = 2.0
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Target band (dashed horizontal)
    if (target != null) {
      final ty = padT + innerH * (1 - (target!.clamp(yMin, yMax)) / yMax);
      final dash = Paint()
        ..color = target0Color
        ..strokeWidth = 1.2;
      const dashLen = 6.0, gap = 4.0;
      double x = padL;
      while (x < size.width - padR) {
        canvas.drawLine(Offset(x, ty),
            Offset((x + dashLen).clamp(padL, size.width - padR), ty), dash,);
        x += dashLen + gap;
      }
    }

    // Endpoint dot
    final last = toScreen(n - 1, points.last.readiness);
    canvas.drawCircle(
      last,
      4.0,
      Paint()..color = endpoint,
    );
    canvas.drawCircle(
      last,
      4.0,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.85)
        ..strokeWidth = 1.4
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _TrajectoryPainter old) =>
      old.points != points || old.target != target;
}
